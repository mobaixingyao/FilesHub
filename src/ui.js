/**
 * @file ui.js
 * @module ui
 * @description FilesHub Web 管理界面渲染模块。
 *              导出 renderUI(env) 函数，返回完整的 HTML 字串（内嵌 CSS + JS，无外部依赖）。
 *              页面包含 4 个视图：初始化引导、登录、文件管理主页、设置页。
 *
 * 实现说明:
 *   - 整个 HTML 由外层模板字面量返回，仅使用 ${siteTitle} 一处外层插值。
 *   - 内嵌 <script> 中的 JS 全部使用 var 声明与单引号字符串拼接，
 *     不使用内层模板字面量与正则，从而规避反引号/${}/反斜杠转义问题。
 *   - 所有 API 调用在 Header 携带 Authorization: Bearer {session_token}，
 *     401 响应自动清除会话并跳转登录页。
 */

/**
 * 渲染 Web 管理界面 HTML。
 * @param {object} env - Workers 环境变量（读取 env.SITE_TITLE）
 * @returns {string} 完整 HTML 字串
 */
export function renderUI(env) {
  const siteTitle = env && env.SITE_TITLE ? env.SITE_TITLE : 'FilesHub';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${siteTitle}</title>
<style>
:root{
  --bg:#0d1117; --bg-card:#161b22; --bg-hover:#1c2128; --border:#30363d;
  --text:#e6edf3; --text-muted:#8b949e; --accent:#2f81f7; --danger:#f85149; --success:#3fb950;
  --radius:12px; --shadow:0 8px 24px rgba(0,0,0,.35);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans CJK SC',sans-serif;
  background:var(--bg);color:var(--text);line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--accent);text-decoration:none}
