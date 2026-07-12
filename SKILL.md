# FilesHub v2 - 项目总控记录

## 项目概述
基于 Cloudflare Workers + GitHub 多仓库的文件床系统，支持多用户、多仓库、容量自动切换、公共仓库。

## 技术栈
- 运行时: Cloudflare Workers
- 存储: Cloudflare KV (配置/元数据) + GitHub Repos (文件存储)
- 前端: 单 HTML 页面 (内嵌 CSS/JS)
- 认证: 自实现多用户 Token 认证

## 调研结论（关键技术约束）

### Cloudflare KV
- 免费: 10万次读/天, 1000次写/天, 单value最大25MB, 单key最大512字节
- 最终一致性: 写入后最多60秒全球同步
- 同key写入限制: 1次/秒
- 适合: 用户配置、仓库配置、文件元数据索引
- AUTH_TOKEN 仍用 Secrets，不进 KV

### GitHub API
- 仓库无硬容量上限，推荐 <5GB，可通过 `GET /repos/{owner}/{repo}` 的 `size` 字段(KB)监控
- 单文件硬限制: 100MB (Contents API 和 Git Blobs API 一致)
- 已认证: 5000次/小时; 未认证: 60次/小时
- 公共仓库: 读取可不带token(但仅60次/小时)，写入必须带token
- 私有仓库: 读写都必须带token
- Fine-grained token 适用于自有仓库场景

## 需求拆解

### 核心需求
1. **多用户系统**: 支持创建多个用户，每个用户独立登录
2. **多仓库配置**: 每个用户可配置多个 GitHub 仓库（私有/公共）
3. **容量自动切换**: 设置单仓库容量上限，超过后自动切换到下一个仓库
4. **公共仓库支持**: 公共仓库可不配置 token（读取免认证，写入仍需 token）
5. **Web 端配置**: 所有配置通过部署后的网页完成

### 模块拆解

#### 模块 A: 配置存储层 (src/kv.js)
- KV 数据结构定义与读写
- 用户 CRUD
- 仓库 CRUD
- 文件索引管理
- 配置加密 (token 字段)

#### 模块 B: 认证模块 (src/auth.js)
- 多用户登录/注册
- 会话管理 (sessionStorage)
- 请求认证中间件
- 管理员/普通用户角色区分

#### 模块 C: 仓库管理模块 (src/repo-manager.js)
- 仓库健康检查
- 容量监控 (调用 GitHub API 获取 size)
- 自动选库逻辑 (按优先级 + 容量)
- 公共/私有仓库适配

#### 模块 D: GitHub API 客户端 (src/github.js)
- 适配多仓库参数 (owner/repo/token 由调用方传入)
- 公共仓库无 token 读取
- 双模式上传 (Contents API / Git Data API)
- 下载/删除/列表

#### 模块 E: Worker 主入口 (src/index.js)
- 路由系统
- 初始化引导 (首次访问)
- 请求处理与认证

#### 模块 F: Web UI (src/ui.js)
- 初始化引导页 (设置管理员账号 + 首个仓库)
- 登录页
- 文件管理主页 (上传/列表/删除/预览)
- 设置页 (用户管理/仓库管理/容量配置)

### 数据结构设计

```
KV Key 设计:
  system:config          → { initialized, admin_created, site_title }
  user:list              → ["admin", "user2", ...]
  user:{username}        → { password_hash, role, created_at }
  repos:{username}       → ["repo_001", "repo_002", ...]
  repo:{username}:{id}   → { id, owner, repo, branch, token, is_public, capacity_limit_mb, priority, enabled }
  files:{username}       → [{ path, repo_id, size, sha, name, uploaded_at }]
```

### API 路由设计

```
初始化:
  GET  /api/setup/status     → 是否已初始化
  POST /api/setup            → 首次初始化(创建管理员+首个仓库)

认证:
  POST /api/login            → 用户登录
  POST /api/logout           → 退出登录

用户管理 (管理员):
  GET  /api/users            → 用户列表
  POST /api/users            → 创建用户
  DELETE /api/users/{name}   → 删除用户

仓库管理:
  GET  /api/repos            → 当前用户仓库列表
  POST /api/repos            → 添加仓库
  PUT  /api/repos/{id}       → 修改仓库配置
  DELETE /api/repos/{id}     → 删除仓库
  GET  /api/repos/{id}/status → 仓库容量/健康状态

文件操作:
  POST /api/upload           → 上传文件(自动选库)
  GET  /api/list             → 文件列表
  DELETE /api/delete/{path}  → 删除文件
  GET  /raw/{path}           → 下载文件(公开)

系统:
  GET  /api/verify           → 验证登录状态
  GET  /api/health           → 系统健康检查(需认证)
```

