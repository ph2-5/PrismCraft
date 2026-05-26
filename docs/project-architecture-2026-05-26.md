# AI Animation Studio 项目架构文档

> 版本：2.0 | 日期：2026-05-26 | 代码基准：692文件 / 130,876行

---

## 第一部分：架构总览

### 1. 项目概述

AI Animation Studio（AI动画工作室）是一款面向AI驱动动画制作流程的桌面应用程序。项目采用本地优先（local-first）架构，核心数据存储在本地SQLite数据库中，支持离线使用，仅在调用AI生成服务时需要网络连接。应用的核心工作流为：用户输入故事文本，系统通过AI生成故事大纲与分镜，再为每个分镜生成关键帧图片与视频片段，最终组合为完整的动画作品。

项目代码规模：692个文件，130,876行代码（不含测试），118个测试文件共38,294行。项目采用领域驱动设计（DDD）结合子域模块化架构，将业务逻辑划分为12个功能模块，通过严格的依赖方向约束和依赖注入容器实现层间解耦。

架构核心设计目标有三：

**修改隔离**：模块间互不影响。每个模块通过子域划分内部职责，子域之间仅通过各自的`index.ts`桶文件导出的公共API通信，禁止直接引用其他子域的内部文件。模块之间的依赖也仅通过桶路径`@/modules/xxx`引入，深层路径`@/modules/xxx/yyy/zzz`被ESLint规则拦截为错误。这种设计确保修改一个子域的内部实现不会波及其他模块。

**测试替换**：DI容器允许`overrideToken`替换依赖。所有基础设施层的实现（Storage实例、AI Provider、API Client等）均通过Token注册到DI容器中，测试时可通过`overrideToken(token, factory)`替换为Mock实现，无需修改业务代码。DI容器支持6大类共50+个Token，覆盖了从数据存储到AI调用的全部外部依赖。

**架构守护**：ESLint+扫描脚本自动检测违规。项目配置了三层架构守护机制：ESLint自定义规则拦截非法导入路径（如`shared → modules`、`modules → infrastructure`），`check-architecture.mjs`扫描脚本检测DDD层级违规、裸SQL和深层路径导入，`check-module-api-consistency.mjs`验证MODULE.md与index.ts的API一致性。这些守护工具在CI流水线中自动运行，确保架构约束不被破坏。

### 2. 技术栈选型与理由

| 技术 | 版本 | 选型理由 |
|------|------|----------|
| Electron | 41.x | 跨平台桌面应用运行时，Node.js原生模块支持（better-sqlite3依赖C++绑定），系统级API访问（文件系统、安全存储、系统对话框） |
| Next.js | 16 (output: "export") | React生态的SSG框架，静态导出模式生成纯HTML/JS/CSS，适配Electron渲染进程加载，无需Node.js服务器运行时 |
| React | 19 | 组件化UI开发，Hooks模式与Zustand配合实现声明式状态管理，Concurrent特性提升渲染性能 |
| Zustand | 5 | 轻量状态管理库，无boilerplate，12个独立模块各自维护Store，subscribeWithSelector中间件支持细粒度订阅 |
| Tailwind CSS | 4 | 原子化CSS框架，JIT编译按需生成样式，与组件化开发天然契合 |
| better-sqlite3 | 12.10.0 (锁定) | 同步API的SQLite绑定，WAL模式支持并发读写，版本锁定因为原生C++模块ABI与Node.js版本强绑定 |
| Drizzle ORM | - | 类型安全的查询构建器，部分Repository使用（characterRepository、sceneRepository等），与原生SQL混用 |
| TypeScript | strict | 全项目strict模式，类型安全保障，接口定义与编译时检查 |
| Vitest | - | 测试框架，兼容Vite生态，支持组件测试（@testing-library/react）和Hook测试 |
| electron-builder | - | Electron应用打包工具，支持Windows/macOS/Linux多平台构建 |

**关键决策说明**：

**Next.js静态导出**：Electron渲染进程通过`BrowserWindow.loadURL()`加载本地HTTP服务器提供的静态文件，不需要Node.js服务器运行时。Next.js的`output: "export"`配置将所有页面预渲染为静态HTML，构建产物放在`out/`目录下由Electron的静态文件服务器提供。这意味着Next.js的服务端特性（API Routes、Server Components、动态路由）在构建时需要临时移除或转换。

**better-sqlite3版本锁定**：better-sqlite3是C++原生模块，其预编译二进制与特定Node.js ABI版本绑定。Electron使用自己的Node.js版本，因此每次升级Electron或better-sqlite3都需要通过`@electron/rebuild`重新编译。版本锁定为`12.10.0`（非`^12.10.0`）避免意外升级导致的ABI不兼容。构建脚本`build-electron.ps1`在打包前自动执行`npm rebuild better-sqlite3`。

**Zustand而非Redux**：项目有12个独立模块，每个模块维护自己的Store（如`useVideoTaskStore`、`useStorySaver`）。Zustand的轻量特性（核心仅1KB）降低了认知负担，无需定义Action Type、Reducer、Middleware等Redux样板代码。Zustand的`subscribeWithSelector`中间件允许组件仅订阅Store的部分状态，避免不必要的重渲染。

**双通信机制**：Electron渲染进程与主进程之间采用IPC和HTTP API Server双通道通信。IPC（通过`contextBridge`和`ipcRenderer.invoke`）用于低频特权操作（文件系统访问、安全配置、系统对话框），具有5级权限体系和速率限制。HTTP API Server（运行在`127.0.0.1:API_SERVER_PORT`）用于高频数据操作（AI生成请求、视频状态查询、批量任务保存），支持JSON请求体和路由分发。双通道设计的原因是IPC的同步调用会阻塞渲染进程，而HTTP API天然异步且支持更大的请求体。

### 3. 分层架构详解

项目采用5层架构，依赖方向严格从外向内：

```
┌─────────────────────────────────────────────────┐
│                    app 层                        │
│         Next.js页面、布局、全局Provider            │
│              可导入所有层                          │
├─────────────────────────────────────────────────┤
│                 modules 层                       │
│      12个业务模块，每个含hooks/services/presentation│
│       可导入 domain、shared、infrastructure/di     │
├─────────────────────────────────────────────────┤
│              infrastructure 层                   │
│    DI容器、Storage、Network、AI Providers、Database│
│          可导入 domain、shared                    │
├─────────────────────────────────────────────────┤
│                 shared 层                        │
│     跨切面UI（Toast、Sidebar、ErrorBoundary）、    │
│        工具函数、事件总线、错误日志                  │
│            仅可导入 domain                        │
├─────────────────────────────────────────────────┤
│                 domain 层                        │
│    纯类型定义、Schema、Result类型、Port接口          │
│            不导入任何其他层                         │
└─────────────────────────────────────────────────┘
```

**依赖方向规则表**：

| 层级 | 允许导入 | 禁止导入 |
|------|----------|----------|
| `domain/` | 无外部依赖 | `@/modules/*`、`@/infrastructure/*`、`@/shared/*` |
| `shared/` | `@/domain/*` | `@/modules/*`、`@/infrastructure/*` |
| `modules/` | `@/domain/*`、`@/shared/*`、`@/infrastructure/di` | `@/infrastructure/*`（除DI）、`@/modules/*/*/*` |
| `infrastructure/` | `@/domain/*`、`@/shared/*` | `@/modules/*` |
| `app/` | 所有层 | 模块深层路径`@/modules/*/*/*` |

**模块地图**（12个业务模块）：

| 模块 | 文件数 | 代码行数 | 职责 |
|------|--------|----------|------|
| story | 70 | 18,650 | 故事/分镜项目管理，最大的业务模块 |
| video | 69 | 12,237 | 视频生成任务管理，第二大模块 |
| shot | 28 | 5,232 | 镜头一致性检查与元素绑定 |
| prompt | 23 | 4,665 | AI提示词生成与管理 |
| asset | 14 | 3,030 | 资产管理（导入导出、媒体资产） |
| sync | 13 | 2,544 | 多设备数据同步 |
| character | 12 | 1,394 | 角色管理（CRUD、服装、图片生成） |
| scene | 11 | 1,001 | 场景管理（CRUD、图片生成） |
| persistence | 5 | 519 | 自动保存与持久化守护 |
| integrity | 4 | 467 | SQL安全与Schema验证 |
| feedback | 5 | 206 | 用户反馈（0消费者，待合并） |
| security | 2 | 101 | 安全配置管理（0消费者，待合并） |

### 4. 数据流架构

#### 4.1 总体数据流

用户操作的数据流遵循严格的单向流动：

```
用户交互 → React组件 → Hook → Service → DI容器 → Infrastructure → IPC/HTTP → 主进程 → SQLite/AI API → 响应回传
```

具体展开：

1. **用户交互**：用户在React组件中触发操作（如点击"生成视频"按钮）
2. **React组件**：组件调用Hook暴露的方法（如`useVideoGenerator().generate()`）
3. **Hook**：Hook内部调用Service的业务逻辑方法，同时管理React状态（loading、error等）
4. **Service**：Service通过DI容器获取基础设施依赖（如`container.videoProvider`），执行业务逻辑
5. **DI容器**：Proxy拦截属性访问，从ModuleRegistry解析Token获取实例
6. **Infrastructure**：Storage层执行SQL操作，AI Provider层发起HTTP请求
7. **IPC/HTTP**：Storage操作通过IPC发送到主进程，AI请求通过HTTP API Server路由到主进程的api-gateway
8. **主进程**：IPC Handler执行数据库操作，API Gateway调用AI服务商API
9. **SQLite/AI API**：本地数据持久化到SQLite，AI生成请求发送到远程服务
10. **响应回传**：结果沿反方向返回，最终更新React状态触发UI重渲染

#### 4.2 AI请求完整链路（视频生成示例）

以"为分镜生成视频"为例，完整链路如下：

```
1. 用户点击"生成视频"按钮
2. BeatDetailEditor组件调用useVideoGenerator().generate(beat)
3. useVideoGenerator内部：
   a. 调用determineVideoGenerationMode()确定生成模式（keyframe/video/framePair）
   b. 调用generateBeatVideo()构建视频生成参数
   c. 通过container.videoProvider.generateVideo()发起生成请求
4. videoProvider.generateVideo()：
   a. 调用infrastructure/ai-providers/video.ts的generateVideo()
   b. 构建请求体（prompt、firstFrameUrl、lastFrameUrl等）
   c. 通过apiClient发送POST请求到HTTP API Server
5. HTTP API Server收到/api/generate-video请求：
   a. 验证X-Electron-App头
   b. 检查速率限制
   c. 路由到api-gateway.generateVideo()
6. api-gateway.generateVideo()：
   a. 从请求中提取providerId、modelId
   b. 通过pluginRegistry.select()匹配服务商插件
   c. 调用插件的generateVideo()方法
   d. 插件构造服务商特定的HTTP请求并发送
7. 服务商返回taskId（异步生成模式）
8. 响应沿链路返回到渲染进程
9. useVideoTaskManager创建VideoTask记录，状态为"pending"
10. 轮询引擎启动，定期查询视频状态
11. 视频生成完成后，更新VideoTask状态为"completed"
12. 通过buildVideoUrlUpdates()更新beat的videoUrl
13. 持久化视频URL到数据库
14. UI更新显示视频播放器
```

#### 4.3 双通道通信架构

**IPC通道**（低频特权操作）：

IPC通信通过`contextBridge.exposeInMainWorld("electronAPI", {...})`暴露安全的API给渲染进程。每个IPC通道在`IPC_PERMISSIONS`中注册，具有5级权限和速率限制。渲染进程通过`ipcRenderer.invoke()`异步调用，或`ipcRenderer.sendSync()`同步调用（仅限config:get/set）。IPC适用于文件系统操作、安全配置、系统对话框等需要主进程特权的场景。

**HTTP API Server通道**（高频数据操作）：

HTTP API Server运行在`127.0.0.1:API_SERVER_PORT`，监听本地回环地址。所有请求必须携带`X-Electron-App`头（否则返回403），并受IP级速率限制（180次/分钟）。API Server采用路由表模式，每个路由由`RouteHandler`函数处理。静态文件服务器（运行在`127.0.0.1:APP_SERVER_PORT`）将`/api/`路径的请求代理到API Server。HTTP API适用于AI生成请求、视频状态查询、批量数据操作等需要大请求体或高频调用的场景。

### 5. 依赖注入体系

#### 5.1 容器架构

DI容器由三个核心组件构成：

**Token工厂**（`createToken<T>`）：每个依赖项对应一个Token，包含唯一标识符`id`和工厂函数`factory`。Token是类型安全的，泛型参数`T`确保解析结果类型正确。

**ModuleRegistry**：注册中心，维护Token到注册信息的映射。支持三种操作：`register(token, lifecycle)`注册依赖、`resolve(token)`解析依赖、`override(token, factory)`覆盖依赖（测试用）。Registry内部使用`singletonCache`缓存单例实例，使用`resolutionStack`检测循环依赖。

**容器代理**（`container`）：通过`Proxy`实现的便捷访问接口。`container.xxx`会被Proxy拦截，自动调用`registry.resolve(tokens.xxx)`。访问未注册的Token会抛出明确的错误信息。

#### 5.2 生命周期

所有Token注册为`singleton`生命周期。首次解析时调用工厂函数创建实例并缓存，后续解析直接返回缓存实例。`overrideToken()`覆盖时会清除对应的缓存，确保测试隔离。`resetContainer()`清除所有缓存，用于测试间重置。

#### 5.3 循环依赖检测

容器在解析过程中维护`resolving`集合（或Registry中的`resolutionStack`）。当解析Token A时，A被加入集合；如果A的工厂函数依赖Token B，解析B时B也被加入集合；如果B又依赖A，检测到A已在集合中，抛出`Circular dependency detected`错误。解析完成后Token从集合中移除（使用try/finally确保异常安全）。

#### 5.4 Token分类详解

DI容器共注册50+个Token，分为6大类：

**A. Domain Port实现（9个）**：模块通过Port接口解耦的基础设施实现。

| Token | Port接口 | 实现来源 | 用途 |
|-------|----------|----------|------|
| videoTaskStorage | IVideoTaskStorage | infrastructure/storage/video-tasks | 视频任务CRUD |
| characterStorage | ICharacterStorage | infrastructure/storage/characters | 角色CRUD+服装管理 |
| sceneStorage | ISceneStorage | infrastructure/storage/scenes | 场景CRUD |
| storyStorage | IStoryStorage | infrastructure/storage/stories | 故事CRUD |
| videoProvider | IVideoProvider | infrastructure/ai-providers/video | 视频生成5个方法 |
| imageProvider | IImageProvider | infrastructure/ai-providers/image | 图片生成+分析 |
| textProvider | ITextProvider | infrastructure/ai-providers/text | 文本生成 |
| fileUploader | IFileUploader | infrastructure/ai-providers/utils | 文件上传 |
| syncStorage | ISyncStorage | infrastructure/storage/sqlite-core | 同步引擎数据访问 |

**B. 有状态服务（6个）**：单例服务，需要测试替换。

| Token | 实现来源 | 用途 |
|-------|----------|------|
| eventBus | shared/event-bus | 跨模块事件通信 |
| apiClient | infrastructure/api/client | HTTP客户端实例 |
| imageApi | infrastructure/api/client | 图片API客户端 |
| videoApi | infrastructure/api/client | 视频API客户端 |
| textApi | infrastructure/api/client | 文本API客户端 |
| preferencesStorage | shared/utils/preferences | 用户偏好存储 |

**C. Storage实例（11个）**：有状态的存储模块，模块无法直接导入infrastructure/storage。

| Token | 实现来源 | 用途 |
|-------|----------|------|
| versionStorage | infrastructure/storage/versions | 版本管理存储 |
| elementStorage | infrastructure/storage/elements | 元素存储 |
| videoCacheStorage | infrastructure/storage/video-cache | 视频缓存存储 |
| imageCacheStorage | infrastructure/storage/image-cache | 图片缓存存储 |
| collectionStorage | infrastructure/storage/collections | 收藏集存储 |
| storyboardStorage | infrastructure/storage/storyboard | 分镜资产存储 |
| importExportStorage | infrastructure/storage/import-export | 导入导出存储 |
| templateStorage | infrastructure/storage/templates | 模板存储 |
| autoSaveStorage | infrastructure/storage/auto-save | 自动保存存储 |
| errorLogStorage | infrastructure/storage/error-logs | 错误日志存储 |
| sessionStorage | infrastructure/storage/sessions | 会话存储 |

**D. Repository实例（5个）**：Drizzle ORM仓库，模块无法直接导入infrastructure/database。

| Token | 实现来源 | 用途 |
|-------|----------|------|
| mediaAssetRepository | infrastructure/database | 媒体资产仓库 |
| characterRepository | infrastructure/database | 角色仓库 |
| sceneRepository | infrastructure/database | 场景仓库 |
| storyRepository | infrastructure/database | 故事仓库 |
| elementRepository | infrastructure/database | 元素仓库 |

**E. Infrastructure桥接函数（17个）**：纯函数，但因ESLint规则模块无法直接导入infrastructure。

| Token | 实现来源 | 桥接理由 |
|-------|----------|----------|
| safeQuery | infrastructure/storage/sqlite-core | 安全查询，参数化SQL |
| safeRun | infrastructure/storage/sqlite-core | 安全执行，参数化SQL |
| safeTransaction | infrastructure/storage/sqlite-core | 安全事务 |
| toSqlValue | infrastructure/storage/core | SQL值转换 |
| synthesizeOutfit | infrastructure/ai-providers/outfit-synthesis | 服装合成AI调用 |
| batchSynthesizeOutfits | infrastructure/ai-providers/outfit-synthesis | 批量服装合成 |
| getProviderSupportedCodecs | infrastructure/ai-providers/model-adapter | 获取服务商支持编解码器 |
| getProviderMaxDuration | infrastructure/ai-providers/model-adapter | 获取服务商最大时长 |
| registerObjectUrl | infrastructure/storage/video-cache | 注册ObjectURL |
| revokeObjectUrl | infrastructure/storage/video-cache | 释放ObjectURL |
| getObjectUrl | infrastructure/storage/video-cache | 获取ObjectURL |
| resilientFetch | infrastructure/network/resilient-fetch | 弹性HTTP请求 |
| updateOutfitImage | infrastructure/storage/characters | 更新服装图片 |
| loadConfig | infrastructure/ai-providers/api-config/storage | 加载API配置 |
| checkConfigStatus | infrastructure/ai-providers/api-config/init | 检查配置状态 |
| initConfig | infrastructure/ai-providers/api-config/init | 初始化配置 |
| resolveImageSize | infrastructure/ai-providers/model-capabilities | 解析图片尺寸 |
| getModelParameterProfile | infrastructure/ai-providers/model-capabilities | 获取模型参数配置 |
| isCodecSupportedByProvider | infrastructure/video-utils | 编解码器兼容性检查 |

**F. 懒加载模块（2个）**：避免循环依赖的动态导入。

| Token | 实现来源 | 懒加载理由 |
|-------|----------|------------|
| elementManager | modules/shot/element-binding | shot模块与story模块存在双向依赖 |
| referenceEngine | modules/shot/shot-reference | shot模块与story模块存在双向依赖 |

### 6. IPC通信与安全模型

#### 6.1 五级权限体系

IPC通道按安全级别分为5个等级，每个等级定义了允许的操作范围：

| 权限级别 | 允许的操作 | 典型通道 |
|----------|------------|----------|
| READONLY | 只读数据查询 | db:query、db:get、db:stats、db:type、assets:read-file-base64、assets:get-dir、assets:file-exists、fs:read-file、cache:get-cache-directory、fs:get-file-info、fs:get-disk-space、image:to-base64、config:get、secure-config:load、secure-config:has、export:data |
| READWRITE | 数据写入操作 | db:run、db:batch-insert、db:init、db:save、assets:save-image、assets:save-buffer、assets:copy-file、fs:write-file、image:normalize、config:set、secure-config:save、secure-config:delete |
| DANGEROUS | 危险操作（需谨慎） | db:transaction、db:migrate、db:vacuum、db:analyze、db:checkpoint、assets:delete-file |
| SYSTEM | 系统级操作 | shell:open-external、dialog:open-file、dialog:save-file、db:close |
| SECURE | 安全敏感操作 | secure-config:resolve（解密API Key） |

#### 6.2 速率限制

IPC通信实施两级速率限制：

**通道级限制**：READONLY通道300次/分钟，其他通道100次/分钟。每个通道维护独立的调用历史记录，每60秒清理过期记录。当通道历史记录超过限制的2倍时自动裁剪。

**全局限制**：所有IPC调用合计600次/分钟。全局调用时间戳数组在超过限制的2倍时自动裁剪。

#### 6.3 DDL拦截与SQL注释剥离

渲染进程禁止执行DDL语句（DROP、ALTER、CREATE、TRUNCATE、ATTACH、DETACH）。拦截机制分两步：

1. **注释剥离**：先移除块注释（`/* ... */`）和行注释（`-- ...`），防止通过注释绕过DDL检测
2. **DDL检测**：对剥离注释后的SQL应用正则`/^\s*(DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH)\s/i`

DDL拦截仅对`db:run`和`db:transaction`通道生效。对于`db:transaction`，会遍历事务中的所有语句逐一检查。

#### 6.4 SSRF防护

主进程的所有HTTP请求通过SSRF Guard过滤，阻止请求私有IP地址：

- IPv4私有地址段：10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、127.0.0.0/8、169.254.0.0/16
- IPv6链路本地地址：通过首hextet解析检测，使用位运算`(value & 0xffc0) === 0xfe80`
- 特殊域名：localhost、0.0.0.0等

#### 6.5 API Key加密存储

API Key通过`electron-store`加密存储，前端仅通过IPC访问：

- `secure-config:save`：加密保存API Key
- `secure-config:load`：加载加密的API Key（返回加密值）
- `secure-config:resolve`：解密API Key（需要SECURE权限级别）
- `secure-config:delete`：删除API Key
- `secure-config:has`：检查API Key是否存在

密钥存储采用策略模式：优先使用`safe-storage.strategy`（Electron原生安全存储），回退到`plaintext-fallback.strategy`（Linux无keychain时）。非Electron环境拒绝存储API Key，不回退到localStorage。

#### 6.6 X-Electron-App头验证

HTTP API Server要求所有请求携带`X-Electron-App`头。缺失该头的请求返回403 Forbidden。这是防止非Electron进程（如浏览器）直接访问API Server的安全措施。渲染进程的API客户端在`@/config/constants`中定义了`ELECTRON_APP_HEADERS`常量，所有fetch请求自动附加该头。

### 7. 状态管理架构

#### 7.1 Zustand + React双层模型

项目采用Zustand Store管理全局状态，React组件的`useState`/`useReducer`管理组件局部状态。两层模型各司其职：

**Zustand Store层**：管理跨组件、跨模块共享的状态。每个模块维护自己的Store，通过`create()`创建，支持`subscribeWithSelector`中间件实现细粒度订阅。Store是模块的单例状态容器，可在任何Hook或Service中直接访问。

**React状态层**：管理组件内部的UI状态（如loading、error、表单输入）。通过`useState`和`useReducer`管理，状态变更触发组件重渲染。

**核心Store列表**：

