/**
 * @file Worker 主入口文件
 * @description FilesHub 文件床系统主入口，负责路由分发、认证中间件、初始化引导。
 *              基于 Cloudflare Workers + GitHub 多仓库的文件床系统。
 */

import {
  jsonResponse,
  errorResponse,
  corsResponse,
  getMimeType,
  generateFilePath,
  isImage,
  isVideo,
  isSafePath,
  formatBytes,
  encryptToken,
  decryptToken,
  sha256,
} from './utils.js';

import {
  getSystemConfig,
  setSystemConfig,
  getUserList,
  getUser,
  createUser,
  deleteUser,
  getAllRepos,
  createRepo,
  getFileIndex,
  addFileEntry,
  removeFileEntry,
  findFileEntry,
} from './kv.js';

import {
  handleLogin,
  handleLogout,
  authMiddleware,
} from './auth.js';

import {
  selectRepoForUpload,
  handleReposRequest,
  handleRepoStatusRequest,
  handleRepoUpdateRequest,
  handleRepoDeleteRequest,
} from './repo-manager.js';

import {
  uploadFile,
  downloadFile,
  deleteFile,
} from './github.js';

import { renderUI } from './ui.js';

// ===========================================================================
// 辅助函数
// ===========================================================================

/**
 * 认证检查辅助函数，统一处理登录验证和管理员权限验证
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {boolean} requireAdmin - 是否需要管理员权限
 * @returns {Promise<{auth: Object|null, error: Response|null}>}
 *   auth 为认证信息对象 { authenticated, username, role }，error 为错误响应
 */
async function checkAuth(request, env, requireAdmin = false) {
  const auth = await authMiddleware(request, env);
  if (!auth || !auth.authenticated) {
    return { auth: null, error: errorResponse('未登录或会话已过期', 401) };
  }
  if (requireAdmin && auth.role !== 'admin') {
    return { auth: null, error: errorResponse('权限不足，需要管理员权限', 403) };
  }
  return { auth, error: null };
}

// ===========================================================================
// 路由处理函数 — 初始化引导
// ===========================================================================

/**
 * GET /api/setup/status — 检查系统是否已初始化
 * @param {Object} env - 环境变量
 * @returns {Promise<Response>}
 */
async function handleSetupStatus(env) {
  const config = await getSystemConfig(env);
  return jsonResponse({
    success: true,
    initialized: config.initialized,
    site_title: config.site_title,
  });
}

/**
 * POST /api/setup — 首次初始化系统（创建管理员账号 + 首个仓库）
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Promise<Response>}
 */
async function handleSetup(request, env) {
  // 检查是否已初始化
  const config = await getSystemConfig(env);
  if (config.initialized) {
    return errorResponse('系统已初始化，请勿重复操作', 403);
  }

  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('请求体格式错误，需要合法 JSON', 400);
  }

  const { admin_username, admin_password, site_title, first_repo } = body;

  // 参数校验
  if (!admin_username || !admin_password) {
    return errorResponse('管理员用户名和密码不能为空', 400);
  }
  if (!first_repo || !first_repo.owner || !first_repo.repo) {
    return errorResponse('首个仓库配置不完整，需要 owner 和 repo 字段', 400);
  }

  // 创建管理员用户
  const passwordHash = await sha256(admin_password);
  await createUser(env, admin_username, passwordHash, 'admin');

  // 加密首个仓库的 GitHub Token
  const encryptedToken = first_repo.token
    ? await encryptToken(first_repo.token, env.AUTH_TOKEN)
    : '';

  // 创建首个仓库
  const now = new Date().toISOString();
  await createRepo(env, admin_username, {
    ...first_repo,
    token: encryptedToken,
    priority: 1,
    enabled: true,
    created_at: now,
  });

  // 更新系统配置为已初始化
  await setSystemConfig(env, {
    initialized: true,
    site_title: site_title || 'FilesHub',
  });

  return jsonResponse({ success: true, message: '初始化完成' });
}

// ===========================================================================
// 路由处理函数 — 认证
// ===========================================================================

/**
 * GET /api/verify — 验证当前会话状态
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Promise<Response>}
 */