input,select,textarea,button{font-family:inherit;font-size:14px;color:var(--text)}
input[type=text],input[type=password],input[type=number],select,textarea{
  width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--border);
  border-radius:8px;outline:none;transition:border-color .2s,box-shadow .2s;
}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(47,129,247,.25)}
label{display:block;font-size:13px;color:var(--text-muted);margin-bottom:6px}
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:9px 16px;border:1px solid var(--border);background:var(--bg-card);
  color:var(--text);border-radius:8px;cursor:pointer;transition:all .2s;font-weight:500;
}
.btn:hover{background:var(--bg-hover);border-color:#4b525b}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.primary:hover{background:#1f6feb}
.btn.danger{color:var(--danger);border-color:rgba(248,81,73,.4)}
.btn.danger:hover{background:rgba(248,81,73,.12)}
.btn.small{padding:6px 10px;font-size:13px}
.btn.block{width:100%}
.btn:disabled{opacity:.5;cursor:not-allowed}
.container{max-width:1100px;margin:0 auto;padding:0 16px}
.view{display:none;min-height:100vh;padding:24px 16px;animation:fadeInUp .6s cubic-bezier(.22,1,.36,1)}
.view.active{display:block}

@keyframes fadeInUp{from{opacity:.5;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;animation:fadeInUp .6s cubic-bezier(.22,1,.36,1)}

/* 通用页面居中 */
.center-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.center-box{width:100%;max-width:440px}

/* logo */
.logo{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700}
.logo .mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--accent),#6e40c9);display:flex;align-items:center;justify-content:center;font-size:20px}

/* setup / login */
.auth-title{font-size:24px;font-weight:700;margin-bottom:4px}
.auth-sub{color:var(--text-muted);font-size:14px;margin-bottom:22px}
.field{margin-bottom:16px}
.field-row{display:flex;gap:12px}
.field-row .field{flex:1}
.checkbox{display:flex;align-items:center;gap:8px;color:var(--text);font-size:14px}
.checkbox input{width:auto}
.divider{height:1px;background:var(--border);margin:18px 0}
.section-label{font-size:13px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
.hint{font-size:12px;color:var(--text-muted);margin-top:6px}

/* header */
.header{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:22px}
.header .logo{font-size:20px}
.header .stats{color:var(--text-muted);font-size:13px;background:var(--bg-card);border:1px solid var(--border);padding:6px 12px;border-radius:20px}
.header .spacer{flex:1}
.header .user-tag{font-size:13px;color:var(--text-muted)}

/* upload */
.drop-zone{
  border:2px dashed var(--border);border-radius:var(--radius);padding:34px 20px;text-align:center;
  cursor:pointer;transition:all .25s;background:var(--bg-card);
}
.drop-zone:hover,.drop-zone.drag{border-color:var(--accent);background:rgba(47,129,247,.06)}
.drop-zone .big-emoji{font-size:34px;margin-bottom:8px}
.drop-zone .dz-text{font-size:15px}
.drop-zone .dz-sub{font-size:12px;color:var(--text-muted);margin-top:4px}
.progress-wrap{margin-top:14px;display:none}
.progress{height:8px;background:var(--bg-hover);border-radius:6px;overflow:hidden}
.progress .fill{height:100%;width:0;background:linear-gradient(90deg,var(--accent),#6e40c9);transition:width .25s}
.results-wrap{margin-top:14px;display:none}
.result-card{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-top:10px;animation:fadeInUp .4s cubic-bezier(.22,1,.36,1)}
.result-card.error{border-color:rgba(248,81,73,.4)}
.result-name{font-weight:600;font-size:14px;margin-bottom:8px;word-break:break-all}
.result-url{display:flex;gap:8px;align-items:center}
.result-input{flex:1;font-family:monospace;font-size:12px;background:var(--bg);padding:7px 10px}
.result-error{color:var(--danger);font-size:13px}

/* search + grid */
.toolbar{display:flex;align-items:center;gap:12px;margin:24px 0 14px}
.toolbar .search{flex:1;max-width:340px}
.toolbar .count{color:var(--text-muted);font-size:13px}
.file-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
.file-card{
  background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);
  padding:12px;display:flex;flex-direction:column;gap:8px;transition:all .2s;animation:fadeInUp .5s cubic-bezier(.22,1,.36,1);
}
.file-card:hover{border-color:#4b525b;transform:translateY(-2px);box-shadow:var(--shadow)}
.thumb{width:100%;height:130px;border-radius:8px;object-fit:cover;background:var(--bg-hover)}
.thumb-icon{width:100%;height:130px;border-radius:8px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;font-size:42px}
.file-name{font-size:13px;font-weight:500;word-break:break-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.file-meta{font-size:12px;color:var(--text-muted)}
.file-actions{display:flex;gap:6px;border-top:1px solid var(--border);padding-top:8px}
.btn-icon{
  width:30px;height:30px;display:flex;align-items:center;justify-content:center;
  background:var(--bg-hover);border:1px solid transparent;border-radius:8px;cursor:pointer;font-size:15px;transition:all .2s;
}
.btn-icon:hover{border-color:var(--border);background:#22262e}
.btn-icon.danger:hover{color:var(--danger)}
.empty{text-align:center;color:var(--text-muted);padding:48px 0;font-size:14px}

/* settings */
.tabs{display:flex;gap:6px;border-bottom:1px solid var(--border);margin-bottom:20px}
.tab{padding:10px 18px;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;transition:all .2s;font-size:14px}
.tab:hover{color:var(--text)}
.tab.active{color:var(--text);border-bottom-color:var(--accent)}
.panel{display:none;animation:fadeInUp .5s cubic-bezier(.22,1,.36,1)}
.panel.active{display:block}
.list-head{display:flex;align-items:center;margin-bottom:14px}
.list-head .spacer{flex:1}
.repo-item,.user-item{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;animation:fadeInUp .4s cubic-bezier(.22,1,.36,1)}
.repo-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.repo-name{font-weight:600;font-size:15px}
.tag{font-size:11px;padding:2px 8px;border-radius:10px;background:var(--bg-hover);color:var(--text-muted)}
.tag-public{background:rgba(63,185,80,.15);color:var(--success)}
.tag-private{background:rgba(248,81,73,.15);color:var(--danger)}
.repo-branch{font-size:12px;color:var(--text-muted);margin-bottom:8px}
.repo-bar{height:8px;background:var(--bg-hover);border-radius:6px;overflow:hidden;margin-bottom:6px}
.repo-bar-fill{height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--success));transition:width .4s}
.repo-status{font-size:12px;color:var(--text-muted);margin-bottom:10px}
.repo-actions,.user-actions{display:flex;gap:8px}
.user-item{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.user-name{font-weight:600;min-width:120px}
.user-role{color:var(--text-muted);font-size:13px}
.user-date{color:var(--text-muted);font-size:12px;flex:1}
.user-table-head{display:flex;gap:12px;flex-wrap:wrap;padding:8px 4px;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border);margin-bottom:6px}

/* modal */
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center;padding:16px;animation:fadeInUp .3s cubic-bezier(.22,1,.36,1)}
.modal.show{display:flex}
.modal-box{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:22px;width:100%;max-width:480px;max-height:90vh;overflow:auto;animation:fadeInUp .4s cubic-bezier(.22,1,.36,1)}
.modal-title{font-size:18px;font-weight:700;margin-bottom:18px}
.modal-close{float:right;cursor:pointer;color:var(--text-muted);font-size:22px;line-height:1;background:none;border:none}
.modal-close:hover{color:var(--text)}
.preview-body{display:flex;align-items:center;justify-content:center;max-width:92vw;max-height:92vh}
.preview-body img{max-width:90vw;max-height:85vh;border-radius:8px;object-fit:contain}
.preview-body video{max-width:90vw;max-height:85vh;border-radius:8px}
.preview-other{text-align:center;color:var(--text)}
.preview-other .big-icon{font-size:64px;margin-bottom:12px}
.preview-other .btn{margin-top:14px}

/* toast */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2000;padding:11px 20px;border-radius:8px;font-size:14px;color:#fff;background:var(--bg-card);border:1px solid var(--border);box-shadow:var(--shadow);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none}
.toast.show{opacity:1;transform:translateX(-50%) translateY(-4px)}
.toast.success{border-color:rgba(63,185,80,.5)}
.toast.error{border-color:rgba(248,81,73,.5)}

/* responsive */
@media (max-width:600px){
  .view{padding:16px 12px}
  .header{gap:8px}
  .header .stats{order:4;width:100%}
  .file-grid{grid-template-columns:repeat(2,1fr);gap:10px}
  .field-row{flex-direction:column;gap:0}
  .toolbar{flex-wrap:wrap}
  .toolbar .search{max-width:none;width:100%;order:-1}
  .modal-box{padding:18px}
  .user-name{min-width:100px}
}
</style>
</head>
<body>

<!-- 视图1: 初始化引导页 -->
<section id="view-setup" class="view">
  <div class="center-wrap">
    <div class="center-box">
      <div class="card">
        <div class="logo" style="margin-bottom:14px"><span class="mark">📦</span> ${siteTitle}</div>
        <div class="auth-title">系统初始化</div>
        <div class="auth-sub">首次使用，请创建管理员账号并配置第一个仓库</div>
        <form id="setup-form">
          <div class="section-label">管理员账号</div>
          <div class="field"><label>管理员用户名</label><input type="text" id="setup-admin-user" autocomplete="username" required></div>
          <div class="field"><label>管理员密码</label><input type="password" id="setup-admin-pass" autocomplete="new-password" required></div>
          <div class="field"><label>站点标题</label><input type="text" id="setup-site-title" value="${siteTitle}"></div>
          <div class="divider"></div>
          <div class="section-label">第一个仓库</div>
          <div class="field-row">
            <div class="field"><label>GitHub 用户名 (owner)</label><input type="text" id="setup-owner" required></div>
            <div class="field"><label>仓库名 (repo)</label><input type="text" id="setup-repo" required></div>
          </div>
          <div class="field-row">
            <div class="field"><label>分支</label><input type="text" id="setup-branch" value="main"></div>
            <div class="field"><label>容量上限 (MB)</label><input type="number" id="setup-capacity" value="1024" min="1"></div>
          </div>
          <div class="field"><label>Token (可空)</label><input type="password" id="setup-token" placeholder="公共仓库可留空"><div class="hint">私有仓库必填；公共仓库留空则读取免认证(写入仍需)</div></div>
          <div class="field"><label class="checkbox"><input type="checkbox" id="setup-public"> 公共仓库</label></div>
          <button type="submit" class="btn primary block">完成初始化</button>
        </form>
      </div>
    </div>
  </div>
</section>

<!-- 视图2: 登录页 -->
<section id="view-login" class="view">
  <div class="center-wrap">
    <div class="center-box">
      <div class="card">
        <div class="logo" style="margin-bottom:14px;justify-content:center"><span class="mark">📦</span> ${siteTitle}</div>
        <div class="auth-title" style="text-align:center">登录</div>
        <div class="auth-sub" style="text-align:center">请输入账号密码进入文件管理</div>
        <form id="login-form">
          <div class="field"><label>用户名</label><input type="text" id="login-username" autocomplete="username" required></div>
          <div class="field"><label>密码</label><input type="password" id="login-password" autocomplete="current-password" required></div>
          <button type="submit" class="btn primary block">登录</button>
        </form>
      </div>
    </div>
  </div>
</section>

<!-- 视图3: 文件管理主页 -->
<section id="view-main" class="view">
  <div class="container">
    <div class="header">
      <div class="logo"><span class="mark">📦</span> ${siteTitle}</div>
      <span class="stats" id="main-stats">0 个文件 / 0 B</span>
      <span class="spacer"></span>
      <span class="user-tag" id="main-user"></span>
      <button class="btn small" id="btn-settings">⚙ 设置</button>
      <button class="btn small danger" id="btn-logout">退出</button>
    </div>

    <div class="card">
      <div class="drop-zone" id="drop-zone">
        <div class="big-emoji">☁️</div>
        <div class="dz-text">拖拽文件到此处，或点击选择文件</div>
        <div class="dz-sub">支持多文件上传，自动选择可用仓库</div>
      </div>
      <input type="file" id="file-input" multiple style="display:none">
      <div class="progress-wrap" id="upload-progress-wrap">
        <div class="progress"><div class="fill" id="upload-progress"></div></div>
      </div>
      <div class="results-wrap" id="upload-results"></div>
    </div>

    <div class="toolbar">
      <input type="text" class="search" id="search-input" placeholder="搜索文件名...">
      <span class="count" id="file-count"></span>
    </div>
    <div class="file-grid" id="file-grid">
      <div class="empty">加载中...</div>
    </div>
  </div>
</section>

<!-- 视图4: 设置页 -->
<section id="view-settings" class="view">
  <div class="container">
    <div class="header">
      <div class="logo"><span class="mark">⚙</span> 设置</div>
      <span class="spacer"></span>
      <button class="btn small" id="btn-back">← 返回</button>
    </div>
    <div class="card">
      <div class="tabs">
        <div class="tab active" id="tab-repos">仓库管理</div>
        <div class="tab" id="tab-users">用户管理</div>
      </div>

      <div class="panel active" id="panel-repos">
        <div class="list-head"><span class="spacer"></span><button class="btn primary small" id="btn-add-repo">+ 添加仓库</button></div>
        <div id="repo-list"></div>
      </div>

      <div class="panel" id="panel-users">
        <div class="user-table-head"><span style="min-width:120px">用户名</span><span style="min-width:80px">角色</span><span>创建时间</span></div>
        <div id="user-list"></div>
        <div class="divider"></div>
        <div class="section-label">添加用户</div>
        <form id="user-form">
          <div class="field-row">
            <div class="field"><label>用户名</label><input type="text" id="user-username" required></div>
            <div class="field"><label>密码</label><input type="password" id="user-password" required></div>
            <div class="field"><label>角色</label><select id="user-role"><option value="user">普通用户</option><option value="admin">管理员</option></select></div>
          </div>
          <button type="submit" class="btn primary">添加用户</button>
        </form>
      </div>
    </div>
  </div>
</section>

<!-- 仓库模态框 -->
<div class="modal" id="modal-repo">
  <div class="modal-box">
    <button class="modal-close" data-close="modal-repo">×</button>
    <div class="modal-title" id="repo-modal-title">添加仓库</div>
    <form id="repo-form">
      <div class="field-row">
        <div class="field"><label>GitHub 用户名 (owner)</label><input type="text" id="repo-owner" required></div>
        <div class="field"><label>仓库名 (repo)</label><input type="text" id="repo-repo" required></div>
      </div>
      <div class="field-row">
        <div class="field"><label>分支</label><input type="text" id="repo-branch" value="main"></div>
        <div class="field"><label>容量上限 (MB)</label><input type="number" id="repo-capacity" value="1024" min="1"></div>
      </div>
      <div class="field"><label>Token</label><input type="password" id="repo-token" placeholder="公共仓库可留空"></div>
      <div class="field-row">
        <div class="field"><label>优先级 (数字越小越优先)</label><input type="number" id="repo-priority" value="1" min="0"></div>
        <div class="field"><label class="checkbox" style="margin-top:30px"><input type="checkbox" id="repo-public"> 公共仓库</label></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button type="submit" class="btn primary">保存</button>
        <button type="button" class="btn" data-close="modal-repo">取消</button>
      </div>
    </form>
  </div>
</div>

<!-- 预览模态框 -->
<div class="modal" id="modal-preview">
  <div class="modal-box" style="background:transparent;border:none;max-width:none;padding:0">
    <button class="modal-close" data-close="modal-preview" style="position:fixed;top:16px;right:20px">×</button>
    <div class="preview-body" id="preview-body"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
(function(){
  'use strict';
  // ===================== 状态 =====================
  var sessionToken = sessionStorage.getItem('session_token') || '';
  var currentUser = { username: '', role: '' };
  var filesCache = [];
  var reposCache = [];
  var editingRepoId = null;

  // ===================== DOM 辅助 =====================
  function $(id){ return document.getElementById(id); }
  function esc(s){
    var div = document.createElement('div');
    div.textContent = (s === null || s === undefined) ? '' : String(s);
    return div.innerHTML;
  }
  function showView(name){
    var views = ['setup','login','main','settings'];
    for (var i = 0; i < views.length; i++){
      var el = $('view-' + views[i]);
      if (el){
        el.classList.remove('active');
        el.style.display = 'none';
      }
    }
    var target = $('view-' + name);
    if (target){ target.style.display = 'block'; target.classList.add('active'); }
    window.scrollTo(0, 0);
  }
  function toast(msg, type){
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.className = 'toast ' + (type || ''); }, 2600);
  }
  function copyText(text, btn){
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ toast('已复制到剪贴板', 'success'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('已复制到剪贴板', 'success'); } catch(e){ toast('复制失败', 'error'); }
      document.body.removeChild(ta);
    }
  }
  function openModal(id){ $(id).classList.add('show'); }
  function closeModal(id){ $(id).classList.remove('show'); }

  // ===================== API =====================
  function authHeaders(extra){
    var h = extra || {};
    if (sessionToken) h['Authorization'] = 'Bearer ' + sessionToken;
    return h;
  }
  function api(url, options){
    options = options || {};
    var headers = authHeaders(options.headers || {});
    var body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)){
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    return fetch(url, { method: options.method || 'GET', headers: headers, body: body }).then(function(res){
      if (res.status === 401){
        sessionToken = '';
        sessionStorage.removeItem('session_token');
        showView('login');
        return res.json().catch(function(){ return {}; }).then(function(d){
          var err = new Error(d.error || '未登录或会话已过期');
          err._auth = true;
          throw err;
        });
      }
      return res.json().catch(function(){ return {}; });
    });
  }

  // ===================== 工具函数 =====================
  function getFileIcon(name){
    var n = (name || '').toLowerCase();
    var dot = n.lastIndexOf('.');
    var ext = dot >= 0 ? n.slice(dot) : '';
    var images = ['.jpg','.jpeg','.png','.gif','.webp','.bmp','.svg','.ico','.tiff','.tif','.avif','.heic'];
    var videos = ['.mp4','.webm','.avi','.mov','.wmv','.flv','.mkv','.m4v','.mpeg','.mpg','.3gp'];
    var audios = ['.mp3','.wav','.ogg','.flac','.aac','.m4a','.wma','.opus'];
    var archives = ['.zip','.rar','.7z','.tar','.gz','.bz2'];
    var texts = ['.txt','.md','.csv','.rtf','.log'];
    var codes = ['.js','.ts','.jsx','.tsx','.py','.java','.c','.cpp','.h','.hpp','.sh','.yaml','.yml','.json','.xml','.html','.htm','.css','.go','.rs','.rb','.php','.sql','.toml'];
    var docs = ['.doc','.docx']; var sheets = ['.xls','.xlsx']; var slides = ['.ppt','.pptx'];
    var fonts = ['.ttf','.otf','.woff','.woff2']; var apps = ['.exe','.dmg','.apk','.ipa','.msi'];
    if (images.indexOf(ext) >= 0) return '🖼️';
    if (videos.indexOf(ext) >= 0) return '🎬';
    if (audios.indexOf(ext) >= 0) return '🎵';
    if (ext === '.pdf') return '📄';
    if (archives.indexOf(ext) >= 0) return '📦';
    if (texts.indexOf(ext) >= 0) return '📝';
    if (docs.indexOf(ext) >= 0) return '📝';
    if (sheets.indexOf(ext) >= 0) return '📊';
    if (slides.indexOf(ext) >= 0) return '📑';
    if (codes.indexOf(ext) >= 0) return '🐍';
    if (fonts.indexOf(ext) >= 0) return '🔤';
    if (apps.indexOf(ext) >= 0) return '⚙️';
    return '📎';
  }
  function formatSize(bytes){
    bytes = Number(bytes) || 0;
    if (bytes <= 0) return '0 B';
    var units = ['B','KB','MB','GB','TB','PB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i >= units.length) i = units.length - 1;
    var val = bytes / Math.pow(1024, i);
    return val.toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
  }
  function p2(n){ return (n < 10 ? '0' : '') + n; }
  function formatDate(iso){
    if (!iso) return '-';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  // ===================== 初始化流程 =====================
  function enterMain(){
    showView('main');
    var tag = currentUser.username + (currentUser.role === 'admin' ? ' (管理员)' : '');
    $('main-user').textContent = tag;
    loadFiles();
  }

  function init(){
    if (sessionToken){
      fetch('/api/verify', { headers: { 'Authorization': 'Bearer ' + sessionToken } })
        .then(function(res){ return res.json(); })
        .then(function(data){
          if (data && data.success){
            currentUser = { username: data.username, role: data.role };
            enterMain();
          } else {
            sessionToken = ''; sessionStorage.removeItem('session_token');
            checkSetup();
          }
        })
        .catch(function(){ sessionToken = ''; sessionStorage.removeItem('session_token'); checkSetup(); });
    } else {
      checkSetup();
    }
  }
  function checkSetup(){
    fetch('/api/setup/status').then(function(r){ return r.json(); }).then(function(st){
      if (st && st.initialized === false){ showView('setup'); }
      else { showView('login'); }
    }).catch(function(){ showView('login'); });
  }

  // ===================== 初始化引导 =====================
  $('setup-form').addEventListener('submit', function(e){
    e.preventDefault();
    var body = {
      admin_username: $('setup-admin-user').value.trim(),
      admin_password: $('setup-admin-pass').value,
      site_title: $('setup-site-title').value.trim() || '${siteTitle}',
      first_repo: {
        owner: $('setup-owner').value.trim(),
        repo: $('setup-repo').value.trim(),
        branch: $('setup-branch').value.trim() || 'main',
        token: $('setup-token').value.trim(),
        is_public: $('setup-public').checked,
        capacity_limit_mb: parseInt($('setup-capacity').value, 10) || 1024
      }
    };
    if (!body.admin_username || !body.admin_password){ toast('请填写管理员用户名和密码', 'error'); return; }
    if (!body.first_repo.owner || !body.first_repo.repo){ toast('请填写仓库 owner 和 repo', 'error'); return; }
    var btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '初始化中...';
    fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ return r.json(); })
      .then(function(data){
        btn.disabled = false; btn.textContent = '完成初始化';
        if (data.success){ toast('初始化成功，请登录', 'success'); showView('login'); }
        else toast(data.error || '初始化失败', 'error');
      })
      .catch(function(){ btn.disabled = false; btn.textContent = '完成初始化'; toast('网络错误', 'error'); });
  });

  // ===================== 登录 =====================
  $('login-form').addEventListener('submit', function(e){
    e.preventDefault();
    var username = $('login-username').value.trim();
    var password = $('login-password').value;
    if (!username || !password){ toast('请输入用户名和密码', 'error'); return; }
    var btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '登录中...';
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username, password: password }) })
      .then(function(r){ return r.json(); })
      .then(function(data){
        btn.disabled = false; btn.textContent = '登录';
        if (data.success){
          sessionToken = data.session_token;
          sessionStorage.setItem('session_token', sessionToken);
          currentUser = { username: data.username, role: data.role };
          $('login-password').value = '';
          enterMain();
        } else {
          toast(data.error || '登录失败', 'error');
        }
      })
      .catch(function(){ btn.disabled = false; btn.textContent = '登录'; toast('网络错误', 'error'); });
  });

  function logout(){
    api('/api/logout', { method: 'POST' }).catch(function(){}).then(function(){
      sessionToken = ''; sessionStorage.removeItem('session_token');
      $('login-password').value = '';
      showView('login');
    });
  }
  $('btn-logout').addEventListener('click', logout);
  $('btn-settings').addEventListener('click', function(){ showView('settings'); switchTab('repos'); });
  $('btn-back').addEventListener('click', function(){ showView('main'); });

  // ===================== 文件列表 =====================
  function loadFiles(){
    $('file-grid').innerHTML = '<div class="empty">加载中...</div>';
    api('/api/list').then(function(data){
      if (data.success){
        filesCache = data.files || [];
        renderFiles(filesCache);
        updateStats();
      } else {
        $('file-grid').innerHTML = '<div class="empty">' + esc(data.error || '加载失败') + '</div>';
      }
    }).catch(function(err){
      if (!err || !err._auth){ $('file-grid').innerHTML = '<div class="empty">加载失败</div>'; }
    });
  }
  function updateStats(){
    var total = filesCache.length;
    var size = 0;
    for (var i = 0; i < filesCache.length; i++) size += (filesCache[i].size || 0);
    $('main-stats').textContent = total + ' 个文件 / ' + formatSize(size);
  }
  function renderFiles(files){
    var grid = $('file-grid');
    $('file-count').textContent = files.length ? (files.length + ' 项') : '';
    if (!files.length){ grid.innerHTML = '<div class="empty">暂无文件，上传一个试试吧</div>'; return; }
    var html = '';
    for (var i = 0; i < files.length; i++){
      var f = files[i];
      var fullUrl = window.location.origin + (f.raw_url || ('/raw/' + f.path));
      var thumb;
      if (f.is_image){
        thumb = '<img class="thumb" src="' + esc(fullUrl) + '" loading="lazy" alt="">';
      } else {
        thumb = '<div class="thumb-icon">' + getFileIcon(f.name) + '</div>';
      }
      html += '<div class="file-card" data-path="' + esc(f.path) + '" data-url="' + esc(fullUrl) + '" data-name="' + esc(f.name) + '" data-img="' + (f.is_image ? 1 : 0) + '" data-vid="' + (f.is_video ? 1 : 0) + '">'
        + thumb
        + '<div class="file-name" title="' + esc(f.name) + '">' + esc(f.name) + '</div>'
        + '<div class="file-meta">' + esc(f.size_formatted || formatSize(f.size)) + ' · ' + esc(formatDate(f.uploaded_at)) + '</div>'
        + '<div class="file-actions">'
        + '<button class="btn-icon" data-act="copy" title="复制链接">🔗</button>'
        + ((f.is_image || f.is_video) ? '<button class="btn-icon" data-act="preview" title="预览">👁</button>' : '')
        + '<a class="btn-icon" data-act="download" href="' + esc(fullUrl) + '" download="' + esc(f.name) + '" title="下载">⬇</a>'
        + '<button class="btn-icon danger" data-act="delete" title="删除">🗑</button>'
        + '</div></div>';
    }
    grid.innerHTML = html;
  }
  // 文件网格事件委托
  $('file-grid').addEventListener('click', function(e){
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var card = t.closest('.file-card');
    if (!card) return;
    var act = t.getAttribute('data-act');
    var path = card.getAttribute('data-path');
    var url = card.getAttribute('data-url');
    var name = card.getAttribute('data-name');
    if (act === 'copy'){ copyText(url, t); }
    else if (act === 'preview'){ openPreview(name, url, card.getAttribute('data-img') === '1', card.getAttribute('data-vid') === '1'); }
    else if (act === 'delete'){ confirmDeleteFile(path, name); }
  });
  function confirmDeleteFile(path, name){
    if (!confirm('确定删除文件 ' + name + ' ?')) return;
    api('/api/delete/' + encodeURIComponent(path), { method: 'DELETE' }).then(function(data){
      if (data.success){ toast('已删除', 'success'); loadFiles(); }
      else toast(data.error || '删除失败', 'error');
    }).catch(function(){});
  }

  // 搜索
  $('search-input').addEventListener('input', function(){
    var q = $('search-input').value.trim().toLowerCase();
    if (!q){ renderFiles(filesCache); return; }
    var filtered = [];
    for (var i = 0; i < filesCache.length; i++){
      if ((filesCache[i].name || '').toLowerCase().indexOf(q) >= 0) filtered.push(filesCache[i]);
    }
    renderFiles(filtered);
  });

  // ===================== 上传 =====================
  var dropZone = $('drop-zone');
  var fileInput = $('file-input');
  dropZone.addEventListener('click', function(){ fileInput.click(); });
  fileInput.addEventListener('change', function(){ if (fileInput.files && fileInput.files.length){ handleUpload(fileInput.files); } fileInput.value = ''; });
  ['dragenter','dragover'].forEach(function(ev){ dropZone.addEventListener(ev, function(e){ e.preventDefault(); dropZone.classList.add('drag'); }); });
  ['dragleave','drop'].forEach(function(ev){ dropZone.addEventListener(ev, function(e){ e.preventDefault(); dropZone.classList.remove('drag'); }); });
  dropZone.addEventListener('drop', function(e){
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){ handleUpload(e.dataTransfer.files); }
  });

  function handleUpload(fileList){
    var files = [];
    for (var i = 0; i < fileList.length; i++) files.push(fileList[i]);
    if (!files.length) return;
    var progWrap = $('upload-progress-wrap');
    var progFill = $('upload-progress');
    var resultsWrap = $('upload-results');
    progWrap.style.display = 'block';
    resultsWrap.style.display = 'block';
    progFill.style.width = '0%';
    var done = 0;
    var chain = Promise.resolve();
    files.forEach(function(file){
      chain = chain.then(function(){ return uploadOne(file, function(pct){
        var overall = Math.round(((done + pct / 100) / files.length) * 100);
        progFill.style.width = overall + '%';
      }).then(function(res){ renderUploadResult(res, file); done++; }); });
    });
    chain.then(function(){
      progFill.style.width = '100%';
      toast('上传完成', 'success');
      setTimeout(function(){ progWrap.style.display = 'none'; progFill.style.width = '0%'; }, 1500);
      loadFiles();
    });
  }
  function uploadOne(file, onProgress){
    return new Promise(function(resolve){
      var xhr = new XMLHttpRequest();
      var fd = new FormData();
      fd.append('file', file);
      xhr.open('POST', '/api/upload');
      if (sessionToken) xhr.setRequestHeader('Authorization', 'Bearer ' + sessionToken);
      if (xhr.upload){
        xhr.upload.onprogress = function(e){ if (e.lengthComputable && onProgress){ onProgress(Math.round((e.loaded / e.total) * 100)); } };
      }
      xhr.onload = function(){
        if (xhr.status === 401){
          sessionToken = ''; sessionStorage.removeItem('session_token'); showView('login');
          resolve({ success: false, error: '未登录或会话已过期' }); return;
        }
        try { var data = JSON.parse(xhr.responseText); resolve(data); }
        catch(e){ resolve({ success: false, error: '解析响应失败' }); }
      };
      xhr.onerror = function(){ resolve({ success: false, error: '网络错误' }); };
      xhr.send(fd);
    });
  }
  function renderUploadResult(res, file){
    var resultsWrap = $('upload-results');
    var results = (res && (res.results || res.files)) || [];
    var item = results[0] || {};
    var ok = res && res.success && item.success !== false;
    var url = item.raw_url ? (window.location.origin + item.raw_url) : '';
    var card = document.createElement('div');
    card.className = 'result-card' + (ok ? '' : ' error');
    var inner = '<div class="result-name">' + (ok ? '✅ ' : '❌ ') + esc(file.name) + '</div>';
    if (ok){
      inner += '<div class="result-url"><input class="result-input" value="' + esc(url) + '" readonly><button class="btn small" data-copy="' + esc(url) + '">复制</button></div>';
    } else {
      inner += '<div class="result-error">' + esc(item.error || res.error || '上传失败') + '</div>';
    }
    card.innerHTML = inner;
    resultsWrap.appendChild(card);
    var cbtn = card.querySelector('[data-copy]');
    if (cbtn) cbtn.addEventListener('click', function(){ copyText(cbtn.getAttribute('data-copy'), cbtn); });
  }

  // ===================== 预览 =====================
  function openPreview(name, url, isImg, isVid){
    var body = $('preview-body');
    if (isImg){
      body.innerHTML = '<img src="' + esc(url) + '" alt="' + esc(name) + '">';
    } else if (isVid){
      body.innerHTML = '<video src="' + esc(url) + '" controls autoplay></video>';
    } else {
      body.innerHTML = '<div class="preview-other"><div class="big-icon">' + getFileIcon(name) + '</div><div style="margin-bottom:8px">' + esc(name) + '</div><a class="btn primary" href="' + esc(url) + '" download="' + esc(name) + '">下载文件</a></div>';
    }
    openModal('modal-preview');
  }

  // ===================== 设置: Tab 切换 =====================
  function switchTab(tab){
    if (currentUser.role !== 'admin' && tab === 'users'){ tab = 'repos'; }
    var tabs = ['repos','users'];
    for (var i = 0; i < tabs.length; i++){
      var t = $('tab-' + tabs[i]); var p = $('panel-' + tabs[i]);
      if (!t) continue;
      if (tabs[i] === tab){ t.classList.add('active'); p.classList.add('active'); }
      else { t.classList.remove('active'); p.classList.remove('active'); }
    }
    if (tab === 'repos') loadRepos();
    if (tab === 'users') loadUsers();
  }
  function setupUserTabVisibility(){
    var usersTab = $('tab-users');
    if (currentUser.role === 'admin'){ usersTab.style.display = ''; }
    else { usersTab.style.display = 'none'; }
  }
  $('tab-repos').addEventListener('click', function(){ switchTab('repos'); });
  $('tab-users').addEventListener('click', function(){ switchTab('users'); });

  // ===================== 设置: 仓库管理 =====================
  function loadRepos(){
    $('repo-list').innerHTML = '<div class="empty">加载中...</div>';
    api('/api/repos').then(function(data){
      if (data.success){
        reposCache = data.repos || [];
        renderRepos(reposCache);
      } else {
        $('repo-list').innerHTML = '<div class="empty">' + esc(data.error || '加载失败') + '</div>';
      }
    }).catch(function(err){
      if (!err || !err._auth){ $('repo-list').innerHTML = '<div class="empty">加载失败</div>'; }
    });
  }
  function renderRepos(repos){
    var wrap = $('repo-list');
    if (!repos.length){ wrap.innerHTML = '<div class="empty">暂无仓库，点击右上角添加</div>'; return; }
    var html = '';
    for (var i = 0; i < repos.length; i++){
      var r = repos[i];
      html += '<div class="repo-item" data-id="' + esc(r.id) + '">'
        + '<div class="repo-head">'
        + '<span class="repo-name">' + esc(r.owner) + '/' + esc(r.repo) + '</span>'
        + '<span class="tag ' + (r.is_public ? 'tag-public' : 'tag-private') + '">' + (r.is_public ? '公共' : '私有') + '</span>'
        + '<span class="tag">优先级 ' + esc(r.priority) + '</span>'
        + (r.enabled === false ? '<span class="tag">已禁用</span>' : '')
        + '</div>'
        + '<div class="repo-branch">分支: ' + esc(r.branch || 'main') + ' · 容量上限: ' + esc(r.capacity_limit_mb) + ' MB</div>'
        + '<div class="repo-bar"><div class="repo-bar-fill" id="bar-' + esc(r.id) + '"></div></div>'
        + '<div class="repo-status" id="status-' + esc(r.id) + '">容量未查询</div>'
        + '<div class="repo-actions">'
        + '<button class="btn small" data-ract="status" data-id="' + esc(r.id) + '">查看容量</button>'
        + '<button class="btn small" data-ract="edit" data-id="' + esc(r.id) + '">编辑</button>'
        + '<button class="btn small danger" data-ract="delete" data-id="' + esc(r.id) + '">删除</button>'
        + '</div></div>';
    }
    wrap.innerHTML = html;
  }
  $('repo-list').addEventListener('click', function(e){
    var t = e.target.closest('[data-ract]');
    if (!t) return;
    var act = t.getAttribute('data-ract');
    var id = t.getAttribute('data-id');
    if (act === 'status') showRepoStatus(id, t);
    else if (act === 'edit') openRepoModal(id);
    else if (act === 'delete') deleteRepo(id);
  });
  function showRepoStatus(id, btn){
    var statusEl = $('status-' + id);
    var barEl = $('bar-' + id);
    if (statusEl) statusEl.textContent = '查询中...';
    if (btn){ btn.disabled = true; btn.textContent = '查询中...'; }
    api('/api/repos/' + encodeURIComponent(id) + '/status').then(function(data){
      if (btn){ btn.disabled = false; btn.textContent = '查看容量'; }
      if (!data.success){ if (statusEl) statusEl.textContent = esc(data.error || '查询失败'); return; }
      var st = data.status || data;
      var pct = (st.usage_percent != null) ? st.usage_percent : 0;
      if (barEl) barEl.style.width = Math.min(100, pct) + '%';
      if (statusEl){
        statusEl.textContent = (st.size_mb != null ? st.size_mb : '?') + ' / ' + (st.capacity_limit_mb != null ? st.capacity_limit_mb : '?') + ' MB (' + pct + '%) · ' + (st.is_available ? '可用' : '已满');
      }
    }).catch(function(err){
      if (btn){ btn.disabled = false; btn.textContent = '查看容量'; }
      if (!err || !err._auth){ if (statusEl) statusEl.textContent = '查询失败'; }
    });
  }
  $('btn-add-repo').addEventListener('click', function(){ openRepoModal(null); });
  function openRepoModal(id){
    editingRepoId = id || null;
    var r = null;
    if (id){
      for (var i = 0; i < reposCache.length; i++){ if (reposCache[i].id === id) r = reposCache[i]; }
    }
    if (r){
      $('repo-modal-title').textContent = '编辑仓库';
      $('repo-owner').value = r.owner || '';
      $('repo-repo').value = r.repo || '';
      $('repo-branch').value = r.branch || 'main';
      $('repo-token').value = '';
      $('repo-token').placeholder = '不填则保留原 Token';
      $('repo-public').checked = !!r.is_public;
      $('repo-capacity').value = r.capacity_limit_mb || 1024;
      $('repo-priority').value = (r.priority != null) ? r.priority : 1;
    } else {
      $('repo-modal-title').textContent = '添加仓库';
      $('repo-form').reset();
      $('repo-branch').value = 'main';
      $('repo-capacity').value = 1024;
      $('repo-priority').value = 1;
      $('repo-token').placeholder = '公共仓库可留空';
    }
    openModal('modal-repo');
  }
  $('repo-form').addEventListener('submit', function(e){
    e.preventDefault();
    var body = {
      owner: $('repo-owner').value.trim(),
      repo: $('repo-repo').value.trim(),
      branch: $('repo-branch').value.trim() || 'main',
      token: $('repo-token').value.trim(),
      is_public: $('repo-public').checked,
      capacity_limit_mb: parseInt($('repo-capacity').value, 10) || 1024,
      priority: parseInt($('repo-priority').value, 10) || 1
    };
    if (!body.owner || !body.repo){ toast('请填写 owner 和 repo', 'error'); return; }
    var url, method;
    if (editingRepoId){ url = '/api/repos/' + encodeURIComponent(editingRepoId); method = 'PUT'; }
    else { url = '/api/repos'; method = 'POST'; }
    api(url, { method: method, body: body }).then(function(data){
      if (data.success){ toast(editingRepoId ? '仓库已更新' : '仓库已添加', 'success'); closeModal('modal-repo'); loadRepos(); }
      else toast(data.error || '操作失败', 'error');
    }).catch(function(){});
  });
  function deleteRepo(id){
    if (!confirm('确定删除该仓库配置？(不会删除 GitHub 上已存储的文件)')) return;
    api('/api/repos/' + encodeURIComponent(id), { method: 'DELETE' }).then(function(data){
      if (data.success){ toast('已删除', 'success'); loadRepos(); }
      else toast(data.error || '删除失败', 'error');
    }).catch(function(){});
  }

  // ===================== 设置: 用户管理 =====================
  function loadUsers(){
    if (currentUser.role !== 'admin') return;
    $('user-list').innerHTML = '<div class="empty">加载中...</div>';
    api('/api/users').then(function(data){
      if (data.success){ renderUsers(data.users || []); }
      else { $('user-list').innerHTML = '<div class="empty">' + esc(data.error || '加载失败') + '</div>'; }
    }).catch(function(err){
      if (!err || !err._auth){ $('user-list').innerHTML = '<div class="empty">加载失败</div>'; }
    });
  }
  function renderUsers(users){
    var wrap = $('user-list');
    if (!users.length){ wrap.innerHTML = '<div class="empty">暂无用户</div>'; return; }
    var html = '';
    for (var i = 0; i < users.length; i++){
      var u = users[i];
      var isSelf = u.username === currentUser.username;
      html += '<div class="user-item">'
        + '<div class="user-name">' + esc(u.username) + (isSelf ? ' <span class="tag">你</span>' : '') + '</div>'
        + '<div class="user-role">' + esc(u.role === 'admin' ? '管理员' : '普通用户') + '</div>'
        + '<div class="user-date">' + esc(formatDate(u.created_at)) + '</div>'
        + '<div class="user-actions">' + (isSelf ? '<span class="hint">不可删除</span>' : '<button class="btn small danger" data-uact="delete" data-name="' + esc(u.username) + '">删除</button>') + '</div>'
        + '</div>';
    }
    wrap.innerHTML = html;
  }
  $('user-list').addEventListener('click', function(e){
    var t = e.target.closest('[data-uact]');
    if (!t) return;
    if (t.getAttribute('data-uact') === 'delete') deleteUser(t.getAttribute('data-name'));
  });
  function deleteUser(name){
    if (!confirm('确定删除用户 ' + name + ' ?')) return;
    api('/api/users/' + encodeURIComponent(name), { method: 'DELETE' }).then(function(data){
      if (data.success){ toast('已删除', 'success'); loadUsers(); }
      else toast(data.error || '删除失败', 'error');
    }).catch(function(){});
  }
  $('user-form').addEventListener('submit', function(e){
    e.preventDefault();
    var body = {
      username: $('user-username').value.trim(),
      password: $('user-password').value,
      role: $('user-role').value
    };
    if (!body.username || !body.password){ toast('请填写用户名和密码', 'error'); return; }
    api('/api/users', { method: 'POST', body: body }).then(function(data){
      if (data.success){ toast('用户已创建', 'success'); $('user-form').reset(); loadUsers(); }
      else toast(data.error || '创建失败', 'error');
    }).catch(function(){});
  });

  // ===================== 模态框关闭 =====================
  document.addEventListener('click', function(e){
    var c = e.target.closest('[data-close]');
    if (c){ closeModal(c.getAttribute('data-close')); }
  });
  // 点击遮罩关闭预览
  $('modal-preview').addEventListener('click', function(e){
    if (e.target === this) closeModal('modal-preview');
  });

  // ===================== 启动 =====================
  setupUserTabVisibility();
  init();
})();
</script>
</body>
</html>`;
}
