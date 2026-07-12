/**
 * @file repo-manager.js
 * @module repo-manager
 * @description FilesHub 仓库管理模块。
 * 负责仓库的容量监控、健康检查、自动选库与仓库 CRUD 的 HTTP 处理。
 *
 * KV 中存储的 repoConfig.token 为 AES-GCM 加密后的密文，
 * 本模块在调用 github.js 前会使用 env.AUTH_TOKEN 解密为明文 token。
 *
 * RepoConfig 数据结构:
 *   { id, owner, repo, branch, token(加密), is_public,
 *     capacity_limit_mb, priority, enabled, created_at }
 */

import {
  jsonResponse,
  errorResponse,
  encryptToken,
  decryptToken,
} from './utils.js';
import {
  getAllRepos,
  getRepo,
  createRepo,
  updateRepo,
  deleteRepo,
} from './kv.js';
import { getRepoSize, checkRepoAccess, GitHubApiError } from './github.js';

/**
 * 将 KV 中的仓库配置（加密 token）解密，构建可直接传给 github.js 的配置。
 * @param {object} env - Workers 环境变量
 * @param {object} repoConfig - KV 中的仓库配置（token 为加密密文）
 * @returns {Promise<{owner:string,repo:string,branch:string,token:string,is_public:boolean}>}
 */
async function toGithubConfig(env, repoConfig) {
  let plainToken = '';
  if (repoConfig.token) {
    plainToken = await decryptToken(repoConfig.token, env.AUTH_TOKEN);
  }
  return {
    owner: repoConfig.owner,
    repo: repoConfig.repo,
    branch: repoConfig.branch || 'main',
    token: plainToken,
    is_public: !!repoConfig.is_public,
  };
}

/**
 * 隐藏仓库配置中的 token，用于返回给前端。
 * @param {object} repoConfig - 仓库配置
 * @returns {object} token 置空后的副本
 */
function hideToken(repoConfig) {
  return { ...repoConfig, token: repoConfig.token ? '******' : '' };
}

/**
 * 获取仓库容量状态。
 * 调用 GitHub API 获取仓库大小(KB)，计算使用率。
 * @param {object} env - Workers 环境变量
 * @param {object} repoConfig - KV 中的仓库配置（token 加密）
 * @returns {Promise<{size_kb:number,size_mb:number,capacity_limit_mb:number,usage_percent:number,is_available:boolean,error:string}>}
 */
export async function getRepoStatus(env, repoConfig) {
  const capacityLimitMb = repoConfig.capacity_limit_mb || 1024;
  const result = {
    size_kb: 0,
    size_mb: 0,
    capacity_limit_mb: capacityLimitMb,
    usage_percent: 0,
    is_available: false,
    error: '',
  };
  try {
    const ghConfig = await toGithubConfig(env, repoConfig);
    const sizeKb = await getRepoSize(ghConfig);
    const sizeMb = sizeKb / 1024;
    const usagePercent = capacityLimitMb > 0 ? (sizeMb / capacityLimitMb) * 100 : 0;
    result.size_kb = sizeKb;
    result.size_mb = parseFloat(sizeMb.toFixed(2));
    result.usage_percent = parseFloat(usagePercent.toFixed(2));
    result.is_available = usagePercent < 100;
  } catch (err) {
    console.error('获取仓库状态失败:', err);
    result.error = err instanceof GitHubApiError ? err.detail || err.message : err.message;
    result.is_available = false;
  }
  return result;
}

/**
 * 检查仓库健康（是否可访问）。
 * @param {object} env - Workers 环境变量
 * @param {object} repoConfig - KV 中的仓库配置（token 加密）
 * @returns {Promise<{healthy:boolean,error:string}>}
 */
export async function checkRepoHealth(env, repoConfig) {
  try {
    const ghConfig = await toGithubConfig(env, repoConfig);
    const access = await checkRepoAccess(ghConfig);
    if (access.accessible) {
      return { healthy: true, error: '' };
    }
    return { healthy: false, error: access.error || '仓库不可访问' };
  } catch (err) {
    console.error('仓库健康检查异常:', err);
    return { healthy: false, error: err.message };
  }
}

/**
 * 为上传自动选择仓库。
 * 获取用户所有启用的仓库，按 priority 升序排列，
 * 逐个检查容量，返回第一个 is_available === true 的仓库。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {number} [fileSize=0] - 待上传文件大小（字节）
 * @returns {Promise<object>} 可用仓库的 KV RepoConfig
 * @throws {Error} 所有仓库均不可用时抛出
 */
export async function selectRepoForUpload(env, username, fileSize = 0) {
  const allRepos = await getAllRepos(env, username);
  // 仅保留启用的仓库
  const enabledRepos = allRepos.filter((r) => r.enabled !== false);
  // 按 priority 升序（数字越小优先级越高），未设置 priority 视为最大
  enabledRepos.sort((a, b) => {
    const pa = typeof a.priority === 'number' ? a.priority : Number.MAX_SAFE_INTEGER;
    const pb = typeof b.priority === 'number' ? b.priority : Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });

  if (enabledRepos.length === 0) {
    throw new Error('没有可用的仓库，请先添加并启用仓库');
  }

  const errors = [];
  for (const repo of enabledRepos) {
    const status = await getRepoStatus(env, repo);
    if (status.is_available) {
      return repo;
    }
    errors.push(`${repo.repo}: ${status.error || '容量已满'}`);
  }
  throw new Error(`所有仓库均不可用: ${errors.join('; ')}`);
}

