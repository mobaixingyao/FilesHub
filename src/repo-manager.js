import { jsonResponse, errorResponse, encryptToken, decryptToken } from './utils.js';
import { getAllRepos, getRepo, createRepo, updateRepo, deleteRepo } from './kv.js';
import { getRepoSize, checkRepoAccess, GitHubApiError } from './github.js';

/**
 * 辅助函数：将 KV 中的仓库配置转换为 GitHub API 配置（解密 token）
 * @param {Object} env - Worker 环境变量
 * @param {Object} repoConfig - KV 中的仓库配置（含加密 token）
 * @returns {{owner:string,repo:string,branch:string,token:string,is_public:boolean}}
 */
function toGithubConfig(env, repoConfig) {
  const token = decryptToken(repoConfig.token, env.AUTH_TOKEN);
  return {
    owner: repoConfig.owner,
    repo: repoConfig.repo,
    branch: repoConfig.branch,
    token,
    is_public: repoConfig.is_public
  };
}

/**
 * 为上传选择一个可用仓库
 * 获取所有启用的仓库，按 priority 升序，逐个检查状态，返回第一个可用的
 * @param {Object} env - Worker 环境变量
 * @param {string} username - 用户名
 * @param {number} fileSize - 文件大小（字节，预留参数）
 * @returns {Object|null} - 可用的仓库配置（KV 原始配置，含加密 token），全部不可用返回 null
 */
export async function selectRepoForUpload(env, username, fileSize = 0) {
  const repos = await getAllRepos(env);
  // 过滤启用的仓库并按 priority 升序排列
  const enabledRepos = repos
    .filter(r => r.enabled)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  for (const repo of enabledRepos) {
    const status = await getRepoStatus(env, repo);
    if (status.is_available) {
      return repo;
    }
  }
  return null;
}

/**
 * 获取仓库状态
 * @param {Object} env - Worker 环境变量
 * @param {Object} repoConfig - 仓库配置
 * @returns {{size_kb:number,size_mb:number,capacity_limit_mb:number,usage_percent:number,is_available:boolean,error:string|null}}
 */
export async function getRepoStatus(env, repoConfig) {
  const capacityLimitMb = repoConfig.capacity_limit_mb || 1024;
  try {
    const githubConfig = toGithubConfig(env, repoConfig);
    const sizeKb = await getRepoSize(env, githubConfig);
    const sizeMb = sizeKb / 1024;
    const usagePercent = (sizeMb / capacityLimitMb) * 100;
    const isAvailable = usagePercent < 100;
    return {
      size_kb: sizeKb,
      size_mb: sizeMb,
      capacity_limit_mb: capacityLimitMb,
      usage_percent: usagePercent,
      is_available: isAvailable,
      error: null
    };
  } catch (err) {
    return {
      size_kb: 0,
      size_mb: 0,
      capacity_limit_mb: capacityLimitMb,
      usage_percent: 0,
      is_available: false,
      error: err instanceof GitHubApiError ? err.message : String(err)
    };
  }
}

/**
 * 检查仓库健康状态
 * @param {Object} env - Worker 环境变量
 * @param {Object} repoConfig - 仓库配置
 * @returns {Object} - checkRepoAccess 的返回结果
 */
export async function checkRepoHealth(env, repoConfig) {
  const githubConfig = toGithubConfig(env, repoConfig);
  return await checkRepoAccess(env, githubConfig);
}

/**
 * 处理仓库列表/创建请求
 * GET  → 获取所有仓库列表（token 字段返回空字符串以隐藏）
 * POST → 创建新仓库
 * @param {Request} request - 请求对象
 * @param {Object} env - Worker 环境变量
 * @param {string} username - 当前用户名
 * @returns {Response}
 */
export async function handleReposRequest(request, env, username) {
  const method = request.method;

  if (method === 'GET') {
    const repos = await getAllRepos(env);
    // 隐藏 token 字段
    const safeRepos = repos.map(r => ({ ...r, token: '' }));
    return jsonResponse({ success: true, repos: safeRepos });
  }

  if (method === 'POST') {
    const body = await request.json();
    const { owner, repo, branch, token, is_public, capacity_limit_mb, priority } = body;

    const repoConfig = {
      owner,
      repo,
      branch,
      is_public,
      capacity_limit_mb,
      priority,
      enabled: true,
      created_at: new Date().toISOString()
    };

    if (token) {
      repoConfig.token = encryptToken(token, env.AUTH_TOKEN);
    } else {
      repoConfig.token = '';
    }

    await createRepo(env, username, repoConfig);
    return jsonResponse({ success: true });
  }

  return errorResponse('方法不允许', 405);
}

/**
 * 处理仓库状态查询请求
 * @param {Request} request - 请求对象
 * @param {Object} env - Worker 环境变量
 * @param {string} username - 当前用户名
 * @param {string} repoId - 仓库 ID
 * @returns {Response}
 */
export async function handleRepoStatusRequest(request, env, username, repoId) {
  const repo = await getRepo(env, repoId);
  if (!repo) {
    return errorResponse('仓库不存在', 404);
  }
  const status = await getRepoStatus(env, repo);
  return jsonResponse({ success: true, status });
}

/**
 * 处理仓库更新请求
 * PUT → 解析 body，如果提供新 token 则加密，否则保留原值
 * @param {Request} request - 请求对象
 * @param {Object} env - Worker 环境变量
 * @param {string} username - 当前用户名
 * @param {string} repoId - 仓库 ID
 * @returns {Response}
 */
export async function handleRepoUpdateRequest(request, env, username, repoId) {
  const existing = await getRepo(env, repoId);
  if (!existing) {
    return errorResponse('仓库不存在', 404);
  }

  const body = await request.json();
  const repoConfig = { ...existing };

  const { owner, repo, branch, token, is_public, capacity_limit_mb, priority, enabled } = body;

  if (owner !== undefined) repoConfig.owner = owner;
  if (repo !== undefined) repoConfig.repo = repo;
  if (branch !== undefined) repoConfig.branch = branch;
  if (is_public !== undefined) repoConfig.is_public = is_public;
  if (capacity_limit_mb !== undefined) repoConfig.capacity_limit_mb = capacity_limit_mb;
  if (priority !== undefined) repoConfig.priority = priority;
  if (enabled !== undefined) repoConfig.enabled = enabled;

  // 如果提供了新 token 则加密，否则保留原值（已从 existing 继承）
  if (token) {
    repoConfig.token = encryptToken(token, env.AUTH_TOKEN);
  }

  await updateRepo(env, repoId, repoConfig);
  return jsonResponse({ success: true });
}

/**
 * 处理仓库删除请求
 * @param {Request} request - 请求对象
 * @param {Object} env - Worker 环境变量
 * @param {string} username - 当前用户名
 * @param {string} repoId - 仓库 ID
 * @returns {Response}
 */
export async function handleRepoDeleteRequest(request, env, username, repoId) {
  await deleteRepo(env, repoId);
  return jsonResponse({ success: true });
}
