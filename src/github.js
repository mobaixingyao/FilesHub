// GitHub API 客户端模块
// 封装 GitHub REST API 的文件上传、下载、删除、列举等操作。
// 支持小文件走 Contents API，大文件(>1MB)走 Git Data API。

import { arrayBufferToBase64, encodePath } from './utils.js';

const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const USER_AGENT = 'FilesHub-Worker';
const DEFAULT_ACCEPT = 'application/vnd.github+json';
const RAW_ACCEPT = 'application/vnd.github.raw+json';
// Contents API 单次请求限制为 1MB，超过则使用 Git Data API
const CONTENTS_API_SIZE_LIMIT = 1024 * 1024; // 1MB

/**
 * GitHub API 错误。
 */
export class GitHubApiError extends Error {
  /**
   * @param {string} message 错误信息
   * @param {number} status HTTP 状态码（网络错误时为 0）
   * @param {string} detail 原始错误详情
   */
  constructor(message, status, detail) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * 构建发往 GitHub API 的 Request 对象。
 * 公共仓库且 token 为空时不带 Authorization 头。
 *
 * @param {Object} repoConfig 仓库配置 { owner, repo, branch, token, is_public }
 * @param {string} method HTTP 方法
 * @param {string} path 以 / 开头的 API 路径（可含 query string）
 * @param {Object} [options] 额外选项
 * @param {Object|string} [options.body] 请求体，对象会被 JSON 序列化
 * @param {string} [options.accept] 覆盖默认 Accept 头
 * @param {Object} [options.extraHeaders] 追加的请求头
 * @param {boolean} [options.rawBody] 为 true 时 body 作为原始字符串发送
 * @returns {Request}
 */
function buildRequest(repoConfig, method, path, options = {}) {
  const url = `${GITHUB_API_BASE}${path}`;

  const headers = {
    Accept: options.accept || DEFAULT_ACCEPT,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': USER_AGENT,
  };

  // token 非空时携带 Authorization（公共仓库 + 空 token 时不带）
  if (repoConfig.token) {
    headers.Authorization = `Bearer ${repoConfig.token}`;
  }

  const fetchOptions = { method, headers };

  if (options.extraHeaders) {
    Object.assign(headers, options.extraHeaders);
  }

  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body === 'string' || options.rawBody) {
      fetchOptions.body = options.body;
    } else {
      fetchOptions.body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }
  }

  return new Request(url, fetchOptions);
}

/**
 * 执行 GitHub API 请求。
 * 请求失败时打印日志并抛出 GitHubApiError。
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function ghFetch(request) {
  let response;
  try {
    response = await fetch(request);
  } catch (err) {
    console.error('GitHub API 请求失败:', request.method, request.url, err);
    throw new GitHubApiError(
      `GitHub API 请求失败: ${err.message}`,
      0,
      err.message
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errData = await response.json();
      detail = errData.message || JSON.stringify(errData);
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = '';
      }
    }
    console.error(
      `GitHub API 错误 [${response.status}] ${request.method} ${request.url}: ${detail}`
    );
    throw new GitHubApiError(
      `GitHub API 错误 (${response.status}): ${detail}`,
      response.status,
      detail
    );
  }

  return response;
}

/**
 * 将文件内容归一化为 { size, base64 }。
 * 支持 ArrayBuffer、TypedArray、string。
 *
 * @param {ArrayBuffer|Uint8Array|string} fileContent
 * @returns {{size:number, base64:string}}
 */
function normalizeFileContent(fileContent) {
  if (fileContent instanceof ArrayBuffer) {
    return {
      size: fileContent.byteLength,
      base64: arrayBufferToBase64(fileContent),
    };
  }
  if (ArrayBuffer.isView(fileContent)) {
    const view = fileContent;
    const buffer = view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    );
    return {
      size: view.byteLength,
      base64: arrayBufferToBase64(buffer),
    };
  }
  if (typeof fileContent === 'string') {
    const encoded = new TextEncoder().encode(fileContent);
    return {
      size: encoded.byteLength,
      base64: arrayBufferToBase64(encoded.buffer),
    };
  }
  throw new GitHubApiError(
    '不支持的文件内容类型',
    0,
    `unsupported content type: ${typeof fileContent}`
  );
}

/**
 * 通过 Contents API 上传文件（≤1MB）。
 *
 * @param {Object} repoConfig
 * @param {string} base64Content base64 编码的文件内容
 * @param {string} filePath 仓库内文件路径
 * @param {string} commitMessage 提交信息
 * @param {number} size 文件字节数
 * @returns {Promise<{sha:string, path:string, size:number}>}
 */
