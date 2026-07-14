# HTTP API 文档

> 本文档描述 PrismCraft（AI Animation Studio）Electron 桌面应用主进程内置的 HTTP API Server。
> 版本: 1.3.0 | 更新日期: 2026-07-14

---

## 一、概述

### 1.1 API Server 的作用

应用主进程在启动时通过 `node:http` 创建一个本地 HTTP Server（端口 `API_SERVER_PORT = 30100`），统一承载渲染进程与主进程之间的所有业务通信。所有路由以 `/api/` 为统一前缀，路由表由 `electron/src/api/routes.ts` 合并 9 个路由组而成（共 85 条路由）。

设计目标：

- **统一通信层**：渲染进程（含 `shared/file-http`）通过 HTTP 调用主进程能力，绕过 IPC 序列化对大对象的内存压力。
- **类型安全**：每条带 Schema 的路由使用 `defineRoute({ schema, handler, methods })` 注册，请求体经 Zod 校验后类型自动推断。
- **二进制支持**：`Content-Type: application/octet-stream` 路径走原始 Buffer 透传（见 `file/write-binary`），上限 500MB。
- **流式响应**：通过 `Route.stream = true` 标记的路由会以 SSE（`text/event-stream`）回送 chunk。

### 1.2 鉴权与 CORS

- 所有非 `health` 路由必须携带请求头 `X-Electron-App: <APP_AUTH_TOKEN>`，否则返回 `403`。
- CORS 仅允许 `APP_SERVER_PORT (3000)` 与 `DEV_SERVER_PORT (3001)` 来源。
- 二进制路径自定义 header `X-File-Path` 必须在主进程白名单 `ELECTRON_APP_HEADERS` 中。

### 1.3 统一返回结构 `ApiResponse<T>`

所有非流式路由的响应体遵循 `ApiResponse<T>` 形态（定义于 `electron/src/api/types.ts`）：

```typescript
interface ApiResponse<T = unknown> {
  success: boolean;          // 业务是否成功
  data?: T;                  // 成功时的业务数据
  error?: string | StructuredError; // 失败时的错误信息（字符串或 { code, message }）
  httpStatus?: number;       // 可选，建议的 HTTP 状态码
}
```

- 服务端依据 `success` 与 `httpStatus` 决定写入 HTTP 状态码：成功 200，失败默认 400（除非 `httpStatus` 指定其他值）。
- `error` 既可以是字符串（旧路径），也可以是结构化错误 `{ code, message, details? }`（如 `FILE_PATH_NOT_ALLOWED`、`FILE_TOO_LARGE` 等错误码）。
- 路由未命中返回 `404 { error: "Not found: <path>" }`，方法不允许返回 `405`，请求体超限返回 `413`，Schema 校验失败返回 `400 { success: false, error: "Validation error", details: [...] }`。

### 1.4 流式 SSE 路由格式

`Route.stream === true` 的路由（当前为 `generate-text-stream` 和 `generate-chat-stream`）由 `server.ts` 的 `executeStreamRoute` 处理：

1. 响应头写入 `Content-Type: text/event-stream; Cache-Control: no-cache; Connection: keep-alive`。
2. handler 第 4 个参数接收 `StreamSink`，通过 `sink.sendChunk(data)` 推送业务 chunk。
3. 服务端将每个 chunk 包装为 SSE 事件：`data: {"_t":"chunk","chunk":<data>}\n\n`。
4. handler 返回后发送终止事件：`data: {"_t":"done","result":<handler返回值>}\n\n`。
5. handler 抛错时发送：`data: {"_t":"error","error":"<message>"}\n\n`。

