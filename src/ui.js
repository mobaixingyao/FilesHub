/**
 * Web 首页 UI
 * 部署到 Cloudflare Workers 后访问根路径 / 显示的页面
 * 需要 AUTH_TOKEN 登录后才能上传文件、获取链接、管理文件
 */

export function renderUI(env) {
  const siteTitle = env.SITE_TITLE || 'FilesHub';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${siteTitle} - 文件上传</title>
<style>
  :root {
    --bg: #0d1117;
    --bg-card: #161b22;
    --bg-hover: #1c2128;
    --bg-input: #0d1117;
    --border: #30363d;
    --border-focus: #2f81f7;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --text-dim: #6e7681;
    --accent: #2f81f7;
    --accent-hover: #388bfd;
    --accent-glow: rgba(47, 129, 247, 0.15);
    --danger: #f85149;
    --success: #3fb950;
    --radius: 8px;
    --radius-lg: 12px;
    --shadow: 0 2px 8px rgba(0,0,0,0.3);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.4);
    --transition: 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans CJK SC', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  /* 动画 */
  @keyframes fadeInUp {
    from { opacity: 0.5; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    75% { transform: translateX(6px); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(8px); }
  }

  /* ===== 登录门控 ===== */
  .login-overlay {
    position: fixed; inset: 0;
    background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; padding: 24px;
  }
  .login-overlay.hidden { display: none; }
  .login-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 40px 36px;
    width: 100%; max-width: 400px;
    box-shadow: var(--shadow-lg);
    animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .login-logo {
    width: 56px; height: 56px;
    background: var(--accent);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px; font-weight: bold;
    margin: 0 auto 20px;
    box-shadow: 0 0 30px var(--accent-glow);
  }
  .login-card h2 { text-align: center; font-size: 22px; font-weight: 600; margin-bottom: 6px; }
  .login-card .subtitle { text-align: center; font-size: 14px; color: var(--text-muted); margin-bottom: 28px; }
  .form-group { margin-bottom: 20px; }
  .form-group label { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px; font-weight: 500; }
  .form-group input {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 14px;
    color: var(--text);
    font-size: 14px;
    transition: border-color var(--transition);
  }
  .form-group input:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--accent-glow); }
  .form-group input.error { border-color: var(--danger); animation: shake 0.4s ease; }
  .login-btn {
    width: 100%; background: var(--accent); border: none;
    border-radius: var(--radius); padding: 11px;
    color: white; font-size: 15px; font-weight: 600;
    cursor: pointer; transition: all var(--transition); margin-top: 4px;
  }
  .login-btn:hover { background: var(--accent-hover); }
  .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .login-error { color: var(--danger); font-size: 13px; text-align: center; margin-top: 16px; min-height: 18px; }
  .login-hint { text-align: center; font-size: 12px; color: var(--text-dim); margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); }

  /* ===== 主界面 ===== */
  #app { display: none; }
  .header {
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    padding: 14px 24px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
    position: sticky; top: 0; z-index: 100;
  }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 36px; height: 36px;
    background: var(--accent); border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: bold;
  }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .stat-badge {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 20px; padding: 4px 12px;
    font-size: 13px; color: var(--text-muted);
  }
  .stat-badge strong { color: var(--text); }
  .logout-btn {
    background: transparent; border: 1px solid var(--border);
    border-radius: var(--radius); padding: 6px 14px;
    color: var(--text-muted); font-size: 13px;
    cursor: pointer; transition: all var(--transition);
  }
  .logout-btn:hover { border-color: var(--danger); color: var(--danger); }

  .main { max-width: 900px; margin: 0 auto; padding: 24px; }

  /* 上传区 */
  .upload-zone {
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);
    padding: 48px 24px;
    text-align: center; cursor: pointer;
    transition: all var(--transition);
    background: var(--bg-card);
    margin-bottom: 24px;
    animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .upload-zone:hover, .upload-zone.dragging {
    border-color: var(--accent); background: var(--bg-hover);
    transform: translateY(-2px);
  }
  .upload-icon { font-size: 56px; margin-bottom: 12px; }
  .upload-text { font-size: 17px; margin-bottom: 4px; }
  .upload-hint { font-size: 13px; color: var(--text-muted); }
  .upload-progress { display: none; margin-top: 16px; text-align: left; }
  .upload-zone.uploading .upload-progress { display: block; }
  .upload-zone.uploading .upload-icon,
  .upload-zone.uploading .upload-text,
  .upload-zone.uploading .upload-hint { display: none; }
  .progress-bar { height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden; margin-top: 8px; }
  .progress-bar-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
  .upload-status { font-size: 13px; color: var(--text-muted); margin-top: 8px; }

  /* 上传结果 */
  .upload-results { margin-bottom: 24px; }
  .result-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 3px solid var(--success);
    border-radius: var(--radius);
    padding: 14px 16px;
    margin-bottom: 10px;
    display: flex; align-items: center; gap: 12px;
    animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .result-card.error { border-left-color: var(--danger); }
  .result-thumb {
    width: 48px; height: 48px;
    border-radius: var(--radius);
    background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; flex-shrink: 0;
    font-size: 24px;
  }
  .result-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .result-info { flex: 1; min-width: 0; }
  .result-name {
    font-size: 14px; font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-bottom: 4px;
  }
  .result-link-row { display: flex; align-items: center; gap: 8px; }
  .result-link {
    flex: 1; min-width: 0;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px; color: var(--accent);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-family: 'SF Mono', 'Consolas', monospace;
  }
  .copy-btn {
    background: var(--accent); border: none;
    border-radius: 6px; padding: 5px 14px;
    color: white; font-size: 12px; font-weight: 500;
    cursor: pointer; transition: all var(--transition);
    white-space: nowrap; flex-shrink: 0;
  }
  .copy-btn:hover { background: var(--accent-hover); }
  .copy-btn.copied { background: var(--success); }

  /* 工具栏 + 文件列表 */
  .toolbar {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 16px; flex-wrap: wrap;
  }
  .search-box {
    flex: 1; min-width: 200px;
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 8px 14px;
    color: var(--text); font-size: 14px;
    transition: border-color var(--transition);
  }
  .search-box:focus { outline: none; border-color: var(--accent); }
  .btn {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 8px 16px;
    color: var(--text); font-size: 14px;
    cursor: pointer; transition: all var(--transition);
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:hover { background: var(--bg-hover); border-color: var(--accent); }
  .btn-danger { color: var(--danger); }
  .btn-danger:hover { background: rgba(248,81,73,0.1); border-color: var(--danger); }
  .btn-icon { width: 30px; height: 30px; padding: 0; justify-content: center; font-size: 14px; }

  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 14px;
  }
  .file-card {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
    transition: all var(--transition);
    animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .file-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow); }
  .file-thumb {
    width: 100%; height: 130px;
    background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; cursor: pointer; position: relative;
  }
  .file-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .file-thumb .file-icon { font-size: 44px; opacity: 0.6; }
  .file-info { padding: 10px 12px; }
  .file-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
  .file-meta { font-size: 12px; color: var(--text-muted); }
  .file-actions { display: flex; gap: 4px; padding: 0 12px 10px; }

  .empty-state { text-align: center; padding: 60px 24px; color: var(--text-muted); }
  .empty-state .empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.4; }
  .loading { text-align: center; padding: 40px; color: var(--text-muted); }
  .spinner {
    display: inline-block; width: 32px; height: 32px;
    border: 3px solid var(--border); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }

  /* Toast */
  .toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
  .toast {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 12px 20px;
    font-size: 14px; box-shadow: var(--shadow);
    animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    display: flex; align-items: center; gap: 8px;
    min-width: 240px; max-width: 400px;
  }
  .toast.success { border-color: var(--success); }
  .toast.error { border-color: var(--danger); }
  .toast.removing { animation: fadeOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }

  /* 预览弹窗 */
  .preview-modal {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.85); z-index: 2000;
    align-items: center; justify-content: center; padding: 24px;
  }
  .preview-modal.show { display: flex; }
  .preview-content { max-width: 90vw; max-height: 90vh; border-radius: var(--radius-lg); overflow: hidden; position: relative; }
  .preview-content img, .preview-content video { max-width: 90vw; max-height: 90vh; object-fit: contain; }
  .preview-close {
    position: absolute; top: 16px; right: 24px;
    background: rgba(0,0,0,0.6); border: none; color: white;
    font-size: 24px; cursor: pointer; width: 40px; height: 40px;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    z-index: 2001;
  }
  .preview-info {
    position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 20px;
    font-size: 13px; color: white; white-space: nowrap;
  }

  .section-title {
    font-size: 15px; font-weight: 600; color: var(--text-muted);
    margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
  }
  .section-title .count { font-size: 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 1px 8px; }

  @media (max-width: 600px) {
    .header { padding: 12px; }
    .main { padding: 16px; }
    .file-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .upload-zone { padding: 32px 16px; }
    .result-link-row { flex-direction: column; align-items: stretch; }
  }
