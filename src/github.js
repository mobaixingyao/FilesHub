/**
 * GitHub API 客户端
 * 支持 Contents API（≤1MB）和 Git Data API（>1MB）两种上传方式
 * 支持下载、删除、列表、文件信息查询
 */

import { arrayBufferToBase64, encodePath, isSafePath } from './utils.js';

const GITHUB_API = 'https://api.github.com';
const CONTENTS_API_SIZE_LIMIT = 1024 * 1024; // 1MB — Contents API 限制
const GIT_BLOB_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB — Git Blob API 限制

/**
 * 构建GitHub API请求
 */
function buildRequest(env, method, path, body = null, extraHeaders = {}) {
  const url = `${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}${path}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'FilesHub-Worker',
    ...extraHeaders,
  };
  const options = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  return new Request(url, options);
}

/**
 * 执行 GitHub API 请求并返回解析后的 JSON
 * 包含详细的错误日志
 */
async function ghFetch(env, method, path, body = null, extraHeaders = {}) {
  const request = buildRequest(env, method, path, body, extraHeaders);
  const response = await fetch(request);

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errorBody = await response.json();
      errorDetail = JSON.stringify(errorBody);
    } catch {
      errorDetail = await response.text().catch(() => 'N/A');
    }
    console.error(`[GitHub API Error] ${method} ${path}`, {
      status: response.status,
      statusText: response.statusText,
      body: errorDetail,
    });
    const message = errorDetail.includes('"message"')
      ? JSON.parse(errorDetail).message
      : `GitHub API ${response.status}: ${response.statusText}`;
    throw new GitHubApiError(message, response.status, errorDetail);
  }

  return response;
}

/**
 * 自定义 GitHub API 错误类
 */
class GitHubApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.detail = detail;
  }
}

// ============================================================
// 上传相关
// ============================================================

/**
 * 通过 Contents API 上传文件（适用于 ≤1MB 的文件）
 * PUT /repos/{owner}/{repo}/contents/{path}
 */
async function uploadViaContentsApi(env, fileContent, filePath, commitMessage) {
  const base64Content = typeof fileContent === 'string'
    ? fileContent
    : arrayBufferToBase64(fileContent);

  const response = await ghFetch(
    env,
    'PUT',
    `/contents/${encodePath(filePath)}`,
    {
      message: commitMessage,
      content: base64Content,
      branch: env.GITHUB_BRANCH,
    },
  );

  const data = await response.json();
  return {
    sha: data.content?.sha || data.commit?.sha,
    path: data.content?.path || filePath,
    size: data.content?.size,
    url: data.content?.download_url,
    commitSha: data.commit?.sha,
  };
}

/**
 * 通过 Git Data API 上传文件（适用于 >1MB 的文件，最大 100MB）
 * 流程：创建 Blob → 获取 Ref → 获取 Commit → 创建 Tree → 创建 Commit → 更新 Ref
 */
async function uploadViaGitDataApi(env, fileContent, filePath, commitMessage) {
  const base64Content = typeof fileContent === 'string'
    ? fileContent
    : arrayBufferToBase64(fileContent);

  // 1. 创建 Blob
  const blobResp = await ghFetch(env, 'POST', '/git/blobs', {
    content: base64Content,
    encoding: 'base64',
  });
  const blob = await blobResp.json();

  // 2. 获取当前分支引用（得到 commit SHA）
  const refResp = await ghFetch(
    env,
    'GET',
    `/git/refs/heads/${env.GITHUB_BRANCH}`,
  );
  const ref = await refResp.json();
  const commitSha = ref.object.sha;

  // 3. 获取 commit 中的 tree SHA
  const commitResp = await ghFetch(env, 'GET', `/git/commits/${commitSha}`);
  const commitData = await commitResp.json();
  const treeSha = commitData.tree.sha;

  // 4. 创建新的 Tree（包含新文件）
  const newTreeResp = await ghFetch(env, 'POST', '/git/trees', {
    base_tree: treeSha,
    tree: [
      {
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      },
    ],
  });
  const newTree = await newTreeResp.json();

  // 5. 创建新的 Commit
  const newCommitResp = await ghFetch(env, 'POST', '/git/commits', {
    message: commitMessage,
    tree: newTree.sha,
    parents: [commitSha],
  });
  const newCommit = await newCommitResp.json();

  // 6. 更新分支引用
  await ghFetch(env, 'PATCH', `/git/refs/heads/${env.GITHUB_BRANCH}`, {
    sha: newCommit.sha,
  });

  return {
    sha: blob.sha,
    path: filePath,
    size: blob.size,
    commitSha: newCommit.sha,
  };
}

/**
 * 上传文件到 GitHub 仓库
 * 自动根据文件大小选择上传方式
 * @param {object} env 环境变量
 * @param {ArrayBuffer|string} fileContent 文件内容（ArrayBuffer 或 base64 字符串）
 * @param {string} filePath 存储路径
 * @param {string} [commitMessage] 提交信息
 * @returns {Promise<object>} 上传结果 { sha, path, size, url?, commitSha }
 */
export async function uploadFile(env, fileContent, filePath, commitMessage) {
  if (!isSafePath(filePath)) {
    throw new Error(`不安全的文件路径: ${filePath}`);
  }

  // 计算文件大小
  const size = typeof fileContent === 'string'
    ? Math.floor(fileContent.length * 3 / 4) // base64 → 原始大小估算
    : fileContent.byteLength;

  const message = commitMessage || `Upload: ${filePath.split('/').pop()}`;

  if (size > GIT_BLOB_SIZE_LIMIT) {
    throw new Error(`文件大小 ${size} 超过 GitHub 限制（100MB）`);
  }

  if (size <= CONTENTS_API_SIZE_LIMIT) {
    console.log(`[Upload] 使用 Contents API 上传: ${filePath} (${size} bytes)`);
    return uploadViaContentsApi(env, fileContent, filePath, message);
  }

  console.log(`[Upload] 使用 Git Data API 上传: ${filePath} (${size} bytes)`);
  return uploadViaGitDataApi(env, fileContent, filePath, message);
}

// ============================================================
// 下载相关
// ============================================================

/**
 * 下载文件的原始内容
 * 使用 Contents API 的 raw 媒体类型直接返回二进制内容
 * @param {object} env 环境变量
 * @param {string} filePath 文件路径
 * @returns {Promise<Response>} 原始文件内容响应
 */
export async function downloadFile(env, filePath) {
  if (!isSafePath(filePath)) {
    throw new Error(`不安全的文件路径: ${filePath}`);
  }

  const url = `${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodePath(filePath)}?ref=${env.GITHUB_BRANCH}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'FilesHub-Worker',
    },
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      errorDetail = await response.json();
      errorDetail = JSON.stringify(errorDetail);
    } catch {
      errorDetail = await response.text().catch(() => 'N/A');
    }
    console.error(`[Download Error] ${filePath}`, {
      status: response.status,
      detail: errorDetail,
    });
    throw new GitHubApiError(
      `下载失败: ${response.status} ${response.statusText}`,
      response.status,
      errorDetail,
    );
  }

  return response;
}