| Store | 所属模块 | 管理的状态 |
|-------|----------|------------|
| useVideoTaskStore | video | 视频任务列表、选中任务、过滤条件 |
| useStorySaver | story | 故事保存状态、dirty标记 |
| useStoryState | story | 当前故事、beat列表、选中beat |
| useAppStore | shared | 全局活跃ID（activeCharacterId、activeSceneId、activeStoryId）、侧边栏折叠状态 |
| useDirtyState | shared | 跨模块脏状态追踪（dirtyKeys集合、markDirty/markClean方法） |

**useVideoTaskStore详细字段**：

```typescript
interface VideoTaskManagerState {
  allTasks: VideoTask[];
  isBackgroundProcessing: boolean;
  isInitialized: boolean;
  isCreating: boolean;
  initError: string | null;
  initialize(): void;
  addTask(task: VideoTask): void;
  updateTask(taskId: string, updates: Partial<VideoTask>): void;
  updateTaskStatus(taskId: string, status: VideoTaskStatus): void;
  updateTaskProgress(taskId: string, progress: number): void;
  removeTask(taskId: string): Promise<void>;
  removeTasks(taskIds: string[]): Promise<void>;
  cancelTask(taskId: string): Promise<void>;
  recoverTask(taskId: string, targetStatus: VideoTaskStatus, videoUrl?: string): void;
  clearActiveTasks(): Promise<void>;
  clearCompleted(): Promise<void>;
  setTasks(tasks: VideoTask[]): void;
}
```

**useAppStore详细字段**：

```typescript
interface AppState {
  activeCharacterId: string | null;
  activeSceneId: string | null;
  activeStoryId: string | null;
  sidebarCollapsed: boolean;
  setActiveCharacterId(id: string | null): void;
  setActiveSceneId(id: string | null): void;
  setActiveStoryId(id: string | null): void;
  toggleSidebar(): void;
}
```

**useDirtyState详细字段**：

```typescript
interface DirtyState {
  dirtyKeys: Set<string>;
  markDirty(key: string): void;
  markClean(key: string): void;
  markAllClean(): void;
  isDirty(key?: string): boolean;
  getDirtyKeys(): string[];
}
```

#### 7.2 视频任务状态机

视频任务的状态转换由`TaskMachine`管理，使用`withTransitionGuard`保护：

```
                    ┌──────────────┐
                    │   pending    │
                    └──────┬───────┘
                           │ start
                           ▼
                    ┌──────────────┐
              ┌────▶│  generating  │◀────┐
              │     └──────┬───────┘     │
              │            │ fail        │ retry
              │            ▼             │
              │     ┌──────────────┐     │
              │     │   failed     │─────┘
              │     └──────┬───────┘
              │            │ cancel
              │            ▼
              │     ┌──────────────┐
              │     │  cancelled   │
              │     └──────────────┘
              │            
              │ success
              │            
              ▼     
       ┌──────────────┐
       │  completed   │
       └──────────────┘
```

**TaskMachine合法转换表**：

| 当前状态 | 允许转换到 | 触发条件 |
|---------|-----------|----------|
| pending | generating | 任务开始处理 |
| pending | failed | 任务创建后立即失败 |
| pending | cancelled | 用户取消 |
| generating | completed | AI生成成功 |
| generating | failed | AI生成失败 |
| generating | cancelled | 用户取消 |
| completed | pending | 重置任务（重新生成） |
| failed | retrying | 智能重试触发 |
| failed | cancelled | 用户取消 |
| retrying | generating | 重试开始处理 |
| retrying | completed | 重试生成成功 |
| retrying | failed | 重试生成失败 |
| retrying | cancelled | 用户取消 |
| cancelled | 无（终态） | - |

`withTransitionGuard`在开发模式下对非法状态转换抛出`TransitionError`，在生产模式下静默剥离status字段。

#### 7.3 跨模块事件通信

模块间通过`eventBus`（来自`@/shared/event-bus`）进行事件通信。eventBus是发布/订阅模式的全局事件总线，支持：

- `emit(eventType, payload)`：发布事件
- `on(eventType, handler)`：订阅事件
- `off(eventType, handler)`：取消订阅

典型场景：character模块删除角色后发布`character:deleted`事件，story模块监听该事件清理关联的beat引用。

**已注册的领域事件**：

| 事件类型 | 发布者 | 订阅者 | 用途 |
|---------|--------|--------|------|
| character:deleted | character模块 | story模块、persistence模块 | 角色删除后级联清理 |
| scene:deleted | scene模块 | story模块、persistence模块 | 场景删除后级联清理 |
| video:taskCompleted | video模块 | story模块 | 视频完成后更新beat的videoUrl |
| video:taskFailed | video模块 | video/recovery模块 | 视频失败后触发智能重试 |
| network:online | network-monitor | sync模块 | 网络恢复后触发同步 |
| network:offline | network-monitor | 全局 | 网络断开提示 |
| toast:show | toast-bridge | Toast组件 | 非React代码显示通知 |

#### 7.4 Toast桥接

非React代码（Zustand Store、轮询引擎、Service层）无法使用React Hook的`useToastHelpers`，因此项目提供了`emitToast()`函数（来自`@/shared/utils/toast-bridge`）。该函数通过eventBus发布`toast:show`事件，React层的Toast组件监听该事件并显示通知。这确保了任何代码层级都能向用户展示操作反馈。

```typescript
import { emitToast } from "@/shared/utils/toast-bridge";
emitToast({ type: "error", message: "视频生成失败，请检查网络连接" });
emitToast({ type: "success", message: "角色图片已保存" });
```

### 8. 数据库架构概览

#### 8.1 SQLite WAL模式与连接管理

数据库使用SQLite的WAL（Write-Ahead Logging）模式，配置如下：

```sql
PRAGMA journal_mode = WAL;       -- WAL模式，支持并发读写
PRAGMA synchronous = NORMAL;     -- 平衡安全性与性能
PRAGMA cache_size = -64000;      -- 64MB缓存
PRAGMA temp_store = memory;      -- 临时表存储在内存
PRAGMA mmap_size = 268435456;    -- 256MB内存映射
```

数据库文件位于`%APPDATA%/ai-animation-studio/database/studio.db`，目录权限设置为`0o700`。连接通过`getDb()`获取，单例模式确保全局只有一个连接实例。

**关键表保护机制**：`db-connection.ts`定义了`CRITICAL_TABLES`数组，包含`characters`、`scenes`、`stories`、`story_beats`、`video_tasks`、`schema_version`六张关键表。初始化时验证这些表是否存在，缺失则触发完整的Schema创建。

**持久化状态追踪**：`db-connection.ts`维护`isPersistenceAvailable`、`lastSaveTime`、`consecutiveSaveFailures`三个状态变量，通过`getPersistenceStatus()`暴露。当连续保存失败时，上层可据此降级为只读模式或提示用户。

#### 8.2 声明式Schema Builder

Schema通过`schema-builder.ts`的声明式API定义，而非手写SQL。每个表由`TableDef`接口描述：

```typescript
interface TableDef {
  name: string;
  columns: Record<string, ColumnDef>;
  baseColumns?: boolean;
  uniqueConstraints?: string[][];
  primaryKey?: string;
  featureGroup?: string;
}

interface ColumnDef {
  type: string;
  notNull?: boolean;
  default?: string;
  check?: string;
  ref?: string;
  onDelete?: string;
  unique?: boolean;
  index?: boolean;
}
```

`generateTableSQL(def)`函数将TableDef转换为完整的CREATE TABLE语句和索引。这种声明式设计使得Schema定义与SQL生成解耦，便于添加新表和修改现有表结构。

#### 8.3 7字段基础列

所有业务表（`baseColumns !== false`）自动包含7个基础列：

| 列名 | 类型 | 默认值 | 用途 |
|------|------|--------|------|
| id | TEXT | crypto.randomUUID() | 主键 |
| owner_id | INTEGER | 1 | 所有者ID（多用户预留） |
| created_at | INTEGER | strftime('%s','now') | 创建时间戳 |
| updated_at | INTEGER | strftime('%s','now') | 更新时间戳 |
| is_deleted | INTEGER | 0 | 软删除标记 |
| deleted_at | INTEGER | null | 删除时间戳 |
| version | INTEGER | 1 | 乐观锁版本号 |
| sync_id | TEXT | null | 同步标识符 |

基础列自动生成索引：`idx_{table}_is_deleted`和`idx_{table}_updated_at`。

#### 8.4 JSON Container模式

业务表的易变字段存储在JSON列中，避免ALTER TABLE操作。每个JSON容器有对应的TypeScript接口和`parseXxx()`安全解析函数。

典型JSON容器：

| 表 | JSON列 | 对应接口 | 用途 |
|----|--------|----------|------|
| video_tasks | config | VideoTaskConfig | 视频生成配置参数 |
| video_tasks | provider | VideoTaskProvider | 服务商信息 |
| video_tasks | media_refs | VideoTaskMediaRefs | 媒体引用 |
| video_tasks | tracking | VideoTaskTracking | 追踪信息 |
| story_beats | camera | BeatCamera | 镜头参数 |
| story_beats | generation | BeatGeneration | 生成状态 |
| story_beats | meta | BeatMeta | 元数据 |
| characters | appearance | CharacterAppearance | 外观描述 |
| characters | generation | CharacterGeneration | 生成信息 |
| characters | config | CharacterConfig | 角色配置 |
| characters | meta | CharacterMeta | 角色元数据 |
| scenes | appearance | SceneAppearance | 外观描述 |
| scenes | atmosphere | SceneAtmosphere | 氛围参数 |
| scenes | generation | SceneGeneration | 生成信息 |
| scenes | config | SceneConfig | 场景配置 |

更新JSON容器使用`json_set(COALESCE(container, '{}'), '$.key', ?)`模式，支持部分更新而无需读取-修改-写入整个JSON。

**JSON Schema解析函数**：`video-tasks/json-schemas.ts`提供以下安全解析函数：

```typescript
parseConfig(raw: unknown): VideoTaskConfig
parseProvider(raw: unknown): VideoTaskProvider
parseMediaRefs(raw: unknown): VideoTaskMediaRefs
parseTracking(raw: unknown): VideoTaskTracking
```

解析失败时返回默认值（空对象`{}`）而非抛出异常，确保系统在数据损坏时仍能正常运行。

#### 8.5 功能标记（SCHEMA_FEATURES）

Schema Builder通过`SCHEMA_FEATURES`控制哪些表组被创建：

```typescript
const SCHEMA_FEATURES = {
  users: true,
  core: true,
  video: true,
  sync: true,
  templates: true,
  assets: true,
};
```

功能标记允许在构建时选择性启用/禁用表组，便于裁剪功能或分阶段部署。

#### 8.6 Migration框架

数据库迁移由`migrations.ts`管理，当前版本为`CURRENT_SCHEMA_VERSION=2`，迁移映射`MIGRATIONS={}`为空（项目尚未发布，无历史迁移）。迁移执行流程：

1. 读取`schema_version`表获取当前版本
2. 遍历`MIGRATIONS`映射，执行版本号大于当前版本的迁移
3. 每个迁移在`db.transaction()`中执行，确保原子性
4. 迁移成功后更新`schema_version`表

`MigrationDb`接口要求`transaction(fn: () => void): void`方法，确保迁移框架与具体数据库实现解耦。

### 9. 关键设计模式

#### 9.1 Domain Port + DI解耦

模块定义Port接口在`domain/ports/`中，Infrastructure提供实现并注册到DI容器，模块通过`container.xxx`访问。这种三层解耦确保：

- 模块不知道具体实现（只依赖接口）
- 实现可以自由替换（如Mock测试、服务商切换）
- 依赖方向符合DDD约束（模块不直接导入infrastructure）

```typescript
// domain/ports/ai-provider-port.ts
export interface IVideoProvider {
  generateVideo(prompt: string, options?: {...}): Promise<ApiResponse<VideoGenerationResult>>;
  queryVideoStatus(taskId: string, options?: {...}): Promise<ApiResponse<{...}>>;
  generateKeyframe(params: {...}): Promise<ApiResponse<{...}>>;
  generateFramePair(params: {...}): Promise<ApiResponse<{...}>>;
  generateVideoWithFrames(params: {...}): Promise<ApiResponse<VideoGenerationResult>>;
}

// infrastructure/di/container.ts
const videoProvider: IVideoProvider = { generateVideo, queryVideoStatus, ... };
tokens.videoProvider = createToken<IVideoProvider>("videoProvider", () => videoProvider);

// modules/story/generation/hooks/useVideoGenerator.ts
const provider = container.videoProvider;
const result = await provider.generateVideo(prompt, options);
```

#### 9.2 Result类型与语义化错误

所有Service方法返回`Result<T>`类型，强制调用方处理错误：

```typescript
type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };
```

错误类型体系包含12个语义化错误类：`DatabaseError`、`ValidationError`、`ApiError`、`NotFoundError`、`NetworkError`、`StorageError`、`ConfigurationError`、`GenerationError`、`TimeoutError`、`RateLimitError`、`AuthenticationError`，以及基类`AppError`。每个错误类包含`code`字段用于程序化分类，避免依赖`message.includes()`的脆弱字符串匹配。

辅助函数`ok(value)`、`err(error)`、`fromThrowable(fn)`、`fromAsyncThrowable(fn)`简化Result的创建。

**错误分类模式**：项目使用结构化错误码而非字符串匹配进行错误分类：

```typescript
const ERROR_CODE_PATTERNS = [
  { category: "timeout", codes: ["TIMEOUT", "ETIMEDOUT"], patterns: [/timeout/i] },
  { category: "rate_limit", codes: ["RATE_LIMITED", "429"], patterns: [/rate[\s_-]?limit/i] },
];
export function classifyError(errorCode?: string, errorMessage?: string): ErrorCategory { ... }
```

#### 9.3 useRef稳定引用避免闭包陷阱

在`useEffect`中引用外部状态时，使用`useRef`保存最新值的引用，避免闭包捕获过时值：

```typescript
const beatsRef = useRef(beats);
beatsRef.current = beats;

useEffect(() => {
  const updates = buildVideoUrlUpdates(beatsRef.current, completedUrls);
  setBeats(updates);
}, [completedUrls]);
```

#### 9.4 持久化优先于状态更新

当异步操作同时修改React状态和持久化存储时，存储写入必须在状态更新之前完成：

```typescript
// 错误：先更新状态，持久化可能失败
setAllTasks(tasks.filter(t => t.status !== "completed"));
await deleteVideoTasksByStatus("completed");

// 正确：先持久化，成功后再更新状态
await deleteVideoTasksByStatus("completed");
setAllTasks(tasks.filter(t => t.status !== "completed"));
```

#### 9.5 去重优先于中止

当用户在已有请求进行中时触发相同操作，优先返回已有的Promise（去重），而非中止前一个请求：

```typescript
// 错误：中止浪费API配额
if (controller) controller.abort();
controller = new AbortController();
await fetch(url, { signal: controller.signal });

// 正确：去重复用已有请求
if (pendingPromise) return pendingPromise;
pendingPromise = fetch(url);
const result = await pendingPromise;
pendingPromise = null;
return result;
```

#### 9.6 契约驱动开发

每个模块和子域都有契约文件约束其公共API：

- **MODULE.md**：模块概述、子域表、公共API列表、边界约束
- **contract.json**：子域名称、描述、依赖、公共API、不变量（invariants）
- **index.ts**：实际的桶文件导出

修改公共API时必须同步更新三者，并通过`check-module-api-consistency.mjs`验证一致性。

#### 9.7 崩溃恢复与优雅关闭

**崩溃恢复**：

- `uncaughtException`和`unhandledRejection`仅记录日志，不调用`app.exit()`，保持应用运行
- 渲染进程崩溃时，`LifecycleManager`将状态转为`CRASHED`，`CrashRecovery`在1秒后自动重建窗口
- GPU进程崩溃时，执行`webContents.reload()`重新加载页面
- 其他子进程退出仅记录warn级别日志

**优雅关闭序列**：

1. `before-quit`事件触发`shutdown()`
2. `performCleanup()`：销毁窗口、关闭静态服务器（先destroy所有tracked connections再close）
3. `stopApiServer()`：destroy所有tracked API connections、close HTTP服务器
4. `closeDatabase()`：关闭SQLite连接
5. `app.quit()`：退出应用

静态服务器和API Server都维护`activeConnections: Set<net.Socket>`跟踪所有连接，关闭时先`destroy()`所有连接再`server.close()`，防止keep-alive连接阻塞进程退出。

---

## 第二部分：业务模块详解

### 1. story模块

**基本信息**：70个文件，18,650行代码，是项目中最大的业务模块。

**模块概述**：story模块负责故事创作与分镜管理的完整生命周期，从故事创建、大纲编辑、分镜配置到AI生成编排。它是用户工作流的核心枢纽，串联了角色、场景、镜头、提示词等多个模块的交互。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| planning | story/planning/ | 故事规划、CRUD、版本管理、模板应用 |
| beat-editor | story/beat-editor/ | 分镜编辑器、镜头配置、元素绑定、排序 |
| generation | story/generation/ | AI关键帧/视频生成、批量任务编排、进度展示 |
| template | story/template/ | 模板管理、版本控制、样式预设 |
| prompt-editor | story/prompt-editor/ | 提示词编辑器、AI辅助提示词生成 |

**公共API清单**：

规划子域：`storyService`、`useStoryPlanner`、`useStories`、`useStory`、`useStoryCount`、`useCreateStory`、`useUpdateStory`、`useDeleteStory`、`DEFAULT_STORY`、`genres`、`tones`、`beatTypes`、`useStorySaver`、`CreationMode`（type）、`QuickInputMode`（type）、`PlaceholderBinding`（type）、`QuickStoryData`（type）

引用解析：`resolveCharacterRef`、`resolveSceneRef`

生成子域：`useAIGeneratorBase`、`useKeyframeGenerator`、`useFramePairGenerator`、`useVideoGenerator`、`useBatchGenerator`、`useUploadHandlers`、`ShotGenerationPanel`、`KeyframePanel`、`KeyframeChainVisualizer`、`PromptPreview`、`ShotReferenceConfig`、`ReferenceVideoUploader`、`generateBeatKeyframe`、`generateBeatFramePair`、`generateBeatVideo`、`generateBeatFullWorkflow`、`generateKeyframeChain`、`generateFramePairChain`、`determineVideoGenerationMode`、`generateFramePrompts`、`batchGenerateFramePrompts`、`generateStyleGuide`、`generateStylePromptOnly`、`VideoGenerationMode`（type）、`BatchStrategy`、`GenerationLevel`、`BatchOptions`（type）、`BatchResult`（type）

分镜编辑子域：`useStoryState`、`useAssetLoader`、`BeatDetailEditor`、`BeatOverviewCard`、`SortableBeatList`、`ElementBindingPanel`、`ProfessionalModeEditor`

模板子域：`TemplateManagerDialog`、`VersionDialog`、`AssetPicker`、`createTemplateFromBeats`、`applyTemplateToBeats`、`exportTemplateToFile`、`importTemplateFromFile`、`restoreVersion`、`saveVersion`、`getVersions`、`deleteVersion`、`cleanupVersions`、`getVersionStats`、`compareVersions`、`getRecommendedTemplates`、`applyTemplate`

提示词编辑子域：`generatePromptWithAI`、`buildDefaultPrompt`、`usePromptEditor`、`PromptEditor`、`PromptFloatingBall`

**依赖关系**：

- `@/domain/types`：Result类型、错误类型
- `@/domain/schemas`：Story、StoryBeat、ElementBinding等Schema
- `@/infrastructure/di`：依赖注入容器
- `@/modules/prompt`：提示词生成
- `@/modules/shot`：分镜功能（elementManager、referenceEngine）

**数据流详解**：

**故事创建流程**：

```
用户点击"新建故事"
  → useCreateStory Hook
    → storyService.create(storyData)
      → container.storyStorage.createStory(storyData)
        → IPC: db:run → INSERT INTO stories
        → IPC: db:run → INSERT INTO story_beats (批量插入默认beats)
        → IPC: db:run → INSERT INTO story_characters (关联角色)
        → IPC: db:run → INSERT INTO story_scenes (关联场景)
      ← 返回Result<void>
    ← ok(undefined)
  ← 设置useStoryState的currentStory
← 导航到故事编辑页面
```

**分镜编辑与自动保存流程**：

```
用户修改beat内容
  → useStoryState.setBeats() 更新React状态
  → useStorySaver检测dirty标记
    → 防抖1秒后触发保存
      → container.storyStorage.updateStory(storyId, { beats })
        → IPC: db:transaction → 批量UPDATE story_beats
      ← 等待持久化完成
    → suppressDirtyCountRef递减（抑制保存后的脏标记）
    → markClean("beats")
  ← UI更新保存状态指示器
```

**视频生成完整流程**：

```
用户点击"生成视频"
  → BeatDetailEditor组件
    → useVideoGenerator().generate(beat)
      → determineVideoGenerationMode(beat)
        → 检查beat是否有首帧/尾帧/参考视频
        → 返回"keyframe" | "video" | "framePair"
      → generateBeatVideo(beat, mode)
        → 构建视频生成参数（prompt、firstFrameUrl等）
        → container.videoProvider.generateVideo(prompt, options)
          → HTTP POST /api/generate-video
        ← 返回taskId
      → useVideoTaskManager.addTask(task)
        → container.videoTaskStorage.createVideoTask(task)
        → useVideoTaskStore.addTask(task)
      → 轮询引擎启动
        → 视频完成后：
          → buildVideoUrlUpdates(beats, completedUrls)
            → 按storyId过滤更新（回归守卫R3）
          → setBeats(updates)
          → 持久化beat的videoUrl
```

**状态管理详解**：

- `useStoryState`：管理当前故事、beat列表、选中beat等核心状态。使用`beatsRef`（useRef）保持稳定引用，避免闭包陷阱。使用`suppressDirtyCountRef`（计数器而非布尔值）确保保存后多次beats变更都能被正确抑制。

- `useStorySaver`：管理故事保存状态和dirty标记，防抖保存（1秒最小间隔），最大3次重试。保存失败时保留dirty状态，确保用户收到未保存修改警告。

**错误处理模式**：

1. **Service层返回Result类型**：`storyService.create()`返回`Result<void>`，调用方必须检查`result.ok`
2. **Hook层处理错误并展示Toast**：`useCreateStory`在`result.ok === false`时调用`emitToast()`展示错误
3. **保存失败自动重试**：`useStorySaver`在保存失败时自动重试最多3次，超过限制后停止
4. **级联删除错误不静默**：`deleteBeatWithCleanup`在任何级联步骤失败时都记录错误日志

**关键实现细节**：

**StoryProvider上下文枢纽**：`app/story/StoryProvider.tsx`是故事页面的上下文提供者，将story模块的核心Hook组合在一起，通过React Context向下传递。子组件（BeatDetailEditor、SortableBeatList等）通过Context获取故事状态和操作方法，无需逐层传递props。

**视频URL跨故事持久化**：当用户切换故事时，`buildVideoUrlUpdates()`和`applyVideoUrlUpdates()`确保已完成的视频URL正确映射到对应的beat。使用`storyId`过滤更新，防止视频URL被错误应用到当前故事（回归守卫R3）。

**deleteBeatWithCleanup级联删除**：删除beat时必须级联清理关联资源：先删除关联的VideoTask（`container.videoTaskStorage.deleteVideoTasksByBeatId()`），再使缓存失效，最后更新React状态。这遵循回归守卫R2"删除必须级联"。

**Dirty状态抑制计数器**：`useStoryState`使用`suppressDirtyCountRef`计数器而非布尔值。原因是保存操作后可能有多个beats变更事件排队，布尔值只能抑制第一次，后续变更会导致dirty状态残留。计数器确保所有排队变更都被正确抑制，避免页面无法跳转。

