/**
 * Web 管理界面
 * 包含：初始化引导页、登录页、文件管理主页、设置页
 * 关键修复：页面加载时先检查 /api/setup/status，未初始化显示引导页
 */

export function renderUI(env) {
  const siteTitle = (env && env.SITE_TITLE) ? env.SITE_TITLE : 'FilesHub';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${siteTitle} - 文件管理</title>
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
    --danger-hover: #da3633;
    --success: #3fb950;
    --warning: #d29922;
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
  .animate-in { animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both; }

  /* 视图容器 */
  .view { display: none; }
  .view.active { display: block; }

  /* 居中卡片（引导/登录共用） */
  .center-card {
    position: fixed; inset: 0;
    background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    padding: 24px; z-index: 9999;
    animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .center-card.hidden { display: none; }
  .card-box {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 40px 36px;
    width: 100%; max-width: 460px;
    box-shadow: var(--shadow-lg);
    max-height: 90vh; overflow-y: auto;
  }
  .card-box.wide { max-width: 560px; }
  .card-logo {
    width: 56px; height: 56px;
    background: var(--accent);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px; font-weight: bold;
    margin: 0 auto 20px;
    box-shadow: 0 0 30px var(--accent-glow);
  }
  .card-box h2 { text-align: center; font-size: 22px; font-weight: 600; margin-bottom: 6px; }
  .card-box .subtitle { text-align: center; font-size: 14px; color: var(--text-muted); margin-bottom: 28px; }
  .form-group { margin-bottom: 18px; }
  .form-group label { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px; font-weight: 500; }
  .form-group input, .form-group select {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 14px;
    color: var(--text);
    font-size: 14px;
    transition: border-color var(--transition);
  }
  .form-group input:focus, .form-group select:focus {
    outline: none; border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }
  .form-group input.error { border-color: var(--danger); animation: shake 0.4s ease; }
  .form-group checkbox-wrap { display: flex; align-items: center; gap: 8px; }
  .form-group input[type="checkbox"] { width: auto; }
  .form-row { display: flex; gap: 12px; }
  .form-row .form-group { flex: 1; }
  .form-section { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); }
  .form-section-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; color: var(--text); }
  .btn-primary {
    width: 100%; background: var(--accent); border: none;
    border-radius: var(--radius); padding: 11px;
    color: white; font-size: 15px; font-weight: 600;
    cursor: pointer; transition: all var(--transition); margin-top: 4px;
  }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .card-error { color: var(--danger); font-size: 13px; text-align: center; margin-top: 16px; min-height: 18px; }
  .card-hint { text-align: center; font-size: 12px; color: var(--text-dim); margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); }

  /* Header */
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
  .header-btn {
    background: transparent; border: 1px solid var(--border);
    border-radius: var(--radius); padding: 6px 14px;
    color: var(--text-muted); font-size: 13px;
    cursor: pointer; transition: all var(--transition);
  }
  .header-btn:hover { border-color: var(--accent); color: var(--accent); }
  .header-btn.danger:hover { border-color: var(--danger); color: var(--danger); }

  /* Main */
  .main { max-width: 900px; margin: 0 auto; padding: 24px; }

  /* Upload */
  .upload-zone {
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);
    padding: 44px 24px;
    text-align: center; cursor: pointer;
    transition: all var(--transition);
    background: var(--bg-card);
    margin-bottom: 24px;
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

  /* Upload results */
  .upload-results { margin-bottom: 24px; }
  .result-card {
    background: var(--bg-card); border: 1px solid var(--border);
    border-left: 3px solid var(--success);
    border-radius: var(--radius); padding: 14px 16px;
    margin-bottom: 10px; display: flex; align-items: center; gap: 12px;
    animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .result-card.error { border-left-color: var(--danger); }
  .result-thumb {
    width: 48px; height: 48px; border-radius: var(--radius);
    background: var(--bg); display: flex; align-items: center; justify-content: center;
    overflow: hidden; flex-shrink: 0; font-size: 24px;
  }
  .result-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .result-info { flex: 1; min-width: 0; }
  .result-name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
  .result-link-row { display: flex; align-items: center; gap: 8px; }
  .result-link {
    flex: 1; min-width: 0; background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 10px; font-size: 12px; color: var(--accent);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-family: 'SF Mono', 'Consolas', monospace;
  }
  .copy-btn {
    background: var(--accent); border: none; border-radius: 6px;
    padding: 5px 14px; color: white; font-size: 12px; font-weight: 500;
    cursor: pointer; transition: all var(--transition); white-space: nowrap; flex-shrink: 0;
  }
  .copy-btn:hover { background: var(--accent-hover); }
  .copy-btn.copied { background: var(--success); }

  /* Toolbar */
  .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .search-box {
    flex: 1; min-width: 200px;
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 8px 14px;
    color: var(--text); font-size: 14px; transition: border-color var(--transition);
  }
  .search-box:focus { outline: none; border-color: var(--accent); }
  .btn {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 8px 16px;
    color: var(--text); font-size: 14px; cursor: pointer;
    transition: all var(--transition); display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:hover { background: var(--bg-hover); border-color: var(--accent); }
  .btn-danger { color: var(--danger); }
  .btn-danger:hover { background: rgba(248,81,73,0.1); border-color: var(--danger); }
  .btn-icon { width: 30px; height: 30px; padding: 0; justify-content: center; font-size: 14px; }

  /* File grid */
  .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; }
  .file-card {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
    transition: all var(--transition);
    animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .file-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow); }
  .file-thumb {
    width: 100%; height: 130px; background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; cursor: pointer; position: relative;
  }
  .file-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .file-thumb .file-icon { font-size: 44px; opacity: 0.6; }
  .file-info { padding: 10px 12px; }
  .file-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
  .file-meta { font-size: 12px; color: var(--text-muted); }
  .file-actions { display: flex; gap: 4px; padding: 0 12px 10px; }

  /* Empty / Loading */
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
    border-radius: var(--radius); padding: 12px 20px; font-size: 14px;
    box-shadow: var(--shadow);
    animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    display: flex; align-items: center; gap: 8px; min-width: 240px; max-width: 400px;
  }
  .toast.success { border-color: var(--success); }
  .toast.error { border-color: var(--danger); }
  .toast.removing { animation: fadeOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }

  /* Preview modal */
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
    border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 2001;
  }
  .preview-info {
    position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 20px;
    font-size: 13px; color: white; white-space: nowrap;
  }

  /* Settings */
  .settings-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
  .tab-btn {
    background: transparent; border: none; border-bottom: 2px solid transparent;
    padding: 10px 20px; color: var(--text-muted); font-size: 14px;
    cursor: pointer; transition: all var(--transition);
  }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* Repo card */
  .repo-card {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 16px; margin-bottom: 12px;
    animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .repo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 12px; flex-wrap: wrap; }
  .repo-name { font-size: 15px; font-weight: 600; }
  .repo-tags { display: flex; gap: 6px; }
  .tag {
    font-size: 11px; padding: 2px 8px; border-radius: 10px;
    border: 1px solid var(--border); color: var(--text-muted);
  }
  .tag.public { color: var(--success); border-color: var(--success); }
  .tag.private { color: var(--warning); border-color: var(--warning); }
  .repo-bar { height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; margin: 8px 0; }
  .repo-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
  .repo-meta { font-size: 12px; color: var(--text-muted); display: flex; justify-content: space-between; }
  .repo-actions { display: flex; gap: 6px; margin-top: 10px; }

  /* User card */
  .user-card {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 14px 16px; margin-bottom: 10px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .user-info { flex: 1; }
  .user-name { font-size: 14px; font-weight: 500; }
  .user-role { font-size: 12px; color: var(--text-muted); }
  .role-badge-admin { color: var(--accent); }
  .role-badge-user { color: var(--text-muted); }

  .section-title { font-size: 15px; font-weight: 600; color: var(--text-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .section-title .count { font-size: 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 1px 8px; }
  .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
  .checkbox-label input { width: auto; }

  @media (max-width: 600px) {
    .header { padding: 12px; }
    .main { padding: 16px; }
    .file-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .upload-zone { padding: 32px 16px; }
    .form-row { flex-direction: column; gap: 0; }
  }
</style>
</head>
<body>

<!-- ===== 初始化引导页 ===== -->
<div class="center-card" id="view-setup">
  <div class="card-box wide">
    <div class="card-logo">F</div>
    <h2>${siteTitle} - 初始化</h2>
    <p class="subtitle">首次使用，请创建管理员账号并配置第一个仓库</p>
    <form id="setup-form">
      <div class="form-section-title">管理员账号</div>
      <div class="form-row">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="setup-username" placeholder="admin" required>
        </div>
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="setup-password" placeholder="设置密码" required>
        </div>
      </div>
      <div class="form-group">
        <label>站点标题</label>
        <input type="text" id="setup-title" value="${siteTitle}">
      </div>
      <div class="form-section">
        <div class="form-section-title">第一个 GitHub 仓库</div>
        <div class="form-row">
          <div class="form-group">
            <label>GitHub 用户名</label>
            <input type="text" id="setup-owner" placeholder="your-username" required>
          </div>
          <div class="form-group">
            <label>仓库名</label>
            <input type="text" id="setup-repo" placeholder="file-storage" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>分支</label>
            <input type="text" id="setup-branch" value="main">
          </div>
          <div class="form-group">
            <label>容量上限 (MB)</label>
            <input type="number" id="setup-capacity" value="1024" min="1">
          </div>
        </div>
        <div class="form-group">
          <label>GitHub Token (私有仓库必填，公共仓库可空)</label>
          <input type="password" id="setup-token" placeholder="ghp_xxxxxxxx">
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="setup-public"> 公共仓库 (Public Repo)
          </label>
        </div>
      </div>
      <button type="submit" class="btn-primary" id="setup-btn">完成初始化</button>
      <div class="card-error" id="setup-error"></div>
    </form>
  </div>
</div>

<!-- ===== 登录页 ===== -->
<div class="center-card hidden" id="view-login">
  <div class="card-box">
    <div class="card-logo">F</div>
    <h2>${siteTitle}</h2>
    <p class="subtitle">请输入账号密码进入文件管理</p>
    <form id="login-form">
      <div class="form-group">
        <label>用户名</label>
        <input type="text" id="login-username" placeholder="用户名" required>
      </div>
      <div class="form-group">
        <label>密码</label>
        <input type="password" id="login-password" placeholder="密码" required>
      </div>
      <button type="submit" class="btn-primary" id="login-btn">登录</button>
      <div class="card-error" id="login-error"></div>
    </form>
    <div class="card-hint">令牌保存在当前会话中，关闭浏览器后自动清除</div>
  </div>
</div>

<!-- ===== 主界面 ===== -->
<div class="view" id="view-main">
  <div class="header">
    <div class="header-left">
      <div class="logo">F</div>
      <h1>${siteTitle}</h1>
    </div>
    <div class="header-right">
      <div class="stat-badge" id="stat-count">文件 <strong>0</strong></div>
      <div class="stat-badge" id="stat-size">总计 <strong>0 B</strong></div>
      <button class="header-btn" id="btn-settings">设置</button>
      <button class="header-btn danger" id="btn-logout">退出</button>
    </div>
  </div>
  <div class="main">
    <div class="upload-zone animate-in" id="upload-zone">
      <div class="upload-icon">📁</div>
      <div class="upload-text">拖拽文件到此处上传，或点击选择文件</div>
      <div class="upload-hint">支持图片、视频、文档等，单个文件最大 100MB</div>
      <input type="file" id="file-input" multiple style="display:none">
      <div class="upload-progress">
        <div class="upload-status" id="upload-status">准备上传...</div>
        <div class="progress-bar"><div class="progress-bar-fill" id="progress-fill" style="width:0%"></div></div>
      </div>
    </div>
    <div class="upload-results" id="upload-results"></div>
    <div class="section-title">已上传文件 <span class="count" id="list-count">0</span></div>
    <div class="toolbar">
      <input type="text" class="search-box" id="search-box" placeholder="搜索文件名...">
      <button class="btn" id="btn-refresh">刷新</button>
    </div>
    <div id="file-list">
      <div class="loading"><div class="spinner"></div><p style="margin-top:12px">加载中...</p></div>
    </div>
  </div>
</div>

<!-- ===== 设置页 ===== -->
<div class="view" id="view-settings">
  <div class="header">
    <div class="header-left">
      <div class="logo">F</div>
      <h1>设置</h1>
    </div>
    <div class="header-right">
      <button class="header-btn" id="btn-back-main">返回</button>
      <button class="header-btn danger" id="btn-logout2">退出</button>
    </div>
  </div>
  <div class="main">
    <div class="settings-tabs">
      <button class="tab-btn active" data-tab="repos">仓库管理</button>
      <button class="tab-btn" data-tab="users" id="tab-users-btn">用户管理</button>
    </div>
    <div class="tab-panel active" id="tab-repos">
      <div class="toolbar">
        <div class="section-title" style="margin:0;flex:1">仓库列表</div>
        <button class="btn" id="btn-add-repo">+ 添加仓库</button>
      </div>
      <div id="repo-list"><div class="loading"><div class="spinner"></div></div></div>
    </div>
    <div class="tab-panel" id="tab-users">
      <div class="toolbar">
        <div class="section-title" style="margin:0;flex:1">用户列表</div>
        <button class="btn" id="btn-add-user">+ 添加用户</button>
      </div>
      <div id="user-list"><div class="loading"><div class="spinner"></div></div></div>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast-container" id="toast-container"></div>

<!-- Preview modal -->
<div class="preview-modal" id="preview-modal">
  <button class="preview-close" id="preview-close">&times;</button>
  <div class="preview-content" id="preview-content"></div>
  <div class="preview-info" id="preview-info"></div>
</div>

<script>
var AUTH = {
  token: sessionStorage.getItem('fileshub_token') || '',
  username: '',
  role: ''
};
var allFiles = [];
var filteredFiles = [];
var allRepos = [];

// ===== 视图切换 =====
function showView(id) {
  var views = document.querySelectorAll('.view');
  for (var i = 0; i < views.length; i++) views[i].classList.remove('active');
  var setup = document.getElementById('view-setup');
  var login = document.getElementById('view-login');
  setup.classList.remove('hidden');
  login.classList.remove('hidden');
  setup.style.display = 'none';
  login.style.display = 'none';
  if (id === 'setup') {
    setup.style.display = 'flex';
  } else if (id === 'login') {
    login.style.display = 'flex';
  } else {
    var el = document.getElementById('view-' + id);
    if (el) el.classList.add('active');
    setup.classList.add('hidden');
    login.classList.add('hidden');
  }
}

// ===== 页面加载流程（核心修复）=====
async function init() {
  // 1. 检查是否有已保存的会话
  if (AUTH.token) {
    try {
      var resp = await fetch('/api/verify', {
        headers: { 'Authorization': 'Bearer ' + AUTH.token }
      });
      if (resp.ok) {
        var data = await resp.json();
        AUTH.username = data.username;
        AUTH.role = data.role;
        showView('main');
        loadFiles();
        return;
      }
    } catch(e) {}
    AUTH.token = '';
    sessionStorage.removeItem('fileshub_token');
  }

  // 2. 检查是否已初始化
  try {
    var setupResp = await fetch('/api/setup/status');
    var setupData = await setupResp.json();
    if (!setupData.initialized) {
      // 未初始化 → 显示引导页
      showView('setup');
    } else {
      // 已初始化 → 显示登录页
      showView('login');
    }
  } catch(e) {
    // 出错也显示登录页
    showView('login');
  }
}

// ===== API 封装 =====
async function api(path, options) {
  options = options || {};
  options.headers = options.headers || {};
  if (AUTH.token) options.headers['Authorization'] = 'Bearer ' + AUTH.token;
  var resp = await fetch(path, options);
  if (resp.status === 401) {
    AUTH.token = '';
    sessionStorage.removeItem('fileshub_token');
    showView('login');
    showToast('请重新登录', 'error');
    throw new Error('未登录');
  }
  var data = await resp.json().catch(function() { return { success: false, error: '解析失败' }; });
  if (!resp.ok && !data.success) throw new Error(data.error || ('HTTP ' + resp.status));
  return data;
}

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
function isImg(name) { return ['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes((name.split('.').pop()||'').toLowerCase()); }
function isVid(name) { return ['mp4','webm','avi','mov','mkv'].includes((name.split('.').pop()||'').toLowerCase()); }
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

// ===== 初始化引导 =====
document.getElementById('setup-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  var btn = document.getElementById('setup-btn');
  var errEl = document.getElementById('setup-error');
  btn.disabled = true; btn.textContent = '初始化中...'; errEl.textContent = '';
  try {
    var body = {
      admin_username: document.getElementById('setup-username').value.trim(),
      admin_password: document.getElementById('setup-password').value,
      site_title: document.getElementById('setup-title').value.trim() || 'FilesHub',
      first_repo: {
        owner: document.getElementById('setup-owner').value.trim(),
        repo: document.getElementById('setup-repo').value.trim(),
        branch: document.getElementById('setup-branch').value.trim() || 'main',
        token: document.getElementById('setup-token').value.trim(),
        is_public: document.getElementById('setup-public').checked,
        capacity_limit_mb: parseInt(document.getElementById('setup-capacity').value) || 1024
      }
    };
    var resp = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await resp.json();
    if (!data.success) throw new Error(data.error || '初始化失败');
    showToast('初始化成功，请登录', 'success');
    setTimeout(function() { showView('login'); }, 1000);
  } catch(err) {
    errEl.textContent = err.message;
    btn.disabled = false; btn.textContent = '完成初始化';
  }
});

// ===== 登录 =====
document.getElementById('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  var btn = document.getElementById('login-btn');
  var errEl = document.getElementById('login-error');
  btn.disabled = true; btn.textContent = '登录中...'; errEl.textContent = '';
  try {
    var resp = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('login-username').value.trim(),
        password: document.getElementById('login-password').value
      })
    });
    var data = await resp.json();
    if (!data.success) throw new Error(data.error || '登录失败');
    AUTH.token = data.session_token;
    AUTH.username = data.username;
    AUTH.role = data.role;
    sessionStorage.setItem('fileshub_token', AUTH.token);
    showToast('登录成功', 'success');
    showView('main');
    loadFiles();
    if (AUTH.role !== 'admin') {
      document.getElementById('tab-users-btn').style.display = 'none';
    }
  } catch(err) {
    errEl.textContent = err.message;
    var inp = document.getElementById('login-password');
    inp.classList.add('error');
    setTimeout(function() { inp.classList.remove('error'); }, 500);
  } finally {
    btn.disabled = false; btn.textContent = '登录';
  }
});