// ============================================================
// 删除相关
// ============================================================

/**
 * 删除仓库中的文件
 * DELETE /repos/{owner}/{repo}/contents/{path}
 * @param {object} env 环境变量
 * @param {string} filePath 文件路径
 * @param {string} [commitMessage] 提交信息
 * @returns {Promise<object>} 删除结果
 */
export async function deleteFile(env, filePath, commitMessage) {
  if (!isSafePath(filePath)) {
    throw new Error(`不安全的文件路径: ${filePath}`);
  }

  // 1. 先获取文件 SHA（删除需要 SHA）
  const infoResp = await ghFetch(
    env,
    'GET',
    `/contents/${encodePath(filePath)}?ref=${env.GITHUB_BRANCH}`,
  );
  const fileInfo = await infoResp.json();
  const sha = fileInfo.sha;

  // 2. 执行删除
  const message = commitMessage || `Delete: ${filePath.split('/').pop()}`;
  const deleteResp = await ghFetch(
    env,
    'DELETE',
    `/contents/${encodePath(filePath)}`,
    {
      message,
      sha,
      branch: env.GITHUB_BRANCH,
    },
  );

  const result = await deleteResp.json();
  return {
    success: true,
    path: filePath,
    commitSha: result.commit?.sha,
  };
}

// ============================================================
// 列表相关
// ============================================================

/**
 * 列出目录中的文件和子目录
 * GET /repos/{owner}/{repo}/contents/{path}
 * @param {object} env 环境变量
 * @param {string} [dirPath=''] 目录路径，空字符串表示根目录
 * @returns {Promise<Array>} 文件列表
 */
export async function listFiles(env, dirPath = '') {
  const path = dirPath ? `/${encodePath(dirPath)}` : '';
  const query = `?ref=${env.GITHUB_BRANCH}`;
  const response = await ghFetch(env, 'GET', `/contents${path}${query}`);
  const data = await response.json();

  // GitHub Contents API 对目录返回数组，对文件返回对象
  if (!Array.isArray(data)) {
    return [data];
  }

  return data.map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type, // 'file' | 'dir'
    size: item.size,
    sha: item.sha,
    url: item.download_url || null,
  }));
}

/**
 * 递归列出所有文件（扁平化）
 * 注意：对于文件很多的仓库，这会消耗较多 API 调用
 * @param {object} env 环境变量
 * @param {string} [dirPath=''] 起始目录
 * @param {number} [maxDepth=5] 最大递归深度
 * @returns {Promise<Array>} 扁平化的文件列表
 */
export async function listAllFiles(env, dirPath = '', maxDepth = 5) {
  const allFiles = [];

  async function recurse(currentPath, depth) {
    if (depth > maxDepth) return;
    const items = await listFiles(env, currentPath);
    for (const item of items) {
      if (item.type === 'dir') {
        await recurse(item.path, depth + 1);
      } else {
        allFiles.push(item);
      }
    }
  }

  await recurse(dirPath, 0);
  return allFiles;
}

// ============================================================
// 文件信息
// ============================================================

/**
 * 获取单个文件的元信息
 * @param {object} env 环境变量
 * @param {string} filePath 文件路径
 * @returns {Promise<object>} 文件信息
 */
export async function getFileInfo(env, filePath) {
  if (!isSafePath(filePath)) {
    throw new Error(`不安全的文件路径: ${filePath}`);
  }

  const response = await ghFetch(
    env,
    'GET',
    `/contents/${encodePath(filePath)}?ref=${env.GITHUB_BRANCH}`,
  );
  const data = await response.json();

  return {
    name: data.name,
    path: data.path,
    size: data.size,
    type: data.type,
    sha: data.sha,
    encoding: data.encoding,
    download_url: data.download_url,
    html_url: data.html_url,
    git_url: data.git_url,
  };
}

// ============================================================
// 仓库信息
// ============================================================

/**
 * 获取仓库基本信息（用于健康检查）
 * @param {object} env 环境变量
 * @returns {Promise<object>} 仓库信息
 */
export async function getRepoInfo(env) {
  const response = await ghFetch(env, 'GET', '');
  const data = await response.json();
  return {
    name: data.full_name,
    private: data.private,
    default_branch: data.default_branch,
    size: data.size,
    size_formatted: `${(data.size / 1024).toFixed(2)} MB`,
    updated_at: data.updated_at,
  };
}

export { GitHubApiError };
