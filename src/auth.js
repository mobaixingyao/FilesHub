/**
 * @file auth.js
 * @module auth
 * @description FilesHub 认证模块。
 * 提供用户登录、登出与会话校验中间件。
 * 密码采用 SHA-256 哈希存储与会话 Token 随机 32 字节 hex，TTL 24 小时。
 */

import { sha256, jsonResponse, errorResponse } from './utils.js';
import { getUser, createSession, getSession, deleteSession } from './kv.js';

/**
 * 从请求的 Authorization 头提取 Bearer token。
 * @param {Request} request - 请求对象
 * @returns {string|null} token 或 null
 */
function extractBearerToken(request) {
  const auth = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * 处理登录请求。
 * 解析 POST body { username, password }，校验用户名密码（SHA-256 比对），
 * 创建会话并返回 { success, session_token, username, role }。
 * @param {Request} request - 请求对象
 * @param {object} env - Workers 环境变量
 * @returns {Promise<Response>}
 */
export async function handleLogin(request, env) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse('请求体格式错误，需要 JSON', 400);
    }

    const { username, password } = body || {};
    if (!username || !password) {
      return errorResponse('用户名和密码不能为空', 400);
    }

    const user = await getUser(env, username);
    if (!user) {
      return errorResponse('用户名或密码错误', 401);
    }

    const passwordHash = await sha256(password);
    if (passwordHash !== user.password_hash) {
      console.error(`登录失败：密码不匹配，用户 ${username}`);
      return errorResponse('用户名或密码错误', 401);
    }

    const session = await createSession(env, username);
    return jsonResponse({
      success: true,
      session_token: session.token,
      username: session.username,
      role: session.role,
    });
  } catch (err) {
    console.error('登录异常:', err);
    return errorResponse('登录失败，请稍后重试', 500, { detail: err.message });
  }
}

/**
 * 处理登出请求。
 * 从 Authorization 头提取 session token，删除会话。
 * @param {Request} request - 请求对象
 * @param {object} env - Workers 环境变量
 * @returns {Promise<Response>}
 */
export async function handleLogout(request, env) {
  try {
    const token = extractBearerToken(request);
    if (token) {
      await deleteSession(env, token);
    }
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('登出异常:', err);
    return errorResponse('登出失败，请稍后重试', 500, { detail: err.message });
  }
}

/**
 * 认证中间件。
 * 从 Authorization: Bearer {token} 提取 session token，验证会话有效性。
 * @param {Request} request - 请求对象
 * @param {object} env - Workers 环境变量
 * @returns {Promise<{authenticated: boolean, username?: string, role?: string}>}
 */
export async function authMiddleware(request, env) {
  try {
    const token = extractBearerToken(request);
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
  } catch (err) {
    console.error('认证中间件异常:', err);
    return { authenticated: false };
  }
}