// ===== 退出 =====
function logout() {
  if (AUTH.token) fetch('/api/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + AUTH.token } }).catch(function(){});
  AUTH.token = ''; AUTH.username = ''; AUTH.role = '';
  sessionStorage.removeItem('fileshub_token');
  showView('login');
}
document.getElementById('btn-logout').addEventListener('click', logout);
document.getElementById('btn-logout2').addEventListener('click', logout);

// ===== 设置/返回 =====
document.getElementById('btn-settings').addEventListener('click', function() {
  showView('settings');
  loadRepos();
  if (AUTH.role === 'admin') loadUsers();
});
document.getElementById('btn-back-main').addEventListener('click', function() {
  showView('main');
  loadFiles();
});

// ===== Tab 切换 =====
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

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
      headers: { 'Authorization': 'Bearer ' + AUTH.token },
      body: formData
    });
    if (resp.status === 401) { showToast('请重新登录', 'error'); logout(); return; }
    var data = await resp.json();
    progressEl.style.width = '100%';
    var results = data.results || data.files || [];
    var successCount = 0;
    var html = '';
    for (var j = 0; j < results.length; j++) {
      var item = results[j];
      if (item.success === false) {
        html += '<div class="result-card error"><div class="result-thumb">❌</div><div class="result-info"><div class="result-name">' + esc(item.name) + '</div><div style="font-size:12px;color:var(--danger)">' + esc(item.error || '上传失败') + '</div></div></div>';
        continue;
      }
      successCount++;
      var fullUrl = window.location.origin + item.raw_url;
      var thumb = item.is_image ? '<img src="' + item.raw_url + '" loading="lazy">' : '<span>' + getFileIcon(item.name) + '</span>';
      html += '<div class="result-card"><div class="result-thumb">' + thumb + '</div><div class="result-info"><div class="result-name">' + esc(item.name) + ' (' + formatBytes(item.size) + ')</div><div class="result-link-row"><input class="result-link" value="' + fullUrl + '" readonly onclick="this.select()"><button class="copy-btn" data-url="' + fullUrl + '">复制链接</button></div></div></div>';
    }
    resultsEl.innerHTML = html + resultsEl.innerHTML;
    statusEl.textContent = '上传完成: ' + successCount + ' 个成功';
    if (successCount > 0) showToast('上传成功 ' + successCount + ' 个文件', 'success');
    // 绑定复制按钮
    resultsEl.querySelectorAll('.copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var url = btn.dataset.url;
        navigator.clipboard.writeText(url).then(function() {
          btn.classList.add('copied'); btn.textContent = '已复制';
          setTimeout(function() { btn.classList.remove('copied'); btn.textContent = '复制链接'; }, 2000);
          showToast('已复制链接', 'success');
        });
      });
    });
    setTimeout(function() { uploadZone.classList.remove('uploading'); loadFiles(); }, 1200);
  } catch(err) {
    statusEl.textContent = '上传失败: ' + err.message;
    showToast('上传失败: ' + err.message, 'error');
    setTimeout(function() { uploadZone.classList.remove('uploading'); }, 2000);
  }
  fileInput.value = '';
}