**跨模块交互示例**：

```
story模块 → prompt模块：
  useVideoGenerator.generate() 调用 prompt模块的 generateProfessionalVideoPrompt()
  构建视频提示词，传入角色/场景引用信息

story模块 → shot模块：
  useVideoGenerator.generate() 调用 container.elementManager 获取元素绑定
  ElementBindingPanel组件使用 container.referenceEngine 获取引用视频URL

story模块 → character/scene模块：
  resolveCharacterRef() / resolveSceneRef() 解析角色/场景引用
  将引用信息注入到提示词模板中

story模块 → video模块：
  useVideoTaskManager.addTask() 创建视频任务
  buildVideoUrlUpdates() 接收视频完成回调更新beat
```

### 2. video模块

**基本信息**：69个文件，12,237行代码，第二大业务模块。

**模块概述**：video模块负责视频生成任务的完整生命周期管理，包括任务创建、状态追踪、轮询引擎、缓存管理、故障恢复和智能重试。它是AI视频生成能力的核心调度层。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| task-management | video/task-management/ | 任务状态管理、状态机、轮询引擎、UI展示 |
| cache | video/cache/ | 视频/图片Blob缓存、ObjectURL管理 |
| recovery | video/recovery/ | 视频验证、重复检测、智能重试、恢复工作流 |
| utils | video/utils/ | 编解码检测、帧提取、视频模板 |

task-management子域进一步包含：

| 内部模块 | 路径 | 职责 |
|----------|------|------|
| domain | task-management/domain/ | TaskMachine状态机、TaskSchema、策略引擎（过期/超时） |
| hooks | task-management/hooks/ | useVideoTaskManager、轮询引擎、同步引擎、转换守卫 |
| infrastructure | task-management/infrastructure/ | PollingScheduler、TimestampBridge |
| presentation | task-management/presentation/ | VideoTaskManager UI组件、任务卡片、过滤栏 |
| services | task-management/services/ | video-tracker |

**公共API清单**：

任务管理：`VideoTask`（type）、`useVideoTaskManager`、`useVideoTaskStore`、`useVideoTasks`、`useFailedVideoTasks`、`useRecoverVideo`、`useCleanExpiredTasks`、`useStartBackgroundRecovery`、`buildTrackingInfo`、`VideoTaskManager`、`VideoTaskManagerInitializer`、`VideoTaskManagerUI`

缓存：`useVideoCacheStats`、`cacheVideoBlob`、`getVideoUrlWithCache`、`getCacheStats`、`revokeObjectURL`、`cacheImageBlob`、`getCachedImagePath`、`getImageUrlWithCache`、`removeCachedImage`、`cleanExpiredImageCache`、`getImageCacheStats`、`recoverUncachedImages`

恢复：`VideoVerificationResult`（type）、`VideoVerificationDetails`（type）、`RetryDecision`（type）、`VideoRecoveryLog`（type）、`VideoTaskRecoveryInfo`（type）、`DuplicateCheckResult`（type）、`RetryConfig`（type）、`verifyVideoUrl`、`verifyMultipleVideos`、`checkForDuplicateVideos`、`findSimilarTasks`、`smartRetryEngine`、`createRetryEngine`、`getTaskRecoveryInfo`、`performIntelligentRecovery`、`checkForTokenWaste`、`recoverVideoByTaskId`、`saveVideoTask`

工具：`detectVideoCodec`、`isCodecSupportedByProvider`、`extractVideoFrames`、`downloadJSONFile`、`videoTemplates`、`templateCategories`、`getTemplatesByCategory`、`applyVideoTemplate`、`VideoTemplate`（type）

**依赖关系**：

- `@/domain/schemas`：VideoTask类型
- `@/infrastructure/di`：依赖注入容器
- `@/infrastructure/ai-providers`：视频生成API
- `@/infrastructure/storage`：视频缓存/任务持久化

**数据流详解**：

**任务创建流程**：

```
用户/程序触发视频生成
  → useVideoTaskManager.addTask(task)
    → 检查isCreating防重入锁
    → container.videoTaskStorage.createVideoTask(task)
      → IPC: db:run → INSERT INTO video_tasks
    ← 等待持久化完成
    → useVideoTaskStore.addTask(task) 更新React状态
    → 启动轮询 checkAndStartOrStopPolling()
```

**轮询状态流程**：

```
PollingScheduler定时触发
  → 遍历allTasks中状态为pending/generating的任务
  → container.videoProvider.queryVideoStatus(taskId, options)
    → HTTP POST /api/video-status
  ← 返回status/progress/videoUrl
  → 根据返回状态更新任务：
    - pending/generating → 更新progress
    - completed → cacheVideoBlob() → 更新videoUrl → 停止轮询
    - failed → smartRetryEngine决策 → 重试或标记失败
  → container.videoTaskStorage.updateVideoTask(taskId, updates)
  → useVideoTaskStore.updateTask(taskId, updates)
```

**视频缓存流程**：

```
视频URL返回
  → cacheVideoBlob(taskId, videoUrl)
    → fetch(videoUrl) 获取Blob
    → 创建ObjectURL: URL.createObjectURL(blob)
    → container.registerObjectUrl(taskId, objectUrl) 注册内存缓存
    → container.videoCacheStorage.cacheVideo(taskId, blob) 持久化缓存
      → IPC: assets:save-buffer → 保存到本地文件系统
      → IPC: db:run → INSERT/UPDATE video_cache
  ← 返回本地缓存URL

页面卸载时：
  → revokeObjectURL(taskId)
    → URL.revokeObjectURL(objectUrl) 释放内存
    → container.revokeObjectUrl(taskId) 从注册表移除
```

**错误处理模式**：

1. **智能重试引擎**：`smartRetryEngine`根据错误类型决定重试策略。网络错误和速率限制使用指数退避重试，验证错误和认证错误不重试。重试前检查`checkForTokenWaste()`避免浪费API配额。
2. **视频验证**：`verifyVideoUrl()`在视频标记为完成前验证URL可达性，防止AI服务商返回无效URL。
3. **重复检测**：`checkForDuplicateVideos()`检测相同参数的重复任务，避免重复消耗API配额。
4. **Token浪费检测**：`checkForTokenWaste()`在重试前评估是否值得重试，考虑已重试次数、错误类型和剩余配额。

**关键实现细节**：

**TaskMachine状态机**：任务状态有6种：pending、generating、completed、failed、cancelled、retrying。合法转换定义在`VALID_TRANSITIONS`映射中。`withTransitionGuard`在开发模式下对非法转换抛出`TransitionError`，在生产模式下静默剥离status字段。

**自适应轮询引擎**：PollingScheduler根据任务状态动态调整轮询间隔。pending/generating状态使用较短间隔（2-5秒），completed/failed状态停止轮询。轮询引擎使用`requestAnimationFrame`+`setTimeout`混合调度，在页面不可见时降低频率。

**persist-before-state-update模式**：所有状态更新前先完成持久化写入。这确保即使React状态更新失败，数据库中的数据仍然一致。

**视频缓存双层架构**：视频Blob先缓存在内存（ObjectURL），再持久化到IndexedDB/文件系统。`getVideoUrlWithCache()`优先返回内存缓存，未命中时从持久化层加载。页面卸载时通过`revokeObjectURL()`释放内存缓存。

**过期策略引擎**：task-management/domain/中定义了两个策略：

- **超时策略**（TimeoutPolicy）：任务超过指定时间未完成则标记为failed
- **过期策略**（ExpirationPolicy）：已完成的任务超过保留期则自动清理

**TimestampBridge**：`task-management/infrastructure/timestamp-bridge.ts`负责ISO 8601时间戳与Unix时间戳的双向转换。AI服务商API返回ISO格式时间，而SQLite存储Unix时间戳，Bridge确保两者正确转换，处理null、NaN、Infinity等边界情况。

### 3. shot模块

**基本信息**：28个文件，5,232行代码。

**模块概述**：shot模块负责分镜系统的一致性检查、元素绑定、特征提取和镜头引用管理。它确保动画制作过程中角色和场景的视觉一致性，是质量保障的核心模块。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| consistency-check | shot/consistency-check/ | 视觉一致性检查、配置验证 |
| element-binding | shot/element-binding/ | 元素绑定、元素管理器 |
| feature-extraction | shot/feature-extraction/ | 特征锚定、特征提取 |
| reference-check | shot/reference-check/ | 引用检查（角色/场景/元素） |
| shot-generation | shot/shot-generation/ | 分镜生成、动态少样本、验证器 |
| shot-instruction | shot/shot-instruction/ | 镜头指令转换 |
| shot-reference | shot/shot-reference/ | 镜头引用引擎 |

**公共API清单**：

一致性检查：`performConsistencyCheck`、`validateFeatureAnchoringConfigFull`、`validateNoFrameBindingParams`

元素绑定：`elementManager`（实例）

特征提取：`validateReferenceImageQuality`、`buildFeatureAnchoringConfig`

引用检查：`checkCharacterReferences`、`checkSceneReferences`、`checkElementReferences`、`ReferenceInfo`（type）、`DeleteCheckResult`（type）

镜头指令：`SHOT_SIZE_OPTIONS`、`CAMERA_MOVEMENT_OPTIONS`、`CAMERA_ANGLE_OPTIONS`

引用引擎：`referenceEngine`（实例）

**依赖关系**：

- `@/domain/schemas`：ShotSystem类型
- `@/infrastructure/di`：依赖注入容器（elementManager和referenceEngine通过DI懒加载）
- `@/infrastructure/storage`：元素存储

**数据流详解**：

**一致性检查流程**：

```
用户触发一致性检查
  → performConsistencyCheck(shotConfig)
    → validateFeatureAnchoringConfigFull(config)
      → 检查特征锚定配置完整性
      → 验证每个元素的feature_anchor_json
      ← 返回 { passed: boolean, recommendation: "accept" | "adjust" }
    → validateNoFrameBindingParams(params)
      → 检查无帧绑定参数是否合法
      ← 返回 { passed: boolean, issues: string[] }
    → 综合评估一致性评分
  ← 返回 ConsistencyCheckResult
```

**元素绑定流程**：

```
用户绑定元素到分镜
  → ElementBindingPanel组件
    → container.elementManager.bindAsset(elementId, asset)
      → await import("@/modules/shot/element-binding") 懒加载
      → elementManager.bindAsset(elementId, asset)
        → container.elementStorage.updateElement(elementId, { bindings_json })
          → IPC: db:run → UPDATE elements SET bindings_json = ?
        ← 返回更新后的StoryElement
      → 通知订阅者 elementManager.subscribe() 回调
    ← 更新UI
```

**引用检查流程**：

```
用户删除角色/场景前
  → checkCharacterReferences(characterId, stories)
    → 遍历所有故事的beats
    → 检查character_ids_json是否包含该角色ID
    → 收集所有引用该角色的beat
  ← 返回 DeleteCheckResult { hasReferences, references, canDelete }

  如果hasReferences为true：
    → 提示用户确认删除
    → 用户确认后执行级联删除
```

**错误处理模式**：

1. **错误诚实原则**：一致性检查失败时返回`passed: false`，而非静默返回`passed: true`（"安慰剂"反模式）
2. **懒加载容错**：elementManager和referenceEngine通过DI的F类Token懒加载，加载失败时返回undefined而非崩溃
3. **引用检查防御性**：`checkCharacterReferences`和`checkSceneReferences`在stories为空或undefined时返回安全的默认值

**关键实现细节**：

**元素绑定系统**：`elementManager`管理角色、道具、特效等元素与分镜的绑定关系。每个元素有`type`（character/prop/effect）、`feature_anchor_json`（特征锚定配置）和`bindings_json`（绑定配置）。elementManager通过DI的F类Token懒加载，避免shot模块与story模块的循环依赖。elementManager实现`IElementManager`接口，提供10个方法：subscribe、getLibrary、createElement、bindAsset、unbindAsset、getElement、getAllElements、getElementsByType、deleteElement、updateElement。

**引用解析引擎**：`referenceEngine`解析分镜中的角色/场景引用，生成引用描述和引用视频URL。它通过DI的F类Token懒加载，使用`await import()`动态导入。referenceEngine实现`IReferenceEngine`接口，提供4个方法：`validateReference`、`getTargetShot`、`getReferenceVideoUrl`、`buildReferenceDescription`。

**动态少样本**：`shot-generation`子域的`dynamic-few-shot.ts`根据当前分镜上下文动态选择少样本示例，提升AI生成质量。选择算法考虑分镜类型、镜头运动、角色数量等因素，从预定义的示例库中匹配最相关的示例。

**shot-validator**：`shot-generation/shot-validator.ts`验证分镜参数的合法性，包括镜头类型、镜头角度、镜头运动的组合是否合理。无效组合（如"特写+航拍"）会被标记为警告。

### 4. prompt模块

**基本信息**：23个文件，4,665行代码。

**模块概述**：prompt模块负责AI提示词的生成与管理，包括角色/场景/分镜/视频提示词的分层构建、关键词常量定义和提示词优化。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| base | prompt/base/ | 关键词常量、描述构建工具 |
| character | prompt/character/ | 角色提示词生成 |
| scene | prompt/scene/ | 场景提示词生成 |
| beat-image | prompt/beat-image/ | 分镜图片提示词生成 |
| video | prompt/video/ | 视频提示词生成（专业/增强/快速/单分镜） |
| server-prompts | prompt/server-prompts/ | 服务器端提示词（首帧/尾帧/角色分析/场景分析） |
| builder | prompt/builder/ | PromptBuilder类、故事计划、快速模式 |
| presentation | prompt/presentation/ | ModelSelector组件、ConfigCheckBanner组件 |

**公共API清单**：

Base：`QUALITY_TAGS_IMAGE`、`QUALITY_TAGS_VIDEO`、`STYLE_KEYWORDS`、`SCENE_TYPE_KEYWORDS`、`MOOD_KEYWORDS`、`LIGHTING_KEYWORDS`、`CAMERA_ANGLE_KEYWORDS`、`CAMERA_MOVEMENT_KEYWORDS`、`joinParts`、`buildCharacterFullDesc`、`buildSceneAtmosphereDesc`、`buildSceneVisualDesc`

Character：`generateCharacterImagePrompt`、`generateCharacterDetailedPromptInstruction`、`generateSimpleCharacterImagePrompt`

Scene：`generateSceneImagePrompt`、`generateSimpleSceneImagePrompt`、`generateScenePromptOptimization`

Beat-image：`generateBeatImagePrompt`、`generateSimpleBeatImagePrompt`

Video：`generateProfessionalVideoPrompt`、`generateEnhancedVideoPrompt`、`generateQuickVideoPrompt`、`generateSingleBeatPrompt`

Server-prompts：`generateFirstFramePrompt`、`generateLastFramePrompt`、`generateCharacterAnalysisPrompt`、`generateSceneAnalysisPrompt`

Builder：`promptBuilder`、`generateStoryPlanPrompt`、`generateQuickModeVideoPrompt`、`AVAILABLE_STYLES`、`DURATION_OPTIONS`、`RESOLUTION_OPTIONS`、`getDurationOptionsForModel`、`getResolutionOptionsForModel`、`getStyleOptionsForModel`

Presentation：`ModelSelector`、`useModelSelection`、`ConfigCheckBanner`

**依赖关系**：

```
base（底层）
  ├─ character
  ├─ scene
  ├─ video
  └─ builder

server-prompts（独立）
beat-image（独立）
```

**数据流详解**：

**角色图片提示词生成流程**：

```
用户点击"生成角色图片"
  → useCharacterImage Hook
    → generateCharacterImagePrompt(character)
      → buildCharacterFullDesc(character)
        → 拼接角色名称、性别、年龄、风格
        → 从appearance JSON提取外观描述
        → 添加QUALITY_TAGS_IMAGE质量标签
      ← 完整角色描述字符串
    → 如果useDetailedPrompt为true：
      → generateCharacterDetailedPromptInstruction(character)
      → container.textProvider.generateText(instruction)
      ← 使用AI优化后的提示词
    ← 最终提示词
  → container.imageProvider.generateImage(prompt, "character", options)
```

**视频提示词生成流程**：

```
用户点击"生成视频"
  → useVideoGenerator Hook
    → determineVideoGenerationMode(beat)
    → 根据模式选择提示词生成器：
      - "professional" → generateProfessionalVideoPrompt(beat, characters, scenes)
      - "enhanced" → generateEnhancedVideoPrompt(beat, characters, scenes)
      - "quick" → generateQuickVideoPrompt(beat)
    ← 视频提示词
  → container.videoProvider.generateVideo(prompt, options)
```

**错误处理模式**：

1. **提示词降级**：当详细提示词生成失败时，回退到简单提示词（`generateSimpleCharacterImagePrompt`/`generateSimpleSceneImagePrompt`）
2. **关键词常量集中管理**：所有关键词定义在base子域，避免硬编码和不一致
3. **模型能力适配**：`ModelSelector`根据选中模型动态调整可用参数，避免发送不支持的参数

**关键实现细节**：

**分层提示词构建**：提示词按层级构建——base层提供关键词常量和描述工具函数，character/scene/video层基于base层构建特定类型的提示词，builder层提供高级编排能力。这种分层确保关键词定义集中管理，避免重复和不一致。

**PromptBuilder类**：builder子域的`prompt-builder.ts`提供`PromptBuilder`类，支持链式调用构建复杂提示词：

```typescript
const prompt = promptBuilder
  .withCharacter(character)
  .withScene(scene)
  .withShotInstruction(shotType, cameraAngle, cameraMovement)
  .withQualityTags()
  .build();
```

**服务器端提示词**：server-prompts子域生成在主进程执行的提示词，包括首帧提示词（`generateFirstFramePrompt`）、尾帧提示词（`generateLastFramePrompt`）、角色分析提示词（`generateCharacterAnalysisPrompt`）和场景分析提示词（`generateSceneAnalysisPrompt`）。这些提示词在主进程的api-server.ts路由中使用。

### 5. asset模块

**基本信息**：14个文件，3,030行代码。

**模块概述**：asset模块负责资产库管理，包括媒体资产管理、角色/场景/分镜资源的导入导出、项目备份与恢复。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| asset-library | asset/asset-library/ | 资产库服务：角色、场景、分镜资源、收藏集CRUD |
| media-assets | asset/media-assets/ | 媒体资产管理 |
| import-export | asset/import-export/ | 项目数据导入导出 |
| hooks | asset/hooks/ | React Query Hooks封装 |
| presentation | asset/presentation/ | UI组件 |

**公共API清单**：

资产库：`characterService`、`sceneService`、`storyboardAssetService`、`collectionService`、`assetExportService`

媒体资产：`mediaAssetService`

导入导出：`MergeStrategy`（type）

Hooks：`useMediaAssets`、`useCreateMediaAsset`、`useDeleteMediaAsset`、`useExportData`、`useDownloadExport`、`useImportData`、`useImportFromFile`、`useProjectExport`、`ProjectData`（type）、`ExportResult`（type）

展示：`BatchOperations`、`MediaExporter`、`ProjectExportImport`

**依赖关系**：

- `@/domain/schemas`：MediaAsset、Character、Scene等类型
- `@/infrastructure/di`：依赖注入容器
- `@/infrastructure/storage`：数据持久化

**数据流详解**：

**ASA格式导出流程**：

```
用户点击"导出项目"
  → useProjectExport Hook
    → assetExportService.exportToASA(projectData)
      → 收集所有角色数据：container.characterStorage.getCharacters()
      → 收集所有场景数据：container.sceneStorage.getScenes()
      → 收集所有故事数据：container.storyStorage.getStories()
      → 收集所有视频任务：container.videoTaskStorage.getVideoTasks()
      → 序列化为ASA JSON格式
      → 如果包含媒体文件：
        → 读取本地图片文件（IPC: assets:read-file-base64）
        → 将Base64数据嵌入JSON
      ← ASA格式数据
    → useDownloadExport(asaData)
      → 创建Blob并触发浏览器下载
```

**项目导入流程**：

```
用户选择ASA文件
  → useImportFromFile Hook
    → 读取文件内容并解析JSON
    → 验证ASA格式版本兼容性
    → 根据MergeStrategy处理冲突：
      - "overwrite"：覆盖现有数据
      - "skip"：跳过已存在的数据
      - "merge"：合并数据（保留双方）
    → container.importExportStorage.importData(parsedData, strategy)
      → IPC: db:transaction → 批量INSERT OR REPLACE
    ← 导入结果（成功/失败/跳过计数）
  → 刷新UI数据
```

**错误处理模式**：

1. **导入冲突处理**：`MergeStrategy`枚举定义三种冲突处理策略，用户在导入前选择
2. **批量操作容错**：单个项目生成失败不影响其他项目，错误信息收集后统一展示
3. **导出数据验证**：导出前验证数据完整性，缺失字段使用默认值填充

### 6. persistence模块

**基本信息**：5个文件，519行代码。

**模块概述**：persistence模块负责自动保存和持久化守护，确保用户数据不会因意外关闭而丢失。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| hooks | persistence/hooks/ | useAutoSave、usePersistenceGuard |
| services | persistence/services/ | transactionalDelete（级联删除+文件清理） |

**公共API清单**：

- `useAutoSave`：自动保存Hook，带重试限制（3次）和最小间隔（1秒）
- `usePersistenceGuard`：持久化守护，防止数据丢失
- `deleteCharacterWithRefs`：删除角色及其关联数据（级联删除+本地文件清理）
- `deleteSceneWithRefs`：删除场景及其关联数据（级联删除+本地文件清理）

**依赖关系**：

- `@/infrastructure/di`：获取storage实例、safeQuery/safeRun/safeTransaction
- `@/shared/error-logger`：日志记录
- `@/domain/types/result`：Result类型

**数据流详解**：

**级联删除流程**：

```
用户删除角色
  → deleteCharacterWithRefs(characterId)
    → container.safeTransaction([
        { sql: "DELETE FROM story_characters WHERE character_id = ?", params: [characterId] },
        { sql: "DELETE FROM character_outfits WHERE character_id = ?", params: [characterId] },
        { sql: "DELETE FROM collection_assets WHERE asset_id = ? AND asset_type = 'character'", params: [characterId] },
        { sql: "DELETE FROM video_tasks WHERE beat_id IN (SELECT id FROM story_beats WHERE character_ids_json LIKE ?)", params: [`%${characterId}%`] },
        { sql: "DELETE FROM characters WHERE id = ?", params: [characterId] },
      ])
      → IPC: db:transaction → 原子执行所有DELETE
    ← 等待事务完成
    → 清理本地图片文件：
      → IPC: assets:delete-file → 删除ref_image_path
      → IPC: assets:delete-file → 删除outfit图片
    ← 返回Result<void>
```

**错误处理模式**：

1. **重试限制**：自动保存最多重试3次，超过限制后停止，避免无限重试消耗资源
2. **事务性保证**：级联删除在数据库事务中执行，任何步骤失败则整体回滚
3. **组件卸载保护**：`cancelledRef`防止组件卸载后继续保存
4. **文件清理容错**：本地文件删除失败仅记录警告，不影响数据库操作结果

### 7. character模块

**基本信息**：12个文件，1,394行代码。

**模块概述**：character模块负责角色管理，包括角色CRUD、服装管理和角色图片生成。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| services | character/services/ | 角色CRUD服务、Result模式 |
| hooks | character/hooks/ | React Query Hooks封装 |
| presentation | character/presentation/ | CharacterListItem组件 |