</style>
</head>
<body>

<!-- ===== 登录门控 ===== -->
<div class="login-overlay" id="login-overlay">
  <div class="login-card">
    <div class="login-logo">F</div>
    <h2>${siteTitle}</h2>
    <p class="subtitle">输入访问令牌以继续</p>
    <form id="login-form" autocomplete="off">
      <div class="form-group">
        <label for="login-token">访问令牌 (AUTH_TOKEN)</label>
        <input type="password" id="login-token" placeholder="输入你的 AUTH_TOKEN" required>
      </div>
      <button type="submit" class="login-btn" id="login-btn">验证并登录</button>
      <div class="login-error" id="login-error"></div>
    </form>
    <div class="login-hint">令牌保存在当前会话中，关闭浏览器后自动清除</div>
  </div>
</div>

<!-- ===== 主界面 ===== -->
<div id="app">
  <div class="header">
    <div class="header-left">
      <div class="logo">F</div>
      <h1>${siteTitle}</h1>
    </div>
    <div class="header-right">
      <div class="stat-badge" id="stat-count">文件 <strong>0</strong></div>
      <div class="stat-badge" id="stat-size">总计 <strong>0 B</strong></div>
      <button class="logout-btn" id="logout-btn">退出</button>
    </div>
  </div>

  <div class="main">
    <!-- 上传区 -->
    <div class="upload-zone" id="upload-zone">
      <div class="upload-icon">📁</div>
      <div class="upload-text">拖拽文件到此处上传，或点击选择文件</div>
      <div class="upload-hint">支持图片、视频、文档等，单个文件最大 100MB</div>
      <input type="file" id="file-input" multiple style="display:none">
      <div class="upload-progress">
        <div class="upload-status" id="upload-status">准备上传...</div>
        <div class="progress-bar"><div class="progress-bar-fill" id="progress-fill" style="width:0%"></div></div>
      </div>
    </div>

    <!-- 上传结果 -->
    <div class="upload-results" id="upload-results"></div>

    <!-- 文件列表 -->
    <div class="section-title">
      已上传文件 <span class="count" id="list-count">0</span>
    </div>
    <div class="toolbar">
      <input type="text" class="search-box" id="search-box" placeholder="搜索文件名...">
      <button class="btn" id="refresh-btn">刷新</button>
    </div>
    <div id="file-list">
      <div class="loading"><div class="spinner"></div><p style="margin-top:12px">加载中...</p></div>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast-container" id="toast-container"></div>