// ===== 文件列表 =====
async function loadFiles() {
  var listEl = document.getElementById('file-list');
  listEl.innerHTML = '<div class="loading"><div class="spinner"></div><p style="margin-top:12px">加载中...</p></div>';
  try {
    var data = await api('/api/list');
    allFiles = data.files || [];
    filteredFiles = allFiles.slice();
    document.getElementById('stat-count').innerHTML = '文件 <strong>' + (data.total || 0) + '</strong>';
    document.getElementById('stat-size').innerHTML = '总计 <strong>' + formatBytes(data.total_size) + '</strong>';
    document.getElementById('list-count').textContent = data.total || 0;
    renderFiles();
  } catch(err) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>' + esc(err.message) + '</p></div>';
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
    var thumb = f.is_image ? '<img src="' + f.raw_url + '" loading="lazy">' : '<div class="file-icon">' + getFileIcon(f.name) + '</div>';
    html += '<div class="file-card" style="animation-delay:' + (i * 0.03) + 's" data-path="' + esc(f.path) + '" data-name="' + esc(f.name) + '" data-is-image="' + f.is_image + '" data-is-video="' + f.is_video + '">' +
      '<div class="file-thumb" data-action="preview">' + thumb + '</div>' +
      '<div class="file-info"><div class="file-name" title="' + esc(f.name) + '">' + esc(f.name) + '</div><div class="file-meta">' + formatBytes(f.size) + '</div></div>' +
      '<div class="file-actions">' +
        '<button class="btn btn-icon" data-action="copy" data-url="' + window.location.origin + f.raw_url + '" title="复制链接">🔗</button>' +
        '<button class="btn btn-icon" data-action="download" data-url="' + f.raw_url + '" title="下载">⬇️</button>' +
        '<button class="btn btn-icon btn-danger" data-action="delete" data-path="' + esc(f.path) + '" title="删除">🗑️</button>' +
      '</div></div>';
  }
  listEl.innerHTML = html + '</div>';
}