/**
 * 处理仓库列表/创建请求（GET / POST /api/repos）。
 * - GET: 返回用户所有仓库列表（token 隐藏）
 * - POST: 创建新仓库（token 加密后存储）
 * @param {Request} request - 请求对象
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @returns {Promise<Response>}
 */
export async function handleReposRequest(request, env, username) {
  try {
    if (request.method === 'GET') {
      const repos = await getAllRepos(env, username);
      return jsonResponse({
        success: true,
        repos: repos.map(hideToken),
      });
    }

    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return errorResponse('请求体格式错误，需要 JSON', 400);
      }

      const { owner, repo, branch, token, is_public, capacity_limit_mb, priority, enabled } = body || {};
      if (!owner || !repo) {
        return errorResponse('owner 和 repo 不能为空', 400);
      }

      // 加密 token（公共仓库可为空）
      let encryptedToken = '';
      if (token) {
        if (!env.AUTH_TOKEN) {
          return errorResponse('系统未配置 AUTH_TOKEN，无法加密仓库 token', 500);
        }
        encryptedToken = await encryptToken(token, env.AUTH_TOKEN);
      }

      const repoConfig = {
        owner,
        repo,
        branch: branch || 'main',
        token: encryptedToken,
        is_public: !!is_public,
        capacity_limit_mb: typeof capacity_limit_mb === 'number' ? capacity_limit_mb : 1024,
        priority: typeof priority === 'number' ? priority : 1,
        enabled: enabled !== false,
      };

      const id = await createRepo(env, username, repoConfig);
      return jsonResponse({ success: true, id, repo: hideToken({ ...repoConfig, id }) }, 201);
    }

    return errorResponse('不支持的请求方法', 405);
  } catch (err) {
    console.error('处理仓库请求异常:', err);
    return errorResponse('处理仓库请求失败', 500, { detail: err.message });
  }
}

/**
 * 处理仓库容量状态请求（GET /api/repos/{id}/status）。
 * @param {Request} request - 请求对象
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {string} repoId - 仓库 ID
 * @returns {Promise<Response>}
 */
export async function handleRepoStatusRequest(request, env, username, repoId) {
  try {
    const repo = await getRepo(env, username, repoId);
    if (!repo) {
      return errorResponse('仓库不存在', 404);
    }
    const status = await getRepoStatus(env, repo);
    return jsonResponse({
      success: true,
      repo_id: repoId,
      owner: repo.owner,
      repo: repo.repo,
      branch: repo.branch,
      ...status,
    });
  } catch (err) {
    console.error('获取仓库状态异常:', err);
    return errorResponse('获取仓库状态失败', 500, { detail: err.message });
  }
}

/**
 * 处理仓库配置更新请求（PUT /api/repos/{id}）。
 * 若请求体包含 token 字段则重新加密，否则保留原加密 token。
 * @param {Request} request - 请求对象
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {string} repoId - 仓库 ID
 * @returns {Promise<Response>}
 */
export async function handleRepoUpdateRequest(request, env, username, repoId) {
  try {
    const existing = await getRepo(env, username, repoId);
    if (!existing) {
      return errorResponse('仓库不存在', 404);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse('请求体格式错误，需要 JSON', 400);
    }

    const updates = { ...body };
    // 不允许通过更新修改 id
    delete updates.id;
    delete updates.created_at;

    // 处理 token：若提供新 token 则加密，否则保留原值
    if (updates.token !== undefined) {
      if (updates.token) {
        if (!env.AUTH_TOKEN) {
          return errorResponse('系统未配置 AUTH_TOKEN，无法加密仓库 token', 500);
        }
        updates.token = await encryptToken(updates.token, env.AUTH_TOKEN);
      } else {
        updates.token = '';
      }
    }

    await updateRepo(env, username, repoId, updates);
    const updated = await getRepo(env, username, repoId);
    return jsonResponse({ success: true, repo: hideToken(updated) });
  } catch (err) {
    console.error('更新仓库配置异常:', err);
    return errorResponse('更新仓库配置失败', 500, { detail: err.message });
  }
}

/**
 * 处理仓库删除请求（DELETE /api/repos/{id}）。
 * @param {Request} request - 请求对象
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {string} repoId - 仓库 ID
 * @returns {Promise<Response>}
 */
export async function handleRepoDeleteRequest(request, env, username, repoId) {
  try {
    const existing = await getRepo(env, username, repoId);
    if (!existing) {
      return errorResponse('仓库不存在', 404);
    }
    await deleteRepo(env, username, repoId);
    return jsonResponse({ success: true, id: repoId });
  } catch (err) {
    console.error('删除仓库异常:', err);
    return errorResponse('删除仓库失败', 500, { detail: err.message });
  }
}