async function uploadViaContentsApi(
  repoConfig,
  base64Content,
  filePath,
  commitMessage,
  size
) {
  const encodedPath = encodePath(filePath);
  const apiPath = `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}`;

  const body = {
    message: commitMessage,
    content: base64Content,
    branch: repoConfig.branch,
  };

  const request = buildRequest(repoConfig, 'PUT', apiPath, { body });
  const response = await ghFetch(request);
  const data = await response.json();

  const content = data.content || data;
  return {
    sha: content.sha,
    path: content.path || filePath,
    size: content.size !== undefined ? content.size : size,
  };
}

/**
 * 通过 Git Data API 上传文件（>1MB）。
 * 流程：创建 blob → 获取当前分支 ref → 获取基础 commit/tree →
 *      创建新 tree → 创建新 commit → 更新分支 ref。
 *
 * @param {Object} repoConfig
 * @param {string} base64Content base64 编码的文件内容
 * @param {string} filePath 仓库内文件路径
 * @param {string} commitMessage 提交信息
 * @param {number} size 文件字节数
 * @returns {Promise<{sha:string, path:string, size:number}>}
 */
async function uploadViaGitDataApi(
  repoConfig,
  base64Content,
  filePath,
  commitMessage,
  size
) {
  const { owner, repo, branch } = repoConfig;

  // 1. 创建 blob
  const blobReq = buildRequest(
    repoConfig,
    'POST',
    `/repos/${owner}/${repo}/git/blobs`,
    {
      body: { content: base64Content, encoding: 'base64' },
    }
  );
  const blobRes = await ghFetch(blobReq);
  const blobData = await blobRes.json();
  const blobSha = blobData.sha;

  // 2. 获取当前分支 ref（指向最新 commit）
  const refReq = buildRequest(
    repoConfig,
    'GET',
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`
  );
  const refRes = await ghFetch(refReq);
  const refData = await refRes.json();
  const latestCommitSha = refData.object.sha;

  // 3. 获取基础 commit 的 tree sha
  const commitReq = buildRequest(
    repoConfig,
    'GET',
    `/repos/${owner}/${repo}/git/commits/${latestCommitSha}`
  );
  const commitRes = await ghFetch(commitReq);
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  // 4. 创建新 tree（基于 base tree，加入/覆盖目标文件）
  const treeReq = buildRequest(
    repoConfig,
    'POST',
    `/repos/${owner}/${repo}/git/trees`,
    {
      body: {
        base_tree: baseTreeSha,
        tree: [
          {
            path: filePath,
            mode: '100644',
            type: 'blob',
            sha: blobSha,
          },
        ],
      },
    }
  );
  const treeRes = await ghFetch(treeReq);
  const treeData = await treeRes.json();
  const newTreeSha = treeData.sha;

  // 5. 创建新 commit
  const newCommitReq = buildRequest(
    repoConfig,
    'POST',
    `/repos/${owner}/${repo}/git/commits`,
    {
      body: {
        message: commitMessage,
        tree: newTreeSha,
        parents: [latestCommitSha],
      },
    }
  );
  const newCommitRes = await ghFetch(newCommitReq);
  const newCommitData = await newCommitRes.json();
  const newCommitSha = newCommitData.sha;

  // 6. 更新分支 ref 指向新 commit
  const patchRefReq = buildRequest(
    repoConfig,
    'PATCH',
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      body: { sha: newCommitSha },
    }
  );
  await ghFetch(patchRefReq);

  return {
    sha: blobSha,
    path: filePath,
    size,
  };
}

/**
 * 上传文件到仓库。
 * ≤1MB 使用 Contents API，>1MB 使用 Git Data API。
 *
 * @param {Object} repoConfig { owner, repo, branch, token, is_public }
 * @param {ArrayBuffer|Uint8Array|string} fileContent 文件内容
 * @param {string} filePath 仓库内文件路径
 * @param {string} commitMessage 提交信息
 * @returns {Promise<{sha:string, path:string, size:number}>}
 */
export async function uploadFile(repoConfig, fileContent, filePath, commitMessage) {
  const { size, base64 } = normalizeFileContent(fileContent);

  if (size <= CONTENTS_API_SIZE_LIMIT) {
    return uploadViaContentsApi(repoConfig, base64, filePath, commitMessage, size);
  }
  return uploadViaGitDataApi(repoConfig, base64, filePath, commitMessage, size);
}

/**
 * 下载文件，返回原始 Response。
 *
 * @param {Object} repoConfig { owner, repo, branch, token, is_public }
 * @param {string} filePath 仓库内文件路径
 * @returns {Promise<Response>}
 */
export async function downloadFile(repoConfig, filePath) {
  const encodedPath = encodePath(filePath);
  const apiPath = `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}?ref=${encodeURIComponent(
    repoConfig.branch
  )}`;

  const request = buildRequest(repoConfig, 'GET', apiPath, { accept: RAW_ACCEPT });
  return ghFetch(request);
}

/**
 * 删除文件。先 GET 获取文件 sha，再 DELETE。
 *
 * @param {Object} repoConfig { owner, repo, branch, token, is_public }
 * @param {string} filePath 仓库内文件路径
 * @param {string} commitMessage 提交信息
 * @returns {Promise<{success:boolean, path:string, commitSha:string}>}
 */
export async function deleteFile(repoConfig, filePath, commitMessage) {
  const encodedPath = encodePath(filePath);

  // 1. 获取文件 sha
  const getPath = `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}?ref=${encodeURIComponent(
    repoConfig.branch
  )}`;
  const getReq = buildRequest(repoConfig, 'GET', getPath);
  const getRes = await ghFetch(getReq);
  const getData = await getRes.json();
  const fileSha = getData.sha;

  // 2. 删除文件
  const deletePath = `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}`;
  const deleteReq = buildRequest(repoConfig, 'DELETE', deletePath, {
    body: {
      message: commitMessage,
      sha: fileSha,
      branch: repoConfig.branch,
    },
  });
  const deleteRes = await ghFetch(deleteReq);
  const deleteData = await deleteRes.json();

  const commitSha = deleteData.commit ? deleteData.commit.sha : deleteData.commitSha;

  return {
    success: true,
    path: filePath,
    commitSha,
  };
}

/**
 * 列出指定目录下的文件/目录条目。
 *
 * @param {Object} repoConfig { owner, repo, branch, token, is_public }
 * @param {string} dirPath 仓库内目录路径
 * @returns {Promise<Array>} 条目数组
 */
export async function listFiles(repoConfig, dirPath) {
  const encodedPath = encodePath(dirPath);
  const apiPath = `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodedPath}?ref=${encodeURIComponent(
    repoConfig.branch
  )}`;

  const request = buildRequest(repoConfig, 'GET', apiPath);
  const response = await ghFetch(request);
  return response.json();
}

/**
 * 递归列出目录下所有文件（受 maxDepth 限制）。
 *
 * @param {Object} repoConfig { owner, repo, branch, token, is_public }
 * @param {string} dirPath 仓库内目录路径
 * @param {number} [maxDepth=5] 最大递归深度
 * @returns {Promise<Array>} 所有文件条目数组
 */
export async function listAllFiles(repoConfig, dirPath, maxDepth = 5) {
  const result = [];

  async function walk(currentPath, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await listFiles(repoConfig, currentPath);
    } catch (err) {
      // 空目录或不存在时 GitHub 可能返回非数组，跳过
      console.error('listAllFiles 遍历失败:', currentPath, err);
      return;
    }

    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
      if (entry.type === 'file') {
        result.push(entry);
      } else if (entry.type === 'dir') {
        await walk(entry.path, depth + 1);
      }
    }
  }

  await walk(dirPath, 0);
  return result;
}

/**
 * 获取仓库大小（KB）。
 *
 * @param {Object} repoConfig { owner, repo, token, is_public }
 * @returns {Promise<number>} 仓库大小，单位 KB
 */
export async function getRepoSize(repoConfig) {
  const apiPath = `/repos/${repoConfig.owner}/${repoConfig.repo}`;
  const request = buildRequest(repoConfig, 'GET', apiPath);
  const response = await ghFetch(request);
  const data = await response.json();
  return data.size; // 单位 KB
}

/**
 * 检查仓库访问权限。
 *
 * @param {Object} repoConfig { owner, repo, token, is_public }
 * @returns {Promise<{accessible:boolean, error?:string, status?:number}>}
 */
export async function checkRepoAccess(repoConfig) {
  try {
    const apiPath = `/repos/${repoConfig.owner}/${repoConfig.repo}`;
    const request = buildRequest(repoConfig, 'GET', apiPath);
    await ghFetch(request);
    return { accessible: true };
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return {
        accessible: false,
        error: err.detail || err.message,
        status: err.status,
      };
    }
    return { accessible: false, error: err.message };
  }
}