// 事件委托
document.getElementById('file-list').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var action = btn.dataset.action;
  if (action === 'preview') {
    var card = btn.closest('.file-card');
    previewFile(card);
  } else if (action === 'copy') {
    navigator.clipboard.writeText(btn.dataset.url).then(function() {
      showToast('已复制链接', 'success');
    });
  } else if (action === 'download') {
    window.open(btn.dataset.url, '_blank');
  } else if (action === 'delete') {
    delFile(btn.dataset.path);
  }
});

document.getElementById('search-box').addEventListener('input', function(e) {
  var q = e.target.value.toLowerCase();
  filteredFiles = allFiles.filter(function(f) { return f.name.toLowerCase().indexOf(q) !== -1 || f.path.toLowerCase().indexOf(q) !== -1; });
  renderFiles();
});
document.getElementById('btn-refresh').addEventListener('click', loadFiles);

async function delFile(path) {
  if (!confirm('确定删除: ' + path.split('/').pop() + ' ?')) return;
  try {
    await api('/api/delete/' + encodeURIComponent(path), { method: 'DELETE' });
    showToast('已删除', 'success');
    loadFiles();
  } catch(err) { showToast('删除失败: ' + err.message, 'error'); }
}

// ===== 预览 =====
function previewFile(card) {
  var path = card.dataset.path, name = card.dataset.name;
  var isImage = card.dataset.isImage === 'true', isVideo = card.dataset.isVideo === 'true';
  var modal = document.getElementById('preview-modal');
  var content = document.getElementById('preview-content');
  var info = document.getElementById('preview-info');
  if (isImage) content.innerHTML = '<img src="/raw/' + path + '" alt="' + esc(name) + '">';
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

// ===== 仓库管理 =====
async function loadRepos() {
  var listEl = document.getElementById('repo-list');
  listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    var data = await api('/api/repos');
    allRepos = data.repos || [];
    renderRepos();
  } catch(err) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>' + esc(err.message) + '</p></div>';
  }
}

