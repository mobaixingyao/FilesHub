# FilesHub v2 - GitHub 多仓库文件床

基于 **Cloudflare Workers** + **GitHub 多仓库** + **Cloudflare KV** 的文件托管系统。

支持多用户、多仓库、容量自动切换、公共仓库免 Token 读取。

## 架构

```
用户浏览器 → Cloudflare Worker (路由/认证/缓存)
                    ↓                              ↓
              Cloudflare KV                    GitHub Repos
         (用户/仓库/文件配置)                  (文件存储后端)
```

## 功能特性

- 多用户系统（管理员 + 普通用户）
- 每用户多仓库配置，按优先级自动选库
- 仓库容量上限自动切换（超出后跳到下一个仓库）
- 公共仓库支持（读取免 Token，写入仍需 Token）
- Web 端完成所有配置（无需改代码重新部署）
- AES-GCM 加密存储 GitHub Token
- Cloudflare 边缘缓存（30 天）
- 拖拽上传、图片预览、文件管理
- 完整 REST API

## 快速部署

### 1. 创建 Cloudflare KV 命名空间

```bash
npx wrangler kv namespace create FILESHUB_KV
```

将返回的 `id` 填入 `wrangler.toml` 中的 `YOUR_KV_NAMESPACE_ID`。

### 2. 设置 AUTH_TOKEN Secret

```bash
npx wrangler secret put AUTH_TOKEN
```

输入一个随机字符串（建议 32 位以上），用于 AES-GCM 加密 GitHub Token。

### 3. 部署

```bash
npm install
npm run deploy
```

### 4. 初始化

访问 Worker 域名，首次会显示引导页：
1. 设置管理员用户名和密码
2. 配置第一个 GitHub 仓库（owner/repo/branch/token/公共或私有/容量上限）
3. 提交后跳转登录页，用管理员账号登录

## 本地开发

```bash
# 创建 .dev.vars 文件
echo "AUTH_TOKEN=your-random-secret" > .dev.vars

# 启动本地开发服务器
npm run dev
```

## API 文档

### 认证

所有需认证的接口在 Header 携带 `Authorization: Bearer {session_token}`。

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/` | 否 | Web 界面 |
| GET | `/api/setup/status` | 否 | 检查是否已初始化 |
| POST | `/api/setup` | 否 | 首次初始化 |
| POST | `/api/login` | 否 | 登录 |
| POST | `/api/logout` | 是 | 退出 |
| GET | `/api/verify` | 是 | 验证会话 |
| GET | `/api/users` | 管理员 | 用户列表 |
| POST | `/api/users` | 管理员 | 创建用户 |
| DELETE | `/api/users/{name}` | 管理员 | 删除用户 |
| GET | `/api/repos` | 是 | 仓库列表 |
| POST | `/api/repos` | 是 | 添加仓库 |
| PUT | `/api/repos/{id}` | 是 | 修改仓库 |
| DELETE | `/api/repos/{id}` | 是 | 删除仓库 |
| GET | `/api/repos/{id}/status` | 是 | 仓库容量状态 |
| POST | `/api/upload` | 是 | 上传文件 |
| GET | `/api/list` | 是 | 文件列表 |
| DELETE | `/api/delete/{path}` | 是 | 删除文件 |
| GET | `/raw/{path}` | 否 | 下载文件（CDN 缓存） |

### 上传示例

```bash
curl -X POST https://your-worker.workers.dev/api/upload \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -F "file=@image.png"
```

### 添加仓库示例

```bash
curl -X POST https://your-worker.workers.dev/api/repos \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "mobaixingyao",
    "repo": "file-storage-2",
    "branch": "main",
    "token": "ghp_xxxxxxxx",
    "is_public": false,
    "capacity_limit_mb": 2048,
    "priority": 2
  }'
```

## 项目结构

```
fileshub/
├── src/
│   ├── index.js          # 主入口：路由、认证中间件、初始化引导
│   ├── kv.js             # KV 存储层：用户/仓库/文件索引/会话 CRUD
│   ├── auth.js           # 认证模块：登录/登出/会话验证
│   ├── repo-manager.js   # 仓库管理：容量监控、自动选库、CRUD
│   ├── github.js         # GitHub API 客户端：上传/下载/删除/列表
│   ├── utils.js          # 工具函数：加密、MIME、路径、响应构建
│   └── ui.js             # Web 界面：引导页/登录/文件管理/设置
├── wrangler.toml         # Cloudflare Workers 配置
├── package.json
├── SKILL.md              # 项目总控记录
└── .gitignore
```

## 配置说明

### wrangler.toml

| 变量 | 类型 | 说明 |
|------|------|------|
| `SITE_TITLE` | 公开 | 站点标题 |
| `FILESHUB_KV` | KV 绑定 | 配置存储 |
| `AUTH_TOKEN` | Secret | 加密密钥（AES-GCM） |

### 仓库配置项

| 字段 | 说明 |
|------|------|
| `owner` | GitHub 用户名 |
| `repo` | 仓库名 |
| `branch` | 分支名 |
| `token` | GitHub PAT（加密存储） |
| `is_public` | true=公共仓库(读取免Token) |
| `capacity_limit_mb` | 容量上限，超出自动切换 |
| `priority` | 优先级（数字越小越优先） |
| `enabled` | 是否启用 |

## 限制说明

| 项目 | 限制 |
|------|------|
| 单文件最大 | 100 MB |
| KV 免费版读取 | 10 万次/天 |
| KV 免费版写入 | 1,000 次/天 |
| GitHub API | 5,000 次/小时（已认证） |
| 会话有效期 | 24 小时 |
| CDN 缓存 | 30 天 |