async function handleVerify(request, env) {
  const auth = await authMiddleware(request, env);
  if (auth && auth.authenticated) {
    return jsonResponse({
      success: true,
      username: auth.username,
      role: auth.role,
    });
  }
  return errorResponse('未登录或会话已过期', 401, { success: false });
}

// ===========================================================================
// 路由处理函数 — 用户管理（管理员）
// ===========================================================================

/**
 * GET /api/users — 获取用户列表（管理员）
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Promise<Response>}
 */
async function handleUsersList(request, env) {
  const { auth, error } = await checkAuth(request, env, true);
  if (error) return error;

  const usernameList = await getUserList(env);
  const users = [];
  for (const username of usernameList) {
    const user = await getUser(env, username);
    if (user) {
      // 不返回密码哈希
      users.push({
        username: user.username,
        role: user.role,
        created_at: user.created_at,
      });
    }
  }

  return jsonResponse({ success: true, users });
}

/**
 * POST /api/users — 创建用户（管理员）
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Promise<Response>}
 */
async function handleUserCreate(request, env) {
  const { auth, error } = await checkAuth(request, env, true);
  if (error) return error;

  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('请求体格式错误，需要合法 JSON', 400);
  }

  const { username, password, role } = body;

  if (!username || !password) {
    return errorResponse('用户名和密码不能为空', 400);
  }

  // 检查用户名是否已存在
  const existing = await getUser(env, username);
  if (existing) {
    return errorResponse('用户名已存在', 409);
  }

  // 创建用户
  const passwordHash = await sha256(password);
  await createUser(env, username, passwordHash, role || 'user');

  return jsonResponse({ success: true, message: '用户创建成功' });
}

/**
 * DELETE /api/users/{name} — 删除用户（管理员）
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {string} username - 要删除的用户名
 * @returns {Promise<Response>}
 */
async function handleUserDelete(request, env, username) {
  const { auth, error } = await checkAuth(request, env, true);
  if (error) return error;

  // 不能删除自己
  if (auth.username === username) {
    return errorResponse('不能删除当前登录的用户', 400);
  }

  // 检查目标用户是否存在
  const targetUser = await getUser(env, username);
  if (!targetUser) {
    return errorResponse('用户不存在', 404);
  }

  await deleteUser(env, username);
  return jsonResponse({ success: true, message: '用户删除成功' });
}

// ===========================================================================
// 路由处理函数 — 文件操作
// ===========================================================================

/**
 * POST /api/upload — 上传文件（已认证）
 * 支持 multipart/form-data（多文件）和 raw body（单文件）两种模式。
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} ctx - 执行上下文
 * @returns {Promise<Response>}
 */