<!-- 预览弹窗 -->
<div class="preview-modal" id="preview-modal">
  <button class="preview-close" id="preview-close">×</button>
  <div class="preview-content" id="preview-content"></div>
  <div class="preview-info" id="preview-info"></div>
</div>

<script>
var AUTH_TOKEN = '';
var allFiles = [];
var filteredFiles = [];

// ===== 登录 =====
function checkSession() {
  var saved = sessionStorage.getItem('fileshub_token');
  if (saved) {
    AUTH_TOKEN = saved;
    validateToken(saved, true);
  }
}

async function validateToken(token, silent) {
  var btn = document.getElementById('login-btn');
  var errEl = document.getElementById('login-error');
  if (!silent) { btn.disabled = true; btn.textContent = '验证中...'; }
  errEl.textContent = '';
  try {
    var resp = await fetch('/api/verify', { headers: { 'Authorization': 'Bearer ' + token } });
    if (resp.status === 401) throw new Error('令牌无效');
    if (!resp.ok) throw new Error('服务异常: HTTP ' + resp.status);
    var data = await resp.json();
    if (!data.success) throw new Error(data.error || '验证失败');
    AUTH_TOKEN = token;
    sessionStorage.setItem('fileshub_token', token);
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app').style.display = 'block';
    showToast('登录成功', 'success');
    loadFiles();
  } catch (err) {
    if (!silent) {
      errEl.textContent = err.message + '，请检查 AUTH_TOKEN';
      var inp = document.getElementById('login-token');
      inp.classList.add('error');
      setTimeout(function() { inp.classList.remove('error'); }, 500);
    } else {
      sessionStorage.removeItem('fileshub_token');
    }
  } finally {
    if (!silent) { btn.disabled = false; btn.textContent = '验证并登录'; }
  }
}