## 详细执行规范

### 模块接口定义 (各子Agent必须严格遵循)

#### utils.js 导出
```js
export function arrayBufferToBase64(buffer) → string
export function getMimeType(filename) → string
export function isImage(filename) → boolean
export function isVideo(filename) → boolean
export function generateFilePath(filename, customDir) → string
export function formatBytes(bytes) → string
export function jsonResponse(data, status, headers) → Response
export function errorResponse(message, status, extra) → Response
export function corsResponse() → Response
export function isSafePath(path) → boolean
export function encodePath(path) → string
export async function sha256(text) → string  // Web Crypto API
export async function encryptToken(token, key) → string  // AES-GCM
export async function decryptToken(encrypted, key) → string
export function generateId() → string  // repo_xxx 格式
export function generateSessionToken() → string
```

#### kv.js 导出
```js
// 系统配置
export async function getSystemConfig(env) → { initialized, site_title }
export async function setSystemConfig(env, config) → void

// 用户管理
export async function getUserList(env) → string[]
export async function getUser(env, username) → { username, password_hash, role, created_at } | null
export async function createUser(env, username, passwordHash, role) → void
export async function deleteUser(env, username) → void

// 仓库管理
export async function getRepoList(env, username) → string[]  // repo id 数组
export async function getRepo(env, username, repoId) → RepoConfig | null
export async function getAllRepos(env, username) → RepoConfig[]
export async function createRepo(env, username, repoConfig) → string  // 返回新 id
export async function updateRepo(env, username, repoId, updates) → void
export async function deleteRepo(env, username, repoId) → void

// 文件索引
export async function getFileIndex(env, username) → FileEntry[]
export async function addFileEntry(env, username, entry) → void
export async function removeFileEntry(env, username, path) → void
export async function findFileEntry(env, username, path) → FileEntry | null

// 会话管理
export async function createSession(env, username) → string  // session token
export async function getSession(env, sessionToken) → { username, role } | null
export async function deleteSession(env, sessionToken) → void
```

#### auth.js 导出
```js
export async function handleLogin(request, env) → Response
export async function handleLogout(request, env) → Response
export async function authMiddleware(request, env) → { authenticated, username, role } | null
// authMiddleware 从 Authorization: Bearer {sessionToken} 提取并验证
```

#### repo-manager.js 导出
```js
export async function selectRepoForUpload(env, username, fileSize) → RepoConfig
// 按优先级遍历仓库，检查容量，返回第一个可用的

export async function getRepoStatus(env, repoConfig) → { size_kb, size_mb, capacity_limit_mb, usage_percent, is_available, error }
// 调用 GitHub API GET /repos/{owner}/{repo} 获取 size

export async function checkRepoHealth(env, repoConfig) → { healthy, error }
// 验证仓库是否可访问

export async function handleReposRequest(request, env, username) → Response  // GET/POST
export async function handleRepoStatusRequest(request, env, username, repoId) → Response
export async function handleRepoUpdateRequest(request, env, username, repoId) → Response  // PUT
export async function handleRepoDeleteRequest(request, env, username, repoId) → Response  // DELETE
```

#### github.js 导出
```js
// 所有方法接收 repoConfig 对象而非 env
export async function uploadFile(repoConfig, fileContent, filePath, commitMessage) → { sha, path, size }
export async function downloadFile(repoConfig, filePath) → Response
export async function deleteFile(repoConfig, filePath, commitMessage) → { success, path, commitSha }
export async function listFiles(repoConfig, dirPath) → Array
export async function listAllFiles(repoConfig, dirPath, maxDepth) → Array
export async function getFileInfo(repoConfig, filePath) → object
export async function getRepoSize(repoConfig) → number  // KB
export async function checkRepoAccess(repoConfig) → { accessible, error }
// RepoConfig: { owner, repo, branch, token, is_public }
// 公共仓库 token 为空时，读取不带 Authorization 头
```

