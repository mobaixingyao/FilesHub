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
  sha256
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
  findFileEntry
} from './kv.js';
import { handleLogin, handleLogout, authMiddleware } from './auth.js';
import {
  selectRepoForUpload,
  handleReposRequest,
  handleRepoStatusRequest,
  handleRepoUpdateRequest,
  handleRepoDeleteRequest
} from './repo-manager.js';
import { uploadFile, downloadFile, deleteFile } from './github.js';
import { renderUI } from './ui.js';

/**
 * 认证检查辅助函数
 * @param {Request} request - 请求对象
 * @param {Object} env - Worker 环境变量
 * @param {boolean} requireAdmin - 是否要求管理员权限
 * @returns {{auth:Object|null, error:Response|null}}
 */
async function checkAuth(request, env, requireAdmin = false) {
  const auth = await authMiddleware(request, env);

  if (!auth || !auth.authenticated) {
    return { auth: null, error: errorResponse('未登录', 401) };
  }

  if (requireAdmin && auth.role !== 'admin') {
    return { auth: null, error: errorResponse('权限不足', 403) };
  }

  return { auth, error: null };
}

/**
 * 获取系统初始化状态
 */
async function handleSetupStatus(env) {
  const config = await getSystemConfig(env);
  return jsonResponse({
    success: true,
    initialized: config.initialized || false,
    site_title: config.site_title || env.SITE_TITLE || 'FilesHub'
  });
}

/**
 * 系统初始化设置
 */
async function handleSetup(request, env) {
  const config = await getSystemConfig(env);
  if (config.initialized) {
    return errorResponse('系统已初始化', 403);
  }

  const body = await request.json();
  const { admin_username, admin_password, site_title, first_repo } = body;

  // 创建管理员用户
  const passwordHash = await sha256(admin_password);
  await createUser(env, admin_username, passwordHash, 'admin');

  // 加密首个仓库的 token
  let encryptedToken = '';
  if (first_repo && first_repo.token) {
    encryptedToken = encryptToken(first_repo.token, env.AUTH_TOKEN);
  }

  // 创建首个仓库
  await createRepo(env, admin_username, {
    ...first_repo,
    token: encryptedToken,
    priority: 1,
    enabled: true,
    created_at: new Date().toISOString()
  });

  // 标记系统已初始化
  await setSystemConfig(env, {
    initialized: true,
    site_title
  });

  return jsonResponse({ success: true });
}

/**
 * 验证当前登录状态
 */
async function handleVerify(request, env) {
  const auth = await authMiddleware(request, env);
  if (!auth || !auth.authenticated) {
    return errorResponse('未登录', 401);
  }
  return jsonResponse({
    success: true,
    username: auth.username,
    role: auth.role
  });
}

/**
 * 获取用户列表（管理员）
 */
async function handleUsersList(request, env) {
  const { auth, error } = await checkAuth(request, env, true);
  if (error) return error;

  const users = await getUserList(env);
  const safeUsers = users.map(u => ({
    username: u.username,
    role: u.role,
    created_at: u.created_at
  }));
  return jsonResponse({ success: true, users: safeUsers });
}

/**
 * 创建用户（管理员）
 */
async function handleUserCreate(request, env) {
  const { auth, error } = await checkAuth(request, env, true);
  if (error) return error;

  const body = await request.json();
  const { username, password, role } = body;

  const existing = await getUser(env, username);
  if (existing) {
    return errorResponse('用户已存在', 409);
  }

  const passwordHash = await sha256(password);
  await createUser(env, username, passwordHash, role || 'user');
  return jsonResponse({ success: true });
}

/**
 * 删除用户（管理员）
 */
async function handleUserDelete(request, env, targetUsername) {
  const { auth, error } = await checkAuth(request, env, true);
  if (error) return error;

  if (auth.username === targetUsername) {
    return errorResponse('不能删除自己', 400);
  }

  await deleteUser(env, targetUsername);
  return jsonResponse({ success: true });
}

/**
 * 文件上传
 * 支持 multipart/form-data 或 raw body
 */