> 详细示例见 [第八章 流式路由特别说明](#八流式路由特别说明)。

### 1.5 请求体约定

- 默认 `Content-Type: application/json`，JSON body 与 query string 合并后送入 Zod 校验（query 优先级低于 body 字段）。
- 默认 body 上限 `50MB`；当 `Content-Type: application/octet-stream` 时上限提升至 `500MB` 且不解析 JSON，原始 Buffer 挂到 `req.__rawBuffer`。
- 二进制路径的文件元信息（如目标路径）通过自定义 header 传递，绕开 JSON 解析。

---

## 二、安全限制

### 2.1 文件读写大小上限

| 限制项 | 常量 | 值 | 说明 |
|--------|------|-----|------|
| 单次读取上限 | `MAX_READ_SIZE` | 50 MB | `file/read`、`file/read-base64` 共享 |
| 单次写入上限（JSON） | `MAX_WRITE_SIZE` | 100 MB | `file/write`、`file/write-atomic` |
| 单次写入上限（二进制） | `MAX_WRITE_BINARY_SIZE` | 500 MB | `file/write-binary`，支持 Seedance 2.5 30秒 4K / Kling 180秒 大视频直写 |
| 目录扫描上限 | `MAX_DIR_SCAN` | 5000 | `file/list` 超过时截断并附带 `warning` 字段 |
| HTTP 请求体上限（JSON） | `MAX_REQUEST_BODY_SIZE` | 50 MB | 服务端入口校验 |
| HTTP 请求体上限（二进制） | `MAX_BINARY_BODY_SIZE` | 500 MB | `application/octet-stream` 路径 |

### 2.2 文件路径白名单

- 文件分类目录（`CATEGORY_DIRS`）：

  | category | 实际目录 |
  |----------|---------|
  | `character` | `<userData>/Assets/Characters` |
  | `scene` | `<userData>/Assets/Scenes` |
  | `storyboard` | `<userData>/Assets/Storyboards` |
  | `video-cache` | `<userData>/Cache/Videos` |
  | `image-cache` | `<userData>/Cache/Images` |
  | `upload` | `<os.tmpdir>/ai-animation-studio/uploads` |
  | `plugin` | `<userData>/Plugins` |

- 任意绝对路径写入（如 `file/write`、`file/write-binary`、`download/to-file`）的目标路径必须落在 `ALLOWED_ROOTS` 内（即 `CATEGORY_DIRS` ∪ 所有 `userData` 目录），否则返回 `FILE_PATH_NOT_ALLOWED`。
- 文件名校验：`isFilenameSafe` 拒绝包含 `..`、空字符串、路径分隔符等危险字符的名称。

### 2.3 SQL 校验与脱敏

- 所有 `db/*` 路由在执行前调用 `validateSql(sql)`，禁止危险关键字（DDL、PRAGMA、ATTACH 等）。
- `db/query` 与 `db/transaction` 中的 SELECT 语句若被 `isSensitiveQuery` 识别为敏感查询，结果将被替换为空数组 `[]`。
- `db/run` 写入后自动调用 `scheduleSave()` 触发异步落盘。

### 2.4 ffmpeg 限制

- `ffmpeg/execute` 仅接受预定义的参数数组 `args: string[]`，**不接受 shell 字符串**，杜绝命令注入。
- `timeout` 参数最大值 `30 * 60 * 1000`（30 分钟），超时强制终止子进程。
- `ffmpegPath` 必须存在且可执行，否则报错。

### 2.5 配置脱敏与加密

- `config/get` 与 `config` 在返回前对 `apiKey` 字段调用 `maskApiKey` 脱敏（仅返回前后若干字符 + `***`）。
- `config/set` 写入 `apiKey` 时使用安全存储（`secureConfigRouteSchema` 的 `operation: "save"` 路径）加密持久化。
- `secure-config` 路由 `load` 操作返回脱敏后的 apiKey，`save` 操作接受明文并加密。

### 2.6 SSRF 防护

- 用户配置的非回环主机（非 `127.0.0.1` / `localhost` / `::1`）必须通过 `ssrfGuard.validate`，禁止访问内网保留地址段（参见 R105）。
- 回环地址默认受信，跳过 SSRF 检查。

### 2.7 速率限制

- `checkRateLimit(clientIp)` 按客户端 IP 限流，超限返回 `429`。

---

## 三、core-routes（10 条）

| 路由 key | 方法 | 端点 | Schema | 描述 |
|---|---|---|---|---|
| `config` | GET / POST / HEAD | `/api/config` | `configRouteSchema` | 应用配置读写（兼容多 action 形态） |
| `secure-config` | POST | `/api/secure-config` | `secureConfigRouteSchema` | 安全配置解析（脱敏 apiKey） |
| `config/get` | POST | `/api/config/get` | `configGetSchema` | 配置读取（apiKey 脱敏） |
| `config/set` | POST | `/api/config/set` | `configSetSchema` | 配置写入（apiKey 加密持久化） |
| `upload` | POST | `/api/upload` | `uploadSchema` | 文件上传处理 |
| `test-connection` | POST | `/api/test-connection` | `testConnectionSchema` | 测试 AI 服务商 API 连接 |
| `sync/config` | GET / POST | `/api/sync/config` | `syncConfigRouteSchema` | 数据同步配置读写 |
| `sync/test` | POST | `/api/sync/test` | `syncTestSchema` | 同步服务连接测试 |
| `sync/proxy` | POST | `/api/sync/proxy` | `syncProxySchema` | 同步代理（push/pull） |
| `export` | POST | `/api/export` | `exportSchema` | 数据导出 |

### 3.1 `POST /api/config/get`

读取应用配置项，apiKey 字段自动脱敏。

**请求体**：

```json
{
  "key": "provider.openai"
}
```

**响应**：

```json
{
  "success": true,
  "data": {
    "apiKey": "sk-***...abc",
    "apiUrl": "https://api.openai.com/v1",
    "model": "gpt-4o"
  }
}
```

### 3.2 `POST /api/config/set`

写入配置项。`apiKey` 走加密持久化路径。

**请求体**：

```json
{
  "key": "provider.openai",
  "value": {
    "apiKey": "sk-xxxxxxxxxxxx",
    "apiUrl": "https://api.openai.com/v1"
  }
}
```

### 3.3 `POST /api/secure-config`

安全配置统一入口，`operation` 可选 `save` / `load` / `clear`。

**请求体**（save）：

```json
{
  "operation": "save",
  "providerId": "openai",
  "config": { "apiKey": "sk-xxxx" }
}
```

**响应**（load）：

```json
{
  "success": true,
  "data": {
    "providerId": "openai",
    "config": { "apiKey": "sk-***...abc" }
  }
}
```

### 3.4 `POST /api/test-connection`

测试 AI 服务商连通性。

**请求体**：

```json
{
  "apiUrl": "https://api.openai.com/v1",
  "apiKey": "sk-xxxx",
  "model": "gpt-4o",
  "providerId": "openai"
}
```

---

## 四、db-routes（3 条）

| 路由 key | 方法 | 端点 | Schema | 描述 |
|---|---|---|---|---|
| `db/query` | POST | `/api/db/query` | `dbQuerySchema` | SQL 查询（SELECT），结果可能脱敏 |
| `db/run` | POST | `/api/db/run` | `dbRunSchema` | SQL 写入（INSERT/UPDATE/DELETE） |
| `db/transaction` | POST | `/api/db/transaction` | `dbTransactionSchema` | 事务执行多条语句 |

### 4.1 `POST /api/db/query`

执行只读查询。SQL 经 `validateSql` 校验，结果若为敏感查询则替换为 `[]`。

**请求体**：

```json
{
  "sql": "SELECT id, name FROM characters WHERE project_id = ?",
  "params": ["proj-001"]
}
```

**响应**：

```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "主角" },
    { "id": 2, "name": "反派" }
  ]
}
```

### 4.2 `POST /api/db/run`

执行写入语句，写入后自动 `scheduleSave()` 触发落盘。

**请求体**：

```json
{
  "sql": "INSERT INTO characters (id, name, project_id) VALUES (?, ?, ?)",
  "params": [3, "配角", "proj-001"]
}
```

**响应**：

```json
{
  "success": true,
  "data": { "changes": 1, "lastInsertRowid": 3 }
}
```

### 4.3 `POST /api/db/transaction`

事务执行多条语句（原子提交）。`statements` 至少 1 条；SELECT 语句返回结果行，其他语句返回 `run` 结果。每条语句独立 `validateSql`。

**请求体**：

```json
{
  "statements": [
    { "sql": "UPDATE tasks SET status = ? WHERE id = ?", "params": ["done", "t-1"] },
    { "sql": "INSERT INTO logs (task_id, action) VALUES (?, ?)", "params": ["t-1", "completed"] }
  ]
}
```

---

## 五、download-routes（1 条）

| 路由 key | 方法 | 端点 | Schema | 描述 |
|---|---|---|---|---|
| `download/to-file` | POST | `/api/download/to-file` | `downloadToFileSchema`（内联） | 流式下载大文件到本地（200-500MB 视频） |

### 5.1 `POST /api/download/to-file`

让主进程直接 `fetch` 远程 URL 并流式写入本地文件，绕过渲染进程内存。`filePath` 必须落在 `ALLOWED_ROOTS` 内。默认超时 5 分钟，可通过 `timeout`（毫秒）覆盖；`maxRetries` 控制重试次数。

**请求体**：

```json
{
  "url": "https://cdn.example.com/video/xyz.mp4",
  "filePath": "<userData>/Cache/Videos/xyz.mp4",
  "timeout": 600000,
  "maxRetries": 3
}
```

**响应**：

```json
{
  "success": true,
  "data": {
    "totalBytes": 283115520,
    "duration": 18450
  }
}
```

---

## 六、ffmpeg-routes（2 条）

| 路由 key | 方法 | 端点 | Schema | 描述 |
|---|---|---|---|---|
| `ffmpeg/probe` | POST | `/api/ffmpeg/probe` | `probeSchema`（内联） | 检查 ffmpeg 可用性 |
| `ffmpeg/execute` | POST | `/api/ffmpeg/execute` | `executeSchema`（内联） | 执行 ffmpeg 命令（超时上限 30 分钟） |

### 6.1 `POST /api/ffmpeg/probe`

探测指定 `ffmpegPath` 是否存在且可执行。省略 `ffmpegPath` 时使用系统默认。

**请求体**：

```json
{ "ffmpegPath": "C:\\ffmpeg\\bin\\ffmpeg.exe" }
```

**响应**：

```json
{
  "success": true,
  "data": { "available": true, "version": "ffmpeg version 6.0 ..." }
}
```

### 6.2 `POST /api/ffmpeg/execute`

执行 ffmpeg 命令。**不接受 shell 字符串**，仅接受参数数组。

**请求体**：

```json
{
  "args": ["-i", "input.mp4", "-c:v", "libx264", "output.mp4"],
  "ffmpegPath": "C:\\ffmpeg\\bin\\ffmpeg.exe",
  "timeout": 1800000
}
```

**响应**（成功）：

```json
{
  "success": true,
  "data": {
    "exitCode": 0,
    "stdout": "...",
    "stderr": "...",
    "duration": 12500
  }
}
```

**响应**（失败，仍返回详细输出）：

```json
{
  "success": false,
  "error": "ffmpeg execution failed",
  "data": { "exitCode": 1, "stdout": "", "stderr": "...", "duration": 800 }
}
```

---

## 七、file-routes（13 条）

| 路由 key | 方法 | 端点 | Schema | 描述 |
|---|---|---|---|---|
| `file/save` | POST | `/api/file/save` | `fileSaveSchema` | 按分类保存文件 |
| `file/read` | POST | `/api/file/read` | `fileReadSchema` | 读取文件返回 base64 |
| `file/read-base64` | POST | `/api/file/read-base64` | `fileReadSchema` | 读取文件返回 dataUrl |
| `file/delete` | POST | `/api/file/delete` | `fileDeleteSchema` | 删除文件 |
| `file/exists` | POST | `/api/file/exists` | `fileExistsSchema` | 检查文件是否存在 |
| `file/copy` | POST | `/api/file/copy` | `fileCopySchema` | 跨分类复制文件 |
| `file/list` | POST | `/api/file/list` | `fileListSchema` | 列出分类目录文件 |
| `file/info` | POST | `/api/file/info` | `fileInfoSchema` | 文件元信息 |
| `file/write-atomic` | POST | `/api/file/write-atomic` | `fileWriteAtomicSchema` | 原子写入 |
| `file/write` | POST | `/api/file/write` | `fileWriteSchema` | 按绝对路径写入（100MB 上限） |
| `file/write-binary` | POST | `/api/file/write-binary` | 无（路径从 `X-File-Path` header） | 二进制直写（500MB 上限） |
| `file/cache-directory` | POST / GET | `/api/file/cache-directory` | `fileCacheDirectorySchema` | 缓存目录路径 |
| `file/disk-space` | POST | `/api/file/disk-space` | `fileDiskSpaceSchema` | 磁盘空间查询 |

`category` 字段枚举：`character` / `scene` / `storyboard` / `video-cache` / `image-cache` / `upload` / `plugin`。

### 7.1 `POST /api/file/save`

按分类保存文件，文件名由 `key` 指定。

**请求体**：

```json
{
  "category": "character",
  "key": "char-001/portrait.png",
  "data": "iVBORw0KGgoAAAANSUhEUgAA...",
  "mimeType": "image/png"
}
```

### 7.2 `POST /api/file/read` 与 `POST /api/file/read-base64`

两者使用相同的 `fileReadSchema`（仅 `key`），但返回形态不同：

- `file/read`：返回 base64 字符串。
- `file/read-base64`：返回 `data:<mime>;base64,<...>` 形式的 dataUrl，可直接用于 `<img src>`。

读取超过 `MAX_READ_SIZE`（50MB）的文件返回 `FILE_TOO_LARGE`。

**响应**（file/read-base64）：

```json
{
  "success": true,
  "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

### 7.3 `POST /api/file/list`

列出分类目录文件，支持分页。结果超过 `MAX_DIR_SCAN`（5000）时截断并附带 `warning`。

**请求体**：

```json
{ "category": "video-cache", "limit": 100, "offset": 0 }
```

### 7.4 `POST /api/file/write`

按绝对路径写入文本或 base64 编码的二进制数据，路径必须落在 `ALLOWED_ROOTS` 内。上限 `MAX_WRITE_SIZE`（100MB）。

**请求体**：

```json
{
  "filePath": "<userData>/Cache/Videos/meta.json",
  "data": "{\"taskId\":\"t-1\",\"status\":\"done\"}",
  "encoding": "utf-8"
}
```

base64 模式：

```json
{
  "filePath": "<userData>/Assets/Characters/thumb.png",
  "data": "iVBORw0KGgoAAAANSUhEUgAA...",
  "encoding": "base64"
}
```

### 7.5 `POST /api/file/write-binary`（二进制直写）

用于大文件直写（200-500MB 视频）。`Content-Type` 必须为 `application/octet-stream`，目标路径通过 `X-File-Path` header 传递（避免 JSON 解析开销）。

**请求**：

```http
POST /api/file/write-binary HTTP/1.1
Content-Type: application/octet-stream
X-File-Path: <userData>/Cache/Videos/xyz.mp4
X-Electron-App: <token>
Content-Length: 283115520

<binary body>
```

**响应**：

```json
{ "success": true }
```

### 7.6 `POST /api/file/disk-space`

查询指定目录所在磁盘的可用空间。

**请求体**：

```json
{ "dirPath": "<userData>/Cache/Videos" }
```

**响应**：

```json
{
  "success": true,
  "data": { "free": 53687091200, "total": 107374182400 }
}
```

---

## 八、generation-routes（22 条）

| 路由 key | 方法 | 端点 | Schema | 描述 |
|---|---|---|---|---|
| `analyze-image` | POST | `/api/analyze-image` | `analyzeImageSchema` | 图像分析 |
| `generate-image` | POST | `/api/generate-image` | `generateImageSchema` | 图像生成 |
| `generate-keyframe` | POST | `/api/generate-keyframe` | `generateKeyframeSchema` | 关键帧生成 |
| `generate-frame-pair` | POST | `/api/generate-frame-pair` | `generateFramePairSchema` | 首尾帧对生成 |
| `generate-video` | POST | `/api/generate-video` | `generateVideoSchema` | 视频生成 |
| `video-status` | GET / POST | `/api/video-status` | `videoStatusSchema` | 视频任务状态查询 |
| `generate-text` | POST | `/api/generate-text` | `generateTextSchema` | 文本生成（非流式） |
| `generate-text-stream` | POST | `/api/generate-text-stream` | `generateTextStreamSchema` | 流式文本生成（SSE） |
| `generate-chat` | POST | `/api/generate-chat` | `generateChatSchema` | 对话补全（支持 function calling） |
| `generate-chat-stream` | POST | `/api/generate-chat-stream` | `generateChatStreamSchema` | 流式对话补全（SSE + tools） |
| `generate-embedding` | POST | `/api/generate-embedding` | `generateEmbeddingSchema` | Embedding 向量生成 |
| `generate-audio` | POST | `/api/generate-audio` | `generateAudioSchema` | 音频合成 TTS |
| `transcribe-audio` | POST | `/api/transcribe-audio` | `transcribeAudioSchema` | 音频转写 STT |
| `story/plan` | POST | `/api/story/plan` | `storyPlanSchema` | 故事规划生成 |
| `story/generate-video` | POST | `/api/story/generate-video` | `storyGenerateVideoSchema` | 故事视频生成 |
| `story/generate-keyframe` | POST | `/api/story/generate-keyframe` | `storyGenerateKeyframeSchema` | 故事关键帧生成 |
| `story/generate-frame-pair` | POST | `/api/story/generate-frame-pair` | `storyGenerateFramePairSchema` | 故事首尾帧对生成 |
| `quick-generate/video` | POST | `/api/quick-generate/video` | `quickGenerateVideoSchema` | 快速视频生成 |
| `character/generate-image` | POST | `/api/character/generate-image` | `characterGenerateImageSchema` | 角色图像生成 |
| `scene/generate-image` | POST | `/api/scene/generate-image` | `sceneGenerateImageSchema` | 场景图像生成 |
| `character/analyze-image` | POST | `/api/character/analyze-image` | `characterAnalyzeImageSchema` | 角色图像分析 |
| `scene/analyze-image` | POST | `/api/scene/analyze-image` | `sceneAnalyzeImageSchema` | 场景图像分析 |

### 8.1 `POST /api/generate-image`

**请求体**：

```json
{
  "prompt": "一个穿着红色斗篷的少女，半身像，动漫风格",
  "category": "character",
  "size": "1024x1024",
  "providerId": "doubao",
  "modelId": "doubao-image-v2"
}
```

**响应**：

```json
{
  "success": true,
  "data": { "imageUrl": "<userData>/Assets/Characters/char-xxx.png" }
}
```

### 8.2 `POST /api/generate-video`

支持首帧、尾帧、角色/场景引用、参考视频等多种组合。

**请求体**：

```json
{
  "prompt": "少女转头看向镜头",
  "firstFrameUrl": "<userData>/Assets/Storyboards/kf-001.png",
  "lastFrameUrl": "<userData>/Assets/Storyboards/kf-002.png",
  "characterRefs": ["<userData>/Assets/Characters/char-001.png"],
  "sceneRef": "<userData>/Assets/Scenes/scene-001.png",
  "duration": 5,
  "providerId": "seedance",
  "modelId": "seedance-2.5"
}
```

参考视频模式：

```json
{
  "prompt": "...",
  "referenceVideo": {
    "videoUrl": "<userData>/Cache/Videos/ref.mp4",
    "mimicryLevel": "high"
  }
}
```

### 8.3 `POST /api/generate-chat`（非流式对话补全）

**请求体**：

```json
{
  "messages": [
    { "role": "system", "content": "你是故事创作助手" },
    { "role": "user", "content": "帮我写一个 5 秒镜头的描述" }
  ],
  "maxTokens": 2048,
  "temperature": 0.7,
  "providerId": "openai",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_character",
        "description": "查询角色档案",
        "parameters": { "type": "object", "properties": { "id": { "type": "string" } } }
      }
    }
  ]
}
```

### 8.4 流式路由特别说明

`generate-text-stream` 和 `generate-chat-stream` 标记 `stream: true`，由 `server.ts` 的 `executeStreamRoute` 处理：

**SSE 事件格式**：

| 事件类型 | wire format | 含义 |
|---------|-------------|------|
| chunk | `data: {"_t":"chunk","chunk":<data>}\n\n` | handler 通过 `sink.sendChunk(data)` 推送的业务分片 |
| done | `data: {"_t":"done","result":<handler返回值>}\n\n` | handler 正常返回时发送的终止事件 |
| error | `data: {"_t":"error","error":"<message>"}\n\n` | handler 抛错时发送的终止事件 |

**响应头**：

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**`POST /api/generate-text-stream` 请求体**：

```json
{
  "prompt": "写一段关于秋天的散文",
  "maxTokens": 2048,
  "temperature": 0.7,
  "providerId": "openai",
  "modelId": "gpt-4o",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "lookup_dict",
        "description": "查询词汇",
        "parameters": { "type": "object", "properties": {} }
      }
    }
  ]
}
```

**SSE 响应示例**：

```
data: {"_t":"chunk","chunk":{"text":"秋天"}}