**公共API清单**：

服务：`characterService`（getAll、getById、create、update、delete、count）

常量：`defaultCharacter`、`personalitySuggestions`、`styleSuggestions`、`genderSuggestions`、`heightSuggestions`、`buildSuggestions`

Hooks：`useCharacters`、`useCharacter`、`useCharacterCount`、`useCreateCharacter`、`useUpdateCharacter`、`useDeleteCharacter`、`useCharacterCRUD`、`useCharacterImage`、`useOutfitManagement`

展示：`CharacterListItem`

**依赖关系**：

- `@/domain/schemas`：Character、CreateCharacterInput、UpdateCharacterInput类型
- `@/domain/types`：Result、fromAsyncThrowable、NotFoundError、ValidationError
- `@/infrastructure/di`：依赖注入容器
- `@/shared/event-types`：领域事件

**数据流详解**：

**角色图片生成流程**：

```
用户点击"生成角色图片"
  → useCharacterImage Hook
    → generateCharacterImagePrompt(character)
      → 构建角色描述提示词
    → container.imageProvider.generateImage(prompt, "character", { size: "1024x1024" })
      → HTTP POST /api/character/generate-image
    ← 返回imageUrl
    → 保存图片到本地：
      → IPC: assets:save-image → 保存到%APPDATA%/ai-animation-studio/assets/
    → container.characterStorage.updateCharacter(id, { ref_image_path: localPath })
      → IPC: db:run → UPDATE characters SET ref_image_path = ?
    ← 更新UI显示角色图片
```

**服装管理流程**：

```
用户添加/编辑/删除服装
  → useOutfitManagement Hook
    → addOutfit(characterId, outfit)
      → container.characterStorage.saveOutfitsForCharacter(characterId, outfits)
        → IPC: db:transaction → DELETE + INSERT character_outfits
    → 生成服装图片：
      → container.synthesizeOutfit(characterId, outfitConfig)
        → HTTP POST /api/character/generate-image (with outfit params)
      → container.updateOutfitImage(outfitId, imageUrl, localImagePath)
        → IPC: db:run → UPDATE character_outfits SET image_url = ?, local_image_path = ?
```

**错误处理模式**：

1. **Result模式CRUD**：`characterService`的所有方法返回`Result<T>`类型。错误类型使用语义化的`NotFoundError`和`ValidationError`。
2. **图片生成降级**：AI图片生成失败时，保留角色记录但ref_image_path为空，用户可稍后重试
3. **服装操作原子性**：服装的增删改通过`saveOutfitsForCharacter`一次性写入，避免部分更新

### 8. scene模块

**基本信息**：11个文件，1,001行代码。

**模块概述**：scene模块负责场景管理，包括场景CRUD和场景图片生成。与character模块结构对称。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| services | scene/services/ | 场景CRUD服务、Result模式 |
| hooks | scene/hooks/ | React Query Hooks封装 |
| presentation | scene/presentation/ | SceneListItem组件 |

**公共API清单**：

服务：`sceneService`（getAll、getById、create、update、delete、count）

常量：`defaultScene`、`typeSuggestions`、`timeSuggestions`、`weatherSuggestions`、`moodSuggestions`、`elementSuggestions`、`colorSuggestions`、`angleSuggestions`、`distanceSuggestions`、`movementSuggestions`

Hooks：`useScenes`、`useScene`、`useSceneCount`、`useCreateScene`、`useUpdateScene`、`useDeleteScene`、`useSceneCRUD`、`useSceneImage`

展示：`SceneListItem`

**依赖关系**：

- `@/domain/schemas`：Scene、CreateSceneInput、UpdateSceneInput类型
- `@/domain/types`：Result、fromAsyncThrowable、NotFoundError、ValidationError
- `@/infrastructure/di`：依赖注入容器
- `@/shared/event-types`：领域事件

**关键实现细节**：

**Dirty状态管理**：`useSceneCRUD`中`markClean("scenes")`必须在保存成功且`setCurrentScene`之后调用。保存失败时dirty状态保留，确保用户收到未保存修改警告。

**场景提示词增强**：场景图片生成支持`useDetailedPrompt`选项。启用时，先生成场景描述优化指令，通过`container.textProvider.generateText()`获取AI优化后的提示词，再用于图片生成。`generateScenePromptOptimization()`构建优化指令。

### 9. sync模块

**基本信息**：13个文件，2,544行代码。

**模块概述**：sync模块负责多设备数据同步，包括变更追踪、向量时钟、冲突检测与解决。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| engine | sync/engine/ | 同步引擎核心、变更追踪、向量时钟、冲突解决 |
| presentation | sync/presentation/ | 冲突解决面板、同步设置、状态指示器 |

**公共API清单**：

引擎：`initSyncEngine`、`performSync`、`getSyncStatus`、`updateSyncConfig`、`getSyncConfig`、`setConflictCallback`、`recordChange`、`SyncEntityType`（type）、`ChangeOperation`（type）、`SyncChangeLogEntry`（type）、`VectorClock`（type）、`SyncStatus`（type）、`compareVectorClocks`、`mergeVectorClocks`、`createVectorClock`、`incrementVectorClock`、`isVectorClockConflict`、`DEFAULT_SYNC_CONFIG`、`SyncConflict`（type）、`ConflictStrategy`（type）、`SyncConfig`（type）、`SyncStatusInfo`（type）、`SyncPushResult`（type）、`SyncPullResult`（type）、`RemoteChange`（type）

展示：`SyncConflictPanel`、`SyncSettingsPanel`、`SyncStatusIndicator`

**依赖关系**：

- `@/domain/types/sync`：同步核心类型
- `@/infrastructure/storage`：数据持久化
- `@/infrastructure/di`：依赖注入容器

**数据流详解**：

**变更追踪流程**：

```
数据变更发生（如更新角色）
  → container.syncStorage.registerChangeTracker(tracker)
    → tracker(entityType, entityId, operation)
      → recordChange({ entityType, entityId, operation, vectorClock, data })
        → incrementVectorClock(deviceClock, deviceId)
        → container.syncStorage.safeRun(
            "INSERT INTO sync_changelog (entity_type, entity_id, operation, vector_clock, data, timestamp, synced, device_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
            [entityType, entityId, operation, JSON.stringify(vectorClock), JSON.stringify(data), timestamp, deviceId]
          )
```

**同步推送流程**：

```
用户触发同步 / 定时同步
  → performSync()
    → 读取未同步的变更：
      → container.syncStorage.safeQuery("SELECT * FROM sync_changelog WHERE synced = 0")
    → 按向量时钟排序变更
    → HTTP POST /api/sync/push { changes }
    ← 返回 { conflicts, appliedCount }
    → 如果有冲突：
      → isVectorClockConflict(localClock, remoteClock)
      → setConflictCallback通知UI
      → SyncConflictPanel展示冲突
      → 用户选择解决策略
      → 解决后备份到sync_conflict_backup表
    → 标记已同步：
      → container.syncStorage.safeRun("UPDATE sync_changelog SET synced = 1 WHERE ...")
```

**错误处理模式**：

1. **向量时钟冲突检测**：`isVectorClockConflict()`检测并发修改，确保不丢失数据
2. **冲突解决策略**：支持本地优先、远程优先、手动合并三种策略
3. **SSRF防护**：同步服务器URL通过SSRF Guard验证，防止内网攻击
4. **连接测试**：`handleSyncTest`在保存配置前测试连接可用性

### 10. integrity模块

**基本信息**：4个文件，467行代码。

**模块概述**：integrity模块负责SQL注入防护和Schema注册与验证，是数据安全的基础保障层。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| services | integrity/services/ | sqlSanitizer、schemaRegistry |
| hooks | integrity/hooks/ | useStableDeps |

**公共API清单**：

- `ColumnKind`（type）：列类型枚举
- `sanitizeIdentifier`：标识符安全化
- `sanitizeTable`：表名安全化
- `buildSafeInsert`：构建安全的INSERT语句
- `buildSafeUpdate`：构建安全的UPDATE语句
- `buildSafeDelete`：构建安全的DELETE语句
- `registerColumn`：注册单列定义
- `registerColumns`：批量注册列定义
- `getColumnKind`：获取列类型
- `getAllRegisteredColumns`：获取所有已注册列
- `isColumnRegistered`：检查列是否已注册

**依赖关系**：

- `@/shared/error-logger`：日志记录

**关键实现细节**：

**SQL注入防护**：`sanitizeIdentifier()`和`sanitizeTable()`对SQL标识符进行白名单校验，只允许字母、数字和下划线。`buildSafeUpdate()`和`buildSafeDelete()`只允许已注册的列名出现在SQL语句中，防止通过列名注入。

**Schema注册**：`registerColumn()`和`registerColumns()`注册列定义到Schema Registry。每个列定义包含列名和类型（ColumnKind）。重复注册时`console.warn`提示但不阻止，兼容热重载场景。SQL关键字（SELECT、INSERT、UPDATE、DELETE、WHERE等）不允许作为列名。

### 11. feedback模块

**基本信息**：5个文件，206行代码。

**模块概述**：feedback模块负责用户操作反馈、脏数据追踪和撤销操作。当前无外部消费者（0 consumers），计划在v2.0合并到`@/shared/hooks/`。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| hooks | feedback/hooks/ | useDirtyTracker、useUndoAction、useUndoHistory |
| presentation | feedback/presentation/ | DirtyIndicator组件 |

**公共API清单**：

- `useDirtyTracker`：追踪表单/数据脏状态，支持safeDeepEqual比较
- `useUndoAction`：撤销操作栈，支持多步撤销
- `useUndoHistory`：撤销历史Hook
- `DirtyIndicator`：脏状态指示器UI组件（aria-live无障碍）

**关键实现细节**：

**脏状态追踪**：`useDirtyTracker`使用`safeDeepEqual`比较当前值与初始值，避免引用比较导致的误报。支持嵌套对象的深度比较。

**撤销栈**：`useUndoAction`维护撤销操作栈，最大深度限制防止内存泄漏。每次操作推入栈顶，撤销时弹出并执行逆操作。

**无障碍支持**：`DirtyIndicator`组件使用`aria-live`属性，确保屏幕阅读器能感知脏状态变化。

### 12. security模块

**基本信息**：2个文件，101行代码。

**模块概述**：security模块负责API Key安全存储和敏感配置管理。当前无外部消费者（0 consumers），计划在v2.0合并到`@/shared/hooks/`。

**子域划分**：

| 子域 | 路径 | 职责 |
|------|------|------|
| hooks | security/hooks/ | useSecureConfig |

**公共API清单**：

- `useSecureConfig`：安全配置管理Hook

**依赖关系**：

- `electronAPI`（IPC）：secure-config:save/load/resolve/delete/has通道

**关键实现细节**：

**安全存储策略**：API Key通过electron-store加密存储，前端仅通过IPC访问。非Electron环境拒绝存储API Key，不回退到localStorage。`secure-config:resolve`通道需要SECURE权限级别，仅用于实际需要使用API Key的场景（如发起AI请求）。

### 模块交互地图

模块间的依赖关系如下：

```
story ──────→ prompt（提示词生成）
  │──────────→ shot（elementManager、referenceEngine）
  │──────────→ character（角色引用解析）
  │──────────→ scene（场景引用解析）
  │──────────→ video（视频任务管理）
  │──────────→ persistence（自动保存）
  │
video ──────→ story（视频URL更新）
  │
shot ───────→ story（分镜数据）
  │
asset ──────→ character（角色服务）
  │──────────→ scene（场景服务）
  │
persistence → character（级联删除）
  │──────────→ scene（级联删除）
  │
sync ───────→ infrastructure/storage（变更追踪）
  │
integrity ──→ shared/error-logger（日志）
  │
feedback ───→ domain/types（AppError）
  │
security ───→ electronAPI（IPC）
```

所有模块共同依赖：

- `@/domain/types`：Result类型、错误类型
- `@/domain/schemas`：业务Schema
- `@/infrastructure/di`：依赖注入容器
- `@/shared/*`：跨切面工具

---

## 第三部分：基础设施层、Electron主进程与构建部署

### 1. 基础设施层详解

#### 1.1 DI Container

DI容器是基础设施层的核心组件，实现了依赖反转和模块解耦。

**ModuleRegistry**：注册中心，维护Token到注册信息的映射。核心方法：

- `register(token, lifecycle)`：注册Token，支持singleton和transient生命周期（当前全部使用singleton）
- `resolve(token)`：解析Token，singleton首次解析时调用工厂函数并缓存结果，后续直接返回缓存
- `override(token, factory)`：覆盖Token的工厂函数，清除缓存，用于测试Mock
- `resetSingletons()`：清除所有singleton缓存，用于测试间重置
- `has(tokenId)`：检查Token是否已注册

**循环依赖检测**：Registry在解析过程中维护`resolutionStack`集合。解析Token时将其加入栈，解析完成后移除。如果发现Token已在栈中，抛出`Circular dependency detected`错误，并打印完整的依赖链。

**Proxy容器**：`container`对象通过`Proxy`实现，拦截属性访问自动调用`registry.resolve()`。访问未注册的Token抛出明确的错误信息。Proxy还过滤了`__proto__`、`then`、`toJSON`等特殊属性，避免意外触发解析。

**overrideToken测试支持**：`overrideToken(token, factory)`允许测试替换任何Token的实现。工厂函数接收`ModuleContainer`参数，可以解析其他依赖。典型用法：

```typescript
overrideToken(tokens.videoProvider, () => mockVideoProvider);
overrideToken(tokens.storyStorage, () => mockStoryStorage);
```

#### 1.2 Storage Layer

Storage层提供统一的数据持久化接口，所有操作通过参数化SQL防止注入。

**sqlite-core**：核心SQL执行层，提供4个安全函数：

- `safeQuery(sql, params?)`：安全查询，返回结果数组
- `safeRun(sql, params?)`：安全执行，返回变更信息
- `safeTransaction(fn)`：安全事务，在`db.transaction()`中执行回调
- `withRetry(fn, maxRetries?)`：重试包装，处理SQLITE_BUSY错误

**Storage实现**：每个业务实体有对应的Storage模块，实现Port接口：

| Storage | 实现的Port | 关键方法 |
|---------|------------|----------|
| video-tasks | IVideoTaskStorage | getVideoTasks、createVideoTask、updateVideoTask、deleteVideoTask、bulkPutVideoTasks |
| characters | ICharacterStorage | getCharacters、createCharacter、updateCharacter、deleteCharacter、getOutfitsForCharacter |
| scenes | ISceneStorage | getScenes、createScene、updateScene、deleteScene |
| stories | IStoryStorage | getStories、createStory、updateStory、deleteStory、getStoryByBeatId |
| elements | - | getElements、createElement、updateElement、deleteElement |
| video-cache | - | cacheVideo、getVideoByTaskId、deleteVideo |
| image-cache | - | cacheImage、getImageByUrl、deleteImage |
| versions | - | saveVersion、getVersions、deleteVersion |
| collections | - | getCollections、createCollection、deleteCollection |
| templates | - | getTemplates、createTemplate、deleteTemplate |
| auto-save | - | saveAutoSave、getAutoSave |
| error-logs | - | logError、getErrorLogs |
| sessions | - | setSession、getSession |
| import-export | - | exportData、importData |

**IVideoTaskStorage完整方法签名**：

```typescript
interface IVideoTaskStorage {
  getVideoTasks(): Promise<VideoTask[]>;
  getVideoTaskById(taskId: string): Promise<VideoTask | null>;
  getVideoTasksByStory(storyId: string): Promise<VideoTask[]>;
  getVideoTasksByStatus(status: string): Promise<VideoTask[]>;
  getPendingVideoTasks(): Promise<VideoTask[]>;
  createVideoTask(task: Partial<VideoTask> & { taskId: string }): Promise<void>;
  updateVideoTask(taskId: string, updates: Partial<VideoTask>): Promise<void>;
  deleteVideoTask(taskId: string): Promise<void>;
  deleteVideoTasksByStatus(statuses: string[]): Promise<void>;
  deleteVideoTasksByBeatId(beatId: string): Promise<void>;
  deleteVideoTasksByStoryId(storyId: string): Promise<void>;
  deleteExpiredVideoTasks(): Promise<number>;
  clearVideoTasks(): Promise<void>;
  bulkPutVideoTasks(tasks: Partial<VideoTask>[]): Promise<void>;
}
```

**ICharacterStorage完整方法签名**：

```typescript
interface ICharacterStorage {
  getCharacters(): Promise<Character[]>;
  getCharacterById(id: string): Promise<Character | null>;
  createCharacter(character: Partial<Character>): Promise<void>;
  updateCharacter(id: string, updates: Partial<Character>): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  incrementCharacterUseCount(id: string): Promise<void>;
  getOutfitsForCharacter(characterId: string): Promise<CharacterOutfit[]>;
  saveOutfitsForCharacter(characterId: string, outfits: CharacterOutfit[]): Promise<void>;
  updateOutfitImage(outfitId: string, imageUrl: string, localImagePath?: string): Promise<void>;
}
```

**JSON Schema解析**：`video-tasks/json-schemas.ts`提供`parseConfig()`、`parseProvider()`、`parseMediaRefs()`、`parseTracking()`等安全解析函数，将JSON字符串解析为类型化的TypeScript对象。解析失败时返回默认值而非抛出异常。

**Beat Transformer**：`stories/beat-transformer.ts`负责数据库记录与领域对象之间的转换，包括JSON列的序列化/反序列化和默认值填充。

#### 1.3 Network Layer

Network层提供弹性的HTTP请求能力，包含拦截器链、断路器和重试机制。

**API Client**：`infrastructure/api/client.ts`提供统一的HTTP客户端，支持：

- 请求/响应拦截器链
- 自动附加`ELECTRON_APP_HEADERS`
- JSON请求体序列化和响应体解析
- 错误分类和重试决策

**拦截器链**：

| 拦截器 | 职责 |
|--------|------|
| logging.interceptor | 请求/响应日志记录 |
| cache.interceptor | 响应缓存（GET请求） |
| retry.interceptor | 自动重试（网络错误、5xx、429） |
| circuit-breaker.interceptor | 断路器保护 |
| lifecycle.interceptor | 请求生命周期管理（取消、超时） |

**Resilient Fetch**：`resilient-fetch.ts`封装fetch API，提供：

- 自动重试：指数退避，最大3次重试
- 断路器：连续5次失败后打开断路器，30秒后半开尝试
- 超时控制：默认30秒超时
- 请求取消：AbortController支持

**Circuit Breaker**：`circuit-breaker.ts`实现断路器模式：

- CLOSED状态：正常转发请求
- OPEN状态：直接拒绝请求，返回错误
- HALF_OPEN状态：允许一个请求通过，成功则转为CLOSED，失败则转为OPEN

**Download Manager**：`download-manager.ts`管理文件下载，支持：

- 进度回调
- 断点续传
- 并发控制

**Network Monitor**：`network-monitor.ts`监控网络状态变化，发布`network:online`/`network:offline`事件。

#### 1.4 AI Providers

AI Providers层封装了所有AI服务的调用，提供统一的接口给业务模块使用。

**Video Provider**（5个方法）：

| 方法 | 签名 | 用途 | 返回 |
|------|------|------|------|
| generateVideo | `generateVideo(prompt: string, options?: { firstFrameUrl?, lastFrameUrl?, characterRef?, sceneRef?, duration?, referenceVideo?, providerId?, modelId?, format? })` | 生成视频 | `ApiResponse<VideoGenerationResult>` |
| queryVideoStatus | `queryVideoStatus(taskId: string, options?: { providerId?, modelId?, format? })` | 查询视频状态 | `ApiResponse<{ status, videoUrl?, progress?, message? }>` |
| generateKeyframe | `generateKeyframe(params: { characterRef?, sceneRef?, prevKeyframe?, shotRequirement?, content?, providerId?, modelId?, format? })` | 生成关键帧 | `ApiResponse<{ imageUrl, source?, prompt? }>` |
| generateFramePair | `generateFramePair(params: { keyframeUrl, keyframePrompt?, characterRef?, sceneRef?, prevLastFrameUrl?, actionDescription?, duration?, providerId?, modelId?, format? })` | 生成帧对 | `ApiResponse<{ firstFrame, lastFrame, generatedAt }>` |
| generateVideoWithFrames | `generateVideoWithFrames(params: { prompt, firstFrameUrl?, lastFrameUrl?, characterRef?, sceneRef?, duration?, providerId?, modelId?, format?, referenceVideo? })` | 基于帧对生成视频 | `ApiResponse<VideoGenerationResult>` |

**Image Provider**（2个方法）：

| 方法 | 签名 | 用途 | 返回 |
|------|------|------|------|
| generateImage | `generateImage(prompt: string, type?: string, options?: { size?, providerId?, modelId?, purpose? })` | 生成图片 | `ApiResponse<ImageGenerationResult>` |
| analyzeImage | `analyzeImage(imageUrl: string, type?: "character" \| "scene", prompt?: string, options?: { providerId?, modelId? })` | 分析图片 | `ApiResponse<{ analysis, analyzed? }>` |

**Text Provider**（1个方法）：

| 方法 | 签名 | 用途 | 返回 |
|------|------|------|------|
| generateText | `generateText(prompt: string, options?: { maxTokens?, temperature?, providerId?, modelId? })` | 生成文本 | `ApiResponse<{ text }>` |

**File Uploader**（1个方法）：

| 方法 | 签名 | 用途 | 返回 |
|------|------|------|------|
| uploadFile | `uploadFile(file: File)` | 上传文件 | `{ success, data: { url } }` 或 `{ success: false, error }` |

**Outfit Synthesis**：`outfit-synthesis.ts`提供服装合成能力，`synthesizeOutfit()`和`batchSynthesizeOutfits()`基于角色描述和服装配置生成服装图片。

**Model Capabilities**：`model-capabilities.ts`提供模型能力查询：

- `resolveImageSize(size, providerId?)`：解析图片尺寸（适配不同服务商的尺寸要求）
- `getModelParameterProfile(providerId, modelId)`：获取模型参数配置（最大时长、支持编解码器等）

**API Config**：`api-config/`子目录管理API配置的完整生命周期：

- `detect.ts`：自动检测API配置类型
- `init.ts`：初始化配置、检查配置状态
- `migrate.ts`：配置迁移
- `storage.ts`：配置持久化
- `server.ts`：服务端配置管理
- `server-key.ts`：服务端密钥管理
- `templates.ts`：配置模板

**API Cache**：`api-cache.ts`缓存AI请求结果，避免重复调用。缓存键由请求参数哈希生成，支持TTL过期。

### 2. Electron主进程详解

#### 2.1 应用生命周期

主进程有三个入口文件：

**main.ts**（生产环境）：

- 设置应用名称为`ai-animation-studio`
- 修正userData路径（Electron默认使用"electron"作为目录名）
- 请求单实例锁，防止多开
- 初始化日志传输：`ConsoleTransport(minLevel: "info")` + `FileTransport(minLevel: "info", filename: "app")`
- 创建`LifecycleManager`管理应用状态
- 注册IPC Handler：setupApiHandlers、setupAssetHandlers、setupDatabaseHandlers、registerExportHandlers、registerSecureConfigHandlers
- 配置自动更新（electron-updater）
- `app.whenReady()`后创建窗口

**main-dev.ts**（开发环境）：

- 日志级别为debug
- 日志文件名为"dev"
- 自动打开DevTools
- 其他逻辑与main.ts相同

**main-common.ts**（共享逻辑）：

