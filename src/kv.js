// kv.js - KV 存储层 (ES Module)
// 基于 Cloudflare Workers KV (env.FILESHUB_KV) 的数据访问层
//
// KV Key 结构：
//   system:config        -> { initialized, site_title }
//   user:list            -> ["admin", ...]
//   user:{username}      -> { username, password_hash, role, created_at }
//   repos:{username}     -> ["repo_xxx", ...]
//   repo:{username}:{id} -> RepoConfig
//   files:{username}     -> FileEntry[]
//   session:{token}      -> { username, role, created_at }  (TTL 86400)

import { generateId, generateSessionToken } from './utils.js';

// 会话 TTL（秒）= 24 小时
const SESSION_TTL = 86400;

// ---------------------------------------------------------------------------
// 系统配置
// ---------------------------------------------------------------------------

/**
 * 读取系统配置，不存在时返回默认值 { initialized:false, site_title:'FilesHub' }。
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
 */
export async function setSystemConfig(env, config) {
  await env.FILESHUB_KV.put('system:config', JSON.stringify(config));
}

// ---------------------------------------------------------------------------
// 用户
// ---------------------------------------------------------------------------

/**
 * 读取用户名列表，不存在返回 []。
 */
export async function getUserList(env) {
  const list = await env.FILESHUB_KV.get('user:list', 'json');
  return list || [];
}

/**
 * 读取单个用户，不存在返回 null。
 */
export async function getUser(env, username) {
  const user = await env.FILESHUB_KV.get(`user:${username}`, 'json');
  return user || null;
}

/**
 * 创建用户：先读 user:list 追加 username 写回，再写入 user:{username}。
 */
export async function createUser(env, username, passwordHash, role) {
  // 1. 更新 user:list
  const list = await getUserList(env);
  if (!list.includes(username)) {
    list.push(username);
    await env.FILESHUB_KV.put('user:list', JSON.stringify(list));
  }
  // 2. 写入 user:{username}
  const user = {
    username,
    password_hash: passwordHash,
    role,
    created_at: new Date().toISOString(),
  };
  await env.FILESHUB_KV.put(`user:${username}`, JSON.stringify(user));
  return user;
}

/**
 * 删除用户并级联清理：从 user:list 移除、删除 user:{username}、
 * 删除 repos:{username} 下所有 repo、删除 repos:{username}、删除 files:{username}。
 */
export async function deleteUser(env, username) {
  // 1. 从 user:list 移除
  const list = await getUserList(env);
  const newList = list.filter((u) => u !== username);
  await env.FILESHUB_KV.put('user:list', JSON.stringify(newList));

  // 2. 删除 user:{username}
  await env.FILESHUB_KV.delete(`user:${username}`);

  // 3. 删除 repos:{username} 下所有 repo:{username}:{repoId}
  const repoIds = await getRepoList(env, username);
  for (const repoId of repoIds) {
    await env.FILESHUB_KV.delete(`repo:${username}:${repoId}`);
  }

  // 4. 删除 repos:{username}
  await env.FILESHUB_KV.delete(`repos:${username}`);

  // 5. 删除 files:{username}
  await env.FILESHUB_KV.delete(`files:${username}`);
}

// ---------------------------------------------------------------------------
// 仓库
// ---------------------------------------------------------------------------

/**
 * 读取用户的仓库 ID 列表，不存在返回 []。
 */
export async function getRepoList(env, username) {
  const list = await env.FILESHUB_KV.get(`repos:${username}`, 'json');
  return list || [];
}

/**
 * 读取单个仓库配置，不存在返回 null。
 */
export async function getRepo(env, username, repoId) {
  const repo = await env.FILESHUB_KV.get(`repo:${username}:${repoId}`, 'json');
  return repo || null;
}

/**
 * 读取用户所有仓库配置数组。
 */
export async function getAllRepos(env, username) {
  const repoIds = await getRepoList(env, username);
  const repos = [];
  for (const repoId of repoIds) {
    const repo = await getRepo(env, username, repoId);
    if (repo) repos.push(repo);
  }
  return repos;
}

/**
 * 创建仓库：生成 id，写入 repo:{username}:{id}，更新 repos:{username} 列表，返回 id。
 */
export async function createRepo(env, username, repoConfig) {
  const id = generateId();
  const repo = {
    ...repoConfig,
    id,
    created_at: new Date().toISOString(),
  };
  // 写入 repo 记录
  await env.FILESHUB_KV.put(`repo:${username}:${id}`, JSON.stringify(repo));
  // 更新 repos 列表
  const list = await getRepoList(env, username);
  list.push(id);
  await env.FILESHUB_KV.put(`repos:${username}`, JSON.stringify(list));
  return id;
}

/**
 * 合并更新仓库配置，仓库不存在返回 null。
 */
export async function updateRepo(env, username, repoId, updates) {
  const repo = await getRepo(env, username, repoId);
  if (!repo) return null;
  const updated = { ...repo, ...updates, id: repoId };
  await env.FILESHUB_KV.put(`repo:${username}:${repoId}`, JSON.stringify(updated));
  return updated;
}

/**
 * 删除仓库：从 repos:{username} 列表移除，删除 repo:{username}:{repoId}。
 */
export async function deleteRepo(env, username, repoId) {
  // 从列表移除
  const list = await getRepoList(env, username);
  const newList = list.filter((id) => id !== repoId);
  await env.FILESHUB_KV.put(`repos:${username}`, JSON.stringify(newList));
  // 删除 repo 记录
  await env.FILESHUB_KV.delete(`repo:${username}:${repoId}`);
}

// ---------------------------------------------------------------------------
// 文件索引
// ---------------------------------------------------------------------------

/**
 * 读取用户文件索引，不存在返回 []。
 */
export async function getFileIndex(env, username) {
  const files = await env.FILESHUB_KV.get(`files:${username}`, 'json');
  return files || [];
}

/**
 * 追加文件条目到 files:{username} 并写回。
 */
export async function addFileEntry(env, username, entry) {
  const files = await getFileIndex(env, username);
  files.push(entry);
  await env.FILESHUB_KV.put(`files:${username}`, JSON.stringify(files));
  return files;
}

/**
 * 按 path 过滤移除文件条目并写回。
 */
export async function removeFileEntry(env, username, path) {
  const files = await getFileIndex(env, username);
  const newFiles = files.filter((f) => f.path !== path);
  await env.FILESHUB_KV.put(`files:${username}`, JSON.stringify(newFiles));
  return newFiles;
}

/**
 * 查找指定 path 的文件条目，未找到返回 null。
 */
export async function findFileEntry(env, username, path) {
  const files = await getFileIndex(env, username);
  return files.find((f) => f.path === path) || null;
}

// ---------------------------------------------------------------------------
// 会话
// ---------------------------------------------------------------------------

/**
 * 创建会话：查询用户 role，生成 token，写入 session:{token}（TTL 86400），
 * 返回 { token, username, role }。
 */
export async function createSession(env, username) {
  const user = await getUser(env, username);
  const role = user ? user.role : 'user';
  const token = generateSessionToken();
  const session = {
    username,
    role,
    created_at: new Date().toISOString(),
  };
  await env.FILESHUB_KV.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
  return { token, username, role };
}

/**
 * 读取会话，返回 { username, role } 或 null。
 */
export async function getSession(env, sessionToken) {
  const session = await env.FILESHUB_KV.get(`session:${sessionToken}`, 'json');
  if (!session) return null;
  return { username: session.username, role: session.role };
}

/**
 * 删除会话。
 */
export async function deleteSession(env, sessionToken) {
  await env.FILESHUB_KV.delete(`session:${sessionToken}`);
}