function renderRepos() {
  var listEl = document.getElementById('repo-list');
  if (allRepos.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>还没有配置仓库</p></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < allRepos.length; i++) {
    var r = allRepos[i];
    var typeTag = r.is_public ? '<span class="tag public">公共</span>' : '<span class="tag private">私有</span>';
    var enabledTag = r.enabled ? '<span class="tag">启用</span>' : '<span class="tag">禁用</span>';
    html += '<div class="repo-card" data-id="' + r.id + '">' +
      '<div class="repo-header"><div class="repo-name">' + esc(r.owner) + '/' + esc(r.repo) + '</div><div class="repo-tags">' + typeTag + enabledTag + '<span class="tag">优先级 ' + r.priority + '</span></div></div>' +
      '<div class="repo-bar"><div class="repo-bar-fill" style="width:0%;background:var(--accent)"></div></div>' +
      '<div class="repo-meta"><span class="repo-usage">加载中...</span><span>上限 ' + r.capacity_limit_mb + ' MB</span></div>' +
      '<div class="repo-actions">' +
        '<button class="btn btn-icon" data-repo-action="refresh" data-id="' + r.id + '" title="刷新状态">🔄</button>' +
        '<button class="btn btn-icon btn-danger" data-repo-action="delete" data-id="' + r.id + '" title="删除">🗑️</button>' +
      '</div></div>';
  }
  listEl.innerHTML = html;
  // 异步加载每个仓库的容量状态
  allRepos.forEach(function(r) { loadRepoStatus(r.id); });
}