- `createWindow()`：创建BrowserWindow，配置webPreferences（nodeIntegration: false, contextIsolation: true, preload）
- `startStaticServer()`：启动静态文件服务器，提供Next.js导出的HTML/JS/CSS
- `setupApiHandlers()`：注册IPC Handler
- `waitForServer()`：等待服务器就绪（最多30次重试，每次500ms）
- 导航安全：`will-navigate`事件限制只允许localhost和file协议
- 窗口打开拦截：`setWindowOpenHandler`拒绝新窗口打开，外部URL通过`shell.openExternal`在系统浏览器中打开

#### 2.2 崩溃恢复

**LifecycleManager**管理应用的状态转换：

状态枚举：IDLE → STARTING → RUNNING → CLOSING → CLOSED，以及CRASHED状态。

**渲染进程崩溃**：

1. `render-process-gone`事件触发
2. LifecycleManager将状态转为CRASHED
3. `CrashRecovery.attemptRecovery()`在1秒后自动重建窗口
4. 窗口重建成功后状态转为RUNNING
5. `window-all-closed`事件检查`isRendererCrashed`标志，如果是崩溃导致的窗口关闭则不退出应用

**GPU进程崩溃**：

1. `child-process-gone`事件中`details.type === "GPU"`触发
2. 执行`webContents.reload()`重新加载页面
3. 其他子进程退出仅记录warn级别日志

**异常处理**：

- `uncaughtException`：记录error日志，通过`webContents.send("fatal-error")`通知渲染进程，不退出应用
- `unhandledRejection`：同上处理，记录error日志和堆栈信息

#### 2.3 优雅关闭

关闭序列由`LifecycleManager.shutdown()`协调：

1. **标记关闭中**：状态转为CLOSING，设置`cleanupInProgress`标志防止重复关闭
2. **取消恢复**：`crashRecovery.cancelRecovery()`取消任何进行中的崩溃恢复
3. **执行清理**：`performCleanup({ mainWindow, reason })`
   - 销毁主窗口
   - 关闭静态文件服务器：先`destroy()`所有tracked connections，再`server.close()`
4. **停止API Server**：`stopApiServer()`
   - `destroy()`所有tracked API connections
   - `server.close()`关闭HTTP服务器
5. **关闭数据库**：`closeDatabase()`关闭SQLite连接
6. **退出应用**：`app.quit()`

连接追踪机制：静态服务器和API Server都维护`activeConnections: Set<net.Socket>`。服务器在`connection`事件中将socket加入集合，socket的`close`事件中移除。关闭时先`destroy()`所有连接再`server.close()`，防止keep-alive连接阻塞进程退出。

#### 2.4 IPC Handlers

**database.ts**（12个通道）：

| 通道 | 权限 | 功能 |
|------|------|------|
| db:query | READONLY | 执行SELECT查询 |
| db:get | READONLY | 执行SELECT获取单行 |
| db:stats | READONLY | 获取表统计信息 |
| db:type | READONLY | 获取列类型信息 |
| db:run | READWRITE | 执行INSERT/UPDATE/DELETE |
| db:batch-insert | READWRITE | 批量插入 |
| db:init | READWRITE | 初始化数据库 |
| db:save | READWRITE | 保存数据 |
| db:transaction | DANGEROUS | 执行事务 |
| db:migrate | DANGEROUS | 执行迁移 |
| db:vacuum | DANGEROUS | 执行VACUUM |
| db:close | SYSTEM | 关闭数据库连接 |

**config.ts**：

- `config:get`：获取配置值（支持点号分隔的嵌套key）
- `config:set`：设置配置值（验证key白名单和value类型/大小）

**secure-config.ts**：

- `secure-config:save`：加密保存API Key
- `secure-config:load`：加载加密的API Key
- `secure-config:resolve`：解密API Key（SECURE权限）
- `secure-config:delete`：删除API Key
- `secure-config:has`：检查API Key是否存在

**sync.ts**：

- `sync/config`：获取/设置同步配置
- `sync/test`：测试同步连接
- `sync/proxy`：同步代理请求

**assets.ts**：

- `assets:save-image`：保存图片到本地
- `assets:save-buffer`：保存Buffer到本地
- `assets:read-file-base64`：读取文件为Base64
- `assets:get-dir`：获取资产目录路径
- `assets:file-exists`：检查文件是否存在
- `assets:copy-file`：复制文件
- `assets:delete-file`：删除文件（DANGEROUS权限）

**export.ts**：

- `export:data`：导出数据

**其他IPC通道**：

| 通道 | 权限 | 功能 |
|------|------|------|
| fs:read-file | READONLY | 读取文件 |
| fs:write-file | READWRITE | 写入文件 |
| fs:get-file-info | READONLY | 获取文件信息 |
| fs:get-disk-space | READONLY | 获取磁盘空间 |
| cache:get-cache-directory | READONLY | 获取缓存目录 |
| image:normalize | READWRITE | 图片标准化 |
| image:to-base64 | READONLY | 图片转Base64 |
| shell:open-external | SYSTEM | 打开外部链接 |
| dialog:open-file | SYSTEM | 打开文件对话框 |
| dialog:save-file | SYSTEM | 保存文件对话框 |

#### 2.5 安全机制

**SSRF Guard**：`security/ssrf-guard/ssrf-guard.ts`过滤所有出站HTTP请求，阻止访问私有IP地址：

- IPv4私有地址：10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、127.0.0.0/8、169.254.0.0/16
- IPv6链路本地：通过首hextet位运算检测`(value & 0xffc0) === 0xfe80`
- 特殊主机名：localhost、0.0.0.0等

**Key Storage**：`security/key-storage/`采用策略模式管理API Key加密存储：

- `safe-storage.strategy.ts`：使用Electron原生`safeStorage`API加密（优先策略）
- `plaintext-fallback.strategy.ts`：明文回退策略（Linux无keychain时使用）
- `key-storage.ts`：策略选择器，根据平台能力自动选择加密策略

**配置验证**：`main-common.ts`中的`validateConfigKey()`和`validateConfigValue()`验证配置操作的安全性：

- Key白名单：只允许`app`、`api`、`ui`、`theme`、`ai_animation_studio_api_config`顶级key
- 原型链防护：拒绝`__proto__`、`constructor`、`prototype`等key
- Value类型限制：只允许string、number、boolean、object
- Value大小限制：最大1MB
- 协议防护：拒绝`data:`和`javascript:`前缀的字符串值

#### 2.6 日志系统

**Logger架构**：

```
loggerRegistry
  ├── ConsoleTransport（控制台输出）
  └── FileTransport（文件输出）
```

**Logger方法签名**：

```typescript
logger.info(message: string, context?: LogContext)
logger.warn(message: string, context?: LogContext)
logger.error(message: string, error?: Error, context?: LogContext)
```

**日志格式示例**：

```
[2026-05-26T10:30:45.123Z] [INFO] [api-server] [API Server] Running on http://localhost:39201
[2026-05-26T10:30:45.456Z] [WARN] [db-connection] Failed to set directory permissions: EPERM
[2026-05-26T10:30:46.789Z] [ERROR] [api-server] Handler error: TypeError: Cannot read properties of undefined
    at Object.generateVideo (api-gateway.ts:45:22)
    at async Route.handler (api-server.ts:137:18)
```

**日志文件位置**：

- 生产环境：`%APPDATA%/ai-animation-studio/logs/app-2026-05-26.log`
- 开发环境：`%APPDATA%/ai-animation-studio/logs/dev-2026-05-26.log`

**日志轮转**：

- 单文件最大10MB，超过后重命名为`.1`备份
- 最多保留5个日志文件，最旧的被删除
- 刷新间隔：5秒（队列超过100条时立即刷新）

**Transport初始化**：

- `main.ts`：`ConsoleTransport(minLevel: "info")` + `FileTransport(minLevel: "info", filename: "app")`
- `main-dev.ts`：`ConsoleTransport(minLevel: "debug")` + `FileTransport(minLevel: "debug", filename: "dev")`

#### 2.7 插件系统

**Plugin Registry**：`plugins/registry.ts`管理AI服务商插件，支持内置插件和用户自定义插件。

**10个内置Provider**：

| Provider | 文件 | 视频能力 | 图片能力 | 特殊能力 |
|----------|------|----------|----------|----------|
| OpenAI Compatible | openai-compatible.ts | ✅ | ✅ | 通用兼容层 |
| OpenAI Sora | openai-sora.ts | ✅ | ❌ | Sora专用视频生成 |
| Anthropic | anthropic.ts | ❌ | ✅ | Claude视觉分析 |
| Google | google.ts | ❌ | ✅ | Gemini图片生成 |
| Volcengine | volcengine.ts | ✅ | ✅ | 火山引擎视频+图片 |
| Zhipu | zhipu.ts | ✅ | ✅ | 智谱CogVideoX+CogView |
| Kuaishou | kuaishou.ts | ✅ | ❌ | 快手可灵视频 |
| Minimax | minimax.ts | ✅ | ✅ | Minimax视频+图片 |
| Pixverse | pixverse.ts | ✅ | ❌ | Pixverse视频 |
| Seedance | seedance.ts | ✅ | ❌ | Seedance视频 |

**Plugin接口能力字段**：

```typescript
interface PluginVideoCapabilities {
  supported: boolean;
  defaultModel: string;
  maxDuration: number;
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsMimicryLevel: boolean;
  supportedCodecs: string[];
}

interface PluginImageCapabilities {
  supported: boolean;
  defaultModel: string;
  supportsReferenceImage: boolean;
}
```

**用户插件加载**：`user-plugin-loader.ts`从`%APPDATA%/ai-animation-studio/plugins/`目录加载用户自定义插件。插件配置使用JSON Schema验证（`user-plugin-schema.ts`），支持自定义API端点映射、请求/响应格式和认证方式。

**插件API端点**：

| 端点 | 方法 | 功能 |
|------|------|------|
| plugins/list | GET | 列出所有插件及其能力 |
| plugins/capabilities | GET | 获取所有插件的能力详情 |
| plugins/add | POST | 添加用户插件 |
| plugins/delete | POST | 删除用户插件 |
| plugins/reload | POST | 重新加载用户插件 |
| plugins/validate | POST | 验证插件配置 |
| plugins/schema | GET | 获取插件JSON Schema |
| plugins/specification | GET | 获取插件规范文档 |
| plugins/templates | GET | 获取插件模板 |

**插件模板**：系统提供3种内置模板供用户创建自定义插件：

| 模板ID | 名称 | 描述 |
|--------|------|------|
| openai-compatible | OpenAI兼容提供商 | 适用于所有兼容OpenAI API格式的提供商 |
| custom-api | 自定义API格式 | 适用于非标准API格式，需手动配置请求/响应映射 |
| image-only | 仅图片生成 | 适用于只提供图片生成能力的提供商 |

#### 2.8 HTTP API Server路由表

API Server共注册40+个路由，按功能分组如下：

**AI生成路由**：

| 路由 | 方法 | 功能 |
|------|------|------|
| generate-video | POST | 生成视频 |
| generate-keyframe | POST | 生成关键帧 |
| generate-frame-pair | POST | 生成帧对 |
| generate-image | POST | 生成图片 |
| generate-text | POST | 生成文本 |
| analyze-image | POST | 分析图片 |
| upload | POST | 上传文件 |
| video-status | GET/POST | 查询视频状态 |

**故事相关路由**：

| 路由 | 方法 | 功能 |
|------|------|------|
| story/plan | POST | 生成故事计划 |
| story/generate-video | POST | 为分镜生成视频 |
| story/generate-keyframe | POST | 为分镜生成关键帧 |
| story/generate-frame-pair | POST | 为分镜生成帧对 |

**角色/场景路由**：

| 路由 | 方法 | 功能 |
|------|------|------|
| character/generate-image | POST | 生成角色图片 |
| character/analyze-image | POST | 分析角色图片 |
| scene/generate-image | POST | 生成场景图片 |
| scene/analyze-image | POST | 分析场景图片 |

**视频管理路由**：

| 路由 | 方法 | 功能 |
|------|------|------|
| video/select-strategy | POST | 选择视频服务商策略 |
| video/detect-format | POST | 检测视频格式 |
| video/tracking-info | POST | 获取视频追踪信息 |
| video/provider-info | POST | 获取服务商信息 |
| video/recover | POST | 恢复视频 |
| video-tasks/bulk-save | POST | 批量保存视频任务 |

**分镜/一致性检查路由**：

| 路由 | 方法 | 功能 |
|------|------|------|
| shot/validate-reference | POST | 验证镜头引用 |
| shot/get-reference-video-url | POST | 获取引用视频URL |
| shot/build-reference-description | POST | 构建引用描述 |
| validate/consistency | POST | 一致性检查 |
| validate/feature-anchoring | POST | 特征锚定验证 |
| validate/no-frame-binding | POST | 无帧绑定验证 |
| reference/check-character | POST | 检查角色引用 |
| reference/check-scene | POST | 检查场景引用 |
| visual-consistency/check | POST | 视觉一致性检查 |
| visual-consistency/check-beat | POST | 分镜元素一致性检查 |

**分镜生成路由**：

| 路由 | 方法 | 功能 |
|------|------|------|
| storyboard/generate-keyframe | POST | 生成分镜关键帧 |
| storyboard/generate-frame-pair | POST | 生成分镜帧对 |
| storyboard/generate-video | POST | 生成分镜视频 |
| storyboard/generate-full-workflow | POST | 完整生成工作流 |
| storyboard/generate-keyframe-chain | POST | 生成关键帧链 |

**配置/同步路由**：

| 路由 | 方法 | 功能 |
|------|------|------|
| config | GET/POST/HEAD | 获取/设置配置 |
| secure-config | POST | 安全配置管理 |
| test-connection | POST | 测试连接 |
| sync/config | GET/POST | 同步配置 |
| sync/test | POST | 测试同步连接 |
| sync/proxy | POST | 同步代理 |
| export | POST | 导出数据 |
| health | GET | 健康检查 |

### 3. 数据库Schema详解

#### 3.1 完整表清单

数据库共28张表，分为4组：

**功能表（14张）**：

| 表名 | 功能组 | 基础列 | 主要列 | JSON容器 |
|------|--------|--------|--------|----------|
| video_tasks | video | ✅ | status(TEXT CHECK 6种), progress(INTEGER), video_url(TEXT), local_video_path(TEXT), story_id(TEXT FK→stories), beat_id(TEXT), message(TEXT) | config, provider, media_refs, tracking |
| story_beats | core | ✅ | story_id(TEXT FK→stories NOT NULL), sequence(INTEGER NOT NULL), order_num(INTEGER), title(TEXT), content(TEXT), description(TEXT), duration(INTEGER), type(TEXT), character_ids_json(TEXT), scene_id(TEXT), local_video_path(TEXT), local_keyframe_path(TEXT), local_first_frame_path(TEXT), local_last_frame_path(TEXT) | camera, generation, meta |
| characters | core | ✅ | name(TEXT NOT NULL), description(TEXT), ref_image_path(TEXT), gender(TEXT CHECK 4种), age(INTEGER CHECK 0-200), style(TEXT), source(TEXT CHECK 3种), use_count(INTEGER DEFAULT 0), last_used_at(INTEGER) | appearance, generation, config, meta |
| scenes | core | ✅ | name(TEXT NOT NULL), description(TEXT), ref_image_path(TEXT), type(TEXT), source(TEXT CHECK 3种), use_count(INTEGER DEFAULT 0), last_used_at(INTEGER) | appearance, atmosphere, generation, config |
| stories | core | ✅ | title(TEXT NOT NULL), description(TEXT), genre(TEXT), tone(TEXT), target_duration(INTEGER), keyframe_chain_valid(INTEGER DEFAULT 0), style_guide_json(TEXT), element_ids_json(TEXT), element_bindings_json(TEXT) | - |
| story_versions | core | ✅ | story_id(TEXT FK→stories NOT NULL), timestamp(INTEGER), beats_json(TEXT), title(TEXT), description(TEXT), genre(TEXT), tone(TEXT), target_duration(INTEGER), characters_json(TEXT), scenes_json(TEXT), change_summary(TEXT), auto_saved(INTEGER DEFAULT 0) | - |
| character_outfits | core | ✅ | character_id(TEXT FK→characters NOT NULL), name(TEXT NOT NULL), description(TEXT), clothing(TEXT), accessories_json(TEXT DEFAULT '[]'), image_url(TEXT), local_image_path(TEXT), thumbnail_path(TEXT), is_default(INTEGER DEFAULT 0) | - |
| elements | core | ✅ | type(TEXT NOT NULL CHECK 3种), name(TEXT NOT NULL), description(TEXT), character_config_json(TEXT), scene_config_json(TEXT), feature_anchor_json(TEXT), reference_image_quality_json(TEXT), bindings_json(TEXT) | - |
| media_assets | assets | ✅ | name(TEXT NOT NULL), description(TEXT), type(TEXT CHECK 2种), url(TEXT), thumbnail_url(TEXT), tags(TEXT), file_size(INTEGER), mime_type(TEXT), width(INTEGER), height(INTEGER), duration(INTEGER), bound_to_type(TEXT), bound_to_id(TEXT), bound_to_name(TEXT) | - |
| video_templates | video | ✅ | name(TEXT NOT NULL), description(TEXT), category(TEXT), total_duration(INTEGER), shots_json(TEXT), tags(TEXT), thumbnail_url(TEXT) | - |
| storyboard_assets | core | ✅ | script(TEXT), duration(INTEGER DEFAULT 0), shot_type(TEXT CHECK 8种), preview_path(TEXT), character_ids(TEXT), scene_id(TEXT), project_id(TEXT) | - |
| collections | assets | ✅ | name(TEXT NOT NULL) | - |
| ast_templates | templates | ✅ | name(TEXT NOT NULL), description(TEXT), category(TEXT), genre(TEXT), tone(TEXT), tags(TEXT), author(TEXT), total_duration(INTEGER), beats_count(INTEGER DEFAULT 0), characters_count(INTEGER DEFAULT 0), scenes_count(INTEGER DEFAULT 0), ast_file_path(TEXT), ast_file_size(INTEGER), is_public(INTEGER DEFAULT 0), usage_count(INTEGER DEFAULT 0), rating(REAL DEFAULT 0), version(INTEGER DEFAULT 1), parent_template_id(TEXT) | - |
| generation_tasks | video | ✅ | task_type(TEXT CHECK 5种), story_id(TEXT), beat_id(TEXT), asset_id(TEXT), status(TEXT CHECK 6种 DEFAULT 'pending'), input_params(TEXT), output_path(TEXT), output_url(TEXT), error_message(TEXT), retry_count(INTEGER DEFAULT 0), priority(TEXT DEFAULT 'normal'), next_retry_at(INTEGER), last_attempt_at(INTEGER), provider_id(TEXT), model_id(TEXT), estimated_cost(REAL), completed_at(INTEGER) | - |

**连接表（5张）**：

| 表名 | 主键 | 列 |
|------|------|----|
| story_characters | (story_id, character_id) | story_id(TEXT FK→stories), character_id(TEXT FK→characters), display_order(INTEGER DEFAULT 0) |
| story_scenes | (story_id, scene_id) | story_id(TEXT FK→stories), scene_id(TEXT FK→scenes), display_order(INTEGER DEFAULT 0) |
| story_elements | (story_id, element_id) | story_id(TEXT FK→stories), element_id(TEXT FK→elements), binding_config(TEXT) |
| collection_assets | (collection_id, asset_id) | collection_id(TEXT FK→collections), asset_type(TEXT CHECK 5种), asset_id(TEXT NOT NULL) |
| asset_tags | (asset_id, tag) | asset_id(TEXT NOT NULL), asset_type(TEXT CHECK 4种), tag(TEXT NOT NULL), confidence(REAL DEFAULT 1.0 CHECK 0-1) |

**缓存表（6张）**：

| 表名 | 主键 | 基础列 | 列 |
|------|------|--------|----|
| video_cache | task_id | ❌ | task_id(TEXT), file_path(TEXT NOT NULL), original_url(TEXT), mime_type(TEXT), file_size(INTEGER), cached_at(INTEGER) |
| image_cache | source_url | ❌ | source_url(TEXT NOT NULL), file_path(TEXT NOT NULL), mime_type(TEXT), file_size(INTEGER), width(INTEGER), height(INTEGER), cached_at(INTEGER), last_accessed_at(INTEGER) |
| error_logs | id | ❌ | id(INTEGER NOT NULL), message(TEXT NOT NULL), stack(TEXT), timestamp(INTEGER), component(TEXT) |
| sessions | (id, key) | ❌ | id(TEXT NOT NULL), key(TEXT NOT NULL), value(TEXT), timestamp(INTEGER) |
| auto_saves | id | ❌ | id(TEXT NOT NULL), type(TEXT CHECK 3种), data_json(TEXT), timestamp(INTEGER) |
| file_index | id | ❌ | id(TEXT NOT NULL), file_path(TEXT NOT NULL UNIQUE), file_name(TEXT), file_size(INTEGER), file_hash(TEXT), asset_id(TEXT), asset_type(TEXT), created_at(INTEGER), last_accessed_at(INTEGER), access_count(INTEGER DEFAULT 0), is_temporary(INTEGER DEFAULT 0), expires_at(INTEGER) |

**同步表（3张）**：

| 表名 | 基础列 | 列 |
|------|--------|----|
| sync_changelog | ❌ | entity_type(TEXT NOT NULL), entity_id(TEXT NOT NULL), operation(TEXT NOT NULL CHECK 3种), vector_clock(TEXT NOT NULL DEFAULT '{}'), data(TEXT), timestamp(INTEGER NOT NULL), synced(INTEGER NOT NULL DEFAULT 0), device_id(TEXT NOT NULL) |
| sync_meta | key(主键) | key(TEXT NOT NULL), value(TEXT NOT NULL) |
| sync_conflict_backup | ❌ | entity_type(TEXT NOT NULL), entity_id(TEXT NOT NULL), local_data(TEXT), remote_data(TEXT), resolved_at(INTEGER NOT NULL), created_at(INTEGER) |

另外还有1张系统表`users`和1张元数据表`schema_version`。

**users表**：

| 列 | 类型 | 约束 |
|----|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | DEFAULT '本地用户' |
| role | TEXT | DEFAULT 'owner' CHECK(role IN ('owner','admin','member','viewer')) |
| preferences | TEXT | DEFAULT '{}' |
| created_at | INTEGER | DEFAULT (strftime('%s','now')) |
| updated_at | INTEGER | DEFAULT (strftime('%s','now')) |

**schema_version表**：

| 列 | 类型 | 约束 |
|----|------|------|
| version | INTEGER | PRIMARY KEY |
| applied_at | INTEGER | DEFAULT (strftime('%s','now')) |

