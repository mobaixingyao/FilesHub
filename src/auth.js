// 认证模块
// 提供登录、登出与请求中间件，基于 KV 存储的会话进行鉴权。

import { sha256, jsonResponse, errorResponse } from './utils.js';
import { getUser, createSession, getSession, deleteSession } from './kv.js';

/**
 * 从请求头中提取 Bearer token。
 * 匹配形如 "Authorization: Bearer <token>" 的头，大小写不敏感。
 *
 * @param {Headers} headers
 * @returns {string|null} token 值，无匹配时返回 null
 */
function extractBearerToken(headers) {
  const auth = headers.get('Authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * 处理登录请求。
 * 解析 POST JSON body { username, password }，比对 sha256(password) 与存储的 password_hash。
 * 成功则创建会话并返回 session_token；失败返回 401。
 *
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function handleLogin(request, env) {
  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('无效的请求体', 400);
  }

  const { username, password } = body || {};
  if (!username || !password) {
    return errorResponse('用户名和密码不能为空', 400);
  }

  // 获取用户
  const user = await getUser(env, username);
  if (!user) {
    return errorResponse('用户名或密码错误', 401);
  }

  // 比对密码哈希
  const passwordHash = await sha256(password);
  if (passwordHash !== user.password_hash) {
    return errorResponse('用户名或密码错误', 401);
  }

  // 创建会话
  const sessionToken = await createSession(env, username, user.role);

  return jsonResponse({
    success: true,
    session_token: sessionToken,
    username,
    role: user.role,
  });
}

/**
 * 处理登出请求。
 * 从 Authorization 头提取 Bearer token，删除对应会话。
 *
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function handleLogout(request, env) {
  const token = extractBearerToken(request.headers);
  if (token) {
    await deleteSession(env, token);
  }
  return jsonResponse({ success: true });
}

/**
 * 鉴权中间件。
 * 从 Authorization: Bearer {token} 提取会话 token，通过 getSession 验证。
 *
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<{authenticated:boolean, username?:string, role?:string}>}
 */
export async function authMiddleware(request, env) {
  const token = extractBearerToken(request.headers);
  if (!token) {
    return { authenticated: false };
  }

  const session = await getSession(env, token);
  if (!session) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    username: session.username,
    role: session.role,
  };
}