document.getElementById('login-form').addEventListener('submit', function(e) {
  e.preventDefault();
  var token = document.getElementById('login-token').value.trim();
  if (token) validateToken(token, false);
});

document.getElementById('logout-btn').addEventListener('click', function() {
  sessionStorage.removeItem('fileshub_token');
  AUTH_TOKEN = '';
  allFiles = []; filteredFiles = [];
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-overlay').classList.remove('hidden');
  document.getElementById('login-token').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('upload-results').innerHTML = '';
});

// ===== Toast =====
function showToast(msg, type) {
  type = type || 'info';
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  var icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  t.innerHTML = '<span>' + icon + '</span><span>' + msg + '</span>';
  c.appendChild(t);
  setTimeout(function() { t.classList.add('removing'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

// ===== 工具函数 =====
function formatBytes(b) {
  if (!b) return '0 B';
  var u = ['B','KB','MB','GB','TB'];
  var i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}
function getFileIcon(name) {
  var ext = (name.split('.').pop() || '').toLowerCase();
  var icons = {jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️',svg:'🖼️',bmp:'🖼️',avif:'🖼️',
    mp4:'🎬',webm:'🎬',avi:'🎬',mov:'🎬',mkv:'🎬',mp3:'🎵',wav:'🎵',ogg:'🎵',flac:'🎵',
    pdf:'📄',doc:'📄',docx:'📄',xls:'📊',xlsx:'📊',ppt:'📊',pptx:'📊',
    zip:'📦',rar:'📦','7z':'📦',gz:'📦',tar:'📦',
    txt:'📝',md:'📝',json:'📝',js:'📝',ts:'📝',html:'📝',css:'📝',py:'🐍',java:'☕',go:'🐹',rs:'🦀'};
  return icons[ext] || '📄';
}
function isImg(name) {
  return ['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes((name.split('.').pop()||'').toLowerCase());
}
function isVid(name) {
  return ['mp4','webm','avi','mov','mkv'].includes((name.split('.').pop()||'').toLowerCase());
}

// ===== API 调用 =====
async function apiCall(path, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  opts.headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
  var resp = await fetch(path, opts);
  if (resp.status === 401) {
    showToast('令牌已失效，请重新登录', 'error');
    setTimeout(function() { document.getElementById('logout-btn').click(); }, 1500);
    throw new Error('认证失败');
  }
  var data = await resp.json().catch(function() { return { success: false, error: '解析失败' }; });
  if (!resp.ok && !data.success) throw new Error(data.error || 'HTTP ' + resp.status);
  return data;
}

// ===== 上传 =====
var uploadZone = document.getElementById('upload-zone');
var fileInput = document.getElementById('file-input');
uploadZone.addEventListener('click', function() { fileInput.click(); });
fileInput.addEventListener('change', function(e) { if (e.target.files.length) doUpload(e.target.files); });
uploadZone.addEventListener('dragover', function(e) { e.preventDefault(); uploadZone.classList.add('dragging'); });
uploadZone.addEventListener('dragleave', function() { uploadZone.classList.remove('dragging'); });
uploadZone.addEventListener('drop', function(e) {
  e.preventDefault(); uploadZone.classList.remove('dragging');
  if (e.dataTransfer.files.length) doUpload(e.dataTransfer.files);
});

async function doUpload(files) {
  uploadZone.classList.add('uploading');
  var statusEl = document.getElementById('upload-status');
  var progressEl = document.getElementById('progress-fill');
  var resultsEl = document.getElementById('upload-results');

  var formData = new FormData();
  for (var i = 0; i < files.length; i++) formData.append('file', files[i]);

  statusEl.textContent = '正在上传 ' + files.length + ' 个文件...';
  progressEl.style.width = '0%';

  try {
    var resp = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: formData,
    });
    if (resp.status === 401) {
      showToast('令牌已失效，请重新登录', 'error');
      uploadZone.classList.remove('uploading');
      return;
    }
    var data = await resp.json();
    progressEl.style.width = '100%';
    statusEl.textContent = '上传完成: ' + (data.files ? data.files.length : 0) + ' 个成功';

    // 显示上传结果 + 链接
    if (data.files && data.files.length > 0) {
      var html = '';
      for (var j = 0; j < data.files.length; j++) {
        var f = data.files[j];
        var fullUrl = window.location.origin + f.raw_url;
        var thumb = f.is_image
          ? '<img src="' + f.raw_url + '" loading="lazy">'
          : '<span>' + getFileIcon(f.name) + '</span>';
        html += '<div class="result-card">' +
          '<div class="result-thumb">' + thumb + '</div>' +
          '<div class="result-info">' +
            '<div class="result-name" title="' + f.name + '">' + f.name + ' (' + formatBytes(f.size) + ')</div>' +
            '<div class="result-link-row">' +
              '<input class="result-link" value="' + fullUrl + '" readonly onclick="this.select()">' +
              '<button class="copy-btn" onclick="copyText(\\'' + fullUrl + '\\', this)">复制链接</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }
      resultsEl.innerHTML = html + resultsEl.innerHTML;
      showToast('上传成功 ' + data.files.length + ' 个文件', 'success');
    }
    if (data.errors && data.errors.length > 0) {
      data.errors.forEach(function(e) { showToast(e.name + ': ' + e.error, 'error'); });
    }
    setTimeout(function() { uploadZone.classList.remove('uploading'); loadFiles(); }, 1200);
  } catch (err) {
    statusEl.textContent = '上传失败: ' + err.message;
    showToast('上传失败: ' + err.message, 'error');
    setTimeout(function() { uploadZone.classList.remove('uploading'); }, 2000);
  }
  fileInput.value = '';
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    if (btn) { var orig = btn.textContent; btn.textContent = '已复制'; btn.classList.add('copied'); setTimeout(function() { btn.textContent = orig; btn.classList.remove('copied'); }, 2000); }
    showToast('已复制链接', 'success');
  }).catch(function() { showToast('复制失败', 'error'); });
}

// ===== 文件列表 =====
async function loadFiles() {
  var listEl = document.getElementById('file-list');
  listEl.innerHTML = '<div class="loading"><div class="spinner"></div><p style="margin-top:12px">加载中...</p></div>';
  try {
    var data = await apiCall('/api/list');
    allFiles = data.files || [];
    filteredFiles = allFiles.slice();
    document.getElementById('stat-count').innerHTML = '文件 <strong>' + data.total + '</strong>';
    document.getElementById('stat-size').innerHTML = '总计 <strong>' + formatBytes(data.total_size) + '</strong>';
    document.getElementById('list-count').textContent = data.total;
    renderFiles();
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>' + err.message + '</p></div>';
  }
}

function renderFiles() {
  var listEl = document.getElementById('file-list');
  if (filteredFiles.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div><p>' + (allFiles.length === 0 ? '还没有文件，上传第一个吧' : '没有匹配的文件') + '</p></div>';
    return;
  }
  var html = '<div class="file-grid">';
  for (var i = 0; i < filteredFiles.length; i++) {
    var f = filteredFiles[i];
    var thumb = f.is_image
      ? '<img src="' + f.raw_url + '" loading="lazy" alt="' + f.name + '">'
      : '<div class="file-icon">' + getFileIcon(f.name) + '</div>';
    html += '<div class="file-card" style="animation-delay:' + (i * 0.03) + 's" data-path="' + f.path + '" data-name="' + f.name + '" data-is-image="' + f.is_image + '" data-is-video="' + f.is_video + '">' +
      '<div class="file-thumb" onclick="previewFile(this.parentElement)">' + thumb + '</div>' +
      '<div class="file-info"><div class="file-name" title="' + f.name + '">' + f.name + '</div><div class="file-meta">' + formatBytes(f.size) + '</div></div>' +
      '<div class="file-actions">' +
        '<button class="btn btn-icon" title="复制链接" onclick="copyText(window.location.origin+\\'' + f.raw_url + '\\',this)">🔗</button>' +
        '<button class="btn btn-icon" title="下载" onclick="window.open(\\'' + f.raw_url + '\\',\\'_blank\\')">⬇️</button>' +
        '<button class="btn btn-icon btn-danger" title="删除" onclick="delFile(\\'' + f.path + '\\')">🗑️</button>' +
      '</div>' +
    '</div>';
  }
  listEl.innerHTML = html + '</div>';
}

document.getElementById('search-box').addEventListener('input', function(e) {
  var q = e.target.value.toLowerCase();
  filteredFiles = allFiles.filter(function(f) { return f.name.toLowerCase().indexOf(q) !== -1 || f.path.toLowerCase().indexOf(q) !== -1; });
  renderFiles();
});
document.getElementById('refresh-btn').addEventListener('click', loadFiles);

async function delFile(path) {
  if (!confirm('确定删除: ' + path.split('/').pop() + ' ?')) return;
  try {
    await apiCall('/api/delete/' + encodeURIComponent(path), { method: 'DELETE' });
    showToast('已删除', 'success');
    loadFiles();
  } catch (err) { showToast('删除失败: ' + err.message, 'error'); }
}

// ===== 预览 =====
function previewFile(card) {
  var path = card.dataset.path, name = card.dataset.name;
  var isImage = card.dataset.isImage === 'true', isVideo = card.dataset.isVideo === 'true';
  var modal = document.getElementById('preview-modal');
  var content = document.getElementById('preview-content');
  var info = document.getElementById('preview-info');
  if (isImage) content.innerHTML = '<img src="/raw/' + path + '" alt="' + name + '">';
  else if (isVideo) content.innerHTML = '<video src="/raw/' + path + '" controls autoplay></video>';
  else { window.open('/raw/' + path, '_blank'); return; }
  info.textContent = name;
  modal.classList.add('show');
}
document.getElementById('preview-close').addEventListener('click', function() {
  document.getElementById('preview-modal').classList.remove('show');
  document.getElementById('preview-content').innerHTML = '';
});
document.getElementById('preview-modal').addEventListener('click', function(e) {
  if (e.target === this) { this.classList.remove('show'); document.getElementById('preview-content').innerHTML = ''; }
});

// ===== 启动 =====
checkSession();
</script>
</body>
</html>`;
}
