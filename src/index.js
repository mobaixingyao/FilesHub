/**
 * FilesHub - Cloudflare Workers 主入口
 * 基于 GitHub 私有仓库的文件床代理服务
 *
 * 路由设计:
 *   GET  /                  → Web 管理界面
 *   GET  /api/health        → 健康检查
 *   POST /api/upload        → 上传文件（需认证）
 *   GET  /api/list          → 列出文件（可配置是否公开）
 *   GET  /api/list?path=    → 列出指定目录
 *   GET  /api/info/*        → 获取文件信息（需认证）
 *   DELETE /api/delete/*    → 删除文件（需认证）
 *   GET  /raw/*             → 下载文件（公开，CDN 缓存）
 *   OPTIONS *               → CORS 预检
 */

import {
  uploadFile,
  downloadFile,
  deleteFile,
  listFiles,
  listAllFiles,
  getFileInfo,
  getRepoInfo,
  GitHubApiError,
} from './github.js';

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
} from './utils.js';

import { renderUI } from './ui.js';

// ============================================================
// 认证中间件
// ============================================================

/**
 * 验证请求是否携带有效的认证令牌
 * @param {Request} request
 * @param {object} env
 * @returns {boolean} 是否认证通过
 */
function checkAuth(request, env) {
  if (!env.AUTH_TOKEN) return true; // 未设置 AUTH_TOKEN 则不启用认证
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === env.AUTH_TOKEN;
}

/**
 * 从请求中提取认证令牌（用于 API 客户端）
 * 支持 Header 和 Query 参数两种方式
 */
function extractToken(request, url) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader) return authHeader.replace(/^Bearer\s+/i, '');
  return url.searchParams.get('token') || '';
}

// ============================================================
// 路由处理器
// ============================================================

/**
 * 验证 AUTH_TOKEN 是否正确（专供登录页使用）
 * 只校验令牌，不调用 GitHub API
 */
function handleVerify(request, env) {
  if (!env.AUTH_TOKEN) {
    // 未设置 AUTH_TOKEN，任何人都能访问
    return jsonResponse({ success: true, message: '未设置 AUTH_TOKEN，免认证模式' });
  }
  if (!checkAuth(request, env)) {
    return errorResponse('令牌无效', 401);
  }
  return jsonResponse({ success: true, message: '认证成功' });
}

/**
 * 健康检查（需认证，防止未授权探测）
 */
async function handleHealth(request, env) {
  try {
    const repoInfo = await getRepoInfo(env);
    return jsonResponse({
      success: true,
      status: 'ok',
      site_title: env.SITE_TITLE || 'FilesHub',
      repo: repoInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      status: 'error',
      error: err.message,
      hint: '请检查 GITHUB_TOKEN、GITHUB_OWNER、GITHUB_REPO 配置是否正确',
    }, 500);
  }
}

/**
 * 上传文件
 * 支持 multipart/form-data（单/多文件）和 raw body（单文件）
 */