#### 3.2 PRAGMA配置

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA temp_store = memory;
PRAGMA mmap_size = 268435456;
```

#### 3.3 索引策略

索引分为三类：

**自动索引**：Schema Builder为每个业务表自动生成`idx_{table}_is_deleted`和`idx_{table}_updated_at`索引。外键列自动生成`idx_{table}_{column}`索引。

**手动索引**：`EXTRA_INDEXES_SQL`定义了40+个手动索引，覆盖高频查询场景：

| 表 | 索引 | 用途 |
|----|------|------|
| video_tasks | idx_video_tasks_status | 按状态查询 |
| video_tasks | idx_video_tasks_story_id | 按故事ID查询 |
| video_tasks | idx_video_tasks_status_updated | 按状态+更新时间排序 |
| story_beats | idx_story_beats_story | 按故事ID查询分镜 |
| story_versions | idx_story_versions_story | 按故事ID+时间戳查询版本 |
| character_outfits | idx_character_outfits_character | 按角色ID查询服装 |
| video_cache | idx_video_cache_cached_at | 按缓存时间清理 |
| video_cache | idx_video_cache_size | 按文件大小统计 |
| image_cache | idx_image_cache_cached_at | 按缓存时间清理 |
| image_cache | idx_image_cache_last_accessed | 按最后访问时间排序 |
| auto_saves | idx_auto_saves_type | 按类型查询 |
| auto_saves | idx_auto_saves_timestamp | 按时间戳排序 |
| generation_tasks | idx_tasks_status | 按状态+创建时间排序 |
| generation_tasks | idx_tasks_story | 按故事+分镜ID查询 |
| generation_tasks | idx_tasks_priority | 按优先级+状态排序 |
| generation_tasks | idx_tasks_next_retry | 按下次重试时间查询 |
| file_index | idx_file_hash | 按文件哈希去重 |
| file_index | idx_file_expires | 条件索引：临时文件过期清理 |
| ast_templates | idx_ast_templates_category | 按分类查询 |
| ast_templates | idx_ast_templates_name | 按名称搜索 |
| ast_templates | idx_ast_templates_usage | 按使用量排序 |
| ast_templates | idx_ast_templates_created | 按创建时间排序 |
| characters | idx_characters_style | 按风格查询 |
| characters | idx_characters_gender | 按性别查询 |
| characters | idx_characters_source | 按来源查询 |
| characters | idx_characters_created | 按创建时间排序 |
| characters | idx_characters_used | 按使用量排序 |
| characters | idx_characters_name | 按名称搜索 |
| scenes | idx_scenes_type | 按类型查询 |
| scenes | idx_scenes_created | 按创建时间排序 |
| scenes | idx_scenes_name | 按名称搜索 |
| asset_tags | idx_asset_tags_tag | 按标签查询 |
| asset_tags | idx_asset_tags_lookup | 按资产类型+标签查询 |
| sync_changelog | idx_changelog_synced | 按同步状态+时间戳查询 |
| sync_changelog | idx_changelog_entity | 按实体类型+ID查询 |

#### 3.4 Migration框架

```typescript
const CURRENT_SCHEMA_VERSION = 2;
const MIGRATIONS: Record<number, MigrationFn> = {};
```

当前迁移映射为空（项目尚未发布，无历史迁移需要执行）。迁移框架的核心接口：

```typescript
interface MigrationDb {
  transaction(fn: () => void): void;
  exec(sql: string): void;
  pragma(pragma: string): void;
}
```

迁移执行流程：

1. 读取`schema_version`表获取当前版本号
2. 遍历`MIGRATIONS`映射，收集版本号大于当前版本的迁移
3. 按版本号升序排序
4. 在`db.transaction()`中依次执行每个迁移
5. 每个迁移成功后更新`schema_version`表
6. 如果任何迁移失败，整个事务回滚

### 4. 构建与部署

#### 4.1 构建脚本

构建使用PowerShell脚本`build-electron.ps1`，包含7个步骤：

**步骤1：环境检查**

- 检查Node.js版本（要求18+）
- 检查npm可用性
- 检查PowerShell版本

**步骤2：安装依赖**

- 执行`npm ci`安装生产依赖
- 验证关键依赖（better-sqlite3、electron等）是否安装成功

**步骤3：Next.js构建**

- 临时移除API Routes和动态路由（Next.js `output: "export"`不支持）
- 执行`next build`生成静态导出
- 构建产物输出到`out/`目录
- 恢复临时移除的文件

**步骤4：Electron TypeScript编译**

- 执行`tsc -p electron/tsconfig.json`编译主进程代码
- 编译产物输出到`electron/dist/`目录

**步骤5：原生模块重建**

- 执行`npm rebuild better-sqlite3`为Electron的Node.js版本重新编译C++模块
- 使用`@electron/rebuild`确保ABI兼容

**步骤6：资源复制**

- 复制插件文档到`out/docs/`目录
- 复制preload脚本到正确位置
- 复制原生模块到打包目录

**步骤7：Electron打包**

- 执行`electron-builder`打包应用
- 配置Windows目标（NSIS安装程序）
- 确保PATH包含`C:\Windows\System32`（electron-builder依赖cmd.exe执行`npm ls`）

#### 4.2 Next.js导出模式处理

Next.js的`output: "export"`配置要求所有页面在构建时预渲染为静态HTML。以下特性不可用：

- API Routes（`app/api/`）
- 动态路由（`app/[param]/`）
- Server Components
- `next/image`的优化功能

构建脚本在步骤3中临时处理这些限制：

1. 将`app/api/`目录临时移到备份位置
2. 执行`next build`
3. 构建完成后恢复`app/api/`目录

API功能由Electron主进程的HTTP API Server提供，不依赖Next.js的API Routes。

#### 4.3 better-sqlite3原生模块重建

better-sqlite3是C++原生模块，其预编译二进制与特定Node.js ABI版本绑定。Electron使用自己的Node.js版本（不同于系统Node.js），因此需要重新编译：

```bash
npm rebuild better-sqlite3
# 或使用 @electron/rebuild
npx @electron/rebuild
```

构建脚本在步骤5中自动执行重建。Electron镜像配置通过环境变量设置：

- `ELECTRON_MIRROR`：Electron二进制下载镜像
- `ELECTRON_BUILDER_BINARIES_MIRROR`：electron-builder依赖的二进制下载镜像

`.npmrc`中不能包含非标准key（会导致npm 10+的"Unknown project config"警告）。

#### 4.4 electron-builder打包

electron-builder配置要点：

- 目标平台：Windows（NSIS安装程序）
- 应用ID：`ai-animation-studio`
- 包含文件：`out/`（Next.js导出）、`electron/dist/`（编译后的主进程代码）、`node_modules/better-sqlite3/`（原生模块）
- asar打包：启用，但better-sqlite3的`.node`文件必须解包（`asarUnpack`配置）
- 系统PATH要求：`C:\Windows\System32`必须在PATH中（electron-builder使用`cmd.exe`执行`npm ls`检测依赖）

#### 4.5 运行时架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron 主进程                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 静态文件服务器 │  │  HTTP API    │  │   SQLite     │      │
│  │ :APP_PORT    │  │  Server      │  │   Database   │      │
│  │              │  │  :API_PORT   │  │   (WAL)      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘      │
│         │                 │                                  │
│  ┌──────┴─────────────────┴──────┐  ┌──────────────┐       │
│  │         API Gateway           │  │   Plugin     │       │
│  │   (路由分发 + 服务商适配)       │  │   Registry   │       │
│  └───────────────────────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ IPC Handlers │  │  SSRF Guard  │  │  Key Storage │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │   Logger     │  │   Lifecycle  │                         │
│  │  (Console+   │  │   Manager    │                         │
│  │   File)      │  │              │                         │
│  └──────────────┘  └──────────────┘                         │
├─────────────────────────────────────────────────────────────┤
│                    Electron 渲染进程                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Next.js 静态导出 (out/)                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│  │  │  React   │  │ Zustand  │  │   DI     │           │   │
│  │  │  19      │  │  5       │  │ Container│           │   │
│  │  └──────────┘  └──────────┘  └──────────┘           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│  │  │ 12 模块  │  │ Storage  │  │  AI      │           │   │
│  │  │ (Hooks+  │  │ Layer    │  │ Providers│           │   │
│  │  │ Services)│  │          │  │          │           │   │
│  │  └──────────┘  └──────────┘  └──────────┘           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Preload (contextBridge)                   │   │
│  │  IPC权限验证 + 速率限制 + DDL拦截 + SQL注释剥离         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 4.6 验证序列

每次代码修改后应执行以下验证序列：

```bash
# 1. ESLint检查（导入限制 + 代码风格）
npx eslint .

# 2. 架构扫描（DDD违规 + contract.json一致性 + 裸SQL + 深层路径导入）
node scripts/check-architecture.mjs

# 3. 模块API一致性检查（MODULE.md ↔ index.ts同步）
node scripts/check-module-api-consistency.mjs

# 4. TypeScript类型检查（渲染进程）
npx tsc --noEmit

# 5. TypeScript类型检查（主进程）
npx tsc -p electron/tsconfig.json --noEmit

# 6. 单元测试
npx vitest run

# 7. 完整构建
powershell -ExecutionPolicy Bypass -File build-electron.ps1
```

#### 4.7 已知架构债务

项目存在以下已知的技术债务，在v2.0版本中需要评估和处理：

**薄模块合并**：feedback模块（0消费者）、security模块（0消费者）、persistence模块（1消费者）、integrity模块（2消费者，且infrastructure层导入违反DDD方向）应评估合并到其他模块或shared层。

**WASM冗余包**：`@emnapi/core`、`@emnapi/runtime`等WASM包是better-sqlite3的可选依赖，无法通过npm prune移除，但无害。

**测试类型检查**：`tsconfig.json`排除所有测试文件的类型检查，Vitest独立处理测试类型。MVP阶段可接受，但CI应考虑`tsconfig.test.json`实现更严格的检查。

**硬编码中文字符串**：约19,000+处中文字符串分布在100+个文件中。当前为中文桌面应用，完整i18n的ROI较低，但应提取共享消息常量以备未来多语言支持。

**better-sqlite3版本锁定**：版本锁定为`12.10.0`（非`^12.10.0`），升级需要手动验证ABI兼容性并重新编译。这是必要的约束，但应在文档中明确记录升级流程。

---

## 第四部分：附录

### 附录A：完整DI Token清单

| 分类 | Token名 | 类型 | 懒加载 | 来源模块 |
|------|---------|------|--------|----------|
| A. Domain Port | videoTaskStorage | IVideoTaskStorage | - | infrastructure/storage/video-tasks |
| A. Domain Port | characterStorage | ICharacterStorage | - | infrastructure/storage/characters |
| A. Domain Port | sceneStorage | ISceneStorage | - | infrastructure/storage/scenes |
| A. Domain Port | storyStorage | IStoryStorage | - | infrastructure/storage/stories |
| A. Domain Port | videoProvider | IVideoProvider | - | infrastructure/ai-providers/video |
| A. Domain Port | imageProvider | IImageProvider | - | infrastructure/ai-providers/image |
| A. Domain Port | textProvider | ITextProvider | - | infrastructure/ai-providers/text |
| A. Domain Port | fileUploader | IFileUploader | - | infrastructure/ai-providers/utils |
| A. Domain Port | syncStorage | ISyncStorage | - | infrastructure/storage/sqlite-core |
| B. 有状态服务 | eventBus | EventBus | - | shared/event-bus |
| B. 有状态服务 | apiClient | ApiClient | - | infrastructure/api/client |
| B. 有状态服务 | imageApi | ApiClient | - | infrastructure/api/client |
| B. 有状态服务 | videoApi | ApiClient | - | infrastructure/api/client |
| B. 有状态服务 | textApi | ApiClient | - | infrastructure/api/client |
| B. 有状态服务 | preferencesStorage | PreferencesStorage | - | shared/utils/preferences |
| C. Storage | versionStorage | VersionStorage | - | infrastructure/storage/versions |
| C. Storage | elementStorage | ElementStorage | - | infrastructure/storage/elements |
| C. Storage | videoCacheStorage | VideoCacheStorage | - | infrastructure/storage/video-cache |
| C. Storage | imageCacheStorage | ImageCacheStorage | - | infrastructure/storage/image-cache |
| C. Storage | collectionStorage | CollectionStorage | - | infrastructure/storage/collections |
| C. Storage | storyboardStorage | StoryboardStorage | - | infrastructure/storage/storyboard |
| C. Storage | importExportStorage | ImportExportStorage | - | infrastructure/storage/import-export |
| C. Storage | templateStorage | TemplateStorage | - | infrastructure/storage/templates |
| C. Storage | autoSaveStorage | AutoSaveStorage | - | infrastructure/storage/auto-save |
| C. Storage | errorLogStorage | ErrorLogStorage | - | infrastructure/storage/error-logs |
| C. Storage | sessionStorage | SessionStorage | - | infrastructure/storage/sessions |
| D. Repository | mediaAssetRepository | MediaAssetRepository | - | infrastructure/database |
| D. Repository | characterRepository | CharacterRepository | - | infrastructure/database |
| D. Repository | sceneRepository | SceneRepository | - | infrastructure/database |
| D. Repository | storyRepository | StoryRepository | - | infrastructure/database |
| D. Repository | elementRepository | ElementRepository | - | infrastructure/database |
| E. 桥接函数 | safeQuery | Function | - | infrastructure/storage/sqlite-core |
| E. 桥接函数 | safeRun | Function | - | infrastructure/storage/sqlite-core |
| E. 桥接函数 | safeTransaction | Function | - | infrastructure/storage/sqlite-core |
| E. 桥接函数 | toSqlValue | Function | - | infrastructure/storage/core |
| E. 桥接函数 | synthesizeOutfit | Function | - | infrastructure/ai-providers/outfit-synthesis |
| E. 桥接函数 | batchSynthesizeOutfits | Function | - | infrastructure/ai-providers/outfit-synthesis |
| E. 桥接函数 | getProviderSupportedCodecs | Function | - | infrastructure/ai-providers/model-adapter |
| E. 桥接函数 | getProviderMaxDuration | Function | - | infrastructure/ai-providers/model-adapter |
| E. 桥接函数 | registerObjectUrl | Function | - | infrastructure/storage/video-cache |
| E. 桥接函数 | revokeObjectUrl | Function | - | infrastructure/storage/video-cache |
| E. 桥接函数 | getObjectUrl | Function | - | infrastructure/storage/video-cache |
| E. 桥接函数 | resilientFetch | Function | - | infrastructure/network/resilient-fetch |
| E. 桥接函数 | updateOutfitImage | Function | - | infrastructure/storage/characters |
| E. 桥接函数 | loadConfig | Function | - | infrastructure/ai-providers/api-config/storage |
| E. 桥接函数 | checkConfigStatus | Function | - | infrastructure/ai-providers/api-config/init |
| E. 桥接函数 | initConfig | Function | - | infrastructure/ai-providers/api-config/init |
| E. 桥接函数 | resolveImageSize | Function | - | infrastructure/ai-providers/model-capabilities |
| E. 桥接函数 | getModelParameterProfile | Function | - | infrastructure/ai-providers/model-capabilities |
| E. 桥接函数 | isCodecSupportedByProvider | Function | - | infrastructure/video-utils |
| F. 懒加载 | elementManager | IElementManager | async | modules/shot/element-binding |
| F. 懒加载 | referenceEngine | IReferenceEngine | async | modules/shot/shot-reference |

**Token 总计**：A类 9个 + B类 7个 + C类 11个 + D类 5个 + E类 19个 + F类 2个 = **53个 Token**

#### DI Token 使用模式

模块内访问 DI Token 的标准方式：

```typescript
import { container } from "@/infrastructure/di";

const storage = container.videoTaskStorage;
const provider = container.videoProvider;
const result = await storage.createTask(params);
```

测试中替换 Token 的标准方式：

```typescript
import { overrideToken, createToken } from "@/infrastructure/di";