async function handleUpload(request, env, ctx) {
  const { auth, error } = await checkAuth(request, env);
  if (error) return error;

  const contentType = request.headers.get('Content-Type') || '';
  const results = [];
  const files = [];

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        files.push({
          name: value.name,
          size: value.size,
          content: await value.arrayBuffer()
        });
      }
    }
  } else {
    // Raw body 单文件上传
    const content = await request.arrayBuffer();
    const filename = request.headers.get('X-File-Name') || `upload-${Date.now()}`;
    files.push({
      name: filename,
      size: content.byteLength,
      content
    });
  }

  for (const file of files) {
    try {
      // 选择可用仓库
      const repoConfig = await selectRepoForUpload(env, auth.username, file.size);
      if (!repoConfig) {
        results.push({ name: file.name, success: false, error: '无可用仓库' });
        continue;
      }

      // 解密 token
      const token = decryptToken(repoConfig.token, env.AUTH_TOKEN);
      const githubConfig = {
        owner: repoConfig.owner,
        repo: repoConfig.repo,
        branch: repoConfig.branch,
        token,
        is_public: repoConfig.is_public
      };

      // 生成文件路径并检查安全性
      const filePath = generateFilePath(file.name);
      if (!isSafePath(filePath)) {
        results.push({ name: file.name, success: false, error: '文件路径不安全' });
        continue;
      }

      // 上传文件到 GitHub
      await uploadFile(env, githubConfig, filePath, file.content);

      // 记录文件索引
      await addFileEntry(env, {
        path: filePath,
        name: file.name,
        size: file.size,
        owner: repoConfig.owner,
        repo: repoConfig.repo,
        branch: repoConfig.branch,
        username: auth.username,
        created_at: new Date().toISOString()
      });

      // 写入 filemap KV（存储仓库映射和加密 token）
      await env.FILESHUB_KV.put('filemap:' + filePath, JSON.stringify({
        owner: repoConfig.owner,
        repo: repoConfig.repo,
        branch: repoConfig.branch,
        token_encrypted: repoConfig.token,
        is_public: repoConfig.is_public
      }));

      results.push({
        name: file.name,
        success: true,
        path: filePath,
        size: file.size,
        raw_url: `/raw/${filePath}`
      });
    } catch (err) {
      results.push({ name: file.name, success: false, error: err.message });
    }
  }

  return jsonResponse({ success: true, results });
}

/**
 * 获取文件列表
 */
async function handleList(request, env) {
  const { auth, error } = await checkAuth(request, env);
  if (error) return error;

  const files = await getFileIndex(env);
  const fileList = files.map(f => ({
    ...f,
    raw_url: `/raw/${f.path}`,
    is_image: isImage(f.name),
    is_video: isVideo(f.name),
    size_formatted: formatBytes(f.size)
  }));

  return jsonResponse({ success: true, files: fileList });
}

/**
 * 删除文件
 */
async function handleDelete(request, env, filePath) {
  const { auth, error } = await checkAuth(request, env);
  if (error) return error;

  // 查找文件条目，确认文件存在
  const fileEntry = await findFileEntry(env, filePath);
  if (!fileEntry) {
    return errorResponse('文件不存在', 404);
  }

  // 从 filemap KV 获取仓库映射（含加密 token）
  const filemap = await env.FILESHUB_KV.get('filemap:' + filePath, 'json');
  if (!filemap) {
    return errorResponse('文件映射不存在', 404);
  }

  // 解密 token
  const token = decryptToken(filemap.token_encrypted, env.AUTH_TOKEN);
  const githubConfig = {
    owner: filemap.owner,
    repo: filemap.repo,
    branch: filemap.branch,
    token,
    is_public: filemap.is_public
  };

  // 从 GitHub 删除文件
  await deleteFile(env, githubConfig, filePath);

  // 移除文件索引
  await removeFileEntry(env, filePath);

  // 删除 filemap KV
  await env.FILESHUB_KV.delete('filemap:' + filePath);

  return jsonResponse({ success: true });
}

/**
 * 原始文件访问（公开）
 * 支持 CDN 缓存
 */
async function handleRaw(env, ctx, filePath) {
  // CDN 缓存检查
  const cacheKey = new Request('https://fileshub.cache/raw/' + filePath, { method: 'GET' });
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return cached;
  }

  // 从 filemap KV 获取仓库映射
  const filemap = await env.FILESHUB_KV.get('filemap:' + filePath, 'json');
  if (!filemap) {
    return errorResponse('文件不存在', 404);
  }

  // 解密 token 并下载文件
  const token = decryptToken(filemap.token_encrypted, env.AUTH_TOKEN);
  const githubConfig = {
    owner: filemap.owner,
    repo: filemap.repo,
    branch: filemap.branch,
    token,
    is_public: filemap.is_public
  };

  const content = await downloadFile(env, githubConfig, filePath);

  // 设置响应头
  const filename = filePath.split('/').pop() || 'download';
  const mimeType = getMimeType(filename);
  const shouldInline = isImage(filename) || isVideo(filename);
  const disposition = shouldInline ? 'inline' : 'attachment';

  const response = new Response(content, {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Disposition': `${disposition}; filename="${filename}"`
    }
  });

  // 缓存到 CDN
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));

  return response;
}