async function handleUpload(request, env) {
  if (!checkAuth(request, env)) {
    return errorResponse('认证失败：无效的 AUTH_TOKEN', 401);
  }

  const contentType = request.headers.get('Content-Type') || '';
  const results = [];
  const errors = [];

  try {
    if (contentType.includes('multipart/form-data')) {
      // multipart 表单上传
      const formData = await request.formData();
      const files = formData.getAll('file');
      const customDir = formData.get('path') || formData.get('dir') || '';
      const customName = formData.get('name') || '';

      if (files.length === 0) {
        return errorResponse('未找到上传文件，请使用 file 字段上传', 400);
      }

      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer();
          let filePath;
          if (customName && files.length === 1) {
            // 单文件 + 自定义名称
            const dir = customDir ? customDir.replace(/^\/|\/$/g, '') : '';
            filePath = dir ? `${dir}/${customName}` : customName;
          } else {
            filePath = generateFilePath(file.name, customDir);
          }

          const result = await uploadFile(env, buffer, filePath);
          results.push({
            name: file.name,
            path: result.path,
            sha: result.sha,
            size: result.size || file.size,
            size_formatted: formatBytes(result.size || file.size),
            raw_url: `/raw/${result.path}`,
            is_image: isImage(file.name),
            is_video: isVideo(file.name),
          });
        } catch (err) {
          errors.push({ name: file.name, error: err.message });
        }
      }
    } else {
      // raw body 上传（单文件）
      const buffer = await request.arrayBuffer();
      const filename = request.headers.get('X-File-Name')
        || `upload_${Date.now()}`;
      const customPath = request.headers.get('X-File-Path') || '';
      const filePath = customPath
        ? customPath
        : generateFilePath(filename);

      if (!isSafePath(filePath)) {
        return errorResponse(`不安全的文件路径: ${filePath}`, 400);
      }

      const result = await uploadFile(env, buffer, filePath);
      results.push({
        name: filename,
        path: result.path,
        sha: result.sha,
        size: result.size || buffer.byteLength,
        size_formatted: formatBytes(result.size || buffer.byteLength),
        raw_url: `/raw/${result.path}`,
        is_image: isImage(filename),
        is_video: isVideo(filename),
      });
    }

    return jsonResponse({
      success: errors.length === 0,
      message: `上传完成: ${results.length} 个成功, ${errors.length} 个失败`,
      files: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('[Upload Error]', err);
    return errorResponse(
      err instanceof GitHubApiError ? `GitHub API 错误: ${err.message}` : `上传失败: ${err.message}`,
      err.status || 500,
      { detail: err.detail || undefined },
    );
  }
}

/**
 * 列出文件
 */
async function handleList(request, env, url) {
  // 检查是否需要认证
  const isPublic = env.PUBLIC_LIST === 'true';
  if (!isPublic && !checkAuth(request, env)) {
    return errorResponse('认证失败：列出文件需要 AUTH_TOKEN', 401);
  }

  const path = url.searchParams.get('path') || '';
  const recursive = url.searchParams.get('recursive') !== 'false'; // 默认递归

  try {
    const files = recursive
      ? await listAllFiles(env, path)
      : await listFiles(env, path);

    // 过滤只返回文件（排除目录）
    const fileList = files
      .filter((f) => f.type === 'file')
      .map((f) => ({
        name: f.name,
        path: f.path,
        size: f.size,
        size_formatted: formatBytes(f.size),
        sha: f.sha,
        raw_url: `/raw/${f.path}`,
        is_image: isImage(f.name),
        is_video: isVideo(f.name),
      }));

    const totalSize = fileList.reduce((sum, f) => sum + (f.size || 0), 0);

    return jsonResponse({
      success: true,
      total: fileList.length,
      total_size: totalSize,
      total_size_formatted: formatBytes(totalSize),
      files: fileList,
    });
  } catch (err) {
    console.error('[List Error]', err);
    return errorResponse(
      err instanceof GitHubApiError ? `GitHub API 错误: ${err.message}` : `列出文件失败: ${err.message}`,
      err.status || 500,
    );
  }
}

/**
 * 获取文件信息
 */
async function handleInfo(request, env, filePath) {
  if (!checkAuth(request, env)) {
    return errorResponse('认证失败：需要 AUTH_TOKEN', 401);
  }

  try {
    const info = await getFileInfo(env, filePath);
    return jsonResponse({
      success: true,
      file: {
        ...info,
        size_formatted: formatBytes(info.size),
        raw_url: `/raw/${info.path}`,
        is_image: isImage(info.name),
        is_video: isVideo(info.name),
      },
    });
  } catch (err) {
    return errorResponse(
      err instanceof GitHubApiError ? `GitHub API 错误: ${err.message}` : `获取信息失败: ${err.message}`,
      err.status || 500,
    );
  }
}

/**
 * 删除文件
 */
async function handleDelete(request, env, filePath) {
  if (!checkAuth(request, env)) {
    return errorResponse('认证失败：删除需要 AUTH_TOKEN', 401);
  }

  try {
    const result = await deleteFile(env, filePath);
    return jsonResponse({
      success: true,
      message: `已删除: ${filePath}`,
      ...result,
    });
  } catch (err) {
    console.error('[Delete Error]', err);
    return errorResponse(
      err instanceof GitHubApiError ? `GitHub API 错误: ${err.message}` : `删除失败: ${err.message}`,
      err.status || 500,
      { detail: err.detail || undefined },
    );
  }
}