async function loadRepoStatus(repoId) {
  try {
    var data = await api('/api/repos/' + repoId + '/status');
    var status = data.status || data;
    var card = document.querySelector('.repo-card[data-id="' + repoId + '"]');
    if (!card) return;
    var fill = card.querySelector('.repo-bar-fill');
    var usage = card.querySelector('.repo-usage');
    var pct = Math.min(100, Math.round(status.usage_percent || 0));
    fill.style.width = pct + '%';
    if (pct > 90) fill.style.background = 'var(--danger)';
    else if (pct > 70) fill.style.background = 'var(--warning)';
    else fill.style.background = 'var(--success)';
    usage.textContent = (status.size_mb || 0).toFixed(1) + ' MB / ' + (status.capacity_limit_mb || 0) + ' MB (' + pct + '%)';
  } catch(e) {}
}

document.getElementById('repo-list').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-repo-action]');
  if (!btn) return;
  var action = btn.dataset.repoAction;
  var id = btn.dataset.id;
  if (action === 'refresh') loadRepoStatus(id);
  else if (action === 'delete') deleteRepo(id);
});

async function deleteRepo(id) {
  if (!confirm('确定删除此仓库配置？(不会删除 GitHub 上的文件)')) return;
  try {
    await api('/api/repos/' + id, { method: 'DELETE' });
    showToast('已删除', 'success');
    loadRepos();
  } catch(err) { showToast('删除失败: ' + err.message, 'error'); }
}

