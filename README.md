# FilesHub - GitHub 私有仓库文件床

基于 **Cloudflare Workers** + **GitHub 私有仓库** 的文件托管服务。

利用 GitHub 私有仓库作为免费存储后端，通过 Cloudflare Workers 全球边缘网络代理访问，实现高速、安全、免费的文件床。

## 架构原理

```
用户浏览器  →  Cloudflare Worker (代理+缓存)  →  GitHub Private Repo (存储)
                   ↓ CDN 缓存
              后续请求直接从边缘节点返回
```

- **存储层**: GitHub 私有仓库（免费、版本控制、可靠）
- **代理层**: Cloudflare Workers（全球 CDN、边缘缓存、隐藏 Token）
- **访问层**: 用户通过 Worker 域名访问，无需暴露 GitHub Token

## 功能特性

- 拖拽上传 / 多文件批量上传
- 图片缩略图预览 / 视频在线播放
- 文件列表管理（搜索、删除、下载）
- 自动按日期归档（`YYYY/MM/DD/`）
- 双模式上传：Contents API（≤1MB）+ Git Data API（≤100MB）
- Cloudflare 边缘缓存（30天）
- Token 认证保护管理操作
- 文件直链分享（`/raw/路径`）
- 暗色主题 Web 界面
- 完整 REST API

## 快速部署

### 1. 创建 GitHub 私有仓库

1. 在 GitHub 创建一个 **Private** 仓库（如 `file-storage`）
2. 初始化仓库（添加一个 README 或 `.gitkeep`）

### 2. 创建 GitHub Personal Access Token

1. 进入 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. 创建新 Token，权限设置：
   - Repository access: 选择你创建的私有仓库
   - Repository permissions:
     - Contents: **Read and write**
     - Metadata: **Read-only**（自动勾选）
3. 生成并复制 Token

> 也可以使用 Classic Token，勾选 `repo` 权限即可。

### 3. 部署到 Cloudflare Workers

```bash
# 安装依赖
npm install

# 修改 wrangler.toml 中的配置
# GITHUB_OWNER = "你的GitHub用户名"
# GITHUB_REPO = "你的仓库名"
# GITHUB_BRANCH = "main"

# 设置密钥
npx wrangler secret put GITHUB_TOKEN    # 粘贴上面的 GitHub Token
npx wrangler secret put AUTH_TOKEN      # 设置一个管理密码（用于上传/删除）

# 部署
npm run deploy
```

### 4. 本地开发

```bash
# 创建 .dev.vars 文件（本地环境变量）
# 内容：
# GITHUB_TOKEN=ghp_xxxxxxxxxxxx
# AUTH_TOKEN=your-admin-password

# 启动本地开发服务器
npm run dev
```

## API 文档

### 认证

所有管理操作（上传/删除/信息）需要在请求头携带 `Authorization: Bearer <AUTH_TOKEN>`。
文件下载（`/raw/*`）无需认证，公开访问。

### 接口列表

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/` | 否 | Web 管理界面 |
| GET | `/api/health` | 否 | 健康检查（返回仓库信息） |
| POST | `/api/upload` | 是 | 上传文件 |
| GET | `/api/list` | 可配置 | 列出所有文件 |
| GET | `/api/info/{path}` | 是 | 获取文件信息 |
| DELETE | `/api/delete/{path}` | 是 | 删除文件 |
| GET | `/raw/{path}` | 否 | 下载/访问文件（CDN 缓存） |

### 上传文件

```bash
# multipart 表单上传
curl -X POST https://your-worker.workers.dev/api/upload \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -F "file=@/path/to/image.png"

# 指定自定义路径
curl -X POST https://your-worker.workers.dev/api/upload \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -F "file=@/path/to/image.png" \
  -F "path=custom/dir"

# 指定自定义文件名（单文件）
curl -X POST https://your-worker.workers.dev/api/upload \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -F "file=@/path/to/image.png" \
  -F "name=logo.png"

# raw body 上传
curl -X POST https://your-worker.workers.dev/api/upload \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "X-File-Name: data.json" \
  -d '{"key": "value"}'
```

响应：
```json
{
  "success": true,
  "message": "上传完成: 1 个成功, 0 个失败",
  "files": [
    {
      "name": "image.png",
      "path": "2026/07/12/1720780800000_image.png",
      "sha": "abc123...",
      "size": 102400,
      "size_formatted": "100.0 KB",
      "raw_url": "/raw/2026/07/12/1720780800000_image.png",
      "is_image": true,
      "is_video": false
    }
  ]
}
```

### 列出文件

```bash
curl https://your-worker.workers.dev/api/list \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

### 删除文件

```bash
curl -X DELETE https://your-worker.workers.dev/api/delete/2026/07/12/1720780800000_image.png \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

### 访问文件

直接在浏览器打开：
```
https://your-worker.workers.dev/raw/2026/07/12/1720780800000_image.png
```

## 配置说明

### wrangler.toml 环境变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `GITHUB_OWNER` | 公开 | GitHub 用户名 |
| `GITHUB_REPO` | 公开 | 仓库名称 |
| `GITHUB_BRANCH` | 公开 | 分支名称（默认 main） |
| `SITE_TITLE` | 公开 | 网站标题 |
| `PUBLIC_LIST` | 公开 | 是否允许无认证访问文件列表（`true`/`false`） |
| `GITHUB_TOKEN` | 密钥 | GitHub Personal Access Token |
| `AUTH_TOKEN` | 密钥 | 管理操作认证令牌（不设置则不启用认证） |

## 限制说明

| 项目 | 限制 |
|------|------|
| 单文件最大 | 100 MB（Git Blob API 限制） |
| Contents API | ≤ 1 MB（自动切换 Git Data API） |
| GitHub API 频率 | 5000 次/小时（已认证） |
| Cloudflare Workers | 免费版 100,000 次/天 |
| 请求体大小 | 100 MB（Cloudflare 限制） |

> 边缘缓存可有效降低 GitHub API 调用次数，同一文件多次访问只消耗 1 次 API 调用。

## 项目结构

```
fileshub/
├── src/
│   ├── index.js      # 主入口：路由、认证、缓存
│   ├── github.js     # GitHub API 客户端
│   ├── utils.js      # 工具函数
│   └── ui.js         # Web 管理界面
├── wrangler.toml     # Cloudflare Workers 配置
├── package.json
└── .gitignore
```

## 技术要点

- **双模式上传**: 小文件（≤1MB）使用 Contents API（单次请求），大文件使用 Git Data API（Blob→Tree→Commit→Ref）
- **边缘缓存**: 使用 Cloudflare Cache API，图片/视频缓存 30 天，大幅降低 GitHub API 调用
- **路径安全**: 防止路径遍历攻击（`..` 检测）
- **MIME 检测**: 内置 50+ 种常见文件类型的 MIME 映射
- **自动归档**: 文件按 `YYYY/MM/DD/` 目录结构存储，避免单目录文件过多
