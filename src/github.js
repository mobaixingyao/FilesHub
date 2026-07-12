/**
<<<<<<< HEAD
 * @file github.js
 * @module github
 * @description FilesHub GitHub API 客户端模块。
 * 封装 GitHub REST API 的文件上传/下载/删除/列表与仓库元信息查询。
 *
 * 所有方法接收 repoConfig 对象（而非 env），其中 token 为明文（由调用方解密后传入）：
 *   { owner, repo, branch, token, is_public }
 *
 * 请求规范:
 *   - 基础 URL: https://api.github.com
 *   - Headers: Authorization: Bearer {token}（token 非空时）,
 *              Accept: application/vnd.github+json,
 *              X-GitHub-Api-Version: 2022-11-28,
 *              User-Agent: FilesHub-Worker
 *   - 公共仓库且 token 为空: 不带 Authorization 头
 */

import { arrayBufferToBase64, encodePath } from './utils.js';

/** GitHub API 基础地址 */
const API_BASE = 'https://api.github.com';
/** Contents API 单文件大小阈值（1MB），超过则改用 Git Data API */
const CONTENTS_API_LIMIT = 1024 * 1024;

/**
 * GitHub API 自定义错误类。
 */
export class GitHubApiError extends Error {
  /**
   * @param {string} message - 错误信息
   * @param {number} [status=0] - HTTP 状态码
   * @param {string} [detail=''] - 额外详情
   */
  constructor(message, status = 0, detail = '') {
=======
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
>>>>>>> 956176d14c8744fc5056b0c98a323ee4d5e39d36
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.detail = detail;
  }
}

<<<<<<< HEAD
/**
 * 构建 GitHub API 请求头。
 * 公共仓库且 token 为空时不带 Authorization 头。
 * @param {object} repoConfig - 仓库配置
 * @param {object} [extra={}] - 额外请求头
 * @returns {Record<string,string>} 请求头对象
 */
function buildHeaders(repoConfig, extra = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'FilesHub-Worker',
    ...extra,
  };
  if (repoConfig.token) {
    headers['Authorization'] = `Bearer ${repoConfig.token}`;
  }
  return headers;
}

/**
 * 构建 API URL。
 * @param {string} path - 路径（不含 host）
 * @returns {string} 完整 URL
 */
function apiUrl(path) {
  return `${API_BASE}${path}`;
}

/**
 * 解析 GitHub API 响应，失败时抛出 GitHubApiError。
 * @param {Response} res - fetch 响应
 * @param {string} operation - 操作描述（用于错误信息）
 * @returns {Promise<any>} 解析后的 JSON（若响应无内容则返回 null）
 */
async function parseResponse(res, operation) {
  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody.message || JSON.stringify(errBody);
    } catch (e) {
      try {
        detail = await res.text();
      } catch (e2) {
        detail = '';
      }
    }
    throw new GitHubApiError(
      `${operation}失败: ${res.status} ${res.statusText}`,
      res.status,
      detail,
    );
  }
  // 部分 204 响应无内容
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

/**
 * ArrayBuffer 转 Uint8Array。
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Uint8Array}
 */
function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

/**
 * 上传文件到 GitHub 仓库。
 * ≤1MB 使用 Contents API，>1MB 使用 Git Data API（blob→tree→commit→ref）。
 * @param {object} repoConfig - 仓库配置 { owner, repo, branch, token, is_public }
 * @param {ArrayBuffer|Uint8Array} fileContent - 文件内容
 * @param {string} filePath - 仓库内文件路径
 * @param {string} [commitMessage] - 提交信息
 * @returns {Promise<{sha: string, path: string, size: number}>}
 */
export async function uploadFile(repoConfig, fileContent, filePath, commitMessage) {
  const content = toUint8Array(fileContent);
  const size = content.byteLength;
  const message = commitMessage || `Upload ${filePath}`;
  const encodedPath = encodePath(filePath);

  if (size <= CONTENTS_API_LIMIT) {
    return await uploadViaContentsApi(repoConfig, content, encodedPath, message);
  }
  return await uploadViaGitDataApi(repoConfig, content, filePath, message);
}

/**
 * 通过 Contents API 上传文件（≤1MB）。
 * @param {object} repoConfig - 仓库配置
 * @param {Uint8Array} content - 文件内容
 * @param {string} encodedPath - URL 编码后的路径
 * @param {string} message - 提交信息
 * @returns {Promise<{sha: string, path: string, size: number}>}
 */
