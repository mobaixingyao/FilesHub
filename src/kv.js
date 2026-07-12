/**
 * @file kv.js
 * @module kv
 * @description FilesHub KV 存储层模块。
 * 封装 Cloudflare KV 的所有读写操作，统一管理数据模型。
 *
 * KV Key 结构:
 *   system:config          → { initialized, site_title }
 *   user:list              → ["admin", "user2", ...]
 *   user:{username}        → { username, password_hash, role, created_at }
 *   repos:{username}       → ["repo_xxx", ...]
 *   repo:{username}:{id}   → RepoConfig
 *   files:{username}       → FileEntry[]
 *   session:{token}        → { username, role, created_at } (TTL 86400s)
 *
 * 所有 KV 操作通过 env.FILESHUB_KV.get(key, 'json') 与 env.FILESHUB_KV.put(key, ...) 完成。
 */

import { generateId, generateSessionToken } from './utils.js';

/** 会话 TTL（秒），24 小时 */
const SESSION_TTL = 86400;

/* ------------------------------------------------------------------ */
/* 系统配置                                                            */
/* ------------------------------------------------------------------ */

/**
 * 读取系统配置。不存在时返回默认值。
 * @param {object} env - Workers 环境变量
 * @returns {Promise<{initialized: boolean, site_title: string}>}
 */
export async function getSystemConfig(env) {
  const config = await env.FILESHUB_KV.get('system:config', 'json');
  if (!config) {
    return { initialized: false, site_title: 'FilesHub' };
  }
  return config;
}

/**
 * 写入系统配置。
 * @param {object} env - Workers 环境变量
 * @param {{initialized?: boolean, site_title?: string}} config - 配置对象
 * @returns {Promise<void>}
 */
export async function setSystemConfig(env, config) {
  await env.FILESHUB_KV.put('system:config', JSON.stringify(config));
}

/* ------------------------------------------------------------------ */
/* 用户管理                                                            */
/* ------------------------------------------------------------------ */

/**
 * 获取用户名列表。
 * @param {object} env - Workers 环境变量
 * @returns {Promise<string[]>}
 */
export async function getUserList(env) {
  const list = await env.FILESHUB_KV.get('user:list', 'json');
  return Array.isArray(list) ? list : [];
}

/**
 * 获取单个用户信息。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @returns {Promise<{username:string,password_hash:string,role:string,created_at:string}|null>}
 */
export async function getUser(env, username) {
  if (!username) return null;
  return await env.FILESHUB_KV.get(`user:${username}`, 'json');
}

/**
 * 创建用户：更新 user:list 并写入 user:{username}。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {string} passwordHash - SHA-256 密码哈希
 * @param {string} role - 角色（admin / user）
 * @returns {Promise<void>}
 */
export async function createUser(env, username, passwordHash, role) {
  const list = await getUserList(env);
  if (!list.includes(username)) {
    list.push(username);
    await env.FILESHUB_KV.put('user:list', JSON.stringify(list));
  }
  const userRecord = {
    username,
    password_hash: passwordHash,
    role,
    created_at: new Date().toISOString(),
  };
  await env.FILESHUB_KV.put(`user:${username}`, JSON.stringify(userRecord));
}

/**
 * 删除用户：移除 user:list 记录、删除 user:{username}、
 * 删除该用户所有仓库（repos:{username} 与 repo:{username}:{id}）以及文件索引。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @returns {Promise<void>}
 */
export async function deleteUser(env, username) {
  // 1. 从 user:list 移除
  const list = await getUserList(env);
  const newList = list.filter((u) => u !== username);
  await env.FILESHUB_KV.put('user:list', JSON.stringify(newList));

  // 2. 删除 user:{username}
  await env.FILESHUB_KV.delete(`user:${username}`);

  // 3. 删除该用户所有仓库
  const repoIds = await getRepoList(env, username);
  for (const id of repoIds) {
    await env.FILESHUB_KV.delete(`repo:${username}:${id}`);
  }
  await env.FILESHUB_KV.delete(`repos:${username}`);

  // 4. 删除文件索引
  await env.FILESHUB_KV.delete(`files:${username}`);
}

/* ------------------------------------------------------------------ */
/* 仓库管理                                                            */
/* ------------------------------------------------------------------ */

/**
 * 获取用户的仓库 ID 列表。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @returns {Promise<string[]>}
 */
export async function getRepoList(env, username) {
  const list = await env.FILESHUB_KV.get(`repos:${username}`, 'json');
  return Array.isArray(list) ? list : [];
}

/**
 * 获取单个仓库配置。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {string} repoId - 仓库 ID
 * @returns {Promise<object|null>} RepoConfig 或 null
 */
export async function getRepo(env, username, repoId) {
  if (!repoId) return null;
  return await env.FILESHUB_KV.get(`repo:${username}:${repoId}`, 'json');
}

/**
 * 获取用户所有仓库配置数组。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @returns {Promise<object[]>} RepoConfig[]
 */
