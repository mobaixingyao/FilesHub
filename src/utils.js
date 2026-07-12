/**
 * 工具函数模块
 * 提供 base64 转换、MIME 类型判断、文件路径生成、格式化等辅助功能
 */

/**
 * 将 ArrayBuffer 转换为 base64 字符串
 * 分块处理避免大文件时栈溢出
 * @param {ArrayBuffer} buffer
 * @returns {string} base64 编码字符串
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // 32KB 分块
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * 常见文件扩展名到 MIME 类型的映射
 */
const MIME_TYPES = {
  // 图片
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  avif: 'image/avif', tiff: 'image/tiff',
  // 视频
  mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo',
  mov: 'video/quicktime', mkv: 'video/x-matroska',
  // 音频
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
  aac: 'audio/aac', m4a: 'audio/mp4',
  // 文档
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // 文本/代码
  txt: 'text/plain', md: 'text/markdown', json: 'application/json',
  html: 'text/html', css: 'text/css', js: 'text/javascript',
  ts: 'text/typescript', jsx: 'text/jsx', tsx: 'text/tsx',
  xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml',
  py: 'text/x-python', java: 'text/x-java', c: 'text/x-c',
  cpp: 'text/x-c++', rs: 'text/x-rust', go: 'text/x-go',
  sh: 'application/x-sh', sql: 'application/sql',
  // 压缩
  zip: 'application/zip', rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed', gz: 'application/gzip', tar: 'application/x-tar',
  // 其他
  font: 'font/woff2', woff: 'font/woff', woff2: 'font/woff2',
  ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
};

/**
 * 根据文件名获取 MIME 类型
 * @param {string} filename 文件名
 * @returns {string} MIME 类型
 */
export function getMimeType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * 判断文件是否为图片类型
 * @param {string} filename 文件名
 * @returns {boolean}
 */
export function isImage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext);
}

/**
 * 判断文件是否为视频类型
 * @param {string} filename
 * @returns {boolean}
 */
export function isVideo(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext);
}

/**
 * 生成唯一的文件存储路径
 * 格式: YYYY/MM/DD/{timestamp}_{sanitized_filename}
 * @param {string} filename 原始文件名
 * @param {string} [customDir] 自定义目录前缀
 * @returns {string} 生成的新路径
 */
export function generateFilePath(filename, customDir = '') {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const timestamp = now.getTime();

  // 清理文件名：保留中文、字母、数字、点、连字符、下划线
  const sanitized = filename
    .replace(/[^\w.\u4e00-\u9fff\u3400-\u4dbf-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');

  const dateDir = `${year}/${month}/${day}`;
  const prefix = customDir ? customDir.replace(/^\/|\/$/g, '') : '';

  return prefix
    ? `${prefix}/${dateDir}/${timestamp}_${sanitized}`
    : `${dateDir}/${timestamp}_${sanitized}`;
}

/**
 * 格式化文件大小为人类可读字符串
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的字符串，如 "1.5 MB"
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * 格式化时间戳为本地时间字符串
 * @param {string|number} iso ISO 时间字符串或时间戳
 * @returns {string} 格式化后的时间
 */
export function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

/**
 * 创建 JSON 响应
 * @param {object} data 响应数据
 * @param {number} [status=200] HTTP 状态码
 * @param {object} [headers={}] 额外响应头
 * @returns {Response}
 */
export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...headers,
    },
  });
}

/**
 * 创建错误 JSON 响应
 * @param {string} message 错误信息
 * @param {number} [status=400] HTTP 状态码
 * @param {object} [extra={}] 额外错误详情
 * @returns {Response}
 */
export function errorResponse(message, status = 400, extra = {}) {
  return jsonResponse({ success: false, error: message, ...extra }, status);
}

/**
 * 验证路径安全性，防止路径遍历攻击
 * @param {string} path 文件路径
 * @returns {boolean} 是否安全
 */
export function isSafePath(path) {
  if (!path) return false;
  if (path.includes('..')) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('//')) return false;
  return true;
}

/**
 * 对文件路径进行 URL 编码（保留路径分隔符）
 * @param {string} path 文件路径
 * @returns {string} 编码后的路径
 */
export function encodePath(path) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * CORS 预检响应
 * @returns {Response}
 */
export function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