const mockStorage = { createTask: vi.fn() };
overrideToken(createToken("videoTaskStorage", () => mockStorage as any), () => mockStorage);
```

F类懒加载 Token 的特殊访问方式（因使用 `async () => import(...)` 工厂函数）：

```typescript
const elementManager = await container.elementManager;
const referenceEngine = await container.referenceEngine;
```

---

### 附录B：完整 IPC 通道清单

#### B.1 通道权限等级与速率限制

| 权限等级 | 说明 | 速率限制（次/分钟） | 通道数 |
|---------|------|-------------------|-------|
| READONLY | 只读操作，不修改数据 | 300 | 13 |
| READWRITE | 读写操作，可修改数据 | 100 | 11 |
| DANGEROUS | 危险操作，可批量修改/删除数据 | 100 | 6 |
| SYSTEM | 系统级操作，涉及外部程序/文件系统 | 100 | 4 |
| SECURE | 安全操作，涉及密钥解析 | 100 | 1 |

全局速率限制：**600次/分钟**（所有通道合计）

#### B.2 READONLY 通道（13个）

| 通道名 | 用途 | 参数 | 返回值 |
|-------|------|------|--------|
| `db:query` | 执行SQL查询（SELECT） | sql, params? | Record[] |
| `db:get` | 获取单条记录 | sql, params? | Record \| undefined |
| `db:stats` | 获取数据库统计信息 | - | { tableCount, recordCounts } |
| `db:type` | 获取数据库类型 | - | "sqlite" |
| `assets:read-file-base64` | 读取文件为Base64 | filePath | string (base64) |
| `assets:get-dir` | 获取资源目录路径 | - | string |
| `assets:file-exists` | 检查文件是否存在 | filePath | boolean |
| `fs:read-file` | 读取文件内容 | filePath, options? | Buffer \| string |
| `cache:get-cache-directory` | 获取缓存目录路径 | - | string |
| `fs:get-file-info` | 获取文件信息 | filePath | FileInfo |
| `fs:get-disk-space` | 获取磁盘空间信息 | - | DiskSpaceInfo |
| `image:to-base64` | 图片转Base64 | filePath | string |
| `config:get` | 获取配置项 | key | unknown |

#### B.3 READWRITE 通道（11个）

| 通道名 | 用途 | 参数 | 返回值 |
|-------|------|------|--------|
| `db:run` | 执行SQL写操作（INSERT/UPDATE/DELETE） | sql, params? | { changes, lastInsertRowid } |
| `db:batch-insert` | 批量插入数据 | table, records | { count } |
| `db:init` | 初始化数据库 | - | boolean |
| `db:save` | 保存数据到数据库 | table, data | { id } |
| `assets:save-image` | 保存图片文件 | fileName, data, subdir? | string (path) |
| `assets:save-buffer` | 保存Buffer数据 | fileName, buffer, subdir? | string (path) |
| `assets:copy-file` | 复制文件 | src, dest | boolean |
| `fs:write-file` | 写入文件 | filePath, data, options? | boolean |
| `image:normalize` | 图片标准化处理 | filePath, options? | string (path) |
| `config:set` | 设置配置项 | key, value | boolean |
| `secure-config:save` | 保存安全配置 | key, value | boolean |
| `secure-config:load` | 加载安全配置 | key | string \| null |
| `secure-config:delete` | 删除安全配置 | key | boolean |
| `secure-config:has` | 检查安全配置是否存在 | key | boolean |

#### B.4 DANGEROUS 通道（6个）

| 通道名 | 用途 | 参数 | 返回值 |
|-------|------|------|--------|
| `db:transaction` | 执行事务（多条SQL语句） | Statement[] | boolean |
| `db:migrate` | 执行数据库迁移 | - | boolean |
| `db:vacuum` | 数据库VACUUM优化 | - | boolean |
| `db:analyze` | 数据库ANALYZE统计 | - | boolean |
| `db:checkpoint` | WAL模式检查点 | - | boolean |
| `assets:delete-file` | 删除文件 | filePath | boolean |

#### B.5 SYSTEM 通道（4个）

| 通道名 | 用途 | 参数 | 返回值 |
|-------|------|------|--------|
| `shell:open-external` | 打开外部链接/程序 | url | boolean |
| `dialog:open-file` | 打开文件选择对话框 | options? | string[] \| null |
| `dialog:save-file` | 打开保存文件对话框 | options? | string \| null |
| `db:close` | 关闭数据库连接 | - | boolean |

#### B.6 SECURE 通道（1个）

| 通道名 | 用途 | 参数 | 返回值 |
|-------|------|------|--------|
| `secure-config:resolve` | 解析安全配置（返回明文密钥） | key | string \| null |

#### B.7 安全防护机制

**DDL语句阻断**：`db:run` 和 `db:transaction` 通道会检测SQL语句中的DDL关键字（DROP、ALTER、CREATE、TRUNCATE、ATTACH、DETACH），检测前会先剥离SQL注释（`/* */` 和 `--`），防止通过注释绕过。

**未注册通道拦截**：调用未在 `IPC_PERMISSIONS` 中注册的通道时，会通过 `log:security` 通道记录安全事件，并抛出错误。

**同步IPC限制**：仅 `config:get` 和 `config:set` 使用同步IPC（`sendSync`），其余均为异步（`invoke`）。同步IPC调用失败时不会抛出异常，而是返回 `null` 或 `false`。

---

### 附录C：完整数据库表清单

数据库共包含 **28张表**，分为5个功能组：核心业务表（9张）、关联表（5张）、缓存表（6张）、同步表（3张）、系统表（2张）+ schema_version 元数据表。

所有业务表自动包含7字段基础列：`owner_id`、`created_at`、`updated_at`、`is_deleted`、`deleted_at`、`version`、`sync_id`。

#### C.1 核心业务表（9张）

##### C.1.1 video_tasks（视频任务表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| status | TEXT | CHECK IN ('pending','generating','completed','failed','cancelled','retrying') | 任务状态 |
| progress | INTEGER | DEFAULT 0 | 进度百分比 |
| video_url | TEXT | - | 远程视频URL |
| local_video_path | TEXT | - | 本地视频路径 |
| story_id | TEXT | FK→stories(id) | 所属故事ID |
| beat_id | TEXT | - | 所属分镜ID |
| message | TEXT | - | 状态消息/错误信息 |
| config | TEXT | DEFAULT '{}' | **JSON容器**：VideoTaskConfig |
| provider | TEXT | DEFAULT '{}' | **JSON容器**：VideoTaskProvider |
| media_refs | TEXT | DEFAULT '{}' | **JSON容器**：MediaRefs |
| tracking | TEXT | DEFAULT '{}' | **JSON容器**：TrackingInfo |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

**索引**：idx_video_tasks_status(status)、idx_video_tasks_story_id(story_id)、idx_video_tasks_status_updated(status, updated_at)

##### C.1.2 story_beats（分镜表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| story_id | TEXT | FK→stories(id), NOT NULL | 所属故事ID |
| sequence | INTEGER | NOT NULL | 序列号 |
| order_num | INTEGER | - | 排序号 |
| title | TEXT | - | 分镜标题 |
| content | TEXT | - | 分镜内容描述 |
| description | TEXT | - | 详细描述 |
| duration | INTEGER | - | 时长（秒） |
| type | TEXT | - | 分镜类型 |
| character_ids_json | TEXT | - | 角色ID列表JSON |
| scene_id | TEXT | - | 场景ID |
| camera | TEXT | DEFAULT '{}' | **JSON容器**：CameraConfig |
| generation | TEXT | DEFAULT '{}' | **JSON容器**：GenerationConfig |
| meta | TEXT | DEFAULT '{}' | **JSON容器**：BeatMeta |
| local_video_path | TEXT | - | 本地视频路径 |
| local_keyframe_path | TEXT | - | 本地关键帧路径 |
| local_first_frame_path | TEXT | - | 本地首帧路径 |
| local_last_frame_path | TEXT | - | 本地末帧路径 |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

**索引**：idx_story_beats_story(story_id)

##### C.1.3 characters（角色表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 角色名称 |
| description | TEXT | - | 角色描述 |
| ref_image_path | TEXT | - | 参考图路径 |
| gender | TEXT | CHECK IN ('male','female','other','unknown') | 性别 |
| age | INTEGER | CHECK BETWEEN 0 AND 200 | 年龄 |
| style | TEXT | - | 风格标签 |
| source | TEXT | CHECK IN ('ai-generated','uploaded','imported') | 来源 |
| use_count | INTEGER | DEFAULT 0 | 使用次数 |
| last_used_at | INTEGER | - | 最后使用时间 |
| appearance | TEXT | DEFAULT '{}' | **JSON容器**：AppearanceConfig |
| generation | TEXT | DEFAULT '{}' | **JSON容器**：GenerationConfig |
| config | TEXT | DEFAULT '{}' | **JSON容器**：CharacterConfig |
| meta | TEXT | DEFAULT '{}' | **JSON容器**：CharacterMeta |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

**索引**：idx_characters_style(style)、idx_characters_gender(gender)、idx_characters_source(source)、idx_characters_created(created_at DESC)、idx_characters_used(use_count DESC, last_used_at DESC)、idx_characters_name(name)

##### C.1.4 scenes（场景表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 场景名称 |
| description | TEXT | - | 场景描述 |
| ref_image_path | TEXT | - | 参考图路径 |
| type | TEXT | - | 场景类型 |
| source | TEXT | CHECK IN ('ai-generated','uploaded','imported') | 来源 |
| use_count | INTEGER | DEFAULT 0 | 使用次数 |
| last_used_at | INTEGER | - | 最后使用时间 |
| appearance | TEXT | DEFAULT '{}' | **JSON容器**：AppearanceConfig |
| atmosphere | TEXT | DEFAULT '{}' | **JSON容器**：AtmosphereConfig |
| generation | TEXT | DEFAULT '{}' | **JSON容器**：GenerationConfig |
| config | TEXT | DEFAULT '{}' | **JSON容器**：SceneConfig |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

**索引**：idx_scenes_type(type)、idx_scenes_created(created_at DESC)、idx_scenes_name(name)

##### C.1.5 stories（故事表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| title | TEXT | NOT NULL | 故事标题 |
| description | TEXT | - | 故事描述 |
| genre | TEXT | - | 题材类型 |
| tone | TEXT | - | 基调 |
| target_duration | INTEGER | - | 目标时长（秒） |
| keyframe_chain_valid | INTEGER | DEFAULT 0 | 关键帧链是否有效 |
| style_guide_json | TEXT | - | 风格指南JSON |
| element_ids_json | TEXT | - | 元素ID列表JSON |
| element_bindings_json | TEXT | - | 元素绑定配置JSON |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

##### C.1.6 story_versions（故事版本表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| story_id | TEXT | FK→stories(id), NOT NULL | 所属故事ID |
| timestamp | INTEGER | - | 版本时间戳 |
| beats_json | TEXT | - | 分镜快照JSON |
| title | TEXT | - | 故事标题快照 |
| description | TEXT | - | 故事描述快照 |
| genre | TEXT | - | 题材快照 |
| tone | TEXT | - | 基调快照 |
| target_duration | INTEGER | - | 目标时长快照 |
| characters_json | TEXT | - | 角色快照JSON |
| scenes_json | TEXT | - | 场景快照JSON |
| change_summary | TEXT | - | 变更摘要 |
| auto_saved | INTEGER | DEFAULT 0 | 是否自动保存 |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

**索引**：idx_story_versions_story(story_id, timestamp)

##### C.1.7 character_outfits（角色服装表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| character_id | TEXT | FK→characters(id), NOT NULL | 所属角色ID |
| name | TEXT | NOT NULL, DEFAULT '' | 服装名称 |
| description | TEXT | DEFAULT '' | 服装描述 |
| clothing | TEXT | DEFAULT '' | 服装详情 |
| accessories_json | TEXT | DEFAULT '[]' | 配饰列表JSON |
| image_url | TEXT | - | 服装图片URL |
| local_image_path | TEXT | - | 本地服装图片路径 |
| thumbnail_path | TEXT | - | 缩略图路径 |
| is_default | INTEGER | DEFAULT 0 | 是否默认服装 |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

**索引**：idx_character_outfits_character(character_id)

##### C.1.8 elements（元素表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| type | TEXT | NOT NULL, CHECK IN ('character','prop','effect') | 元素类型 |
| name | TEXT | NOT NULL | 元素名称 |
| description | TEXT | - | 元素描述 |
| character_config_json | TEXT | - | 角色配置JSON |
| scene_config_json | TEXT | - | 场景配置JSON |
| feature_anchor_json | TEXT | - | 特征锚点JSON |
| reference_image_quality_json | TEXT | - | 参考图质量JSON |
| bindings_json | TEXT | - | 绑定配置JSON |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

##### C.1.9 generation_tasks（生成任务表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| task_type | TEXT | CHECK IN ('keyframe','first_frame','last_frame','character_image','scene_image') | 任务类型 |
| story_id | TEXT | - | 故事ID |
| beat_id | TEXT | - | 分镜ID |
| asset_id | TEXT | - | 资产ID |
| status | TEXT | DEFAULT 'pending', CHECK IN ('pending','generating','completed','failed','cancelled','retrying') | 任务状态 |
| input_params | TEXT | - | 输入参数JSON |
| output_path | TEXT | - | 输出路径 |
| output_url | TEXT | - | 输出URL |
| error_message | TEXT | - | 错误信息 |
| retry_count | INTEGER | DEFAULT 0 | 重试次数 |
| priority | TEXT | DEFAULT 'normal' | 优先级 |
| next_retry_at | INTEGER | - | 下次重试时间 |
| last_attempt_at | INTEGER | - | 最后尝试时间 |
| provider_id | TEXT | - | AI提供商ID |
| model_id | TEXT | - | 模型ID |
| estimated_cost | REAL | - | 预估费用 |
| completed_at | INTEGER | - | 完成时间 |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

**索引**：idx_tasks_status(status, created_at)、idx_tasks_story(story_id, beat_id)、idx_tasks_priority(priority, status)、idx_tasks_next_retry(next_retry_at)

#### C.2 资产与模板表（3张）

##### C.2.1 media_assets（媒体资产表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 资产名称 |
| description | TEXT | - | 资产描述 |
| type | TEXT | CHECK IN ('image','video') | 媒体类型 |
| url | TEXT | - | 远程URL |
| thumbnail_url | TEXT | - | 缩略图URL |
| tags | TEXT | - | 标签JSON |
| file_size | INTEGER | - | 文件大小 |
| mime_type | TEXT | - | MIME类型 |
| width | INTEGER | - | 宽度 |
| height | INTEGER | - | 高度 |
| duration | INTEGER | - | 时长（秒） |
| bound_to_type | TEXT | - | 绑定实体类型 |
| bound_to_id | TEXT | - | 绑定实体ID |
| bound_to_name | TEXT | - | 绑定实体名称 |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

##### C.2.2 video_templates（视频模板表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 模板名称 |
| description | TEXT | - | 模板描述 |
| category | TEXT | - | 分类 |
| total_duration | INTEGER | - | 总时长 |
| shots_json | TEXT | - | 镜头列表JSON |
| tags | TEXT | - | 标签JSON |
| thumbnail_url | TEXT | - | 缩略图URL |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

##### C.2.3 ast_templates（AST模板表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 模板名称 |
| description | TEXT | - | 模板描述 |
| category | TEXT | - | 分类 |
| genre | TEXT | - | 题材 |
| tone | TEXT | - | 基调 |
| tags | TEXT | - | 标签JSON |
| author | TEXT | - | 作者 |
| total_duration | INTEGER | - | 总时长 |
| beats_count | INTEGER | DEFAULT 0 | 分镜数 |
| characters_count | INTEGER | DEFAULT 0 | 角色数 |
| scenes_count | INTEGER | DEFAULT 0 | 场景数 |
| ast_file_path | TEXT | - | AST文件路径 |
| ast_file_size | INTEGER | - | AST文件大小 |
| is_public | INTEGER | DEFAULT 0 | 是否公开 |
| usage_count | INTEGER | DEFAULT 0 | 使用次数 |
| rating | REAL | DEFAULT 0 | 评分 |
| version | INTEGER | DEFAULT 1 | 版本号 |
| parent_template_id | TEXT | - | 父模板ID |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

**索引**：idx_ast_templates_category(category)、idx_ast_templates_name(name)、idx_ast_templates_usage(usage_count DESC)、idx_ast_templates_created(created_at DESC)

##### C.2.4 storyboard_assets（故事板资产表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| script | TEXT | - | 脚本 |
| duration | INTEGER | DEFAULT 0 | 时长 |
| shot_type | TEXT | CHECK IN ('wide','medium','close_up','extreme_close_up','over_shoulder','aerial','tracking','static') | 镜头类型 |
| preview_path | TEXT | - | 预览路径 |
| character_ids | TEXT | - | 角色ID列表JSON |
| scene_id | TEXT | - | 场景ID |
| project_id | TEXT | - | 项目ID |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

##### C.2.5 collections（收藏集表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 收藏集名称 |
| + 7字段基础列 | - | - | owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id |

#### C.3 关联表（5张，无基础列）

##### C.3.1 story_characters（故事-角色关联表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| story_id | TEXT | FK→stories(id), NOT NULL, PK | 故事ID |
| character_id | TEXT | FK→characters(id), NOT NULL, PK | 角色ID |
| display_order | INTEGER | DEFAULT 0 | 显示顺序 |

##### C.3.2 story_scenes（故事-场景关联表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| story_id | TEXT | FK→stories(id), NOT NULL, PK | 故事ID |
| scene_id | TEXT | FK→scenes(id), NOT NULL, PK | 场景ID |
| display_order | INTEGER | DEFAULT 0 | 显示顺序 |

##### C.3.3 story_elements（故事-元素关联表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| story_id | TEXT | FK→stories(id), NOT NULL, PK | 故事ID |
| element_id | TEXT | FK→elements(id), NOT NULL, PK | 元素ID |
| binding_config | TEXT | - | 绑定配置JSON |

##### C.3.4 collection_assets（收藏集-资产关联表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| collection_id | TEXT | FK→collections(id), NOT NULL, PK | 收藏集ID |
| asset_type | TEXT | CHECK IN ('character','scene','storyboard','story','media_asset') | 资产类型 |
| asset_id | TEXT | NOT NULL, PK | 资产ID |

##### C.3.5 asset_tags（资产标签表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| asset_id | TEXT | NOT NULL, PK | 资产ID |
| asset_type | TEXT | CHECK IN ('character','scene','prop','reference') | 资产类型 |
| tag | TEXT | NOT NULL, PK | 标签名 |
| confidence | REAL | DEFAULT 1.0, CHECK BETWEEN 0 AND 1 | 置信度 |

**索引**：idx_asset_tags_tag(tag)、idx_asset_tags_lookup(asset_type, tag)

#### C.4 缓存表（6张，无基础列）

##### C.4.1 video_cache（视频缓存表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| task_id | TEXT | PK | 任务ID |
| file_path | TEXT | NOT NULL | 本地文件路径 |
| original_url | TEXT | - | 原始URL |
| mime_type | TEXT | - | MIME类型 |
| file_size | INTEGER | - | 文件大小 |
| cached_at | INTEGER | DEFAULT (strftime('%s','now')) | 缓存时间 |

**索引**：idx_video_cache_cached_at(cached_at)、idx_video_cache_size(file_size)

##### C.4.2 image_cache（图片缓存表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| source_url | TEXT | PK | 源URL |
| file_path | TEXT | NOT NULL | 本地文件路径 |
| mime_type | TEXT | - | MIME类型 |
| file_size | INTEGER | - | 文件大小 |
| width | INTEGER | - | 图片宽度 |
| height | INTEGER | - | 图片高度 |
| cached_at | INTEGER | DEFAULT (strftime('%s','now')) | 缓存时间 |
| last_accessed_at | INTEGER | DEFAULT (strftime('%s','now')) | 最后访问时间 |

**索引**：idx_image_cache_cached_at(cached_at)、idx_image_cache_last_accessed(last_accessed_at)

##### C.4.3 error_logs（错误日志表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | NOT NULL, PK | 自增ID |
| message | TEXT | NOT NULL | 错误消息 |
| stack | TEXT | - | 堆栈信息 |
| timestamp | INTEGER | - | 时间戳 |
| component | TEXT | - | 组件名 |

##### C.4.4 sessions（会话表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | NOT NULL | 会话ID |
| key | TEXT | NOT NULL | 键名 |
| value | TEXT | - | 值 |
| timestamp | INTEGER | - | 时间戳 |

##### C.4.5 auto_saves（自动保存表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | NOT NULL | 记录ID |
| type | TEXT | CHECK IN ('character','scene','story') | 实体类型 |
| data_json | TEXT | - | 数据JSON |
| timestamp | INTEGER | - | 时间戳 |

**索引**：idx_auto_saves_type(type)、idx_auto_saves_timestamp(timestamp)

##### C.4.6 file_index（文件索引表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | NOT NULL | 文件ID |
| file_path | TEXT | NOT NULL, UNIQUE | 文件路径 |
| file_name | TEXT | - | 文件名 |
| file_size | INTEGER | - | 文件大小 |
| file_hash | TEXT | - | 文件哈希 |
| asset_id | TEXT | - | 关联资产ID |
| asset_type | TEXT | - | 关联资产类型 |
| created_at | INTEGER | - | 创建时间 |
| last_accessed_at | INTEGER | - | 最后访问时间 |
| access_count | INTEGER | DEFAULT 0 | 访问次数 |
| is_temporary | INTEGER | DEFAULT 0 | 是否临时文件 |
| expires_at | INTEGER | - | 过期时间 |

**索引**：idx_file_hash(file_hash)、idx_file_expires(expires_at) WHERE is_temporary = 1

#### C.5 同步表（3张，无基础列）

##### C.5.1 sync_changelog（同步变更日志表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| entity_type | TEXT | NOT NULL | 实体类型 |
| entity_id | TEXT | NOT NULL | 实体ID |
| operation | TEXT | NOT NULL, CHECK IN ('insert','update','delete') | 操作类型 |
| vector_clock | TEXT | NOT NULL, DEFAULT '{}' | 向量时钟JSON |
| data | TEXT | - | 变更数据JSON |
| timestamp | INTEGER | NOT NULL, DEFAULT (strftime('%s','now')) | 时间戳 |
| synced | INTEGER | NOT NULL, DEFAULT 0 | 是否已同步 |
| device_id | TEXT | NOT NULL | 设备ID |

**索引**：idx_changelog_synced(synced, timestamp)、idx_changelog_entity(entity_type, entity_id)

##### C.5.2 sync_meta（同步元数据表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| key | TEXT | PK | 键名 |
| value | TEXT | NOT NULL | 值 |

##### C.5.3 sync_conflict_backup（同步冲突备份表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| entity_type | TEXT | NOT NULL | 实体类型 |
| entity_id | TEXT | NOT NULL | 实体ID |
| local_data | TEXT | - | 本地数据JSON |
| remote_data | TEXT | - | 远程数据JSON |
| resolved_at | INTEGER | NOT NULL | 解决时间 |
| created_at | INTEGER | DEFAULT (strftime('%s','now')) | 创建时间 |

#### C.6 系统表（2张）

##### C.6.1 users（用户表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 用户ID |
| username | TEXT | DEFAULT '本地用户' | 用户名 |
| role | TEXT | DEFAULT 'owner', CHECK IN ('owner','admin','member','viewer') | 角色 |
| preferences | TEXT | DEFAULT '{}' | 偏好设置JSON |
| created_at | INTEGER | DEFAULT (strftime('%s','now')) | 创建时间 |
| updated_at | INTEGER | DEFAULT (strftime('%s','now')) | 更新时间 |

##### C.6.2 schema_version（数据库版本表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| version | INTEGER | PK | 版本号 |
| applied_at | INTEGER | DEFAULT (strftime('%s','now')) | 应用时间 |

#### C.7 JSON容器字段汇总

| 表名 | JSON容器字段 | 对应接口 | 用途 |
|------|-------------|---------|------|
| video_tasks | config | VideoTaskConfig | 视频生成参数（分辨率、帧率、模型等） |
| video_tasks | provider | VideoTaskProvider | AI提供商信息（provider_id、model_id、api_key引用） |
| video_tasks | media_refs | MediaRefs | 媒体引用（参考图、参考视频URL） |
| video_tasks | tracking | TrackingInfo | 追踪信息（重试次数、耗时、错误分类） |
| story_beats | camera | CameraConfig | 镜头参数（运动方式、角度、速度） |
| story_beats | generation | GenerationConfig | 生成配置（模型、参数、提示词模板） |
| story_beats | meta | BeatMeta | 分镜元数据（标签、自定义字段） |
| characters | appearance | AppearanceConfig | 外观描述（发型、肤色、体型等） |
| characters | generation | GenerationConfig | 生成配置 |
| characters | config | CharacterConfig | 角色配置（默认参数、偏好） |
| characters | meta | CharacterMeta | 角色元数据 |
| scenes | appearance | AppearanceConfig | 场景外观（色调、光照、季节） |
| scenes | atmosphere | AtmosphereConfig | 场景氛围（天气、时间段、情绪） |
| scenes | generation | GenerationConfig | 生成配置 |
| scenes | config | SceneConfig | 场景配置 |

**JSON容器更新模式**：使用 `json_set(COALESCE(container, '{}'), '$.key', ?)` 进行部分更新，避免全量覆盖。

**JSON容器解析模式**：使用 `parseXxx()` 函数（来自 json-schemas.ts）安全解析，解析失败返回默认值而非抛出异常。

---

### 附录D：项目目录树

#### D.1 渲染进程（src/）

```
src/
├── __tests__/                          # 集成测试与E2E测试
│   ├── components/                     # 组件测试
│   ├── e2e/                            # 端到端测试
│   ├── hooks/                          # Hook测试
│   ├── lib/                            # 库函数测试
│   ├── mocks/                          # 测试Mock工厂
│   ├── modules/                        # 模块集成测试
│   ├── test-helpers/                   # 测试辅助工具
│   └── utils/                          # 测试工具函数
├── app/                                # Next.js页面与布局
│   ├── api/                            # API路由（开发模式HTTP API）
│   │   ├── config/                     # 配置API
│   │   ├── image/normalize/            # 图片标准化API
│   │   ├── prompt/build/               # 提示词构建API
│   │   ├── secure-config/              # 安全配置API
│   │   ├── story/replace-placeholders/ # 故事占位符替换API
│   │   ├── sync/                       # 同步API（pull/push/status）
│   │   ├── test-connection/            # 连接测试API
│   │   ├── upload/                     # 文件上传API
│   │   └── validate/                   # 验证API
│   ├── asset-library/                  # 资产库页面
│   ├── characters/                     # 角色管理页面
│   ├── create/                         # 创建页面
│   ├── media/                          # 媒体页面
│   ├── quick-generate/                 # 快速生成页面
│   ├── scenes/                         # 场景管理页面
│   ├── settings/                       # 设置页面
│   ├── story/                          # 故事编辑页面
│   │   ├── beat/[beatId]/              # 分镜详情页
│   │   └── StoryProvider.tsx           # 故事上下文提供者
│   ├── video-tasks/                    # 视频任务页面
│   ├── ClientProviders.tsx             # 客户端Provider聚合
│   ├── MigrationInitializer.tsx        # 数据库迁移初始化器
│   ├── SidebarWithSearch.tsx           # 带搜索的侧边栏
│   ├── layout.tsx                      # 根布局
│   └── page.tsx                        # 首页
├── config/                             # 配置常量
│   ├── constants.ts                    # 全局常量（端口、请求头等）
│   └── ports.ts                        # 端口配置
├── domain/                             # 领域层（纯类型，无外部依赖）
│   ├── ports/                          # Port接口定义
│   │   ├── ai-provider-port.ts         # AI提供者Port（IVideoProvider等）
│   │   ├── element-manager-port.ts     # 元素管理器Port
│   │   ├── reference-engine-port.ts    # 参考引擎Port
│   │   ├── storage-port.ts             # 存储Port（IVideoTaskStorage等）
│   │   └── sync-port.ts               # 同步Port（ISyncStorage）
│   ├── schemas/                        # 领域Schema验证
│   │   ├── api.ts                      # API Schema
│   │   ├── character.ts                # 角色Schema
│   │   ├── media.ts                    # 媒体Schema
│   │   ├── scene.ts                    # 场景Schema
│   │   ├── shot-system.ts              # 镜头系统Schema
│   │   └── story.ts                    # 故事Schema
│   ├── services/                       # 领域服务
│   │   ├── beat-workflow-service.ts    # 分镜工作流服务
│   │   ├── reference-check.ts          # 参考检查
│   │   ├── reference-resolver.ts       # 参考解析器
│   │   └── story-generation-service.ts # 故事生成服务
│   ├── types/                          # 领域类型
│   │   ├── cloud-provider.ts           # 云提供者类型
│   │   ├── electron-api.ts             # Electron API类型
│   │   ├── error-codes.ts              # 错误码定义
│   │   ├── result.ts                   # Result类型（Ok/Err）
│   │   ├── sync.ts                     # 同步类型
│   │   └── video-model.ts              # 视频模型类型
│   └── utils/                          # 领域工具函数
│       ├── beat-prompt-builder.ts      # 分镜提示词构建器
│       ├── prompt-vocabulary.ts        # 提示词词汇表
│       └── shot-prompt.ts              # 镜头提示词工具
├── infrastructure/                     # 基础设施层
│   ├── ai-providers/                   # AI提供者实现
│   │   ├── api-config/                 # API配置管理
│   │   │   ├── detect.ts              # API密钥自动检测
│   │   │   ├── init.ts                # 配置初始化
│   │   │   ├── migrate.ts             # 配置迁移
│   │   │   ├── server-key.ts          # 服务器密钥
│   │   │   ├── server.ts              # 服务器配置
│   │   │   ├── storage.ts             # 配置存储
│   │   │   ├── templates.ts           # 配置模板
│   │   │   └── types.ts               # 配置类型
│   │   ├── model-adapter/             # 模型适配器
│   │   ├── providers/                 # 云提供者注册
│   │   │   ├── cloud-providers.ts     # 云提供者定义
│   │   │   └── index.ts              # 提供者索引
│   │   ├── api-cache.ts               # API缓存
│   │   ├── config-status.ts           # 配置状态
│   │   ├── config.ts                  # AI配置
│   │   ├── core.ts                    # AI核心
│   │   ├── enhanced-video.ts          # 增强视频生成
│   │   ├── errors.ts                  # AI错误类型
│   │   ├── image-normalization.ts     # 图片标准化
│   │   ├── image.ts                   # 图片生成
│   │   ├── model-capabilities.ts      # 模型能力查询
│   │   ├── multi-api.ts              # 多API管理
│   │   ├── offline-queue.ts           # 离线队列
│   │   ├── outfit-synthesis.ts        # 服装合成
│   │   ├── services.ts                # AI服务
│   │   ├── text.ts                    # 文本生成
│   │   ├── types.ts                   # AI类型定义
│   │   ├── utils.ts                   # AI工具函数
│   │   ├── video-service.ts           # 视频服务
│   │   └── video.ts                   # 视频生成
│   ├── api/                           # HTTP API客户端
│   │   ├── client.ts                  # API客户端
│   │   ├── endpoints.ts               # API端点定义
│   │   └── index.ts                   # API索引
│   ├── database/                      # Drizzle ORM Repository
│   │   ├── character-repository.ts    # 角色Repository
│   │   ├── element-repository.ts      # 元素Repository
│   │   ├── media-asset-repository.ts  # 媒体资产Repository
│   │   ├── scene-repository.ts        # 场景Repository
│   │   └── story-repository.ts        # 故事Repository
│   ├── di/                            # 依赖注入容器
│   │   ├── container.ts              # DI容器（53个Token）
│   │   ├── registry.ts               # 模块注册表
│   │   └── types.ts                  # DI类型定义
│   ├── monitoring/                    # 性能监控
│   │   ├── memory-leak-detector.ts    # 内存泄漏检测
│   │   └── performance-monitor.ts     # 性能监控器
│   ├── network/                       # 网络层
│   │   ├── interceptors/              # 请求拦截器
│   │   │   ├── cache.interceptor.ts   # 缓存拦截器
│   │   │   ├── circuit-breaker.interceptor.ts # 熔断拦截器
│   │   │   ├── lifecycle.interceptor.ts # 生命周期拦截器
│   │   │   ├── logging.interceptor.ts # 日志拦截器
│   │   │   └── retry.interceptor.ts   # 重试拦截器
│   │   ├── circuit-breaker.ts         # 熔断器
│   │   ├── download-manager.ts        # 下载管理器
│   │   ├── network-monitor.ts         # 网络监控
│   │   ├── network.config.ts          # 网络配置
│   │   ├── profiles.ts                # 网络配置档案
│   │   ├── request-lifecycle.ts       # 请求生命周期
│   │   ├── resilient-fetch.ts         # 弹性Fetch
│   │   └── retry-executor.ts          # 重试执行器
│   ├── server/                        # HTTP API服务端
│   │   ├── api-utils.ts               # API工具函数
│   │   └── index.ts                   # 服务端入口
│   ├── storage/                       # 存储层
│   │   ├── characters/                # 角色存储
│   │   │   ├── index.ts              # 角色存储入口
│   │   │   ├── outfit-manager.ts      # 服装管理器
│   │   │   └── parser.ts             # 角色数据解析器
│   │   ├── elements/                  # 元素存储
│   │   │   ├── commands.ts           # 元素写操作
│   │   │   └── queries.ts            # 元素读操作
│   │   ├── stories/                   # 故事存储
│   │   │   ├── beat-transformer.ts    # 分镜转换器
│   │   │   ├── index.ts              # 故事存储入口
│   │   │   └── relations.ts          # 故事关联查询
│   │   ├── video-tasks/               # 视频任务存储
│   │   │   ├── bulk-operations.ts     # 批量操作
│   │   │   ├── index.ts              # 视频任务存储入口
│   │   │   ├── json-schemas.ts        # JSON容器Schema
│   │   │   └── parser.ts             # 视频任务数据解析器
│   │   ├── auto-save.ts               # 自动保存存储
│   │   ├── characters.ts              # 角色存储（旧版）
│   │   ├── collections.ts             # 收藏集存储
│   │   ├── core.ts                    # 存储核心
│   │   ├── db.ts                      # 数据库连接
│   │   ├── elements.ts                # 元素存储（旧版）
│   │   ├── error-logs.ts              # 错误日志存储
│   │   ├── image-cache.ts             # 图片缓存存储
│   │   ├── import-export.ts           # 导入导出存储
│   │   ├── scenes.ts                  # 场景存储
│   │   ├── schema-registry.ts         # Schema注册表
│   │   ├── sessions.ts                # 会话存储
│   │   ├── sql-sanitizer.ts           # SQL安全过滤
│   │   ├── sqlite-core.ts             # SQLite核心操作
│   │   ├── stories.ts                 # 故事存储（旧版）
│   │   ├── storyboard.ts              # 故事板存储
│   │   ├── templates.ts               # 模板存储
│   │   ├── versions.ts                # 版本存储
│   │   ├── video-cache.ts             # 视频缓存存储
│   │   └── video-tasks.ts             # 视频任务存储（旧版）
│   ├── video-utils/                   # 视频工具
│   │   ├── index.ts                   # 视频工具入口
│   │   └── video-codec.ts             # 视频编解码检测
│   └── api-config-facade.ts           # API配置门面
├── modules/                           # 业务模块层（12个模块）
│   ├── asset/                         # 资产管理模块
│   │   ├── asset-library/             # 资产库子域
│   │   ├── hooks/                     # 资产Hook
│   │   ├── import-export/             # 导入导出子域
│   │   ├── media-assets/              # 媒体资产管理子域
│   │   └── presentation/              # 资产UI组件
│   ├── character/                     # 角色管理模块
│   │   ├── hooks/                     # 角色Hook
│   │   ├── presentation/              # 角色UI组件
│   │   └── services/                  # 角色服务
│   ├── feedback/                      # 反馈模块
│   │   ├── hooks/                     # 反馈Hook（脏追踪、撤销）
│   │   └── presentation/              # 反馈UI组件
│   ├── integrity/                     # 完整性模块
│   │   ├── hooks/                     # 完整性Hook
│   │   └── services/                  # SQL安全服务
│   ├── persistence/                   # 持久化模块
│   │   ├── hooks/                     # 持久化Hook（自动保存、守护）
│   │   └── services/                  # 事务删除服务
│   ├── prompt/                        # 提示词模块
│   │   ├── base/                      # 基础提示词子域
│   │   ├── beat-image/                # 分镜图片提示词子域
│   │   ├── builder/                   # 提示词构建器子域
│   │   ├── character/                 # 角色提示词子域
│   │   ├── presentation/              # 提示词UI组件
│   │   ├── scene/                     # 场景提示词子域
│   │   ├── server-prompts/            # 服务端提示词子域
│   │   └── video/                     # 视频提示词子域
│   ├── scene/                         # 场景管理模块
│   │   ├── hooks/                     # 场景Hook
│   │   ├── presentation/              # 场景UI组件
│   │   └── services/                  # 场景服务
│   ├── security/                      # 安全模块
│   │   └── hooks/                     # 安全配置Hook
│   ├── shot/                          # 镜头系统模块
│   │   ├── consistency-check/         # 一致性检查子域
│   │   ├── element-binding/           # 元素绑定子域
│   │   ├── feature-extraction/        # 特征提取子域
│   │   ├── reference-check/           # 参考检查子域
│   │   ├── shot-generation/           # 镜头生成子域
│   │   ├── shot-instruction/          # 镜头指令子域
│   │   └── shot-reference/            # 镜头参考子域
│   ├── story/                         # 故事模块
│   │   ├── beat-editor/               # 分镜编辑器子域
│   │   ├── generation/                # 生成子域
│   │   ├── planning/                  # 故事规划子域
│   │   ├── prompt-editor/             # 提示词编辑器子域
│   │   └── template/                  # 模板子域
│   ├── sync/                          # 同步模块
│   │   ├── engine/                    # 同步引擎子域
│   │   └── presentation/              # 同步UI组件
│   └── video/                         # 视频模块
│       ├── cache/                     # 视频缓存子域
│       ├── recovery/                  # 视频恢复子域
│       ├── task-management/           # 任务管理子域
│       │   ├── domain/                # 任务领域（状态机、策略）
│       │   ├── hooks/                 # 任务Hook
│       │   ├── infrastructure/        # 任务基础设施（轮询、时间桥）
│       │   ├── presentation/          # 任务UI组件
│       │   └── services/              # 任务服务
│       └── utils/                     # 视频工具子域
└── shared/                            # 共享层（跨模块通用）
    ├── hooks/                         # 通用Hook
    │   ├── use-current-time.ts        # 当前时间Hook
    │   ├── use-dirty-state.ts         # 脏状态Hook
    │   ├── use-global-keyboard-actions.ts # 全局键盘Hook
    │   ├── use-memory-monitor.ts      # 内存监控Hook
    │   ├── use-network-monitor.ts     # 网络监控Hook
    │   ├── useDebouncedState.ts       # 防抖状态Hook
    │   └── useKeyboardShortcuts.ts    # 快捷键Hook
    ├── presentation/                  # 通用UI组件
    │   ├── BeforeUnloadGuard.tsx       # 离开页面守护
    │   ├── CrashRecoveryDialog.tsx     # 崩溃恢复对话框
    │   ├── DebugOverlay.tsx           # 调试覆盖层
    │   ├── ErrorBoundary.tsx          # 错误边界
    │   ├── KeyboardShortcutsDialog.tsx # 快捷键对话框
    │   ├── MemoryMonitorPanel.tsx      # 内存监控面板
    │   ├── NetworkStatusAlert.tsx      # 网络状态告警
    │   ├── OnboardingGuide.tsx        # 引导指南
    │   ├── PageErrorBoundary.tsx       # 页面级错误边界
    │   ├── PerformanceMonitorPanel.tsx # 性能监控面板
    │   ├── SaveStatusIndicator.tsx     # 保存状态指示器
    │   ├── SearchDialog.tsx           # 搜索对话框
    │   ├── Sidebar.tsx                # 侧边栏
    │   ├── ThemeProvider.tsx          # 主题提供者
    │   ├── ThemeSwitcher.tsx          # 主题切换器
    │   ├── Toast.tsx                  # 消息提示
    │   └── VirtualList.tsx            # 虚拟列表
    ├── sql-safety/                     # SQL安全
    │   ├── schema-registry.ts         # Schema注册表
    │   └── sql-sanitizer.ts           # SQL安全过滤
    ├── types/                          # 共享类型
    │   ├── api.ts                     # API类型
    │   └── ipc.ts                     # IPC类型
    ├── ui/                             # 基础UI组件库
    │   ├── alert.tsx                  # 警告框
    │   ├── app-card.tsx               # 应用卡片
    │   ├── badge.tsx                  # 徽章
    │   ├── button.tsx                 # 按钮
    │   ├── card.tsx                   # 卡片
    │   ├── checkbox.tsx               # 复选框
    │   ├── command.tsx                # 命令面板
    │   ├── confirm-dialog.tsx         # 确认对话框
    │   ├── dialog.tsx                 # 对话框
    │   ├── empty-state.tsx            # 空状态
    │   ├── feedback.tsx               # 反馈组件
    │   ├── input-group.tsx            # 输入组
    │   ├── input.tsx                  # 输入框
    │   ├── label.tsx                  # 标签
    │   ├── loading-state.tsx          # 加载状态
    │   ├── progress.tsx               # 进度条
    │   ├── safe-image.tsx             # 安全图片
    │   ├── select.tsx                 # 选择器
    │   ├── separator.tsx              # 分隔线
    │   ├── slider.tsx                 # 滑块
    │   ├── status-badge.tsx           # 状态徽章
    │   ├── switch.tsx                 # 开关
    │   ├── tabs.tsx                   # 标签页
    │   └── textarea.tsx               # 文本域
    ├── utils/                          # 工具函数
    │   ├── confirm.tsx                # 确认工具
    │   ├── error-classifier.ts        # 错误分类器
    │   ├── file-download.ts           # 文件下载
    │   ├── image-url.ts               # 图片URL解析
    │   ├── performance.ts             # 性能工具
    │   ├── platform.ts                # 平台检测
    │   ├── preferences.ts             # 偏好设置
    │   ├── safe-json.ts               # 安全JSON解析
    │   ├── toast-bridge.ts            # Toast桥接（非React环境）
    │   └── url-validation.ts          # URL验证
    ├── video-utils/                    # 视频工具
    │   ├── video-codec.ts             # 视频编解码检测
    │   └── video-frame-extractor.ts   # 视频帧提取
    ├── app-store.ts                    # 全局应用Store
    ├── error-handler.ts                # 全局错误处理
    ├── error-logger.ts                 # 错误日志记录
    ├── event-bus.ts                    # 事件总线
    └── event-types.ts                  # 事件类型定义