data: {"_t":"chunk","chunk":{"text":"的"}}

data: {"_t":"chunk","chunk":{"text":"第一片"}}

data: {"_t":"chunk","chunk":{"text":"落叶"}}

data: {"_t":"done","result":{"success":true,"data":{"fullText":"秋天的第一片落叶..."}}}

```

**`POST /api/generate-chat-stream` 请求体**（messages + tools）：

```json
{
  "messages": [
    { "role": "user", "content": "帮我生成镜头描述" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_scene",
        "description": "查询场景",
        "parameters": { "type": "object", "properties": { "id": { "type": "string" } } }
      }
    }
  ],
  "providerId": "openai"
}
```

**客户端消费建议**：按行读取，前缀 `data: ` 后为 JSON，根据 `_t` 字段分发到 chunk / done / error 三种处理分支；收到 `done` 或 `error` 后关闭连接。

---

## 九、plugin-routes（15 条）

| 路由 key | 方法 | 端点 | Schema | 描述 |
|---|---|---|---|---|
| `video/select-strategy` | POST | `/api/video/select-strategy` | `videoSelectStrategySchema` | 选择视频服务商策略 |
| `video/detect-format` | POST | `/api/video/detect-format` | `videoDetectFormatSchema` | 检测视频 API 格式 |
| `plugins/list` | GET | `/api/plugins/list` | 无 | 列出所有插件 |
| `plugins/capabilities` | GET | `/api/plugins/capabilities` | 无 | 插件能力详情 |
| `plugins/detection-rules` | GET | `/api/plugins/detection-rules` | 无 | API key 检测规则 |
| `plugins/add` | POST | `/api/plugins/add` | `pluginAddSchema` | 添加用户插件 |
| `plugins/delete` | POST | `/api/plugins/delete` | `pluginDeleteSchema` | 删除用户插件 |
| `plugins/reload` | POST | `/api/plugins/reload` | 无 | 重载用户插件 |
| `plugins/reload-code` | POST | `/api/plugins/reload-code` | 无 | 重载代码插件 |
| `plugins/process-metrics` | GET | `/api/plugins/process-metrics` | 无 | 插件进程指标 |
| `plugins/validate` | POST | `/api/plugins/validate` | `pluginValidateSchema` | 验证插件配置 |
| `plugins/schema` | GET | `/api/plugins/schema` | 无 | 插件 JSON Schema |
| `plugins/specification` | GET | `/api/plugins/specification` | 无 | 插件规范文档 |
| `plugins/templates` | GET | `/api/plugins/templates` | 无 | 插件模板列表 |
| `plugins/code-plugins-dir` | GET | `/api/plugins/code-plugins-dir` | 无 | 代码插件目录路径 |

### 9.1 `POST /api/plugins/add`

**请求体**：

```json
{
  "config": {
    "id": "my-custom-provider",
    "name": "我的自定义服务商",
    "type": "image",
    "apiUrl": "https://api.example.com/v1",
    "capabilities": ["generate-image"]
  }
}
```

### 9.2 `GET /api/plugins/list`

无请求体。返回所有内置 + 用户插件清单。

**响应**（节选）：

```json
{
  "success": true,
  "data": [
    { "id": "doubao", "name": "豆包", "type": "image", "source": "builtin" },
    { "id": "my-custom-provider", "name": "我的自定义服务商", "type": "image", "source": "user" }
  ]
}
```

---

## 十、shot-routes（10 条）

| 路由 key | 方法 | 端点 | Schema | 描述 |
|---|---|---|---|---|
| `shot/validate-reference` | POST | `/api/shot/validate-reference` | `shotValidateReferenceSchema` | 校验镜头引用 |
| `shot/get-reference-video-url` | POST | `/api/shot/get-reference-video-url` | `shotGetReferenceVideoUrlSchema` | 获取引用视频 URL |
| `shot/build-reference-description` | POST | `/api/shot/build-reference-description` | `shotBuildReferenceDescriptionSchema` | 构建引用描述 |
| `validate/consistency` | POST | `/api/validate/consistency` | `validateConsistencySchema` | 一致性配置检查 |
| `validate/feature-anchoring` | POST | `/api/validate/feature-anchoring` | `validateFeatureAnchoringSchema` | 特征锚定校验 |
| `validate/no-frame-binding` | POST | `/api/validate/no-frame-binding` | `validateNoFrameBindingSchema` | 无帧绑定校验 |
| `reference/check-character` | POST | `/api/reference/check-character` | `referenceCheckCharacterSchema` | 检查角色引用 |
| `reference/check-scene` | POST | `/api/reference/check-scene` | `referenceCheckSceneSchema` | 检查场景引用 |
| `visual-consistency/check` | POST | `/api/visual-consistency/check` | `visualConsistencyCheckSchema` | 视觉一致性检查 |
| `visual-consistency/check-beat` | POST | `/api/visual-consistency/check-beat` | `visualConsistencyCheckBeatSchema` | Beat 元素视觉一致性检查 |

### 10.1 `POST /api/reference/check-character`

检查指定角色在故事集中是否被引用。

**请求体**：

```json
{
  "characterId": "char-001",
  "stories": [
    {
      "id": "story-1",
      "title": "我的故事",
      "beats": [{ "characters": ["char-001"] }]
    }
  ]
}
```

**响应**：

```json
{
  "success": true,
  "data": {
    "characterId": "char-001",
    "referencedBy": ["story-1"],
    "count": 1
  }
}
```

### 10.2 `POST /api/visual-consistency/check-beat`

对一个 Beat 内的多个元素批量进行视觉一致性检查。

**请求体**（节选）：

```json
{
  "beat": { "id": "beat-001", "elements": ["el-1", "el-2"] },
  "elements": [
    {
      "id": "el-1",
      "name": "主角",
      "type": "character",
      "characterConfig": { "appearance": { "hairColor": "黑" } }
    }
  ],
  "generatedImageMap": {
    "el-1": "<userData>/Assets/Characters/char-001.png"
  }
}
```

---

## 十一、storyboard-routes（9 条）

| 路由 key | 方法 | 端点 | Schema | 描述 |
|---|---|---|---|---|
| `video/tracking-info` | POST | `/api/video/tracking-info` | `videoTrackingInfoSchema` | 构建视频追踪信息 |
| `video/provider-info` | POST | `/api/video/provider-info` | `videoProviderInfoSchema` | 获取视频 provider 信息 |
| `storyboard/generate-keyframe` | POST | `/api/storyboard/generate-keyframe` | `storyboardGenerateKeyframeSchema` | 生成 Beat 关键帧 |
| `storyboard/generate-frame-pair` | POST | `/api/storyboard/generate-frame-pair` | `storyboardGenerateFramePairSchema` | 生成 Beat 首尾帧对 |
| `storyboard/generate-video` | POST | `/api/storyboard/generate-video` | `storyboardGenerateVideoSchema` | 生成 Beat 视频 |
| `storyboard/generate-full-workflow` | POST | `/api/storyboard/generate-full-workflow` | `storyboardGenerateFullWorkflowSchema` | 生成 Beat 完整工作流（关键帧 + 视频） |
| `storyboard/generate-keyframe-chain` | POST | `/api/storyboard/generate-keyframe-chain` | `storyboardGenerateKeyframeChainSchema` | 生成关键帧链（多 Beat 连续生成） |
| `video/recover` | POST | `/api/video/recover` | `videoRecoverSchema` | 恢复中断的视频任务 |
| `video-tasks/bulk-save` | POST | `/api/video-tasks/bulk-save` | `videoTasksBulkSaveSchema` | 批量保存视频任务 |

### 11.1 `POST /api/storyboard/generate-keyframe`

为一个 Beat 生成关键帧，可传入前一帧以保持连贯。

**请求体**（节选）：

```json
{
  "beat": {
    "id": "beat-001",
    "content": "少女在树林中行走",
    "shotType": "中景",
    "camera": { "angle": "平视", "movement": "跟随" }
  },
  "prevBeat": { "id": "beat-000", "content": "少女站在树下" },
  "options": {
    "providerId": "doubao",
    "modelId": "doubao-image-v2",
    "characterRefs": ["<userData>/Assets/Characters/char-001.png"]
  }
}
```

### 11.2 `POST /api/storyboard/generate-full-workflow`

执行 Beat 的完整生成流程：关键帧 → 视频。返回所有中间产物。

**请求体**：

```json
{
  "beat": { "id": "beat-001", "content": "..." },
  "prevBeat": { "id": "beat-000", "content": "..." },
  "options": { "providerId": "seedance", "modelId": "seedance-2.5" }
}
```

**响应**：

```json
{
  "success": true,
  "data": {
    "keyframe": { "imageUrl": "<userData>/Assets/Storyboards/kf-001.png" },
    "video": { "videoUrl": "<userData>/Cache/Videos/beat-001.mp4" }
  }
}
```

### 11.3 `POST /api/video/recover`

恢复中断的视频任务。`taskRecord` 可选，未提供时从持久化存储加载。

**请求体**：

```json
{
  "taskId": "task-abc-123",
  "taskRecord": { "taskId": "task-abc-123", "status": "pending", "apiUrl": "..." }
}
```

### 11.4 `POST /api/video-tasks/bulk-save`

批量保存视频任务到持久化存储。`tasks` 数组中每个元素为任务记录（`Record<string, unknown>`）。

**请求体**：

```json
{
  "tasks": [
    { "taskId": "task-1", "status": "done", "videoUrl": "..." },
    { "taskId": "task-2", "status": "pending" }
  ]
}
```

---

## 附录：路由注册表

路由表在 `electron/src/api/routes.ts` 中合并 9 个路由组：

```typescript
export const routes: Record<string, Route> = {
  ...coreRoutes,         // 10 条
  ...dbRoutes,           // 3 条
  ...downloadRoutes,     // 1 条
  ...ffmpegRoutes,       // 2 条
  ...fileRoutes,         // 13 条
  ...generationRoutes,   // 22 条
  ...pluginRoutes,       // 15 条
  ...shotRoutes,         // 10 条
  ...storyboardRoutes,   // 9 条
};
// 合计 85 条
```

每条路由通过 `defineRoute({ schema?, handler, methods, stream? })` 定义，`schema` 为可选 Zod schema（部分路由如 `file/write-binary`、`plugins/list` 等无 schema，由 handler 自行处理）。