async function uploadViaContentsApi(repoConfig, content, encodedPath, message) {
  const base64Content = arrayBufferToBase64(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength));
  const url = apiUrl(`/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}`);
  const res = await fetch(url, {
    method: 'PUT',
    headers: buildHeaders(repoConfig, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: base64Content,
      branch: repoConfig.branch,
    }),
  });
  const data = await parseResponse(res, '上传文件(Contents API)');
  return {
    sha: data.content.sha,
    path: data.content.path,
    size: data.content.size,
  };
}

/**
 * 通过 Git Data API 上传大文件（>1MB）。
 * 流程: 创建 blob → 获取当前 commit/tree → 创建新 tree → 创建 commit → 更新 ref。
 * @param {object} repoConfig - 仓库配置
 * @param {Uint8Array} content - 文件内容
 * @param {string} filePath - 文件路径
 * @param {string} message - 提交信息
 * @returns {Promise<{sha: string, path: string, size: number}>}
 */
async function uploadViaGitDataApi(repoConfig, content, filePath, message) {
  const owner = repoConfig.owner;
  const repo = repoConfig.repo;
  const branch = repoConfig.branch;

  // 1. 创建 blob
  const blobRes = await fetch(apiUrl(`/repos/${owner}/${repo}/git/blobs`), {
    method: 'POST',
    headers: buildHeaders(repoConfig, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      content: arrayBufferToBase64(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)),
      encoding: 'base64',
    }),
  });
  const blob = await parseResponse(blobRes, '创建 Git blob');
  const blobSha = blob.sha;

  // 2. 获取分支最新 commit sha
  const refRes = await fetch(
    apiUrl(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`),
    { headers: buildHeaders(repoConfig) },
  );
  const ref = await parseResponse(refRes, '获取分支 ref');
  const latestCommitSha = ref.object.sha;

  // 3. 获取该 commit 的 tree sha
  const commitRes = await fetch(
    apiUrl(`/repos/${owner}/${repo}/git/commits/${latestCommitSha}`),
    { headers: buildHeaders(repoConfig) },
  );
  const commitInfo = await parseResponse(commitRes, '获取 commit 信息');
  const baseTreeSha = commitInfo.tree.sha;

  // 4. 创建新 tree（基于现有 tree，新增文件条目）
  const treeRes = await fetch(apiUrl(`/repos/${owner}/${repo}/git/trees`), {
    method: 'POST',
    headers: buildHeaders(repoConfig, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        {
          path: filePath,
          mode: '100644',
          type: 'blob',
          sha: blobSha,
        },
      ],
    }),
  });
  const tree = await parseResponse(treeRes, '创建 Git tree');
  const newTreeSha = tree.sha;

  // 5. 创建 commit
  const newCommitRes = await fetch(apiUrl(`/repos/${owner}/${repo}/git/commits`), {
    method: 'POST',
    headers: buildHeaders(repoConfig, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      tree: newTreeSha,
      parents: [latestCommitSha],
    }),
  });
  const newCommit = await parseResponse(newCommitRes, '创建 Git commit');
  const newCommitSha = newCommit.sha;

  // 6. 更新 ref 指向新 commit
  const updateRefRes = await fetch(
    apiUrl(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`),
    {
      method: 'PATCH',
      headers: buildHeaders(repoConfig, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sha: newCommitSha }),
    },
  );
  await parseResponse(updateRefRes, '更新分支 ref');

  return {
    sha: blobSha,
    path: filePath,
    size: content.byteLength,
  };
}

/**
 * 下载文件原始内容。
 * 使用 Accept: application/vnd.github.raw+json 获取原始内容。
 * 公共仓库且 token 为空时不带 Authorization 头。
 * @param {object} repoConfig - 仓库配置
 * @param {string} filePath - 文件路径
 * @returns {Promise<Response>} 原始内容响应
 */
export async function downloadFile(repoConfig, filePath) {
  const encodedPath = encodePath(filePath);
  const url = apiUrl(
    `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}?ref=${encodeURIComponent(repoConfig.branch)}`,
  );
  return await fetch(url, {
    headers: buildHeaders(repoConfig, {
      Accept: 'application/vnd.github.raw+json',
    }),
  });
}

/**
 * 删除文件。先 GET 获取 sha，再 DELETE。
 * @param {object} repoConfig - 仓库配置
 * @param {string} filePath - 文件路径
 * @param {string} [commitMessage] - 提交信息
 * @returns {Promise<{success: boolean, path: string, commitSha: string}>}
 */
