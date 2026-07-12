/**
 * Web 管理界面
 * 提供拖拽上传、文件列表、图片预览、复制链接、删除等功能
 */

export function renderUI(env) {
  const siteTitle = env.SITE_TITLE || 'FilesHub';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${siteTitle} - GitHub 文件床</title>
<style>
  :root {
    --bg: #0d1117;
    --bg-card: #161b22;
    --bg-hover: #1c2128;
    --border: #30363d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --accent: #2f81f7;
    --accent-hover: #388bfd;
    --danger: #f85149;
    --danger-hover: #da3633;
    --success: #3fb950;
    --radius: 8px;
    --shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans CJK SC', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes fadeInUp {
    from { opacity: 0.5; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Header */
  .header {
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    position: sticky;
    top: 0;
    z-index: 100;
    animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 36px; height: 36px;
    background: var(--accent);
    border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: bold;
  }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .stat-badge {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .stat-badge strong { color: var(--text); }
  .auth-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px 12px;
    color: var(--text);
    font-size: 13px;
    width: 200px;
    transition: border-color 0.2s;
  }
  .auth-input:focus { outline: none; border-color: var(--accent); }

  /* Main */
  .main { max-width: 1200px; margin: 0 auto; padding: 24px; }

  /* Upload Zone */
  .upload-zone {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    background: var(--bg-card);
    margin-bottom: 24px;
    animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .upload-zone:hover, .upload-zone.dragging {
    border-color: var(--accent);
    background: var(--bg-hover);
    transform: translateY(-2px);
  }
  .upload-zone .upload-icon { font-size: 48px; margin-bottom: 12px; }
  .upload-zone .upload-text { font-size: 16px; color: var(--text); margin-bottom: 4px; }
  .upload-zone .upload-hint { font-size: 13px; color: var(--text-muted); }
  .upload-zone .upload-progress {
    display: none;
    margin-top: 16px;
    text-align: left;
  }
  .upload-zone.uploading .upload-progress { display: block; }
  .upload-zone.uploading .upload-icon,
  .upload-zone.uploading .upload-text,
  .upload-zone.uploading .upload-hint { display: none; }
  .progress-bar {
    height: 6px;
    background: var(--bg);
    border-radius: 3px;
    overflow: hidden;
    margin-top: 8px;
  }
  .progress-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .upload-status {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 8px;
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
    animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .search-box {
    flex: 1;
    min-width: 200px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 14px;
    color: var(--text);
    font-size: 14px;
    transition: border-color 0.2s;
  }
  .search-box:focus { outline: none; border-color: var(--accent); }
  .btn {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 16px;
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn:hover { background: var(--bg-hover); border-color: var(--accent); }
  .btn-danger { color: var(--danger); }
  .btn-danger:hover { background: rgba(248,81,73,0.1); border-color: var(--danger); }
  .btn-icon {
    width: 32px; height: 32px;
    padding: 0;
    justify-content: center;
  }

  /* File Grid */
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }
  .file-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .file-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: var(--shadow);
  }
  .file-thumb {
    width: 100%;
    height: 140px;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: pointer;
    position: relative;
  }
  .file-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .file-thumb .file-icon {
    font-size: 48px;
    opacity: 0.6;
  }
  .file-info {
    padding: 10px 12px;
  }
  .file-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }
  .file-meta {
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .file-actions {
    display: flex;
    gap: 4px;
    padding: 0 12px 10px;
  }
  .file-actions .btn-icon {
    width: 28px; height: 28px;
    font-size: 14px;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 60px 24px;
    color: var(--text-muted);
    animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .empty-state .empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.4; }

  /* Loading */
  .loading {
    text-align: center;
    padding: 40px;
    color: var(--text-muted);
  }
  .spinner {
    display: inline-block;
    width: 32px; height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Toast */
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .toast {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 20px;
    font-size: 14px;
    box-shadow: var(--shadow);
    animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 240px;
    max-width: 400px;
  }
  .toast.success { border-color: var(--success); }
  .toast.error { border-color: var(--danger); }
  .toast.removing { animation: fadeOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(8px); }
  }

  /* Preview Modal */
  .preview-modal {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    z-index: 2000;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .preview-modal.show { display: flex; }
  .preview-content {
    max-width: 90vw;
    max-height: 90vh;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
  }
  .preview-content img,
  .preview-content video {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
  }
  .preview-close {
    position: absolute;
    top: 16px;
    right: 24px;
    background: rgba(0,0,0,0.6);
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2001;
  }
  .preview-info {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.7);
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 13px;
    color: white;
    white-space: nowrap;
  }

  /* Responsive */
  @media (max-width: 600px) {
    .header { padding: 12px; }
    .auth-input { width: 140px; }
    .main { padding: 16px; }
    .file-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .upload-zone { padding: 32px 16px; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="logo">F</div>
    <h1>${siteTitle}</h1>
  </div>
  <div class="header-right">
    <div class="stat-badge" id="stat-count">文件 <strong>0</strong></div>
    <div class="stat-badge" id="stat-size">总计 <strong>0 B</strong></div>
    <input type="password" class="auth-input" id="auth-token" placeholder="AUTH_TOKEN (管理令牌)" />
  </div>
</div>

<div class="main">
  <div class="upload-zone" id="upload-zone">
    <div class="upload-icon">📁</div>
    <div class="upload-text">拖拽文件到此处上传，或点击选择文件</div>
    <div class="upload-hint">支持图片、视频、文档等，单个文件最大 100MB</div>
    <input type="file" id="file-input" multiple style="display:none">
    <div class="upload-progress">
      <div class="upload-status" id="upload-status">准备上传...</div>
      <div class="progress-bar">
        <div class="progress-bar-fill" id="progress-fill" style="width: 0%"></div>
      </div>
    </div>
  </div>

  <div class="toolbar">
    <input type="text" class="search-box" id="search-box" placeholder="搜索文件名...">
    <button class="btn" id="refresh-btn">🔄 刷新</button>
  </div>

  <div id="file-list">
    <div class="loading">
      <div class="spinner"></div>
      <p style="margin-top:12px">加载中...</p>
    </div>
  </div>
</div>

<div class="toast-container" id="toast-container"></div>

<div class="preview-modal" id="preview-modal">
  <button class="preview-close" id="preview-close">×</button>
  <div class="preview-content" id="preview-content"></div>
  <div class="preview-info" id="preview-info"></div>
</div>

<script>
const API_BASE = '';
let allFiles = [];
let filteredFiles = [];

// ---- Auth Token ----
function getAuthToken() {
  return localStorage.getItem('fileshub_token') || document.getElementById('auth-token').value || '';
}
function saveAuthToken() {
  localStorage.setItem('fileshub_token', document.getElementById('auth-token').value);
}
document.getElementById('auth-token').addEventListener('change', saveAuthToken);
document.getElementById('auth-token').value = localStorage.getItem('fileshub_token') || '';

// ---- Toast ----
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ---- Format ----
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function getFileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const icons = {
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️', bmp: '🖼️', avif: '🖼️',
    mp4: '🎬', webm: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬',
    mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵',
    pdf: '📄', doc: '📄', docx: '📄', xls: '📊', xlsx: '📊', ppt: '📊', pptx: '📊',
    zip: '📦', rar: '📦', '7z': '📦', gz: '📦', tar: '📦',
    txt: '📝', md: '📝', json: '📝', js: '📝', ts: '📝', html: '📝', css: '📝',
    py: '🐍', java: '☕', go: '🐹', rs: '🦀',
  };
  return icons[ext] || '📄';
}

function isImageFile(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext);
}
function isVideoFile(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext);
}

// ---- API Calls ----
async function apiCall(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getAuthToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const response = await fetch(API_BASE + path, { ...options, headers });
  const data = await response.json().catch(() => ({ success: false, error: '响应解析失败' }));
  if (!response.ok && !data.success) {
    throw new Error(data.error || 'HTTP ' + response.status);
  }
  return data;
}

// ---- Load Files ----
async function loadFiles() {
  const listEl = document.getElementById('file-list');
  listEl.innerHTML = '<div class="loading"><div class="spinner"></div><p style="margin-top:12px">加载中...</p></div>';
  try {
    const data = await apiCall('/api/list');
    allFiles = data.files || [];
    filteredFiles = [...allFiles];
    updateStats(data.total, data.total_size);
    renderFiles();
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>' + err.message + '</p><p style="margin-top:8px;font-size:13px">请检查 AUTH_TOKEN 是否正确</p></div>';
  }
}

function updateStats(count, size) {
  document.getElementById('stat-count').innerHTML = '文件 <strong>' + count + '</strong>';
  document.getElementById('stat-size').innerHTML = '总计 <strong>' + formatBytes(size) + '</strong>';
}

// ---- Render Files ----
function renderFiles() {
  const listEl = document.getElementById('file-list');
  if (filteredFiles.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div><p>' + (allFiles.length === 0 ? '还没有文件，上传第一个吧' : '没有匹配的文件') + '</p></div>';
    return;
  }

  listEl.innerHTML = '<div class="file-grid">' + filteredFiles.map(function(f) {
    var thumb = '';
    if (f.is_image) {
      thumb = '<img src="' + API_BASE + f.raw_url + '" loading="lazy" alt="' + f.name + '" onerror="this.parentElement.innerHTML=\\'<div class=&quot;file-icon&quot;>🖼️</div>\\'">';
    } else if (f.is_video) {
      thumb = '<div class="file-icon">🎬</div>';
    } else {
      thumb = '<div class="file-icon">' + getFileIcon(f.name) + '</div>';
    }
    return '<div class="file-card" data-path="' + f.path + '" data-name="' + f.name + '" data-is-image="' + f.is_image + '" data-is-video="' + f.is_video + '">' +
      '<div class="file-thumb" onclick="previewFile(this.parentElement)">' + thumb + '</div>' +
      '<div class="file-info">' +
        '<div class="file-name" title="' + f.name + '">' + f.name + '</div>' +
        '<div class="file-meta"><span>' + formatBytes(f.size) + '</span></div>' +
      '</div>' +
      '<div class="file-actions">' +
        '<button class="btn btn-icon" title="复制链接" onclick="copyUrl(\\'' + f.raw_url + '\\', event)">🔗</button>' +
        '<button class="btn btn-icon" title="下载" onclick="downloadFile(\\'' + f.raw_url + '\\', \\'' + f.name + '\\', event)">⬇️</button>' +
        '<button class="btn btn-icon btn-danger" title="删除" onclick="deleteFile(\\'' + f.path + '\\', event)">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

// ---- Search ----
document.getElementById('search-box').addEventListener('input', function(e) {
  var query = e.target.value.toLowerCase();
  filteredFiles = allFiles.filter(function(f) {
    return f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query);
  });
  renderFiles();
});

// ---- Refresh ----
document.getElementById('refresh-btn').addEventListener('click', loadFiles);

// ---- Upload ----
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');

uploadZone.addEventListener('click', function() { fileInput.click(); });
fileInput.addEventListener('change', function(e) { if (e.target.files.length) uploadFiles(e.target.files); });

uploadZone.addEventListener('dragover', function(e) {
  e.preventDefault();
  uploadZone.classList.add('dragging');
});
uploadZone.addEventListener('dragleave', function() { uploadZone.classList.remove('dragging'); });
uploadZone.addEventListener('drop', function(e) {
  e.preventDefault();
  uploadZone.classList.remove('dragging');
  if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});

async function uploadFiles(files) {
  uploadZone.classList.add('uploading');
  var statusEl = document.getElementById('upload-status');
  var progressEl = document.getElementById('progress-fill');
  var total = files.length;
  var done = 0;

  var formData = new FormData();
  for (var i = 0; i < files.length; i++) {
    formData.append('file', files[i]);
  }

  statusEl.textContent = '正在上传 ' + total + ' 个文件...';
  progressEl.style.width = '0%';

  try {
    var token = getAuthToken();
    var headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var response = await fetch(API_BASE + '/api/upload', {
      method: 'POST',
      headers: headers,
      body: formData,
    });
    var data = await response.json();

    if (data.files && data.files.length > 0) {
      done = data.files.length;
      progressEl.style.width = '100%';
      statusEl.textContent = '上传完成: ' + done + ' 个成功' + (data.errors ? ', ' + data.errors.length + ' 个失败' : '');
      showToast('上传成功 ' + done + ' 个文件', 'success');
      if (data.errors && data.errors.length > 0) {
        data.errors.forEach(function(e) { showToast(e.name + ': ' + e.error, 'error'); });
      }
      setTimeout(function() {
        uploadZone.classList.remove('uploading');
        loadFiles();
      }, 1500);
    } else {
      throw new Error(data.error || '上传失败');
    }
  } catch (err) {
    statusEl.textContent = '上传失败: ' + err.message;
    showToast('上传失败: ' + err.message, 'error');
    setTimeout(function() { uploadZone.classList.remove('uploading'); }, 2000);
  }
  fileInput.value = '';
}

// ---- Copy URL ----
function copyUrl(rawUrl, event) {
  if (event) event.stopPropagation();
  var fullUrl = window.location.origin + rawUrl;
  navigator.clipboard.writeText(fullUrl).then(function() {
    showToast('已复制链接: ' + fullUrl, 'success');
  }).catch(function() {
    showToast('复制失败，请手动复制', 'error');
  });
}

// ---- Download ----
function downloadFile(rawUrl, name, event) {
  if (event) event.stopPropagation();
  var a = document.createElement('a');
  a.href = API_BASE + rawUrl;
  a.download = name;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---- Delete ----
async function deleteFile(path, event) {
  if (event) event.stopPropagation();
  if (!confirm('确定删除文件: ' + path.split('/').pop() + ' ?')) return;
  try {
    await apiCall('/api/delete/' + encodeURIComponent(path), { method: 'DELETE' });
    showToast('已删除', 'success');
    loadFiles();
  } catch (err) {
    showToast('删除失败: ' + err.message, 'error');
  }
}

// ---- Preview ----
function previewFile(card) {
  var path = card.dataset.path;
  var name = card.dataset.name;
  var isImage = card.dataset.isImage === 'true';
  var isVideo = card.dataset.isVideo === 'true';
  var modal = document.getElementById('preview-modal');
  var content = document.getElementById('preview-content');
  var info = document.getElementById('preview-info');

  if (isImage) {
    content.innerHTML = '<img src="' + API_BASE + '/raw/' + path + '" alt="' + name + '">';
  } else if (isVideo) {
    content.innerHTML = '<video src="' + API_BASE + '/raw/' + path + '" controls autoplay></video>';
  } else {
    window.open(API_BASE + '/raw/' + path, '_blank');
    return;
  }
  info.textContent = name;
  modal.classList.add('show');
}

document.getElementById('preview-close').addEventListener('click', function() {
  var modal = document.getElementById('preview-modal');
  modal.classList.remove('show');
  document.getElementById('preview-content').innerHTML = '';
});
document.getElementById('preview-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    this.classList.remove('show');
    document.getElementById('preview-content').innerHTML = '';
  }
});

// ---- Init ----
loadFiles();
</script>

</body>
</html>`;
}
