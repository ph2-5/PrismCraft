# AI Animation Studio 项目总文档

> 版本：0.8.0-beta.1 | 文档更新日期：2026-05-23
> 本文档仅描述项目当前状态，不含修改记录

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [架构设计](#3-架构设计)
4. [目录结构](#4-目录结构)
5. [Electron 主进程](#5-electron-主进程)
6. [AI 提供商插件系统](#6-ai-提供商插件系统)
7. [API 网关与 API 服务](#7-api-网关与-api-服务)
8. [前端页面与路由](#8-前端页面与路由)
9. [领域层（Domain）](#9-领域层domain)
10. [基础设施层（Infrastructure）](#10-基础设施层infrastructure)
11. [功能模块层（Modules）](#11-功能模块层modules)
12. [数据库 Schema](#12-数据库-schema)
13. [安全机制](#13-安全机制)
14. [网络层](#14-网络层)
15. [依赖注入容器](#15-依赖注入容器)
16. [自定义协议](#16-自定义协议)
17. [日志系统](#17-日志系统)
18. [测试体系](#18-测试体系)
19. [构建与部署](#19-构建与部署)
20. [配置管理](#20-配置管理)
21. [数据同步](#21-数据同步)
22. [视频任务管理](#22-视频任务管理)
23. [提示词引擎](#23-提示词引擎)
24. [参考引擎与一致性检查](#24-参考引擎与一致性检查)
25. [用户插件规范](#25-用户插件规范)

---

## 1. 项目概述

AI Animation Studio 是一款 AI 驱动的动画制作工具，采用本地优先（Local-First）架构，支持从故事创作到视频生成的完整工作流。项目基于 Electron + Next.js 双轨架构，**以 Electron 桌面应用为唯一交付目标**，Next.js 仅作为前端渲染层内嵌于 Electron 中运行。

### 1.1 核心定位

- **本地优先**：所有数据存储在本地 SQLite 数据库，API Key 通过 Electron safeStorage 加密存储（不可用时回退到 AES-256-GCM），不依赖云服务存储用户数据。应用完全可离线使用（AI 生成功能需联网），所有核心功能均在本地完成，云端同步为可选扩展
- **Electron 优先**：项目以 Electron 桌面应用为唯一交付目标，Web 模式仅用于开发调试。所有安全机制（SSRF 防护、safeStorage 加密、IPC 白名单）、数据库访问、插件系统均围绕 Electron 主进程设计，渲染进程通过 localhost API Server 和 IPC 通道与主进程通信
- **AI 驱动**：通过插件化架构对接多家 AI 提供商，支持文本生成、图片生成、图片分析、视频生成等 AI 能力
- **AI 全权开发维护**：项目架构、代码规范、模块契约均针对 AI 代码助手优化——DDD 子域化模块、ESLint 分层守卫规则、MODULE.md 契约文档、`/health` 健康端点、`project_rules.md` 开发指令，确保 AI 在每次会话中能快速理解项目约束并产出合规代码
- **完整工作流**：覆盖故事创作 → 角色设计 → 场景设计 → 分镜生成 → 视频生成的全链路
- **插件化扩展**：内置 9 个 AI 提供商插件 + 1 个 OpenAI 兼容 Fallback 插件，支持用户通过 JSON 配置自定义提供商

### 1.2 应用场景

- 故事剧本创作与 AI 辅助规划
- 角色与场景的 AI 生成和管理
- 分镜关键帧图片的 AI 生成
- 首帧/尾帧图片对生成
- AI 视频生成与状态轮询
- 角色服装合成与一致性检查
- 项目数据的导入导出

### 1.3 核心功能矩阵

| 功能 | 描述 | 涉及模块 |
|------|------|----------|
| 故事创建 | AI 生成故事大纲与分镜 | story, prompt |
| 角色管理 | 角色外观/服装/表情管理 | character |
| 场景管理 | 场景氛围/光照/元素管理 | scene |
| 分镜编辑 | 分镜详情编辑/排序/绑定 | story/beat-editor |
| 关键帧生成 | AI 生成关键帧图像 | story/generation, prompt |
| 首尾帧生成 | AI 生成首帧/尾帧 | story/generation, prompt |
| 视频生成 | AI 生成视频 (图生视频/文生视频) | video, story/generation |
| 视频缓存 | 本地缓存已生成视频 | video/cache |
| 智能重试 | 失败任务自动/手动恢复 | video/recovery |
| 任务管理 | 视频任务状态追踪与筛选 | video/task-management |
| 镜头一致性 | 角色/场景跨分镜一致性检查 | shot |
| 模板管理 | 分镜模板创建/应用/版本控制 | story/template |
| 云端同步 | 多设备数据同步（预留） | sync |
| URL 安全验证 | 阻止内网请求/SSRF 防护 | shared/utils |

### 1.4 业务模块总览

| 模块 | 英文 | 核心职责 | 子域数 |
|------|------|----------|--------|
| 视频模块 | video | 视频任务管理、智能重试、缓存 | 4 |
| 故事模块 | story | 故事规划、分镜编辑、生成 | 5 |
| 镜头模块 | shot | 一致性检查、特征提取、参考 | 7 |
| 角色模块 | character | 角色 CRUD、服装、图片 | 2 |
| 场景模块 | scene | 场景 CRUD、图片 | 2 |
| 提示词模块 | prompt | 提示词构建、优化 | 7 |
| 资产模块 | asset | 媒体资产、导入导出 | 5 |
| 同步模块 | sync | 云端同步、冲突解决 | 2 |
| 安全模块 | security | API Key 安全存取、IPC 安全通道 | 1 |
| 持久化模块 | persistence | 自动保存、保存互斥锁、事务级联删除 | 2 |
| 完整性模块 | integrity | SQL 安全、Schema 注册、稳定依赖 | 2 |
| 反馈模块 | feedback | 脏标记追踪、可撤销操作 | 2 |

### 1.5 版本信息

| 项目 | 值 |
|------|-----|
| 版本号 | 0.7.0-beta.1 |
| 许可证 | MIT |
| 应用 ID | com.ai-animation-studio.app |
| 产品名 | AI Animation Studio |

---

## 2. 技术栈

### 2.1 核心框架

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | ^41.5.1 | 桌面应用壳 |
| Next.js | 16.2.2 | 前端框架（Turbopack） |
| React | 19.2.4 | UI 库 |
| TypeScript | ^6.0.3 | 类型系统 |
| better-sqlite3 | 12.10.0 | 本地 SQLite 数据库（版本锁定，不使用 ^） |

### 2.2 状态管理与数据

| 技术 | 版本 | 用途 |
|------|------|------|
| Zustand | ^5.0.12 | 客户端状态管理 |
| @tanstack/react-query | ^5.100.9 | 服务端状态管理 |
| drizzle-orm | ^0.45.2 | ORM（部分使用） |
| zod | ^4.4.3 | Schema 校验 |

### 2.3 UI 与交互

| 技术 | 版本 | 用途 |
|------|------|------|
| Tailwind CSS | ^4.3.0（@tailwindcss/postcss） | 样式系统 |
| shadcn/ui | ^4.1.2 | UI 组件库 |
| lucide-react | ^1.7.0 | 图标库 |
| @dnd-kit | ^6.3.1 | 拖拽交互 |
| cmdk | ^1.1.1 | 命令面板 |
| react-window | ^2.2.7 | 虚拟滚动 |
| react-hook-form | ^7.75.0 | 表单管理 |

### 2.4 工具链

| 技术 | 版本 | 用途 |
|------|------|------|
| Vitest | ^4.1.7 | 单元测试 |
| Playwright | ^1.59.1 | E2E 测试 |
| ESLint | ^9.39.4 | 代码检查 |
| electron-builder | ^26.8.1 | 应用打包 |
| electron-updater | ^6.8.3 | 自动更新 |

### 2.5 其他依赖

| 技术 | 版本 | 用途 |
|------|------|------|
| jszip | ^3.10.1 | ZIP 压缩/解压 |
| docx | ^9.6.1 | Word 文档导出 |
| file-saver | ^2.0.5 | 文件下载 |
| electron-store | ^11.0.2 | Electron 配置存储 |

---

## 3. 架构设计

### 3.1 整体架构

项目采用 Electron + Next.js 双轨架构，**以 Electron 为核心运行时**，Next.js 作为前端渲染层内嵌运行。架构分为两个运行环境（Electron 模式为生产环境，Web 模式仅用于开发调试）：

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 主进程                        │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │ main.ts  │  │ api-     │  │ 插件系统               │  │
│  │          │  │ server.ts│  │ (PluginRegistry +      │  │
│  │ BrowserWindow │ :30100 │  │  9 内置 + Fallback + 用户插件) │  │
│  └──────────┘  └──────────┘  └───────────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │ api-     │  │ database │  │ security              │  │
│  │ gateway  │  │ (SQLite) │  │ (SSRF + KeyStorage)   │  │
│  └──────────┘  └──────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────┘
           │ IPC (contextIsolation: true)
           ▼
┌─────────────────────────────────────────────────────────┐
│                  渲染进程（Next.js）                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │ Pages    │  │ Modules  │  │ Infrastructure        │  │
│  │ (11 页)  │  │ (12 模块)│  │ (Storage + Network +  │  │
│  │          │  │          │  │  DI + Monitoring)      │  │
│  └──────────┘  └──────────┘  └───────────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │ Domain   │  │ Shared   │  │ API Client            │  │
│  │ (Ports + │  │ (EventBus│  │ (localhost:30100)     │  │
│  │  Schemas)│  │  + Utils)│  │                       │  │
│  └──────────┘  └──────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 请求执行路径

在 Electron 模式下，前端发起的 AI 请求遵循以下路径：

```
前端组件 → API Client (src/infrastructure/api/client.ts)
         → localhost:30100 (HTTP)
         → api-server.ts (路由分发)
         → api-gateway.ts (配置解析 + 插件选择)
         → pluginRegistry.select(apiUrl, model)
         → 具体 AIProviderPlugin (buildXxxRequest + getAuthHeaders)
         → makeRequest (SSRF 检查 + HTTP 请求)
         → 插件解析响应 (extractXxxContent)
         → 返回结果
```

同步请求遵循类似的主进程代理路径：

```
前端组件 → API Client (src/infrastructure/api/client.ts)
         → localhost:30100/api/sync/proxy (HTTP)
         → api-server.ts (路由分发)
         → handlers/sync.ts (SSRF 验证 + 凭证注入)
         → sync-http-client.ts (主进程→远端同步服务器)
         → 返回结果
```

### 3.3 分层架构

前端代码遵循 DDD 分层架构原则，依赖方向严格内向：

```
Pages (页面层)
  └── Modules (功能模块层)
       ├── Domain (领域层：Ports + Schemas + Services + Types)
       ├── Shared (共享工具：EventBus + ErrorHandler + Utils)
       └── Infrastructure/di (仅通过 DI 容器访问)
Infrastructure (基础设施层：Storage + Network + DI + AI Providers)
  └── Domain, Shared
Shared (共享工具)
  └── Domain only
Domain (领域层)
  └── NOTHING (纯类型，零外部依赖)
```

**依赖方向规则**：
- `app/` → `modules/` → `domain/`
- `modules/` → `shared/`、`infrastructure/di`（仅通过 DI 容器）
- `infrastructure/` → `domain/`、`shared/`
- `shared/` → `domain/` only（禁止 `modules/` 和 `infrastructure/`）
- `domain/` → NOTHING（纯类型，零外部依赖）

**ESLint DDD 分层守卫**：`eslint.config.mjs` 已配置 `no-restricted-imports` 规则，自动检测分层违规：
- `domain/**` 禁止 import `@/infrastructure/**` 和 `@/modules/**`（error 级别）
- `shared/**` 禁止 import `@/infrastructure/**` 和 `@/modules/**`（warn 级别）
- `modules/**` 禁止直接 import `@/infrastructure/*` 子域（`@/infrastructure/di` 除外）（warn 级别）

### 3.4 双轨构建机制

项目同时支持 Web 模式和 Electron 模式，但 **Electron 模式是唯一的生产交付目标**：

- **Web 模式**（仅开发调试）：`next dev` / `next build`，使用 `src/app/api/` 下的 Next.js API Routes，不具备 safeStorage 加密、SSRF 防护等安全机制
- **Electron 模式**（生产环境）：`npm run build:electron`，构建时 `api-routes-manager.js` 将 `src/app/api/` 下的 AI 相关路由重命名为 `.electron-build-disabled`，所有 AI 请求走 Electron 主进程的 `api-server.ts`，具备完整的安全机制和本地数据库访问

### 3.5 Electron主进程与渲染进程通信时序

从用户点击"生成视频"按钮到视频URL返回渲染进程，整个通信链路横跨渲染进程、Preload桥接层、Electron主进程三个隔离的运行环境。理解这条链路的关键在于：渲染进程和主进程之间不存在直接函数调用，所有通信必须经过IPC（Inter-Process Communication）通道序列化传输。下面逐帧描述完整的消息流向。

**视频生成请求的完整时序**如下：

```
User(点击"生成视频")
  → React组件(调用apiClient.post("generate-video", body))
    → API Client(构造HTTP请求，baseUrl="http://localhost:30100")
      → HTTP POST /api/generate-video → localhost:30100
        → api-server.ts(路由匹配，调用generateVideo handler)
          → api-gateway.ts(generateVideo函数)
            → resolveApiConfig(body) 解析apiUrl/apiKey/model
            → pluginRegistry.select(apiUrl, model) 选择插件
              → VolcenginePlugin.match() 返回true
            → plugin.buildVideoRequest(ctx) 构建请求体和端点
            → plugin.getAuthHeaders(apiKey) 构造认证头
            → makeRequest(url, options)
              → ssrfGuard.validate(url) SSRF安全检查
              → HTTP POST → 远端AI服务
              ← HTTP Response {id: "task_abc123"}
            → plugin.extractTaskId(response) → "task_abc123"
          ← 返回{taskId, status:"pending"}
        ← HTTP Response {taskId, status:"pending"}
      ← fetch()返回Response对象
    → apiClient解析JSON → ok({taskId, status:"pending"})
  → React组件更新Zustand Store → UI重渲染显示"生成中"
```

这条链路中，渲染进程通过 `fetch()` 发起HTTP请求到 `localhost:30100`，而非直接使用IPC。这是一个关键的设计决策：选择HTTP而非IPC的原因是，前端代码在Web模式和Electron模式下共享同一套API Client，Web模式下没有IPC通道，只能使用HTTP。通过将Electron主进程的API Server监听在 `localhost:30100`，前端代码只需切换 `baseUrl`（Electron模式下为 `http://localhost:30100`，Web模式下为空字符串，走Next.js API Routes），即可在两种模式下无缝运行。如果不采用HTTP而改用IPC直接通信，前端代码必须为两种模式维护两套调用逻辑，增加维护成本且容易产生行为不一致的bug。

**数据库访问的IPC时序**与视频生成不同，它走的是 `contextBridge` 暴露的 `electronAPI` 对象：

```
React组件(调用window.electronAPI.dbQuery(sql, params))
  → preload.ts(contextBridge暴露的dbQuery函数)
    → ipcRenderer.invoke("db:query", sql, params) 序列化参数
      → Electron主进程 ipcMain.handle("db:query")
        → handlers/database.ts validateSql(sql) 安全校验
          → 阻止DDL/DROP/ALTER/TRUNCATE/ATTACH
          → 阻止多语句和注释
          → 校验表名在ALLOWED_TABLES白名单中
        → ensureDb() 确保数据库已初始化
        → db-connection.ts query(sql, params) 执行SQL
          → enqueueOperation() 排队保证串行
          → db.prepare(sql).all(...params) 执行查询
        ← 返回{success:true, data:result}
      ← ipcMain.handle返回结果
    → ipcRenderer.invoke Promise resolve
  → React组件收到查询结果
```

数据库访问选择IPC而非HTTP的原因是：数据库操作是高频、低延迟的本地操作，HTTP的请求/响应开销（TCP握手、HTTP头解析、JSON序列化）在每次查询中约增加5-10ms延迟，对于列表渲染等需要连续数十次查询的场景，累积延迟不可接受。IPC通道的通信开销约为0.5-1ms，比HTTP快一个数量级。此外，IPC通道支持白名单和SQL安全校验，而HTTP端点需要额外的认证机制。

**视频状态轮询时序**是视频生成后的持续查询过程：

```
React组件(轮询定时器触发)
  → apiClient.post("video-status", {apiUrl, apiKey, taskId, model})
    → HTTP POST /api/video-status → localhost:30100
      → api-server.ts → api-gateway.ts videoStatus()
        → pluginRegistry.select() 选择插件
        → plugin.getVideoStatusEndpoint(baseUrl, taskId) 获取状态端点
        → plugin.getStatusMethod() → "GET"
        → plugin.getAuthHeaders(apiKey) 构造认证头
        → makeRequest(statusUrl, {method:"GET", headers, timeout:30000})
          → ssrfGuard.validate() 安全检查
          → HTTP GET → 远端AI服务
          ← HTTP Response {status:"succeeded", output:{video_url:"..."}}
        → plugin.extractStatus(response) → {status:"succeeded"}
        → plugin.extractVideoUrl(response) → "https://cdn.volces.com/video.mp4"
      ← 返回{status:"completed", videoUrl:"..."}
    ← HTTP Response
  → React组件更新Zustand Store → UI显示视频播放器
```

轮询间隔默认为15秒（自适应调整），单次轮询超时30秒。如果连续30次轮询失败，任务被标记为failed。这种"计数而非立即失败"的设计是为了应对不稳定网络环境——一次网络抖动不应让已生成90%的视频前功尽弃。

### 3.6 DDD + 六边形架构原则

| 原则 | 实现 |
|------|------|
| 领域层不依赖基础设施 | `domain/ports/` 定义接口，`infrastructure/` 提供实现 |
| 子域契约驱动 | 每个子域有 `contract.json` 定义公共 API |
| Result Monad | 不使用异常，统一 `Result<T, E>` 返回 |
| Zod Schema 即类型 | Schema 定义 → `z.infer<typeof schema>` 推导类型 |
| 三级导出 | `module/index.ts → subdomain/index.ts → 内部文件` |
| 依赖注入 | `container` 全局容器管理服务实例（49 个 Token） |
| 端口接口注入 | `IElementManager`、`IReferenceEngine` 解耦领域与基础设施 |
| ESLint 架构守卫 | 跨模块深路径阻断（error）、infrastructure 子域阻断（error）、测试文件宽松（warn） |
| 架构扫描脚本 | `scripts/check-architecture.mjs` 检查 6 类 DDD 违规 |
| 时间类型统一 | 全项目使用 Unix 秒（整数），展示层负责转换为可读格式 |

**依赖方向规则**：

```
app/ → modules/ → domain/ ← infrastructure/
                   ↑              │
                   └──────────────┘  (实现端口接口)
shared/ ← 被所有层引用
```

### 3.7 插件系统运行时架构

插件系统的运行时架构围绕 `PluginRegistry` 单例展开，它管理着所有内置插件和用户插件的注册、选择和生命周期。

**PluginRegistry初始化时机**在 `main-common.ts` 中。当Electron应用启动时，`main-common.ts` 的 `createWindow()` 函数在创建BrowserWindow之前调用 `registerAllPlugins()`，该函数从 `electron/src/plugins/index.ts` 导入，按顺序注册9个内置插件：VolcenginePlugin → KuaishouPlugin → ZhipuPlugin → PixversePlugin → SeedancePlugin → GooglePlugin → OpenAISoraPlugin → MiniMaxPlugin → AnthropicPlugin。注册完成后，再调用 `registry.setFallback(new OpenAICompatiblePlugin())` 将OpenAI兼容插件设为兜底（Fallback不在常规插件列表中，仅在所有常规插件都不匹配时使用）。最后调用 `loadUserPlugins(registry)` 加载用户自定义插件。初始化顺序至关重要——内置插件先于用户插件注册，确保内置插件的匹配规则优先于用户插件。

**用户插件加载完整时序**分为九个步骤。第一步，`loadUserPlugins()` 构造插件目录路径 `~/AI Animation Studio/Plugins/`，如果目录不存在则创建。第二步，读取目录下所有 `.plugin.json` 和 `.json` 文件。第三步，对每个文件执行 `JSON.parse()` 解析，如果解析失败则记录错误跳过该文件。第四步，调用 `validatePluginConfig(config)` 校验必填字段：id必须非空且符合格式（小写字母+数字+连字符，不能以连字符开头或结尾），id不能与内置插件冲突（volcengine/kuaishou/zhipu/pixverse/seedance/google/openai-sora/minimax/openai-compatible），displayName/match/capabilities/transport/auth/endpoints/request/response必须存在，match.apiUrlPatterns必须是非空数组。第五步，校验通过后创建 `UserPluginAdapter` 实例，该适配器将JSON配置映射为 `AIProviderPlugin` 接口的方法实现。第六步，调用 `registry.register(adapter, true)` 注册为用户插件，第二个参数 `true` 标记为用户插件以便 `getUserPlugins()` 查询。第七步，如果是首次运行且目录为空，生成 `_example.plugin.json` 示例文件帮助用户理解配置格式。第八步，收集所有加载错误，返回 `{loaded: count, errors: string[]}`。第九步，前端通过 `/api/plugins/list` 端点获取插件列表，展示在插件管理器界面中。

**select(apiUrl, model)匹配算法**采用"先注册先匹配"策略。当 `api-gateway.ts` 需要选择插件时，调用 `pluginRegistry.select(apiUrl, model)`，该函数遍历所有已注册插件（内置在前，用户在后），对每个插件调用 `match(apiUrl, model)`，第一个返回 `true` 的插件被选中。如果没有任何插件匹配，返回Fallback插件（OpenAICompatiblePlugin，其 `match()` 始终返回 `true`）。如果两个插件都匹配同一个URL，先注册的插件优先。例如，如果用户配置的URL是 `https://api.openai.com/v1`，OpenAISoraPlugin的 `match()` 检查URL含 `openai` 且模型含 `sora`，如果模型不含 `sora`则不匹配，继续匹配到Fallback的OpenAICompatiblePlugin。这种"先注册先匹配"而非"最佳匹配"的设计决策基于三个理由：第一，最佳匹配需要定义匹配精度度量标准（如URL前缀长度、正则匹配范围），增加实现复杂度且容易产生歧义；第二，注册顺序是开发者可控的，将更具体的插件注册在前面即可保证优先级；第三，Fallback机制确保了即使所有特定插件都不匹配，请求也能被OpenAI兼容格式处理，不会出现"无插件可用"的空指针错误。

**VolcenginePlugin与AnthropicPlugin的buildVideoRequest实现差异**体现了不同AI提供商API设计的根本分歧。VolcenginePlugin的 `buildVideoRequest()` 构建的是OpenAI Content数组格式：`{model, content:[{type:"text",text:prompt}, {type:"image_url",image_url:{url:firstFrame}}], duration}`，端点为 `/contents/generations/tasks`，支持首帧图片（firstFrameUrl）、尾帧图片（lastFrameUrl）和参考视频（referenceVideoUrl + mimicryLevel），认证使用标准的 `Authorization: Bearer ${apiKey}` 头。AnthropicPlugin的 `buildVideoRequest()` 直接抛出异常 `throw new Error("Anthropic Claude 不支持视频生成")`，因为Claude模型当前不具备视频生成能力。这种"抛异常而非返回空值"的设计决策是因为：返回空值或null会导致调用方需要处理null检查，如果遗漏检查会产生难以定位的空指针错误；抛出异常则能立即中断调用链并给出明确的错误信息，调用方在顶层统一try-catch即可处理。在文本生成方面，VolcenginePlugin继承基类默认实现，使用OpenAI格式的 `/chat/completions` 端点和 `Authorization: Bearer` 认证；AnthropicPlugin使用自定义的 `/messages` 端点，认证头为 `x-api-key` + `anthropic-version: 2023-06-01`，响应解析从 `response.content[0].text` 提取而非OpenAI格式的 `choices[0].message.content`。如果不将Anthropic提取为独立插件而是在api-gateway中硬编码分支，每新增一个非OpenAI格式的提供商都需要修改api-gateway.ts，违反开闭原则且容易引入回归bug。

### 3.8 数据库访问层架构

数据库访问层是整个应用的数据持久化核心，其架构设计直接影响了数据安全性、访问性能和故障恢复能力。

**better-sqlite3采用单连接全局单例模式**，而非连接池。`db-connection.ts` 中的 `dbInstance` 变量持有唯一的数据库连接实例，所有数据库操作共享这一个连接。选择单连接而非连接池的原因有三点：第一，better-sqlite3是同步API，单连接在Node.js单线程事件循环中不会产生并发竞争，连接池在同步API场景下没有性能优势；第二，SQLite的WAL（Write-Ahead Logging）模式允许一个写连接和多个读连接并发操作，但better-sqlite3的同步特性意味着读写操作天然串行，WAL模式的价值在于保证写入不阻塞读取（通过WAL文件实现读写分离），而非支持多连接并发；第三，连接池需要管理连接生命周期（创建、复用、销毁、超时），增加了代码复杂度且在桌面应用场景下没有收益——桌面应用只有一个用户，不存在多用户并发访问的场景。WAL模式的具体配置为：`PRAGMA journal_mode=WAL`（写入WAL文件而非直接修改数据库文件）、`PRAGMA synchronous=NORMAL`（写入WAL后不立即fsync，由操作系统决定刷盘时机，性能优于FULL模式且在WAL模式下数据安全性仍有保障）、`PRAGMA cache_size=-64000`（64MB页缓存）、`PRAGMA temp_store=MEMORY`（临时表存储在内存中）、`PRAGMA mmap_size=268435456`（256MB内存映射，让操作系统通过mmap管理页面缓存）。

**渲染进程不能直接访问数据库**，必须通过IPC的 `dbQuery/dbRun/dbTransaction` 通道。这是Electron安全架构的强制要求：`contextIsolation: true` 使得渲染进程的JavaScript上下文与Preload脚本隔离，渲染进程无法访问Node.js的 `require()` 或 `import`，因此无法直接引入better-sqlite3模块。即使绕过这个限制（例如通过 `nodeIntegration: true`），允许渲染进程直接访问数据库也是极其危险的设计——渲染进程加载的网页内容可能包含XSS攻击代码，如果渲染进程拥有数据库直接访问权限，攻击者可以执行任意SQL语句（包括DROP TABLE），而通过IPC通道则可以在主进程侧实施SQL安全校验。

**一次dbTransaction跨多个表更新的完整流程**以"删除故事"为例：第一步，渲染进程调用 `window.electronAPI.dbTransaction([{sql:"DELETE FROM stories WHERE id=?", params:[storyId]}, {sql:"DELETE FROM story_characters WHERE story_id=?", params:[storyId]}, {sql:"DELETE FROM story_scenes WHERE story_id=?", params:[storyId]}, {sql:"DELETE FROM story_beats WHERE story_id=?", params:[storyId]}])`。第二步，preload.ts将参数序列化后通过 `ipcRenderer.invoke("db:transaction", statements)` 发送到主进程。第三步，handlers/database.ts的 `db:transaction` handler对每条语句调用 `validateSql()` 校验安全性。第四步，调用 `ensureDb()` 确保数据库已初始化。第五步，调用 `db.transaction(() => { ... })()` 将所有语句包裹在一个SQLite事务中执行——要么全部成功提交，要么任一失败全部回滚。第六步，调用 `scheduleSave()` 安排延迟1秒的WAL checkpoint。第七步，返回 `{success:true, data:results}` 到渲染进程。事务机制保证了数据一致性：如果删除story_characters成功但删除story_beats失败，整个事务回滚，story_characters的删除也会被撤销，不会出现"关联记录已删但故事还在"的不一致状态。

**数据库层对恶意IPC调用的防护**是多层的。第一层是SQL语句类型校验：`validateSql()` 阻止DDL语句（DROP/ALTER/CREATE TABLE/CREATE INDEX/CREATE VIEW/CREATE TRIGGER/CREATE FUNCTION/CREATE VIRTUAL TABLE/ATTACH），只允许DML和查询语句（SELECT/INSERT/UPDATE/DELETE/REPLACE/WITH/VALUES/VACUUM/ANALYZE/PRAGMA）。第二层是多语句阻止：检测SQL中是否包含分号（排除尾部分号），防止攻击者通过 `SELECT * FROM characters; DROP TABLE characters` 这样的注入攻击。第三层是注释阻止：检测 `--` 和 `/*`，防止通过注释截断SQL语句绕过校验。第四层是表名白名单：从SQL中提取所有表名（FROM/INTO/UPDATE/JOIN/DELETE FROM后的标识符），与 `ALLOWED_TABLES` 集合比对，不在白名单中的表名直接拒绝。第五层是PRAGMA白名单：只允许 `table_info`、`wal_checkpoint(TRUNCATE)`、`foreign_keys`、`journal_mode`、`synchronous`、`cache_size`、`temp_store`、`mmap_size` 八种PRAGMA语句，阻止 `PRAGMA journal_mode=DELETE` 等可能破坏WAL模式的操作。第六层是CREATE安全化：只允许 `CREATE TABLE IF NOT EXISTS` 和 `CREATE INDEX IF NOT EXISTS`，阻止不带IF NOT EXISTS的CREATE语句（可能覆盖已有表）。第七层是ALTER安全化：只允许 `ALTER TABLE ... ADD COLUMN`，阻止 `ALTER TABLE ... DROP COLUMN` 或 `ALTER TABLE ... RENAME`。

**数据库恢复机制**在 `initDatabase()` 中实现。当数据库文件损坏（如断电导致WAL文件不完整）时，恢复流程分为四步：第一步，尝试正常初始化数据库，如果抛出异常则进入恢复流程。第二步，将损坏的数据库文件重命名为 `studio.db.corrupted.{timestamp}`，保留现场供手动恢复。第三步，调用 `tryRestoreFromBackup()` 从备份目录中查找最新的备份文件，按修改时间降序排列，依次尝试复制到原路径。第四步，用恢复的文件重新初始化数据库，执行Schema和迁移。如果备份恢复也失败，则创建一个全新的空数据库。定时备份机制在数据库初始化30秒后首次执行，之后每24小时自动备份一次，最多保留7份备份，超过30天的备份自动清理。此外，`saveDatabase()` 成功后如果距离上次备份超过1小时会触发增量备份。这种"保留损坏文件+备份恢复+全新初始化"的三级恢复策略确保了：即使备份不可用，用户至少能获得一个可用的空数据库继续使用，而不是应用完全无法启动。

### 3.9 双轨构建的编译时决策

双轨构建机制是项目同时支持Web模式和Electron模式的核心基础设施，其关键在于构建时通过文件操作和条件编译切换运行模式。

**api-routes-manager.js的move操作**在Electron构建流程中执行，具体修改了7个AI相关的API路由文件：`src/app/api/generate-video/route.ts`、`src/app/api/video-status/route.ts`、`src/app/api/generate-image/route.ts`、`src/app/api/analyze-image/route.ts`、`src/app/api/generate-text/route.ts`、`src/app/api/generate-keyframe/route.ts`、`src/app/api/generate-frame-pair/route.ts`。每个文件被重命名为原文件名加 `.electron-build-disabled` 后缀，例如 `route.ts` → `route.ts.electron-build-disabled`。Next.js在构建时只会识别名为 `route.ts`（或 `route.js`）的文件作为API路由，重命名后这些文件不再被Next.js识别，从而在Electron构建产物中被"禁用"。选择文件重命名而非文件删除的原因是：删除是不可逆的，如果构建中断，已删除的文件无法恢复；重命名是可逆的，构建完成后通过restore操作即可恢复原文件名。

**为什么Electron模式下必须禁用Next.js API Routes**？核心原因是安全架构的分层设计。Electron模式下，所有AI请求必须走主进程的 `api-server.ts`，因为主进程拥有完整的安全机制：SSRF防护（`ssrfGuard.validate()`）阻止请求私有网络地址，API Key安全存储（`safeStorage` 加密或明文回退）避免密钥暴露在渲染进程，插件系统（`PluginRegistry`）提供统一的提供商管理和请求构建。如果不禁用Next.js API Routes，前端代码可能直接调用 `src/app/api/generate-video/route.ts` 绕过主进程的安全层，导致以下风险：第一，SSRF攻击——恶意配置的apiUrl可以访问内网服务；第二，API Key暴露——Next.js API Routes运行在渲染进程或Node.js服务器模式，没有safeStorage加密；第三，插件系统绕过——API Routes中没有PluginRegistry，请求格式和认证方式硬编码，无法支持用户自定义提供商。

**如果忘记restore的后果**：`api-routes-manager.js` 的move操作在构建开始时执行，restore操作在构建完成后执行。如果构建中断（如Ctrl+C或OOM Kill），restore不会被执行，7个路由文件仍然保持 `.electron-build-disabled` 后缀。下次运行 `next dev` 进入Web开发模式时，这7个AI API端点不可用，前端调用会收到404错误。修复方法是手动运行 `node scripts/api-routes-manager.js restore` 或手动将文件重命名回 `route.ts`。为了降低这个风险，构建脚本在 `package.json` 中将move和next build绑定在同一个npm script中，确保即使next build失败，后续的restore命令也会执行（通过 `&&` 连接而非 `;` 连接，确保前序步骤失败时后续步骤仍能执行）。

**BUILD_TARGET=electron时next.config.ts的条件配置**：当环境变量 `BUILD_TARGET` 为 `electron` 时，`next.config.ts` 进行以下调整：`output` 设为 `"export"`（静态导出模式，生成纯HTML/JS/CSS文件而非Node.js服务器），`distDir` 改为 `"out"`（输出到out目录，与Electron的静态文件服务器路径一致），图片优化（`images.unoptimized`）设为 `true`（禁用Next.js的图片优化管线，因为Electron静态服务器不支持Next.js的 `_next/image` 代理端点）。这些配置确保Next.js构建产物是一个纯静态文件集合，可以被Electron的 `startStaticServer()` 直接服务，无需运行Next.js服务器进程。

### 3.10 状态管理跨层同步

AI Animation Studio 的状态管理横跨多个层级和运行时环境，从底层的SQLite数据库到顶层的React组件，数据需要在多个抽象层之间保持同步。

**Zustand Store与React Query的分工**遵循"客户端状态 vs 服务端状态"的分离原则。Zustand管理的是纯客户端UI状态：`activeCharacterId`（当前选中的角色ID）、`activeSceneId`（当前选中的场景ID）、`activeStoryId`（当前打开的故事ID）、`sidebarCollapsed`（侧边栏是否折叠）。这些状态的特点是：只在当前会话有效，不需要持久化，不需要与服务器同步，页面刷新后重置为初始值。React Query管理的是服务端状态：API请求的缓存数据、加载状态（isLoading/isError）、自动重获取策略（staleTime/cacheTime）、乐观更新。例如，角色列表通过React Query的 `useQuery` 获取，缓存5分钟后自动标记为stale，下次访问时后台重新获取。选择React Query而非Zustand管理API数据的原因是：React Query内置了缓存、去重、重试、分页等能力，如果用Zustand实现需要手写大量样板代码；React Query的 `useMutation` + `onSuccess` invalidate 模式天然支持"写后读刷新"，而Zustand需要手动触发刷新。

**本地SQLite变更后触发Zustand Store更新**采用事件驱动模式而非轮询模式。当用户在界面上执行写操作（如创建角色）时，第一步，前端调用 `window.electronAPI.dbRun(insertSQL, params)` 写入数据库。第二步，主进程执行SQL后返回成功。第三步，前端在 `dbRun` 的Promise resolve后，通过EventBus emit一个 `character:created` 事件。第四步，React Query的 `useQuery` 通过 `queryClient.invalidateQueries({queryKey: ['characters']})` 将角色列表缓存标记为stale。第五步，React Query在下次渲染周期自动重新获取角色列表。选择事件驱动而非轮询的原因是：轮询需要固定间隔查询数据库（如每秒一次），在无变更时浪费CPU和IPC通道资源；事件驱动只在变更发生时触发，零空转开销。如果未来需要支持多窗口同步（同一个Electron应用打开多个窗口），可以在主进程的数据库写入后通过 `BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:changed'))` 广播变更事件，各窗口监听后invalidate缓存。

**视频任务状态从pending到completed的跨层传递链**是状态管理中最复杂的场景。完整传递链如下：数据库层（`video_tasks` 表的 `status` 字段从 `pending` 更新为 `generating`）→ 主进程层（`api-gateway.ts` 的 `videoStatus()` 函数从远端获取最新状态，返回给API Server）→ API层（`localhost:30100` 的 `/api/video-status` 端点返回 `{status:"generating", progress:45}`）→ React Query层（前端的轮询定时器调用 `apiClient.post("video-status")`，React Query缓存更新）→ Zustand层（视频任务Store的 `updateTask(taskId, {status:"generating", progress:45})` 更新对应任务记录）→ UI层（React组件根据Zustand中的status渲染进度条和状态标签）。当状态变为 `completed` 时，额外触发视频缓存下载：前端收到 `{status:"completed", videoUrl:"https://..."}` 后，异步调用缓存服务将视频下载到本地IndexedDB，缓存完成后将播放源从远端URL切换为 `vcache://` 本地协议。这条传递链中，每个层级都有独立的错误处理：数据库层写入失败会回滚事务，API层请求失败会返回错误码，React Query层会自动重试3次，Zustand层更新失败会记录错误日志但不影响其他任务，UI层通过ErrorBoundary捕获渲染错误。

---

## 4. 目录结构

### 4.1 顶层目录

```
ai-animation-studio-source-code/
├── .ai/                    # AI 上下文文件
├── .github/workflows/      # CI/CD 工作流
├── .vscode/                # VS Code 配置
├── docs/                   # 文档
├── electron/               # Electron 主进程源码
├── scripts/                # 构建/测试脚本
├── src/                    # 前端源码（Next.js）
├── package.json            # 项目配置
├── next.config.ts          # Next.js 配置
├── vitest.config.ts        # 测试配置
├── playwright.config.ts    # E2E 测试配置
├── eslint.config.mjs       # ESLint 配置
├── tsconfig.json           # TypeScript 配置
└── components.json         # shadcn/ui 配置
```

### 4.2 Electron 主进程目录

```
electron/src/
├── __tests__/              # 主进程测试
├── config/                 # 配置管理
│   ├── config-manager.ts
│   ├── ports.ts            # 端口常量（API_SERVER_PORT/APP_SERVER_PORT/DEV_SERVER_PORT）
│   └── index.ts
├── database/               # 数据库模块
│   ├── __tests__/
│   ├── db-connection.ts    # 数据库连接管理
│   ├── db-schema.ts        # Schema 定义（声明式 TableDef）
│   ├── schema-builder.ts   # Schema 构建器（自动生成 SQL）
│   ├── migrations.ts       # 迁移框架（runMigrations）
│   └── index.ts
├── handlers/               # IPC/API 处理器
│   ├── __tests__/
│   ├── assets.ts           # 资源文件处理
│   ├── config.ts           # 配置读写
│   ├── database.ts         # 数据库操作
│   ├── export.ts           # 导出功能
│   ├── secure-config.ts    # 安全配置（API Key 加密存储）
│   ├── sync.ts             # 同步配置/测试/代理处理器
│   └── test-connection.ts  # 连接测试
├── logging/                # 日志系统
│   ├── __tests__/
│   ├── transports/         # 日志传输
│   │   ├── console.transport.ts
│   │   └── file.transport.ts
│   ├── logger.ts           # Logger 核心
│   └── types.ts            # 日志类型
├── plugins/                # AI 提供商插件系统
│   ├── providers/          # 内置插件（10 个）
│   │   ├── anthropic.ts
│   │   ├── google.ts
│   │   ├── kuaishou.ts
│   │   ├── minimax.ts
│   │   ├── openai-compatible.ts
│   │   ├── openai-sora.ts
│   │   ├── pixverse.ts
│   │   ├── seedance.ts
│   │   ├── volcengine.ts
│   │   └── zhipu.ts
│   ├── base-provider.ts    # 插件基类
│   ├── index.ts            # 插件系统入口
│   ├── registry.ts         # 插件注册表
│   ├── types.ts            # 插件接口定义
│   ├── user-plugin-loader.ts  # 用户插件加载器
│   ├── user-plugin-schema.ts  # 用户插件 Schema
│   └── utils.ts            # 插件工具函数
├── security/               # 安全模块
│   ├── index.ts            # 安全模块入口
│   ├── key-storage/        # API Key 存储
│   │   ├── __tests__/
│   │   │   ├── key-storage.test.ts
│   │   │   └── key-storage-enhanced.test.ts
│   │   ├── strategies/
│   │   │   ├── plaintext-fallback.strategy.ts
│   │   │   └── safe-storage.strategy.ts
│   │   ├── key-storage.ts
│   │   └── types.ts
│   └── ssrf-guard/         # SSRF 防护
│       ├── __tests__/
│       │   ├── ssrf-guard.test.ts
│       │   └── ssrf-guard-enhanced.test.ts
│       └── ssrf-guard.ts
├── types/                  # 类型定义
│   ├── api.ts
│   ├── database.ts
│   ├── ipc.ts
│   ├── sql-modules.d.ts
│   └── story.ts
├── api-gateway.ts          # API 网关
├── api-server.ts           # HTTP API 服务
├── consistency-check.ts    # 一致性检查
├── db-interface.ts         # 数据库接口
├── main.ts                 # 生产入口
├── main-common.ts          # 通用主进程逻辑
├── main-dev.ts             # 开发入口
├── menu.ts                 # 应用菜单
├── preload.ts              # 预加载脚本
├── prompt-engine.ts        # 提示词引擎
├── prompt-service.ts       # 提示词服务
├── protocol.ts             # 自定义协议
├── reference-check.ts      # 引用检查
├── reference-engine.ts     # 参考引擎
├── story-service.ts        # 故事服务
├── storyboard-generation.ts # 分镜生成
├── sync-http-client.ts     # 同步 HTTP 客户端（主进程→远端）
├── video-recovery.ts       # 视频恢复
├── video-task-service.ts   # 视频任务服务
├── video-tracker.ts        # 视频追踪
└── visual-consistency-check.ts # 视觉一致性检查
```

### 4.3 前端源码目录

```
src/
├── __tests__/              # 测试文件
│   ├── components/         # 组件测试
│   ├── e2e/                # E2E 测试（15 个）
│   ├── hooks/              # Hooks 测试
│   ├── lib/                # 库测试
│   ├── mocks/              # Mock 工具
│   ├── modules/            # 模块测试
│   ├── test-helpers/       # 测试辅助
│   ├── utils/              # 测试工具
│   └── setup.ts            # 测试配置
├── app/                    # Next.js App Router
│   ├── api/                # API 路由（非 AI）
│   │   ├── config/
│   │   ├── image/normalize/
│   │   ├── prompt/build/
│   │   ├── secure-config/
│   │   ├── story/replace-placeholders/
│   │   ├── sync/pull/
│   │   ├── sync/push/
│   │   ├── sync/status/
│   │   ├── test-connection/
│   │   ├── upload/
│   │   │   └── [filename]/  # 动态路由：文件上传/下载
│   │   └── validate/
│   ├── asset-library/      # 资产库页面
│   ├── characters/         # 角色页面
│   ├── create/             # 创建页面
│   ├── media/              # 媒体页面
│   ├── quick-generate/     # 快速生成页面
│   ├── scenes/             # 场景页面
│   ├── settings/           # 设置页面
│   │   └── plugin-manager.tsx  # 插件管理器
│   ├── story/              # 故事页面
│   │   ├── beat/[beatId]/  # 节拍详情
│   │   └── StoryProvider.tsx
│   ├── video-tasks/        # 视频任务页面
│   ├── MigrationInitializer.tsx
│   ├── SidebarWithSearch.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── config/                 # 应用配置
│   ├── constants.ts        # 常量（从ports.ts重新导出端口常量）
│   └── ports.ts            # 端口常量（独立文件，避免@/别名依赖）
├── domain/                 # 领域层
│   ├── ports/              # 端口接口
│   ├── schemas/            # 数据 Schema
│   │   └── __tests__/      # Schema 测试（5 个）
│   ├── services/           # 领域服务
│   │   └── __tests__/      # 领域服务测试（2 个）
│   ├── types/              # 领域类型
│   │   └── __tests__/      # 类型测试（1 个）
│   └── utils/              # 领域工具
│       └── __tests__/      # 工具测试（2 个）
├── infrastructure/         # 基础设施层
│   ├── ai-providers/       # AI 提供商
│   │   ├── api-config/     # API 配置管理（9 个文件）
│   │   ├── model-adapter/  # 模型适配器
│   │   └── providers/      # 云端提供商实现
│   ├── api/                # API 客户端
│   ├── database/           # 数据库仓库（drizzle-orm）
│   │   ├── character-repository.ts
│   │   ├── scene-repository.ts
│   │   ├── story-repository.ts
│   │   ├── element-repository.ts
│   │   ├── media-asset-repository.ts
│   │   └── index.ts
│   ├── di/                 # 依赖注入
│   │   ├── container.ts    # DI 容器（78 个 Token）
│   │   ├── registry.ts     # Token 注册表
│   │   ├── types.ts        # Token 类型定义
│   │   └── index.ts
│   ├── monitoring/         # 监控
│   ├── network/            # 网络层
│   │   ├── interceptors/   # 请求拦截器（6 个：cache/circuit-breaker/lifecycle/logging/retry/index）
│   │   ├── circuit-breaker.ts
│   │   ├── download-manager.ts
│   │   ├── network-monitor.ts
│   │   ├── network.config.ts
│   │   ├── profiles.ts
│   │   ├── request-lifecycle.ts
│   │   ├── resilient-fetch.ts
│   │   ├── retry-executor.ts
│   │   └── types.ts
│   ├── server/             # 服务端工具
│   │   ├── api-utils.ts    # API 工具函数
│   │   └── index.ts        # 导出
│   ├── storage/            # 存储层
│   │   ├── characters/     # 角色存储（index.ts, outfit-manager.ts, parser.ts）
│   │   ├── elements/       # 元素存储（commands.ts, index.ts, queries.ts）
│   │   ├── stories/        # 故事存储（beat-transformer.ts, index.ts, relations.ts）
│   │   ├── video-tasks/    # 视频任务存储（bulk-operations.ts, index.ts, json-schemas.ts, parser.ts）
│   │   ├── auto-save.ts    # 自动保存
│   │   ├── collections.ts  # 集合存储
│   │   ├── core.ts         # 存储核心（registerColumns、parseRecordWithTable）
│   │   ├── db.ts           # 数据库连接
│   │   ├── elements.ts     # 元素存储入口
│   │   ├── error-logs.ts   # 错误日志存储
│   │   ├── import-export.ts # 导入导出
│   │   ├── scenes.ts       # 场景存储
│   │   ├── schema-registry.ts # 列注册表
│   │   ├── sessions.ts     # 会话存储
│   │   ├── sql-sanitizer.ts # SQL 安全工具
│   │   ├── sqlite-core.ts  # SQLite 核心（withRetry、safeQuery、safeRun、safeTransaction）
│   │   ├── storyboard.ts   # 分镜存储
│   │   ├── templates.ts    # 模板存储
│   │   ├── video-cache.ts  # 视频缓存存储
│   │   ├── video-tasks.ts  # 视频任务存储入口
│   │   └── versions.ts     # 版本存储
│   ├── video-utils/        # 视频工具
│   └── api-config-facade.ts # API 配置门面
├── modules/                # 功能模块
│   ├── asset/              # 资产模块
│   ├── character/          # 角色模块
│   ├── feedback/           # 反馈模块（脏状态追踪/撤销）
│   ├── integrity/          # 完整性模块（SQL 注入防护/依赖稳定性）
│   ├── persistence/        # 持久化模块（自动保存/事务删除）
│   ├── prompt/             # 提示词模块
│   ├── scene/              # 场景模块
│   ├── security/           # 安全模块（安全配置 Hook）
│   ├── shot/               # 镜头模块
│   ├── story/              # 故事模块
│   ├── sync/               # 同步模块
│   │   ├── engine/         # 同步引擎（向量时钟/变更日志/冲突解决）
│   │   └── presentation/   # 同步 UI（SyncSettingsPanel/SyncConflictPanel）
│   └── video/              # 视频模块
└── shared/                 # 共享工具
    ├── hooks/              # 通用 Hooks（5 个）
    ├── presentation/       # 共享 UI 组件（19 个）
    ├── types/              # 共享类型
    ├── ui/                 # UI 基础组件（24 个）
    ├── utils/              # 工具函数（8 个）
    ├── app-store.ts        # 应用全局 Store
    ├── error-handler.ts    # 错误处理器
    ├── error-logger.ts     # 错误日志记录器
    ├── event-bus.ts        # 事件总线
    └── event-types.ts      # 事件类型定义
```

---

## 5. Electron 主进程

### 5.1 入口文件

项目有两个入口文件：

- **`main.ts`**：生产环境入口，启动 API Server + 静态文件服务器，监听端口 `APP_SERVER_PORT`（默认3000，前端）和 `API_SERVER_PORT`（默认30100，API）。启动时初始化 `ConsoleTransport`（minLevel: "info"）+ `FileTransport`（minLevel: "info"，filename: "app"）。
- **`main-dev.ts`**：开发环境入口，连接 Next.js 开发服务器（端口 `DEV_SERVER_PORT`，默认3001）和 API Server（端口 `API_SERVER_PORT`，默认30100）。启动时初始化 `ConsoleTransport`（minLevel: "debug"）+ `FileTransport`（minLevel: "debug"，filename: "dev"）。

两个入口共享 `main-common.ts` 中的 `createWindow()`、`startStaticServer()`、`gracefulShutdown()`、配置 IPC 等逻辑，且都实现了相同的崩溃恢复机制（渲染进程崩溃自动重建窗口、GPU 崩溃重载、错误容忍策略）。

端口常量定义在 `electron/src/config/ports.ts` 中，独立于前端源码目录（因 TypeScript rootDir 限制，Electron 侧不能导入 `src/` 下的模块）：

```typescript
// electron/src/config/ports.ts
export const API_SERVER_PORT = 30100;
export const APP_SERVER_PORT = 3000;
export const DEV_SERVER_PORT = 3001;
```

前端侧的相同常量定义在 `src/config/ports.ts`，由 `src/config/constants.ts` 重新导出，`next.config.ts` 直接导入 `src/config/ports.ts`（避免引入含 `@/` 别名依赖的 `constants.ts` 导致编译错误）。

### 5.2 应用生命周期

```
loggerRegistry.setDefaultTransports()  →  初始化 ConsoleTransport + FileTransport
app.requestSingleInstanceLock()        →  单实例锁
app.whenReady()                        →  registerAppProtocol()
                                            ↓
                                       createWindow()
                                            ↓
                                       startApiServer() (端口 API_SERVER_PORT=30100)
                                       startStaticServer() (端口 APP_SERVER_PORT=3000)
                                       waitForServer()
                                       mainWindow.loadURL()
                                            ↓
app.on('window-all-closed')            →  正常退出: gracefulShutdown + stopApiServer + closeDatabase + app.quit
                                           渲染进程崩溃: isRendererCrashed=true → 1s 后自动重建窗口
app.on('before-quit')                  →  gracefulShutdown + stopApiServer + closeDatabase
app.on('render-process-gone')          →  设置 isRendererCrashed 标志, 销毁窗口
app.on('child-process-gone')           →  GPU 崩溃: webContents.reload(); 其他: 记录日志
process.on('SIGINT/SIGTERM')           →  gracefulShutdown + stopApiServer + closeDatabase + app.quit
process.on('uncaughtException')        →  记录日志 + 通知渲染进程 (不退出)
process.on('unhandledRejection')       →  记录日志 + 通知渲染进程 (不退出)
```

关键设计决策：

1. **错误容忍策略**：`uncaughtException` 和 `unhandledRejection` 不再调用 `app.exit()`，仅记录日志并通知渲染进程。桌面应用必须能从瞬态错误（网络超时、数据库忙碌、IPC 故障）中恢复，不应因单次异常就终止整个应用。只有 `SIGINT`、`SIGTERM` 和用户主动关闭窗口才触发 `app.quit()`。

2. **渲染进程崩溃恢复**：`render-process-gone` 事件设置 `isRendererCrashed` 标志并销毁窗口。`window-all-closed` 事件检查该标志：如果为 true，延迟 1 秒后自动重建窗口；如果为 false（用户主动关闭），则执行正常退出流程。

3. **GPU 进程崩溃恢复**：`child-process-gone` 事件中，如果 `details.type === "GPU"`，对当前窗口执行 `webContents.reload()` 重新加载页面。其他子进程退出仅记录 warn 级别日志。

4. **优雅关机序列**：`before-quit` → `gracefulShutdown()`（销毁窗口 + 关闭静态服务器 + 销毁所有追踪的 HTTP 连接）→ `stopApiServer()`（销毁 API 连接 + 关闭 HTTP 服务器）→ `closeDatabase()`（关闭 SQLite）→ `app.quit()`。

5. **静态服务器连接追踪**：`activeConnections: Set<net.Socket>` 追踪所有 HTTP 连接，关机时先 `destroy()` 所有连接再 `server.close()`，防止 keep-alive 连接阻塞进程退出。

### 5.3 BrowserWindow 配置

```typescript
new BrowserWindow({
  width: 1400,
  height: 900,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, "preload.js"),
  },
  show: false,  // ready-to-show 后显示
});
```

安全策略：
- `nodeIntegration: false`：禁用 Node.js 集成
- `contextIsolation: true`：启用上下文隔离
- `will-navigate`：阻止外部导航
- `setWindowOpenHandler`：拦截新窗口打开，外部链接用 `shell.openExternal`

### 5.4 Preload 脚本

`preload.ts` 通过 `contextBridge.exposeInMainWorld` 暴露 `electronAPI` 对象，包含：

#### IPC 权限分级

| 级别 | 通道 | 说明 |
|------|------|------|
| READONLY | db:query, db:get, db:stats, db:type, assets:read-file-base64, assets:get-dir, assets:file-exists, fs:read-file, cache:get-cache-directory, fs:get-file-info, fs:get-disk-space, image:to-base64, config:get, secure-config:load, secure-config:has, export:data | 只读操作（300次/分钟） |
| READWRITE | db:run, db:batch-insert, db:init, db:save, assets:save-image, assets:save-buffer, assets:copy-file, fs:write-file, image:normalize, config:set, secure-config:save, secure-config:delete | 读写操作（100次/分钟） |
| DANGEROUS | db:transaction, db:migrate, db:vacuum, db:analyze, db:checkpoint, assets:delete-file | 危险操作（100次/分钟） |
| SECURE | secure-config:resolve | 解密 API Key 明文，受 SECURE 级别权限控制 |
| SYSTEM | shell:open-external, dialog:open-file, dialog:save-file, db:close | 系统操作 |

#### 安全机制

- **权限检查**：`checkPermission()` 验证 IPC 通道是否在白名单中
- **SQL 安全**：`validateSqlSafety()` 阻止从渲染进程执行 DDL 语句（DROP/ALTER/CREATE/TRUNCATE/ATTACH/DETACH）
- **速率限制**：只读通道 300 次/分钟，其他通道 100 次/分钟
- **历史清理**：每 60 秒清理过期调用记录

#### 暴露的 API

```typescript
window.electronAPI = {
  onNavigate, onMenuNewCharacter, onMenuNewScene, onMenuExport,
  openExternal, removeMenuListeners,
  platform, versions: { node, electron, chrome },
  getConfig, setConfig,
  saveImage, deleteFile, readFileAsBase64, getAssetsDir,
  saveBuffer, fileExists, copyFile,
  openFileDialog, saveFileDialog,
  writeFile, readFile, getCacheDirectory,
  normalizeImage, imageToBase64IPC,
  dbQuery, dbRun, dbTransaction,
};
```

#### IPC 通道完整列表

Electron 主进程与渲染进程通过 IPC 通信，使用 `ipcMain.invoke` / `ipcRenderer.invoke`（双向）和 `webContents.send`（主→渲染单向）两种模式。

**数据库操作（16 个）**

| 通道 | 方向 | 说明 |
|------|------|------|
| db:init | invoke | 初始化数据库 |
| db:close | invoke (SYSTEM) | 关闭数据库 |
| db:query | invoke | 执行查询（返回行数组） |
| db:get | invoke | 执行查询（返回单行） |
| db:run | invoke | 执行写入 |
| db:batch-insert | invoke | 批量插入 |
| db:transaction | invoke (DANGEROUS) | 执行事务 |
| db:migrate | invoke (DANGEROUS) | 执行迁移 |
| db:save | invoke | 保存数据库 |
| db:stats | invoke | 获取数据库统计 |
| db:type | invoke | 获取数据库类型 |
| db:vacuum | invoke (DANGEROUS) | 清理数据库 |
| db:analyze | invoke (DANGEROUS) | 分析数据库 |
| db:checkpoint | invoke (DANGEROUS) | WAL 检查点 |
| db:backup-status | invoke (主进程注册，preload 未暴露) | 获取备份状态 |
| db:create-backup | invoke (主进程注册，preload 未暴露) | 手动创建备份 |
| db:persistence-error | on (主→渲染，主进程直接发送) | 磁盘满警告 |

**资产管理 + 文件系统 + 对话框（14 个）**

| 通道 | 方向 | 说明 |
|------|------|------|
| assets:save-image | invoke | 保存图片到本地 |
| assets:delete-file | invoke | 删除文件 |
| assets:read-file-base64 | invoke | 读取文件为 Base64 |
| assets:get-dir | invoke | 获取资产目录 |
| assets:save-buffer | invoke | 保存 Buffer |
| assets:file-exists | invoke | 检查文件是否存在 |
| assets:copy-file | invoke | 复制文件 |
| fs:write-file | invoke | 写入文件 |
| fs:read-file | invoke | 读取文件 |
| fs:get-file-info | invoke | 获取文件信息 |
| fs:get-disk-space | invoke | 获取磁盘空间 |
| cache:get-cache-directory | invoke | 获取缓存目录 |
| image:normalize | invoke | 图片标准化 |
| image:to-base64 | invoke | 图片转 Base64 |

**对话框（2 个）**

| 通道 | 方向 | 说明 |
|------|------|------|
| dialog:open-file | invoke | 打开文件选择对话框 |
| dialog:save-file | invoke | 保存文件对话框 |

**配置管理（2 个）**

| 通道 | 方向 | 说明 |
|------|------|------|
| config:get | sendSync | 获取配置（同步 IPC） |
| config:set | sendSync | 设置配置（同步 IPC） |

**安全配置（5 个）**

| 通道 | 方向 | 说明 |
|------|------|------|
| secure-config:save | invoke | 保存 API Key 到 safeStorage |
| secure-config:load | invoke | 加载 API Key（仅返回是否存在） |
| secure-config:resolve | invoke | 解析 API Key 明文（仅主进程内部） |
| secure-config:delete | invoke | 删除 API Key |
| secure-config:has | invoke | 检查 API Key 是否存在 |

**系统信息（非 IPC 通道，通过 process.versions 暴露）**

| 属性 | 来源 | 说明 |
|------|------|------|
| platform | process.platform | 操作系统平台 |
| versions.node | process.versions.node | Node.js 版本 |
| versions.electron | process.versions.electron | Electron 版本 |
| versions.chrome | process.versions.chrome | Chrome 版本 |

**菜单事件（4 个）**

| 通道 | 方向 | 说明 |
|------|------|------|
| menu:new-character | on (主→渲染) | 新建角色 |
| menu:new-scene | on (主→渲染) | 新建场景 |
| menu:export | on (主→渲染) | 导出 |
| navigate | on (主→渲染) | 导航 |

### 5.5 静态文件服务器

`main-common.ts` 中的 `startStaticServer()` 在生产模式下提供前端静态文件服务：

- 静态文件目录：`app.asar.unpacked/out` 或 `app.asar/out`
- `/api/` 前缀请求代理到 API Server（端口 `API_SERVER_PORT`）
- `/api/upload/` GET 请求直接返回上传文件
- 路径遍历防护：`resolvedPath.startsWith(staticDir)`
- MIME 类型映射：支持 html/js/css/json/图片/视频/字体/wasm
- HTML 文件不缓存（`no-cache`），其他文件缓存 1 年
- Next.js SPA 路由回退：目录 → `index.html` → `{path}.html` → 根 `index.html`
- 连接追踪：`activeConnections: Set<net.Socket>` 追踪所有 HTTP 连接，关机时先 `destroy()` 再 `server.close()`

### 5.6 自动更新

`main.ts` 中集成了 `electron-updater`：

- 自动下载更新：`autoUpdater.autoDownload = true`
- 退出时安装：`autoUpdater.autoInstallOnAppQuit = true`
- 事件通知：`update-available`、`update-downloaded`、`update-error` 通过 `webContents.send` 推送到渲染进程
- 日志适配：`autoUpdater.logger` 适配到项目 Logger

---

## 6. AI 提供商插件系统

### 6.1 架构概览

插件系统是项目的核心扩展机制，采用策略模式 + 注册表模式：

```
AIProviderPlugin (接口)
    ↓ 继承
BaseAIProviderPlugin (抽象基类，提供默认实现)
    ↓ 继承
┌──────────────────────────────────────────────┐
│  内置插件（10 个）                              │
│  VolcenginePlugin, KuaishouPlugin,            │
│  ZhipuPlugin, PixversePlugin,                 │
│  SeedancePlugin, GooglePlugin,                │
│  OpenAISoraPlugin, MiniMaxPlugin,             │
│  AnthropicPlugin, OpenAICompatiblePlugin      │
└──────────────────────────────────────────────┘
    ↓ 适配
UserPluginAdapter (用户插件适配器)
    ↓ 加载
loadUserPlugins() (从 ~/.AI Animation Studio/Plugins/ 加载 .plugin.json)
```

### 6.2 AIProviderPlugin 接口

```typescript
interface AIProviderPlugin {
  readonly id: string;
  readonly displayName: string;
  match(apiUrl: string, model?: string): boolean;

  readonly videoCapabilities: VideoCapabilities;
  readonly imageCapabilities: ImageCapabilities;
  getModelCapabilities(modelId: string): ModelCapabilities;

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult;
  extractTaskId(response): string | undefined;
  extractVideoUrl(response): string | undefined;
  getVideoStatusEndpoint(baseUrl, taskId, model?): string;

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult;
  extractImageUrl(response): string | undefined;

  buildTextRequest(ctx: TextBuildContext): TextRequestResult;
  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult;

  getImageTransportMode(purpose: ImagePurpose): ImageTransportMode;
  prepareImage(url, purpose, apiConfig): Promise<string | undefined>;
  uploadAsset?(data, filename, mimeType, apiKey, apiUrl): Promise<string>;

  getAuthHeaders(apiKey, endpoint?): Record<string, string>;
  readonly preferLocalData?: boolean;
  getCloudInfo?(baseUrl): CloudProviderInfo | undefined;

  // 可选扩展方法
  appendAuthToUrl?(url, apiKey): string;
  extractTextContent?(response): string;
  extractStatus?(response): { status: string; progress?: number; message?: string };
  getStatusMethod?(): "GET" | "POST";
}
```

### 6.3 能力类型定义

#### VideoCapabilities

```typescript
interface VideoCapabilities {
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsMimicryLevel: boolean;
  defaultModel: string;
  maxDuration: number;
  supportedCodecs?: string[];  // 如 ["h264", "h265"]
}
```

#### ImageCapabilities

```typescript
interface ImageCapabilities {
  supportsReferenceImage: boolean;
  defaultModel: string;
}
```

#### ModelCapabilities

```typescript
interface ModelCapabilities {
  maxReferences: number;
  maxResolution: number;
  maxSizeMB: number;
  supportsLastFrame: boolean;
  referenceMode: "separate" | "merged";
  supportedImageSizes?: ImageSizeOption[];
  defaultImageSize?: string;
}
```

### 6.4 BaseAIProviderPlugin 默认实现

基类为所有插件提供合理的默认行为：

| 方法 | 默认行为 |
|------|---------|
| `extractTaskId` | 尝试 `id` → `task_id` → `data.task_id` → `output.task_id` |
| `extractVideoUrl` | 尝试 `video_url` → `url` → `data.video_url` → `output.video_url` |
| `extractImageUrl` | 尝试 `data[0].url` → `data[0].b64_json` |
| `getVideoStatusEndpoint` | `${baseUrl}/videos/${taskId}` |
| `buildTextRequest` | OpenAI 格式 `/chat/completions` |
| `buildVisionRequest` | OpenAI Vision 格式 `/chat/completions` |
| `getImageTransportMode` | 返回 `"url"` |
| `prepareImage` | data: 直接返回，vcache://file:// 转为 base64，https:// 下载为 base64 |
| `getAuthHeaders` | `Authorization: Bearer ${apiKey}` |
| `appendAuthToUrl` | 返回原 URL（不修改） |
| `extractTextContent` | 尝试 OpenAI `choices[0].message.content` |
| `extractStatus` | 尝试 `status` → `progress` → `message` |
| `getStatusMethod` | 返回 `"GET"` |

### 6.5 内置插件列表

| 插件 ID | 显示名 | 匹配规则 | 特殊行为 |
|---------|--------|---------|---------|
| volcengine | 火山引擎 | URL 含 `volcengine.com` | 视频请求使用 DashScope 格式 |
| kuaishou | 快手可灵 | URL 含 `kuaishou` 或 `klingai` | 自定义 taskId/videoUrl 路径 |
| zhipu | 智谱 AI | URL 含 `zhipuai` 或 `bigmodel` | 自定义视频状态端点 |
| pixverse | Pixverse | URL 含 `pixverse` | 自定义状态映射 |
| seedance | Seedance | URL 含 `seedance` | 自定义请求格式 |
| google | Google | URL 含 `generativelanguage.googleapis` | `appendAuthToUrl` 添加 `?key=` |
| openai-sora | OpenAI Sora | URL 含 `openai` 且模型含 `sora` | OpenAI 格式 |
| minimax | MiniMax | URL 含 `minimax` | 自定义请求格式 |
| anthropic | Anthropic | URL 含 `anthropic.com` 或 `bedrock-runtime` | `x-api-key` 认证，`anthropic-version` 头 |
| openai-compatible | OpenAI 兼容 | 兜底插件（Fallback） | 标准 OpenAI 格式 |

### 6.6 PluginRegistry

```typescript
class PluginRegistry {
  register(plugin, isUserPlugin?): void;
  setFallback(plugin): void;
  unregister(pluginId): boolean;
  select(apiUrl, model?): AIProviderPlugin | undefined;
  selectById(pluginId): AIProviderPlugin | undefined;
  getAll(): AIProviderPlugin[];
  getBuiltInPlugins(): AIProviderPlugin[];
  getUserPlugins(): AIProviderPlugin[];
  isUserPlugin(pluginId): boolean;
  reloadUserPlugins(): { loaded: number; errors: string[] };
  getAllCapabilities(): Record<string, CapabilityInfo>;
}
```

插件选择逻辑：
1. 遍历所有已注册插件，调用 `plugin.match(apiUrl, model)`
2. 第一个匹配的插件被选中
3. 如果没有匹配，返回 Fallback 插件（OpenAICompatiblePlugin）
4. 如果连 Fallback 都没有，返回 `undefined`

### 6.7 用户插件

用户插件通过 JSON 配置文件定义，存储在 `~/AI Animation Studio/Plugins/` 目录下，文件名格式为 `{id}.plugin.json`。

加载流程：
1. `loadUserPlugins()` 读取目录下所有 `.plugin.json` 和 `.json` 文件
2. 解析 JSON 为 `UserPluginConfig`
3. `validatePluginConfig()` 校验必填字段
4. 创建 `UserPluginAdapter` 实例并注册到 `PluginRegistry`
5. 首次创建目录时生成 `_example.plugin.json` 示例文件

### 6.8 三个内置插件深度对比

VolcenginePlugin、AnthropicPlugin、GooglePlugin三个插件代表了项目中三种截然不同的AI提供商接入模式，对比它们的实现差异有助于理解插件系统的设计灵活性和扩展能力。

**认证方式对比**：VolcenginePlugin继承基类默认的 `getAuthHeaders()`，返回 `{Authorization: "Bearer ${apiKey}"}`，这是最主流的API认证方式，被OpenAI、火山引擎、快手可灵等绝大多数提供商采用。AnthropicPlugin重写了 `getAuthHeaders()`，返回 `{x-api-key: apiKey, anthropic-version: "2023-06-01"}`，使用自定义Header名 `x-api-key` 而非标准的 `Authorization`，并附加版本号Header——这是因为Anthropic的API要求客户端在每次请求中声明使用的API版本，不同版本的行为可能不同（如响应格式、错误码）。GooglePlugin的认证方式最为特殊：它不使用Header认证，而是重写了 `appendAuthToUrl()` 方法，将API Key作为URL查询参数附加：`url + "?key=" + apiKey`。这种URL参数认证方式是Google Cloud API的标准做法，原因在于Google的API网关在请求到达后端服务之前就从URL中提取认证信息，不检查Authorization Header。如果不为Google实现 `appendAuthToUrl()` 而是依赖基类默认的Header认证，所有Google API请求都会返回401 Unauthorized。

**请求格式对比**：VolcenginePlugin的 `buildVideoRequest()` 使用OpenAI Content数组格式，将文本提示词和图片引用统一放在 `content` 数组中：`[{type:"text",text:prompt}, {type:"image_url",image_url:{url:firstFrame}}]`，这种格式允许在同一个请求中混合文本和图片输入。AnthropicPlugin的 `buildTextRequest()` 使用Anthropic Messages格式：`{model, messages:[{role:"user",content:prompt}], max_tokens}`，端点为 `/messages` 而非OpenAI的 `/chat/completions`。GooglePlugin继承基类默认的文本和视觉请求构建，使用标准OpenAI格式。

**响应解析对比**：VolcenginePlugin继承基类默认的 `extractTextContent()`，从OpenAI格式的 `choices[0].message.content` 提取文本。AnthropicPlugin重写了 `extractTextContent()`，从 `response.content[0].text` 提取——Anthropic的响应结构是 `{content: [{type:"text", text:"..."}]}`，与OpenAI的 `{choices: [{message: {content:"..."}}]}` 完全不同。如果不重写 `extractTextContent()`，Anthropic的文本生成响应会返回空字符串，因为基类默认实现在 `choices` 路径上找不到数据。GooglePlugin继承基类默认实现。

**能力范围对比**：VolcenginePlugin支持视频生成（5个模型配置）、图片生成、文本生成、视觉分析，是功能最完整的插件。AnthropicPlugin不支持视频生成和图片生成（`buildVideoRequest()` 和 `buildImageRequest()` 直接抛出异常），只支持文本生成和视觉分析。GooglePlugin继承基类默认能力，支持文本和视觉，视频和图片能力取决于用户配置的具体模型。这种"按能力开放"的设计避免了用户选择不支持的模型后收到模糊的服务端错误——例如，如果AnthropicPlugin不抛出异常而是返回一个空请求体，api-gateway会将空请求体发送给Anthropic API，收到一个难以理解的400 Bad Request，用户无法判断是配置错误还是服务端故障。

**错误处理对比**：VolcenginePlugin的错误处理完全依赖基类默认实现和api-gateway的统一错误捕获。AnthropicPlugin在 `buildVideoRequest()` 中抛出明确的错误信息 `"Anthropic Claude 不支持视频生成"`，这个错误会被api-gateway的try-catch捕获，转换为HTTP 400响应返回给前端，前端可以展示"该提供商不支持视频生成"的友好提示。GooglePlugin的错误处理与基类一致。

### 6.9 用户插件加载完整时序

用户插件从磁盘文件到运行时可用的完整加载过程涉及文件系统扫描、JSON解析、Schema校验、适配器创建和注册表插入五个阶段。

**第一阶段：目录扫描**。`loadUserPlugins()` 函数构造插件目录路径。在Windows上为 `C:\Users\{username}\AI Animation Studio\Plugins\`，在macOS上为 `/Users/{username}/AI Animation Studio/Plugins/`。如果目录不存在，函数创建目录并生成 `_example.plugin.json` 示例文件后返回。示例文件包含完整的配置结构和注释，帮助用户理解每个字段的含义。扫描时过滤出所有 `.plugin.json` 和 `.json` 后缀的文件，但排除以 `_` 开头的文件（如 `_example.plugin.json`），这些是示例或临时文件。

**第二阶段：JSON解析**。对每个文件执行 `fs.readFileSync(filePath, "utf-8")` 读取内容，然后 `JSON.parse(content)` 解析。如果文件内容不是合法JSON（如用户手动编辑时遗漏了逗号或引号），`JSON.parse()` 抛出SyntaxError，函数捕获异常后将错误信息（文件名+错误位置）加入errors数组，跳过该文件继续处理下一个。

**第三阶段：Schema校验**。`validatePluginConfig(config)` 函数执行以下校验：id必须是非空字符串且符合正则 `/^[a-z0-9-]+$/`（小写字母+数字+连字符），不能以连字符开头或结尾；id不能与内置插件冲突（volcengine/kuaishou/zhipu/pixverse/seedance/google/openai-sora/minimax/openai-compatible/anthropic）；displayName必须是非空字符串；match必须是对象且apiUrlPatterns必须是非空数组；capabilities必须是对象且包含video和image子对象；transport必须是对象；auth必须是对象且type必须是"bearer"/"api-key-header"/"api-key-query"/"custom"之一；endpoints必须是对象；request必须是对象；response必须是对象。任何一项校验失败，函数返回错误信息字符串，该插件被跳过。

**第四阶段：适配器创建**。校验通过后，`new UserPluginAdapter(config)` 创建适配器实例。适配器将JSON配置映射为 `AIProviderPlugin` 接口的方法实现：`match()` 根据 `match.mode`（contains/prefix/regex）和 `match.apiUrlPatterns` 实现URL匹配；`buildVideoRequest()` 根据 `request.video.bodyFormat` 和 `customBodyTemplate` 构建请求体；`getAuthHeaders()` 根据 `auth.type` 构造认证头，优先使用端点级auth（`endpoints.video.auth`）覆盖全局auth；`extractTextContent()` 根据 `response.text.contentPath` 从嵌套JSON中提取文本。

**第五阶段：注册表插入**。`registry.register(adapter, true)` 将适配器插入PluginRegistry的插件列表末尾，第二个参数 `true` 标记为用户插件。由于内置插件先于用户插件注册，且select()采用先注册先匹配策略，用户插件只有在所有内置插件都不匹配时才会被选中。如果用户想让自定义插件覆盖内置插件的匹配行为，需要使用更精确的匹配模式——例如将 `match.mode` 设为 `"prefix"` 并指定完整的API URL前缀，或设为 `"regex"` 使用正则表达式精确匹配。

**错误传播路径**分为四类。第一类，JSON解析失败：错误被捕获后记录到errors数组，该文件被跳过，不影响其他插件的加载。第二类，Schema校验失败：`validatePluginConfig()` 返回具体的错误信息（如"id不能与内置插件冲突: volcengine"），记录到errors数组，该插件被跳过。第三类，`match()` 运行时异常：在 `pluginRegistry.select()` 中，每个插件的 `match()` 调用被try-catch包裹，异常被捕获后记录日志并跳过该插件，继续匹配下一个。第四类，`buildXxxRequest()` 运行时异常：在 `api-gateway.ts` 中，插件的请求构建方法调用被try-catch包裹，异常被捕获后转换为HTTP 500响应返回前端，前端展示"插件执行错误"提示。

### 6.10 完整HTTP请求响应示例

以"通过Volcengine插件生成视频"为例，展示从前端发起到视频URL返回的完整数据流。

**第一步：前端发起请求**。用户在视频生成界面点击"生成"按钮，React组件调用 `apiClient.post("generate-video", {apiUrl:"https://ark.cn-beijing.volces.com/api/v3", apiKey:"sk-xxx", model:"doubao-seedance-1-0-pro-250528", prompt:"一只猫在草地上奔跑", duration:5, firstFrameUrl:"data:image/png;base64,..."})`。API Client构造HTTP请求：URL为 `http://localhost:30100/api/generate-video`，Method为POST，Headers包含 `Content-Type: application/json`，Body为JSON字符串。请求通过5个拦截器链（lifecycle → circuit-breaker → cache → retry → logging）后发送。

**第二步：API Server路由**。`api-server.ts` 收到请求，匹配 `/generate-video` 路由，调用 `generateVideo(requestBody)` handler。

**第三步：API Gateway配置解析**。`api-gateway.ts` 的 `generateVideo()` 函数调用 `resolveApiConfig(body)` 解析配置：effectiveApiUrl = "https://ark.cn-beijing.volces.com/api/v3"，effectiveApiKey = "sk-xxx"，effectiveModel = "doubao-seedance-1-0-pro-250528"。

**第四步：插件选择**。`pluginRegistry.select("https://ark.cn-beijing.volces.com/api/v3", "doubao-seedance-1-0-pro-250528")` 遍历插件列表。VolcenginePlugin的 `match()` 检查URL包含 "volces.com"，返回true，被选中。

**第五步：请求构建**。`plugin.buildVideoRequest({prompt:"一只猫在草地上奔跑", model:"doubao-seedance-1-0-pro-250528", duration:5, firstFrameUrl:"data:image/png;base64,..."})` 返回 `{body:{model:"doubao-seedance-1-0-pro-250528", content:[{type:"text",text:"一只猫在草地上奔跑"},{type:"image_url",image_url:{url:"data:image/png;base64,..."}}], duration:5}, endpoint:"/contents/generations/tasks"}`。

**第六步：认证构建**。`plugin.getAuthHeaders("sk-xxx")` 返回 `{Authorization: "Bearer sk-xxx"}`。

**第七步：HTTP请求发送**。`makeRequest("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks", {method:"POST", headers:{Authorization:"Bearer sk-xxx", "Content-Type":"application/json"}, body:JSON.stringify(requestBody), timeout:300000})`。发送前执行 `ssrfGuard.validate(url)` 检查URL安全性。

**第八步：远端响应**。HTTP 200，Body为 `{id:"task_abc123"}`。

**第九步：TaskId提取**。`plugin.extractTaskId({id:"task_abc123"})` 尝试路径 `id` → 找到 "task_abc123"。

**第十步：返回前端**。`{taskId:"task_abc123", status:"pending"}`。

**第十一步：轮询视频状态**。前端启动轮询，每15秒调用 `apiClient.post("video-status", {apiUrl, apiKey, taskId:"task_abc123", model})`。API Gateway调用 `plugin.getVideoStatusEndpoint(baseUrl, "task_abc123")` 返回 `"https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/task_abc123"`，`plugin.getStatusMethod()` 返回 `"GET"`，`plugin.getAuthHeaders("sk-xxx")` 返回 `{Authorization:"Bearer sk-xxx"}`。`makeRequest()` 发送GET请求。

**第十二步：状态响应**。远端返回 `{status:"succeeded", output:{video_url:"https://cdn.volces.com/video.mp4"}}`。`plugin.extractStatus()` 返回 `{status:"succeeded"}`，`plugin.extractVideoUrl()` 返回 `"https://cdn.volces.com/video.mp4"`。API Gateway返回 `{status:"completed", videoUrl:"https://cdn.volces.com/video.mp4"}`。前端收到后更新Zustand Store，UI显示视频播放器。

---

## 7. API 网关与 API 服务

### 7.1 API Server

`api-server.ts` 是 Electron 主进程中的 HTTP 服务器，监听 `127.0.0.1:30100`。

#### 服务器配置

| 配置项 | 值 |
|--------|-----|
| 端口 | 30100 |
| 绑定地址 | 127.0.0.1 |
| 最大请求体 | 50 MB |
| 速率限制 | 180 次/分钟/IP |
| CORS | 动态注册 `allowedOrigins` Set（默认含 localhost:3000 和 localhost:3001），通过 `registerAllowedOrigin()` 扩展 |
| CORS Header验证 | 请求必须携带 `X-Electron-App` Header，缺失返回403 |
| 连接追踪 | `apiConnections: Set<net.Socket>` 追踪所有连接，关机时先 `destroy()` 再 `server.close()` |

#### API 路由表

| 路由 | 方法 | 说明 |
|------|------|------|
| health | GET | 健康检查（无需 X-Electron-App 头，返回服务状态+数据库状态+运行时间） |
| config | GET/POST/HEAD | 配置读写 |
| secure-config | POST | 安全配置 |
| upload | POST | 文件上传 |
| analyze-image | POST | 图片分析 |
| generate-image | POST | 图片生成 |
| generate-keyframe | POST | 关键帧生成 |
| generate-frame-pair | POST | 首尾帧对生成 |
| generate-video | POST | 视频生成 |
| video-status | GET/POST | 视频状态查询 |
| generate-text | POST | 文本生成 |
| test-connection | POST | 连接测试 |
| export | POST | 数据导出 |
| story/plan | POST | 故事规划 |
| story/generate-video | POST | 故事视频生成 |
| story/generate-keyframe | POST | 故事关键帧生成 |
| story/generate-frame-pair | POST | 故事帧对生成 |
| quick-generate/video | POST | 快速视频生成 |
| character/generate-image | POST | 角色图片生成 |
| scene/generate-image | POST | 场景图片生成 |
| character/analyze-image | POST | 角色图片分析 |
| scene/analyze-image | POST | 场景图片分析 |
| video/select-strategy | POST | 视频策略选择 |
| video/detect-format | POST | 视频格式检测 |
| video/tracking-info | POST | 视频追踪信息 |
| video/provider-info | POST | 视频提供商信息 |
| video/recover | POST | 视频恢复 |
| plugins/list | GET | 插件列表 |
| plugins/capabilities | GET | 插件能力 |
| plugins/add | POST | 添加插件 |
| plugins/delete | POST | 删除插件 |
| plugins/reload | POST | 重载插件 |
| plugins/validate | POST | 校验插件 |
| plugins/schema | GET | 插件 Schema |
| shot/validate-reference | POST | 镜头引用验证 |
| shot/get-reference-video-url | POST | 获取参考视频 URL |
| shot/build-reference-description | POST | 构建参考描述 |
| validate/consistency | POST | 一致性验证 |
| validate/feature-anchoring | POST | 特征锚定验证 |
| validate/no-frame-binding | POST | 无帧绑定验证 |
| reference/check-character | POST | 角色引用检查 |
| reference/check-scene | POST | 场景引用检查 |
| visual-consistency/check | POST | 视觉一致性检查 |
| visual-consistency/check-beat | POST | 节拍元素一致性检查 |
| storyboard/generate-keyframe | POST | 分镜关键帧生成 |
| storyboard/generate-frame-pair | POST | 分镜帧对生成 |
| storyboard/generate-video | POST | 分镜视频生成 |
| storyboard/generate-full-workflow | POST | 分镜完整工作流 |
| storyboard/generate-keyframe-chain | POST | 分镜关键帧链生成 |
| sync/config | GET/POST | 同步配置读写（分离存储+SSRF联动） |
| sync/test | POST | 同步服务器连接测试 |
| sync/proxy | POST | 同步请求代理（push/pull） |

#### CORS安全验证

API Server 实现了双重CORS验证机制：

1. **Origin验证**：`Access-Control-Allow-Origin` 仅允许 `localhost:3000` 和 `localhost:3001`，阻止其他来源的跨域请求。
2. **X-Electron-App Header验证**：所有API请求必须携带 `X-Electron-App` Header。`Access-Control-Allow-Headers` 包含 `X-Electron-App`，允许预检请求通过。实际请求处理中，如果缺少该Header，服务器返回 `403 Forbidden` 和 `{ error: "Missing X-Electron-App header" }`。这防止了恶意网页通过CORS发起请求——即使攻击者控制了一个localhost端口的网页，也无法伪造该Header（浏览器的CORS预检机制会阻止自定义Header的跨域请求）。

#### /health 健康检查端点

`/health` 端点在 `X-Electron-App` 头检查之前处理，无需认证即可访问，供 AI 工具和监控脚本快速判断服务状态：

```json
{
  "status": "ok",
  "uptime": 12345,
  "timestamp": "2026-05-21T13:00:00.000Z",
  "database": {
    "status": "connected",
    "schemaVersion": 2,
    "path": "/path/to/db.sqlite"
  }
}
```

- `status`：始终为 `"ok"`（服务在运行即返回）
- `uptime`：服务运行秒数
- `database.status`：`"connected"` / `"error"` / `"uninitialized"`
- `database.schemaVersion`：当前 Schema 版本号

#### batch-insert列名校验

`handlers/database.ts` 中的 `db:batch-insert` IPC处理器实现了列名注入防护。在执行批量插入前，通过 `PRAGMA table_info(${table})` 获取目标表的合法列名集合，构建 `validColumns` Set。插入的列名必须在 `validColumns` 中，否则返回 `{ success: false, error: 'Column "xxx" does not exist in table "yyy"' }`。这防止了攻击者通过构造恶意列名（如注入SQL片段）绕过参数化查询的保护。

### 7.2 API Gateway

`api-gateway.ts` 是所有 AI 请求的核心处理模块，负责：

1. **配置解析**：`resolveApiConfig()` 从请求体中解析 API URL、API Key、模型等参数
2. **插件选择**：通过 `pluginRegistry.select()` 匹配对应的 AI 提供商插件
3. **请求构建**：调用插件的 `buildXxxRequest()` 方法构建请求体和端点
4. **认证处理**：调用插件的 `getAuthHeaders()` 和 `appendAuthToUrl()` 处理认证
5. **请求发送**：`makeRequest()` 执行 HTTP 请求（含 SSRF 检查）
6. **响应解析**：调用插件的 `extractXxx()` 方法解析响应

#### 配置解析优先级

```
1. 请求体中的 providerId + modelId → 从配置中查找 provider
2. 请求体中的 apiUrl / apiKey / model
3. capability mapping（如 "video" → "providerId/modelId"）
```

#### 核心函数

| 函数 | 说明 |
|------|------|
| `resolveApiConfig(body, capability?)` | 解析 API 配置，返回 ResolvedConfig |
| `generateText(body)` | 文本生成 |
| `analyzeImage(body)` | 图片分析 |
| `generateImage(body)` | 图片生成 |
| `generateKeyframe(body)` | 关键帧生成（含参考图降级） |
| `generateFramePair(body)` | 首尾帧对生成 |
| `generateVideo(body)` | 视频生成 |
| `videoStatus(body)` | 视频状态查询 |
| `handleUpload(body)` | 文件上传 |
| `makeRequest(url, options)` | HTTP 请求（含 SSRF 防护） |

#### SSRF 防护

`makeRequest()` 在发送请求前调用 `isPrivateUrl()` 检查：
- 通过 `ssrfGuard.validate()` 检查 URL 安全性
- 用户配置的 API 端点自动加入白名单
- 阻止访问私有 IP 地址（127.x, 10.x, 172.16-31.x, 192.168.x, 0.x, localhost, ::1, fe80:）

#### 请求限制

- 默认超时：120 秒
- 视频生成超时：300 秒
- 视频状态查询超时：30 秒
- 最大响应体：50 MB
- 文件上传最大：20 MB（Base64 编码后）

---

## 8. 前端页面与路由

### 8.1 页面列表

| 路由 | 文件 | 说明 |
|------|------|------|
| `/` | `page.tsx` | 首页/仪表盘 |
| `/story` | `story/page.tsx` | 故事列表 |
| `/story/beat/[beatId]` | `story/beat/[beatId]/page.tsx` | 节拍详情编辑 |
| `/characters` | `characters/page.tsx` | 角色管理 |
| `/scenes` | `scenes/page.tsx` | 场景管理 |
| `/asset-library` | `asset-library/page.tsx` | 资产库 |
| `/video-tasks` | `video-tasks/page.tsx` | 视频任务 |
| `/quick-generate` | `quick-generate/page.tsx` | 快速生成 |
| `/settings` | `settings/page.tsx` | 设置（API配置、自动保存、工程打包、系统状态） |
| `/create` | `create/page.tsx` | 创建 |
| `/media` | `media/page.tsx` | 媒体管理 |

### 8.2 布局组件

- `layout.tsx`：根布局，包含全局样式和 Provider
- `SidebarWithSearch.tsx`：侧边栏导航（含搜索）
- `MigrationInitializer.tsx`：数据库迁移初始化
- `StoryProvider.tsx`：故事上下文 Provider

### 8.3 Next.js API 路由（非 AI）

以下 API 路由在 Web 模式和 Electron 模式下均可用：

| 路由 | 说明 |
|------|------|
| `/api/config` | 配置读写 |
| `/api/secure-config` | 安全配置 |
| `/api/image/normalize` | 图片标准化 |
| `/api/prompt/build` | 提示词构建 |
| `/api/story/replace-placeholders` | 故事占位符替换 |
| `/api/sync/pull` | 同步拉取 |
| `/api/sync/push` | 同步推送 |
| `/api/sync/status` | 同步状态 |
| `/api/test-connection` | 连接测试 |
| `/api/upload` | 文件上传 |
| `/api/upload/[filename]` | 上传文件访问 |
| `/api/validate` | 校验 |

---

## 9. 领域层（Domain）

领域层位于 `src/domain/`，包含业务核心的类型定义、Schema、端口接口和领域服务。

### 9.1 端口接口（Ports）

`src/domain/ports/` 定义了领域层与基础设施层的解耦接口（6 个文件，11 个接口）：

| 端口文件 | 接口 | 方法数 | 说明 |
|----------|------|--------|------|
| storage-port.ts | IVideoTaskStorage | 12 | 视频任务存储 |
| storage-port.ts | ICharacterStorage | 9 | 角色存储 |
| storage-port.ts | ISceneStorage | 5 | 场景存储 |
| storage-port.ts | IStoryStorage | 6 | 故事存储 |
| ai-provider-port.ts | IVideoProvider | 5 | 视频生成 |
| ai-provider-port.ts | IImageProvider | 2 | 图片生成/分析 |
| ai-provider-port.ts | ITextProvider | 1 | 文本生成 |
| ai-provider-port.ts | IFileUploader | 1 | 文件上传 |
| sync-port.ts | ISyncStorage | 4 | 同步存储 |
| element-manager-port.ts | IElementManager | 10 | 元素管理 |
| reference-engine-port.ts | IReferenceEngine | 4 | 参考引擎 |

### 9.2 数据 Schema

| Schema | 文件 | 说明 |
|--------|------|------|
| apiSchema | api.ts | API 配置 Schema |
| characterSchema | character.ts | 角色 Schema |
| sceneSchema | scene.ts | 场景 Schema |
| mediaSchema | media.ts | 媒体 Schema |
| shotSystemSchema | shot-system.ts | 镜头系统 Schema |
| storySchema | story.ts | 故事 Schema（使用 `z.preprocess` 统一 null 处理） |

### 9.3 领域服务

| 服务 | 文件 | 说明 |
|------|------|------|
| BeatWorkflowService | beat-workflow-service.ts | 节拍工作流服务 |
| ReferenceCheckService | reference-check.ts | 引用检查服务 |
| ReferenceResolver | reference-resolver.ts | 引用解析器 |
| StoryGenerationService | story-generation-service.ts | 故事生成服务 |

### 9.4 领域类型

| 类型 | 文件 | 说明 |
|------|------|------|
| CloudProvider | cloud-provider.ts | 云提供商类型 |
| InfrastructureTypes | infrastructure.ts | 基础设施类型 |
| Result | result.ts | 结果类型（Ok/Err） |
| SyncTypes | sync.ts | 同步类型（SyncConfig/SyncServerConfig/SyncCredentials/SyncTestRequest/SyncTestResult/SyncProxyRequest） |
| VideoModel | video-model.ts | 视频模型类型 |

### 9.5 领域工具

| 工具 | 文件 | 说明 |
|------|------|------|
| BeatPromptBuilder | beat-prompt-builder.ts | 节拍提示词构建器 |
| PromptVocabulary | prompt-vocabulary.ts | 提示词词汇表 |
| ShotPrompt | shot-prompt.ts | 镜头提示词 |

---

## 10. 基础设施层（Infrastructure）

### 10.1 AI 提供商（ai-providers）

前端侧的 AI 提供商模块，在 Electron 模式下通过 API Client 转发到主进程，在 Web 模式下直接调用 Next.js API Routes。

| 子模块 | 说明 |
|--------|------|
| api-config/ | API 配置管理（检测、初始化、迁移、存储、模板） |
| model-adapter/ | 模型适配器（编解码支持、最大时长查找表） |
| providers/ | 云提供商定义 |
| api-cache.ts | API 缓存 |
| config-status.ts | 配置状态 |
| config.ts | 配置核心 |
| core.ts | 核心功能 |
| enhanced-video.ts | 增强视频 |
| errors.ts | 错误定义 |
| image-normalization.ts | 图片标准化 |
| image.ts | 图片生成 |
| model-capabilities.ts | 模型能力配置 |
| multi-api.ts | 多 API 管理 |
| offline-queue.ts | 离线队列 |
| outfit-synthesis.ts | 服装合成 |
| services.ts | 服务聚合 |
| text.ts | 文本生成 |
| types.ts | 类型定义 |
| utils.ts | 工具函数 |
| video-service.ts | 视频服务 |
| video.ts | 视频生成 |

#### 模型适配器查找表

```typescript
const PROVIDER_CODEC_SUPPORT: Record<string, VideoCodec[]> = {
  volcengine: ["h264", "h265"],
  kuaishou: ["h264", "h265"],
  zhipu: ["h264"],
  pixverse: ["h264", "h265"],
  seedance: ["h264", "h265"],
  google: ["h264", "h265", "vp9"],
  anthropic: ["h264", "h265"],
  "openai-sora": ["h264", "h265"],
  minimax: ["h264", "h265"],
  "openai-compatible": ["h264", "h265"],
};

const PROVIDER_MAX_DURATION: Record<string, number> = {
  volcengine: 12, kuaishou: 10, zhipu: 10,
  pixverse: 10, seedance: 12, google: 8,
  "openai-sora": 20, minimax: 10, "openai-compatible": 12,
};
```

### 10.2 API 客户端（api）

| 文件 | 说明 |
|------|------|
| client.ts | HTTP 客户端，Electron 模式请求 localhost:30100 |
| endpoints.ts | API 端点定义 |
| index.ts | 导出 |

### 10.3 数据库仓库（database）

Drizzle ORM 仓库层：

| 仓库 | 说明 |
|------|------|
| character-repository.ts | 角色仓库 |
| element-repository.ts | 元素仓库 |
| media-asset-repository.ts | 媒体资产仓库 |
| scene-repository.ts | 场景仓库 |
| story-repository.ts | 故事仓库 |

### 10.4 依赖注入（di）

| 文件 | 说明 |
|------|------|
| container.ts | DI 容器（全局单例，Proxy 代理，注册 50+ Token） |
| registry.ts | 模块注册表 |
| types.ts | Token 类型定义（AppContainer 自动推导） |

**关键 Token**：`resilientFetch`（弹性网络请求）、`videoTaskStorage`（视频任务存储）、`characterStorage`（角色存储）、`storyStorage`（故事存储）、`elementStorage`（元素存储）、`videoCacheStorage`（视频缓存存储）、`isElectron`（环境检测）等。所有 modules 层对 infrastructure 的依赖必须通过 `container.xxx` 访问，禁止直接 `import`。

### 10.5 监控（monitoring）

| 文件 | 说明 |
|------|------|
| memory-leak-detector.ts | 内存泄漏检测 |
| performance-monitor.ts | 性能监控 |

### 10.6 网络层（network）

| 文件 | 说明 |
|------|------|
| circuit-breaker.ts | 熔断器 |
| download-manager.ts | 下载管理器 |
| network-monitor.ts | 网络监控 |
| network.config.ts | 网络配置 |
| request-lifecycle.ts | 请求生命周期 |
| resilient-fetch.ts | 弹性 Fetch |
| retry-executor.ts | 重试执行器 |
| types.ts | 类型定义 |
| interceptors/ | 拦截器（缓存、重试、熔断、生命周期、日志） |

### 10.7 存储层（storage）

SQLite 存储层，基于 better-sqlite3：

| 文件 | 表名 | 职责 |
|------|------|------|
| core.ts | — | 基础工具: buildInsert, parseRecord, parseRecordWithTable, parseRecords, toSqlValue, trackChange, DbRunResult |
| sqlite-core.ts | — | SQLite 核心: safeQuery, safeRun, safeTransaction (结果缓存) |
| db.ts | — | 数据库初始化与连接管理 |
| characters/ | characters | 角色 CRUD + 服装管理 |
| characters/parser.ts | — | 角色数据解析 |
| characters/outfit-manager.ts | — | 服装管理（从 characters.ts 拆分） |
| scenes.ts | scenes | 场景 CRUD |
| stories/ | stories | 故事 CRUD |
| stories/beat-transformer.ts | — | 分镜数据转换（从 stories.ts 拆分） |
| stories/relations.ts | — | 故事关联查询（从 stories.ts 拆分） |
| elements/ | elements | 元素 CRUD（命令/查询分离） |
| elements/queries.ts | — | 元素查询操作 |
| elements/commands.ts | — | 元素写入操作 |
| video-tasks/ | video_tasks | 视频任务 CRUD |
| video-tasks/parser.ts | — | 视频任务数据解析（JSON 容器构建/解析） |
| video-tasks/json-schemas.ts | — | JSON 容器 TypeScript 接口（VideoTaskConfig/Provider/MediaRefs/Tracking） |
| video-tasks/bulk-operations.ts | — | 批量操作 |
| index.ts | — | 存储层统一出口（15 个 storage 模块 + 3 个核心函数） |
| video-cache.ts | video_cache | 视频缓存管理（含2GB磁盘保护） |
| import-export.ts | — | 数据导入导出 |
| auto-save.ts | auto_saves | 自动保存（带写入验证） |
| versions.ts | story_versions | 版本管理 |
| templates.ts | templates | 模板管理 |
| sessions.ts | sessions | 会话管理 |
| collections.ts | collections + collection_assets | 收藏集管理（级联删除） |
| error-logs.ts | error_logs | 错误日志 |
| storyboard.ts | storyboard_assets | 分镜板综合查询 |

#### 核心工具函数

**buildInsert**：构建 INSERT 语句，支持冲突策略，使用 `sanitizeTable` + `sanitizeIdentifier` 确保标识符安全：

```typescript
buildInsert(table, record, conflict?: "ABORT" | "IGNORE" | "REPLACE"): { sql: string; params: unknown[] }
// 示例: buildInsert("video_tasks", { task_id: "1", status: "pending" }, "IGNORE")
// → { sql: "INSERT OR IGNORE INTO "video_tasks" ("task_id", "status") VALUES (?, ?)", params: ["1", "pending"] }
// video_tasks 使用 IGNORE 策略避免覆盖运行中任务
```

**parseRecord**：将数据库记录（snake_case）转换为领域对象（camelCase），保持单参数签名兼容 `.map(parseRecord)`。不传表名时仅处理 `is_` 前缀布尔列，不解析 JSON 列。推荐使用 `parseRecordWithTable` 替代以获得 JSON 列自动解析能力：

```typescript
parseRecord<VideoTask>(row, fieldMap): VideoTask
```

**parseRecordWithTable**：带表名的解析函数，根据 `schema-registry` 中注册的列类型信息自动解析 JSON 列和布尔列，推荐替代 `parseRecord` 使用：

```typescript
parseRecordWithTable<VideoTask>(row, fieldMap, table): VideoTask
```

**parseRecords**：批量解析，可选传入表名以启用列类型注册：

```typescript
parseRecords<VideoTask>(rows, fieldMap, table?): VideoTask[]
```

**列类型注册**（schema-registry）：替代硬编码 `JSON_COLUMNS` / `BOOLEAN_COLUMNS` 白名单，各仓库模块通过 `registerColumns()` 声明式注册列类型。注意：当前 `core.ts` 中的注册同时包含旧列名（如 `appearance_json`、`tags_json`）和新列名（如 `appearance`、`generation`），以兼容迁移过渡期。实际 DB schema 仅使用新列名（`appearance`、`generation`、`config`、`meta`、`atmosphere`）。

```typescript
import { registerColumns } from "@/modules/integrity";
// 实际注册示例（core.ts）
registerColumns("characters", [
  ["tags", "json"], ["tags_json", "json"], ["appearance_json", "json"],
  ["personality_json", "json"], ["personality", "json"], ["traits_json", "json"],
  ["outfits", "json"], ["outfits_json", "json"], ["accessories_json", "json"],
  ["generation_params", "json"], ["is_deleted", "boolean"],
]);
registerColumns("video_tasks", [
  ["config", "json"], ["provider", "json"], ["media_refs", "json"],
  ["tracking", "json"], ["is_deleted", "boolean"],
]);
```

**SQL 标识符安全**（sql-sanitizer）：`sanitizeIdentifier()` 校验标识符合法性 + 双引号包裹，`sanitizeTable()` 校验表名，`buildSafeInsert()` / `buildSafeUpdate()` 组合使用：

```typescript
import { sanitizeIdentifier, sanitizeTable } from "@/modules/integrity";
sanitizeIdentifier("task_id");  // → '"task_id"'
sanitizeIdentifier("1; DROP TABLE");  // → throws Error
```

**trackChange**：注册变更追踪（用于同步），仅在 syncConfig.enabled 时注册：

```typescript
trackChange(table, id, operation): void
// 内部: if (changeTracker) changeTracker(table, id, operation)
```

**DbRunResult**：safeRun 返回值类型：

```typescript
interface DbRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}
```

### 10.8 视频工具（video-utils）

| 文件 | 说明 |
|------|------|
| video-codec.ts | 视频编解码类型定义 |
| video-frame-extractor.ts | 视频帧提取 |

### 10.9 服务端工具（server）

| 文件 | 说明 |
|------|------|
| api-utils.ts | API 工具 |
| index.ts | 模块导出 |

以下文件已因无引用被清理删除：`key-vault.ts`、`provider-resolver.ts`、`prompt-builder.service.ts`、`consistency-check.service.ts`、`sync-resolver.service.ts`。这些模块的功能已由插件系统（PluginRegistry + AIProviderPlugin）和API Gateway完全替代，属于历史遗留的死代码。

---

## 10.5 模块间接口契约

### 模块依赖矩阵

| ↓ 依赖 \ 提供 → | video | story | shot | character | scene | asset | prompt | sync |
|------------------|:-----:|:-----:|:----:|:---------:|:-----:|:-----:|:------:|:----:|
| **video**        |   —   |   ✗   |  ✗   |     ✗     |   ✗   |   ✗   |    ✗   |  ✗   |
| **story**        |   ✓   |   —   |  ✓   |     ✗     |   ✗   |   ✗   |    ✓   |  ✗   |
| **shot**         |   ✗   |   ✗   |  —   |     ✗     |   ✗   |   ✗   |    ✗   |  ✗   |
| **character**    |   ✗   |   ✗   |  ✓   |     —     |   ✗   |   ✗   |    ✓   |  ✗   |
| **scene**        |   ✗   |   ✗   |  ✓   |     ✗     |   —   |   ✗   |    ✓   |  ✗   |
| **asset**        |   ✗   |   ✗   |  ✗   |     ✗     |   ✗   |   —   |    ✗   |  ✗   |
| **prompt**       |   ✗   |   ✗   |  ✗   |     ✗     |   ✗   |   ✗   |    —   |  ✗   |
| **sync**         |   ✗   |   ✗   |  ✗   |     ✗     |   ✗   |   ✗   |    ✗   |  —   |

**说明**：`✓` = 直接依赖，`✗` = 禁止直接导入（通过 domain/ports 间接访问）

**关键约束**：
- `story` 是最核心的聚合模块，依赖最多其他模块
- `video`、`shot`、`character`、`scene`、`asset`、`prompt`、`sync` 互不直接依赖
- 所有跨模块访问通过 `domain/ports/` 接口或 DI 容器
- `integrity`、`security`、`persistence`、`feedback` 为横切关注点模块，可被任何业务模块依赖，但互不依赖

**ESLint 机械约束**：

跨模块依赖规则通过 ESLint `no-restricted-imports` 规则机械执行，而非仅靠文档约定：

| 规则 | 作用域 | 级别 | 说明 |
|------|--------|------|------|
| `@/infrastructure/*`（非 di） | modules 生产代码 | error | 模块禁止直接导入 infrastructure 子域 |
| `@/infrastructure/*`（非 di） | modules 测试代码 | warn | 测试文件宽松处理 |
| `@/modules/xxx/*/*`（深路径） | modules 生产代码 | error | 禁止跨模块深路径导入，必须使用桶导入 |
| `@/modules/xxx/*/*`（深路径） | modules 测试代码 | warn | 测试文件允许深路径用于 mock |
| `@/modules/*/*/*`（三级深路径） | 全局 | error | 所有文件禁止三级深路径导入 |

**架构扫描脚本** `scripts/check-architecture.mjs` 在 CI 之外提供额外的架构违规检测：

| 检查项 | 扫描范围 | 规则 |
|--------|----------|------|
| 裸 SQL | `src/modules/**/*.ts` | `db.prepare/run/query/exec(` + SQL 关键词 |
| 深路径跨模块导入 | `src/modules/**/*.ts` | `@/modules/xxx/yyy/zzz`（3+ 层级） |
| infrastructure 直接导入 | `src/modules/**/*.ts` | `@/infrastructure/`（排除 `@/infrastructure/di`，允许 `export type`） |
| shared → infrastructure | `src/shared/**/*.ts` | `@/infrastructure/` |
| shared → modules | `src/shared/**/*.ts` | `@/modules/` |
| domain 不纯 | `src/domain/**/*.ts` | `@/infrastructure/` 或 `@/modules/` |

运行方式：`node scripts/check-architecture.mjs`，有违规时 exit code 1，无违规时 exit code 0。

### 跨模块数据流时序图

```
用户       Story模块      Prompt模块      AI Provider    Video模块
 │            │              │               │              │
 │ 点击生成   │              │               │              │
 │───────────►│              │               │              │
 │            │              │               │              │
 │            │ 1.构建提示词  │               │              │
 │            │─────────────►│               │              │
 │            │              │               │              │
 │            │ 2.完整提示词  │               │              │
 │            │◄─────────────│               │              │
 │            │              │               │              │
 │            │ 3.调用生成    │               │              │
 │            │─────────────────────────────►│              │
 │            │              │               │              │
 │            │              │               │ 4.返回taskId │
 │            │◄─────────────────────────────│              │
 │            │              │               │              │
 │            │ 5.创建任务记录│               │              │
 │            │─────────────────────────────────────────────►│
 │            │              │               │              │
 │            │              │               │ 6.轮询状态   │
 │            │              │               │◄─────────────│
 │            │              │               │              │
 │            │              │               │ 7.返回结果   │
 │            │              │               │─────────────►│
 │            │              │               │              │
 │            │ 8.更新任务状态│               │              │
 │            │◄─────────────────────────────────────────────│
 │            │              │               │              │
 │ 9.显示结果 │              │               │              │
 │◄───────────│              │               │              │
```

---

## 11. 功能模块层（Modules）

功能模块层位于 `src/modules/`，每个模块包含 hooks、services、presentation 组件和 contract.json 契约文件。

### 11.1 资产模块（asset）

| 子模块 | 说明 |
|--------|------|
| asset-library/ | 资产库（ASA 导出服务） |
| hooks/ | use-import-export, use-media-assets, use-project-export |
| import-export/ | 导入导出 |
| media-assets/ | 媒体资产管理 |
| presentation/ | BatchOperations, MediaExporter, ProjectExportImport |

### 11.2 角色模块（character）

| 子模块 | 说明 |
|--------|------|
| hooks/ | use-character-crud, use-character-image, use-characters, use-outfit-management |
| services/ | 角色服务 |

### 11.3 提示词模块（prompt）

| 子模块 | 说明 |
|--------|------|
| base/ | 基础提示词 |
| beat-image/ | 节拍图片提示词 |
| builder/ | 提示词构建器（prompt-builder, quick-mode, story-plan） |
| character/ | 角色提示词（character-prompt-service） |
| scene/ | 场景提示词（scene-prompt-service） |
| server-prompts/ | 服务端提示词（server-prompt-service） |
| video/ | 视频提示词（video-prompt-service） |

### 11.4 场景模块（scene）

| 子模块 | 说明 |
|--------|------|
| hooks/ | use-scene-crud, use-scene-image, use-scenes |
| services/ | 场景服务 |

### 11.5 镜头模块（shot）

| 子模块 | 说明 |
|--------|------|
| consistency-check/ | 一致性检查（config-check, consistency-check） |
| element-binding/ | 元素绑定（element-manager, useElementBinding） |
| feature-extraction/ | 特征提取（feature-anchoring, feature-extraction） |
| reference-check/ | 引用检查 |
| shot-generation/ | 镜头生成（dynamic-few-shot, shot-params, shot-validator, story-generation-pipeline） |
| shot-instruction/ | 镜头指令 |
| shot-reference/ | 镜头参考（reference-engine） |

### 11.6 故事模块（story）

| 子模块 | 说明 |
|--------|------|
| beat-editor/ | 节拍编辑器 |
| │ hooks/ | useAssetLoader, useStoryState |
| │ presentation/ | BeatDetailEditor, BeatOverviewCard, ElementBindingPanel, ProfessionalModeEditor |

### 11.7 完整性模块（integrity）

| 子模块 | 说明 |
|--------|------|
| services/sql-sanitizer.ts | SQL 标识符安全：`sanitizeIdentifier()`、`sanitizeTable()`、`buildSafeInsert()`、`buildSafeUpdate()` |
| services/schema-registry.ts | 声明式列注册：`registerColumn()`、`registerColumns()`、`getColumnKind()`、`getAllRegisteredColumns()`，替代硬编码 `JSON_COLUMNS` 白名单 |
| hooks/use-stable-deps.ts | `useStableDeps(obj)` — JSON 序列化对比，引用不变则返回旧引用，避免 React 无意义重渲染。**注意**：此 hook 不在 `integrity/index.ts` 桶导出中，需从 `@/modules/integrity/hooks/use-stable-deps` 直接导入，以避免 `"use client"` 污染纯工具函数 |
| MODULE.md | 模块契约文档（AI 开发指令） |

### 11.8 安全模块（security）

| 子模块 | 说明 |
|--------|------|
| hooks/use-secure-config.ts | `useSecureConfig()` hook — 通过 IPC 安全通道（`secure-config:*`）存取 API Key，非 Electron 环境拒绝存储（返回 false/null），不再降级到 localStorage |
| MODULE.md | 模块契约文档（AI 开发指令） |

### 11.9 持久化模块（persistence）

| 子模块 | 说明 |
|--------|------|
| hooks/use-persistence-guard.ts | `usePersistenceGuard()` — 保存互斥锁 + pending 积压处理，防止并发保存导致数据覆盖 |
| hooks/use-auto-save.ts | `useAutoSave({ enabled, intervalMinutes, onSave })` — 可配置间隔的自动保存，内置互斥锁 |
| services/transactional-delete.ts | `deleteCharacterWithRefs()`、`deleteSceneWithRefs()` — 一个 `safeTransaction` 内完成引用清理 + 实体删除 |
| MODULE.md | 模块契约文档（AI 开发指令） |

### 11.10 反馈模块（feedback）

| 子模块 | 说明 |
|--------|------|
| hooks/use-dirty-tracker.ts | `useDirtyTracker(current, saved)` — 深比较返回 `isDirty` + `dirtyFields` |
| hooks/use-undo-action.ts | `useUndoAction()` — `executeWithUndo(action, undoAction, label, timeout)` 可撤销操作 |
| presentation/DirtyIndicator.tsx | 脏标记组件 — 脉冲圆点 + "未保存" 文字 |
| MODULE.md | 模块契约文档（AI 开发指令） |

---

## 12. 数据库 Schema

### 12.1 概述

项目使用 better-sqlite3 作为本地 SQLite 数据库，采用 WAL 模式。Schema 通过声明式构建系统（`schema-builder.ts`）定义，所有表结构以 `TableDef` 接口声明，由 `generateTableSQL()` 自动生成 SQL DDL。业务表自动附加 7 字段基础列（owner_id、created_at、updated_at、is_deleted、deleted_at、version、sync_id），易变字段采用 JSON 容器模式存储以避免 ALTER TABLE。

| 配置项 | 值 |
|--------|-----|
| 数据库路径 | `{userData}/database/studio.db` |
| 日志模式 | WAL |
| 同步模式 | NORMAL |
| 缓存大小 | 64 MB |
| 临时存储 | memory |
| 内存映射 | 256 MB |
| Schema 版本 | 2 |
| 构建方式 | 声明式（schema-builder.ts） |
| 基础列 | 7 字段（owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id） |
| JSON 容器 | video_tasks(4), story_beats(3), characters(4), scenes(4) |
| 特性开关 | SCHEMA_FEATURES（users, core, video, sync, templates, assets） |

### 12.2 表结构

#### Schema Builder 声明式架构

`electron/src/database/schema-builder.ts` 实现了声明式表定义系统，核心接口：

```typescript
interface ColumnDef {
  type: string;
  notNull?: boolean;
  default?: string;
  check?: string;
  ref?: string;          // 外键引用，如 "stories(id)"
  onDelete?: string;
  unique?: boolean;
  index?: boolean;
}

interface TableDef {
  name: string;
  columns: Record<string, ColumnDef>;
  baseColumns?: boolean;  // 默认 true，设 false 则不附加基础列
  uniqueConstraints?: string[][];
  primaryKey?: string;
}
```

`generateTableSQL(def: TableDef)` 根据 `TableDef` 自动生成 `CREATE TABLE IF NOT EXISTS` 语句和索引。当 `baseColumns !== false` 时，自动在所有自定义列之前附加 7 字段基础列：

| 基础列 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| owner_id | INTEGER NOT NULL | 1 | 所属用户 ID |
| created_at | INTEGER | strftime('%s','now') | 创建时间（Unix 秒） |
| updated_at | INTEGER | strftime('%s','now') | 更新时间（Unix 秒） |
| is_deleted | INTEGER | 0 | 软删除标记 |
| deleted_at | INTEGER | | 软删除时间 |
| version | INTEGER | 1 | 数据版本号 |
| sync_id | TEXT | | 同步标识 |

`SCHEMA_FEATURES` 控制哪些表组被创建：`{ users, core, video, sync, templates, assets }`，每个特性开关对应一组表的 DDL 生成。

#### JSON 容器模式

易变字段存储在 JSON 列中，避免 ALTER TABLE。每个 JSON 容器对应一个 TypeScript 接口，提供类型安全的解析函数（`parseConfig()`、`parseProvider()` 等）。JSON 容器默认值为 `'{}'`。

#### 实体关系图

```
┌──────────┐       ┌──────────┐
│  Users   │       │  Story   │
│ (用户)   │       │          │
└──────────┘       └────┬─────┘
                        │ 1:N
              ┌─────────┼─────────┐
              ▼         │         ▼
┌──────────────┐  │  ┌──────────┐
│  StoryBeat   │  │  │VideoTask │
│  (分镜)       │  │  │ (视频任务)│
└──────┬───────┘  │  └──────────┘
       │          │
       │ N:1      │ 1:N
       ▼          ▼
┌──────────┐ ┌──────────┐
│Character │ │  Scene   │
│ (角色)   │ │  (场景)   │
└────┬─────┘ └──────────┘
     │ 1:N
     ▼
┌──────────────┐
│CharacterOutfit│
│ (角色服装)    │
└──────────────┘

关系说明:
Users → 默认用户 id=1（本地用户）
Story ─1:N─► StoryBeat (一个故事包含多个分镜)
StoryBeat ─N:1─► Character (分镜引用多个角色，character_ids_json)
StoryBeat ─N:1─► Scene (分镜引用一个场景)
Story ─1:N─► VideoTask (通过 story_id 弱关联)
Character ─1:N─► CharacterOutfit (角色拥有多套服装)
所有业务表共享 owner_id 基础列，指向 users 表
```

#### VideoTask 完整类型

> **注意**：`VideoTask` 类型来自 `api.ts` 的 Zod Schema `videoTaskSchema` 推导，是包含所有字段的完整运行时类型。`VideoTaskRecord`（来自 `infrastructure.ts`）是简化的存储类型，采用 JSON 容器模式，仅包含数据库持久化所需的字段。两者不可混淆。

```typescript
type VideoTaskStatus =
  | "pending"
  | "generating"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

interface VideoTask {
  taskId: string;
  status: VideoTaskStatus;
  progress: number;
  videoUrl?: string;
  message: string;
  createdAt: string;                     // ISO 字符串
  updatedAt?: string;                    // ISO 字符串
  expiresAt?: string;                    // ISO 字符串
  model?: string;
  prompt?: string;
  parameters?: Record<string, unknown>;
  apiUrl?: string;
  apiEndpoint?: string;
  providerId?: string;
  providerModelId?: string;
  providerFormat?: string;
  fixedImageUrl?: string;
  fixedImageLockType?: "character" | "scene";
  referenceVideoUrl?: string;
  referenceVideoMimicryLevel?: "light" | "medium" | "deep";
  templateId?: string;
  templateShots?: string;
  beatId?: string;
  storyId?: string;
  storyTitle?: string;
  beatTitle?: string;
  cacheFailed?: boolean;
  promptWasTruncated?: boolean;
  pollFailureCount?: number;
  pollCount?: number;
  recoveryAttempts?: number;
  lastPolledAt?: string;                // ISO 字符串
  urlObtainedAt?: number;               // Unix 秒
  urlTtl?: number;                      // 秒
}
```

**时间类型说明**：`createdAt`、`updatedAt`、`expiresAt`、`lastPolledAt` 为 ISO 字符串格式（`z.string()`），展示层直接使用；`urlObtainedAt`、`urlTtl` 为 number 类型。`isDeleted`、`vectorClock`、`syncStatus` 已从类型中移除。

#### VideoTaskRecord 存储类型（JSON 容器模式）

```typescript
interface VideoTaskRecord {
  taskId: string;
  status: VideoTaskStatus;
  progress: number;
  videoUrl?: string;
  message: string;
  createdAt: string;
  updatedAt?: string;
  storyId?: string;
  beatId?: string;
  config?: {
    model?: string;
    prompt?: string;
    parameters?: string;
    template_id?: string;
    template_shots?: string;
  };
  provider?: {
    api_url?: string;
    api_endpoint?: string;
    provider_id?: string;
    provider_model_id?: string;
    provider_format?: string;
  };
  mediaRefs?: {
    fixed_image_url?: string;
    fixed_image_lock_type?: string;
    reference_video_url?: string;
    reference_video_mimicry_level?: string;
  };
  tracking?: {
    last_polled_at?: number;
    poll_count?: number;
    poll_failure_count?: number;
    recovery_attempts?: number;
    expires_at?: number;
    url_obtained_at?: number;
    url_ttl?: number;
  };
}
```

JSON 容器的 TypeScript 接口定义在 `src/infrastructure/storage/video-tasks/json-schemas.ts`，提供 `parseConfig()`、`parseProvider()`、`parseMediaRefs()`、`parseTracking()` 类型安全解析函数。

#### users（用户表）— 新增

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 用户 ID |
| username | TEXT | DEFAULT '本地用户' | 显示名称 |
| role | TEXT | DEFAULT 'owner' CHECK(IN ('owner','admin','member','viewer')) | 角色 |
| preferences | TEXT | DEFAULT '{}' | 偏好设置 JSON |
| created_at | INTEGER | DEFAULT now | 创建时间 |
| updated_at | INTEGER | DEFAULT now | 更新时间 |

默认数据：`id=1, username='本地用户', role='owner'`。所有业务表的 `owner_id` 基础列默认值为 1，指向此默认用户。

#### video_tasks（视频任务表）— 已重构

原 37 个扁平列 → 15 个固定列 + 4 个 JSON 容器。

**固定列：**

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 任务 ID（原 task_id） |
| status | TEXT | CHECK(IN ('pending','generating','completed','failed','cancelled','retrying')) DEFAULT 'pending' | 状态 |
| progress | INTEGER | DEFAULT 0 | 进度 |
| video_url | TEXT | | 视频 URL |
| story_id | TEXT | REFERENCES stories(id) | 关联故事 ID |
| beat_id | TEXT | | 关联节拍 ID |
| message | TEXT | | 消息 |
| config | TEXT | DEFAULT '{}' | 配置 JSON 容器 |
| provider | TEXT | DEFAULT '{}' | 提供商 JSON 容器 |
| media_refs | TEXT | DEFAULT '{}' | 媒体引用 JSON 容器 |
| tracking | TEXT | DEFAULT '{}' | 追踪 JSON 容器 |
| created_at | INTEGER | DEFAULT now | 创建时间（基础列） |
| updated_at | INTEGER | DEFAULT now | 更新时间（基础列） |
| is_deleted | INTEGER | DEFAULT 0 | 软删除标记（基础列） |
| deleted_at | INTEGER | | 软删除时间（基础列） |

**JSON 容器结构：**

| 容器 | 字段 | 类型 | 说明 |
|------|------|------|------|
| config | model | string? | 模型 |
| config | prompt | string? | 提示词 |
| config | parameters | string? | 参数 |
| config | template_id | string? | 模板 ID |
| config | template_shots | string? | 模板镜头 |
| config | story_title | string? | 故事标题 |
| config | beat_title | string? | 节拍标题 |
| provider | api_url | string? | API URL |
| provider | api_endpoint | string? | API 端点 |
| provider | provider_id | string? | 提供商 ID |
| provider | provider_model_id | string? | 提供商模型 ID |
| provider | provider_format | string? | 提供商格式 |
| media_refs | fixed_image_url | string? | 固定图片 URL |
| media_refs | fixed_image_lock_type | string? | 固定图片锁定类型 |
| media_refs | reference_video_url | string? | 参考视频 URL |
| media_refs | reference_video_mimicry_level | string? | 参考视频模仿级别 |
| tracking | last_polled_at | number? | 最后轮询时间 |
| tracking | poll_count | number? | 轮询次数 |
| tracking | poll_failure_count | number? | 轮询失败次数 |
| tracking | recovery_attempts | number? | 恢复尝试次数 |
| tracking | expires_at | number? | 过期时间 |
| tracking | url_obtained_at | number? | URL 获取时间 |
| tracking | url_ttl | number? | URL 有效期 |

**已移除字段**：vector_clock、sync_status、last_synced_at、story_title、beat_title（后两者移入 config 容器）。

#### story_beats（故事节拍表）— 已重构

原 30 个扁平列 → 12 个固定列 + 3 个 JSON 容器。

**固定列：**

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 唯一标识 |
| story_id | TEXT | NOT NULL, REFERENCES stories(id) | 所属故事 |
| sequence | INTEGER | NOT NULL | 序号 |
| order_num | INTEGER | | 排序号 |
| title | TEXT | | 标题 |
| content | TEXT | | 内容 |
| description | TEXT | | 描述 |
| duration | INTEGER | | 时长 |
| type | TEXT | | 类型 |
| character_ids_json | TEXT | | 角色 ID 列表（JSON 数组） |
| scene_id | TEXT | | 场景 ID |
| camera | TEXT | DEFAULT '{}' | 摄像机 JSON 容器 |
| generation | TEXT | DEFAULT '{}' | 生成 JSON 容器 |
| meta | TEXT | DEFAULT '{}' | 元数据 JSON 容器 |

**JSON 容器结构：**

| 容器 | 字段 | 类型 | 说明 |
|------|------|------|------|
| camera | shotType | string? | 镜头类型 |
| camera | angle | string? | 摄像机角度 |
| camera | movement | string? | 摄像机运动 |
| camera | distance | string? | 摄像机距离 |
| camera | speed | string? | 摄像机速度 |
| generation | keyframeImageUrl | string? | 关键帧图片 URL |
| generation | keyframePrompt | string? | 关键帧提示词 |
| generation | keyframeGeneratedAt | number? | 关键帧生成时间 |
| generation | firstFrameUrl | string? | 首帧 URL |
| generation | firstFramePrompt | string? | 首帧提示词 |
| generation | lastFrameUrl | string? | 尾帧 URL |
| generation | lastFramePrompt | string? | 尾帧提示词 |
| generation | framePairGeneratedAt | number? | 帧对生成时间 |
| generation | videoUrl | string? | 视频 URL |
| generation | videoTaskId | string? | 视频任务 ID |
| generation | videoStatus | string? | 视频状态 |
| generation | generationPrompt | string? | 生成提示词 |
| generation | imageGenerationPrompt | string? | 图片生成提示词 |
| generation | firstFramePromptGen | string? | 首帧生成提示词 |
| generation | lastFramePromptGen | string? | 尾帧生成提示词 |
| generation | enhancedGeneration | number? | 增强生成标记 |
| generation | characterOutfits | object? | 角色服装配置 |
| meta | [key: string] | any? | 扩展字段（点号分隔键名，如 "keyframe.customField"） |

**已移除字段**：shot_type、camera_angle、camera_movement、camera_distance、camera_speed（移入 camera 容器）；keyframe_image_url、keyframe_prompt、keyframe_generated_at、first_frame_url、first_frame_prompt、last_frame_url、last_frame_prompt、frame_pair_generated_at、video_url、video_task_id、video_status、generation_prompt、image_generation_prompt、first_frame_prompt_gen、last_frame_prompt_gen、enhanced_generation、generation_params、character_outfits_json（移入 generation 容器）。

#### characters（角色表）— 已重构

原 33 个扁平列 → 10 个固定列 + 4 个 JSON 容器。

**固定列：**

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 唯一标识 |
| name | TEXT | NOT NULL | 名称 |
| description | TEXT | | 描述 |
| ref_image_path | TEXT | | 参考图片路径 |
| gender | TEXT | CHECK(IN ('male','female','other','unknown')) | 性别 |
| age | INTEGER | CHECK(BETWEEN 0 AND 200) | 年龄 |
| style | TEXT | | 艺术风格 |
| source | TEXT | CHECK(IN ('ai-generated','uploaded','imported')) | 来源 |
| use_count | INTEGER | DEFAULT 0 | 使用次数 |
| last_used_at | INTEGER | | 最后使用时间 |
| appearance | TEXT | DEFAULT '{}' | 外观 JSON 容器 |
| generation | TEXT | DEFAULT '{}' | 生成 JSON 容器 |
| config | TEXT | DEFAULT '{}' | 配置 JSON 容器 |
| meta | TEXT | DEFAULT '{}' | 元数据 JSON 容器 |

**JSON 容器结构：**

| 容器 | 字段 | 类型 | 说明 |
|------|------|------|------|
| appearance | refImagePath | string? | 参考图片路径 |
| appearance | avatarPath | string? | 头像路径 |
| appearance | thumbnailPath | string? | 缩略图路径 |
| appearance | previewPath | string? | 预览路径 |
| appearance | generatedImage | string? | 生成的图片 |
| appearance | generatedVideo | string? | 生成的视频 |
| appearance | videoGenerationStatus | string? | 视频生成状态 |
| appearance | videoGenerationTaskId | string? | 视频生成任务 ID |
| appearance | imageGenerationPrompt | string? | 图片生成提示词 |
| generation | prompt | string? | 提示词 |
| generation | generationPrompt | string? | 生成提示词 |
| generation | generationParams | string? | 生成参数 |
| config | personality | string? | 性格 |
| config | traits | string? | 特征 |
| config | appearance | object? | 外观配置 |
| meta | tags | string? | 标签 |
| meta | outfits | object? | 服装 |

**已移除字段**：avatar_path、thumbnail_path、preview_path、generated_image、generated_video、video_generation_status、video_generation_task_id、image_generation_prompt（移入 appearance 容器）；prompt、generation_prompt、generation_params（移入 generation 容器）；personality_json、traits_json、appearance_json（移入 config 容器）；tags、outfits_json（移入 meta 容器）；sync_status、vector_clock、last_synced_at（同步字段已移除）。

#### scenes（场景表）— 已重构

结构与 characters 类似，10 个固定列 + 4 个 JSON 容器。

**固定列：**

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 唯一标识 |
| name | TEXT | NOT NULL | 名称 |
| description | TEXT | | 描述 |
| ref_image_path | TEXT | | 参考图片路径 |
| type | TEXT | | 场景类型 |
| source | TEXT | CHECK(IN ('ai-generated','uploaded','imported')) | 来源 |
| use_count | INTEGER | DEFAULT 0 | 使用次数 |
| last_used_at | INTEGER | | 最后使用时间 |
| appearance | TEXT | DEFAULT '{}' | 外观 JSON 容器 |
| atmosphere | TEXT | DEFAULT '{}' | 氛围 JSON 容器 |
| generation | TEXT | DEFAULT '{}' | 生成 JSON 容器 |
| config | TEXT | DEFAULT '{}' | 配置 JSON 容器 |

**JSON 容器结构**：与 characters 类似，appearance 存储图片/视频相关字段，atmosphere 存储时间/天气/光照/情绪等氛围字段，generation 存储生成相关字段，config 存储配置字段。

**已移除字段**：sync_status、vector_clock、last_synced_at（同步字段已移除）。

#### stories（故事表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 唯一标识 |
| title | TEXT | NOT NULL | 标题 |
| description | TEXT | | 描述 |
| genre | TEXT | | 类型 |
| tone | TEXT | | 基调 |
| target_duration | INTEGER | | 目标时长 |
| keyframe_chain_valid | INTEGER | DEFAULT 0 | 关键帧链是否有效 |
| style_guide_json | TEXT | | 风格指南 JSON |
| element_ids_json | TEXT | | 元素 ID 列表 |
| element_bindings_json | TEXT | | 元素绑定配置 |

**已移除字段**：sync_status、vector_clock（同步字段已移除）。stories 表不包含 is_deleted 字段，采用硬删除策略。

#### 其他表

| 表名 | 基础列 | 说明 |
|------|--------|------|
| story_characters | 否 | 故事-角色关联（junction table） |
| story_scenes | 否 | 故事-场景关联（junction table） |
| story_elements | 否 | 故事-元素关联（junction table） |
| story_versions | 是 | 故事版本（含 is_deleted 基础列） |
| character_outfits | 是 | 角色服装 |
| elements | 是 | 元素（character/prop/effect） |
| media_assets | 是 | 媒体资产（含 is_deleted 基础列） |
| video_templates | 是 | 视频模板 |
| storyboard_assets | 是 | 分镜资产（含 is_deleted 基础列） |
| collections | 是 | 集合（含 is_deleted 基础列） |
| collection_assets | 否 | 集合-资产关联（junction table） |
| asset_tags | 否 | 资产标签（junction table） |
| ast_templates | 是 | AST 模板 |
| generation_tasks | 是 | 生成任务 |
| video_cache | 否 | 视频缓存（baseColumns=false） |
| error_logs | 否 | 错误日志（baseColumns=false） |
| sessions | 否 | 会话（baseColumns=false） |
| auto_saves | 否 | 自动保存（baseColumns=false） |
| file_index | 否 | 文件索引（baseColumns=false） |
| sync_changelog | 否 | 同步变更日志 |
| sync_meta | 否 | 同步元数据 |
| sync_conflict_backup | 否 | 同步冲突备份 |
| schema_version | 否 | Schema 版本 |

### 12.3 索引

数据库包含 45 个索引，覆盖以下查询场景：

- 故事关联查询：story_characters, story_scenes, story_beats, story_elements
- 视频任务状态查询：video_tasks(status), video_tasks(story_id), video_tasks(expires_at)
- 视频缓存查询：video_cache(task_id), video_cache(cached_at), video_cache(file_size)
- 生成任务查询：generation_tasks(status, created_at), generation_tasks(story_id, beat_id)
- 角色查询：characters(style), characters(gender), characters(source), characters(name)
- 场景查询：scenes(type), scenes(atmosphere), scenes(name)
- 模板查询：ast_templates(category), ast_templates(name), ast_templates(usage_count)
- 同步查询：sync_changelog(synced, timestamp), sync_changelog(entity_type, entity_id)
- 文件索引：file_index(file_hash), file_index(expires_at)

### 12.4 ER关系与实体关联模型

28张表之间的关联关系构成了AI Animation Studio的数据骨架。理解这些关系对于编写正确的查询、维护数据一致性和设计新功能至关重要。

**故事核心关联**是整个数据模型的中心。`stories` 表通过三个关联表与 `characters` 和 `scenes` 建立多对多关系：`story_characters` 表包含 `story_id` 和 `character_id` 两个外键，允许一个角色出现在多个故事中，也允许一个故事包含多个角色；`story_scenes` 表结构类似，连接故事和场景。`stories` 表与 `story_beats` 表是一对多关系，每个故事包含多个节拍（beat），节拍通过 `story_id` 外键关联到故事，并通过 `sequence` 和 `order_num` 字段定义在故事中的排列顺序。`stories` 表与 `story_elements` 表通过 `elements` 表建立多对多关系——`story_elements` 连接故事和元素（角色/道具/特效），`elements` 表存储元素本身的属性。`stories` 表与 `story_versions` 表是一对多关系，每次故事的重大修改都会在 `story_versions` 中创建一条版本记录，包含 `snapshot_data`（故事快照JSON）和 `version_number`，支持版本回溯。

**角色与服装关联**中，`characters` 表与 `character_outfits` 表是一对多关系。每个角色可以拥有多套服装（如"日常装"、"战斗装"、"礼服"），每套服装存储在 `character_outfits` 表中，包含 `name`（服装名称）、`description`（描述）、`image_path`（服装参考图路径）、`prompt_modifiers`（提示词修饰符，如"穿着红色连衣裙"）。服装的设计目的是支持同一角色在不同场景下穿着不同服装——节拍编辑器中的 `character_outfits_json` 字段存储了每个节拍中各角色选择的服装ID映射，例如 `{"char_001": "outfit_003"}` 表示角色char_001在此节拍中穿着outfit_003号服装。这种设计的业务含义是：一个角色在故事开头可能穿着便装，在高潮场景换上战斗装备，在结尾穿上礼服，服装切换是叙事的重要视觉元素。

**视频任务关联**中，`video_tasks` 表通过 `story_id` 和 `beat_id` 字段与故事和节拍建立弱关联（非外键约束）。一个节拍可以对应多个视频任务（用户可能对同一节拍多次生成视频，选择最满意的一个），一个故事的所有节拍的视频任务通过 `story_id` 聚合查询。`video_tasks` 表与 `video_cache` 表通过 `task_id` 建立一对一关系——每个成功完成的视频任务，其视频文件会被下载到本地缓存，`video_cache` 表记录 `task_id`、`file_path`（本地文件路径）、`file_size`、`cached_at`。当用户通过 `vcache://` 协议访问视频时，protocol handler 根据 `task_id` 在 `video_cache` 表中查找本地文件路径。

**资产与集合关联**中，`media_assets` 表与 `collections` 表通过 `collection_assets` 关联表建立多对多关系。一个媒体资产可以属于多个集合（如同一张图片既在"角色参考"集合中又在"风格参考"集合中），一个集合可以包含多个资产。`media_assets` 表与 `asset_tags` 表是多对多关系，标签用于资产的分类检索。

**同步链路**中，`sync_changelog` 表记录所有数据变更事件（entity_type + entity_id + operation + vector_clock），`sync_meta` 表存储同步游标和远端信息，`sync_conflict_backup` 表保存冲突发生时的本地和远端数据快照。三者的关系是：`sync_changelog` 是增量同步的数据源（查询未同步的变更），`sync_meta` 是同步状态的元数据（上次同步时间、远端URL），`sync_conflict_backup` 是冲突解决的审计日志。

删除策略方面，Stories 采用硬删除（直接 `DELETE FROM stories WHERE id = ?`），Characters 和 Scenes 采用软删除（`is_deleted` + `deleted_at` 基础列）。关联表（story_characters/story_scenes/story_elements）采用硬删除——删除故事时，关联记录被物理删除而非软删除，因为关联记录没有独立的业务含义，不需要恢复。采用基础列的业务表自动包含 `is_deleted` 和 `deleted_at` 字段，其中 characters 和 scenes 的软删除由 `performSoftDeleteCleanup()` 定时物理清理。video_tasks 表的 `is_deleted` 基础列同样存在，但已移除 sync_status、vector_clock、last_synced_at 等同步相关字段——is_deleted 不再用于同步场景的逻辑删除标记，仅作为标准软删除机制使用。

### 12.5 核心索引设计与查询场景

47个索引中，以下12个是最关键的性能保障索引，每个索引都针对一个高频查询场景设计。

**idx_story_beats_story_id** 索引建立在 `story_beats(story_id)` 上，服务于"查询某故事的所有节拍"这一最频繁的查询。每次用户打开故事详情页、切换故事、或保存节拍修改时，都会执行 `SELECT * FROM story_beats WHERE story_id = ? ORDER BY sequence, order_num`。没有该索引时，数据库需要全表扫描 `story_beats`（可能包含数千条记录），查询耗时从亚毫秒级退化到数十毫秒级。该索引的选择性为低——一个故事通常包含10-50个节拍，在总共数千条记录中占比很小，但B树索引的有序性使得范围扫描非常高效。

**idx_video_tasks_status** 索引建立在 `video_tasks(status)` 上，服务于"按状态筛选视频任务"查询。轮询引擎每隔15秒执行 `SELECT * FROM video_tasks WHERE status IN ('pending', 'generating', 'retrying')` 获取所有活跃任务。没有该索引时，轮询引擎需要扫描所有视频任务（包括大量已完成的终态任务），在任务积累到数千条后，每次轮询的查询耗时显著增加。该索引的选择性为低——大多数任务处于completed终态，活跃任务占比很小，但索引使得数据库只需扫描少量叶节点即可定位活跃任务。

**idx_video_tasks_story_id** 索引建立在 `video_tasks(story_id)` 上，服务于"查询某故事关联的所有视频任务"。在故事详情页的视频任务面板中，执行 `SELECT * FROM video_tasks WHERE story_id = ? ORDER BY created_at DESC`。该索引的选择性为中等——一个故事通常包含5-20个视频任务。

**idx_characters_name** 索引建立在 `characters(name)` 上，服务于侧边栏搜索框的实时搜索功能。用户每输入一个字符，前端执行 `SELECT * FROM characters WHERE name LIKE ? AND is_deleted = 0`。没有该索引时，LIKE查询需要全表扫描，在角色数量超过100个后搜索响应明显变慢。该索引的选择性为高——角色名通常是唯一的。

**idx_sync_changelog_synced_timestamp** 复合索引建立在 `sync_changelog(synced, timestamp)` 上，服务于增量同步查询 `SELECT * FROM sync_changelog WHERE synced = 0 ORDER BY timestamp ASC`。该索引将"未同步"和"按时间排序"两个条件合并，避免了先筛选未同步记录再排序的两步操作。该索引的选择性为低——未同步的变更通常只占总量的一小部分。

**idx_generation_tasks_status_created** 复合索引建立在 `generation_tasks(status, created_at)` 上，服务于生成任务列表的排序查询 `SELECT * FROM generation_tasks WHERE status = ? ORDER BY created_at DESC LIMIT 20`。该索引同时满足筛选和排序需求，数据库可以直接从索引中按顺序读取记录，无需额外的排序操作（filesort）。

**idx_video_cache_task_id** 索引建立在 `video_cache(task_id)` 上，服务于 `vcache://` 协议的视频查找。当用户播放视频时，protocol handler 执行 `SELECT * FROM video_cache WHERE task_id = ?`。该索引的选择性为高——task_id是唯一的。没有该索引时，每次视频播放都需要全表扫描video_cache，在缓存文件数量较多时导致播放延迟。

**idx_media_assets_type** 索引建立在 `media_assets(type)` 上，服务于资产库的按类型筛选功能。用户在资产库页面选择"图片"或"视频"标签时，执行 `SELECT * FROM media_assets WHERE type = ? AND is_deleted = 0`。该索引的选择性为中等。

**idx_story_beats_keyframe** 索引建立在 `story_beats(keyframe_generated_at)` 上，服务于关键帧生成状态查询。批量生成关键帧时，系统需要找出所有未生成关键帧的节拍 `SELECT * FROM story_beats WHERE story_id = ? AND keyframe_generated_at IS NULL`。该索引使得数据库可以快速跳过已生成关键帧的节拍。

**idx_file_index_expires** 索引建立在 `file_index(expires_at)` 上，服务于过期文件清理 `SELECT * FROM file_index WHERE expires_at < strftime('%s','now')`。清理任务定期执行，没有该索引时需要全表扫描file_index表，在文件索引数量较大时影响清理效率。

**idx_stories_updated_at** 索引建立在 `stories(updated_at)` 上，服务于故事列表按更新时间排序查询 `SELECT * FROM stories ORDER BY updated_at DESC`。该索引使得数据库可以直接从索引中按顺序读取记录，无需额外的排序操作。

**idx_video_tasks_status_updated** 复合索引建立在 `video_tasks(status, updated_at)` 上，服务于按状态筛选并按更新时间排序的视频任务查询 `SELECT * FROM video_tasks WHERE status IN ('pending', 'generating', 'retrying') ORDER BY updated_at DESC`。该索引同时满足筛选和排序需求，避免了对活跃任务的全表扫描和额外排序。

### 12.6 删除策略与数据生命周期

AI Animation Studio 对不同实体采用不同的删除策略：Stories 采用硬删除，Characters 和 Scenes 采用软删除。

**Stories 硬删除**：stories 表不包含 `is_deleted` 字段，删除故事时直接执行 `DELETE FROM stories WHERE id = ?`，同时在一个事务中物理删除所有关联记录（story_characters、story_scenes、story_beats）。设计决策：故事是顶层容器，删除故事意味着用户不再需要该故事及其所有内容，硬删除简化了查询逻辑（无需 `WHERE is_deleted = 0` 过滤），也避免了孤立节拍数据的积累。

**Characters 和 Scenes 软删除**：characters 和 scenes 表包含 `is_deleted INTEGER DEFAULT 0` 字段。删除操作执行 `UPDATE xxx SET is_deleted = 1, updated_at = ? WHERE id = ?` 而非 `DELETE FROM xxx WHERE id = ?`。所有查询操作必须添加 `WHERE is_deleted = 0` 条件过滤已删除记录。在存储层代码中，这个过滤条件被封装在基础查询函数中，确保开发者不会遗漏。

**软删除的级联清理**以"删除角色"为例：第一步，将characters表的is_deleted设为1；第二步，同步清理所有 story_beats 中对该角色的引用——将 character_ids JSON 数组中该角色 ID 移除。删除场景时同理：将 story_beats 中引用该场景的 scene_id 设为 NULL。这种"软删除实体 + 清理引用"的策略确保了：已删除的角色/场景不会出现在选择器中，但已有节拍的结构完整性不受破坏。

**设计决策：为什么 Characters/Scenes 选软删除而 Stories 选硬删除？** 角色和场景是可复用资源，用户可能花费数小时精心设计一个角色的外观和提示词，一次误点击删除如果导致物理删除，所有工作将不可挽回。软删除允许通过 `UPDATE characters SET is_deleted = 0 WHERE id = ?` 瞬间恢复数据。而故事是独立项目容器，删除故事通常是用户有意识的操作（清理不需要的项目），且故事的关联数据量大（节拍、视频任务等），软删除会导致大量不可见数据占用存储空间。

**软删除自动清理机制**：`db-connection.ts` 中实现了定时物理清理，防止软删除记录无限积累。`startSoftDeleteCleanup()` 在数据库初始化完成后启动，首次立即执行一次清理，之后每24小时执行一次。`performSoftDeleteCleanup()` 对 characters 和 scenes 表执行 `DELETE FROM xxx WHERE is_deleted = 1 AND updated_at < ?`，保留期为30天——即软删除超过30天的记录才会被物理删除，30天内的记录仍可恢复。清理间隔和保留期通过常量 `SOFT_DELETE_CLEANUP_INTERVAL_MS`（24小时）和 `SOFT_DELETE_MAX_AGE_MS`（30天）控制。应用退出时 `stopSoftDeleteCleanup()` 清除定时器。

**数据库操作超时机制**：`enqueueOperation()` 函数为所有数据库操作添加了30秒超时保护（`OPERATION_TIMEOUT_MS = 30000`）。每个操作通过 `Promise.race()` 竞争执行和超时，如果操作在30秒内未完成，Promise会被reject并抛出 `"Database operation timed out after 30s"` 错误。这防止了单个慢查询（如未索引的全表扫描、大量数据的批量插入）无限阻塞操作队列，导致后续所有数据库操作饥饿。

### 12.7 向量时钟与冲突解决

> **架构变更说明**：vector_clock、sync_status、last_synced_at 已从所有业务表（characters、scenes、stories、video_tasks、story_beats）中移除。同步字段已简化——业务表不再各自维护向量时钟，同步状态由 sync_changelog 统一管理。sync_changelog 表仍保留 vector_clock 字段，用于记录变更事件的因果信息。

向量时钟（Vector Clock）是分布式系统中解决因果关系的经典算法，AI Animation Studio 将其应用于多设备数据同步场景。

**向量时钟的数据结构**存储在 `sync_changelog` 表的 `vector_clock` 字段中，格式为JSON字符串，例如 `{"device_abc": 3, "device_xyz": 5}`。键是设备标识符，值是该设备上的逻辑时钟计数器。每次本地更新操作时，更新本设备的计数器：`vector_clock[deviceId] = (vector_clock[deviceId] || 0) + 1`。业务表不再直接存储 vector_clock 和 sync_status，而是通过 sync_changelog 的变更事件追踪同步状态。

**因果关系判断**通过向量时钟的比较实现。给定两个向量时钟V1和V2，如果V1中的每个键值都小于等于V2中对应键值，且至少有一个键值严格小于，则V1 < V2（V1是V2的因果前驱，V2是更新版本）。如果V1和V2存在不可比较的键（V1中某键值大于V2，V2中另一键值大于V1），则两者是并发修改，存在冲突。

**冲突检测与解决**发生在同步推送时。当本地数据推送到远端，远端发现本地向量时钟与远端向量时钟不可比较时，触发冲突解决。当前实现的冲突解决策略是Last-Write-Wins（LWW）：比较本地和远端的 `updated_at` 时间戳，时间戳较新的版本胜出。选择LWW而非CRDT（无冲突复制数据类型）的原因是：CRDT需要为每种数据类型设计专门的合并函数（如G-Counter、LWW-Register、OR-Set），实现复杂度极高；LWW只需要一个时间戳比较，实现简单且在大多数场景下行为符合直觉。LWW的缺点是在真正的并发修改场景下会丢失一方的修改——例如设备A修改了角色名称，设备B修改了角色外观，LWW会选择时间戳较新的那个版本，导致另一方的修改被覆盖。但在动画制作这种"单人创作、偶尔同步"的场景下，真正的并发修改极为罕见，LWW的简单性远比CRDT的理论完美性更有价值。

**冲突数据备份**在 `sync_conflict_backup` 表中实现。每次冲突解决时，系统将本地数据和远端数据都保存到该表中，包含 `entity_type`（实体类型）、`entity_id`（实体ID）、`local_data`（本地数据JSON）、`remote_data`（远端数据JSON）、`resolved_at`（解决时间）。这为用户提供了事后审计和手动恢复的能力——如果LWW选择了错误的版本，用户可以从备份中提取被覆盖的数据。

**sync_changelog表**记录所有数据变更事件，字段包括 `entity_type`（如"character"、"story"）、`entity_id`（实体UUID）、`operation`（"insert"/"update"/"delete"）、`vector_clock`（变更后的向量时钟）、`synced`（是否已同步，0或1）、`timestamp`（变更时间）、`device_id`（设备标识）。增量同步查询 `SELECT * FROM sync_changelog WHERE synced = 0 ORDER BY timestamp ASC` 返回所有未同步的变更，按时间顺序推送到远端。同步成功后，将 `synced` 设为1。

### 12.8 Schema迁移策略

数据库Schema的演进通过版本化的迁移策略管理，确保应用升级时数据库结构平滑过渡。

**版本控制机制**使用 `CURRENT_SCHEMA_VERSION` 常量（当前值为1）和 `schema_version` 表。`schema_version` 表只有两列：`version`（INTEGER，当前Schema版本号）和 `applied_at`（INTEGER，版本应用时间的Unix时间戳）。每次数据库初始化完成后，`markSchemaVersion()` 函数执行 `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, strftime('%s', 'now'))` 记录当前版本。

**声明式 Schema 构建**：所有表结构通过 `schema-builder.ts` 的 `TableDef` 接口声明，由 `generateTableSQL()` 自动生成 SQL DDL。`getSchemaSQL()` 函数根据 `SCHEMA_FEATURES` 特性开关组装完整的 Schema SQL，包括 PRAGMA 配置、schema_version 表、users 表、核心业务表（FEATURE_TABLES）、关联表（JUNCTION_TABLES）、缓存表（CACHE_TABLES）、同步表和额外索引。这种声明式方式的优势是：表结构变更只需修改 `TableDef` 定义，无需手写 SQL；JSON 容器模式使得添加新字段只需修改 TypeScript 接口和解析函数，无需 ALTER TABLE。

**初始化流程**在 `initDatabase()` 中执行三个步骤。第一步，`executeSchemaSafely()` 执行完整的Schema SQL，所有CREATE TABLE和CREATE INDEX语句都使用 `IF NOT EXISTS` 子句保证幂等性——如果表或索引已存在，语句静默跳过而非报错。这种"全量Schema + IF NOT EXISTS"的策略比"增量迁移脚本"更简单可靠：不需要追踪哪些迁移已执行，不需要维护迁移脚本顺序，每次启动都执行完整的Schema定义即可。第二步，`runMigrations()` 处理版本间的增量迁移。第三步，`markSchemaVersion()` 记录当前版本号。

**迁移历史**记录在 `MIGRATIONS` 对象中，每个版本号对应一个迁移函数。项目尚未发布，`MIGRATIONS = {}`（空对象），当前无历史迁移记录。开发阶段采用"删除并重建"策略——Schema 变更时直接删除数据库文件重新初始化，无需编写迁移脚本。迁移框架已独立为 `migrations.ts` 文件，导出 `CURRENT_SCHEMA_VERSION`、`MIGRATIONS` 和 `runMigrations(db, currentVersion)` 函数，为未来发布后的版本升级做好准备。

**迁移失败处理**区分关键表和非关键表。`CRITICAL_TABLES` 数组定义了6个关键表：characters、scenes、stories、story_beats、video_tasks、schema_version。如果这些表的CREATE TABLE语句执行失败，`executeSchemaSafely()` 会将错误收集到 `errors` 数组中，最终抛出异常终止应用启动——因为这些表是应用核心功能的基石，缺失任何一个都会导致数据丢失或功能崩溃。非关键表（如ast_templates、error_logs、sessions）的创建失败仅记录warn日志继续运行，因为这些表的缺失不影响核心功能，用户仍可正常使用角色、场景、故事和视频生成功能。

**数据库损坏恢复**在 `initDatabase()` 的catch块中实现。当数据库文件损坏（如断电导致WAL文件不完整、磁盘坏道导致文件读取错误）时，恢复流程分为四步：第一步，将损坏的数据库文件重命名为 `studio.db.corrupted.{timestamp}`，保留现场供高级用户手动恢复。第二步，调用 `tryRestoreFromBackup()` 从 `{userData}/database/backups/` 目录中查找最新的备份文件，按修改时间降序排列，依次尝试复制到原路径。第三步，用恢复的文件重新执行Schema初始化和迁移。第四步，如果备份恢复也失败，创建一个全新的空数据库。全新数据库意味着用户的所有数据丢失，但至少应用可以正常启动——这比"应用无法启动、用户连界面都看不到"要好得多。定时备份机制在数据库初始化30秒后首次执行（确保Schema初始化和迁移完成），之后每24小时自动备份一次，最多保留7份备份，超过30天的备份自动清理。此外，`saveDatabase()` 成功执行后，如果距离上次备份超过1小时（`lastBackupTime` 变量追踪），会触发一次增量备份，确保用户主动保存的数据及时落盘。

---

## 13. 安全机制

### 13.1 SSRF 防护

`electron/src/security/ssrf-guard/ssrf-guard.ts` 提供服务端请求伪造防护：

- 验证目标 URL 不指向私有 IP 地址
- 支持白名单机制（用户配置的 API 端点自动加入）
- DNS 重绑定防护（含IP缓存，TTL 60秒）
- IPv6映射地址检测（`::ffff:x.x.x.x`）
- 白名单仍执行DNS验证
- 在 `api-gateway.ts` 的 `makeRequest()` 中集成

**三重SSRF修复**：

1. **IPv6映射地址绕过修复**：`isPrivateIp()` 新增对IPv6映射地址的检测。攻击者可能使用 `::ffff:192.168.1.1` 格式的IPv6地址绕过仅检查IPv4的私有IP检测。修复后，`isPrivateIp()` 使用正则 `/^::ffff:(\d+\.\d+\.\d+\.\d+)$/` 提取映射的IPv4地址，递归调用 `isPrivateIp()` 检测。同时处理IPv6压缩格式（如 `::ffff:0:0` 等）。

2. **DNS重绑定TOCTOU缓存**：新增 `resolvedIpCache` Map和 `RESOLVED_IP_TTL = 60000`（60秒TTL）。`getResolvedIp()` 方法缓存DNS解析结果，在TTL内复用已解析的IP地址，缩小DNS重绑定攻击的时间窗口。当 `validateDns()` 解析hostname后，将结果存入缓存；后续请求在60秒内使用缓存的IP地址进行私有IP检查，而非重新解析——这消除了"验证时DNS返回公网IP、请求时DNS返回内网IP"的TOCTOU（Time-of-Check-Time-of-Use）竞争条件。

3. **白名单仍执行DNS验证**：修复前，匹配白名单的URL直接返回 `{safe: true}` 跳过所有安全检查。修复后，白名单匹配后仍执行DNS解析验证，确保白名单中的域名不会被DNS重绑定攻击利用——即使域名在白名单中，如果DNS解析结果指向私有IP，请求仍会被拦截。

### 13.2 API Key 存储

`electron/src/security/key-storage/` 提供 API Key 存储策略：

| 策略 | 文件 | 说明 |
|------|------|------|
| safe-storage | safe-storage.strategy.ts | 使用 Electron safeStorage 加密（操作系统凭据管理） |
| plaintext-fallback | plaintext-fallback.strategy.ts | AES-256-GCM 加密回退（机器特征派生密钥） |

存储策略选择：
- 优先使用 `safeStorage` 加密
- 如果 `safeStorage` 不可用，回退到 AES-256-GCM 加密存储（密钥从机器特征派生）
- 本地优先应用中，即使回退方案也提供了加密保护，安全性高于明文存储

#### 13.2.1 Secure-Config IPC 安全通道

渲染进程通过 `secure-config:*` IPC 通道安全地存取 API Key，API Key 永远不经过渲染进程明文传递：

| IPC 通道 | 权限 | 说明 |
|----------|------|------|
| `secure-config:save` | READWRITE | 保存 API Key（providerId + apiKey） |
| `secure-config:load` | READONLY | 加载 API Key（仅返回是否存在，不返回明文） |
| `secure-config:resolve` | SECURE | 解析 API Key 明文（仅主进程内部使用） |
| `secure-config:delete` | READWRITE | 删除 API Key |
| `secure-config:has` | READONLY | 检查 API Key 是否存在 |

渲染进程通过 `useSecureConfig()` hook（`src/modules/security/hooks/use-secure-config.ts`）访问，非 Electron 环境自动降级到 localStorage。

**已移除**：渲染端自造 AES-256-GCM 加密模块 `src/infrastructure/secure-storage.ts`（salt/IV/密文同存 localStorage，伪安全）已删除，由主进程 safeStorage + IPC 安全通道替代。

#### 13.2.2 同步凭证分离存储

同步服务器配置采用分离存储设计，避免将敏感信息与非敏感配置混合加密：

- **非敏感字段**（`config.json`，electron-store 明文存储）：`enabled`、`autoSync`、`syncInterval`、`conflictStrategy`、`endpoint`、`server.url`、`server.connected`、`server.lastConnectedAt`、`server.serverVersion`
- **敏感字段**（`KeyStorageManager`，safeStorage 加密）：`sync_credentials` 键存储 `{ username, token }`

这种设计的优势：
1. 非敏感配置读取无需解密，性能更优
2. 与现有 `config-manager.ts` 保持单一配置系统，不产生两套配置管理
3. GET 返回时 token 自动脱敏为 `***`，防止渲染进程获取明文

#### 13.2.3 SSRF 白名单联动

同步服务器 URL 变更时，`handlers/sync.ts` 自动管理 SSRF 白名单：

1. 保存新配置时，对比旧 URL 和新 URL
2. 如果 URL 变更：`ssrfGuard.removeWhitelist(oldUrl)` → `ssrfGuard.addWhitelist(newUrl)`
3. 如果首次配置：仅 `ssrfGuard.addWhitelist(newUrl)`
4. 如果 server 设为 null：`ssrfGuard.removeWhitelist(oldUrl)` + `keyStorage.delete("sync_credentials")`
5. URL 未变更：不操作白名单

这防止了用户多次更换服务器后白名单累积过期 URL，确保 SSRF 防护有效性。

### 13.3 Preload 安全

- **上下文隔离**：`contextIsolation: true`
- **Node.js 禁用**：`nodeIntegration: false`
- **IPC 白名单**：只允许预定义的 IPC 通道
- **DDL 阻止**：渲染进程不能执行 DDL SQL 语句（`stripSqlComments()` 先剥离 `/* */` 和 `--` 注释再检测，防止注释绕过）
- **速率限制**：IPC 调用频率限制（只读 300 次/分钟，其他 100 次/分钟），限流清理定时器添加 `unref()` 防止进程阻塞退出，Map 大小限制 200 条目
- **配置键验证**：只允许预定义的配置键
- **Secure-Config 通道**：`secure-config:*` 通道分级权限控制（READONLY/READWRITE/SECURE），API Key 明文仅限主进程内部使用
- **安全日志转发**：`log:security` IPC 通道将 preload 中的安全事件（未注册通道拦截、DDL 阻止、同步 IPC 拦截、配置读写失败）转发到主进程 Logger，确保安全事件持久化到日志文件

### 13.4 导航安全

- `will-navigate`：阻止外部导航，只允许 localhost
- `setWindowOpenHandler`：拦截新窗口，外部链接用 `shell.openExternal`
- 静态文件服务器路径遍历防护

### 13.5 SSRF攻击面分析

SSRF（Server-Side Request Forgery，服务端请求伪造）是AI Animation Studio面临的最严重的安全威胁之一。由于应用允许用户配置任意的API URL，攻击者可以通过配置恶意URL使主进程向内网服务发起请求。`electron/src/security/ssrf-guard/ssrf-guard.ts` 实现了多层SSRF防护。

**攻击场景1：恶意API URL**。用户在设置中配置 `apiUrl` 为 `http://192.168.1.1/admin`，意图让主进程访问内网管理界面。防护机制：`ssrfGuard.validate()` 首先解析URL，提取hostname，然后检查是否匹配私有IP模式（`127.x`、`10.x`、`172.16-31.x`、`192.168.x`、`0.x`、`localhost`、IPv6本地地址）。如果匹配，返回 `{safe: false, reason: "Private hostname detected"}`，请求被阻止。自定义白名单机制允许用户将特定的内网地址加入白名单（如自部署的AI服务器），但白名单是显式配置的，不会默认放行任何私有地址。

**攻击场景2：DNS重绑定**。攻击者配置 `apiUrl` 为 `http://evil.com/steal`，其中 `evil.com` 在DNS解析时返回公网IP（通过SSRF检查），但后续HTTP请求时DNS返回内网IP（如 `192.168.1.1`）。防护机制：`ssrfGuard.validate()` 在异步模式下执行DNS解析验证（`validateDns`），将hostname解析为IP地址后检查IP是否为私有地址。如果DNS解析返回私有IP，返回 `{safe: false, reason: "DNS resolved to private IP: 192.168.1.1"}`。DNS解析超时3秒，超时后的策略由 `dnsFailurePolicy` 配置决定——默认为 `allow`（高自由度，适合开发环境），生产环境建议设为 `deny`（更安全）。DNS重绑定防护通过 `resolvedIpCache` 缓存（TTL 60秒）缩小TOCTOU时间窗口——在缓存有效期内，DNS解析结果被复用，攻击者无法在验证和请求之间切换DNS记录。完全防御需要在使用解析后的IP直接发起请求（而非重新解析hostname），但这需要修改底层的HTTP客户端实现。

**攻击场景3：URL解析绕过**。攻击者尝试使用非HTTP协议绕过检查，如 `file:///etc/passwd`、`ftp://internal.server/data`、`javascript:alert(1)`、`data:text/html,<script>`。防护机制：`ssrfGuard.validate()` 只允许 `http:` 和 `https:` 协议，其他协议一律返回 `{safe: false, reason: "Unsupported protocol"}`。此外，云元数据端点（AWS的 `169.254.169.254`、GCP的 `metadata.google.internal` 和 `metadata.goog`）被单独拦截，即使它们不在标准私有IP范围内。这是因为云元数据端点可以泄露服务器的IAM凭证和实例信息，在云环境中是SSRF攻击的首要目标。

**SSRF防护的残余风险**：第一，同步验证方法 `validateSync()` 不执行DNS解析，仅检查hostname模式，无法防御DNS重绑定；第二，DNS解析的AAAA记录（IPv6）检查已通过IPv6映射地址检测间接覆盖，纯IPv6内网地址（如 `fe80::1`、`fc00::/7`）的检测已修复——使用第一个 hextet 的位运算判断（link-local: `(value & 0xffc0) === 0xfe80`，ULA: `(value & 0xfe00) === 0xfc00`），不再依赖 `split(":")` 后的第二个元素（压缩 IPv6 地址如 `fe80::1` 的第二个元素为空字符串导致 `parseInt` 返回 NaN）；第三，`resolvedIpCache` 的TTL为60秒，超过TTL后仍需重新解析，存在短暂的时间窗口。

### 13.6 IPC威胁模型

Electron的IPC通道是渲染进程与主进程之间的唯一通信桥梁，也是安全防护的关键边界。IPC威胁模型分析4个主要威胁向量及其防护措施。

**威胁1：SQL注入**。渲染进程中的恶意代码（如XSS注入的脚本）可能通过 `window.electronAPI.dbRun()` 发送恶意SQL语句。防护措施：`handlers/database.ts` 中的 `validateSql()` 函数实施7层安全校验（详见3.7节"数据库层对恶意IPC调用的防护"）。残余风险：`validateSql()` 的正则匹配可能存在边界情况——例如使用Unicode字符或特殊编码绕过表名提取逻辑。但考虑到渲染进程的代码由开发者控制（不加载外部网页内容），SQL注入的实际攻击面较小。

**威胁2：文件系统访问**。渲染进程可能通过IPC请求访问任意文件。防护措施：`handlers/assets.ts` 只允许访问 `{userData}` 目录下的文件，路径遍历攻击（如 `../../../etc/passwd`）被路径规范化后的前缀检查阻止。残余风险：符号链接可能绕过路径前缀检查——如果 `{userData}` 目录下存在指向系统目录的符号链接，渲染进程可以通过该链接访问系统文件。当前实现未检测符号链接的目标路径。

**威胁3：配置篡改**。渲染进程可能通过 `config:set` IPC通道修改关键配置项（如API URL、安全策略）。防护措施：`handlers/config.ts` 中的 `ALLOWED_CONFIG_KEYS` 白名单限制了可修改的配置键，不在白名单中的键名直接拒绝。残余风险：白名单中的某些配置键（如 `providers` 数组）允许修改API URL，攻击者可以将URL改为恶意地址。但SSRF防护会在实际请求时拦截恶意URL，形成纵深防御。

**威胁4：速率限制绕过**。渲染进程可能高频调用IPC通道导致DoS。防护措施：IPC调用频率限制通过 `rateLimiter` 中间件实现，每个通道有独立的速率阈值。残余风险：速率限制是基于渲染进程维度的，如果攻击者通过XSS获取了渲染进程的执行权限，速率限制只能减缓攻击速度，不能完全阻止。彻底的防御需要在主进程侧实施资源配额（如单次IPC调用的最大内存/CPU使用量），但当前实现未包含此机制。

### 13.7 API Key存储安全分析

API Key是用户访问AI服务的凭证，其存储安全性直接影响用户资产安全。`electron/src/security/key-storage/` 实现了双策略存储架构。

**SafeStorage策略**（优先级1，最高）使用Electron内置的 `safeStorage` API，底层调用操作系统的安全存储机制：Windows使用DPAPI（Data Protection API），macOS使用Keychain，Linux使用libsecret/kwallet。`safeStorage.encryptString(plaintext)` 将API Key加密后存储到 `{userData}/secure/encrypted-keys.json` 文件中。加密密钥由操作系统管理，与应用进程隔离——即使攻击者获取了加密文件，没有操作系统的解密密钥也无法还原明文。`SafeStorageStrategy.isAvailable()` 检查 `safeStorage.isEncryptionAvailable()` 的返回值，在Linux上如果未安装libsecret或kwallet，该方法返回false，策略不可用。

**PlaintextFallback策略**（优先级99，最低）在SafeStorage不可用时作为兜底方案。它使用AES-256-GCM加密算法，但加密密钥从机器特征派生：`crypto.createHash("sha256").update("aas-fallback-v1:" + hostname + "|" + platform + "|" + arch + "|" + homedir).digest()`。加密后的数据存储在 `{userData}/secure/encrypted-keys.fallback.json` 文件中。这种方案的安全性远低于SafeStorage——机器特征（hostname、platform、arch、homedir）是可预测的，攻击者如果知道目标机器的基本信息，可以重建派生密钥并解密API Key。因此，PlaintextFallback策略的注释明确标注"非安全，仅作为回退方案"。

**策略选择机制**在 `KeyStorageManager.initialize()` 中实现。它按优先级遍历已注册的策略列表，选择第一个 `isAvailable()` 返回true的策略。当前注册顺序为：SafeStorageStrategy（优先级1）→ PlaintextFallbackStrategy（优先级99）。如果SafeStorage可用，始终选择SafeStorage；如果不可用（如Linux未安装libsecret），回退到PlaintextFallback。

**配置迁移机制**在 `handlers/config.ts` 的 `migrateToSecureStorage()` 中实现。当检测到配置文件中的API Key是明文（不以 `$secure:` 开头）时，自动将API Key保存到安全存储，并将配置文件中的值替换为 `$secure:${providerId}` 引用。迁移完成后设置 `_migratedToSecureStorage` 标志，避免重复迁移。这种"透明迁移"的设计确保了用户无感知——用户仍然在设置界面输入API Key，但底层存储自动切换到安全方案。

**设计决策：为什么保留PlaintextFallback而非强制要求SafeStorage？** 核心原因是兼容性。在部分Linux发行版上，libsecret和kwallet可能未安装或未正确配置，SafeStorage不可用。如果强制要求SafeStorage，这些用户将完全无法使用应用。PlaintextFallback虽然安全性较低，但至少提供了基本的加密保护（AES-256-GCM），比明文存储好得多。权衡"可用性"和"安全性"后，选择兼容性优先，但在应用启动时通过日志警告用户当前使用的是回退方案。

---

## 14. 网络层

### 14.1 熔断器（Circuit Breaker）

`src/infrastructure/network/circuit-breaker.ts` 实现了熔断器模式：

```
状态机：closed → open → half-open → closed

closed（关闭）：
  - 正常放行请求
  - 失败计数达到 failureThreshold → 转为 open

open（打开）：
  - 拒绝所有请求（可提供 fallback）
  - 经过 recoveryTimeout → 转为 half-open

half-open（半开）：
  - 允许有限请求（halfOpenMaxCalls）
  - halfOpenActiveCalls 原子计数器跟踪并发请求数
  - 并发请求超过 halfOpenMaxCalls → 拒绝（防雪崩）
  - 成功计数达到 successThreshold → 转为 closed
  - 任何失败 → 转回 open
```

**half-open并发控制**：`CircuitBreakerState` 新增 `halfOpenActiveCalls` 字段，用于跟踪half-open状态下当前正在执行的请求数。当half-open状态的熔断器收到请求时，先检查 `halfOpenActiveCalls >= halfOpenMaxCalls`，如果已达到上限则直接拒绝，避免在half-open状态下涌入过多请求导致下游服务再次崩溃（雪崩效应）。请求开始时 `halfOpenActiveCalls++`，请求完成时使用 `wasHalfOpenCall` 局部变量确保 finally 块正确递减 `halfOpenActiveCalls--`，避免状态已转换后误减计数器。当熔断器从half-open转为closed或open时，重置 `halfOpenActiveCalls = 0`。

核心 API：

| 函数 | 说明 |
|------|------|
| `getCircuitState(providerId)` | 获取熔断器状态 |
| `executeThroughCircuit(providerId, fn, fallback?)` | 通过熔断器执行 |
| `resetCircuitBreaker(providerId)` | 重置指定熔断器 |
| `resetAllCircuitBreakers()` | 重置所有熔断器 |
| `getAllCircuitStates()` | 获取所有熔断器状态 |

### 14.2 重试执行器

`retry-executor.ts` 提供指数退避重试机制。`isRetryableError()` 函数判断错误是否可重试：对已知临时性错误（网络超时、5xx服务器错误、ECONNRESET等）返回 `true`，对未知错误默认返回 `false`（不可重试），避免对不确定的错误盲目重试浪费API配额。

### 14.3 离线队列选择性重试

`src/infrastructure/ai-providers/offline-queue.ts` 实现了离线任务队列，在Electron端网络不可用时将AI请求暂存，网络恢复后自动重试。

**选择性重试机制**：`retryFailedTasks()` 不再盲目重试所有失败任务，而是通过 `PERMANENT_ERROR_PATTERNS` 区分临时性失败和永久性失败。永久性错误模式包括：401/403认证错误、400参数错误、配额超限（quota/billing/rate limit）、模型不存在等。只有临时性失败（网络超时、5xx服务器错误等）才会被重试，永久性失败的任务保持失败状态，避免无意义的重复请求浪费API配额。

```typescript
const PERMANENT_ERROR_PATTERNS = [
  /401|unauthorized/i,
  /403|forbidden/i,
  /400|bad request/i,
  /quota|billing|rate limit/i,
  /invalid.*api.*key/i,
  /model.*not.*found/i,
];
```

### 14.4 拦截器

| 拦截器 | 说明 |
|--------|------|
| cache.interceptor.ts | 缓存拦截器 |
| circuit-breaker.interceptor.ts | 熔断器拦截器 |
| lifecycle.interceptor.ts | 生命周期拦截器 |
| logging.interceptor.ts | 日志拦截器 |
| retry.interceptor.ts | 重试拦截器 |

### 14.5 其他网络组件

| 组件 | 说明 |
|------|------|
| download-manager.ts | 下载管理器 |
| network-monitor.ts | 网络监控 |
| network.config.ts | 网络配置 |
| request-lifecycle.ts | 请求生命周期管理 |
| resilient-fetch.ts | 弹性 Fetch 封装 |

---

## 15. 依赖注入容器

### 15.1 容器架构

`src/infrastructure/di/container.ts` 实现了一个基于 Token 的 DI 容器：

```typescript
// 创建 Token
const token = createToken<T>(name, factory);

// 注册到 Registry
registry.register(token, "singleton");

// 解析
resolve<T>(token);  // 函数式
container.tokenName  // Proxy 代理式
```

**循环依赖检测**：`resolve()` 函数使用 `resolving` Set 追踪当前正在解析的Token链。解析开始时将 `token.id` 加入 Set，解析完成后移除。如果在解析过程中发现 `token.id` 已在 Set 中，说明存在循环依赖（如 A → B → A），立即抛出错误并输出完整的依赖链（如 `"Circular dependency detected: tokenA -> tokenB -> tokenA"`）。这防止了循环依赖导致的无限递归栈溢出，在开发阶段即可快速定位问题。

### 15.2 注册的依赖

容器注册了 78 个 Token，涵盖：

**存储类**：videoTaskStorage, characterStorage, sceneStorage, storyStorage, versionStorage, elementStorage, videoCacheStorage, collectionStorage, storyboardStorage, importExportStorage, templateStorage, autoSaveStorage, errorLogStorage, sessionStorage

**仓库类**：mediaAssetRepository, characterRepository, sceneRepository, storyRepository, elementRepository

**AI 提供商**：videoProvider, imageProvider, textProvider, fileUploader

**工具类**：resolveImageUrl, toSqlValue, trackChange, safeQuery, safeRun, safeTransaction, imageApi, videoApi, textApi, eventBus, getErrorMessage, synthesizeOutfit, batchSynthesizeOutfits, getProviderSupportedCodecs, getProviderMaxDuration, cloudProviders, defaultCloudProvider, registerObjectUrl, revokeObjectUrl, getObjectUrl, isElectron, loadConfig, elementManager, referenceEngine, updateOutfitImage

**DI 容器 Token 完整分类**：

| 分类 | Token | 数量 |
|------|-------|------|
| 存储端口 | videoTaskStorage, characterStorage, sceneStorage, storyStorage, versionStorage, elementStorage, videoCacheStorage, collectionStorage, storyboardStorage, importExportStorage, templateStorage, autoSaveStorage, errorLogStorage, sessionStorage | 14 |
| 数据库仓库 | characterRepository, sceneRepository, storyRepository, mediaAssetRepository, elementRepository | 5 |
| AI 提供商端口 | videoProvider, imageProvider, textProvider, fileUploader | 4 |
| 同步端口 | syncStorage | 1 |
| 领域服务 | elementManager, referenceEngine | 2 |
| AI 配置 | loadConfig, checkConfigStatus, initConfig, resolveImageSize | 4 |
| 视频工具 | detectVideoCodec, isCodecSupportedByProvider, getVideoCodecLabel, getContainerLabel, extractVideoFrames, dataUrlToFile | 6 |
| SQL 安全 | sanitizeIdentifier, sanitizeTable, buildSafeInsert, buildSafeUpdate, buildSafeDelete | 5 |
| Schema 注册 | registerColumn, registerColumns, getColumnKind, getAllRegisteredColumns, isColumnRegistered | 5 |
| 基础设施 | resolveImageUrl, toSqlValue, trackChange, safeQuery, safeRun, safeTransaction, apiClient, imageApi, videoApi, textApi, eventBus, getErrorMessage, synthesizeOutfit, batchSynthesizeOutfits, getProviderSupportedCodecs, getProviderMaxDuration, cloudProviders, defaultCloudProvider, registerObjectUrl, revokeObjectUrl, getObjectUrl, resilientFetch, isElectron, updateOutfitImage, preferencesStorage | 26 |
| **合计** | | **78** |

**DI 容器特性**：

| 特性 | 实现 |
|------|------|
| 生命周期 | 全部 `singleton`（单例） |
| 循环依赖检测 | `resolving` Set 追踪，检测到循环抛出异常并输出依赖链 |
| 未知 Token | 抛出 `[DI] Unknown container token` 错误 |
| 缓存 | `singletonCache` Map 缓存已解析实例 |
| Proxy 代理 | `container.tokenName` 通过 Proxy 代理式访问 |

### 15.3 ModuleRegistry

`registry.ts` 提供模块注册和生命周期管理：

```typescript
class ModuleRegistry {
  register<T>(token: Token<T>, scope: "singleton" | "transient"): void;
  resolve<T>(token: Token<T>): T;
}
```

---

## 16. 自定义协议

`electron/src/protocol.ts` 注册了三个自定义协议：

### 16.1 app:// 协议

用于加载应用内资源文件：

```
app://index.html → 加载 dist/index.html
app://static/style.css → 加载 dist/static/style.css
```

安全措施：
- 路径遍历检测：`normalizedPath.startsWith("..")`
- `decodeURIComponent` 后二次检查
- 多路径搜索策略

### 16.2 file:// 协议拦截

拦截 `file://` 协议请求，处理相对路径引用：

- 检测 `./` 和 `../` 路径
- 路径遍历防护
- 多路径搜索

### 16.3 vcache:// 协议

用于访问本地视频缓存：

```
vcache://{taskId} → {VIDEO_CACHE_DIR}/{taskId}.mp4
```

安全措施：
- taskId 格式验证：只允许 `[a-zA-Z0-9_\-.:]`
- 路径遍历检测：taskId 不含 `..`、`/`、`\`
- 解析后路径必须在 VIDEO_CACHE_DIR 内

---

## 17. 日志系统

### 17.1 Logger

`electron/src/logging/logger.ts` 提供结构化日志：

```typescript
const logger = getLogger("module-name");
logger.debug(message, context?);
logger.info(message, context?);    // 2 个参数
logger.warn(message, context?);    // 2 个参数
logger.error(message, error?, context?);  // 3 个参数（error 和 context 均可选）
```

**方法签名差异**：`info`/`warn` 只接受 `(message, context?)` 两个参数，`error` 接受 `(message, error?, context?)` 三个参数。常见错误是将 `info`/`warn` 当作 3 个参数调用（如 `logger.info("msg", undefined, { key: value })`），这会导致 context 被忽略。

### 17.2 Transport 初始化

日志 Transport 在应用启动时通过 `loggerRegistry.setDefaultTransports()` 初始化，所有后续通过 `getLogger()` 创建的 Logger 实例自动继承这些 Transport：

| 入口 | ConsoleTransport | FileTransport |
|------|-----------------|---------------|
| `main.ts`（生产） | minLevel: "info" | minLevel: "info", filename: "app" |
| `main-dev.ts`（开发） | minLevel: "debug" | minLevel: "debug", filename: "dev" |

### 17.3 日志文件

| 配置 | 值 |
|------|-----|
| 生产日志路径 | `%APPDATA%/ai-animation-studio/logs/app-YYYY-MM-DD.log` |
| 开发日志路径 | `%APPDATA%/ai-animation-studio/logs/dev-YYYY-MM-DD.log` |
| 单文件大小上限 | 10MB |
| 轮转策略 | 超过 10MB 重命名为 `.1`（单备份），新文件继续写入；同时 `cleanupOldFiles()` 保留最新 5 个日志文件，超出部分删除 |
| 最大保留文件数 | 5 |
| 刷盘间隔 | 5 秒（队列超过 100 条时立即刷盘） |
| 进程退出保障 | `beforeExit` 事件触发 `flush()` |

### 17.4 日志传输

| 传输 | 文件 | 说明 |
|------|------|------|
| ConsoleTransport | console.transport.ts | 控制台输出（带颜色） |
| FileTransport | file.transport.ts | 文件输出（JSON 格式，含日志轮转） |

### 17.5 日志使用规范

所有 Electron 主进程模块统一使用 Logger，不再使用 `console.log/warn/error`。Logger 实例通过 `getLogger(moduleName)` 获取。Preload 中的安全事件通过 `log:security` IPC 通道转发到主进程 Logger，确保安全事件持久化到日志文件。

---

### 17.4 Result 类型与错误处理体系

项目采用 **Result Monad** 模式替代异常，所有可能失败的操作返回 `Result<T, E>` 类型。

#### Result 类型定义

```typescript
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

构造函数：

```typescript
ok(data);                           // 成功
err(new ApiError("CODE", "msg"));   // 失败
fromThrowable(() => riskyOp());     // 包装同步异常
fromAsyncThrowable(() => asyncOp()); // 包装异步异常
```

使用模式：

```typescript
function doWork(): Result<Data> {
  const result = someOperation();
  if (!result.ok) return result; // 透传错误
  return ok(processData(result.value));
}

// 调用方
const result = doWork();
if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error.code, result.error.message);
}
```

#### AppError 错误类型层次（12 种）

```
AppError (基类)
├── code: string
├── message: string
└── cause?: unknown

├── DatabaseError          code: "DATABASE_ERROR"
├── ValidationError        code: "VALIDATION_ERROR"
├── ApiError               code: "API_ERROR"
│   ├── statusCode?: number
│   └── apiCode?: string
├── NotFoundError          code: "NOT_FOUND"
├── NetworkError           code: "NETWORK_ERROR"
├── StorageError           code: "STORAGE_ERROR"
├── ConfigurationError     code: "CONFIGURATION_ERROR"
├── GenerationError        code: "GENERATION_ERROR"
│   └── generationType: "keyframe"|"framePair"|"video"|"image"|"text"
├── TimeoutError           code: "TIMEOUT_ERROR"
├── RateLimitError         code: "RATE_LIMIT_ERROR"
│   └── retryAfter?: number
├── AuthenticationError    code: "AUTHENTICATION_ERROR"
└── TransitionError        code: "INVALID_TRANSITION"
    ├── from: VideoTaskStatus
    └── to: VideoTaskStatus
```

核心原则：

1. **不抛异常** — 业务逻辑使用 `Result` 返回
2. **类型安全** — 编译器强制处理错误路径
3. **错误分类** — 12 种具体错误类型覆盖所有场景
4. **统一日志** — 所有错误通过 `errorLogger` 记录
5. **禁止空 catch** — 所有 catch 块至少添加日志

---

## 18. 测试体系

当前测试统计：137 个测试文件，2683 个测试用例。

### 18.1 测试框架

| 框架 | 版本 | 用途 |
|------|------|------|
| Vitest | ^4.1.7 | 单元测试 |
| Playwright | ^1.59.1 | E2E 测试 |
| @testing-library/react | ^16.3.0 | 组件测试 |
| MSW | ^2.8.2 | API Mock |

### 18.2 单元测试

| 测试文件 | 用例数 | 说明 |
|----------|--------|------|
| model-adapter.test.ts | 10 | 模型适配器 |
| video-codec.test.ts | 11 | 视频编解码 |
| circuit-breaker-state.test.ts | 9 | 熔断器状态 |
| event-bus.test.ts | 9 | 事件总线 |
| api-client.test.ts | | API 客户端 |
| api-core.test.ts | | API 核心 |
| api-client-image.test.ts | | 图片 API |
| element-manager.test.ts | | 元素管理 |
| error-handler.test.ts | | 错误处理 |
| image-url.test.ts | | 图片 URL |
| model-capabilities.test.ts | | 模型能力 |
| offline-queue.test.ts | | 离线队列 |
| prompt-generation.test.ts | | 提示词生成 |
| secureStorage.test.ts | | 安全存储 |
| storyboard-generation.test.ts | | 分镜生成 |
| video-cache-service.test.ts | | 视频缓存服务 |
| video-providers.test.ts | | 视频提供商 |
| video-recovery.test.ts | | 视频恢复 |
| video-tracker.test.ts | | 视频追踪 |
| smart-retry-engine.test.ts | | 智能重试引擎 |
| storage/core.test.ts | | 存储核心 |
| storage/elements.test.ts | | 元素存储 |
| storage/stories.test.ts | | 故事存储 |
| storage/video-cache.test.ts | | 视频缓存存储 |
| storage/video-tasks.test.ts | | 视频任务存储 |
| api-config/detect.test.ts | | API 配置检测 |
| prompt-engine/base.test.ts | | 提示词引擎基础 |
| cascade-cleanup.test.ts | | 级联清理 |
| useDebouncedState.test.ts | | 防抖状态 |
| ModelSelector.test.tsx | | 模型选择器 |
| VirtualList.test.tsx | | 虚拟列表 |
| sync/sync-config-storage.test.ts | 15 | 同步配置存储契约（分离存储+脱敏+SSRF联动） |
| sync/sync-config-ssrf.test.ts | 15 | 同步 SSRF 安全边界（私有IP/元数据端点/白名单） |
| sync/sync-config-migration.test.ts | 5 | 同步配置迁移（endpoint→server） |
| sync/sync-test-connection.test.ts | 5 | 同步测试连接（成功/401/超时/网络错误） |
| sync/sync-proxy.test.ts | 5 | 同步代理转发（push/pull/401/网络错误） |
| sync/SyncSettingsPanel.test.tsx | 5 | 同步设置 UI（渲染/测试连接/保存/状态） |

### 18.3 E2E 测试

| 测试文件 | 说明 |
|----------|------|
| api-config-storage.test.ts | API 配置存储 |
| compatibility.test.ts | 兼容性 |
| database-integrity.test.ts | 数据库完整性 |
| electron-ipc-and-security.test.ts | Electron IPC 与安全 |
| error-handling.test.ts | 错误处理 |
| integration-api.test.ts | API 集成 |
| integration-electron.test.ts | Electron 集成 |
| performance.test.ts | 性能 |
| plugin-architecture.test.ts | 插件架构 |
| regression.test.ts | 回归测试 |
| security.test.ts | 安全测试 |
| smoke.test.ts | 冒烟测试 |
| storage-integrity.test.ts | 存储完整性 |
| workflow-story-creation.test.ts | 故事创建工作流 |
| workflow-video-generation.test.ts | 视频生成工作流 |
| workflow-sync-server-config.test.ts | 同步服务器配置工作流（配置→测试→保存/断开/URL变更） |

### 18.4 Electron 主进程测试

| 测试文件 | 说明 |
|----------|------|
| prompt-engine.test.ts | 提示词引擎 |
| db-connection.test.ts | 数据库连接 |
| database.test.ts | 数据库操作 |
| logger.test.ts | 日志器 |
| key-storage.test.ts | Key 存储 |
| key-storage-enhanced.test.ts | Key 存储增强 |
| ssrf-guard.test.ts | SSRF 防护 |
| ssrf-guard-enhanced.test.ts | SSRF 防护增强 |

### 18.5 领域层测试

| 测试文件 | 说明 |
|----------|------|
| api-schema.test.ts | API Schema |
| character-schema.test.ts | 角色 Schema |
| scene-schema.test.ts | 场景 Schema |
| schema-validation.test.ts | Schema 校验 |
| shot-system-schema.test.ts | 镜头系统 Schema |
| domain-services.test.ts | 领域服务 |
| story-generation-service.test.ts | 故事生成服务 |
| result.test.ts | Result 类型 |
| prompt-builder.test.ts | 提示词构建器 |
| shot-prompt.test.ts | 镜头提示词 |

### 18.6 Mock 工具

| 文件 | 说明 |
|------|------|
| ai-call-mock.ts | AI 调用 Mock |
| ai-provider-mock.ts | AI 提供商 Mock |
| browser.ts | 浏览器环境 Mock |
| di-container.ts | DI 容器 Mock |
| electron-api.ts | Electron API Mock |
| factories.ts | 测试数据工厂 |
| handlers.ts | MSW Handler |
| in-memory-db.ts | 内存数据库 Mock |
| ipc-responses.ts | IPC 响应 Mock |
| server.ts | 服务器 Mock |
| storage-ports.ts | 存储端口 Mock |

### 18.7 测试命令

```bash
npm test                    # 运行所有测试
npm run test:coverage       # 运行测试并生成覆盖率报告
npm run test:ui             # Vitest UI 模式
npm run test:quick          # 快速运行测试
npm run test:e2e            # Playwright E2E 测试
npm run test:setup          # 测试配置向导
```

### 18.8 better-sqlite3 重编译

better-sqlite3 是原生 Node.js 模块，需要针对不同运行时编译：

| 场景 | 命令 | 说明 |
|------|------|------|
| 运行 Vitest 测试 | `npm rebuild better-sqlite3` | 为当前 Node.js 版本编译（NODE_MODULE_VERSION 137） |
| Electron 打包 | 自动（`@electron/rebuild`） | electron-builder 自动为 Electron 版本重编译（NODE_MODULE_VERSION 145） |
| 手动为 Electron 编译 | `npx electron-rebuild -f -w better-sqlite3` | 手动触发 Electron 重编译 |

**注意**：如果在运行 Vitest 前执行了 Electron 打包，better-sqlite3 会被编译为 Electron 版本，导致 Vitest 测试全部失败（`NODE_MODULE_VERSION mismatch`）。此时需要重新执行 `npm rebuild better-sqlite3`。反之，打包前无需手动重编译，electron-builder 会自动处理。

### 18.9 测试金字塔策略

AI Animation Studio 的测试体系遵循三层测试金字塔模型，从底到顶分别为单元测试、集成测试和E2E测试。金字塔的比例约为70:20:10，单元测试占绝大多数，E2E测试最少——这是因为单元测试执行速度快（毫秒级）、维护成本低、定位问题精确，而E2E测试执行速度慢（秒级）、容易因UI变化而失败、问题定位困难。

**单元测试层（70%）**使用Vitest框架，覆盖以下模块：

| 模块 | 测试文件 | 核心测试点 |
|------|----------|-----------|
| 状态机 | task-machine.test.ts | 合法/非法转移、终态判断、副作用 |
| 提示词 | prompt-builder.test.ts | 8步流水线各阶段输出、边界输入 |
| 词汇表 | prompt-vocabulary.test.ts | 关键词映射完整性、joinParts过滤 |
| 熔断器 | circuit-breaker-state.test.ts | 状态转移、阈值触发、半开恢复 |
| 事件总线 | event-bus.test.ts | emit/on/off、通配符、错误隔离 |
| SSRF防护 | ssrf-guard.test.ts, ssrf-guard-enhanced.test.ts | 私有IP拦截、协议过滤、白名单、DNS解析 |
| Key存储 | key-storage.test.ts | 策略选择、加密/解密、迁移 |

单元测试的Mock策略遵循"Mock外层，不Mock内层"原则：测试状态机时不Mock任何依赖（纯函数），测试API Client时Mock fetch和网络层，测试React组件时Mock IPC通道和API响应。`src/__tests__/mocks/` 目录提供了标准化的Mock工具：`electron-api.ts` Mock `window.electronAPI` 对象，`in-memory-db.ts` 提供内存SQLite数据库替代真实数据库，`ai-provider-mock.ts` 模拟AI提供商的响应。

**集成测试层（20%）**验证多个模块协作的正确性。关键集成测试场景包括：视频任务创建→轮询→状态更新→缓存下载的完整链路（Mock远端API，真实Zustand Store和IPC通道），提示词构建→API请求→响应解析的完整链路（Mock HTTP请求，真实BeatPromptBuilder和PluginRegistry），数据库写入→IPC传输→渲染进程接收的完整链路（真实better-sqlite3，Mock IPC序列化）。

**E2E测试层（10%）**使用Playwright框架，验证用户视角的完整工作流。E2E测试的运行环境是Electron应用本身（通过 `electron:dev` 模式启动），而非浏览器中的Web版本。这是因为Electron模式下的IPC通道和本地API Server是核心功能，Web模式下无法测试这些路径。

### 18.10 关键E2E测试场景步骤

**场景1：视频生成完整工作流**

1. 启动Electron开发服务器（`npm run electron:dev`）
2. Playwright通过 `electron.launch()` 启动应用
3. 导航到设置页面，配置API URL和API Key
4. 导航到故事编辑页面，创建一个新故事
5. 在故事中添加一个节拍，填写描述和镜头参数
6. 点击"生成视频"按钮
7. 断言：任务列表中出现新任务，状态为"pending"或"generating"
8. 等待轮询引擎更新任务状态（最长等待120秒）
9. 断言：任务状态变为"completed"，videoUrl非空
10. 点击视频播放器
11. 断言：视频播放器加载成功，无错误提示
12. 关闭应用

**场景2：角色创建与提示词生成**

1. 启动应用
2. 导航到角色管理页面
3. 点击"创建角色"按钮
4. 填写角色名称、外观描述、风格标签
5. 上传角色参考图
6. 保存角色
7. 断言：角色列表中出现新角色，名称和外观描述匹配
8. 导航到故事编辑页面，创建节拍
9. 在节拍中添加刚创建的角色作为场景元素
10. 点击"生成提示词"按钮
11. 断言：生成的提示词包含角色名称和外观关键词
12. 断言：提示词末尾包含质量标签（masterpiece, best quality等）

**场景3：插件管理**

1. 启动应用
2. 导航到插件管理页面
3. 断言：内置插件列表包含Volcengine、Kuaishou等10个插件
4. 点击"添加用户插件"按钮
5. 上传或粘贴一个合法的 `.plugin.json` 配置
6. 断言：插件列表中出现新添加的用户插件
7. 断言：插件状态为"已加载"
8. 导航到设置页面，配置与用户插件匹配的API URL
9. 断言：API配置页面显示"将使用 xxx 插件"的提示
10. 删除用户插件
11. 断言：插件列表中不再显示该用户插件

---

## 19. 构建与部署

### 19.1 构建命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | Next.js 开发服务器 |
| `npm run build` | Next.js 生产构建 |
| `npm run build:electron` | Electron 生产构建 |
| `npm run electron:dev` | Electron 开发模式 |
| `npm run electron:prod` | Electron 生产模式 |
| `npm run rebuild` | 重新编译 better-sqlite3 |
| `npm run electron-build` | 完整 Electron 构建 + 打包 |
| `npm run electron-build-win` | Windows 专用构建 |
| `npm run dist` | 构建并生成安装包 |

### 19.2 Electron 构建流程

```
1. rimraf electron/dist
2. tsc -p electron/tsconfig.json          # 编译 Electron 主进程
3. node scripts/api-routes-manager.js move # 禁用 AI API 路由
4. BUILD_TARGET=electron next build        # 构建 Next.js
5. node scripts/api-routes-manager.js restore # 恢复 AI API 路由
```

### 19.3 API 路由管理

`scripts/api-routes-manager.js` 在 Electron 构建时：

- **move**：将 `src/app/api/` 下的 AI 相关路由文件重命名为 `.electron-build-disabled`
- **restore**：构建完成后恢复原文件名

### 19.4 打包配置

| 配置项 | 值 |
|--------|-----|
| appId | com.ai-animation-studio.app |
| productName | AI Animation Studio |
| asar | true |
| asarUnpack | better-sqlite3, bindings, file-uri-to-path, out/ |
| 输出目录 | release/ |

**打包环境要求**：

1. **PATH 包含 `C:\Windows\System32`**：electron-builder 内部调用 `npm ls --json` 解析依赖树，该命令需要 `cmd.exe`。在某些 IDE 终端环境中 `System32` 不在 PATH 中，会导致 `npm ls` 输出为空，electron-builder 报错 `No JSON content found in output`。修复方法：`$env:PATH = "C:\Windows\System32;" + $env:PATH`。

2. **Electron 镜像环境变量**：由于 `.npmrc` 不再包含非标准 key（避免 npm 10+ 的 "Unknown project config" 警告污染 `npm ls` 输出），Electron 和 electron-builder 的二进制下载地址通过环境变量配置：
   - `$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"`
   - `$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"`

3. **`.npmrc` 规范**：只保留 `registry=https://registry.npmmirror.com/`，不包含 `electron_mirror`、`electron_builder_binaries_mirror` 等非标准 key。npm 10+ 会将非标准 key 标记为 "Unknown project config" 警告，这些警告会混入 `npm ls --json` 的 stderr 输出，导致 electron-builder JSON 解析失败。

#### files 白名单

```
out/**/*                              # Next.js 静态导出
electron/dist/**/*                    # Electron 主进程编译产物
!electron/dist/**/*.map               # 排除 source map
!electron/dist/**/__tests__/**        # 排除测试文件
electron/splash.html                  # 启动画面
package.json                          # 入口配置
node_modules/better-sqlite3/**/*      # SQLite 原生模块
node_modules/bindings/**/*            # 原生模块路径解析
node_modules/file-uri-to-path/**/*    # 原生模块路径解析
```

#### files 排除规则

```
!src/**/*                # 排除前端源码（已编译到 out/）
!docs/**/*               # 排除文档
!scripts/**/*            # 排除构建脚本
!__tests__/**/*          # 排除测试
!coverage/**/*           # 排除覆盖率报告
!test-results/**/*       # 排除测试结果
!playwright-report/**/*  # 排除 E2E 报告
!*.docx                  # 排除 Word 文档
```

> ⚠️ **重要**：`package.json` 中的 `build` 配置是 electron-builder 打包的关键。如果 `build` 字段丢失，electron-builder 会使用默认配置，导致打包产物不完整（如缺少 `better-sqlite3` 的 JS 入口文件、`out/` 目录被锁在 asar 中等），app 将无法启动。

#### Windows 打包

| 配置项 | 值 |
|--------|-----|
| 目标格式 | NSIS (x64) + Portable (x64) |
| 图标 | electron/icon.ico |
| 代码签名 | 关闭 |
| NSIS | 非一键安装，允许自定义安装目录，创建桌面快捷方式 |

#### macOS 打包

| 配置项 | 值 |
|--------|-----|
| 目标格式 | DMG (x64 + arm64) |
| 图标 | electron/icon.icns |
| 分类 | Graphics & Design |
| Hardened Runtime | 启用 |

### 19.5 CI/CD

项目包含 GitHub Actions 工作流：

- `.github/workflows/ci.yml`：持续集成
- `.github/workflows/release.yml`：发布流程

---

## 20. 配置管理

### 20.1 Electron 配置

`electron/src/config/config-manager.ts` 管理应用配置：

- 配置存储在 `electron-store` 中
- 支持的顶层配置键：app, api, ui, theme, ai_animation_studio_api_config
- 配置值类型限制：string, number, boolean, object
- 最大配置值大小：1 MB
- 防原型污染：阻止 `__proto__`, `constructor`, `prototype`
- 阻止 `data:` 和 `javascript:` 前缀的字符串值

### 20.2 API 配置

`src/infrastructure/ai-providers/api-config/` 管理 AI 提供商配置：

| 文件 | 说明 |
|------|------|
| detect.ts | 自动检测 API 配置 |
| init.ts | 初始化配置 |
| migrate.ts | 配置迁移 |
| storage.ts | 配置存储 |
| templates.ts | 配置模板 |
| types.ts | 类型定义 |
| server.ts | 服务端配置 |
| server-key.ts | 服务端密钥 |

### 20.3 API 配置结构

```typescript
interface ApiConfig {
  providers: Array<{
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    models?: Array<{
      id: string;
      name: string;
    }>;
  }>;
  mapping?: Record<string, string>;  // capability → "providerId/modelId"
}
```

---

## 21. 数据同步

### 21.1 同步架构

项目内置了数据同步机制，支持多设备数据同步：

- **向量时钟**：每个实体携带 `vector_clock` 字段，用于冲突检测
- **变更日志**：`sync_changelog` 表记录所有数据变更
- **冲突备份**：`sync_conflict_backup` 表保存冲突数据
- **同步状态**：每个实体有 `sync_status` 字段（pending/synced）

#### 21.1.1 同步服务器配置架构

从 v1.1 起，同步功能支持用户自配置同步服务器，为 v2 多用户协作做铺垫。核心架构遵循"主进程代理"原则——渲染进程不直接访问远端同步服务器，所有请求经主进程 API Server 代理转发。

**请求路径**：

```
渲染进程 → localhost:30100/api/sync/proxy → 主进程 → 远端同步服务器
```

这条路径复用了现有的 SSRF 防护（`ssrfGuard.validate()`）、safeStorage 加密（`KeyStorageManager`）和 CORS 验证（`X-Electron-App` Header），与 AI 请求的安全架构完全一致。

**同步配置类型**：

```typescript
// src/domain/types/sync.ts
interface SyncConfig {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number;
  conflictStrategy: ConflictStrategy;
  endpoint: string;           // 旧字段，向后兼容
  deviceId: string;
  deviceVectorClock?: VectorClock;
  server: SyncServerConfig | null;  // 新字段，优先于 endpoint
}

interface SyncServerConfig {
  url: string;
  connected: boolean;
  lastConnectedAt: number | null;
  serverVersion: string | null;
  // 注意：不含 username/token，敏感信息分离到 SyncCredentials
}

interface SyncCredentials {
  username: string;
  token: string;
}
```

**分离存储设计**：

| 存储位置 | 内容 | 加密 |
|----------|------|------|
| `config.json`（electron-store） | `enabled`、`autoSync`、`syncInterval`、`conflictStrategy`、`endpoint`、`server.url`、`server.connected` 等非敏感字段 | 无 |
| `KeyStorageManager`（safeStorage） | `sync_credentials`：`{ username, token }` | safeStorage 优先，AES-256-GCM 回退 |

读取时合并两个存储源，GET 返回时 token 脱敏为 `***`。

**配置迁移**：当 `server` 为 null 但 `endpoint` 有值时，GET 请求自动将 `endpoint` 迁移为 `server` 对象（`connected=false`），确保现有用户配置不断裂。

**SSRF 白名单联动**：服务器 URL 变更时，自动移除旧 URL 的白名单（`ssrfGuard.removeWhitelist()`）并添加新 URL 的白名单（`ssrfGuard.addWhitelist()`），URL 未变更时不重复操作。

**多用户协作演进路径**：

- v1：单设备同步，用户自配置服务器地址+认证
- v2：多用户认证，`SyncServerConfig` 中的 `username`+`token` 天然支持
- v3：协作功能，基于向量时钟的冲突解决扩展为多人协作

### 21.2 同步 API

#### 21.2.1 主进程 API 路由（Electron 模式）

| 路由 | 方法 | 说明 |
|------|------|------|
| sync/config | GET | 读取同步配置（合并普通配置+加密凭证，token 脱敏） |
| sync/config | POST | 保存同步配置（分离存储+SSRF 白名单联动） |
| sync/test | POST | 测试服务器连接（SSRF 验证→远端认证→返回 token） |
| sync/proxy | POST | 代理同步请求（push/pull，自动注入认证 token） |

`sync/proxy` 请求体：

```typescript
interface SyncProxyRequest {
  action: "push" | "pull";
  changes?: unknown[];    // push 时携带变更数据
  deviceId?: string;
  since?: number;         // pull 时的时间戳
  page?: number;          // 分页拉取
}
```

#### 21.2.2 Next.js API 路由（Web 模式，Electron 构建时禁用）

| 端点 | 说明 |
|------|------|
| /api/sync/pull | 拉取远程变更 |
| /api/sync/push | 推送本地变更 |
| /api/sync/status | 查询同步状态 |

#### 21.2.3 同步引擎代理

`engine.ts` 中的 `pushChanges`/`pullChanges` 统一走主进程代理：

```typescript
// 渲染进程通过 localhost:30100 代理（非直接 fetch 远端）
const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/sync/proxy`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Electron-App": "true" },
  body: JSON.stringify({ action: "push", deviceId, changes }),
});
```

代理增加的约 5ms 本地 HTTP 开销相对于远端网络延迟可忽略。同步请求低频（默认 30 秒间隔），性能影响极小。

### 21.3 同步相关表

| 表 | 说明 |
|----|------|
| sync_changelog | 变更日志（entity_type, entity_id, operation, vector_clock） |
| sync_meta | 同步元数据 |
| sync_conflict_backup | 冲突备份（local_data, remote_data, resolved_at） |

### 21.4 同步设置 UI

`SyncSettingsPanel.tsx` 提供同步配置界面，通过 `apiClient` 与主进程 API 交互（统一走 HTTP，不走 IPC）：

- **同步开关**：启用/禁用同步
- **服务器配置区**：URL、用户名、密码输入
- **测试连接按钮**：调用 `sync/test` 路由，显示连接状态（未连接/测试中/已连接/错误）
- **自动同步**：定时同步开关和间隔设置
- **冲突策略**：最后写入优先/本地优先/远程优先/手动解决
- **同步状态**：上次同步时间、待同步项数、冲突数

---

## 22. 视频任务管理

### 22.1 任务生命周期

```
pending → processing → completed
                    → failed
                    → cancelled
         → retrying → processing (重试)
```

### 22.2 轮询机制

视频生成是异步操作，需要轮询获取状态：

- 默认轮询间隔：5 秒
- 默认最大尝试次数：120 次
- 支持指数退避：`backoffMultiplier`
- 轮询失败计数：`poll_failure_count`
- 恢复尝试：`recovery_attempts`

### 22.3 视频恢复

`electron/src/video-recovery.ts` 提供视频任务恢复功能：

- 通过 `taskId` 查询任务状态
- 支持从失败状态恢复
- 记录恢复尝试次数

### 22.4 视频追踪

`electron/src/video-tracker.ts` 提供视频任务追踪：

- 构建追踪信息：`buildTrackingInfo(taskId, apiUrl, apiKeyPreview, model)`
- 获取提供商信息：`getProviderInfo(apiUrl)`

### 22.5 视频缓存

`src/infrastructure/storage/video-cache.ts` 管理本地视频缓存：

- 缓存目录：`{userData}/video-cache/`
- 通过 `vcache://` 协议访问
- ObjectURL 管理：`registerObjectUrl`, `revokeObjectUrl`, `getObjectUrl`
- 防止 ObjectURL 泄漏：先检查已有 URL 避免重复创建
- **磁盘空间保护**：`cacheVideoFile()` 在缓存视频前检查磁盘使用量，如果总缓存超过2GB上限，自动调用 `cleanVideoCacheBySizeLimit()` 清理最旧的缓存文件，确保磁盘不被视频缓存耗尽

### 22.5a 任务管理系统 v2 架构

Video 模块的 task-management 子域采用子域化架构，包含完整的领域层、基础设施层、Hooks层和展示层。

#### 子域目录结构

```
task-management/
├── domain/                          # 领域子域
│   ├── task-machine.ts              # 状态机核心 + TransitionError
│   ├── task-events.ts               # 8 种领域事件
│   ├── task-schema.ts               # 轮询结果 Schema + API 状态映射
│   ├── policies/
│   │   ├── timeout-policy.ts        # 2 小时超时策略
│   │   ├── expiration-policy.ts     # 7 天过期策略
│   │   └── policy-engine.ts         # 策略聚合引擎
│   └── index.ts                     # Barrel 导出
├── infrastructure/                  # 基础设施子域
│   ├── timestamp-bridge.ts          # 时间戳桥接 (ISO ↔ Unix)
│   └── polling-scheduler.ts         # 自适应轮询调度器
├── hooks/
│   ├── use-video-task-manager.ts    # 核心 Store + Hook (624行)
│   └── internals/                   # 内部实现拆分
│       ├── polling-engine.ts        # 轮询引擎
│       ├── sync-engine.ts           # 同步引擎
│       └── transition-guard.ts      # 状态转换守卫
├── services/
│   └── video-tracker.ts             # 云端追踪服务
├── presentation/
│   ├── VideoTaskManager.tsx          # 主组件 (362行)
│   ├── handlers/                     # 事件处理器拆分
│   ├── task-card/                    # 任务卡片拆分
│   ├── TaskFilterBar.tsx             # 筛选栏
│   ├── RecoverySection.tsx           # 手动找回
│   └── *Dialog.tsx (5个)            # 各类对话框
└── index.ts                          # 子域公共 API
```

#### 策略引擎

策略引擎统一管理超时和过期策略，评估结果返回 `PolicyAction`：

```typescript
type PolicyAction =
  | { type: "NONE" }
  | { type: "TRANSITION"; targetStatus: VideoTaskStatus; reason: string }
  | { type: "DELETE"; reason: string }

function evaluatePolicies(task: VideoTask): PolicyAction[] {
  return [checkTimeout(task), checkExpiration(task)].filter(a => a.type !== "NONE");
}
```

| 策略 | 条件 | 动作 |
|------|------|------|
| 超时策略 | 活跃任务超过 2 小时 | TRANSITION to failed |
| 过期策略 | completed 任务超过 7 天 | DELETE |

#### TimestampBridge

统一内存（ISO string）与存储（Unix timestamp 秒）的时间戳转换：

```typescript
TimestampBridge.toStorage(isoString: string | null): number | null   // ISO → Unix sec
TimestampBridge.fromStorage(unixSec: number | null): string | null   // Unix sec → ISO
```

#### PollingScheduler

自适应退避轮询调度器：

| 参数 | 值 |
|------|-----|
| 基础间隔 | 5 秒 |
| 最大间隔 | 60 秒 |
| 退避因子 | 1.5x |
| 失败计数 | 每次失败 +1 |

#### 状态守卫 (withTransitionGuard)

在 Store 层面，所有状态变更通过守卫函数验证。非法转换时跳过状态变更但保留其他字段更新，避免整个操作失败。

### 22.6 视频状态机转移条件

视频任务的状态机定义在 `src/modules/video/task-management/domain/task-machine.ts` 中，管理6种状态之间的合法转移。状态机的核心价值在于防止非法状态转换——例如从 `completed` 状态不能直接转为 `generating`，从 `cancelled` 状态不能转为任何其他状态。

**6种状态及其语义**：

| 状态 | 语义 | 是否终态 | 是否可轮询 |
|------|------|----------|-----------|
| pending | 任务已创建，等待远端确认 | 否 | 是 |
| generating | 远端已接受任务，视频生成中 | 否 | 是 |
| completed | 视频生成成功，videoUrl可用 | 是 | 否 |
| failed | 任务失败，可手动恢复 | 否 | 否 |
| cancelled | 任务被用户取消 | 是 | 否 |
| retrying | 失败任务正在重试 | 否 | 是 |

**合法转移矩阵**定义在 `VALID_TRANSITIONS` 常量中：

```
pending    → [generating, failed]
generating → [completed, failed]
completed  → []（终态，不可转移）
failed     → [retrying]
cancelled  → []（终态，不可转移）
retrying   → [generating, completed, failed]
```

**各转移的触发时机和副作用**：

`pending → generating`：轮询引擎首次查询到远端返回 `processing` 状态时触发。副作用：重置 `lastPolledAt` 为当前时间，重置 `pollFailureCount` 为0。设计决策：`generating` 不再映射为 `processing`，统一存储为 `generating`。将pending和generating分开而非统一为"processing"，是因为pending表示"远端尚未确认任务存在"（可能是网络延迟导致请求尚未到达），generating表示"远端已确认任务正在处理"。这种区分对用户有价值：pending状态下显示"等待确认"提示，generating状态下显示"生成中"进度条。

`pending → failed`：轮询引擎查询到远端返回 `failed` 或 `not_found` 状态时触发。副作用：设置 `message` 为错误信息。这个转移路径处理了"任务刚创建就被远端拒绝"的场景——例如API Key无效、模型名称错误、请求参数不合法等。

`generating → completed`：轮询引擎查询到远端返回 `succeeded` 状态且包含 `videoUrl` 时触发。副作用：设置 `progress` 为100，保存 `videoUrl`，清空 `message`。这是整个视频生成流程的最终成功路径。

`generating → failed`：轮询引擎查询到远端返回 `failed` 状态，或连续30次轮询失败（`MAX_POLL_FAILURES`），或任务超过120分钟（`MAX_POLL_DURATION`）仍未完成时触发。副作用：设置 `message` 为具体的失败原因。超时失败的消息为"视频生成超时，请在视频任务管理器中点击「手动恢复」重试"，连续轮询失败的消息为"连续30次查询失败，请点击「手动恢复」重试"。

`failed → retrying`：用户在UI中点击"手动恢复"按钮时触发。副作用：递增 `recoveryAttempts` 计数器，重置 `pollFailureCount` 为0。设计决策：failed不是终态，允许用户手动恢复，因为视频生成失败的原因可能是临时性的（网络抖动、远端服务短暂不可用），重试可能成功。

`retrying → generating`：恢复流程中远端确认任务仍在处理时触发。副作用与 `pending → generating` 相同。

`retrying → completed`：恢复流程中远端返回任务已完成时触发。这处理了"任务实际已完成但本地轮询因网络问题未及时获取结果"的场景。

`retrying → failed`：恢复流程中远端确认任务已失败，或恢复尝试超过60次（`MAX_RECOVERY_ATTEMPTS`）时触发。

**`withTransitionGuard` 的防护作用**：所有状态转移都通过 `withTransitionGuard(task, targetStatus, context)` 函数包裹。该函数内部调用 `TaskMachine.canTransition(task.status, targetStatus)` 检查转移合法性，如果非法则保留原状态不变，仅更新context中的非状态字段（如message、pollFailureCount）。这防止了竞态条件下的非法转移——例如轮询引擎和手动恢复同时操作同一任务时，可能产生 `completed → generating` 这样的非法转移。

### 22.7 轮询算法详解

视频状态轮询由 `src/modules/video/task-management/hooks/internals/polling-engine.ts` 实现，采用 `setTimeout` 递归调度而非 `setInterval`，确保上一次轮询完成后才开始下一次，避免请求堆积。

**轮询配置常量**：

| 常量 | 值 | 含义 |
|------|-----|------|
| MAX_POLL_COUNT | 1000 | 单次轮询生命周期内最大轮询次数 |
| MAX_POLL_DURATION | 120 * 60 * 1000 (120分钟) | 任务从创建到超时的最大时长 |
| MAX_POLL_FAILURES | 30 | 连续轮询失败达到此数后标记任务为failed |
| CONCURRENT_LIMIT | 3 | 单次轮询中并发查询的最大任务数 |

**setTimeout递归调度机制**：`schedulePolling()` 函数是轮询的入口。它首先检查 `pollingState.isPollingScheduled` 标志，如果已有轮询计划则直接返回（防止重复调度）。然后通过 `setTimeout(pollTasks, pollingState.pollInterval)` 安排下一次轮询。`pollTasks` 回调执行完毕后，在末尾重新调用 `schedulePolling()`，形成递归调度链。这种设计的优势是：如果某次轮询耗时较长（如网络延迟），下一次轮询不会在上一次完成前就开始，避免了请求堆积。而 `setInterval` 无论上一次是否完成都会触发回调，在高延迟环境下容易产生请求队列积压。

**单次轮询执行流程**分为六个阶段。第一阶段，检查是否有活跃任务（pending/generating/retrying状态），如果没有则停止轮询并重置轮询间隔和计数器。第二阶段，递增 `pollCount`，检查是否超过 `MAX_POLL_COUNT`，超过则停止轮询。第三阶段，检查超时任务——遍历所有活跃任务，如果 `Date.now() - task.createdAt > MAX_POLL_DURATION`，将该任务标记为failed并持久化到数据库。第四阶段，并发查询活跃任务状态——按 `CONCURRENT_LIMIT=3` 分批，使用 `Promise.allSettled` 并发查询每批任务，确保单个任务查询失败不影响同批其他任务。第五阶段，更新Zustand Store中的任务状态——将所有状态变更批量应用到 `allTasks` 数组。第六阶段，触发视频缓存——对状态变为completed的任务，异步调用 `cacheVideoBlob(taskId, videoUrl)` 下载视频到本地缓存。

**自适应轮询间隔**根据轮询结果动态调整。如果本次轮询全部成功且无错误，间隔设为15000ms（15秒），这是"一切正常"的基准间隔。如果全部失败，间隔乘以1.5（退避），上限60000ms（1分钟）。如果部分成功部分失败，间隔乘以1.2（轻度退避），上限同样60000ms。这种自适应策略在远端服务正常时保持较高查询频率（15秒），在服务异常时逐步降低查询频率以减轻远端负担，避免"雪崩"效应。轮询间隔的初始值为5000ms（5秒），在所有任务完成或轮询停止时重置为初始值。

**视频缓存流程**：当任务状态变为completed时，轮询引擎立即调用 `cacheVideoBlob(taskId, videoUrl)`。该函数将远端视频下载为Blob，存储到IndexedDB中，并注册 `vcache://` 协议映射。缓存是异步的，不阻塞轮询流程。如果缓存失败，任务被标记 `cacheFailed: true`，UI可以显示"缓存失败，使用在线播放"的提示，播放器回退到使用远端URL。

**轮询生命周期管理**通过 `pollingState` 对象管理，包含以下状态：`pollingTimeoutId`（当前setTimeout的ID，用于取消）、`isPollingScheduled`（是否已有轮询计划）、`pollInterval`（当前轮询间隔）、`pollCount`（当前轮询计数）、`isInitializing`（是否正在初始化）、`beforeUnloadHandler`（页面关闭前的清理处理器）。`stopPolling()` 函数清除timeout并重置所有状态。`checkAndStartOrStopPolling()` 函数检查当前是否有活跃任务，有则启动轮询，无则停止。页面关闭前（`beforeunload` 事件），轮询引擎将所有未完成任务的状态通过 `navigator.sendBeacon` 发送到 `/api/video-tasks` 端点，确保下次启动时能恢复任务状态。

---

## 23. 提示词引擎

### 23.1 Electron 侧提示词

`electron/src/prompt-engine.ts` 和 `electron/src/prompt-service.ts` 提供提示词生成服务：

| 函数 | 说明 |
|------|------|
| generateCharacterImagePrompt | 生成角色图片提示词 |
| generateSceneImagePrompt | 生成场景图片提示词 |
| generateCharacterAnalysisPrompt | 生成角色分析提示词 |
| generateSceneAnalysisPrompt | 生成场景分析提示词 |
| generateFirstFramePrompt | 生成首帧提示词 |
| generateLastFramePrompt | 生成尾帧提示词 |
| generateCharacterDetailedPromptInstruction | 生成角色详细提示词指令 |
| generateScenePromptOptimization | 生成场景提示词优化 |

### 23.2 前端侧提示词模块

`src/modules/prompt/` 包含完整的提示词构建系统：

| 子模块 | 说明 |
|--------|------|
| base/ | 基础提示词模板 |
| beat-image/ | 节拍图片提示词 |
| builder/ | 提示词构建器（prompt-builder, quick-mode, story-plan） |
| character/ | 角色提示词服务 |
| scene/ | 场景提示词服务 |
| server-prompts/ | 服务端提示词服务 |
| video/ | 视频提示词服务 |

### 23.3 领域层提示词工具

| 工具 | 说明 |
|------|------|
| BeatPromptBuilder | 节拍提示词构建器 |
| PromptVocabulary | 提示词词汇表（风格、情绪、镜头等） |
| ShotPrompt | 镜头提示词生成 |

### 23.4 提示词构建流水线

提示词构建是一个8步流水线过程，从用户输入的原始描述到最终发送给AI模型的优化提示词，每一步都添加特定维度的信息。流水线的核心设计原则是"渐进增强"：每一步都在前一步的基础上追加信息，不覆盖已有内容，确保用户原始描述始终是提示词的核心。

**第一步：用户输入收集**。用户在节拍编辑器中填写的内容构成提示词的原始素材，包括：`beat.content`（节拍描述文本，如"一个穿红色连衣裙的女孩在夕阳下的海滩上跳舞"）、`beat.shotType`（景别，如"medium"）、`beat.camera`（摄像机参数，如 `{angle: "low", movement: "tracking"}`）、`beat.sceneElements`（场景元素列表）、`beat.featureAnchoring`（特征锚定配置）、`beat.shotInstruction`（镜头指令模板）。

**第二步：BeatPromptBuilder上下文收集**。`generateBeatImagePrompt()` 函数接收 `BeatImagePromptParams` 参数，从参数中提取beat、characters、scenes、featureAnchoring、shotInstruction等上下文。关键的数据关联是通过 `beat.sceneId`（或 `beat.scene`）查找对应的Scene对象，通过 `beat.sceneElements` 中的 `characterId` 查找对应的Character对象。这些关联查询确保提示词中包含完整的角色外观描述和场景氛围信息，而非仅仅是ID引用。

**第三步：特征锚定片段**。如果 `featureAnchoring.enabled` 为true，流水线在提示词开头插入特征锚定约束。对每个 `characterAnchors`，生成"角色参考图：严格继承参考图中角色的外观、脸型、发型、服装、配色等全部视觉特征，仅调整构图和镜头角度"的约束文本，并附加 `featureTags`（如"红色连衣裙、长发"）作为核心特征强调。对每个 `propAnchors`，生成类似的道具参考约束。特征锚定的设计目的是保证同一角色在不同节拍中的视觉一致性——AI模型在生成图片时会参考锚定图片的特征，避免角色外观在分镜间跳变。

**第四步：镜头指令片段**。如果 `shotInstruction` 存在，调用 `shotInstructionToPrompt(instruction)` 将结构化的镜头指令转换为自然语言描述。该函数从 `SHOT_SIZE_OPTIONS` 中查找景别关键词（如 `medium` → `"medium shot"`），从 `CAMERA_MOVEMENT_OPTIONS` 中查找运镜关键词（如 `tracking` → `"tracking shot, following shot"`），从 `CAMERA_ANGLE_OPTIONS` 中查找角度关键词（如 `low` → `"low angle shot, looking up"`），用逗号连接输出。这种"结构化数据 → 自然语言"的转换确保了镜头指令的精确性和一致性——用户在UI中选择"仰视+跟拍"，提示词中始终输出 `"low angle shot, looking up, tracking shot, following shot"`，而非依赖用户手动输入可能不一致的描述。

**第五步：场景片段**。如果 `isEnhanced` 为true且beat关联了场景，流水线追加场景名称、描述、氛围描述和视觉描述。`buildSceneAtmosphereDesc(scene)` 根据场景的 `atmosphere`、`mood`、`lighting` 字段，从 `MOOD_KEYWORDS` 和 `LIGHTING_KEYWORDS` 中查找对应的英文关键词。`buildSceneVisualDesc(scene)` 根据场景的 `type`、`timeOfDay`、`weather` 字段生成视觉描述。场景片段的设计目的是为AI模型提供环境上下文，使生成的图片在氛围和光照上与故事设定一致。

**第六步：角色片段**。如果 `isEnhanced` 为true且beat包含 `sceneElements`，流水线遍历元素列表，对类型为 `existing_character` 的元素，查找对应Character对象，生成角色名称和外观描述。`buildCharacterAppearanceDesc(char)` 从角色的 `appearance` 字段中提取 `hairColor`、`eyeColor`、`bodyType`、`clothing` 等属性，组合为英文描述。元素按 `order` 字段排序后用分号连接，确保画面中角色的前后位置关系在提示词中体现。

**第七步：质量标签**。流水线在提示词末尾追加质量标签。图片生成使用 `QUALITY_TAGS_IMAGE`（"masterpiece, best quality, highly detailed, sharp focus, professional"），视频生成使用 `QUALITY_TAGS_VIDEO`（"high quality, smooth motion, cinematic, professional"）。质量标签的设计决策是基于AI图像/视频生成模型的训练数据特性——这些模型在包含质量标签的训练样本上表现更好，添加标签可以引导模型生成更高质量的输出。

**第八步：视频提示词二次增强**。当提示词用于视频生成（而非图片生成）时，`generateSingleBeatPrompt()` 函数在上述7步的基础上进行二次增强：添加全局元素定义（`buildGlobalElementDefinitions`）、镜头编号标注（"【镜头 N】"）、景别中文标签（如"中景"）、运镜关键词（从 `CAMERA_MOVEMENT_KEYWORDS` 映射，如 `pan` → "平移"）、首尾帧画面约束（如果beat包含framePair）。视频提示词比图片提示词更详细，因为视频生成模型需要更精确的运动描述和连贯性约束。

### 23.5 三级提示词体系示例

以"一个穿红色连衣裙的女孩在夕阳下的海滩上跳舞"为例，展示用户原始描述→结构化提示词→AI优化提示词的三级演变。

**第一级：用户原始描述**。用户在节拍编辑器中输入的内容：

```
一个穿红色连衣裙的女孩在夕阳下的海滩上跳舞
```

这是用户对画面的自然语言描述，包含角色（女孩）、服装（红色连衣裙）、场景（夕阳下的海滩）、动作（跳舞）四个要素。但缺少AI模型需要的视觉细节：镜头角度、光照方向、画面构图、风格标签等。

**第二级：结构化提示词**。经过 `generateBeatImagePrompt()` 8步流水线处理后生成的提示词：

```
镜头构图：medium shot, tracking shot, low angle shot, looking up
场景：海滩日落，金色阳光洒在细沙上，海浪轻拍岸边
peaceful, serene, calm, warm lighting, golden hour
角色：女孩，红色连衣裙，长发飘逸
画面内容：女孩在沙滩上旋转跳舞，裙摆随风飘扬
masterpiece, best quality, highly detailed, sharp focus, professional
```

结构化提示词将用户的自然语言描述拆解为AI模型可理解的维度：镜头构图（景别+运镜+角度）、场景描述（环境+氛围+光照）、角色描述（外观+服装）、画面内容（动作+细节）、质量标签。每个维度使用英文关键词，因为主流AI图像/视频生成模型主要在英文数据上训练，英文关键词的语义对齐更精确。

**第三级：AI优化提示词**。用户可以通过提示词编辑器调用AI对结构化提示词进行优化，`prompt-editor-service.ts` 中的 `buildSystemPrompt()` 定义了AI优化的规则：

```
你是一位专业的AI动画提示词工程师。你的任务是根据用户提供的分镜信息，生成高质量的图像生成提示词。
要求：
1. 提示词必须用中文编写，使用逗号分隔的关键词描述格式
2. 包含画面构图、角色外观、场景氛围、光照、风格等视觉要素
3. 控制在80-150个中文字符之间
4. 只返回提示词文本，不要其他说明
5. 使用简洁精准的视觉描述语言，适合图像生成模型理解
```

AI优化后的提示词示例：

```
夕阳海滩全景，金色暖光逆光照射，红色连衣裙女孩侧身旋转，长发与裙摆随风飘扬，赤足踩在湿润沙滩上，海浪泡沫映照橙红天色，中景跟拍仰视构图，电影感画面，高质感，细腻光影
```

三级体系的设计决策：第一级保留用户的创作意图，是提示词的"灵魂"；第二级确保技术完整性，是提示词的"骨架"；第三级优化表达精度，是提示词的"润色"。用户可以在任意级别编辑提示词——如果用户对AI优化结果不满意，可以回退到第二级结构化提示词手动修改；如果用户完全不想使用流水线，可以直接在第一级输入自定义提示词。

### 23.6 提示词词汇表

提示词词汇表定义在 `src/domain/utils/prompt-vocabulary.ts` 和 `src/domain/utils/shot-prompt.ts` 中，将中文概念映射为AI模型可理解的英文关键词。词汇表的设计原则是"双向映射"：UI层使用中文标签展示给用户，提示词层使用英文关键词发送给AI模型。

**镜头类型词汇**（`SHOT_SIZE_OPTIONS`）：

| 中文标签 | 值 | 英文关键词 | 说明 |
|----------|-----|-----------|------|
| 特写 | extreme_close | extreme close-up shot | 极度放大的局部画面，强调细节 |
| 近景 | close | close-up shot | 人物胸部以上，突出表情 |
| 中景 | medium | medium shot | 人物腰部以上，展示动作 |
| 全景 | wide | wide shot | 人物全身及周围环境 |
| 远景 | extreme_wide | extreme wide shot, establishing shot | 大范围场景，强调环境 |

**摄像机角度词汇**（`CAMERA_ANGLE_OPTIONS`）：

| 中文标签 | 值 | 英文关键词 | 说明 |
|----------|-----|-----------|------|
| 平拍 | eye_level | eye level shot | 与主体视线平齐 |
| 仰视 | low | low angle shot, looking up | 从低处向上拍摄，主体显高大 |
| 俯视 | high | high angle shot, looking down | 从高处向下拍摄，主体显渺小 |
| 鸟瞰 | birds_eye | bird's eye view, overhead shot | 正上方垂直向下拍摄 |
| 虫视 | worms_eye | worm's eye view, ground level looking up | 从地面仰视拍摄 |
| 倾斜 | dutch | dutch angle, tilted frame, canted angle | 镜头倾斜，制造不安感 |

**摄像机运动词汇**（`CAMERA_MOVEMENT_OPTIONS`）：

| 中文标签 | 值 | 英文关键词 | 说明 |
|----------|-----|-----------|------|
| 固定 | static | static camera, fixed shot | 镜头不动，画面稳定 |
| 推 | push | push in, zoom in, dolly in | 镜头向主体推进 |
| 拉 | pull | pull out, zoom out, dolly out | 镜头远离主体 |
| 摇 | pan | pan shot, camera pan | 镜头左右或上下旋转 |
| 环绕 | orbit | orbit shot, 360 degree rotation around subject | 镜头围绕主体旋转 |
| 升 | crane_up | crane up, rising shot, ascending | 镜头向上移动 |
| 降 | crane_down | crane down, descending shot | 镜头向下移动 |
| 跟拍 | tracking | tracking shot, following shot | 镜头跟随主体移动 |

**氛围词映射**（`MOOD_KEYWORDS`）：

| 中文 | 英文关键词 |
|------|-----------|
| 平静 | peaceful, serene, calm, tranquil |
| 紧张 | tense, suspenseful, dramatic, anxious |
| 欢快 | cheerful, joyful, bright, lively |
| 悲伤 | melancholic, sorrowful, gloomy, somber |
| 神秘 | mysterious, enigmatic, shadowy, cryptic |
| 浪漫 | romantic, dreamy, soft, intimate |
| 恐怖 | horror, creepy, dark, eerie |
| 史诗 | epic, grand, majestic, monumental |

**光照词映射**（`LIGHTING_KEYWORDS`）：

| 中文 | 英文关键词 |
|------|-----------|
| 自然光 | natural lighting |
| 暖光 | warm lighting, golden hour |
| 冷光 | cool lighting, blue tones |
| 逆光 | backlighting, silhouette |
| 侧光 | side lighting, dramatic shadows |
| 顶光 | top lighting, overhead |
| 霓虹 | neon lighting, colorful glow |
| 烛光 | candlelight, warm flickering |
| 月光 | moonlight, soft silver glow |

**设计决策**：词汇表采用"多关键词冗余"策略，每个中文概念映射到2-4个英文关键词（如"平静"映射为"peaceful, serene, calm, tranquil"），而非单一关键词。原因是不同AI模型对不同关键词的敏感度不同——某个模型可能对"serene"响应更好，另一个模型可能对"tranquil"更敏感。多关键词冗余提高了提示词在不同模型间的兼容性。代价是提示词长度增加，但图像/视频生成模型对提示词长度的容忍度较高（通常支持数百个token），冗余关键词不会造成信息过载。

---

## 24. 参考引擎与一致性检查

### 24.1 参考引擎

`electron/src/reference-engine.ts` 管理镜头间的参考关系：

- `validateReference(shot, allShots, reference)`：验证参考有效性
- `getReferenceVideoUrl(shot, allShots, reference)`：获取参考视频 URL
- `buildReferenceDescription(shot, allShots, reference)`：构建参考描述

### 24.2 引用检查

`electron/src/reference-check.ts` 检查角色和场景的引用关系：

- `checkCharacterReferences(characterId, stories)`：检查角色引用
- `checkSceneReferences(sceneId, stories)`：检查场景引用

### 24.3 一致性检查

`electron/src/consistency-check.ts` 提供配置一致性检查：

- `performConfigCheck(params)`：执行配置检查
- `validateFeatureAnchoringConfig(config)`：验证特征锚定配置
- `validateNoFrameBinding(params)`：验证无帧绑定

### 24.4 视觉一致性检查

`electron/src/visual-consistency-check.ts` 通过 AI 分析视觉一致性：

- `checkVisualConsistency(apiGateway, params)`：检查视觉一致性
- `checkBeatElementConsistency(apiGateway, params)`：检查节拍元素一致性

### 24.5 前端一致性检查模块

`src/modules/shot/consistency-check/` 包含前端一致性检查服务：

- `config-check-service.ts`：配置检查服务
- `consistency-check-service.ts`：一致性检查服务

### 24.6 特征提取

`src/modules/shot/feature-extraction/` 提供特征提取和锚定：

- `feature-extraction-service.ts`：特征提取服务
- `feature-anchoring-service.ts`：特征锚定服务

---

## 25. 用户插件规范

### 25.1 插件配置文件

用户插件通过 `.plugin.json` 文件定义，存储在 `~/AI Animation Studio/Plugins/` 目录。

### 25.2 UserPluginConfig 完整结构

```typescript
interface UserPluginConfig {
  id: string;                    // 唯一标识（小写字母+数字+连字符）
  version: string;               // 版本号
  displayName: string;           // 显示名称
  description?: string;          // 描述
  author?: string;               // 作者
  homepage?: string;             // 主页

  match: {
    mode?: "contains" | "prefix" | "regex";  // 匹配模式
    apiUrlPatterns: string[];     // API URL 匹配模式
    modelPatterns?: string[];     // 模型名称匹配模式
    priority?: number;            // 匹配优先级（数值越大优先级越高）
  };

  capabilities: {
    video?: {
      supportsLastFrame: boolean;
      supportsReferenceVideo: boolean;
      supportsMimicryLevel: boolean;
      supportsCharacterRef?: boolean;   // 是否支持角色参考图（v1.2 新增）
      supportsSceneRef?: boolean;       // 是否支持场景参考图（v1.2 新增）
      defaultModel: string;
      maxDuration: number;
    };
    image?: {
      supportsReferenceImage: boolean;
      supportsCharacterRef?: boolean;   // 是否支持角色参考图（v1.2 新增）
      supportsSceneRef?: boolean;       // 是否支持场景参考图（v1.2 新增）
      defaultModel: string;
    };
  };

  models?: Record<string, {
    maxReferences?: number;
    maxResolution?: number;
    maxSizeMB?: number;
    supportsLastFrame?: boolean;
    referenceMode?: "separate" | "merged";
    defaultImageSize?: string;
    supportedImageSizes?: Array<{
      width: number;
      height: number;
      label: string;
      aspectRatio: string;
    }>;
  }>;

  transport: {
    imageMode: "base64" | "url" | "upload";
    videoMode: "base64" | "url";
    preferLocalData?: boolean;
  };

  auth: {
    type: "bearer" | "api-key-header" | "api-key-query" | "custom";
    headerName?: string;
    queryParamName?: string;
    customHeaders?: Record<string, string>;
  };

  headers?: Record<string, string>;  // 全局自定义请求头

  endpoints?: {
    video?: {
      generate: string;
      status: string;           // 支持 {baseUrl}, {taskId}, {model} 占位符
      method?: "POST";
      auth?: EndpointAuth;      // 端点级认证
      headers?: Record<string, string>;  // 端点级请求头
    };
    image?: {
      generate: string;
      method?: "POST";
      auth?: EndpointAuth;
      headers?: Record<string, string>;
    };
    text?: {
      generate: string;
      method?: "POST";
      auth?: EndpointAuth;
      headers?: Record<string, string>;
    };
    vision?: {
      generate: string;
      method?: "POST";
      auth?: EndpointAuth;
      headers?: Record<string, string>;
    };
    upload?: {
      endpoint: string;
      method?: "POST";
      responseImagePath?: string;
    };
  };

  request: {
    video?: {
      bodyFormat: "openai-content" | "flat" | "dashscope" | "custom";
      promptField?: string;
      modelField?: string;
      durationField?: string;
      firstFrameField?: string;
      lastFrameField?: string;
      characterRefField?: string;       // 角色参考图字段名（v1.2 新增，flat 模式）
      sceneRefField?: string;           // 场景参考图字段名（v1.2 新增，flat 模式）
      referenceVideoField?: string;
      mimicryLevelField?: string;
      extraFields?: Record<string, unknown>;
      customBodyTemplate?: Record<string, unknown>;
    };
    image?: {
      bodyFormat: "openai" | "flat" | "custom";
      promptField?: string;
      modelField?: string;
      sizeField?: string;
      referenceImageField?: string;
      characterRefField?: string;       // 角色参考图字段名（v1.2 新增，flat 模式）
      sceneRefField?: string;           // 场景参考图字段名（v1.2 新增，flat 模式）
      extraFields?: Record<string, unknown>;
      customBodyTemplate?: Record<string, unknown>;
    };
    text?: {
      bodyFormat: "openai" | "anthropic" | "custom";
      promptField?: string;
      modelField?: string;
      maxTokensField?: string;
      temperatureField?: string;
      extraFields?: Record<string, unknown>;
      customBodyTemplate?: Record<string, unknown>;
    };
    vision?: {
      bodyFormat: "openai" | "anthropic" | "custom";
      promptField?: string;
      modelField?: string;
      imageUrlField?: string;
      extraFields?: Record<string, unknown>;
      customBodyTemplate?: Record<string, unknown>;
    };
  };

  response: {
    video?: {
      taskIdPath?: string;        // 点分隔路径，如 "data.task_id"
      videoUrlPath?: string;
      statusPath?: string;
      statusMapping?: Record<string, string>;
      errorPath?: string;
      errorCodePath?: string;
    };
    image?: {
      imageUrlPath?: string;
      base64Path?: string;
      errorPath?: string;
      errorCodePath?: string;
    };
    text?: {
      contentPath?: string;
    };
  };

  polling?: {
    intervalSeconds?: number;     // 默认 5
    maxAttempts?: number;         // 默认 120
    backoffMultiplier?: number;   // 默认 1.0
  };

  cloudInfo?: {
    name: string;
    websiteUrl?: string;
    taskUrlPattern?: string;      // 支持 {taskId} 占位符
    apiDocUrl?: string;
    howToCheck?: string;
  };
}

interface EndpointAuth {
  type: "bearer" | "api-key-header" | "api-key-query" | "custom";
  headerName?: string;
  queryParamName?: string;
  customHeaders?: Record<string, string>;
}
```

### 25.3 匹配模式

| 模式 | 说明 | 示例 |
|------|------|------|
| contains | URL 包含模式字符串（默认） | `"api.openai.com"` |
| prefix | URL 以模式字符串开头 | `"https://api.my-provider.com/v2"` |
| regex | URL 匹配正则表达式 | `"api\\..+\\.com"` |

### 25.4 请求体格式

#### bodyFormat: "flat"

扁平键值对格式，字段名可自定义：

```json
{
  "prompt": "...",
  "model": "...",
  "duration": 5
}
```

#### bodyFormat: "openai-content"

OpenAI Content 数组格式：

```json
{
  "content": [
    { "type": "text", "text": "..." },
    { "type": "image_url", "image_url": { "url": "..." } }
  ],
  "model": "...",
  "duration": 5
}
```

#### bodyFormat: "dashscope"

阿里云 DashScope 格式：

```json
{
  "model": "...",
  "input": { "prompt": "...", "image_url": "..." },
  "parameters": { "size": "1280*720", "duration": 5 }
}
```

#### bodyFormat: "custom"

自定义模板，支持变量替换和条件渲染：

```json
{
  "customBodyTemplate": {
    "model": "{{model}}",
    "input": {
      "prompt": "{{prompt}}",
      "{{#firstFrameUrl}}image": "{{firstFrameUrl}}{{/firstFrameUrl}}"
    }
  }
}
```

### 25.5 条件模板渲染

`{{#var}}...{{/var}}` 语法：当变量存在且非空时渲染内容，否则跳过：

```
"{{#firstFrameUrl}}\"image\": \"{{firstFrameUrl}}\",{{/firstFrameUrl}}"
```

如果 `firstFrameUrl` 为空，整个块被移除。

### 25.6 端点级认证

每个端点可以独立配置认证方式，优先级高于全局 auth：

```json
{
  "auth": { "type": "bearer" },
  "endpoints": {
    "video": {
      "generate": "/v1/videos",
      "auth": { "type": "api-key-header", "headerName": "X-Video-Key" }
    }
  }
}
```

### 25.7 响应路径解析

使用点分隔路径从嵌套 JSON 中提取值：

```json
{
  "response": {
    "video": {
      "taskIdPath": "data.task_id",
      "videoUrlPath": "output.video.url",
      "statusPath": "status"
    }
  }
}
```

### 25.8 错误响应解析

```json
{
  "response": {
    "video": {
      "errorPath": "error.message",
      "errorCodePath": "error.code"
    },
    "image": {
      "errorPath": "errors.0.message",
      "errorCodePath": "errors.0.code"
    }
  }
}
```

### 25.9 JSON Schema

`docs/plugin-spec.schema.json` 提供了 JSON Schema Draft 2020-12 格式的校验文件，支持 IDE 自动补全和校验。

### 25.10 插件管理 API

| API 端点 | 方法 | 说明 |
|----------|------|------|
| plugins/list | GET | 列出所有插件（内置+用户） |
| plugins/capabilities | GET | 获取所有插件能力 |
| plugins/add | POST | 添加用户插件 |
| plugins/delete | POST | 删除用户插件 |
| plugins/reload | POST | 重载用户插件 |
| plugins/validate | POST | 校验插件配置 |
| plugins/schema | GET | 获取插件 Schema |

### 25.11 插件校验规则

- `id`：必填，小写字母+数字+连字符，不能以连字符开头或结尾
- `version`：必填，字符串
- `displayName`：必填，字符串
- `match`：必填，`apiUrlPatterns` 必须是非空数组
- `capabilities`：必填
- `transport`：必填
- `auth`：必填
- `endpoints`：必填
- `request`：必填
- `response`：必填
- 内置插件 ID 保留：volcengine, kuaishou, zhipu, pixverse, seedance, google, openai-sora, minimax, openai-compatible, anthropic

### 25.12 用户插件配置完整示例

以下是一个完整的 `.plugin.json` 配置文件示例，展示了一个自定义AI提供商的所有配置项：

```json
{
  "id": "my-custom-ai",
  "version": "1.0.0",
  "displayName": "My Custom AI Provider",
  "description": "自定义AI提供商插件，演示所有配置项",
  "author": "开发者名称",
  "homepage": "https://my-custom-ai.com",
  "match": {
    "mode": "contains",
    "apiUrlPatterns": ["api.my-custom-ai.com"],
    "modelPatterns": ["custom-v"]
  },
  "capabilities": {
    "video": {
      "supportsLastFrame": true,
      "supportsReferenceVideo": false,
      "supportsMimicryLevel": false,
      "defaultModel": "custom-v1",
      "maxDuration": 10
    },
    "image": {
      "supportsReferenceImage": true,
      "defaultModel": "custom-img-v1"
    }
  },
  "transport": {
    "imageMode": "url",
    "videoMode": "url",
    "preferLocalData": true
  },
  "auth": {
    "type": "bearer"
  },
  "headers": {
    "X-Custom-Header": "my-value"
  },
  "endpoints": {
    "video": {
      "generate": "/v1/videos/generate",
      "status": "/v1/videos/{taskId}",
      "method": "POST",
      "auth": {
        "type": "api-key-header",
        "headerName": "X-Video-Key"
      },
      "headers": {
        "X-Video-Request": "true"
      }
    },
    "image": {
      "generate": "/v1/images/generate"
    },
    "text": {
      "generate": "/v1/chat/completions"
    },
    "vision": {
      "generate": "/v1/chat/completions"
    },
    "upload": {
      "endpoint": "/v1/upload",
      "method": "POST",
      "responseImagePath": "data.url"
    }
  },
  "request": {
    "video": {
      "bodyFormat": "custom",
      "customBodyTemplate": {
        "model": "{{model}}",
        "input": {
          "prompt": "{{prompt}}",
          "{{#firstFrameUrl}}first_frame": "{{firstFrameUrl}}{{/firstFrameUrl}}"
        },
        "parameters": {
          "duration": "{{duration}}"
        }
      }
    },
    "image": {
      "bodyFormat": "openai"
    },
    "text": {
      "bodyFormat": "openai"
    },
    "vision": {
      "bodyFormat": "openai"
    }
  },
  "response": {
    "video": {
      "taskIdPath": "data.task_id",
      "videoUrlPath": "output.video.url",
      "statusPath": "status",
      "statusMapping": {
        "processing": "generating",
        "completed": "succeeded",
        "failed": "failed"
      },
      "errorPath": "error.message",
      "errorCodePath": "error.code"
    },
    "image": {
      "imageUrlPath": "data.0.url",
      "errorPath": "error.message"
    },
    "text": {
      "contentPath": "choices.0.message.content"
    }
  },
  "polling": {
    "intervalSeconds": 3,
    "maxAttempts": 200,
    "backoffMultiplier": 1.2
  },
  "cloudInfo": {
    "name": "My Custom AI",
    "websiteUrl": "https://my-custom-ai.com",
    "taskUrlPattern": "https://my-custom-ai.com/dashboard/tasks/{taskId}",
    "apiDocUrl": "https://docs.my-custom-ai.com",
    "howToCheck": "1. 登录控制台 2. 进入任务管理 3. 查看视频生成状态"
  }
}
```

逐字段解释：`id` 是插件的唯一标识，校验规则为小写字母+数字+连字符，不能与内置插件ID冲突。`version` 遵循语义化版本号。`match.mode` 指定URL匹配模式，"contains"表示URL包含模式字符串即匹配，"prefix"表示URL必须以模式字符串开头，"regex"表示模式字符串是正则表达式。`match.modelPatterns` 是可选的模型名称匹配，与apiUrlPatterns是AND关系——两者都匹配时插件才被选中。`headers` 是全局自定义请求头，会合并到每个API请求中。`endpoints.video.auth` 是端点级认证配置，优先级高于全局 `auth`——视频生成端点使用 `X-Video-Key` Header认证，而其他端点使用全局的Bearer认证。`request.video.customBodyTemplate` 使用Mustache风格的条件模板语法，`{{#firstFrameUrl}}...{{/firstFrameUrl}}` 表示当firstFrameUrl变量存在且非空时渲染内容，否则跳过整个块。`response.video.statusMapping` 将远端的状态字符串映射为内部状态，例如远端返回"succeeded"映射为内部的"completed"。`polling` 覆盖默认的轮询配置，3秒间隔+200次上限+1.2倍退避。`cloudInfo.taskUrlPattern` 中的 `{taskId}` 占位符在运行时替换为实际的任务ID，生成可直接访问的任务详情页URL。

### 25.13 插件匹配优先级与冲突解决

当多个插件同时匹配同一个API URL时，PluginRegistry采用"先注册先匹配"策略解决冲突。

**注册顺序**决定了匹配优先级。内置插件按以下顺序注册：VolcenginePlugin → KuaishouPlugin → ZhipuPlugin → PixversePlugin → SeedancePlugin → GooglePlugin → OpenAISoraPlugin → MiniMaxPlugin → AnthropicPlugin。用户插件在内置插件之后注册，因此内置插件始终优先于用户插件。Fallback插件（OpenAICompatiblePlugin）通过 `setFallback()` 单独注册，不在常规插件列表中，只有在所有常规插件都不匹配时才被返回。

**冲突场景示例**：假设用户配置了一个自定义插件，其 `match.apiUrlPatterns` 为 `["openai.com"]`，意图覆盖OpenAI的请求格式。但OpenAISoraPlugin的 `match()` 检查URL含 `openai` 且模型含 `sora`，如果模型名包含 `sora`，OpenAISoraPlugin先匹配；如果模型名不含 `sora`，OpenAISoraPlugin不匹配，继续匹配到Fallback的OpenAICompatiblePlugin（其 `match()` 始终返回true），用户插件仍然不会被选中——因为Fallback在常规插件列表之外，但 `select()` 的遍历顺序是先遍历常规插件列表，而OpenAICompatiblePlugin虽然在注册列表中但位置在AnthropicPlugin之后。

**用户覆盖内置插件的三种策略**：第一种，使用更精确的URL匹配——将 `match.mode` 设为 `"prefix"` 并指定完整的API URL前缀（如 `"https://api.openai.com/v1/videos/"`），这样只有视频端点的请求才会匹配用户插件，其他端点仍走内置插件。第二种，使用正则表达式匹配——将 `match.mode` 设为 `"regex"` 并编写精确的正则（如 `"api\\.openai\\.com/v1/videos"`），实现细粒度的URL匹配控制。第三种，修改内置插件的注册顺序——这需要修改 `registerAllPlugins()` 函数的源码，将用户插件的注册代码插入到内置插件之前，但这不是推荐做法，因为修改源码会增加升级维护成本。

**设计决策：为什么选"先注册先匹配"而非"最佳匹配"？** 理由有三。第一，最佳匹配需要定义匹配精度度量标准，例如URL前缀匹配长度越长精度越高、正则匹配范围越窄精度越高，但不同匹配模式之间的精度比较缺乏统一标准——一个contains匹配和一个regex匹配哪个更精确？这需要引入权重系统，增加实现复杂度且容易产生歧义。第二，注册顺序是开发者可控的，将更具体的插件注册在前面即可保证优先级，这比自动推断匹配精度更可靠。第三，Fallback机制确保了即使所有特定插件都不匹配，请求也能被OpenAI兼容格式处理，不会出现"无插件可用"的空指针错误，降低了匹配失败的风险。

---

## 附录 A：共享工具

### A.1 全局状态（App Store）

`src/shared/app-store.ts` 使用 Zustand 管理全局应用状态：

```typescript
interface AppState {
  activeCharacterId: string | null;
  activeSceneId: string | null;
  activeStoryId: string | null;
  sidebarCollapsed: boolean;
  setActiveCharacterId: (id: string | null) => void;
  setActiveSceneId: (id: string | null) => void;
  setActiveStoryId: (id: string | null) => void;
  toggleSidebar: () => void;
}
```

### A.2 EventBus

`src/shared/event-bus.ts` 提供发布/订阅模式：

```typescript
eventBus.on(event, handler);
eventBus.once(event, handler);
eventBus.emit(event, data);
eventBus.removeAllListeners(event);
eventBus.setMaxListeners(n);
```

**监听器泄漏检测**：EventBus 默认设置 `maxListeners = 50`。每次通过 `on()` 注册监听器后，检查当前事件的监听器数量是否超过 `maxListeners`，如果超过则输出 `MaxListenersExceededWarning` 警告，提示可能存在内存泄漏。`setMaxListeners(n)` 方法允许调整阈值。这种机制与 Node.js 的 `EventEmitter.defaultMaxListeners` 设计理念一致，在开发阶段帮助发现未正确清理的监听器注册。

### A.3 领域事件

`src/shared/event-types.ts` 定义了所有领域事件：

| 事件 | 标识 | 载荷 |
|------|------|------|
| 角色创建 | character:created | { id, characterName } |
| 角色更新 | character:updated | { id, characterName } |
| 角色删除 | character:deleted | { id, characterName } |
| 场景创建 | scene:created | { id, sceneName } |
| 场景更新 | scene:updated | { id, sceneName } |
| 场景删除 | scene:deleted | { id, sceneName } |
| 故事创建 | story:created | { id, storyTitle } |
| 故事更新 | story:updated | { id, storyTitle } |
| 故事删除 | story:deleted | { id, storyTitle } |
| 资产创建 | asset:created | { id, assetName? } |
| 资产删除 | asset:deleted | { id, assetName? } |
| 视频任务创建 | videoTask:created | { taskId } |
| 视频任务更新 | videoTask:updated | { taskId } |
| 视频任务完成 | videoTask:completed | { taskId, videoUrl? } |
| 视频任务失败 | videoTask:failed | { taskId, error? } |

### A.4 ErrorHandler

`src/shared/error-handler.ts` 提供统一错误处理：

```typescript
getErrorMessage(error): string;
```

### A.5 ErrorLogger

`src/shared/error-logger.ts` 提供前端错误日志记录，内置日志脱敏功能：

```typescript
setMinLogLevel(level: "debug" | "info" | "warn" | "error" | "fatal"): void;
extractErrorMessage(error: unknown): string;
```

支持日志级别优先级：debug(0) → info(1) → warn(2) → error(3) → fatal(4)，默认最低级别为 warn。通过 EventBus 发送 `error:logged` 事件。

**日志脱敏**：`sanitizeMessage()` 在日志输出前自动检测并替换 API Key 模式为 `[REDACTED]`，匹配模式包括：
- `api_key=xxx`、`apikey:xxx`、`access_token=xxx` 等键值对模式
- `sk-xxx`（OpenAI 格式）、`key-xxx` 等前缀模式

### A.6 Confirm Dialog

`src/shared/utils/confirm.tsx` 提供异步确认对话框，替代原生 `confirm()`：

```typescript
await confirm(message, title?);
await confirm({ message, title, confirmText, cancelText, variant });
```

### A.7 平台检测

`src/shared/utils/platform.ts`：

```typescript
isElectron(): boolean;
```

### A.8 图片 URL 解析

`src/shared/utils/image-url.ts`：

```typescript
resolveImageUrl(url: string): string;
```

### A.9 其他共享工具

| 文件 | 说明 |
|------|------|
| utils/file-download.ts | 文件下载工具 |
| utils/performance.ts | 性能测量工具 |
| utils/url-validation.ts | URL 校验工具 |
| utils/utils.ts | 通用工具函数 |

### A.10 共享 Hooks

| Hook | 文件 | 说明 |
|------|------|------|
| useDirtyState | hooks/use-dirty-state.ts | 脏状态追踪 |
| useMemoryMonitor | hooks/use-memory-monitor.ts | 内存监控 |
| useNetworkMonitor | hooks/use-network-monitor.ts | 网络监控 |
| useDebouncedState | hooks/useDebouncedState.ts | 防抖状态 |
| useKeyboardShortcuts | hooks/useKeyboardShortcuts.ts | 键盘快捷键 |

### A.11 共享展示组件

| 组件 | 文件 | 说明 |
|------|------|------|
| BeforeUnloadGuard | presentation/BeforeUnloadGuard.tsx | 离开页面确认守卫 |
| ConfigCheckBanner | presentation/ConfigCheckBanner.tsx | 配置检查横幅 |
| CrashRecoveryDialog | presentation/CrashRecoveryDialog.tsx | 崩溃恢复对话框 |
| DebugOverlay | presentation/DebugOverlay.tsx | 调试覆盖层 |
| ErrorBoundary | presentation/ErrorBoundary.tsx | 错误边界（含 ErrorLogViewer 子组件） |
| KeyboardShortcutsDialog | presentation/KeyboardShortcutsDialog.tsx | 快捷键对话框 |
| MemoryMonitorPanel | presentation/MemoryMonitorPanel.tsx | 内存监控面板 |
| ModelSelector | presentation/ModelSelector.tsx | 模型选择器 |
| NetworkStatusAlert | presentation/NetworkStatusAlert.tsx | 网络状态告警 |
| OnboardingGuide | presentation/OnboardingGuide.tsx | 引导指南 |
| PageErrorBoundary | presentation/PageErrorBoundary.tsx | 页面级错误边界 |
| PerformanceMonitorPanel | presentation/PerformanceMonitorPanel.tsx | 性能监控面板 |
| SearchDialog | presentation/SearchDialog.tsx | 搜索对话框 |
| Sidebar | presentation/Sidebar.tsx | 侧边栏 |
| Toast | presentation/Toast.tsx | 消息提示（支持 count 去重，相同 toast 显示 "(N次)"） |
| VirtualList | presentation/VirtualList.tsx | 虚拟滚动列表 |
| navigation | presentation/navigation.tsx | 导航组件 |
| onboarding | presentation/onboarding.tsx | 引导流程 |

### A.12 共享 UI 组件

`src/shared/ui/` 包含 25 个基础 UI 组件：

| 组件 | 说明 |
|------|------|
| alert | 警告提示 |
| app-card | 应用卡片 |
| badge | 徽章 |
| button | 按钮 |
| card | 卡片 |
| checkbox | 复选框 |
| command | 命令面板 |
| confirm-dialog | 确认对话框 |
| dialog | 对话框 |
| empty-state | 空状态 |
| feedback | 反馈 |
| input-group | 输入组 |
| input | 输入框 |
| label | 标签 |
| loading-state | 加载状态 |
| progress | 进度条 |
| safe-image | 安全图片 |
| select | 选择器 |
| separator | 分隔符 |
| slider | 滑块 |
| status-badge | 状态徽章 |
| switch | 开关 |
| tabs | 标签页 |
| textarea | 文本域 |

### A.13 共享类型

| 文件 | 说明 |
|------|------|
| types/api.ts | API 类型定义 |
| types/index.ts | 类型导出 |
| types/ipc.ts | IPC 类型定义 |

---

## 附录 B：脚本工具

| 脚本 | 说明 |
|------|------|
| scripts/api-routes-manager.js | Electron 构建时管理 API 路由 |
| scripts/electron-build-win.js | Windows 专用构建脚本 |
| scripts/clean-user-data.js | 清理用户数据 |
| scripts/clean-before-build.js | 构建前清理 |
| scripts/copy-static-resources.js | 复制静态资源 |
| scripts/test-config/cli.ts | 测试配置命令行工具 |
| scripts/video-test-tool/cli.ts | 视频测试命令行工具 |
| scripts/ai-context-boundary.ts | AI 上下文边界分析 |
| scripts/build-module-graph.ts | 模块依赖图构建 |
| scripts/guard-module-size.ts | 模块大小守卫 |
| scripts/validate-contracts.ts | 契约校验 |

---

## 附录 B2：编码规范与开发指南

### B2.1 错误处理规范

使用 Result 类型，不使用异常：

```typescript
// ✅ 正确
function doWork(): Result<Data> {
  try {
    return ok(data);
  } catch (e) {
    return err(new ApiError("WORK_FAILED", extractErrorMessage(e)));
  }
}

// ❌ 错误
function doWork(): Data {
  throw new Error("failed"); // 不要抛异常
}
```

### B2.2 errorLogger 使用

```typescript
// 合法签名: AppError | string | { code: string; message: string; cause?: unknown }
errorLogger.warn({ code: "CODE", message: "描述信息" }, "Context");
errorLogger.error("简单字符串消息", "Context");
```

**禁止**传入非法属性（taskId, field, operation 等）：

```typescript
// ❌ 错误 — taskId 不在类型定义中
errorLogger.warn({ code: "CODE", taskId: "123" }, "Context");

// ✅ 正确 — 嵌入 message
errorLogger.warn({ code: "CODE", message: "taskId=123 failed" }, "Context");
```

### B2.3 时间类型

全项目统一使用 Unix 秒（number 类型）：

```typescript
// ✅ 正确
createdAt: Math.floor(Date.now() / 1000)

// ❌ 错误
createdAt: new Date().toISOString()
createdAt: Date.now()
```

### B2.4 ID 生成

全项目统一使用 `crypto.randomUUID()` 生成唯一标识：

```typescript
// ✅ 正确
const id = crypto.randomUUID();

// ❌ 错误
const id = Date.now() + "_" + Math.random();
const id = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
```

### B2.5 非空断言

避免使用 `!` 非空断言，使用可选链 + 空值合并：

```typescript
// ❌ 危险
const url = result!.data!.imageUrl;

// ✅ 安全
const url = result?.data?.imageUrl ?? "";
```

### B2.6 空 catch 块

禁止空 catch 块，至少添加日志：

```typescript
// ❌ 危险
} catch {}

// ✅ 安全
} catch (e) {
  console.debug("[Module] Operation failed:", e);
}
```

### B2.6 状态管理

- 使用 Zustand Store
- 状态变更必须通过状态机验证
- 使用 `withTransitionGuard` 守卫函数

### B2.8 数据验证

- 所有领域类型使用 Zod Schema 定义
- Schema 即类型：`type X = z.infer<typeof xSchema>`
- API 返回值使用 `schema.safeParse()` 验证

### B2.8 依赖注入

模块层通过 DI 容器访问基础设施服务，禁止直接 import infrastructure 子域：

```typescript
// ✅ 正确 — 通过 DI 容器
import { container } from "@/infrastructure/di";
const storage = container.videoTaskStorage;
const elementManager = container.elementManager;
const referenceEngine = container.referenceEngine;

// ❌ 错误 — 直接引用 infrastructure 子域（ESLint 会警告）
import { safeQuery } from "@/infrastructure/storage/sqlite-core";
import { loadConfig } from "@/infrastructure/ai-providers/api-config";
```

ESLint DDD 守卫规则会自动检测 `modules/**` 中对 `@/infrastructure/*`（非 `@/infrastructure/di`）的直接引用。

### B2.10 URL 安全

所有 fetch 调用用户提供的 URL 前应验证：

```typescript
import { isAllowedImageUrl, isAllowedVideoUrl } from "@/shared/utils/url-validation";

if (!isAllowedVideoUrl(downloadUrl)) {
  // 处理不安全的 URL
}
```

### B2.10 innerHTML 禁止

禁止使用 `innerHTML`，改用 DOM API：

```typescript
// ❌ 危险 — XSS 风险
element.innerHTML = `<video src="${url}">`;

// ✅ 安全 — DOM API
const video = document.createElementNS("http://www.w3.org/1999/xhtml", "video");
video.src = url;
element.appendChild(video);
```

### B2.12 导入路径规范

不要从子域内部路径导入，应从模块入口导入：

```typescript
// ❌ 错误 — 深层导入
import { TaskMachine } from "@/modules/video/task-management/domain";

// ✅ 正确 — 从模块入口导入
import { TaskMachine } from "@/modules/video/task-management";
```

### B2.13 添加新模块步骤

1. 在 `src/modules/` 下创建模块目录
2. 创建子域目录和 `contract.json`
3. 创建 `MODULE.md` 模块契约文档（目的、子域、依赖、公共 API）
4. 在 `src/domain/schemas/` 添加 Zod Schema
5. 在 `src/domain/ports/` 添加端口接口
6. 在 `src/infrastructure/` 添加实现
7. 在 `src/infrastructure/di/container.ts` 注册依赖
8. 编写测试（优先纯逻辑测试）
9. 更新 `.trae/rules/project_rules.md` 中的模块列表

---

## 附录 C：关键设计决策

### C.1 本地优先

- 所有用户数据存储在本地 SQLite 数据库（better-sqlite3，WAL 模式）
- API Key 通过 Electron safeStorage 加密存储（不可用时回退到 AES-256-GCM，非明文存储），渲染进程通过 `secure-config:*` IPC 安全通道访问，API Key 明文永远不经过渲染进程
- 不依赖云服务存储用户数据
- 应用完全可离线使用（AI 生成功能需联网），所有核心 CRUD 功能在离线状态下正常工作
- 同步功能为可选扩展（当前为预留，未发布）
- 数据库自动备份（首次30秒，之后每24小时，saveDatabase后1小时增量备份）
- 软删除30天自动物理清理（Characters/Scenes），Stories 硬删除

### C.2 插件化 AI 提供商

- 所有 AI 提供商通过统一插件接口接入
- 内置 9 个插件 + 1 个 Fallback 插件覆盖主流提供商
- 用户可通过 JSON 配置自定义提供商
- 插件选择基于 URL 和模型名称自动匹配
- Fallback 插件确保兼容性

### C.3 双轨架构

- Electron 模式是唯一的生产交付目标，Web 模式仅用于开发调试
- Web 模式和 Electron 模式共享前端代码
- Electron 模式下 AI 请求走主进程 API Server（具备完整安全机制）
- Web 模式下 AI 请求走 Next.js API Routes（无 safeStorage/SSRF 防护）
- 构建时通过文件重命名切换模式

### C.4 安全设计

- Electron 启用上下文隔离和禁用 Node.js 集成
- IPC 通道白名单 + 权限分级
- 渲染进程禁止执行 DDL SQL（含注释剥离防绕过）
- SSRF 防护阻止私有网络访问（IPv4 + IPv6 双栈 DNS 解析检查）
- 路径遍历防护
- 速率限制（含 Map 大小上限和清理定时器 `unref()`）
- 日志脱敏：API Key 模式自动替换为 `[REDACTED]`
- API Key 非 Electron 环境拒绝存储（不再降级到 localStorage）

### C.5 数据完整性

- SQLite WAL 模式确保写入安全
- 软删除（is_deleted）用于 Characters/Scenes（定时清理）、story_versions/media_assets/video_tasks/storyboard_assets/collections/video_cache（同步逻辑删除），Stories 采用硬删除
- 向量时钟支持多设备同步冲突检测
- 变更日志记录所有数据变更
- 外键约束确保关联完整性
- SQL 标识符安全：`sanitizeIdentifier()` 校验 + 双引号包裹，防止 SQL 注入
- 声明式列注册：`schema-registry` 替代硬编码 `JSON_COLUMNS` 白名单，各仓库模块自行注册列类型
- 事务级联删除：`deleteCharacterWithRefs()` / `deleteSceneWithRefs()` 在一个 `safeTransaction` 内完成引用清理 + 实体删除
- 保存互斥锁：`usePersistenceGuard()` 防止并发保存导致数据覆盖
- React hook 与纯工具函数的桶导出隔离：`useStableDeps` 等 React hook 不放入 `integrity/index.ts` 桶导出，需从深层路径直接导入，避免 `"use client"` 污染纯工具函数导致 Next.js Server Component 构建失败
- SQLite 重试正则仅匹配 `busy|locked|timeout`，不再重试 `constraint|unique` 错误（约束违反是业务逻辑错误，不应重试）
- ESLint DDD 分层守卫规则自动检测依赖方向违规，AI 开发者写代码时即可收到反馈

---

## 附录 D：已知问题与技术债

> 本章节记录项目当前仍存在的问题。已修复的记录见 `docs/FIX_RECORDS.md`。

### D.1 待修复问题

| ID | 级别 | 模块 | 问题 |
|----|------|------|------|
| D-001 | Medium | electron/main | `fatal-error` IPC 事件在主进程发送但 preload 未注册监听，渲染进程无法接收崩溃通知 |
| D-002 | Low | modules/sync | 同步功能为预留状态（30%），后端未实现，UI 已添加开发中警告 |

### D.2 MVP 完成度评估

| 功能模块 | 完成度 | 关键阻塞 |
|----------|--------|----------|
| 角色 CRUD | 95% | — |
| 场景 CRUD | 95% | — |
| 故事规划 | 95% | — |
| 分镜编辑 | 95% | — |
| 关键帧生成 | 95% | — |
| 首尾帧生成 | 95% | — |
| 视频生成 | 95% | — |
| 视频缓存 | 95% | — |
| 视频恢复 | 85% | 功能完整 |
| 提示词引擎 | 95% | 功能完整 |
| 插件系统 | 95% | characterRef/sceneRef 已支持 |
| 数据导入导出 | 90% | 功能完整 |
| 自动保存 | 95% | — |
| 同步功能 | 30% | 预留状态，UI 已添加开发中警告 |
| 安全模块 | 95% | — |

**MVP 核心路径完成度**：故事创建 → 角色设计 → 场景设计 → 分镜生成 → 视频生成，约 **95%** 完成。所有已知 Bug 和逻辑隐患已修复，核心路径无阻塞。