```

#### D.2 主进程（electron/src/）

```
electron/src/
├── __tests__/                          # 主进程测试
│   └── prompt-engine.test.ts           # 提示词引擎测试
├── config/                             # 主进程配置
│   ├── config-manager.ts               # 配置管理器
│   ├── index.ts                        # 配置入口
│   └── ports.ts                        # 端口配置
├── database/                           # 数据库层
│   ├── __tests__/                      # 数据库测试
│   │   ├── db-connection.test.ts       # 连接测试
│   │   └── migrations.test.ts          # 迁移测试
│   ├── db-connection.ts                # 数据库连接管理
│   ├── db-schema.ts                    # 数据库Schema定义（28张表）
│   ├── index.ts                        # 数据库入口
│   ├── migrations.ts                   # 数据库迁移框架
│   └── schema-builder.ts              # Schema构建器（声明式表定义）
├── handlers/                           # IPC处理器
│   ├── __tests__/                      # 处理器测试
│   │   └── database.test.ts            # 数据库处理器测试
│   ├── assets.ts                       # 资产处理器
│   ├── config.ts                       # 配置处理器
│   ├── database.ts                     # 数据库处理器
│   ├── export.ts                       # 导出处理器
│   ├── secure-config.ts                # 安全配置处理器
│   ├── sync.ts                         # 同步处理器
│   └── test-connection.ts              # 连接测试处理器
├── lifecycle/                          # 应用生命周期管理
│   ├── cleanup.ts                      # 清理逻辑
│   ├── index.ts                        # 生命周期入口
│   ├── manager.ts                      # 生命周期管理器
│   ├── recovery.ts                     # 崩溃恢复
│   └── states.ts                       # 生命周期状态
├── logging/                            # 日志系统
│   ├── __tests__/                      # 日志测试
│   │   └── logger.test.ts              # 日志器测试
│   ├── transports/                     # 日志传输
│   │   ├── console.transport.ts        # 控制台传输
│   │   └── file.transport.ts           # 文件传输
│   ├── index.ts                        # 日志入口
│   ├── logger.ts                       # 日志器核心
│   └── types.ts                        # 日志类型
├── plugins/                            # 插件系统
│   ├── providers/                      # 内置AI提供者（10个）
│   │   ├── anthropic.ts                # Anthropic (Claude)
│   │   ├── google.ts                   # Google (Gemini/Veo)
│   │   ├── kuaishou.ts                 # 快手 (Kling)
│   │   ├── minimax.ts                  # MiniMax (Hailuo)
│   │   ├── openai-compatible.ts        # OpenAI兼容（通用）
│   │   ├── openai-sora.ts              # OpenAI Sora
│   │   ├── pixverse.ts                 # PixVerse
│   │   ├── seedance.ts                 # Seedance (字节)
│   │   ├── volcengine.ts               # 火山引擎
│   │   └── zhipu.ts                    # 智谱 (CogVideoX)
│   ├── base-provider.ts                # 提供者基类
│   ├── index.ts                        # 插件入口
│   ├── registry.ts                     # 插件注册表
│   ├── types.ts                        # 插件类型
│   ├── user-plugin-loader.ts           # 用户插件加载器
│   ├── user-plugin-schema.ts           # 用户插件Schema
│   └── utils.ts                        # 插件工具
├── security/                           # 安全模块
│   ├── key-storage/                    # 密钥存储
│   │   ├── __tests__/                  # 密钥存储测试
│   │   ├── strategies/                 # 存储策略
│   │   │   ├── plaintext-fallback.strategy.ts # 明文回退策略
│   │   │   └── safe-storage.strategy.ts # 安全存储策略
│   │   ├── key-storage.ts              # 密钥存储核心
│   │   └── types.ts                    # 密钥存储类型
│   ├── ssrf-guard/                     # SSRF防护
│   │   ├── __tests__/                  # SSRF测试
│   │   └── ssrf-guard.ts              # SSRF防护核心
│   └── index.ts                        # 安全入口
├── types/                              # 主进程类型
│   ├── api.ts                          # API类型
│   ├── database.ts                     # 数据库类型
│   ├── ipc.ts                          # IPC类型
│   ├── sql-modules.d.ts                # SQL模块声明
│   └── story.ts                        # 故事类型
├── api-gateway.ts                      # API网关
├── api-server.ts                       # HTTP API服务器
├── consistency-check.ts                # 一致性检查
├── db-interface.ts                     # 数据库接口
├── main-common.ts                      # 主进程共享逻辑
├── main-dev.ts                         # 开发模式入口
├── main.ts                             # 生产模式入口
├── menu.ts                             # 应用菜单
├── preload.ts                          # 预加载脚本（IPC桥接）
├── prompt-engine.ts                    # 提示词引擎
├── prompt-service.ts                   # 提示词服务
├── protocol.ts                         # 自定义协议
├── reference-check.ts                  # 参考检查
├── reference-engine.ts                 # 参考引擎
├── story-service.ts                    # 故事服务
├── storyboard-generation.ts            # 故事板生成
├── sync-http-client.ts                 # 同步HTTP客户端
├── video-recovery.ts                   # 视频恢复
├── video-task-service.ts               # 视频任务服务
├── video-tracker.ts                    # 视频追踪器
└── visual-consistency-check.ts         # 视觉一致性检查
```

#### D.3 项目根目录关键文件

```
项目根目录/
├── build-electron.ps1                  # Electron构建脚本（PowerShell）
├── electron-builder.yml                # electron-builder配置
├── next.config.ts                      # Next.js配置（output: "export"）
├── package.json                        # 项目依赖
├── tsconfig.json                       # TypeScript配置（渲染进程）
├── electron/tsconfig.json              # TypeScript配置（主进程）
├── vitest.config.ts                    # Vitest测试配置
├── eslint.config.mjs                   # ESLint配置（含架构守卫规则）
├── scripts/
│   ├── check-architecture.mjs          # DDD架构扫描脚本
│   └── check-module-api-consistency.mjs # 模块API一致性检查脚本
└── docs/                               # 文档目录
```

---

### 附录E：术语表

本术语表涵盖项目中使用的核心架构概念、设计模式和专有名词，按字母顺序排列。

| 术语 | 英文 | 定义 | 项目中的应用 |
|------|------|------|-------------|
| AST模板 | AST Template | Animation Studio Template的缩写，项目专有的故事板模板格式 | `ast_templates`表存储模板元数据，`.ast`文件存储模板内容 |
| Barrel文件 | Barrel File | 模块的公共API入口文件（通常为`index.ts`），负责re-export所有公开接口 | 每个模块的`index.ts`是barrel文件，其他模块只能通过`@/modules/xxx`导入 |
| CRUD | Create, Read, Update, Delete | 数据操作的四种基本模式 | `use-character-crud.ts`、`use-scene-crud.ts`等Hook封装CRUD操作 |
| Circuit Breaker | 熔断器 | 一种容错模式，当连续失败次数超过阈值时自动断开请求，防止级联故障 | `infrastructure/network/circuit-breaker.ts`实现，有Closed/Open/HalfOpen三种状态 |
| DDD | Domain-Driven Design | 领域驱动设计，一种以业务领域为核心的软件设计方法论 | 项目整体采用DDD架构，分为domain/shared/infrastructure/modules/app五层 |
| DI | Dependency Injection | 依赖注入，一种实现控制反转的设计模式，将依赖的创建和管理交给外部容器 | `infrastructure/di/container.ts`管理53个Token，模块通过`container.xxx`获取依赖 |
| Event Bus | 事件总线 | 发布-订阅模式的实现，允许模块间松耦合通信 | `shared/event-bus.ts`提供全局事件总线，支持`emit`/`on`/`off`操作 |
| Feature Group | 功能组 | 数据库表按功能分组的标记，控制表的创建 | `SCHEMA_FEATURES`控制core/video/sync/templates/assets等功能组的表创建 |
| IPC | Inter-Process Communication | 进程间通信，Electron中主进程与渲染进程之间的消息传递机制 | `preload.ts`定义35个IPC通道，5级权限（READONLY→READWRITE→DANGEROUS→SYSTEM→SECURE） |
| JSON容器 | JSON Container | 将易变字段存储为JSON字符串的数据库设计模式，避免频繁ALTER TABLE | 业务表的`config`、`provider`、`appearance`等字段使用JSON容器，通过`parseXxx()`解析 |
| Keyframe Chain | 关键帧链 | 视频生成中相邻分镜的首帧-末帧对链，确保视觉连续性 | `stories.keyframe_chain_valid`标记链的有效性，`generateFramePair`生成首末帧对 |
| Module Registry | 模块注册表 | DI容器中管理Token注册和实例化的核心组件 | `infrastructure/di/registry.ts`实现单例模式，支持`overrideToken`用于测试 |
| Object URL | 对象URL | 浏览器中通过`URL.createObjectURL`创建的本地文件引用 | `video-cache`模块提供`registerObjectUrl`/`revokeObjectUrl`/`getObjectUrl`管理 |
| Port | 端口接口 | 六边形架构中的端口概念，定义模块与外部系统的交互契约 | `domain/ports/`定义IVideoProvider、ICharacterStorage等Port接口 |
| Preload Script | 预加载脚本 | Electron中在渲染进程加载前执行的脚本，负责安全地暴露主进程API | `electron/src/preload.ts`通过`contextBridge.exposeInMainWorld`暴露`electronAPI` |
| Resilient Fetch | 弹性Fetch | 具有重试、超时、熔断能力的HTTP请求封装 | `infrastructure/network/resilient-fetch.ts`实现，集成Circuit Breaker和Retry Executor |
| Result类型 | Result Type | 函数式编程中的错误处理模式，用`Ok<T>`和`Err<E>`替代异常 | `domain/types/result.ts`定义`Result<T>`，所有业务操作返回Result而非抛出异常 |
| Schema Builder | Schema构建器 | 声明式数据库表定义工具，自动生成CREATE TABLE SQL | `electron/src/database/schema-builder.ts`接受`TableDef`对象，自动添加7字段基础列 |
| Soft Delete | 软删除 | 不物理删除记录，而是标记`is_deleted=1`和`deleted_at`时间戳 | 所有业务表的7字段基础列包含`is_deleted`和`deleted_at` |
| SSRF | Server-Side Request Forgery | 服务端请求伪造，一种安全攻击方式，通过服务器发起对内部网络的请求 | `electron/src/security/ssrf-guard.ts`检测并阻断对私有IP和链路本地地址的请求 |
| State Machine | 状态机 | 有限状态自动机，定义对象的状态及其合法转换 | `video/task-management/domain/task-machine.ts`定义视频任务的6种状态和转换规则 |
| Sub-domain | 子域 | DDD中模块内的业务子领域划分，每个子域有独立的contract.json | 如`video`模块包含`cache`、`recovery`、`task-management`、`utils`四个子域 |
| Sync Engine | 同步引擎 | 基于向量时钟的多设备数据同步系统 | `modules/sync/engine/`实现，使用`sync_changelog`表记录变更，向量时钟解决冲突 |
| TaskMachine | 任务状态机 | 视频任务生命周期管理的核心状态机 | 6种状态：pending→generating→completed/failed/cancelled，支持retrying状态 |
| Token | DI令牌 | 依赖注入容器中标识和获取依赖的唯一键 | `createToken(name, factory)`创建Token，53个Token分为A-F六个类别 |
| Vector Clock | 向量时钟 | 分布式系统中用于因果排序的逻辑时钟，每个设备维护自己的计数器 | `sync_changelog.vector_clock`存储JSON格式的向量时钟`{"deviceA":3,"deviceB":2}` |
| WAL | Write-Ahead Logging | SQLite的预写日志模式，允许并发读写，提高性能 | 数据库默认启用WAL模式，`PRAGMA journal_mode = WAL` |
| withTransitionGuard | 转换守护 | 视频任务状态转换的守护函数，防止非法状态转换 | 开发模式下抛出`TransitionError`，生产模式下静默剥离非法状态字段 |
| withRetry | 重试包装 | 对SQLite操作进行自动重试的包装函数，处理SQLITE_BUSY错误 | `infrastructure/storage/sqlite-core.ts`提供，默认重试3次，指数退避 |

---

*文档版本：2026-05-26 | 基于 AI Animation Studio 源码自动生成*