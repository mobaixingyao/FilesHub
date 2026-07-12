/**
 * @file utils.js
 * @module utils
 * @description FilesHub 通用工具函数模块。
 * 提供 MIME 类型映射、文件路径生成、Base64 编码、CORS 响应构建、
 * 路径安全检查、SHA-256 哈希、AES-GCM 加解密等基础能力。
 * 所有加解密均使用 Web Crypto API (crypto.subtle)，兼容 Cloudflare Workers 运行时。
 */

/**
 * MIME 类型映射表，覆盖 50+ 种常见文件类型。
 * @type {Record<string, string>}
 */
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
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  // 视频
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/x-m4v',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.3gp': 'video/3gpp',
  // 音频
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.opus': 'audio/opus',
  // 文档
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.rtf': 'application/rtf',
  // 压缩
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.bz2': 'application/x-bzip2',
  // 代码与数据
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.jsx': 'text/javascript',
  '.tsx': 'text/typescript',
  '.py': 'text/x-python',
  '.java': 'text/x-java-source',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.sh': 'application/x-sh',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'application/toml',
  // 其他
  '.exe': 'application/x-msdownload',
  '.dmg': 'application/x-apple-diskimage',
  '.apk': 'application/vnd.android.package-archive',
  '.ipa': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** 图片扩展名集合（小写，含点） */
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif', '.avif', '.heic'];
/** 视频扩展名集合（小写，含点） */
const VIDEO_EXTS = ['.mp4', '.webm', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.m4v', '.mpeg', '.mpg', '.3gp'];

/** AES-GCM IV 长度（字节） */
const IV_LENGTH = 12;

/**
 * ArrayBuffer 转 base64 字符串。
 * 采用分块处理避免大文件时 btoa 栈溢出。
 * @param {ArrayBuffer} buffer - 待编码的 ArrayBuffer
 * @returns {string} base64 编码字符串
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // 每次处理 0x8000 字节，避免 String.fromCharCode 栈溢出
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * 根据文件名获取 MIME 类型，未匹配时返回 application/octet-stream。
 * @param {string} filename - 文件名
 * @returns {string} MIME 类型
 */
export function getMimeType(filename) {
  if (!filename) return 'application/octet-stream';
  const ext = filename.toLowerCase().match(/\.[^.]+$/);
  if (!ext) return 'application/octet-stream';
  return MIME_TYPES[ext[0]] || 'application/octet-stream';
}

/**
 * 判断文件是否为图片类型。
 * @param {string} filename - 文件名
 * @returns {boolean}
 */
export function isImage(filename) {
  if (!filename) return false;
  const ext = filename.toLowerCase().match(/\.[^.]+$/);
  if (!ext) return false;
  return IMAGE_EXTS.includes(ext[0]);
}

/**
 * 判断文件是否为视频类型。
 * @param {string} filename - 文件名
 * @returns {boolean}
 */
export function isVideo(filename) {
  if (!filename) return false;
  const ext = filename.toLowerCase().match(/\.[^.]+$/);
  if (!ext) return false;
  return VIDEO_EXTS.includes(ext[0]);
}

/**
 * 生成文件存储路径，格式: {customDir或YYYY/MM/DD}/{timestamp}_{filename}。
 * @param {string} filename - 原始文件名
 * @param {string} [customDir] - 自定义目录（若提供则替代日期目录）
 * @returns {string} 生成后的文件路径
 */
export function generateFilePath(filename, customDir) {
  const now = new Date();
  const timestamp = now.getTime();
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  if (customDir) {
    // 自定义目录需做安全处理，去除首尾斜杠与多余空白
    const dir = customDir.replace(/^\/+|\/+$/g, '').trim();
    return dir ? `${dir}/${timestamp}_${safeName}` : `${timestamp}_${safeName}`;
  }
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}/${timestamp}_${safeName}`;
}

/**
 * 格式化文件大小为人类可读字符串。
 * @param {number} bytes - 字节数
 * @returns {string} 如 "1.50 KB"
 */
export function formatBytes(bytes) {
  if (bytes === 0 || bytes == null) return '0 B';
  if (bytes < 0) return '-' + formatBytes(-bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

/**
 * 构建 JSON 响应，附带 CORS 头。
 * @param {object} data - 响应数据
 * @param {number} [status=200] - HTTP 状态码
 * @param {Record<string, string>} [headers={}] - 额外响应头
 * @returns {Response}
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
 * 构建错误 JSON 响应。
 * @param {string} message - 错误信息
 * @param {number} [status=400] - HTTP 状态码
 * @param {object} [extra={}] - 额外字段（如 code, detail）
 * @returns {Response}
 */
export function errorResponse(message, status = 400, extra = {}) {
  return jsonResponse({ success: false, error: message, ...extra }, status);
}

/**
 * 构建 CORS 预检响应（204 No Content）。
 * @returns {Response}
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
 * 检查路径是否安全，防止路径遍历攻击。
 * 禁止包含 ".."、以 "/" 开头、包含 "//"。
 * @param {string} path - 待检查路径
 * @returns {boolean} 安全返回 true
 */
export function isSafePath(path) {
  if (!path || typeof path !== 'string') return false;
  if (path.length === 0 || path.length > 1024) return false;
  if (path.includes('..')) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('//')) return false;
  // 禁止空字节、回车换行等控制字符
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  // 禁止 Windows 绝对路径盘符
  if (/^[a-zA-Z]:/.test(path)) return false;
  return true;
}

/**
 * 对文件路径进行 URL 编码，但保留 "/" 分隔符。
 * @param {string} path - 原始路径
 * @returns {string} 编码后路径
 */
export function encodePath(path) {
  if (!path) return '';
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * 使用 Web Crypto API 计算字符串的 SHA-256 哈希（hex）。
 * @param {string} text - 待哈希文本
 * @returns {Promise<string>} 64 位 hex 字符串
 */
export async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * 使用 SHA-256 派生 AES-256 密钥。
 * @param {string} key - 密钥材料（env.AUTH_TOKEN）
 * @returns {Promise<CryptoKey>} AES-GCM CryptoKey
 */
async function deriveAesKey(key) {
  const keyHash = await sha256(key);
  const keyBytes = new Uint8Array(keyHash.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * AES-GCM 加密 GitHub Token。
 * 将密钥做 SHA-256 得到 AES-256 密钥，随机 12 字节 IV，
 * 加密后返回 base64(IV + ciphertext)。
 * @param {string} token - 明文 token
 * @param {string} key - 加密密钥（env.AUTH_TOKEN）
 * @returns {Promise<string>} base64 编码的 iv+ciphertext
 */
export async function encryptToken(token, key) {
  if (!token) return '';
  if (!key) {
    throw new Error('加密密钥缺失：env.AUTH_TOKEN 未配置');
  }
  const encoder = new TextEncoder();
  const aesKey = await deriveAesKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(token),
  );
  // 拼接 iv + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return arrayBufferToBase64(combined.buffer);
}

/**
 * AES-GCM 解密 token。
 * 从 base64 提取 IV 与密文，解密返回明文。
 * @param {string} encrypted - base64 编码的 iv+ciphertext
 * @param {string} key - 解密密钥（env.AUTH_TOKEN）
 * @returns {Promise<string>} 明文 token，空字符串原样返回
 */
export async function decryptToken(encrypted, key) {
  if (!encrypted) return '';
  if (!key) {
    throw new Error('解密密钥缺失：env.AUTH_TOKEN 未配置');
  }
  const combined = base64ToUint8Array(encrypted);
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const aesKey = await deriveAesKey(key);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Base64 字符串转 Uint8Array。
 * @param {string} base64 - base64 字符串
 * @returns {Uint8Array}
 */
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 生成仓库 ID，格式: repo_{8位随机hex}。
 * @returns {string}
 */
export function generateId() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `repo_${hex}`;
}

/**
 * 生成会话 token，32 字节随机 hex。
 * @returns {string} 64 位 hex 字符串
 */
export function generateSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
