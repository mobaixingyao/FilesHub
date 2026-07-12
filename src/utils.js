// utils.js - 工具函数模块 (ES Module)
// 适用于 Cloudflare Workers 运行环境，使用 Web Crypto API、btoa/atob、TextEncoder/TextDecoder

// ---------------------------------------------------------------------------
// MIME 类型映射表（扩展名以点号为前缀，如 '.jpg'）
// ---------------------------------------------------------------------------
const MIME_TYPES = {
  // 图片
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.raw': 'image/raw',
  // 视频
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.m4v': 'video/x-m4v',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.3gp': 'video/3gpp',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  // 音频
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.opus': 'audio/opus',
  '.aiff': 'audio/aiff',
  // 文档
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  // 文本 / 代码
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  // 压缩包
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  // 电子书
  '.epub': 'application/epub+zip',
  '.mobi': 'application/x-mobipocket-ebook',
};

const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico',
  '.tif', '.tiff', '.heic', '.heif', '.avif', '.raw',
];

const VIDEO_EXTENSIONS = [
  '.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v',
  '.mpg', '.mpeg', '.3gp', '.ts', '.m2ts',
];

// ---------------------------------------------------------------------------
// 内部辅助：base64 解码为 Uint8Array
// ---------------------------------------------------------------------------
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// 从文件名提取小写扩展名（带点号前缀），无扩展名返回空字符串
function getExtension(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : '';
}

// ---------------------------------------------------------------------------
// 导出函数
// ---------------------------------------------------------------------------

/**
 * ArrayBuffer 转 base64 字符串，分块（0x8000 字节）处理以避免调用栈溢出。
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32768
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * 根据文件名返回 MIME 类型，未匹配返回 'application/octet-stream'。
 */
export function getMimeType(filename) {
  const ext = getExtension(filename);
  if (ext && Object.prototype.hasOwnProperty.call(MIME_TYPES, ext)) {
    return MIME_TYPES[ext];
  }
  return 'application/octet-stream';
}

/**
 * 判断文件名是否为图片（按扩展名比对）。
 */
export function isImage(filename) {
  const ext = getExtension(filename);
  return ext ? IMAGE_EXTENSIONS.includes(ext) : false;
}

/**
 * 判断文件名是否为视频（按扩展名比对）。
 */
export function isVideo(filename) {
  const ext = getExtension(filename);
  return ext ? VIDEO_EXTENSIONS.includes(ext) : false;
}

/**
 * 生成存储路径：YYYY/MM/DD/{timestamp}_{sanitized}。
 * 若提供 customDir，则作为前缀目录拼接在日期路径之前。
 */
export function generateFilePath(filename, customDir) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const timestamp = now.getTime();
  // 仅保留字母、数字、点、下划线、连字符，其余替换为下划线
  const sanitized = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${timestamp}_${sanitized}`;
  const datePath = `${year}/${month}/${day}`;
  if (customDir) {
    return `${customDir}/${datePath}/${fileName}`;
  }
  return `${datePath}/${fileName}`;
}

/**
 * 格式化字节数为人类可读字符串，如 "1.50 MB"。
 */
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * 构造 JSON 响应，附带 CORS 头。
 */
export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      ...headers,
    },
  });
}

/**
 * 构造错误 JSON 响应。
 */
export function errorResponse(message, status = 400, extra = {}) {
  return jsonResponse({ success: false, error: message, ...extra }, status);
}

/**
 * 构造 204 CORS 预检响应。
 */
export function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * 校验路径安全性：
 * 禁止包含 ".."、以 "/" 开头、包含 "//"、包含控制字符。
 */
export function isSafePath(path) {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('..')) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('//')) return false;
  if (/[\x00-\x1f\x7f]/.test(path)) return false; // 控制字符
  return true;
}

/**
 * URL 编码路径，保留路径分隔符 "/"。
 */
export function encodePath(path) {
  if (!path) return '';
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * 使用 Web Crypto API 计算字符串的 SHA-256，返回 hex 字符串。
 */
export async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * AES-GCM 加密 token。
 * 用 key 的 SHA-256 派生 AES 密钥，生成随机 12 字节 IV，
 * 返回 base64(iv + ciphertext)。
 */
export async function encryptToken(token, key) {
  const encoder = new TextEncoder();
  // 通过 SHA-256 派生 AES-256 密钥
  const keyDigest = await crypto.subtle.digest('SHA-256', encoder.encode(key));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyDigest,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  // 生成 12 字节随机 IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoder.encode(token),
  );
  // 拼接 iv + ciphertext
  const ivBytes = new Uint8Array(iv);
  const ctBytes = new Uint8Array(ciphertext);
  const combined = new Uint8Array(ivBytes.length + ctBytes.length);
  combined.set(ivBytes, 0);
  combined.set(ctBytes, ivBytes.length);
  return arrayBufferToBase64(combined.buffer);
}

/**
 * AES-GCM 解密：从 base64 解码，提取前 12 字节 IV 与剩余 ciphertext，解密返回原文本。
 */
export async function decryptToken(encrypted, key) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const combined = base64ToUint8Array(encrypted);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  // 派生密钥
  const keyDigest = await crypto.subtle.digest('SHA-256', encoder.encode(key));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyDigest,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext,
  );
  return decoder.decode(decrypted);
}

/**
 * 生成仓库 ID：repo_ + 8 字节随机 hex。
 */
export function generateId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return 'repo_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成会话 token：32 字节随机 hex（64 个字符）。
 */
export function generateSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