async function handleUpload(request, env, ctx) {
  const { auth, error } = await checkAuth(request, env, false);
  if (error) return error;
  const { username } = auth;

  const url = new URL(request.url);
  const contentType = request.headers.get('Content-Type') || '';

  // 收集待上传文件
  const files = [];

  if (contentType.includes('multipart/form-data')) {
    // multipart/form-data 模式 — 支持多文件上传
    const formData = await request.formData();
    const customDir = formData.get('dir') || formData.get('custom_dir') || '';

    for (const [, value] of formData.entries()) {
      if (value instanceof File) {
        files.push({
          name: value.name,
          buffer: await value.arrayBuffer(),
          customDir: customDir || '',
        });
      }
    }
  } else {
    // raw body 模式 — 单文件上传
    const buffer = await request.arrayBuffer();
    const filename =
      request.headers.get('X-File-Name') ||
      url.searchParams.get('filename') ||
      'upload';
    const customDir = url.searchParams.get('dir') || '';
    files.push({ name: filename, buffer, customDir });
  }

  if (files.length === 0) {
    return errorResponse('未检测到上传文件', 400);
  }

  // 逐个文件处理
  const results = [];
  for (const file of files) {
    try {
      const fileSize = file.buffer.byteLength;

      // 选择仓库
      const repoConfig = await selectRepoForUpload(env, username, fileSize);
      if (!repoConfig) {
        results.push({
          name: file.name,
          success: false,
          error: '没有可用的仓库（可能容量已满或未配置仓库）',
        });
        continue;
      }

      // 解密仓库 token
      let decryptedToken = '';
      if (repoConfig.token) {
        decryptedToken = await decryptToken(repoConfig.token, env.AUTH_TOKEN);
      }

      // 生成文件存储路径
      const filePath = generateFilePath(file.name, file.customDir);

      // 路径安全检查
      if (!isSafePath(filePath)) {
        results.push({
          name: file.name,
          success: false,
          error: '生成的文件路径不安全',
        });
        continue;
      }

      // 构建 GitHub API 用的仓库配置（使用解密后的 token）
      const repoConfigForGithub = {
        owner: repoConfig.owner,
        repo: repoConfig.repo,
        branch: repoConfig.branch,
        token: decryptedToken,
        is_public: repoConfig.is_public,
      };

      // 上传文件到 GitHub
      const uploadResult = await uploadFile(
        repoConfigForGithub,
        file.buffer,
        filePath,
        `Upload ${file.name}`,
      );

      // 记录文件索引
      const now = new Date().toISOString();
      const entry = {
        path: uploadResult.path || filePath,
        name: file.name,
        repo_id: repoConfig.id,
        size: uploadResult.size || fileSize,
        sha: uploadResult.sha,
        uploaded_at: now,
      };
      await addFileEntry(env, username, entry);

      // 存储文件映射到 KV（供 /raw/ 公开下载使用）
      await env.FILESHUB_KV.put(
        `filemap:${entry.path}`,
        JSON.stringify({
          owner: repoConfig.owner,
          repo: repoConfig.repo,
          branch: repoConfig.branch,
          token_encrypted: repoConfig.token,
          is_public: repoConfig.is_public,
        }),
      );

      results.push({
        name: file.name,
        success: true,
        path: entry.path,
        size: entry.size,
        sha: entry.sha,
        raw_url: `/raw/${entry.path}`,
      });
    } catch (err) {
      console.error('[Upload Error]', file.name, err);
      results.push({
        name: file.name,
        success: false,
        error: err.message,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const allSuccess = successCount === results.length;
  const anySuccess = successCount > 0;

  return jsonResponse({
    success: anySuccess,
    message: `上传完成: ${successCount}/${results.length} 个文件成功`,
    results,
  }, allSuccess ? 200 : (anySuccess ? 207 : 500));
}

/**
 * GET /api/list — 获取文件列表（已认证）
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Promise<Response>}
 */
async function handleList(request, env) {
  const { auth, error } = await checkAuth(request, env, false);
  if (error) return error;

  const files = await getFileIndex(env, auth.username);

  // 为每个文件添加展示用的附加字段
  const fileList = files.map((file) => ({
    ...file,
    raw_url: `/raw/${file.path}`,
    is_image: isImage(file.name),
    is_video: isVideo(file.name),
    size_formatted: formatBytes(file.size),
  }));

  return jsonResponse({ success: true, files: fileList });
}

/**
 * DELETE /api/delete/{path} — 删除文件（已认证）
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {string} filePath - 文件路径
 * @returns {Promise<Response>}
 */
async function handleDelete(request, env, filePath) {
  const { auth, error } = await checkAuth(request, env, false);
  if (error) return error;
  const { username } = auth;

  if (!filePath) {
    return errorResponse('文件路径不能为空', 400);
  }

  // 查找文件索引
  const entry = await findFileEntry(env, username, filePath);
  if (!entry) {
    return errorResponse('文件不存在', 404);
  }

  // 获取文件所在仓库的配置
  const repos = await getAllRepos(env, username);
  const repoConfig = repos.find((r) => r.id === entry.repo_id);
  if (!repoConfig) {
    return errorResponse('文件所在的仓库配置不存在', 404);
  }

  // 解密仓库 token
  let decryptedToken = '';
  if (repoConfig.token) {
    decryptedToken = await decryptToken(repoConfig.token, env.AUTH_TOKEN);
  }

  const repoConfigForGithub = {
    owner: repoConfig.owner,
    repo: repoConfig.repo,
    branch: repoConfig.branch,
    token: decryptedToken,
    is_public: repoConfig.is_public,
  };

  // 从 GitHub 删除文件
  try {
    await deleteFile(repoConfigForGithub, entry.path, `Delete ${entry.name}`);
  } catch (err) {
    console.error('[Delete File Error]', err);
    return errorResponse(`从仓库删除文件失败: ${err.message}`, 500);
  }

  // 移除文件索引
  await removeFileEntry(env, username, filePath);

  // 删除文件映射
  try {
    await env.FILESHUB_KV.delete(`filemap:${filePath}`);
  } catch (err) {
    console.error('[Delete FileMap Error]', err);
  }

  return jsonResponse({ success: true, message: '文件删除成功' });
}

// ===========================================================================
// 路由处理函数 — 公开访问
// ===========================================================================

/**
 * GET /raw/{path} — 公开下载文件（CDN 缓存）
 * 不需要用户认证，通过 KV 中的 filemap 映射定位文件所在仓库。
 * @param {Object} env - 环境变量
 * @param {Object} ctx - 执行上下文
 * @param {string} filePath - 文件路径
 * @returns {Promise<Response>}
 */
async function handleRaw(env, ctx, filePath) {
  if (!filePath) {
    return errorResponse('文件路径不能为空', 400);
  }

  // CDN 缓存检查
  const cacheKey = new Request(`https://fileshub.cache/${filePath}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return cached;
  }

  // 从 KV 读取文件映射
  const fileMap = await env.FILESHUB_KV.get(`filemap:${filePath}`, 'json');
  if (!fileMap) {
    return errorResponse('文件不存在', 404);
  }

  // 解密仓库 token
  let decryptedToken = '';
  if (fileMap.token_encrypted) {
    decryptedToken = await decryptToken(fileMap.token_encrypted, env.AUTH_TOKEN);
  }

  const repoConfig = {
    owner: fileMap.owner,
    repo: fileMap.repo,
    branch: fileMap.branch,
    token: decryptedToken,
    is_public: fileMap.is_public,
  };

  // 从 GitHub 下载文件
  let ghResponse;
  try {
    ghResponse = await downloadFile(repoConfig, filePath);
  } catch (err) {
    console.error('[Raw Download Error]', err);
    return errorResponse(`文件下载失败: ${err.message}`, 502);
  }

  if (!ghResponse.ok) {
    console.error('[Raw Download Error]', ghResponse.status, ghResponse.statusText);
    return errorResponse('文件下载失败', ghResponse.status === 404 ? 404 : 502);
  }

  // 构建响应头
  const filename = filePath.split('/').pop() || 'download';
  const mimeType = getMimeType(filename);
  const isMedia = isImage(filename) || isVideo(filename);
  const disposition = isMedia ? 'inline' : 'attachment';

  const headers = new Headers();
  headers.set('Content-Type', mimeType);
  headers.set(
    'Content-Disposition',
    `${disposition}; filename="${encodeURIComponent(filename)}"`,
  );
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=2592000');
  headers.set('Access-Control-Allow-Origin', '*');

  // 尝试保留 Content-Length
  const contentLength = ghResponse.headers.get('Content-Length');
  if (contentLength) {
    headers.set('Content-Length', contentLength);
  }

  const newResponse = new Response(ghResponse.body, {
    status: 200,
    headers,
  });

  // 存入 CDN 缓存（异步执行，不阻塞响应）
  ctx.waitUntil(
    caches.default.put(cacheKey, newResponse.clone()).catch((err) => {
      console.error('[Cache Put Error]', err);
    }),
  );

  return newResponse;
}

// ===========================================================================
// Worker 主入口
// ===========================================================================

/**
 * Worker 主入口 — 处理所有 fetch 请求
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量（包含 FILESHUB_KV 绑定和 AUTH_TOKEN Secret）
 * @param {Object} ctx - 执行上下文（用于 waitUntil 等）
 * @returns {Promise<Response>}
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // CORS 预检请求
    if (method === 'OPTIONS') {
      return corsResponse();
    }

    try {
      // -----------------------------------------------------------------
      // 首页
      // -----------------------------------------------------------------

      // GET / → 返回 Web UI
      if (path === '/' && method === 'GET') {
        const html = renderUI(env);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      // -----------------------------------------------------------------
      // 初始化引导（无需认证）
      // -----------------------------------------------------------------

      // GET /api/setup/status → 检查是否已初始化
      if (path === '/api/setup/status' && method === 'GET') {
        return await handleSetupStatus(env);
      }

      // POST /api/setup → 首次初始化
      if (path === '/api/setup' && method === 'POST') {
        return await handleSetup(request, env);
      }

      // -----------------------------------------------------------------
      // 认证
      // -----------------------------------------------------------------

      // POST /api/login → 用户登录
      if (path === '/api/login' && method === 'POST') {
        return await handleLogin(request, env);
      }

      // POST /api/logout → 退出登录
      if (path === '/api/logout' && method === 'POST') {
        return await handleLogout(request, env);
      }

      // GET /api/verify → 验证会话状态
      if (path === '/api/verify' && method === 'GET') {
        return await handleVerify(request, env);
      }

      // -----------------------------------------------------------------
      // 用户管理（管理员）
      // -----------------------------------------------------------------

      // GET /api/users → 用户列表
      if (path === '/api/users' && method === 'GET') {
        return await handleUsersList(request, env);
      }

      // POST /api/users → 创建用户
      if (path === '/api/users' && method === 'POST') {
        return await handleUserCreate(request, env);
      }

      // DELETE /api/users/{name} → 删除用户
      if (path.startsWith('/api/users/') && method === 'DELETE') {
        const targetUsername = decodeURIComponent(
          path.slice('/api/users/'.length),
        );
        return await handleUserDelete(request, env, targetUsername);
      }

      // -----------------------------------------------------------------
      // 仓库管理（已认证）
      // -----------------------------------------------------------------

      // GET/POST /api/repos → 仓库列表 / 添加仓库
      if (path === '/api/repos' && (method === 'GET' || method === 'POST')) {
        const { auth, error } = await checkAuth(request, env, false);
        if (error) return error;
        return await handleReposRequest(request, env, auth.username);
      }

      // GET /api/repos/{id}/status → 仓库状态（需在通用 repos 路由前匹配）
      if (
        path.match(/^\/api\/repos\/[^/]+\/status$/) &&
        method === 'GET'
      ) {
        const repoId = decodeURIComponent(path.split('/')[3]);
        const { auth, error } = await checkAuth(request, env, false);
        if (error) return error;
        return await handleRepoStatusRequest(
          request,
          env,
          auth.username,
          repoId,
        );
      }

      // PUT /api/repos/{id} → 修改仓库
      if (path.match(/^\/api\/repos\/[^/]+$/) && method === 'PUT') {
        const repoId = decodeURIComponent(
          path.match(/^\/api\/repos\/([^/]+)$/)[1],
        );
        const { auth, error } = await checkAuth(request, env, false);
        if (error) return error;
        return await handleRepoUpdateRequest(
          request,
          env,
          auth.username,
          repoId,
        );
      }

      // DELETE /api/repos/{id} → 删除仓库
      if (path.match(/^\/api\/repos\/[^/]+$/) && method === 'DELETE') {
        const repoId = decodeURIComponent(
          path.match(/^\/api\/repos\/([^/]+)$/)[1],
        );
        const { auth, error } = await checkAuth(request, env, false);
        if (error) return error;
        return await handleRepoDeleteRequest(
          request,
          env,
          auth.username,
          repoId,
        );
      }

      // -----------------------------------------------------------------
      // 文件操作（已认证）
      // -----------------------------------------------------------------

      // POST /api/upload → 上传文件
      if (path === '/api/upload' && method === 'POST') {
        return await handleUpload(request, env, ctx);
      }

      // GET /api/list → 文件列表
      if (path === '/api/list' && method === 'GET') {
        return await handleList(request, env);
      }

      // DELETE /api/delete/{path} → 删除文件
      if (path.startsWith('/api/delete/') && method === 'DELETE') {
        const filePath = decodeURIComponent(
          path.slice('/api/delete/'.length),
        );
        return await handleDelete(request, env, filePath);
      }

      // -----------------------------------------------------------------
      // 公开访问
      // -----------------------------------------------------------------

      // GET /raw/{path} → 下载文件（公开，CDN 缓存）
      if (path.startsWith('/raw/') && method === 'GET') {
        const filePath = decodeURIComponent(path.slice('/raw/'.length));
        return await handleRaw(env, ctx, filePath);
      }

      // -----------------------------------------------------------------
      // 404 — 未匹配的路由
      // -----------------------------------------------------------------

      return errorResponse('接口不存在', 404);
    } catch (err) {
      console.error('[Unhandled Error]', err);
      return errorResponse(`服务器内部错误: ${err.message}`, 500);
    }
  },
};