/**
 * 下载/访问文件（公开访问，带 CDN 缓存）
 */
async function handleDownload(request, env, filePath, ctx) {
  if (!isSafePath(filePath)) {
    return errorResponse(`不安全的文件路径: ${filePath}`, 400);
  }

  // 1. 检查 Cloudflare 边缘缓存
  const cache = caches.default;
  const cacheKey = new Request(`https://fileshub.cache/${filePath}`, request);
  const cached = await cache.match(cacheKey);
  if (cached) {
    // 返回缓存内容
    const headers = new Headers(cached.headers);
    headers.set('X-Cache', 'HIT');
    return new Response(cached.body, { status: cached.status, headers });
  }

  // 2. 从 GitHub 获取文件
  let ghResponse;
  try {
    ghResponse = await downloadFile(env, filePath);
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) {
      return errorResponse('文件不存在', 404);
    }
    return errorResponse(
      err instanceof GitHubApiError ? `GitHub API 错误: ${err.message}` : `下载失败: ${err.message}`,
      err.status || 500,
    );
  }

  // 3. 构建响应（设置正确的 Content-Type 和缓存头）
  const mimeType = getMimeType(filePath);
  const headers = new Headers();
  headers.set('Content-Type', mimeType);
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=2592000');
  headers.set('X-Cache', 'MISS');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

  // 对于图片/视频等可内联显示的文件，设置 inline
  // 对于其他文件，设置 attachment 触发下载
  if (isImage(filePath) || isVideo(filePath)) {
    headers.set('Content-Disposition', `inline; filename="${filePath.split('/').pop()}"`);
  } else {
    headers.set('Content-Disposition', `attachment; filename="${filePath.split('/').pop()}"`);
  }

  // 复制 Content-Length
  const contentLength = ghResponse.headers.get('Content-Length');
  if (contentLength) {
    headers.set('Content-Length', contentLength);
  }

  const response = new Response(ghResponse.body, {
    status: ghResponse.status,
    headers,
  });

  // 4. 写入边缘缓存（仅缓存成功响应）
  if (response.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

// ============================================================
// 主请求处理器
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // CORS 预检
    if (method === 'OPTIONS') {
      return corsResponse();
    }

    try {
      // ---- 路由匹配 ----

      // Web 管理界面
      if (method === 'GET' && (path === '/' || path === '/index.html')) {
        return new Response(renderUI(env), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      // 验证令牌（登录页使用）
      if (method === 'GET' && path === '/api/verify') {
        return handleVerify(request, env);
      }

      // 健康检查（需认证）
      if (method === 'GET' && path === '/api/health') {
        if (!checkAuth(request, env)) {
          return errorResponse('认证失败：需要 AUTH_TOKEN', 401);
        }
        return handleHealth(request, env);
      }

      // 上传文件
      if (method === 'POST' && path === '/api/upload') {
        return handleUpload(request, env);
      }

      // 列出文件
      if (method === 'GET' && path === '/api/list') {
        return handleList(request, env, url);
      }

      // 删除文件
      if (method === 'DELETE' && path.startsWith('/api/delete/')) {
        const filePath = decodeURIComponent(path.replace('/api/delete/', ''));
        return handleDelete(request, env, filePath);
      }

      // 文件信息
      if (method === 'GET' && path.startsWith('/api/info/')) {
        const filePath = decodeURIComponent(path.replace('/api/info/', ''));
        return handleInfo(request, env, filePath);
      }

      // 下载/访问文件（公开）
      if (method === 'GET' && path.startsWith('/raw/')) {
        const filePath = decodeURIComponent(path.replace('/raw/', ''));
        return handleDownload(request, env, filePath, ctx);
      }

      // 404
      return errorResponse(`路径不存在: ${method} ${path}`, 404);
    } catch (err) {
      console.error('[Unhandled Error]', err);
      return errorResponse(`服务器内部错误: ${err.message}`, 500);
    }
  },
};