// 添加仓库
document.getElementById('btn-add-repo').addEventListener('click', function() {
  var html = '<div class="card-box wide" style="margin:0 auto"><h2>添加仓库</h2><div class="form-row">' +
    '<div class="form-group"><label>GitHub 用户名</label><input type="text" id="new-owner" required></div>' +
    '<div class="form-group"><label>仓库名</label><input type="text" id="new-repo" required></div>' +
    '</div><div class="form-row">' +
    '<div class="form-group"><label>分支</label><input type="text" id="new-branch" value="main"></div>' +
    '<div class="form-group"><label>容量上限 (MB)</label><input type="number" id="new-capacity" value="1024"></div>' +
    '</div><div class="form-row">' +
    '<div class="form-group"><label>优先级 (数字越小越优先)</label><input type="number" id="new-priority" value="1"></div>' +
    '<div class="form-group"><label class="checkbox-label"><input type="checkbox" id="new-public"> 公共仓库</label></div>' +
    '</div><div class="form-group"><label>GitHub Token</label><input type="password" id="new-token" placeholder="ghp_xxxxxxxx"></div>' +
    '<button class="btn-primary" id="confirm-add-repo">添加</button>' +
    '<button class="btn-primary" id="cancel-add-repo" style="margin-top:8px;background:var(--bg-card);color:var(--text);border:1px solid var(--border)">取消</button></div>';
  var overlay = document.createElement('div');
  overlay.className = 'center-card';
  overlay.id = 'add-repo-overlay';
  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  document.body.appendChild(overlay);
  document.getElementById('cancel-add-repo').addEventListener('click', function() { overlay.remove(); });
  document.getElementById('confirm-add-repo').addEventListener('click', async function() {
    try {
      await api('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: document.getElementById('new-owner').value.trim(),
          repo: document.getElementById('new-repo').value.trim(),
          branch: document.getElementById('new-branch').value.trim() || 'main',
          token: document.getElementById('new-token').value.trim(),
          is_public: document.getElementById('new-public').checked,
          capacity_limit_mb: parseInt(document.getElementById('new-capacity').value) || 1024,
          priority: parseInt(document.getElementById('new-priority').value) || 1
        })
      });
      showToast('仓库已添加', 'success');
      overlay.remove();
      loadRepos();
    } catch(err) { showToast('添加失败: ' + err.message, 'error'); }
  });
});

