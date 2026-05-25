# AI Animation Studio 完整技术文档

**版本**: 0.6.0-beta.1
**生成日期**: 2026-05-18
**文档版本**: v20260518-complete

---

## 第一部分：项目基础

---

### 1. 项目概览

#### 1.1 项目定位

AI Animation Studio 是一个**本地优先**的 AI 驱动动画制作工具，支持从故事创作到视频生成的完整工作流。项目同时构建 Web 端 (Next.js) 和桌面端 (Electron)，面向国内主流 AI 视频生成平台。

核心特性：
- **本地优先**：所有数据存储在本地 SQLite，无需联网即可使用
- **双平台**：Web 端 (sql.js WASM) + 桌面端 (better-sqlite3 原生)
- **AI 驱动**：集成 6+ 国内 AI 视频生成平台
- **完整工作流**：故事创作 → 分镜设计 → 关键帧生成 → 视频生成

#### 1.2 技术栈全景

| 层次 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 前端框架 | Next.js (App Router) | 16.2.2 | SSR/SSG 页面与 API 路由 |
| UI 库 | React | 19 | 组件化 UI |
| 语言 | TypeScript | 5.x | 类型安全 |
| 状态管理 | Zustand | 5.x | 全局/局部 Store |
| 数据验证 | Zod | 4.x | Schema 验证 + 类型推导 |
| UI 组件 | shadcn/ui + Tailwind CSS | 4.x | 基础组件 + 原子化 CSS |
| 图标 | Lucide React | — | 图标库 |
| 数据库 | better-sqlite3 / sql.js | — | 本地持久化 |
| ORM | Drizzle ORM | — | 类型安全查询 |
| 桌面端 | Electron | — | 桌面应用 |
| 测试 | Vitest | — | 单元/组件测试 |
| 构建 | Webpack (Next.js) | — | Web 构建 |
| 包管理 | npm | 9+ | 依赖管理 |

#### 1.3 核心功能矩阵

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
| 云端同步 | 多设备数据同步 | sync |
| URL 安全验证 | 阻止内网请求/SSRF 防护 | shared/utils |

#### 1.4 双模式运行架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AI Animation Studio                             │
│                                                                     │
│  ┌──────────────────────────┐    ┌──────────────────────────────┐  │
│  │     Web Mode (Next.js)   │    │   Desktop Mode (Electron)    │  │
│  │                          │    │                              │  │
│  │  ┌────────────────────┐  │    │  ┌────────────────────────┐  │  │
│  │  │  Browser           │  │    │  │  Chromium WebView      │  │  │
│  │  │  + sql.js (WASM)   │  │    │  │  + better-sqlite3     │  │  │
│  │  └────────────────────┘  │    │  │  (WAL 模式, 强制)      │  │  │
│  │                          │    │  └────────────────────────┘  │  │
│  │  ┌────────────────────┐  │    │  ┌────────────────────────┐  │  │
│  │  │  API Routes        │  │    │  │  Main Process          │  │  │
│  │  │  (Serverless)      │  │    │  │  + IPC Handlers        │  │  │
│  │  │                    │  │    │  │  + Safe Storage        │  │  │
│  │  └────────────────────┘  │    │  │  + Auto Update         │  │  │
│  │                          │    │  │  + Auto Backup         │  │  │
│  └──────────────────────────┘    │  │  + ENOSPC Detection   │  │  │
│                                   │  └────────────────────────┘  │  │
│                                   └──────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    共享代码层 (src/)                           │  │
│  │  domain/ + modules/ + infrastructure/ + shared/              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

#### 1.5 DDD + 六边形架构原则

| 原则 | 实现 |
|------|------|
| 领域层不依赖基础设施 | `domain/ports/` 定义接口，`infrastructure/` 提供实现 |
| 子域契约驱动 | 每个子域有 `contract.json` 定义公共 API |
| Result Monad | 不使用异常，统一 `Result<T, E>` 返回 |
| Zod Schema 即类型 | Schema 定义 → `z.infer<typeof schema>` 推导类型 |
| 三级导出 | `module/index.ts → subdomain/index.ts → 内部文件` |
| 依赖注入 | `container` 全局容器管理服务实例 (49 个 Token) |
| 端口接口注入 | 新增 `IElementManager`, `IReferenceEngine` 解耦领域与基础设施 |
| 时间类型统一 | 全项目使用 ISO 8601 字符串，存储层负责 ↔ Unix timestamp 转换 |

#### 1.6 八大业务模块总览

| 模块 | 英文 | 核心职责 | 子域数 |
|------|------|----------|--------|
| 视频模块 | video | 视频任务管理、智能重试、缓存 | 5 |
| 故事模块 | story | 故事规划、分镜编辑、生成 | 5 |
| 镜头模块 | shot | 一致性检查、特征提取、参考 | 7 |
| 角色模块 | character | 角色 CRUD、服装、图片 | 2 |
| 场景模块 | scene | 场景 CRUD、图片 | 2 |
| 提示词模块 | prompt | 提示词构建、优化 | 7 |
| 资产模块 | asset | 媒体资产、导入导出 | 5 |
| 同步模块 | sync | 云端同步、冲突解决 | 2 |

---

## 第二部分：系统架构

---