#### index.js 路由表 (完整)
```
GET  /                        → renderUI (首页)
GET  /api/setup/status        → 检查是否已初始化
POST /api/setup               → 首次初始化
POST /api/login               → 登录
POST /api/logout              → 退出
GET  /api/verify              → 验证会话
GET  /api/users               → 用户列表 (管理员)
POST /api/users               → 创建用户 (管理员)
DELETE /api/users/{name}      → 删除用户 (管理员)
GET  /api/repos               → 仓库列表 (已认证)
POST /api/repos               → 添加仓库 (已认证)
PUT  /api/repos/{id}          → 修改仓库 (已认证)
DELETE /api/repos/{id}        → 删除仓库 (已认证)
GET  /api/repos/{id}/status   → 仓库状态 (已认证)
POST /api/upload              → 上传文件 (已认证)
GET  /api/list                → 文件列表 (已认证)
DELETE /api/delete/{path}     → 删除文件 (已认证)
GET  /raw/{path}              → 下载文件 (公开, CDN缓存)
OPTIONS *                     → CORS
```

### 数据结构定义

```js
// RepoConfig
{
  id: "repo_001",
  owner: "mobaixingyao",
  repo: "mbxycangku",
  branch: "main",
  token: "",              // 加密存储，公共仓库读取时可为空
  is_public: false,        // true=公共仓库(读取免token), false=私有仓库
  capacity_limit_mb: 1024, // 超过此容量自动切换到下一个仓库
  priority: 1,             // 数字越小优先级越高
  enabled: true,
  created_at: "2026-07-12T10:00:00Z"
}

// FileEntry
{
  path: "2026/07/12/1720780800000_image.png",
  name: "image.png",
  repo_id: "repo_001",     // 存储在哪个仓库
  size: 102400,
  sha: "abc123",
  uploaded_at: "2026-07-12T10:00:00Z"
}

// Session
{
  username: "admin",
  role: "admin",
  created_at: "2026-07-12T10:00:00Z"
}
```

### 安全规范
1. 用户密码: SHA-256 hash 后存入 KV，不明文存储
2. GitHub Token: 使用 AUTH_TOKEN (Cloudflare Secret) 作为密钥，AES-GCM 加密后存入 KV
3. 会话 Token: 随机生成 32 字节 hex 字符串，存入 KV (key: session:{token})，设 TTL 24小时
4. 管理员操作: 必须验证 role === 'admin'
5. 路径安全: 所有文件路径经过 isSafePath 检查
6. CORS: 所有 API 响应包含 CORS 头

### 代码规范
1. ES Module 语法 (export/import)
2. 所有异步函数使用 async/await
3. 详细的 console.error 日志 (错误排查用)
4. 每个文件顶部 JSDoc 注释说明模块职责
5. 函数级 JSDoc 注释
6. 错误处理: try-catch 包裹，返回规范化 JSON 错误响应

### wrangler.toml 配置
```toml
name = "fileshub"
main = "src/index.js"
compatibility_date = "2024-09-23"

[vars]
SITE_TITLE = "FilesHub"

[[kv_namespaces]]
binding = "FILESHUB_KV"
id = "需创建后填入"

# Secrets (wrangler secret put):
# AUTH_TOKEN → 系统加密密钥 + 管理员初始化保护
```

## 运行记录

### 2026-07-12 项目启动
- 完成需求拆解
- 完成技术调研 (KV + GitHub API)
- 用户确认架构方案
- 完成详细执行规范制定
- 开始任务分配

### 2026-07-12 开发完成
- 3 个子Agent 并行执行：后端模块(6文件) + Worker入口(1文件) + Web UI(1文件)
- ui.js 首次生成失败（返回空），重新生成成功
- 全部 8 个 JS 文件通过 node --check 语法验证
- 接口审核：各模块导出函数与 index.js 导入完全匹配
- 路由审核：18 条路由全部实现，路由匹配顺序正确（/api/repos/{id}/status 在 /api/repos/{id} 之前）
- 安全审核：密码 SHA-256、Token AES-GCM 加密、会话 TTL 24h、路径安全检查、CORS 头
- 上传流程：选库→解密→上传→索引→filemap KV 映射，完整闭环
- 下载流程：KV filemap 查找→解密→GitHub 下载→CDN 缓存，公开无需认证
- 编写部署文档 README.md
- 审核结论：PASS