export async function getAllRepos(env, username) {
  const ids = await getRepoList(env, username);
  const repos = [];
  for (const id of ids) {
    const repo = await getRepo(env, username, id);
    if (repo) repos.push(repo);
  }
  return repos;
}

/**
 * 创建仓库：生成 ID，更新 repos:{username} 并写入 repo:{username}:{id}。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {object} repoConfig - 仓库配置（不含 id 与 created_at）
 * @returns {Promise<string>} 新生成的仓库 ID
 */
export async function createRepo(env, username, repoConfig) {
  const id = generateId();
  const ids = await getRepoList(env, username);
  ids.push(id);
  await env.FILESHUB_KV.put(`repos:${username}`, JSON.stringify(ids));

  const fullConfig = {
    ...repoConfig,
    id,
    created_at: new Date().toISOString(),
  };
  await env.FILESHUB_KV.put(`repo:${username}:${id}`, JSON.stringify(fullConfig));
  return id;
}

/**
 * 合并更新仓库配置。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {string} repoId - 仓库 ID
 * @param {object} updates - 待合并的字段
 * @returns {Promise<void>}
 */
export async function updateRepo(env, username, repoId, updates) {
  const existing = await getRepo(env, username, repoId);
  if (!existing) {
    throw new Error(`仓库不存在: ${repoId}`);
  }
  // id 与 created_at 不应被覆盖
  const merged = {
    ...existing,
    ...updates,
    id: existing.id,
    created_at: existing.created_at,
  };
  await env.FILESHUB_KV.put(`repo:${username}:${repoId}`, JSON.stringify(merged));
}

/**
 * 删除仓库：从 repos:{username} 移除并删除 repo:{username}:{id}。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {string} repoId - 仓库 ID
 * @returns {Promise<void>}
 */
export async function deleteRepo(env, username, repoId) {
  const ids = await getRepoList(env, username);
  const newIds = ids.filter((id) => id !== repoId);
  await env.FILESHUB_KV.put(`repos:${username}`, JSON.stringify(newIds));
  await env.FILESHUB_KV.delete(`repo:${username}:${repoId}`);
}

/* ------------------------------------------------------------------ */
/* 文件索引                                                            */
/* ------------------------------------------------------------------ */

/**
 * 获取用户文件索引数组。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @returns {Promise<object[]>} FileEntry[]
 */
export async function getFileIndex(env, username) {
  const files = await env.FILESHUB_KV.get(`files:${username}`, 'json');
  return Array.isArray(files) ? files : [];
}

/**
 * 追加一条文件索引记录。
 * 注意 KV 同 key 写入限制 1 次/秒，此处直接全量写回。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {object} entry - FileEntry
 * @returns {Promise<void>}
 */
export async function addFileEntry(env, username, entry) {
  const files = await getFileIndex(env, username);
  files.push(entry);
  await env.FILESHUB_KV.put(`files:${username}`, JSON.stringify(files));
}

/**
 * 移除指定 path 的文件索引记录。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {string} path - 文件路径
 * @returns {Promise<void>}
 */
export async function removeFileEntry(env, username, path) {
  const files = await getFileIndex(env, username);
  const filtered = files.filter((f) => f.path !== path);
  await env.FILESHUB_KV.put(`files:${username}`, JSON.stringify(filtered));
}

/**
 * 在文件索引中查找指定 path 的记录。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @param {string} path - 文件路径
 * @returns {Promise<object|null>} FileEntry 或 null
 */
export async function findFileEntry(env, username, path) {
  const files = await getFileIndex(env, username);
  return files.find((f) => f.path === path) || null;
}

/* ------------------------------------------------------------------ */
/* 会话管理                                                            */
/* ------------------------------------------------------------------ */

/**
 * 创建会话：生成 token，写入 session:{token}（TTL 24h），
 * 同时返回 token 与用户信息。
 * @param {object} env - Workers 环境变量
 * @param {string} username - 用户名
 * @returns {Promise<{token: string, username: string, role: string}>}
 */
export async function createSession(env, username) {
  const user = await getUser(env, username);
  if (!user) {
    throw new Error(`创建会话失败：用户不存在 ${username}`);
  }
  const token = generateSessionToken();
  const session = {
    username,
    role: user.role,
    created_at: new Date().toISOString(),
  };
  await env.FILESHUB_KV.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
  return { token, username, role: user.role };
}

/**
 * 读取会话信息。
 * @param {object} env - Workers 环境变量
 * @param {string} sessionToken - 会话 token
 * @returns {Promise<{username:string,role:string}|null>}
 */
export async function getSession(env, sessionToken) {
  if (!sessionToken) return null;
  const session = await env.FILESHUB_KV.get(`session:${sessionToken}`, 'json');
  if (!session) return null;
  return { username: session.username, role: session.role };
}

/**
 * 删除会话。
 * @param {object} env - Workers 环境变量
 * @param {string} sessionToken - 会话 token
 * @returns {Promise<void>}
 */
export async function deleteSession(env, sessionToken) {
  if (!sessionToken) return;
  await env.FILESHUB_KV.delete(`session:${sessionToken}`);
}