/**
 * Worker 主入口 - 路由分发
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 预检
    if (method === 'OPTIONS') {
      return corsResponse();
    }

    // GET / → 渲染 UI
    if (path === '/' && method === 'GET') {
      return renderUI(request, env);
    }

    // GET /api/setup/status → 系统初始化状态
    if (path === '/api/setup/status' && method === 'GET') {
      return handleSetupStatus(env);
    }

    // POST /api/setup → 系统初始化
    if (path === '/api/setup' && method === 'POST') {
      return handleSetup(request, env);
    }

    // POST /api/login → 登录
    if (path === '/api/login' && method === 'POST') {
      return handleLogin(request, env);
    }

    // POST /api/logout → 登出
    if (path === '/api/logout' && method === 'POST') {
      return handleLogout(request, env);
    }

    // GET /api/verify → 验证登录状态
    if (path === '/api/verify' && method === 'GET') {
      return handleVerify(request, env);
    }

    // GET /api/users → 用户列表（管理员）
    if (path === '/api/users' && method === 'GET') {
      return handleUsersList(request, env);
    }

    // POST /api/users → 创建用户（管理员）
    if (path === '/api/users' && method === 'POST') {
      return handleUserCreate(request, env);
    }

    // DELETE /api/users/{name} → 删除用户（管理员）
    const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && method === 'DELETE') {
      const targetUsername = decodeURIComponent(userMatch[1]);
      return handleUserDelete(request, env, targetUsername);
    }

    // GET/POST /api/repos → 仓库列表/创建（需认证）
    if (path === '/api/repos' && (method === 'GET' || method === 'POST')) {
      const { auth, error } = await checkAuth(request, env);
      if (error) return error;
      return handleReposRequest(request, env, auth.username);
    }

    // GET /api/repos/{id}/status → 仓库状态（需认证）
    // 必须在 /api/repos/{id} 之前匹配
    const repoStatusMatch = path.match(/^\/api\/repos\/[^/]+\/status$/);
    if (repoStatusMatch && method === 'GET') {
      const { auth, error } = await checkAuth(request, env);
      if (error) return error;
      const repoId = decodeURIComponent(path.split('/')[3]);
      return handleRepoStatusRequest(request, env, auth.username, repoId);
    }

    // PUT /api/repos/{id} → 更新仓库（需认证）
    const repoIdMatch = path.match(/^\/api\/repos\/([^/]+)$/);
    if (repoIdMatch && method === 'PUT') {
      const { auth, error } = await checkAuth(request, env);
      if (error) return error;
      const repoId = decodeURIComponent(repoIdMatch[1]);
      return handleRepoUpdateRequest(request, env, auth.username, repoId);
    }

    // DELETE /api/repos/{id} → 删除仓库（需认证）
    if (repoIdMatch && method === 'DELETE') {
      const { auth, error } = await checkAuth(request, env);
      if (error) return error;
      const repoId = decodeURIComponent(repoIdMatch[1]);
      return handleRepoDeleteRequest(request, env, auth.username, repoId);
    }

    // POST /api/upload → 文件上传（需认证）
    if (path === '/api/upload' && method === 'POST') {
      return handleUpload(request, env, ctx);
    }

    // GET /api/list → 文件列表（需认证）
    if (path === '/api/list' && method === 'GET') {
      return handleList(request, env);
    }

    // DELETE /api/delete/{path} → 删除文件（需认证）
    if (path.startsWith('/api/delete/') && method === 'DELETE') {
      const filePath = decodeURIComponent(path.slice('/api/delete/'.length));
      return handleDelete(request, env, filePath);
    }

    // GET /raw/{path} → 原始文件访问（公开）
    if (path.startsWith('/raw/')) {
      const filePath = decodeURIComponent(path.slice('/raw/'.length));
      return handleRaw(env, ctx, filePath);
    }

    return errorResponse('未找到', 404);
  }
};