export async function deleteFile(repoConfig, filePath, commitMessage) {
  const encodedPath = encodePath(filePath);
  const message = commitMessage || `Delete ${filePath}`;

  // 1. 获取文件 sha
  const metaRes = await fetch(
    apiUrl(
      `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}?ref=${encodeURIComponent(repoConfig.branch)}`,
    ),
    { headers: buildHeaders(repoConfig) },
  );
  const meta = await parseResponse(metaRes, '获取文件元信息(删除前)');
  const fileSha = meta.sha;

  // 2. 删除文件
  const delRes = await fetch(
    apiUrl(`/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}`),
    {
      method: 'DELETE',
      headers: buildHeaders(repoConfig, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        message,
        sha: fileSha,
        branch: repoConfig.branch,
      }),
    },
  );
  const delData = await parseResponse(delRes, '删除文件');
  return {
    success: true,
    path: filePath,
    commitSha: delData.commit ? delData.commit.sha : '',
  };
}

/**
 * 列出指定目录下的文件与子目录。
 * @param {object} repoConfig - 仓库配置
 * @param {string} [dirPath=''] - 目录路径
 * @returns {Promise<Array>} GitHub Contents API 返回的数组
 */
export async function listFiles(repoConfig, dirPath = '') {
  const encodedPath = dirPath ? encodePath(dirPath) : '';
  const url = apiUrl(
    `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}?ref=${encodeURIComponent(repoConfig.branch)}`,
  );
  const res = await fetch(url, { headers: buildHeaders(repoConfig) });
  const data = await parseResponse(res, '列出目录文件');
  return Array.isArray(data) ? data : [];
}

/**
 * 递归列出目录下所有文件。
 * @param {object} repoConfig - 仓库配置
 * @param {string} [dirPath=''] - 起始目录
 * @param {number} [maxDepth=10] - 最大递归深度
 * @param {number} [_depth=0] - 当前深度（内部使用）
 * @returns {Promise<Array>} 扁平化文件数组
 */
export async function listAllFiles(repoConfig, dirPath = '', maxDepth = 10, _depth = 0) {
  if (_depth >= maxDepth) return [];
  const entries = await listFiles(repoConfig, dirPath);
  const files = [];
  for (const entry of entries) {
    if (entry.type === 'file') {
      files.push(entry);
    } else if (entry.type === 'dir') {
      const subFiles = await listAllFiles(repoConfig, entry.path, maxDepth, _depth + 1);
      files.push(...subFiles);
    }
  }
  return files;
}

/**
 * 获取单个文件元信息。
 * @param {object} repoConfig - 仓库配置
 * @param {string} filePath - 文件路径
 * @returns {Promise<object>} 文件元信息
 */
export async function getFileInfo(repoConfig, filePath) {
  const encodedPath = encodePath(filePath);
  const url = apiUrl(
    `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}?ref=${encodeURIComponent(repoConfig.branch)}`,
  );
  const res = await fetch(url, { headers: buildHeaders(repoConfig) });
  return await parseResponse(res, '获取文件信息');
}

/**
 * 获取仓库大小（KB）。
 * 调用 GET /repos/{owner}/{repo}，返回 size 字段（单位 KB）。
 * @param {object} repoConfig - 仓库配置
 * @returns {Promise<number>} 仓库大小（KB）
 */
export async function getRepoSize(repoConfig) {
  const url = apiUrl(`/repos/${repoConfig.owner}/${repoConfig.repo}`);
  const res = await fetch(url, { headers: buildHeaders(repoConfig) });
  const data = await parseResponse(res, '获取仓库大小');
  return typeof data.size === 'number' ? data.size : 0;
}

/**
 * 检查仓库是否可访问。
 * @param {object} repoConfig - 仓库配置
 * @returns {Promise<{accessible: boolean, error?: string}>}
 */
export async function checkRepoAccess(repoConfig) {
  try {
    const url = apiUrl(`/repos/${repoConfig.owner}/${repoConfig.repo}`);
    const res = await fetch(url, { headers: buildHeaders(repoConfig) });
    if (res.ok) {
      return { accessible: true };
    }
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody.message || '';
    } catch (e) {
      detail = res.statusText;
    }
    return { accessible: false, error: `${res.status}: ${detail}` };
  } catch (err) {
    console.error('仓库访问检查异常:', err);
    return { accessible: false, error: err.message };
  }
}
=======
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
>>>>>>> 956176d14c8744fc5056b0c98a323ee4d5e39d36