// ===== 用户管理 =====
async function loadUsers() {
  var listEl = document.getElementById('user-list');
  listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    var data = await api('/api/users');
    var users = data.users || [];
    if (users.length === 0) { listEl.innerHTML = '<div class="empty-state"><p>暂无用户</p></div>'; return; }
    var html = '';
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var roleBadge = u.role === 'admin' ? '<span class="role-badge-admin">管理员</span>' : '<span class="role-badge-user">普通用户</span>';
      var canDelete = u.username !== AUTH.username;
      html += '<div class="user-card"><div class="user-info"><div class="user-name">' + esc(u.username) + '</div><div class="user-role">' + roleBadge + '</div></div>' +
        (canDelete ? '<button class="btn btn-icon btn-danger" data-del-user="' + esc(u.username) + '" title="删除">🗑️</button>' : '<span class="tag">当前用户</span>') +
        '</div>';
    }
    listEl.innerHTML = html;
  } catch(err) {
    listEl.innerHTML = '<div class="empty-state"><p>' + esc(err.message) + '</p></div>';
  }
}

document.getElementById('user-list').addEventListener('click', async function(e) {
  var btn = e.target.closest('[data-del-user]');
  if (!btn) return;
  var username = btn.dataset.delUser;
  if (!confirm('确定删除用户 ' + username + '？')) return;
  try {
    await api('/api/users/' + encodeURIComponent(username), { method: 'DELETE' });
    showToast('已删除', 'success');
    loadUsers();
  } catch(err) { showToast('删除失败: ' + err.message, 'error'); }
});

document.getElementById('btn-add-user').addEventListener('click', function() {
  var html = '<div class="card-box" style="margin:0 auto"><h2>添加用户</h2>' +
    '<div class="form-group"><label>用户名</label><input type="text" id="new-username" required></div>' +
    '<div class="form-group"><label>密码</label><input type="password" id="new-user-password" required></div>' +
    '<div class="form-group"><label>角色</label><select id="new-user-role"><option value="user">普通用户</option><option value="admin">管理员</option></select></div>' +
    '<button class="btn-primary" id="confirm-add-user">添加</button>' +
    '<button class="btn-primary" id="cancel-add-user" style="margin-top:8px;background:var(--bg-card);color:var(--text);border:1px solid var(--border)">取消</button></div>';
  var overlay = document.createElement('div');
  overlay.className = 'center-card';
  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  document.body.appendChild(overlay);
  document.getElementById('cancel-add-user').addEventListener('click', function() { overlay.remove(); });
  document.getElementById('confirm-add-user').addEventListener('click', async function() {
    try {
      await api('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('new-username').value.trim(),
          password: document.getElementById('new-user-password').value,
          role: document.getElementById('new-user-role').value
        })
      });
      showToast('用户已添加', 'success');
      overlay.remove();
      loadUsers();
    } catch(err) { showToast('添加失败: ' + err.message, 'error'); }
  });
});

// ===== 启动 =====
init();
</script>
</body>
</html>`;
}