### 2. 四层架构全景图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI Animation Studio                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 1: Presentation (src/app/)                               │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │   │
│  │  │  Next.js      │  │  API Routes   │  │  Electron     │       │   │
│  │  │  Pages        │  │  /api/*       │  │  Main Process │       │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 2: Business Modules (src/modules/)                       │   │
│  │  ┌─────────┐ ┌───────┐ ┌──────┐ ┌─────────┐ ┌──────┐         │   │
│  │  │  video  │ │ story │ │ shot │ │character│ │scene │ ...     │   │
│  │  │         │ │       │ │      │ │         │ │      │         │   │
│  │  │ ┌─────┐ │ │ ┌───┐ │ │┌───┐ │ │ ┌─────┐ │ │┌───┐ │         │   │
│  │  │ │hooks│ │ │ │hks│ │ ││hks│ │ │ │hooks│ │ ││hks│ │         │   │
│  │  │ │servs│ │ │ │svs│ │ ││svs│ │ │ │servs│ │ ││   │ │         │   │
│  │  │ │  UI │ │ │ │ UI│ │ ││ UI│ │ │ │     │ │ ││   │ │         │   │
│  │  │ │domn │ │ │ │dmn│ │ ││   │ │ │ │     │ │ ││   │ │         │   │
│  │  │ │infr │ │ │ │   │ │ ││   │ │ │ │     │ │ ││   │ │         │   │
│  │  │ └─────┘ │ │ └───┘ │ │└───┘ │ │ └─────┘ │ │└───┘ │         │   │
│  │  └─────────┘ └───────┘ └──────┘ └─────────┘ └──────┘         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 3: Domain Core (src/domain/)                             │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │   │
│  │  │  schemas/     │  │  types/       │  │  ports/       │       │   │
│  │  │  (6个Zod验证) │  │  (Result等)   │  │  (6文件11接口)│       │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘       │   │
│  │  ┌───────────────┐  ┌───────────────┐                          │   │
│  │  │  services/    │  │  utils/       │                          │   │
│  │  │  (4个领域服务)│  │  (3个领域工具)│                          │   │
│  │  └───────────────┘  └───────────────┘                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 4: Infrastructure (src/infrastructure/)                  │   │
│  │  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │   │
│  │  │ai-providers│ │ storage  │ │ network  │ │   di/    │         │   │
│  │  │(6个提供商) │ │(16+文件) │ │(熔断/重试)│ │(49 Token)│         │   │
│  │  └───────────┘ └──────────┘ └──────────┘ └──────────┘         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Shared Layer (src/shared/)                                     │   │
│  │  hooks/  │  presentation/  │  ui/  │  utils/  │  app-store     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**依赖方向规则**：

```
app/ → modules/ → domain/ ← infrastructure/
                   ↑              │
                   └──────────────┘  (实现端口接口)
shared/ ← 被所有层引用
```

### 3. Video 模块子域架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Video Module (子域化架构 v2)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────── index.ts (模块公共 API) ─────────────────┐│
│  │  统一导出所有子域的公共接口                                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌──────────────────────────────┐  ┌──────────────────┐         │
│  │  task-management (v2重构)    │  │     cache        │         │
│  │  ┌────────────────────────┐  │  │ ┌──────────────┐ │         │
│  │  │ domain/                │  │  │ │ index.ts     │ │         │
│  │  │  ├─ task-machine.ts    │  │  │ │ contract.json│ │         │
│  │  │  ├─ task-events.ts     │  │  │ ├──────────────┤ │         │
│  │  │  ├─ task-schema.ts     │  │  │ │ hooks/       │ │         │
│  │  │  └─ policies/          │  │  │ │  useVideo    │ │         │
│  │  │     ├─ timeout-policy  │  │  │ │  CacheStats  │ │         │
│  │  │     ├─ expiration-pol  │  │  │ ├──────────────┤ │         │
│  │  │     └─ policy-engine   │  │  │ │ services/    │ │         │
│  │  ├────────────────────────┤  │  │ │  videoCache  │ │         │
│  │  │ infrastructure/        │  │  │ │  Service     │ │         │
│  │  │  ├─ timestamp-bridge   │  │  │ └──────────────┘ │         │
│  │  │  └─ polling-scheduler  │  │  └──────────────────┘         │
│  │  ├────────────────────────┤  │                                │
│  │  │ hooks/                 │  │  ┌──────────────────┐         │
│  │  │  use-video-task-mgr    │  │  │    recovery      │         │
│  │  │  use-video-tasks       │  │  │ ┌──────────────┐ │         │
│  │  │  internals/            │  │  │ │ services/    │ │         │
│  │  │   ├─ polling-engine    │  │  │ │  Verification│ │         │
│  │  │   ├─ sync-engine       │  │  │ │  Duplicate   │ │         │
│  │  │   └─ transition-guard  │  │  │ │  SmartRetry  │ │         │
│  │  ├────────────────────────┤  │  │ │  Recovery    │ │         │
│  │  │ services/              │  │  │ ├──────────────┤ │         │
│  │  │  video-tracker         │  │  │ │ types/       │ │         │
│  │  ├────────────────────────┤  │  │ └──────────────┘ │         │
│  │  │ presentation/          │  │  └──────────────────┘         │
│  │  │  VideoTaskManager.tsx  │  │                                │
│  │  │  handlers/             │  │  ┌──────────────────┐         │
│  │  │   └─ video-task-hdlrs  │  │  │     utils        │         │
│  │  │  task-card/            │  │  │ ┌──────────────┐ │         │
│  │  │   ├─ video-preview     │  │  │ │ video-codec  │ │         │
│  │  │   └─ task-actions      │  │  │ │ video-temps  │ │         │
│  │  │  TaskFilterBar.tsx     │  │  │ └──────────────┘ │         │
│  │  │  RecoverySection.tsx   │  │  └──────────────────┘         │
│  │  │  *Dialog.tsx (5个)     │  │                                │
│  │  │  task-status-helpers   │  │                                │
│  │  └────────────────────────┘  │                                │
│  └──────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Shot 系统三层创作架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Shot System Architecture                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    三层递进结构 (Three-Layer)                     │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │        Layer 3: Manual Refinement (手动精修层)         │   │   │
│  │  │  - 关键帧编辑、时间轴调整、特效添加                     │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                            ↓                                     │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │        Layer 2: AI Generation (AI 生成层)             │   │   │
│  │  │  - 分镜生成、元素合成、提示词优化                     │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                            ↓                                     │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │        Layer 1: User Upload (用户上传层)              │   │   │
│  │  │  - 角色上传、场景上传、参考视频上传                   │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    分镜编排引擎 (Shot Orchestrator)              │   │
│  │                                                                 │   │
│  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │   │
│  │  │  Chained Shot │    │  Global Shot  │    │  Element Bind │   │   │
│  │  │  (链式分镜)    │    │  (全局分镜)   │    │  (元素绑定)   │   │   │
│  │  └───────┬───────┘    └───────┬───────┘    └───────┬───────┘   │   │
│  │          └────────────────────┼────────────────────┘            │   │
│  │                               ↓                                 │   │
│  │                    ┌─────────────────┐                         │   │
│  │                    │   Few-Shot      │                         │   │
│  │                    │   Pipeline      │                         │   │
│  │                    └─────────────────┘                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5. DI 容器与依赖注入

#### 5.1 端口接口清单 (6 个文件, 11 个接口)

| 端口文件 | 接口 | 方法数 |
|----------|------|--------|
| `storage-port.ts` | `IVideoTaskStorage` | 12 |
| `storage-port.ts` | `ICharacterStorage` | 9 |
| `storage-port.ts` | `ISceneStorage` | 5 |
| `storage-port.ts` | `IStoryStorage` | 6 |
| `ai-provider-port.ts` | `IVideoProvider` | 5 |
| `ai-provider-port.ts` | `IImageProvider` | 2 |
| `ai-provider-port.ts` | `ITextProvider` | 1 |
| `ai-provider-port.ts` | `IFileUploader` | 1 |
| `sync-port.ts` | `ISyncStorage` | 4 |
| `element-manager-port.ts` | `IElementManager` | 10 |
| `reference-engine-port.ts` | `IReferenceEngine` | 4 |

#### 5.2 新增端口接口

```typescript
// domain/ports/element-manager-port.ts
export interface IElementManager {
  subscribe(listener: () => void): () => void;
  getLibrary(): Promise<ElementLibrary>;
  createElement(type: ElementType, name: string, description?: string): Promise<StoryElement>;
  bindAsset(elementId: string, asset: AssetBinding): Promise<StoryElement>;
  unbindAsset(elementId: string, assetUrl: string): Promise<StoryElement>;
  getElement(elementId: string): Promise<StoryElement | undefined>;
  getAllElements(): Promise<StoryElement[]>;
  getElementsByType(type: ElementType): Promise<StoryElement[]>;
  deleteElement(elementId: string): Promise<void>;
  updateElement(elementId: string, updates: Partial<StoryElement>): Promise<StoryElement>;
}

// domain/ports/reference-engine-port.ts
export interface IReferenceEngine {
  validateReference(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): ReferenceValidationResult;
  getTargetShot(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): StoryBeat | undefined;
  getReferenceVideoUrl(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): string | undefined;
  buildReferenceDescription(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): string;
}
```

#### 5.3 DI 容器 (49 个 Token)

```typescript
const tokens = {
  // 存储端口 (9)
  videoTaskStorage:  createToken<IVideoTaskStorage>("videoTaskStorage", ...),
  characterStorage:  createToken<ICharacterStorage>("characterStorage", ...),
  sceneStorage:      createToken<ISceneStorage>("sceneStorage", ...),
  storyStorage:      createToken<IStoryStorage>("storyStorage", ...),
  versionStorage:    createToken("versionStorage", ...),
  elementStorage:    createToken("elementStorage", ...),
  videoCacheStorage: createToken("videoCacheStorage", ...),
  collectionStorage: createToken("collectionStorage", ...),
  storyboardStorage: createToken("storyboardStorage", ...),

  // 数据库仓库 (5)
  characterRepository: createToken("characterRepository", ...),
  sceneRepository:     createToken("sceneRepository", ...),
  storyRepository:     createToken("storyRepository", ...),
  mediaAssetRepository:createToken("mediaAssetRepository", ...),
  elementRepository:   createToken("elementRepository", ...),

  // AI 提供商端口 (4)
  videoProvider: createToken<IVideoProvider>("videoProvider", ...),
  imageProvider: createToken<IImageProvider>("imageProvider", ...),
  textProvider:  createToken<ITextProvider>("textProvider", ...),
  fileUploader:  createToken<IFileUploader>("fileUploader", ...),

  // 同步端口 (1)
  syncStorage: createToken<ISyncStorage>("syncStorage", ...),

  // 领域服务 (2) — v0.6.0 新增
  elementManager:  createToken<IElementManager>("elementManager", ...),
  referenceEngine: createToken<IReferenceEngine>("referenceEngine", ...),

  // 基础设施 (28+)
  resolveImageUrl:  createToken("resolveImageUrl", ...),
  eventBus:         createToken("eventBus", ...),
  safeQuery:        createToken("safeQuery", ...),
  safeRun:          createToken("safeRun", ...),
  safeTransaction:  createToken("safeTransaction", ...),
  // ... 共 49 个 token
};

export const container: AppContainer = new Proxy(tokens, {
  get(target, prop) {
    const token = target[prop];
    return registry.resolve(token);
  },
}) as unknown as AppContainer;
```

**DI 容器特性**：

| 特性 | 实现 |
|------|------|
| 生命周期 | 全部 `singleton`（单例） |
| 循环依赖检测 | `resolutionStack` 追踪，检测到循环抛出异常 |
| 未知 Token | 抛出 `[DI] Unknown container token` 错误 |
| 缓存 | `singletonCache` Map 缓存已解析实例 |

#### 5.4 消费方迁移

ProfessionalModeEditor, ElementBindingPanel, ShotReferenceConfig 从直接导入改为 DI 获取：

```typescript
// ❌ 旧方式 — 硬导入
import { elementManager } from "@/modules/shot/element-binding";

// ✅ 新方式 — DI 注入
import { container } from "@/infrastructure/di";
const elementManager = container.elementManager;
```

### 6. 数据模型与实体关系

#### 6.1 VideoTask 完整类型

> **注意**：本文档展示的是 `VideoTask` 类型（来自 `api.ts` 的 Zod Schema `videoTaskSchema` 推导），它是包含所有字段的完整运行时类型。`VideoTaskRecord`（来自 `infrastructure.ts`）是简化的存储类型，仅包含数据库持久化所需的字段。两者不可混淆。

```typescript
type VideoTaskStatus =
  | "pending"
  | "processing"
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
  createdAt: string;                    // ISO 8601 字符串
  updatedAt?: string;                   // ISO 8601 字符串
  expiresAt?: string;                   // ISO 8601 字符串
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
  lastPolledAt?: string;                // ISO 8601 字符串
  isDeleted?: boolean;
  vectorClock?: string;
  syncStatus?: "pending" | "synced" | "conflict";
}
```

**v0.6.0 变更**：所有时间字段从 `number` 统一为 ISO 8601 `string`，存储层负责 ↔ Unix timestamp 转换。

#### 6.2 VideoTaskStatus 状态枚举

```typescript
export const videoTaskStatusSchema = z.enum([
  "pending",     // 已提交，等待处理
  "processing",  // AI 提供商正在生成
  "completed",   // 生成成功，videoUrl 可用
  "failed",      // 生成失败
  "cancelled",   // 已取消（终态）
  "retrying",    // 智能重试中
]);
```

#### 6.3 实体关系图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          实体关系图                                      │
│                                                                         │
│  ┌──────────┐  1:N  ┌──────────────┐  1:1  ┌───────────────────┐      │
│  │  Story   │──────►│  StoryBeat   │──────►│  ShotInstruction  │      │
│  │          │       │  (分镜)       │       │  (镜头指令)        │      │
│  └────┬─────┘       └──────┬───────┘       └───────────────────┘      │
│       │                    │                                          │
│       │ 1:N                │ 1:1                                      │
│       ▼                    ▼                                          │
│  ┌──────────┐       ┌───────────────────┐                            │
│  │ Element  │       │ VideoTaskRecord   │                            │
│  │ (元素)   │       │ (视频任务)         │                            │
│  └────┬─────┘       └───────────────────┘                            │
│       │                                                              │
│       │ 继承                                                          │
│       ├──────────┬──────────┐                                        │
│       ▼          ▼          ▼                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                             │
│  │Character │ │  Scene   │ │   Prop   │                             │
│  │ (角色)   │ │  (场景)   │ │  (道具)  │                             │
│  └────┬─────┘ └──────────┘ └──────────┘                             │
│       │                                                              │
│       │ 1:N                                                          │
│       ▼                                                              │
│  ┌──────────────┐                                                    │
│  │CharacterOutfit│                                                   │
│  │ (角色服装)    │                                                    │
│  └──────────────┘                                                    │
│                                                                      │
│  关系说明:                                                            │
│  Story ─1:N─► StoryBeat (一个故事包含多个分镜)                         │
│  StoryBeat ─1:1─► VideoTaskRecord (一个分镜对应一个视频任务)           │
│  StoryBeat ─N:1─► Character (分镜引用多个角色)                        │
│  StoryBeat ─N:1─► Scene (分镜引用一个场景)                            │
│  Element ────► Character | Scene | Prop (元素多态继承)                │
│  Character ─1:N─► CharacterOutfit (角色拥有多套服装)                  │
│  StoryBeat.elementBindings ──► Element (绑定关系)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 6.4 数据库表结构

以下为核心表的 `CREATE TABLE` 语句：

```sql
-- 视频任务表
CREATE TABLE IF NOT EXISTS video_tasks (
    task_id TEXT PRIMARY KEY,
    status TEXT CHECK(status IN (
      'pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying'
    )) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    video_url TEXT,
    message TEXT,
    created_at INTEGER,
    expires_at INTEGER,
    model TEXT,
    prompt TEXT,
    parameters TEXT,
    last_polled_at INTEGER,
    poll_count INTEGER DEFAULT 0,
    recovery_attempts INTEGER DEFAULT 0,
    fixed_image_url TEXT,
    fixed_image_lock_type TEXT,
    reference_video_url TEXT,
    reference_video_mimicry_level TEXT,
    template_id TEXT,
    template_shots TEXT,
    api_url TEXT,
    api_endpoint TEXT,
    provider_id TEXT,
    provider_model_id TEXT,
    provider_format TEXT,
    poll_failure_count INTEGER DEFAULT 0,
    story_id TEXT,
    story_title TEXT,
    beat_id TEXT,
    beat_title TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_status TEXT DEFAULT 'synced',
    vector_clock TEXT DEFAULT '{}',
    updated_at INTEGER,
    last_synced_at INTEGER
);

-- 视频缓存表
CREATE TABLE IF NOT EXISTS video_cache (
    task_id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    original_url TEXT,
    mime_type TEXT,
    file_size INTEGER,
    cached_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_deleted INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'pending',
    vector_clock TEXT DEFAULT '{}',
    last_synced_at INTEGER
);

-- 角色表
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    ref_image_path TEXT,
    avatar_path TEXT,
    thumbnail_path TEXT,
    preview_path TEXT,
    gender TEXT CHECK(gender IN ('male', 'female', 'other', 'unknown')),
    age INTEGER CHECK(age BETWEEN 0 AND 200),
    style TEXT,
    appearance_json TEXT,
    personality_json TEXT,
    traits_json TEXT,
    prompt TEXT,
    source TEXT CHECK(source IN ('ai-generated', 'uploaded', 'imported')),
    generation_prompt TEXT,
    generation_params TEXT,
    use_count INTEGER DEFAULT 0,
    last_used_at INTEGER,
    tags TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    generated_image TEXT,
    generated_video TEXT,
    video_generation_status TEXT,
    video_generation_task_id TEXT,
    image_generation_prompt TEXT,
    outfits_json TEXT,
    is_deleted INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'pending',
    vector_clock TEXT DEFAULT '{}',
    last_synced_at INTEGER
);

-- 场景表
CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    ref_image_path TEXT,
    thumbnail_path TEXT,
    preview_path TEXT,
    scene_path TEXT,
    type TEXT,
    time_of_day TEXT,
    weather TEXT,
    atmosphere TEXT,
    mood TEXT,
    lighting TEXT,
    elements_json TEXT,
    colors_json TEXT,
    prompt TEXT,
    camera_json TEXT,
    source TEXT CHECK(source IN ('ai-generated', 'uploaded', 'imported')),
    generation_prompt TEXT,
    generation_params TEXT,
    use_count INTEGER DEFAULT 0,
    last_used_at INTEGER,
    tags TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    generated_image TEXT,
    generated_video TEXT,
    video_generation_status TEXT,
    video_generation_task_id TEXT,
    image_generation_prompt TEXT,
    is_deleted INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'pending',
    vector_clock TEXT DEFAULT '{}',
    last_synced_at INTEGER
);

-- 故事表
CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    tone TEXT,
    target_duration INTEGER,
    keyframe_chain_valid INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    element_ids_json TEXT,
    element_bindings_json TEXT,
    is_deleted INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'pending',
    vector_clock TEXT DEFAULT '{}',
    last_synced_at INTEGER
);

-- 分镜表
CREATE TABLE IF NOT EXISTS story_beats (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    order_num INTEGER,
    description TEXT,
    duration INTEGER,
    type TEXT,
    title TEXT,
    content TEXT,
    character_ids TEXT,
    scene_id TEXT,
    shot_type TEXT,
    camera_angle TEXT,
    camera_movement TEXT,
    camera_distance TEXT,
    camera_speed TEXT,
    keyframe_image_url TEXT,
    keyframe_prompt TEXT,
    keyframe_generated_at INTEGER,
    first_frame_url TEXT,
    first_frame_prompt TEXT,
    last_frame_url TEXT,
    last_frame_prompt TEXT,
    frame_pair_generated_at INTEGER,
    video_url TEXT,
    video_task_id TEXT,
    video_status TEXT,
    generation_prompt TEXT,
    image_generation_prompt TEXT,
    first_frame_prompt_gen TEXT,
    last_frame_prompt_gen TEXT,
    enhanced_generation INTEGER DEFAULT 0,
    generation_params TEXT,
    character_outfits_json TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

-- 元素表
CREATE TABLE IF NOT EXISTS elements (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('character', 'prop', 'effect')),
    name TEXT NOT NULL,
    description TEXT,
    character_config_json TEXT,
    scene_config_json TEXT,
    feature_anchor_json TEXT,
    reference_image_quality_json TEXT,
    bindings_json TEXT,
    created_at INTEGER,
    updated_at INTEGER
);

-- 角色服装表
CREATE TABLE IF NOT EXISTS character_outfits (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    clothing TEXT DEFAULT '',
    accessories_json TEXT DEFAULT '[]',
    image_url TEXT,
    local_image_path TEXT,
    thumbnail_path TEXT,
    is_default INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- 同步变更日志表
CREATE TABLE IF NOT EXISTS sync_changelog (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('insert', 'update', 'delete')),
    vector_clock TEXT NOT NULL DEFAULT '{}',
    data TEXT,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    synced INTEGER NOT NULL DEFAULT 0,
    device_id TEXT NOT NULL
);
```

**关键索引**：

```sql
CREATE INDEX IF NOT EXISTS idx_video_tasks_status ON video_tasks(status);
CREATE INDEX IF NOT EXISTS idx_video_tasks_story_id ON video_tasks(story_id);
CREATE INDEX IF NOT EXISTS idx_video_tasks_expires_at ON video_tasks(expires_at);
CREATE INDEX IF NOT EXISTS idx_video_cache_task_id ON video_cache(task_id);
CREATE INDEX IF NOT EXISTS idx_video_cache_cached_at ON video_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_story_beats_story ON story_beats(story_id);
CREATE INDEX IF NOT EXISTS idx_character_outfits_character ON character_outfits(character_id);
CREATE INDEX IF NOT EXISTS idx_changelog_synced ON sync_changelog(synced, timestamp);
```

#### 6.5 完整数据库表清单 (28 张)

上文 6.4 节列出了 9 张核心表的 `CREATE TABLE` 语句，以下为完整 28 张表的分类总览。

**核心业务表 (9)**

| 表名 | 说明 | 列数 | 索引数 |
|------|------|------|--------|
| characters | 角色表 | 31 | 7 |
| scenes | 场景表 | 31 | 5 |
| stories | 故事表 | 15 | — |
| story_beats | 故事节拍表 | 34 | 1 |
| elements | 元素表 | 11 | — |
| character_outfits | 角色服装表 | 13 | 1 |
| video_tasks | 视频任务表 | 33 | 4 |
| video_cache | 视频缓存表 | 10 | 3 |
| media_assets | 媒体资产表 | 20 | — |

**关联表 (4)**

| 表名 | 说明 | 约束 |
|------|------|------|
| story_characters | 故事-角色关联 | UNIQUE(story_id, character_id), FK→stories |
| story_scenes | 故事-场景关联 | UNIQUE(story_id, scene_id), FK→stories |
| story_elements | 故事-元素绑定 | UNIQUE(story_id, element_id), FK→stories |
| collection_assets | 收藏集-资产关联 | asset_type CHECK |

**版本与模板表 (3)**

| 表名 | 说明 | 列数 | 索引数 |
|------|------|------|--------|
| story_versions | 故事版本表 | 17 | 1 |
| video_templates | 视频模板表 | 10 | — |
| ast_templates | AST 模板表 | 21 | 4 |

**生成与文件表 (3)**

| 表名 | 说明 | 列数 | 索引数 |
|------|------|------|--------|
| generation_tasks | 生成任务表 | 21 | 4 |
| file_index | 文件索引表 | 12 | 2 |
| storyboard_assets | 分镜资产表 | 14 | — |

**系统表 (5)**

| 表名 | 说明 | 列数 | 索引数 |
|------|------|------|--------|
| schema_version | 模式版本表 | 2 | — |
| auto_saves | 自动保存表 | 5 | 2 |
| error_logs | 错误日志表 | 5 | — |
| sessions | 会话表 | 4 | — |
| asset_tags | 资产标签表 | 4 | 2 (复合主键) |

**同步表 (3)**

| 表名 | 说明 | 列数 | 索引数 |
|------|------|------|--------|
| sync_changelog | 同步变更日志 | 9 | 2 |
| sync_meta | 同步元数据 | 2 | — |
| sync_conflict_backup | 同步冲突备份 | 7 | — |

**收藏表 (1)**

| 表名 | 说明 | 列数 | 索引数 |
|------|------|------|--------|
| collections | 收藏集表 | 8 | — |

#### 6.6 关键设计特征

1. **主键策略**: 大部分表使用 TEXT UUID 主键，仅 story_characters/story_scenes/story_elements/error_logs 使用 INTEGER AUTOINCREMENT，asset_tags 使用复合主键 (asset_id, tag)
2. **软删除模式**: characters/scenes/stories/story_versions/media_assets/video_tasks/storyboard_assets/collections/video_cache 含 is_deleted 字段
3. **同步支持**: 多张表含 sync_status/vector_clock/last_synced_at 三字段组合
4. **CHECK 约束**: 广泛使用 CHECK 限制枚举值 (gender, source, status, type, operation 等)
5. **JSON 存储**: 复杂结构以 _json 后缀的 TEXT 存储
6. **冗余索引**: idx_video_tasks_story_id 和 idx_video_tasks_story 功能重复

#### 6.7 索引汇总 (40 个)

按表分组列出所有索引：

| 表名 | 索引名 | 列 | 类型 |
|------|--------|-----|------|
| **characters** | idx_characters_name | name | 单列 |
| | idx_characters_source | source | 单列 |
| | idx_characters_gender | gender | 单列 |
| | idx_characters_is_deleted | is_deleted | 单列 |
| | idx_characters_sync_status | sync_status | 单列 |
| | idx_characters_created_at | created_at | 单列 |
| | idx_characters_last_used | last_used_at | 单列 |
| **scenes** | idx_scenes_name | name | 单列 |
| | idx_scenes_source | source | 单列 |
| | idx_scenes_is_deleted | is_deleted | 单列 |
| | idx_scenes_sync_status | sync_status | 单列 |
| | idx_scenes_created_at | created_at | 单列 |
| **story_beats** | idx_story_beats_story | story_id | 单列 |
| **character_outfits** | idx_character_outfits_character | character_id | 单列 |
| **video_tasks** | idx_video_tasks_status | status | 单列 |
| | idx_video_tasks_story_id | story_id | 单列 |
| | idx_video_tasks_story | story_id | 单列 (与 idx_video_tasks_story_id 重复) |
| | idx_video_tasks_expires_at | expires_at | 单列 |
| **video_cache** | idx_video_cache_task_id | task_id | 单列 |
| | idx_video_cache_cached_at | cached_at | 单列 |
| | idx_video_cache_is_deleted | is_deleted | 单列 |
| **story_versions** | idx_story_versions_story | story_id | 单列 |
| **ast_templates** | idx_ast_templates_type | type | 单列 |
| | idx_ast_templates_category | category | 单列 |
| | idx_ast_templates_is_default | is_default | 单列 |
| | idx_ast_templates_name | name | 单列 |
| **generation_tasks** | idx_generation_tasks_status | status | 单列 |
| | idx_generation_tasks_type | type | 单列 |
| | idx_generation_tasks_story_id | story_id | 单列 |
| | idx_generation_tasks_created_at | created_at | 单列 |
| **file_index** | idx_file_index_path | file_path | 单列 |
| | idx_file_index_hash | content_hash | 单列 |
| **auto_saves** | idx_auto_saves_key | key | 单列 |
| | idx_auto_saves_timestamp | timestamp | 单列 |
| **asset_tags** | idx_asset_tags_tag | tag | 单列 |
| | idx_asset_tags_asset_type | asset_type | 单列 |
| **sync_changelog** | idx_changelog_synced | synced, timestamp | 复合 |
| | idx_changelog_entity | entity_type, entity_id | 复合 |
| **collection_assets** | idx_collection_assets_collection | collection_id | 单列 |

### 7. 模块间接口契约

#### 7.1 模块依赖矩阵

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

#### 7.2 AIProviderPort 接口

```typescript
export interface IVideoProvider {
  generateVideo(
    prompt: string,
    options?: {
      firstFrameUrl?: string;
      lastFrameUrl?: string;
      characterRef?: string;
      sceneRef?: string;
      duration?: number;
      referenceVideo?: string | null;
      providerId?: string;
      modelId?: string;
      format?: string;
    },
  ): Promise<ApiResponse<VideoGenerationResult>>;

  queryVideoStatus(
    taskId: string,
    options?: { providerId?: string; modelId?: string; format?: string },
  ): Promise<ApiResponse<{
    status: "pending" | "processing" | "completed" | "failed";
    videoUrl?: string;
    progress?: number;
    message?: string;
  }>>;

  generateKeyframe(params: {
    characterRef?: string;
    sceneRef?: string;
    prevKeyframe?: string;
    shotRequirement?: { shotType?: string; cameraAngle?: string; cameraMovement?: string; action?: string };
    content?: string;
    providerId?: string;
    modelId?: string;
    format?: string;
  }): Promise<ApiResponse<{ imageUrl: string; source?: string; prompt?: string }>>;

  generateFramePair(params: {
    keyframeUrl: string;
    keyframePrompt?: string;
    characterRef?: string;
    sceneRef?: string;
    prevLastFrameUrl?: string;
    actionDescription?: string;
    duration?: number;
    providerId?: string;
    modelId?: string;
    format?: string;
  }): Promise<ApiResponse<{
    firstFrame: { imageUrl: string; prompt: string; derivedFrom: string };
    lastFrame:  { imageUrl: string; prompt: string; derivedFrom: string };
    generatedAt: number;
  }>>;

  generateVideoWithFrames(params: {
    prompt: string;
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    characterRef?: string;
    sceneRef?: string;
    duration?: number;
    providerId?: string;
    modelId?: string;
    format?: string;
    referenceVideo?: string | null;
  }): Promise<ApiResponse<VideoGenerationResult>>;
}

export interface IImageProvider {
  generateImage(prompt: string, type?: string, options?: { size?: string; providerId?: string; modelId?: string }): Promise<ApiResponse<ImageGenerationResult>>;
  analyzeImage(imageUrl: string, type?: "character" | "scene", prompt?: string, options?: { providerId?: string; modelId?: string }): Promise<ApiResponse<{ analysis: string; analyzed?: Record<string, unknown> }>>;
}

export interface ITextProvider {
  generateText(prompt: string, options?: { maxTokens?: number; temperature?: number; providerId?: string; modelId?: string }): Promise<ApiResponse<{ text: string }>>;
}

export interface IFileUploader {
  uploadFile(file: File): Promise<
    | { success: true; data: { url: string; [key: string]: unknown }; source?: string; error?: string; message?: string }
    | { success: false; error: string; message?: string; data?: { url: string; [key: string]: unknown } }
  >;
}
```

#### 7.3 StoragePort 接口

```typescript
export interface IVideoTaskStorage {
  getVideoTasks(): Promise<VideoTask[]>;
  getVideoTaskById(taskId: string): Promise<VideoTask | null>;
  getVideoTasksByStory(storyId: string): Promise<VideoTask[]>;
  getVideoTasksByStatus(status: string): Promise<VideoTask[]>;
  getPendingVideoTasks(): Promise<VideoTask[]>;
  createVideoTask(task: Partial<VideoTask> & { taskId: string }): Promise<void>;
  updateVideoTask(taskId: string, updates: Partial<VideoTask>): Promise<void>;
  deleteVideoTask(taskId: string): Promise<void>;
  deleteVideoTasksByStatus(statuses: string[]): Promise<void>;
  deleteExpiredVideoTasks(): Promise<number>;
  clearVideoTasks(): Promise<void>;
  bulkPutVideoTasks(tasks: Record<string, unknown>[]): Promise<void>;
}

export interface ICharacterStorage {
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

export interface ISceneStorage {
  getScenes(): Promise<Scene[]>;
  getSceneById(id: string): Promise<Scene | null>;
  createScene(scene: Partial<Scene>): Promise<void>;
  updateScene(id: string, updates: Partial<Scene>): Promise<void>;
  deleteScene(id: string): Promise<void>;
}

export interface IStoryStorage {
  getStories(): Promise<Story[]>;
  getStoryById(id: string): Promise<Story | null>;
  getStoryByBeatId(beatId: string): Promise<Story | null>;
  createStory(story: Partial<Story>): Promise<void>;
  updateStory(id: string, updates: Partial<Story>): Promise<void>;
  deleteStory(id: string): Promise<void>;
}
```

#### 7.4 SyncPort 接口

```typescript
export interface ISyncStorage {
  safeQuery<T>(sql: string, params?: unknown[]): Promise<T[]>;
  safeRun(sql: string, params?: unknown[]): Promise<void>;
  safeTransaction(statements: { sql: string; params: unknown[] }[]): Promise<unknown[]>;
  registerChangeTracker(
    tracker: (entityType: string, entityId: string, operation: string) => Promise<void>
  ): void;
}
```

#### 7.5 跨模块数据流时序图

```
┌─────────────────────────────────────────────────────────────────────────┐
│              跨模块数据流时序图 — 视频生成完整流程                        │
│                                                                         │
│  用户       Story模块      Prompt模块      AI Provider    Video模块     │
│   │            │              │               │              │          │
│   │ 点击生成   │              │               │              │          │
│   │───────────►│              │               │              │          │
│   │            │              │               │              │          │
│   │            │ 1.构建提示词  │               │              │          │
│   │            │─────────────►│               │              │          │
│   │            │              │               │              │          │
│   │            │ 2.完整提示词  │               │              │          │
│   │            │◄─────────────│               │              │          │
│   │            │              │               │              │          │
│   │            │ 3.调用生成    │               │              │          │
│   │            │─────────────────────────────►│              │          │
│   │            │              │               │              │          │
│   │            │              │               │ 4.返回taskId │          │
│   │            │◄─────────────────────────────│              │          │
│   │            │              │               │              │          │
│   │            │ 5.创建任务记录│               │              │          │
│   │            │─────────────────────────────────────────────►│          │
│   │            │              │               │              │          │
│   │            │              │               │ 6.轮询状态   │          │
│   │            │              │               │◄─────────────│          │
│   │            │              │               │              │          │
│   │            │              │               │ 7.返回结果   │          │
│   │            │              │               │─────────────►│          │
│   │            │              │               │              │          │
│   │            │ 8.更新任务状态│               │              │          │
│   │            │◄─────────────────────────────────────────────│          │
│   │            │              │               │              │          │
│   │ 9.显示结果 │              │               │              │          │
│   │◄───────────│              │               │              │          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8. 数据安全架构

#### 8.1 桌面端数据安全

| 机制 | 说明 |
|------|------|
| WAL 模式 | better-sqlite3 使用 WAL 日志模式，崩溃不丢数据 |
| 自动备份 | 每 24 小时自动备份，保留 7 个备份，30 天过期 |
| ENOSPC 检测 | 磁盘满时禁用写入，发送 IPC 警告 |
| 损坏恢复 | 数据库损坏时自动重命名并重建 |
| 强制 better-sqlite3 | 桌面端不再降级到 sql.js，消除数据丢失风险 |

#### 8.2 URL 安全验证

```typescript
// shared/utils/url-validation.ts
validateExternalUrl(url)   // 验证 URL 协议安全性
isAllowedImageUrl(url)     // 支持 data:/blob:/file:/http:/https:
isAllowedVideoUrl(url)     // 本地优先项目支持所有本地协议
```

#### 8.3 SSRF 防护

项目包含两层 URL 安全防护：

- **前端侧** (`shared/utils/url-validation.ts`): 简单协议白名单检查 (data:/blob:/file:/http:/https:)，仅验证 URL 协议前缀，不做 IP/DNS 验证
- **Electron 主进程侧** (`electron/src/security/ssrf-guard/ssrf-guard.ts`): 完整 6 步 SSRF 防护流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│              SSRF 防护流程 (Electron 主进程侧)                          │
│                                                                         │
│  输入 URL                                                               │
│     │                                                                   │
│     ▼                                                                   │
│  1. URL 格式校验                                                        │
│     └─► 无效格式 → 拒绝                                                 │
│                                                                         │
│  2. 协议检查 (仅允许 http/https)                                        │
│     └─► 其他协议 → 拒绝                                                 │
│                                                                         │
│  3. 云元数据端点检查                                                     │
│     ├─► 169.254.169.254 (AWS/GCP)                                      │
│     ├─► metadata.google.internal                                       │
│     └─► 匹配 → 拒绝                                                    │
│                                                                         │
│  4. 自定义白名单检查                                                     │
│     └─► 命中 → 放行                                                     │
│                                                                         │
│  5. 私有地址检查                                                         │
│     ├─► 127.x / 10.x / 172.16-31.x / 192.168.x                       │
│     ├─► 0.x / localhost / ::1                                          │
│     └─► 匹配 → 拒绝                                                    │
│                                                                         │
│  6. DNS 解析验证 (防 DNS Rebinding)                                     │
│     ├─► 解析域名 → 检查所有 A 记录                                      │
│     └─► 通过 → 放行                                                     │
│                                                                         │
│  注: 前端 url-validation.ts 仅做协议前缀检查，不做 IP/DNS 验证          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 8.4 Electron 安全模块

`electron/src/security/` 目录下包含两个安全子模块，为 Electron 桌面端提供 SSRF 防护和密钥安全存储能力。

##### SSRF 防护 (ssrf-guard)

6 步验证流程：

```
输入 URL
   │
   ▼
1. URL 解析       → 无效格式拒绝
   │
   ▼
2. 协议限制       → 仅允许 http/https
   │
   ▼
3. 云元数据拦截   → 169.254.169.254 / metadata.google.internal
   │
   ▼
4. 白名单检查     → 命中则放行
   │
   ▼
5. 私有地址检测   → 127.x / 10.x / 172.16-31.x / 192.168.x / 0.x / localhost / ::1
   │
   ▼
6. DNS 解析验证   → 解析域名检查所有 A 记录 (防 DNS Rebinding)
   │
   ▼
 通过 → 放行
```

**SsrfGuard 类 API**：

```typescript
class SsrfGuard {
  validate(url: string): Promise<Result<{ hostname: string }>>  // 异步含 DNS 解析
  validateSync(url: string): Result<{ hostname: string }>       // 同步快速预检 (无 DNS)
  addWhitelist(host: string): void                              // 添加白名单
  removeWhitelist(host: string): void                           // 移除白名单
  isPrivateIp(ip: string): boolean                              // 私有地址判断
}
```

**配置项**：

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| enableDnsResolution | boolean | true | 是否启用 DNS 解析验证 |
| customWhitelist | string[] | [] | 自定义白名单域名/IP |
| blockMetadataEndpoints | boolean | true | 是否拦截云元数据端点 |
| dnsFailurePolicy | "allow" \| "deny" | "deny" | DNS 解析失败时的策略 |

**全局单例**: `ssrfGuard`

**零外部依赖**：仅使用 Node.js 内置 `dns`、`url`、`net` 模块。

##### 密钥存储 (key-storage)

采用策略模式，`KeyStorageManager` 管理多个 `KeyStorageStrategy` 实现，按优先级自动选择最优策略。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    KeyStorageManager                                    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  策略选择 (按 priority 升序)                                     │   │
│  │                                                                 │   │
│  │  ┌──────────────────────┐    ┌──────────────────────────────┐  │   │
│  │  │  SafeStorage 策略    │    │  PlaintextFallback 策略      │  │   │
│  │  │  priority = 1        │    │  priority = 99               │  │   │
│  │  │                      │    │                               │  │   │
│  │  │  Windows: DPAPI      │    │  AES-256-GCM +               │  │   │
│  │  │  macOS:   Keychain   │    │  机器特征派生密钥             │  │   │
│  │  │  Linux:   libsecret  │    │                               │  │   │
│  │  └──────────────────────┘    └──────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  导出/导入加密数据包 (用于云端同步)                               │   │
│  │  exportEncrypted(password) → 加密数据包                          │   │
│  │  importEncrypted(data, password) → 恢复密钥                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

| 策略 | 优先级 | 加密方式 | 平台支持 |
|------|--------|----------|----------|
| SafeStorage | 1 | Electron safeStorage API | Windows: DPAPI, macOS: Keychain, Linux: libsecret |
| PlaintextFallback | 99 | AES-256-GCM + 机器特征派生密钥 | 全平台 |

**全局单例**: `keyStorage`

### 9. 性能优化

| 优化 | 说明 |
|------|------|
| `isElectron()` 缓存 | 首次计算后缓存结果，避免每次 DB 操作重复检测 |
| Sync 引擎条件化 | 仅在 `syncConfig.enabled` 时注册 changeTracker，消除写放大 |
| 文件拆分 | 8 个超大文件拆分，最大文件从 1031 行降至 624 行 |
| SafeImage 组件 | 统一 Next/Image 封装，处理 data:/blob: 协议 |
| WAL 模式 | better-sqlite3 WAL 日志模式，读写并发性能提升 |
| PRAGMA 优化 | cache_size=-64000, temp_store=memory, mmap_size=256MB |

### 10. API 路由层

#### 10.1 Web 端 API 路由 (19 个)

`src/app/api/` 下的 Next.js API 路由，为 Web 模式提供后端服务：

**AI 生成路由**

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/generate/text | POST | AI 文本生成 |
| /api/generate/image | POST | AI 图片生成 |
| /api/generate/video | POST | AI 视频生成 |
| /api/generate/video/status | GET | 查询视频生成状态 |
| /api/generate/video/providers | GET | 获取可用视频提供商 |
| /api/generate/video/models | GET | 获取可用模型列表 |
| /api/generate/video/capabilities | GET | 获取模型能力 |
| /api/generate/video/estimate-cost | POST | 估算生成成本 |

**角色/场景图片生成**

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/characters/generate-image | POST | 角色图片生成 |
| /api/scenes/generate-image | POST | 场景图片生成 |

**配置管理**

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/config | GET/POST | API 配置读写 |
| /api/config/test | POST | 测试 API 连接 |

**同步路由**

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/sync/push | POST | 同步推送 |
| /api/sync/pull | POST | 同步拉取 |

**验证路由**

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/validate/consistency | POST | 一致性校验 |
| /api/validate/feature-anchoring | POST | 特征锚定验证 |
| /api/validate/references | POST | 引用完整性验证 |
| /api/validate/shot-params | POST | 镜头参数验证 |

**健康检查**

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/health | GET | 健康检查 |

#### 10.2 Electron API Server (35 个)

Electron 模式下使用内置 HTTP API Server 替代 Next.js 路由，提供与 Web 端相同的功能 + 额外的本地文件操作能力。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    双模式 API 架构                                      │
│                                                                         │
│  ┌──────────────────────────┐    ┌──────────────────────────────────┐  │
│  │     Web Mode             │    │     Desktop Mode (Electron)      │  │
│  │                          │    │                                  │  │
│  │  Next.js API Routes      │    │  HTTP API Server (主进程)        │  │
│  │  /api/* (19 个)          │    │  localhost:PORT/* (35 个)        │  │
│  │                          │    │                                  │  │
│  │  - AI 生成               │    │  - AI 生成 (同 Web)              │  │
│  │  - 配置管理              │    │  - 配置管理 (同 Web)             │  │
│  │  - 同步                  │    │  - 同步 (同 Web)                 │  │
│  │  - 验证                  │    │  - 验证 (同 Web)                 │  │
│  │                          │    │  - 本地文件操作 (额外)           │  │
│  │  sql.js (WASM)           │    │  - 数据库直连 (额外)             │  │
│  └──────────────────────────┘    │  better-sqlite3 (原生)           │  │
│                                   └──────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    共享业务逻辑层                                  │   │
│  │  modules/ + domain/ + infrastructure/                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11. IPC 通道

Electron 主进程与渲染进程通过 IPC (Inter-Process Communication) 通信，使用 `ipcMain.invoke` / `ipcRenderer.invoke` (双向) 和 `webContents.send` (主→渲染单向) 两种模式。

#### 11.1 数据库操作 (15 个)

| 通道 | 方向 | 说明 |
|------|------|------|
| db:init | invoke | 初始化数据库 |
| db:close | invoke | 关闭数据库 |
| db:query | invoke | 执行查询 |
| db:run | invoke | 执行写入 |
| db:migrate | invoke | 执行迁移 |
| db:backup-status | invoke | 获取备份状态 |
| db:create-backup | invoke | 手动创建备份 |
| db:persistence-error | on (主→渲染) | 磁盘满警告 |
| db:get-video-tasks | invoke | 获取视频任务 |
| db:save-video-task | invoke | 保存视频任务 |
| db:delete-video-task | invoke | 删除视频任务 |
| db:clear-video-tasks | invoke | 清空视频任务 |
| db:get-characters | invoke | 获取角色 |
| db:save-character | invoke | 保存角色 |
| db:delete-character | invoke | 删除角色 |

#### 11.2 资产管理 (14 个)

| 通道 | 方向 | 说明 |
|------|------|------|
| asset:save-image | invoke | 保存图片到本地 |
| asset:save-video | invoke | 保存视频到本地 |
| asset:open-external | invoke | 打开外部链接 |
| asset:select-directory | invoke | 选择目录 |
| asset:select-file | invoke | 选择文件 |
| asset:read-file | invoke | 读取文件 |
| asset:delete-file | invoke | 删除文件 |
| asset:file-exists | invoke | 检查文件是否存在 |
| asset:get-path | invoke | 获取特殊路径 |
| asset:export-project | invoke | 导出项目 |
| asset:get-video-cache-path | invoke | 获取视频缓存路径 |
| asset:cache-video | invoke | 缓存视频文件 |
| asset:check-cached-video | invoke | 检查缓存状态 |
| asset:remove-cached-video | invoke | 删除缓存视频 |

#### 11.3 配置管理 (4 个)

| 通道 | 方向 | 说明 |
|------|------|------|
| config:load | invoke | 加载配置 |
| config:save | invoke | 保存配置 |
| config:get-api-keys | invoke | 获取 API 密钥 |
| config:save-api-key | invoke | 保存 API 密钥 (加密存储) |

#### 11.4 系统事件 (3 个)

| 通道 | 方向 | 说明 |
|------|------|------|
| system:platform | invoke | 获取平台信息 |
| system:version | invoke | 获取应用版本 |
| system:ready | on (主→渲染) | 应用就绪通知 |

#### 11.5 菜单事件 (4 个)

| 通道 | 方向 | 说明 |
|------|------|------|
| menu:new-project | on (主→渲染) | 新建项目 |
| menu:save | on (主→渲染) | 保存 |
| menu:export | on (主→渲染) | 导出 |
| menu:preferences | on (主→渲染) | 偏好设置 |

#### 11.6 IPC 通信模式汇总

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    IPC 通信模式                                         │
│                                                                         │
│  ┌─────────────────┐                    ┌─────────────────────┐        │
│  │  渲染进程        │                    │  主进程              │        │
│  │                 │                    │                     │        │
│  │  ipcRenderer    │  invoke (双向)     │  ipcMain            │        │
│  │  .invoke(ch, …) │───────────────────►│  .handle(ch, fn)    │        │
│  │                 │◄───────────────────│                     │        │
│  │                 │  返回 Promise      │                     │        │
│  │                 │                    │                     │        │
│  │                 │  on (单向, 主→渲染) │  webContents        │        │
│  │                 │◄───────────────────│  .send(ch, data)    │        │
│  │                 │                    │                     │        │
│  └─────────────────┘                    └─────────────────────┘        │
│                                                                         │
│  通道分类:                                                              │
│  ├── db:*         (15)  数据库操作                                      │
│  ├── asset:*      (14)  资产管理                                        │
│  ├── config:*     (4)   配置管理                                        │
│  ├── system:*     (3)   系统事件                                        │
│  └── menu:*       (4)   菜单事件                                        │
│                      ────                                               │
│                      40 个通道                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 第三部分：任务管理系统 v2

---

### 10. 设计动机

v1 版本的问题诊断结论：**「有骨架、缺心脏」**——适合个人尝鲜，但距离工业化批量生产有差距。

| 问题 | v1 表现 | v2 解决方案 |
|------|---------|-------------|
| 状态转换无约束 | 任意 `as` 强转，pending→completed 可直接跳 | TaskMachine 状态机强制校验 + TransitionError |
| 时间戳混乱 | 毫秒/秒混用，内联类型检查 | ISO 8601 统一 + TimestampBridge |
| UNIQUE 冲突不一致 | ABORT+fallback / IGNORE 混用 | 统一 REPLACE 策略 |
| 错误静默吞没 | 空 catch 块 | errorLogger.warn 记录 |
| UI 组件过大 | VideoTaskManager.tsx 1740 行 | 拆分为 9+ 子组件 + handlers |
| 轮询策略简陋 | 固定间隔 | PollingScheduler 自适应退避 |
| 缺少策略引擎 | 超时/过期逻辑散落各处 | PolicyEngine 统一评估 |
| 存储层反向依赖 | video-tasks.ts 导入 TaskMachine | 状态验证移至 hook 层 |

### 11. 架构

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
│   └── index.ts                     # Barrel 导出 (TransitionError 类+类型)
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
│   │   └── video-task-handlers.ts   # 下载/恢复/追踪等处理器
│   ├── task-card/                    # 任务卡片拆分
│   │   ├── video-preview.tsx        # 视频预览 (DOM API, 无 innerHTML)
│   │   └── task-actions.tsx         # 任务操作按钮
│   ├── TaskFilterBar.tsx             # 筛选栏
│   ├── RecoverySection.tsx           # 手动找回
│   ├── TaskTrackingDialog.tsx        # 追踪对话框
│   ├── VideoPreviewDialog.tsx        # 视频预览
│   ├── DeleteConfirmDialog.tsx       # 删除确认
│   ├── BulkDeleteDialog.tsx          # 批量删除
│   ├── TaskDetailDialog.tsx          # 任务详情
│   ├── task-status-helpers.tsx       # 状态图标/颜色/标签
│   ├── use-task-filter.ts            # 筛选逻辑 Hook
│   └── use-video-preview.ts          # 预览逻辑 Hook
└── index.ts                          # 子域公共 API
```

### 12. 状态机 (TaskMachine)

#### 8.1 状态转换图

```
                    ┌──────────┐
          ┌────────►│ pending  │
          │         └────┬─────┘
          │              │
          │     ┌────────┴────────┐
          │     ▼                 ▼
          │  ┌──────────┐    ┌─────────┐◄────┐
          │  │processing│    │ failed  │     │
          │  └────┬─────┘    └────┬────┘     │
          │       │               │          │
          │  ┌────┴────┐         │     ┌────┴────┐
          │  ▼         ▼         │     │retrying │
          │  │completed│         │     └────┬────┘
          │  └─────────┘         │          │
          │                      └──────────┘
          │
     (cancelled — 终态，无入边)
```

#### 8.2 合法转换表

```typescript
const VALID_TRANSITIONS: Record<VideoTaskStatus, VideoTaskStatus[]> = {
  pending:    ["processing", "failed"],
  processing: ["completed", "failed"],
  completed:  [],
  failed:     ["retrying"],
  cancelled:  [],
  retrying:   ["processing", "completed", "failed"],
};
```

| from | to | 可轮询 | 终态 |
|------|-----|--------|------|
| `pending` | processing, failed | ✅ | ❌ |
| `processing` | completed, failed | ✅ | ❌ |
| `completed` | *(终态)* | ❌ | ✅ |
| `failed` | retrying | ❌ | ❌ |
| `cancelled` | *(终态)* | ❌ | ✅ |
| `retrying` | processing, completed, failed | ✅ | ❌ |

#### 8.3 TransitionError

非法转换返回 `TransitionError`（`AppError` 子类），含 `from`/`to` 属性：

```typescript
export class TransitionError extends AppError {
  constructor(
    public readonly from: VideoTaskStatus,
    public readonly to: VideoTaskStatus,
  ) {
    super("INVALID_TRANSITION", `不允许从 ${from} 转换到 ${to}`);
  }
}
```

#### 8.4 核心 API

```typescript
TaskMachine.canTransition(from, to): boolean
TaskMachine.transition(task, targetStatus, context?): Result<VideoTask, TransitionError>
TaskMachine.isPollable(status): boolean    // pending, processing, retrying
TaskMachine.isTerminal(status): boolean    // completed, cancelled
```

#### 8.5 转换副作用

| 目标状态 | 副作用 |
|----------|--------|
| processing | pollFailureCount=0, lastPolledAt=now (ISO string) |
| completed | progress=100, videoUrl=context.videoUrl |
| failed | message=context.error |
| retrying | recoveryAttempts+1, pollFailureCount=0 |

### 13. 策略引擎

#### 9.1 超时策略 (timeout-policy)

- 活跃任务 (pending/processing/retrying) 超过 **2 小时** → TRANSITION to failed
- 终态任务 (completed/failed/cancelled) → NONE

```typescript
function checkTimeout(task: VideoTask): PolicyAction {
  if (!["pending", "processing", "retrying"].includes(task.status)) return { type: "NONE" };
  const elapsed = Date.now() - new Date(task.createdAt).getTime();
  if (elapsed > 2 * 60 * 60 * 1000) {
    return { type: "TRANSITION", targetStatus: "failed", reason: `任务超时 (${Math.round(elapsed / 60000)}分钟)` };
  }
  return { type: "NONE" };
}
```

#### 9.2 过期策略 (expiration-policy)

- completed 任务有 `expiresAt` 且已过期 → DELETE
- completed 任务无 `expiresAt` 且超过 **7 天** → DELETE
- 非 completed 任务 → NONE

#### 9.3 策略引擎 (policy-engine)

```typescript
function evaluatePolicies(task: VideoTask): PolicyAction[] {
  return [checkTimeout(task), checkExpiration(task)].filter(a => a.type !== "NONE");
}
```

#### 9.4 动作类型

```typescript
type PolicyAction =
  | { type: "NONE" }
  | { type: "TRANSITION"; targetStatus: VideoTaskStatus; reason: string }
  | { type: "DELETE"; reason: string }
```

### 14. TimestampBridge

统一内存 (ISO string) 与存储 (Unix timestamp 秒) 的时间戳转换：

```typescript
TimestampBridge.toStorage(isoString: string | null): number | null   // ISO → Unix sec
TimestampBridge.fromStorage(unixSec: number | null): string | null   // Unix sec → ISO
TimestampBridge.toStorageOrThrow(isoString): number                   // 失败抛异常
TimestampBridge.fromStorageOrThrow(unixSec): string                   // 失败抛异常
```

**设计意图**：内存统一使用 ISO 8601 字符串，存储统一使用 Unix 秒，转换只在 I/O 边界发生。

### 15. PollingScheduler

自适应退避轮询调度器：

| 参数 | 值 |
|------|-----|
| 基础间隔 | 5 秒 |
| 最大间隔 | 60 秒 |
| 退避因子 | 1.5x |
| 失败计数 | 每次失败 +1 |

```typescript
const scheduler = new PollingScheduler(onPollCallback);
scheduler.start(taskId);         // 开始轮询
scheduler.stop(taskId);          // 停止轮询
scheduler.stopAll();             // 停止所有轮询
scheduler.reportSuccess(taskId); // 成功 → 重置间隔
scheduler.reportFailure(taskId); // 失败 → 退避
scheduler.isActive(taskId);      // 是否活跃
scheduler.getActiveCount();      // 活跃数量
```

### 16. 状态守卫 (withTransitionGuard)

在 Store 层面，所有状态变更通过守卫函数验证：

```typescript
function withTransitionGuard(
  task: VideoTask,
  targetStatus: VideoTaskStatus,
  updates: Partial<VideoTask>,
): Partial<VideoTask> {
  if (TaskMachine.canTransition(task.status, targetStatus)) {
    return { ...updates, status: targetStatus };
  }
  errorLogger.warn(
    { code: "INVALID_TRANSITION", message: `taskId=${task.taskId}, from=${task.status}, to=${targetStatus}` },
    "VideoTaskManager",
  );
  const { status: _s, ...safeUpdates } = updates;
  return safeUpdates;
}
```

**设计意图**：非法转换时跳过状态变更但保留其他字段更新，避免整个操作失败。

### 17. 存储层集成

状态验证已从存储层移至 Hook 层，存储层不再导入 TaskMachine：

```typescript
// hooks/use-video-task-manager.ts — 状态验证在此
if (!TaskMachine.canTransition(task.status, targetStatus)) {
  errorLogger.warn(...);
  return;
}
await videoTaskStorage.updateVideoTask(taskId, updates);
```

---

## 第四部分：存储层

---

### 18. 存储文件清单

| 文件 | 表名 | 职责 |
|------|------|------|
| `core.ts` | — | 基础工具: buildInsert, parseRecord, toSqlValue, trackChange, isElectron, DbRunResult |
| `sqlite-core.ts` | — | SQLite 核心: safeQuery, safeRun, safeTransaction (结果缓存) |
| `db.ts` | — | 数据库初始化与连接管理 |
| `characters.ts` | characters | 角色 CRUD + 服装管理 |
| `characters/parser.ts` | — | 角色数据解析 (从 storage 迁移到 service) |
| `characters/outfit-manager.ts` | — | 服装管理 (从 characters.ts 拆分) |
| `scenes.ts` | scenes | 场景 CRUD |
| `stories.ts` | stories | 故事 CRUD |
| `stories/beat-transformer.ts` | — | 分镜数据转换 (从 stories.ts 拆分) |
| `stories/relations.ts` | — | 故事关联查询 (从 stories.ts 拆分) |
| `elements.ts` | elements | 元素 CRUD (57 行，逻辑拆分到子模块) |
| `elements/queries.ts` | — | 元素查询操作 |
| `elements/commands.ts` | — | 元素写入操作 |
| `video-tasks.ts` | video_tasks | 视频任务 CRUD (265 行) |
| `video-tasks/parser.ts` | — | 视频任务数据解析 |
| `video-tasks/bulk-operations.ts` | — | 批量操作 |
| `video-cache.ts` | video_cache | 视频缓存管理 |
| `import-export.ts` | — | 数据导入导出 |
| `auto-save.ts` | auto_saves | 自动保存 (带写入验证) |
| `versions.ts` | story_versions | 版本管理 |
| `templates.ts` | templates | 模板管理 |
| `sessions.ts` | sessions | 会话管理 |
| `collections.ts` | collections + collection_assets | 收藏集管理 (级联删除) |
| `error-logs.ts` | error_logs | 错误日志 |
| `storyboard.ts` | storyboard_assets | 分镜板综合查询 |

### 19. 核心工具函数

#### 15.1 buildInsert

构建 INSERT 语句，支持冲突策略：

```typescript
buildInsert(table, record, conflict?: "ABORT" | "IGNORE" | "REPLACE"): { sql: string; params: unknown[] }

// 示例
buildInsert("video_tasks", { task_id: "1", status: "pending" }, "REPLACE")
// → { sql: "INSERT OR REPLACE INTO video_tasks (task_id, status) VALUES (?, ?)", params: ["1", "pending"] }
```

#### 15.2 parseRecord

将数据库记录 (snake_case) 转换为领域对象 (camelCase)：

```typescript
parseRecord<VideoTask>(row, fieldMap): VideoTask
```

#### 15.3 trackChange

注册变更追踪 (用于同步)，仅在 syncConfig.enabled 时注册：

```typescript
trackChange(table, id, operation): void
// 内部: if (changeTracker) changeTracker(table, id, operation)
```

#### 15.4 DbRunResult

safeRun 返回值类型：

```typescript
interface DbRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}
```

### 20. video-tasks.ts 关键设计

#### 16.1 状态验证在 Hook 层

存储层不再导入 TaskMachine，状态验证在 Hook 层执行：

```typescript
// hooks/use-video-task-manager.ts
if (!TaskMachine.canTransition(task.status, targetStatus)) {
  errorLogger.warn(...);
  return;
}
await videoTaskStorage.updateVideoTask(taskId, updates);
```

#### 16.2 REPLACE 策略

所有 UNIQUE 冲突统一使用 `INSERT OR REPLACE`：

```sql
INSERT OR REPLACE INTO video_tasks (task_id, status, ...) VALUES (?, ?, ...)
```

#### 16.3 deleteByStatus 原子性

使用子查询事务确保原子性：

```sql
BEGIN TRANSACTION;
DELETE FROM video_cache WHERE task_id IN (SELECT task_id FROM video_tasks WHERE status = ?);
DELETE FROM video_tasks WHERE status = ?;
COMMIT;
```

#### 16.4 时间戳处理

存储层负责 ISO string ↔ Unix timestamp 的转换：

```typescript
function toStorageTimestamp(value: unknown): number | null {
  if (!value) return null;
  const date = new Date(value as string | number);
  return Math.floor(date.getTime() / 1000);
}

function normalizeTimestamp(value: unknown): string {
  if (!value) return new Date().toISOString();
  return new Date(value as string | number).toISOString();
}
```

### 21. 数据库初始化 (桌面端)

#### 17.1 强制 better-sqlite3

桌面端不再使用 sql.js fallback。如果 better-sqlite3 加载失败，直接报错：

```typescript
if (!betterSqlite3Module) {
  throw new Error("better-sqlite3 not found. This is required for Electron desktop mode.");
}
```

#### 17.2 性能优化 (WAL 模式)

```typescript
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("cache_size = -64000");
db.pragma("temp_store = memory");
db.pragma("mmap_size = 268435456");
```

#### 17.3 自动备份

| 参数 | 值 |
|------|-----|
| 备份间隔 | 24 小时 |
| 最大备份数 | 7 个 |
| 最大保留期 | 30 天 |
| 备份方式 | SQLite Backup API |
| 备份前 | 执行 WAL checkpoint |

#### 17.4 ENOSPC 处理

```typescript
if (error.code === "ENOSPC") {
  isPersistenceAvailable = false;
  // 发送 IPC 警告到渲染进程
  mainWindow.webContents.send("db:persistence-error", {
    type: "disk-full",
    message: "磁盘空间不足！",
  });
}
```

#### 17.5 IPC 接口

| 通道 | 说明 |
|------|------|
| `db:backup-status` | 获取备份状态和列表 |
| `db:create-backup` | 手动创建备份 |
| `db:persistence-error` | 磁盘满警告 (渲染→主) |

### 22. 存储层错误处理

- 不存在的任务更新 → 抛出明确错误消息
- trackChange 失败 → `errorLogger.warn` 记录，不中断主流程
- 空 catch 块 → 至少添加 console.debug 日志

```typescript
errorLogger.warn(
  { code: "TRACK_CHANGE_FAILED", message: `trackChange failed for insert, taskId=${taskId}` },
  "VideoTasks",
);
```

---

## 第五部分：模块 API 参考

---

### 23. video 模块

#### 19.1 video/task-management 子域

**入口**: `src/modules/video/task-management/index.ts`

| 导出 | 类型 | 说明 |
|------|------|------|
| `VideoTask` | Type | 视频任务完整类型 (Zod 推导) |
| `VideoTaskStatus` | Type | 任务状态枚举类型 (6 种) |
| `TransitionError` | Class | 非法状态转换错误 (AppError 子类) |
| `useVideoTaskManager` | Hook | 核心任务管理 Hook |
| `useVideoTaskStore` | Store | Zustand Store 实例 |
| `useVideoTasks` | Hook | 便捷：获取全部任务 |
| `useFailedVideoTasks` | Hook | 便捷：获取失败任务 |
| `useRecoverVideo` | Hook | 便捷：恢复视频 |
| `useCleanExpiredTasks` | Hook | 便捷：清理过期任务 |
| `useStartBackgroundRecovery` | Hook | 便捷：启动后台恢复 |
| `VideoTaskManager` | Component | 任务管理主组件 |
| `VideoTaskManagerInitializer` | Component | 初始化组件 |
| `VideoTaskManagerUI` | Component | UI 包装组件 |
| `buildTrackingInfo` | Function | 构建云端追踪信息 |
| `copyTrackingInfoToClipboard` | Async Function | 复制追踪信息到剪贴板 |
| `openTaskQueryLink` | Function | 打开云控制台查询链接 |

#### 19.2 video/task-management/domain 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `TaskMachine` | Object | 状态机: canTransition, transition, isPollable, isTerminal |
| `TransitionError` | Class | 非法转换错误 (from, to 属性) |
| `TaskEvent` | Type | 领域事件联合类型 (8 种) |
| `pollResultSchema` | Zod Schema | 轮询结果验证 |
| `mapApiStatus` | Function | API 状态→领域状态映射 |
| `checkTimeout` | Function | 超时策略评估 |
| `checkExpiration` | Function | 过期策略评估 |
| `evaluatePolicies` | Function | 策略引擎聚合评估 |

#### 19.3 video/cache 子域

| 导出 | 说明 |
|------|------|
| `getVideoUrlWithCache(taskId, url)` | 获取视频 URL (优先本地缓存) |
| `checkCachedVideo(taskId)` | 检查本地缓存状态 |
| `removeCachedVideo(taskId)` | 删除本地缓存 |
| `cacheVideoBlob(taskId, blob)` | 缓存视频 Blob |
| `getCacheStats()` | 获取缓存统计 |

#### 19.4 video/recovery 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `recoverVideoByTaskId(taskId)` | Function | 通过任务 ID 恢复视频 |
| `saveVideoTask(task)` | Function | 保存任务记录 |
| `getFailedTasks()` | Function | 获取失败任务列表 |
| `getTaskById(taskId)` | Function | 通过 ID 获取任务 |
| `startBackgroundRecovery()` | Function | 启动后台恢复 |
| `cleanExpiredTasks()` | Function | 清理过期任务 |
| `getAllTaskHistory()` | Function | 获取全部任务历史 |
| `SmartRetryEngine` | Class | 智能重试决策引擎 |
| `smartRetryEngine` | Instance | 默认重试引擎实例 |
| `createRetryEngine(config)` | Function | 创建自定义配置的重试引擎 |

### 24. story 模块

#### 20.1 story/planning 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `useStories` | Hook | 故事列表 CRUD (含 useStory, useStoryCount, useCreateStory, useUpdateStory, useDeleteStory) |
| `useStoryPlanner` | Hook | 故事规划器 |
| `useStorySaver` | Hook | 故事自动保存 |
| `storyService` | Service | 故事服务 (create, update, delete, list) |
| `planStory` | Function | AI 故事规划 |
| `checkTextApiConfig` | Function | 检查文本 API 配置 |
| `DEFAULT_STORY` | Const | 默认故事模板 |
| `genres` | Const | 故事类型列表 |
| `tones` | Const | 故事基调列表 |
| `beatTypes` | Const | 分镜类型列表 |

#### 20.2 story/beat-editor 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `useStoryState` | Hook | 故事状态管理 |
| `useAssetLoader` | Hook | 资产加载 |
| `BeatDetailEditor` | Component | 分镜详情编辑器 (拆分为 6 个 sections) |
| `BeatOverviewCard` | Component | 分镜概览卡片 (使用 SafeImage) |
| `ElementBindingPanel` | Component | 元素绑定面板 (通过 DI 获取 elementManager) |
| `ProfessionalModeEditor` | Component | 专业模式编辑器 |
| `SortableBeatList` | Component | 可排序分镜列表 |

#### 20.3 story/generation 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `useAIGeneratorBase` | Hook | AI 生成器基类 |
| `useBatchGeneration` | Hook | 批量生成 |
| `useFramePairGeneration` | Hook | 帧对生成 |
| `useKeyframeGeneration` | Hook | 关键帧生成 |
| `useVideoGeneration` | Hook | 视频生成 |
| `BatchStrategy` | Const | 批量策略常量 |
| `GenerationLevel` | Const | 生成级别常量 |

#### 20.4 story/template 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `createTemplateFromBeats` | Function | 从分镜创建模板 |
| `applyTemplateToBeats` | Function | 模板应用到分镜 |
| `compareVersions` | Function | 版本比较 |
| `formatVersionTime` | Function | 版本时间格式化 |
| `TemplateManagerDialog` | Component | 模板管理对话框 |
| `VersionDialog` | Component | 版本对话框 |
| `AssetPicker` | Component | 资产选择器 |

#### 20.5 story/prompt-editor 子域

| 导出 | 类型 | 说明 |
|------|------|------|
| `usePromptEditor` | Hook | 提示词编辑器 |
| `PromptEditor` | Component | 提示词编辑器组件 |
| `PromptFloatingBall` | Component | 浮动球组件 |
| `promptEditorService` | Service | 提示词编辑器服务 |

### 25. character 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `useCharacters` | Hook | 角色 CRUD (含 useCharacter, useCharacterCount, useCreateCharacter, useUpdateCharacter, useDeleteCharacter) |
| `useCharacterCRUD` | Hook | 角色 CRUD 便捷 Hook |
| `useCharacterImage` | Hook | 角色图片生成/上传 |
| `useOutfitManagement` | Hook | 服装管理 |
| `characterService` | Service | 角色服务层 |
| `normalizeGender` | Function | 性别字段标准化 (从 storage 迁移) |

### 26. scene 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `useScenes` | Hook | 场景 CRUD |
| `useSceneImage` | Hook | 场景图片生成/上传 |
| `useSceneList` | Hook | 场景列表 |
| `sceneService` | Service | 场景服务层 |

### 27. shot 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `performConsistencyCheck` | Function | 一致性检查 (API 路由使用) |
| `validateFeatureAnchoringConfigFull` | Function | 特征锚定配置验证 |
| `validateNoFrameBindingParams` | Function | 无帧绑定参数验证 |
| `checkCharacterReferences` | Function | 角色引用检查 (删除前校验) |
| `checkSceneReferences` | Function | 场景引用检查 (删除前校验) |
| `checkElementReferences` | Function | 元素引用检查 (删除前校验) |
| `SHOT_SIZE_OPTIONS` | Const | 镜头尺寸选项 |
| `CAMERA_MOVEMENT_OPTIONS` | Const | 镜头运动选项 |
| `CAMERA_ANGLE_OPTIONS` | Const | 镜头角度选项 |
| `elementManager` | Service | 元素管理器 (通过 DI 获取) |
| `validateReferenceImageQuality` | Function | 参考图片质量验证 |
| `buildFeatureAnchoringConfig` | Function | 构建特征锚定配置 |
| `referenceEngine` | Service | 参考引擎 (通过 DI 获取) |

### 28. prompt 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `videoPromptService` | Service | 视频提示词服务 |
| `scenePromptService` | Service | 场景提示词服务 |
| `characterPromptService` | Service | 角色提示词服务 |
| `promptBuilder` | Service | 提示词构建器 |
| `quickModeBuilder` | Service | 快速模式构建器 |

### 29. asset 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `useAssetImportExport` | Hook | 资产导入导出 |
| `useMediaAssets` | Hook | 媒体资产管理 |
| `useProjectExport` | Hook | 项目导出 |
| `asaExportService` | Service | ASA 格式导出 (使用 isAllowedImageUrl 验证) |

### 30. sync 模块

| 导出 | 类型 | 说明 |
|------|------|------|
| `initSyncEngine` | Function | 初始化同步引擎 (条件注册 changeTracker) |
| `performSync` | Function | 执行同步 |
| `getSyncStatus` | Function | 获取同步状态 |
| `updateSyncConfig` | Function | 更新同步配置 (动态注册 changeTracker) |
| `getSyncConfig` | Function | 获取同步配置 |
| `setConflictCallback` | Function | 设置冲突回调 |
| `recordChange` | Function | 记录变更 |
| `SyncConflictPanel` | Component | 冲突解决面板 |
| `SyncSettingsPanel` | Component | 同步设置面板 |
| `SyncStatusIndicator` | Component | 同步状态指示器 |
| `createVectorClock` | Function | 创建向量时钟 |
| `mergeVectorClocks` | Function | 合并向量时钟 |
| `compareVectorClocks` | Function | 比较向量时钟 |
| `incrementVectorClock` | Function | 递增向量时钟 |
| `isVectorClockConflict` | Function | 检测向量时钟冲突 |
| `DEFAULT_SYNC_CONFIG` | Const | 默认同步配置 |

### 31. shared 层

#### 27.1 通用 Hooks

| Hook | 说明 |
|------|------|
| `useDirtyState` | 脏状态追踪 |
| `useMemoryMonitor` | 内存监控 |
| `useNetworkMonitor` | 网络监控 |
| `useDebouncedState` | 防抖状态 |
| `useKeyboardShortcuts` | 键盘快捷键 |

#### 27.2 通用 UI 组件

| 组件 | 说明 |
|------|------|
| `SafeImage` | 安全图片组件 (Next/Image 封装, 支持 data:/blob:/file:) |
| `Sidebar` | 侧边栏导航 |
| `ErrorBoundary` | 错误边界 |
| `Toast` | 消息提示 |
| `SearchDialog` | 全局搜索 |
| `ModelSelector` | 模型选择器 |
| `VirtualList` | 虚拟滚动列表 |
| `CrashRecoveryDialog` | 崩溃恢复对话框 |
| `DebugOverlay` | 调试覆盖层 |

#### 27.3 通用工具

| 工具 | 说明 |
|------|------|
| `validateExternalUrl(url)` | 验证外部 URL 安全性 |
| `isAllowedImageUrl(url)` | 图片 URL 安全检查 (支持本地协议) |
| `isAllowedVideoUrl(url)` | 视频 URL 安全检查 (支持本地协议) |
| `isElectron()` | Electron 环境检测 (结果缓存) |
| `fileDownload` | 文件下载工具 |
| `resolveImageUrl` | 图片 URL 解析 |
| `performance` | 性能工具 |
| `utils` | 通用工具函数 |

#### 27.4 全局服务

| 服务 | 说明 |
|------|------|
| `appStore` | 全局 Zustand Store |
| `eventBus` | 事件总线 (发布/订阅) |
| `errorLogger` | 错误日志 (warn/error/info/debug/fatal) |

---

## 第六部分：错误处理

---

### 32. 设计原则

项目采用 **Result Monad** 模式替代异常，所有可能失败的操作返回 `Result<T, E>` 类型。

核心原则：

1. **不抛异常** — 业务逻辑使用 `Result` 返回
2. **类型安全** — 编译器强制处理错误路径
3. **错误分类** — 12 种具体错误类型覆盖所有场景
4. **统一日志** — 所有错误通过 `errorLogger` 记录
5. **禁止空 catch** — 所有 catch 块至少添加日志

### 33. Result 类型

#### 29.1 定义

```typescript
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

#### 29.2 构造函数

```typescript
import { ok, err, fromThrowable, fromAsyncThrowable } from "@/domain/types/result";

ok(data);                           // 成功
err(new ApiError("CODE", "msg"));   // 失败
fromThrowable(() => riskyOp());     // 包装同步异常
fromAsyncThrowable(() => asyncOp()); // 包装异步异常
```

#### 29.3 使用模式

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

### 34. AppError 错误类型

#### 30.1 基类

```typescript
class AppError extends Error {
  code: string;
  cause?: unknown;
}
```

#### 30.2 具体错误类型 (12 种)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AppError 类层次 (12 种错误类型)                       │
│                                                                         │
│  AppError (基类)                                                        │
│  ├── code: string                                                       │
│  ├── message: string                                                    │
│  └── cause?: unknown                                                    │
│                                                                         │
│  ├── DatabaseError          code: "DATABASE_ERROR"                      │
│  ├── ValidationError        code: "VALIDATION_ERROR"                    │
│  ├── ApiError               code: "API_ERROR"                           │
│  │   ├── statusCode?: number                                            │
│  │   └── apiCode?: string                                               │
│  ├── NotFoundError          code: "NOT_FOUND"                           │
│  ├── NetworkError           code: "NETWORK_ERROR"                       │
│  ├── StorageError           code: "STORAGE_ERROR"                       │
│  ├── ConfigurationError     code: "CONFIGURATION_ERROR"                 │
│  ├── GenerationError        code: "GENERATION_ERROR"                    │
│  │   └── generationType: "keyframe"|"framePair"|"video"|"image"|"text" │
│  ├── TimeoutError           code: "TIMEOUT_ERROR"                       │
│  ├── RateLimitError         code: "RATE_LIMIT_ERROR"                    │
│  │   └── retryAfter?: number                                            │
│  ├── AuthenticationError    code: "AUTHENTICATION_ERROR"                │
│  └── TransitionError        code: "INVALID_TRANSITION"  ← v0.6.0 新增  │
│      ├── from: VideoTaskStatus                                         │
│      └── to: VideoTaskStatus                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

| 错误类 | code 值 | 用途 |
|--------|---------|------|
| `DatabaseError` | DATABASE_ERROR | 数据库操作失败 |
| `ValidationError` | VALIDATION_ERROR | 数据验证失败 |
| `ApiError` | API_ERROR | 外部 API 调用失败 |
| `NotFoundError` | NOT_FOUND | 资源不存在 |
| `NetworkError` | NETWORK_ERROR | 网络连接问题 |
| `StorageError` | STORAGE_ERROR | 本地存储失败 |
| `ConfigurationError` | CONFIGURATION_ERROR | 配置错误 |
| `GenerationError` | GENERATION_ERROR | AI 生成失败 |
| `TimeoutError` | TIMEOUT_ERROR | 操作超时 |
| `RateLimitError` | RATE_LIMIT_ERROR | 速率限制 |
| `AuthenticationError` | AUTHENTICATION_ERROR | 认证失败 |
| `TransitionError` | INVALID_TRANSITION | 非法状态转换 |

#### 30.3 TransitionError

```typescript
export class TransitionError extends AppError {
  constructor(
    public readonly from: VideoTaskStatus,
    public readonly to: VideoTaskStatus,
  ) {
    super("INVALID_TRANSITION", `不允许从 ${from} 转换到 ${to}`);
  }
}
```

#### 30.4 使用示例

```typescript
return err(new ApiError("API_VIDEO_GENERATION_FAILED", "视频生成请求失败", { cause: originalError }));
return err(new NotFoundError("NOT_FOUND_TASK", `任务不存在: ${taskId}`));
return err(new ValidationError("VALIDATION_INVALID_STATUS", `非法状态: ${status}`));
return err(new TransitionError("completed", "processing")); // 非法状态转换
```

### 35. errorLogger

#### 31.1 API

```typescript
import { errorLogger } from "@/shared/error-logger";

errorLogger.debug(error, context?);
errorLogger.info(error, context?);
errorLogger.warn(error, context?);
errorLogger.error(error, context?);
errorLogger.fatal(error, context?);
```

#### 31.2 参数类型

第一个参数 `error` 支持三种形式：

```typescript
// 1. AppError 实例
errorLogger.warn(new AppError("CODE", "message"));

// 2. 字符串
errorLogger.warn("简单错误描述");

// 3. 对象字面量 (仅允许 code, message, cause)
errorLogger.warn({ code: "CODE", message: "描述信息" });
errorLogger.error({ code: "CODE", message: "描述", cause: originalError });
```

#### 31.3 禁止事项

**禁止**传入非法属性：

```typescript
// ❌ 错误 — taskId, field, operation 不在类型定义中
errorLogger.warn({ code: "CODE", taskId: "123", operation: "insert" });

// ✅ 正确 — 嵌入 message
errorLogger.warn({ code: "CODE", message: "taskId=123, operation=insert failed" });
```

#### 31.4 context 参数

第二个参数 `context` 为可选字符串，标识错误来源：

```typescript
errorLogger.warn({ code: "CODE", message: "..." }, "VideoTasks");
errorLogger.error({ code: "CODE", message: "..." }, "PollingScheduler");
```

### 36. 错误处理模式

#### 32.1 存储层

```typescript
async createVideoTask(task: VideoTaskRecord): Promise<void> {
  try {
    const { sql, params } = buildInsert("video_tasks", task, "REPLACE");
    await safeRun(sql, params);
  } catch (e) {
    errorLogger.error({ code: "DB_CREATE_FAILED", message: extractErrorMessage(e) }, "VideoTasks");
    throw e; // 存储层允许向上抛出
  }
}
```

#### 32.2 Hook 层

```typescript
const handleRecoverVideo = async () => {
  const result = await recoverVideoByTaskId(taskId);
  if (result.success) {
    toast.success("找回成功", result.message);
  } else {
    toast.error("找回失败", result.message);
  }
};
```

#### 32.3 状态机层

```typescript
const result = TaskMachine.transition(task, targetStatus);
if (!result.ok) {
  // result.error 是 TransitionError 实例
  errorLogger.warn({
    code: "INVALID_TRANSITION",
    message: `taskId=${task.taskId}, from=${result.error.from}, to=${result.error.to}`,
  });
  return; // 静默跳过，不抛异常
}
```

#### 32.4 空 catch 块处理

所有 catch 块至少添加日志：

```typescript
// ✅ 正确
} catch (e) {
  console.debug("[Sync] localStorage read failed:", e);
}

// ✅ 正确 — 防御性编程
} catch (e) {
  console.debug("[NetworkMonitor] Listener error:", e);
}

// ❌ 禁止
} catch {}
```

### 37. 错误日志输出

#### 33.1 格式

```
2026-05-18T14:15:48.204Z [WARN] [Context] [CODE] message
```

#### 33.2 日志级别

| 级别 | 优先级 | 用途 |
|------|--------|------|
| debug | 0 | 调试信息 (空 catch 块日志) |
| info | 1 | 一般信息 |
| warn | 2 | 警告 (默认最低级别) |
| error | 3 | 错误 |
| fatal | 4 | 致命错误 |

#### 33.3 事件总线

所有日志同时通过事件总线发布：

```typescript
eventBus.emit(ErrorEvents.LOGGED, entry);
```

### 38. 网络层错误处理

#### 34.1 熔断器

```
CircuitBreaker — 三态: CLOSED → OPEN → HALF_OPEN

配置:
├── failureThreshold: 5
├── recoveryTimeout: 30000ms
├── halfOpenMaxCalls: 2
└── successThreshold: 3
```

#### 34.2 重试执行器

```
RetryExecutor — 指数退避 + 抖动

策略配置:
┌──────────┬─────────┬──────────┬─────────┬──────────────┐
│ 策略     │ 最大重试 │ 基础延迟 │ 最大延迟 │ 退避方式     │
├──────────┼─────────┼──────────┼─────────┼──────────────┤
│ api      │ 3       │ 1000ms   │ 10000ms │ exponential  │
│ video    │ 5       │ 2000ms   │ 30000ms │ exponential  │
│ download │ 3       │ 1000ms   │ 5000ms  │ linear       │
│ status   │ 5       │ 3000ms   │ 15000ms │ exponential  │
└──────────┴─────────┴──────────┴─────────┴──────────────┘

抖动: delay * (0.5 + random() * 0.5)
可重试错误: NETWORK_ERROR, TIMEOUT, RATE_LIMITED, API_SERVER_ERROR, ECONNREFUSED, ETIMEDOUT
```

#### 34.3 弹性 Fetch

```
resilientFetch — 熔断 + 重试 + 缓存 + 日志拦截器链
├── 分块下载 (chunkSize: 1MB)
├── 并发控制 (concurrency: 3)
├── 断点续传 (Range: bytes=start-end)
├── 超时控制 (timeout: 30s)
└── 进度回调 (onProgress)
```

#### 34.4 智能重试引擎

```typescript
SmartRetryEngine — 基于 AI 提供商错误类型的重试决策
- 超时 → 重试 (指数退避)
- 限流 → 重试 (延迟 ≥ 60s)
- 余额不足 → 不重试
- 参数错误 → 不重试
- 网络错误 → 重试 (低 tokenWasteRisk)
- 验证失败 → 重试 (可能是假成功)
```

---

## 第七部分：测试指南

---

### 39. 测试基础设施

| 工具 | 用途 |
|------|------|
| Vitest | 单元测试 + 组件测试 |
| happy-dom | DOM 环境 |

**运行命令**：

```bash
npm test              # 运行全部单元测试
npx vitest run        # 单次运行
npx vitest watch      # 监听模式
npx vitest coverage   # 覆盖率
```

### 40. 测试目录结构

```
src/
├── __tests__/                    # 全局测试
│   ├── e2e/                      # E2E 测试 (smoke, regression, integration, performance, security, boundary...)
│   ├── hooks/                    # Hook 测试
│   ├── lib/                      # 库/工具测试 (api-client, video-providers, video-cache, model-capabilities...)
│   │   └── storage/              # 存储层测试 (video-cache, video-tasks, elements, stories, core)
│   ├── mocks/                    # Mock 工厂和工具
│   └── utils/                    # 测试工具
├── modules/
│   └── {module}/
│       └── __tests__/            # 模块级测试
│       └── {subdomain}/
│           └── __tests__/        # 子域级测试
├── domain/
│   ├── schemas/__tests__/        # Schema 验证测试
│   ├── services/__tests__/       # 领域服务测试
│   └── utils/__tests__/          # 领域工具测试
└── infrastructure/
    ├── storage/__tests__/        # 存储层测试 (9 个文件)
    ├── di/__tests__/             # DI 容器测试
    ├── network/__tests__/        # 网络层测试
    └── ai-providers/__tests__/   # AI 提供商测试
```

### 41. 反模式：头疼砍头式测试

**定义**：当测试失败时，开发者修改测试让它通过，而不是调查项目代码是否有 bug。

#### 37.1 常见反模式

| 反模式 | 示例 | 问题 |
|--------|------|------|
| `toBeDefined()` 无行为验证 | `expect(fn).toBeDefined()` | 只验证存在性，不验证行为 |
| `typeof === "function"` 不调用 | `expect(typeof obj.fn).toBe("function")` | 函数存在但不测试返回值 |
| 正则扫描源码 | `expect(sourceCode).toMatch(/export/)` | 测试文本而非运行时行为 |
| `expect.any()` 逃避验证 | `expect(result).toEqual(expect.any(Object))` | 过于宽松 |
| 修改测试适配源码 Bug | 测试发现 Bug 后改断言 | 掩盖问题而非修复 |

#### 37.2 正确做法

```typescript
// ❌ 反模式
it("should export buildTrackingInfo", () => {
  expect(typeof taskMgmt.buildTrackingInfo).toBe("function");
});

// ✅ 正确
it("buildTrackingInfo 应构建完整的追踪信息", () => {
  const info = buildTrackingInfo("task-123", "https://api.example.com");
  expect(info.taskId).toBe("task-123");
  expect(info.providerName).toBeDefined();
  expect(info.queryEndpoint).toContain("task-123");
});
```

#### 37.3 区分测试 Bug 与源码 Bug

| 场景 | 判断 | 处理 |
|------|------|------|
| 测试断言与重构后的源码不匹配 | 测试 Bug | 更新测试断言 |
| 测试使用了不存在的导入路径 | 测试 Bug | 修正导入路径 |
| 测试发现源码返回值与预期不符 | 源码 Bug | 修复源码，不改测试 |
| 测试 mock 行为与真实实现不一致 | 测试 Bug | 更新 mock |

### 42. vi.restoreAllMocks() 陷阱

#### 38.1 问题描述

`setup.ts` 在 `afterEach` 中调用 `vi.restoreAllMocks()`，这会重置 `vi.mock()` 工厂函数中设置的 mock 实现，导致后续测试从 mock 函数获得 `undefined`。

#### 38.2 解决方案

在 `beforeEach` 中重新设置 mock 返回值：

```typescript
beforeEach(() => {
  vi.mocked(apiClient.post).mockResolvedValue({ ok: true, value: mockData });
});
```

#### 38.3 根因

```
vi.mock() 工厂 → 设置 mockImplementation
afterEach → vi.restoreAllMocks() → 清除 mockImplementation
下一个测试 → 调用 mock 函数 → 返回 undefined
```

### 43. 测试编写规范

#### 39.1 命名

```typescript
describe("模块名", () => {
  describe("函数/组件名", () => {
    it("should 行为 when 条件", () => { ... });
  });
});
```

#### 39.2 Mock 原则

1. **Mock 依赖，不 Mock 被测模块本身** — 除非模块有副作用
2. **Mock 最小范围** — 只 mock 直接依赖
3. **验证行为，不验证实现** — 测试输入输出，不测试内部变量
4. **优先测试纯逻辑** — 无 mock 的测试更可靠

#### 39.3 Result 类型测试

```typescript
it("should return ok on success", () => {
  const result = someFunction();
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toEqual(expected);
  }
});

it("should return err on failure", () => {
  const result = someFunction();
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("EXPECTED_CODE");
  }
});
```

#### 39.4 状态机测试

```typescript
it.each([
  ["pending", "processing", true],
  ["pending", "completed", false],
] as [VideoTaskStatus, VideoTaskStatus, boolean][])(
  "canTransition(%s, %s) => %s",
  (from, to, expected) => {
    expect(TaskMachine.canTransition(from, to)).toBe(expected);
  },
);
```

#### 39.5 E2E 测试

```typescript
// 使用 describe.skipIf 而非条件返回
const serverAvailable = await checkServer();
describe.skipIf(!serverAvailable)("E2E tests", () => {
  it("should work", () => { ... });
});
```

### 44. 当前测试统计

| 指标 | 数值 |
|------|------|
| 测试文件 | 92 个通过, 1 个跳过 |
| 测试用例 | 1761 个通过, 12 个跳过 |
| 失败 | 0 |

#### 40.1 核心测试覆盖

| 测试文件 | 测试数 | 覆盖 |
|----------|--------|------|
| task-machine.test.ts | 44 | 状态机全量 + TransitionError |
| task-schema.test.ts | 12 | Schema + 状态映射 |
| policies.test.ts | 21 | 超时/过期/引擎 |
| timestamp-bridge.test.ts | 23 | ISO↔Unix 转换 |
| polling-scheduler.test.ts | 17 | 轮询调度 |
| story-generation-service.test.ts | 28 | 故事生成服务 (纯逻辑) |
| registry.test.ts | 6 | DI 容器核心 |
| shot-validator.test.ts | 17 | 镜头参数验证 + 自动修复 |
| smart-retry-engine.test.ts | 12 | 智能重试决策 |
| collections.test.ts | 8 | 集合存储 CRUD |
| schema-validation.test.ts | — | Zod Schema 全面验证 |
| circuit-breaker.test.ts | — | 熔断器状态转换 |
| domain-services.test.ts | 18 | 领域服务纯逻辑 |
| vector-clock.test.ts | 13 | 向量时钟操作 |

---

## 第八部分：开发指南

---

### 45. 环境准备

#### 41.1 前置要求

- Node.js >= 18
- npm >= 9
- Git

#### 41.2 安装

```bash
git clone <repo-url>
cd ai-animation-studio
npm install
```

#### 41.3 环境变量

复制 `.env.example` 为 `.env.local`，填入 API 密钥：

```env
# 必填
API_URL=https://your-api-endpoint
API_KEY=your-api-key

# 可选
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
```

### 46. 开发命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | Web 开发服务器 (localhost:3000) |
| `npm run electron:dev` | Electron 开发模式 (localhost:3001) |
| `npm run build` | Web 生产构建 |
| `npm run build:electron` | Electron 构建 |
| `npm test` | 运行测试 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化 |

### 47. 项目约定

#### 43.1 目录命名

- 模块: `kebab-case` (如 `task-management`)
- 子域: `kebab-case` (如 `beat-editor`)
- 测试: `__tests__/`
- 组件: `PascalCase.tsx` (如 `TaskCard.tsx`)
- Hook: `use-*.ts` (如 `use-video-task-manager.ts`)
- 服务: `kebab-case.ts` (如 `video-tracker.ts`)

#### 43.2 导入路径

项目配置了以下路径别名：

```typescript
"@/*"          → "src/*"
"@/domain/*"   → "src/domain/*"
"@/shared/*"   → "src/shared/*"
"@/modules/*"  → "src/modules/*"
"@/infrastructure/*" → "src/infrastructure/*"
```

**重要**：不要从子域内部路径导入，应从模块入口导入：

```typescript
// ❌ 错误 — 深层导入
import { TaskMachine } from "@/modules/video/task-management/domain";

// ✅ 正确 — 从模块入口导入
import { TaskMachine } from "@/modules/video/task-management";
```

#### 43.3 子域结构

每个子域遵循统一结构：

```
subdomain/
├── contract.json      # 公共 API 契约
├── index.ts           # Barrel 导出
├── hooks/             # React Hooks
├── services/          # 业务服务
├── presentation/      # UI 组件
├── domain/            # 领域模型 (可选)
├── infrastructure/    # 基础设施 (可选)
└── __tests__/         # 测试
```

### 48. 编码规范

#### 44.1 错误处理

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

#### 44.2 errorLogger 使用

```typescript
// 合法签名: AppError | string | { code: string; message: string; cause?: unknown }
errorLogger.warn({ code: "CODE", message: "描述信息" }, "Context");
errorLogger.error("简单字符串消息", "Context");
errorLogger.info({ code: "CODE", message: "信息" });
```

**禁止**传入非法属性 (taskId, field, operation 等)：

```typescript
// ❌ 错误 — taskId 不在类型定义中
errorLogger.warn({ code: "CODE", taskId: "123" }, "Context");

// ✅ 正确 — 嵌入 message
errorLogger.warn({ code: "CODE", message: "taskId=123 failed" }, "Context");
```

#### 44.3 时间类型

全项目统一使用 ISO 8601 字符串：

```typescript
// ✅ 正确
createdAt: new Date().toISOString()

// ❌ 错误
createdAt: Date.now()
createdAt: Math.floor(Date.now() / 1000)
```

#### 44.4 非空断言

避免使用 `!` 非空断言，使用可选链 + 空值合并：

```typescript
// ❌ 危险
const url = result!.data!.imageUrl;

// ✅ 安全
const url = result?.data?.imageUrl ?? "";
```

#### 44.5 空 catch 块

禁止空 catch 块，至少添加日志：

```typescript
// ❌ 危险
} catch {}

// ✅ 安全
} catch (e) {
  console.debug("[Module] Operation failed:", e);
}
```

#### 44.6 状态管理

- 使用 Zustand Store
- 状态变更必须通过状态机验证
- 使用 `withTransitionGuard` 守卫函数

#### 44.7 数据验证

- 所有领域类型使用 Zod Schema 定义
- Schema 即类型：`type X = z.infer<typeof xSchema>`
- API 返回值使用 `schema.safeParse()` 验证

#### 44.8 依赖注入

```typescript
import { container } from "@/infrastructure/di";

// 获取服务
const storage = container.videoTaskStorage;
const elementManager = container.elementManager;
const referenceEngine = container.referenceEngine;
```

#### 44.9 URL 安全

所有 fetch 调用用户提供的 URL 前应验证：

```typescript
import { isAllowedImageUrl, isAllowedVideoUrl } from "@/shared/utils/url-validation";

if (!isAllowedVideoUrl(downloadUrl)) {
  // 处理不安全的 URL
}
```

#### 44.10 innerHTML 禁止

禁止使用 `innerHTML`，改用 DOM API：

```typescript
// ❌ 危险 — XSS 风险
element.innerHTML = `<video src="${url}">`;

// ✅ 安全 — DOM API
const video = document.createElementNS("http://www.w3.org/1999/xhtml", "video");
video.src = url;
element.appendChild(video);
```

### 49. 添加新模块

#### 45.1 步骤

1. 在 `src/modules/` 下创建模块目录
2. 创建子域目录和 `contract.json`
3. 在 `src/domain/schemas/` 添加 Zod Schema
4. 在 `src/domain/ports/` 添加端口接口
5. 在 `src/infrastructure/` 添加实现
6. 在 `src/infrastructure/di/container.ts` 注册依赖
7. 编写测试 (优先纯逻辑测试)

#### 45.2 模板

```
src/modules/new-module/
├── index.ts
├── contract.json
├── hooks/
│   ├── use-new-module.ts
│   └── __tests__/
├── services/
│   └── new-module-service.ts
└── presentation/
    └── NewModulePanel.tsx
```

### 50. Git 工作流

- 分支命名: `feature/xxx`, `fix/xxx`, `refactor/xxx`
- 提交前: `npm run typecheck && npm test`
- 不提交: `.env.local`, `node_modules/`, `_backup-v2/`

---

## 第九部分：变更日志

---

### [0.6.0-beta.1] — 2026-05-18

### 重大变更

#### 时间类型统一

- **全项目时间戳从 number 统一为 ISO 8601 string**: 消除 number/Date/string 混用导致的时间比较和序列化不一致
- **characterSchema.createdAt**: `z.number()` → `z.string()`，Schema 层强制 ISO 8601 格式
- **videoTaskSchema 所有时间字段统一为 ISO string**: createdAt/updatedAt/completedAt 等字段全部迁移
- **存储层负责 ISO string ↔ Unix timestamp 的转换**: 存储层写入时转 Unix timestamp，读取时转回 ISO string，上层无感知
- **TaskMachine.transition 副作用**: `Date.now()` → `new Date().toISOString()`，状态转换时间戳统一为 ISO 格式

#### DI 接口注入

- **新增 2 个端口接口**: `IElementManager` (10 个方法), `IReferenceEngine` (4 个方法)，解耦领域层与基础设施层
- **DI 容器注册**: `elementManager` 和 `referenceEngine` 注册为单例，通过容器统一获取
- **消费方迁移**: ProfessionalModeEditor, ElementBindingPanel, ShotReferenceConfig 从直接导入改为 DI 获取，消除硬依赖

#### 数据安全加固

- **桌面端强制 better-sqlite3**: 移除 sql.js fallback 路径，消除数据丢失风险，桌面端不再支持降级到内存数据库
- **WAL 模式**: better-sqlite3 使用 WAL 日志模式，崩溃不丢数据，读写并发性能提升
- **自动备份**: 每 24 小时自动备份，保留 7 个备份，30 天过期，防止数据永久丢失
- **ENOSPC 检测**: 磁盘满时禁用写入，发送 IPC 警告，避免数据库损坏
- **损坏恢复**: 数据库损坏时自动重命名并重建，保留损坏文件供手动恢复

#### 文件拆分 (8 个超大文件)

| 文件 | 之前 | 之后 | 提取模块 |
|------|------|------|----------|
| use-video-task-manager.ts | 1031 行 | 624 行 | internals/{polling-engine,sync-engine,transition-guard} |
| stories.ts | 722 行 | 300 行 | stories/{beat-transformer,relations} |
| VideoTaskManager.tsx | 703 行 | 362 行 | handlers/video-task-handlers.ts |
| BeatDetailEditor.tsx | 569 行 | 219 行 | 6 个 sections 组件 |
| video-tasks.ts | 507 行 | 265 行 | video-tasks/{parser,bulk-operations} |
| elements.ts | 413 行 | 57 行 | elements/{queries,commands} |
| characters.ts | 407 行 | 203 行 | characters/{outfit-manager,parser} |
| TaskCard.tsx | 330 行 | 158 行 | task-card/{video-preview,task-actions} |

### 新增

- `src/domain/ports/element-manager-port.ts` — IElementManager 接口 (10 个方法)
- `src/domain/ports/reference-engine-port.ts` — IReferenceEngine 接口 (4 个方法)
- `src/shared/utils/url-validation.ts` — URL 安全验证工具 (SSRF 防护)
- `src/shared/ui/safe-image.tsx` — 安全图片组件 (Next/Image 封装，防止恶意 URL)
- `src/modules/video/recovery/services/smart-retry-engine.ts` — 智能重试引擎
- `electron/src/database/db-connection.ts` — 数据安全加固 (备份/ENOSPC/WAL)
- 5 个新测试文件 (story-generation-service, registry, shot-validator, smart-retry-engine, collections) — 71 个测试用例

### 修复

- **非空断言崩溃**: `storyboard-generation-service.ts` 中 `firstResult!.data!.imageUrl` → `firstResult?.data?.imageUrl ?? ""`，消除运行时 TypeError
- **非空断言崩溃**: `asa-export-service.ts` 中 8 处 `exportData.xxx!.push()` → `exportData.xxx?.push()`，消除运行时 TypeError
- **空 catch 块**: `engine.ts` 中 6 处空 catch → 添加 `console.debug` 日志，便于排查静默失败
- **空 catch 块**: `network-monitor.ts` 中 4 处空 catch → 添加 `console.debug` 日志，便于排查静默失败
- **innerHTML XSS**: `video-preview.tsx` 中 innerHTML → `createElementNS` DOM API，消除 XSS 注入风险
- **SSRF 风险**: `video-task-handlers.ts` 中 fetch URL → `isAllowedVideoUrl` 验证，阻止内网请求
- **SSRF 风险**: `asa-export-service.ts` 中 fetch URL → `isAllowedImageUrl` 验证，阻止内网请求
- **错误分类**: `story-service.ts` 中 7 处 catch 块从 `ValidationError` → `DatabaseError`，修正异常语义
- **存储层反向依赖**: `video-tasks.ts` 移除 TaskMachine 导入，状态验证移至 hook 层，恢复依赖方向
- **Sync 引擎写放大**: `registerChangeTracker` 仅在 `syncConfig.enabled` 时注册，避免无效写入
- **isElectron() 性能**: 每次调用重新计算 → 首次计算后缓存结果，减少重复检测开销
- **Window 全局类型**: 添加 `__OFFLINE_QUEUE_STATE__` 等全局变量声明，消除 TypeScript 类型错误
- **类型安全**: 22+ 处 `as unknown as T` 改为类型安全的方式，消除不安全类型断言
- **normalizeGender 迁移**: 从 storage 层移至 character 服务层，保持职责归属正确

### 测试修复

- `db-connection.test.ts`: 移除 detectDbType/migrateToBetterSqlite3 测试 (函数已删除)
- `video-tasks.test.ts`: 时间戳断言从 number → ISO string
- `task-machine.test.ts`: updatedAt 比较从直接数值 → `new Date().getTime()`
- `api-schema.test.ts`: createdAt 从 `Math.floor(Date.now()/1000)` → `new Date().toISOString()`
- `schema-validation.test.ts`: 所有时间戳字段从 number → ISO string
- `video-recovery-workflow.test.ts`: 导入路径 `@/domain/models/video` → `@/domain/schemas`
- `sqlite-core-enhanced.test.ts`: safeRun 返回值从 undefined → DbRunResult
- `regression.test.ts`: createdAt 从 number → ISO string
- `factories.ts`: videoTask createdAt 从 number → ISO string

### 代码简化

- `electron/src/db-interface.ts`: 移除 SqlJsDatabase/SqlJsStatement 类 (474→332 行, -30%)
- `electron/src/database/db-connection.ts`: 移除 sql.js 逻辑 (899→553 行, -38%)
- `electron/src/database/index.ts`: 移除 detectDbType/migrateToBetterSqlite3 导出
- `electron/src/handlers/database.ts`: db:migrate 返回 "Already using better-sqlite3"

### 测试统计

| 指标 | 0.5.0-beta.1 | 0.6.0-beta.1 |
|------|-------------|-------------|
| 测试文件 | 89 | 92 (+3) |
| 测试用例 | 1743 | 1761 (+18) |
| 失败 | 0 | 0 |

### [0.5.0-beta.1] — 2026-05-17

### 重大变更

#### 任务管理系统 v2 重构

- **新增 TaskMachine 状态机**: 强制校验所有任务状态转换，杜绝非法跳转 (如 pending→completed)
- **新增 "retrying" 状态**: `VideoTaskStatus` 从 5 种扩展为 6 种 (pending/processing/completed/failed/cancelled/retrying)
- **新增 PolicyEngine 策略引擎**: 统一管理超时策略 (2h) 和过期策略 (7d)
- **新增 TimestampBridge**: 统一内存 (ms) 与存储 (s) 的时间戳转换，消除毫秒/秒混用
- **新增 PollingScheduler**: 自适应退避轮询 (5s~60s, 1.5x factor)
- **新增 withTransitionGuard**: Store 层状态变更守卫，非法转换跳过状态但保留其他字段

#### VideoTaskManager.tsx 拆分

- 主组件从 **1740 行** 缩减为 **703 行** (-60%)
- 拆分为 9 个子组件: TaskCard, TaskFilterBar, RecoverySection, TaskTrackingDialog, VideoPreviewDialog, DeleteConfirmDialog, BulkDeleteDialog, TaskDetailDialog, task-status-helpers

#### 存储层修复

- **UNIQUE 冲突策略统一**: 从 ABORT+fallback/IGNORE 混用 → 统一 REPLACE 策略
- **deleteByStatus 原子性**: 使用子查询事务替代两步删除
- **错误消息统一**: `VideoTask not found for update: taskId="${taskId}"`
- **空 catch 块消除**: 所有静默错误改为 `errorLogger.warn` 记录

### 新增

- `src/modules/video/task-management/domain/` — 领域子域 (task-machine, task-events, task-schema, policies)
- `src/modules/video/task-management/infrastructure/` — 基础设施子域 (timestamp-bridge, polling-scheduler)
- `src/modules/video/task-management/presentation/` — 9 个子组件
- 5 个新测试文件 (task-machine, task-schema, policies, timestamp-bridge, polling-scheduler) — 117 个测试用例

### 修复

- `errorLogger.warn` 调用类型不匹配: 11 处非法属性 (taskId/field/operation/from/to) 合并到 message
- `_backup-v2/` 未排除 TypeScript 编译: tsconfig.json exclude 添加
- `VideoTaskRecord` 和 `VideoTaskHistory` 缺少 "retrying" 状态
- `videoTaskStatusSchema` 缺少 "retrying" 枚举值
- 7 个 `contract.json` 缺少 `entryPoints` 和 `invariants` 字段 (shot 模块)
- 5 个 `contract.json` 的 `entryPoints.services` 引用不存在的文件 (prompt 模块)

### 测试改进

- 重写 `video-providers.test.ts`: 从 mock-self → 真实 process.env 测试
- 重写 `db-connection.test.ts`: mock 依赖而非模块本身
- 重写 `performance.test.ts`: 从宽松阈值 → 正确性验证
- 修复 `integration-api.test.ts`: `if (!available) return` → `describe.skipIf`
- 修复 `smoke.test.ts`: `toBeDefined()` → 行为验证
- 修复 `compatibility.test.ts`: 移除同义反复测试
- 修复 `regression.test.ts`: Schema safeParse 验证
- 修复 8 个 `module-integration.test.ts`: `toBeDefined()` → 方法名验证 + 契约语义验证
- 修复 `asset module-integration`: mock 硬编码 → `mockImplementation` 动态返回
- 修复 `video-tasks.test.ts`: buildInsert mock 添加 conflict 参数
- 修复 `video-tasks-enhanced.test.ts`: REPLACE 策略 + deleteByStatus 断言顺序

### 测试统计

| 指标 | 变更前 | 变更后 |
|------|--------|--------|
| 测试文件 | 84 | 89 (+5) |
| 测试用例 | ~1500 | 1743 (+243) |
| 失败 | 多处 | 0 |

---

> **文档结束**
>
> 本文档由 AI Animation Studio 技术团队维护，最后更新于 2026-05-18。
