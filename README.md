# FilesHub - GitHub 多仓库文件床

基于 **Cloudflare Workers** + **GitHub 多仓库** + **Cloudflare KV** 的文件托管系统。

支持多用户、多仓库、容量自动切换、公共仓库免 Token 读取。所有配置通过 Web 界面完成。

## 功能特性

- 多用户系统（管理员 + 普通用户）
- 每用户多仓库配置，按优先级自动选库
- 仓库容量上限自动切换（超出后跳到下一个仓库）
- 公共仓库支持（读取免 Token）
- Web 端完成所有配置，无需改代码
- AES-GCM 加密存储 GitHub Token
- Cloudflare 边缘缓存（30 天）
- 拖拽上传、图片预览、文件管理

## 部署步骤

### 1. Fork / Clone 仓库

```bash
git clone https://github.com/你的用户名/fileshub.git
cd fileshub
```

### 2. 创建 Cloudflare KV 命名空间

**方式 A - Dashboard 操作：**
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Workers & Pages → KV → Create namespace
3. 名称填 `FILESHUB_KV`，创建后复制命名空间 ID

**方式 B - 命令行：**
```bash
npx wrangler kv namespace create FILESHUB_KV
```

### 3. 填写 wrangler.toml

将 `wrangler.toml` 中的 `id` 替换为你的 KV 命名空间 ID：

```toml
[[kv_namespaces]]
binding = "FILESHUB_KV"
id = "你的KV命名空间ID"
```

### 4. 部署到 Cloudflare Workers

**方式 A - 命令行：**
```bash
npm install
npx wrangler deploy
```

**方式 B - Cloudflare Pages 连接 GitHub 自动部署：**
1. Dashboard → Workers & Pages → Create → Connect to Git
2. 选择你的仓库，框架预设选 None
3. 构建命令 `npm install`，部署命令 `npx wrangler deploy`

### 5. 设置 AUTH_TOKEN Secret

**方式 A - 命令行：**
```bash
npx wrangler secret put AUTH_TOKEN
```
输入一个随机字符串（建议 32 位以上）。

**方式 B - Dashboard：**
1. Workers → fileshub → Settings → Variables and Secrets
2. 添加 Secret：名称 `AUTH_TOKEN`，值为你自定义的随机字符串

### 6. 初始化

访问你的 Worker 域名，首次会显示初始化引导页：

1. 设置管理员用户名和密码
2. 配置第一个 GitHub 仓库：
   - GitHub 用户名 / 仓库名 / 分支
   - Token（私有仓库必填，公共仓库可空）
   - 是否公共仓库
   - 容量上限（MB）
3. 提交后用管理员账号登录即可使用

## 使用说明

### 文件管理

- 拖拽或点击上传文件，上传后直接获得可分享的下载链接
- 图片自动显示缩略图，支持点击预览
- 支持搜索、下载、删除文件

### 仓库管理（设置页）

- 添加多个仓库，设置优先级和容量上限
- 系统按优先级自动选择仓库上传，超出容量自动切换到下一个
- 公共仓库读取不需要 Token（但写入仍需要）
- 实时显示每个仓库的容量使用率

### 用户管理（仅管理员）

- 创建/删除用户
- 设置用户角色（管理员/普通用户）
- 每个用户的仓库和文件互相隔离

## API 文档

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

## 项目结构

```
fileshub/
├── src/
│   ├── index.js          # 主入口：路由、认证、初始化
│   ├── kv.js             # KV 存储层：用户/仓库/文件/会话
│   ├── auth.js           # 认证模块：登录/登出/会话
│   ├── repo-manager.js   # 仓库管理：容量监控、自动选库
│   ├── github.js         # GitHub API 客户端
│   ├── utils.js          # 工具函数：加密、MIME、路径
│   └── ui.js             # Web 界面
├── wrangler.toml         # Cloudflare Workers 配置
├── package.json
└── .gitignore
```

## 限制说明

| 项目 | 限制 |
|------|------|
| 单文件最大 | 100 MB（GitHub API 限制） |
| KV 免费版读取 | 10 万次/天 |
| KV 免费版写入 | 1,000 次/天 |
| GitHub API | 5,000 次/小时（已认证） |
| 会话有效期 | 24 小时 |
| CDN 缓存 | 30 天 |

## 技术栈

- Cloudflare Workers（运行时）
- Cloudflare KV（配置存储）
- GitHub Repos（文件存储后端）
- Web Crypto API（AES-GCM 加密）
- 原生 HTML/CSS/JS（前端，无框架依赖）
