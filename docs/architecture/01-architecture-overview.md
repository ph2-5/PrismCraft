# AI Animation Studio — 架构概览

> 版本: 0.6.0-beta.1 | 更新日期: 2026-05-18

## 1. 项目定位

AI Animation Studio 是一个**本地优先**的 AI 驱动动画制作工具，支持从故事创作到视频生成的完整工作流。项目同时构建 Web 端 (Next.js) 和桌面端 (Electron)，面向国内主流 AI 视频生成平台。

核心特性：
- **本地优先**：所有数据存储在本地 SQLite，无需联网即可使用
- **双平台**：Web 端 (sql.js WASM) + 桌面端 (better-sqlite3 原生)
- **AI 驱动**：集成 6+ 国内 AI 视频生成平台
- **完整工作流**：故事创作 → 分镜设计 → 关键帧生成 → 视频生成

## 2. 技术栈

| 层次 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Next.js (App Router) + React | 16.2.2 / 19 |
| 语言 | TypeScript | 5.x |
| 状态管理 | Zustand | 5.x |
| 数据验证 | Zod | 4.x |
| UI 组件 | shadcn/ui + Tailwind CSS | 4.x |
| 图标 | Lucide React | — |
| 数据库 | better-sqlite3 (桌面端) / sql.js (Web端) | — |
| 桌面端 | Electron | — |
| 测试 | Vitest | — |

## 3. 分层架构

项目采用 **领域驱动设计 (DDD) + 端口-适配器** 架构：

```
┌──────────────────────────────────────────────────┐
│  src/app/          Next.js 页面与 API 路由        │
│   api/             Web API 路由 (19 个端点)        │
├──────────────────────────────────────────────────┤
│  src/modules/      业务模块层 (8 大模块)           │
│   ┌─────────────────────────────────────────┐    │
│   │  每个 module:                            │    │
│   │   subdomain/contract.json  子域契约      │    │
│   │   hooks/                  React Hooks   │    │
│   │   services/               业务服务       │    │
│   │   presentation/           UI 组件        │    │
│   │   domain/                 领域模型       │    │
│   │   infrastructure/         基础设施       │    │
│   └─────────────────────────────────────────┘    │
├──────────────────────────────────────────────────┤
│  src/domain/       领域核心层                      │
│   schemas/         Zod 验证 Schema (6 个)         │
│   types/           类型定义 (Result, AppError...)  │
│   ports/           端口接口 (6 个文件, 11 个接口)   │
│   services/        领域服务 (4 个)                 │
│   utils/           领域工具 (3 个)                 │
├──────────────────────────────────────────────────┤
│  src/infrastructure/  基础设施层                   │
│   ai-providers/    AI 服务提供商集成               │
│   storage/         SQLite 存储层 (16+ 文件)       │
│   network/         网络层 (熔断/重试/监控)         │
│   di/              依赖注入容器 (49 tokens)        │
│   server/          服务端逻辑                      │
│   monitoring/      性能监控                        │
├──────────────────────────────────────────────────┤
│  src/shared/       共享层                          │
│   hooks/           通用 Hooks (5 个)              │
│   presentation/    通用 UI 组件 (8+ 个)           │
│   ui/              基础 UI 组件库 (shadcn)         │
│   utils/           工具函数 (6 个)                │
│   app-store        全局状态                        │
│   event-bus        事件总线                        │
│   error-logger     错误日志                        │
├──────────────────────────────────────────────────┤
│  electron/src/     Electron 桌面端层               │
│   security/        安全模块 (SSRF防护/密钥存储)     │
│   api-server/      内置 HTTP API Server (35 个)    │
│   ipc/             IPC 通道 (30+ 个)               │
└──────────────────────────────────────────────────┘
```

## 4. 模块地图

### 4.1 业务模块 (src/modules/)

| 模块 | 职责 | 子域数量 |
|------|------|----------|
| **asset** | 资产管理 (导入/导出/媒体库/ASA导出) | 5 |
| **character** | 角色管理 (CRUD/服装/图片) | 2 |
| **prompt** | 提示词系统 (构建/角色/场景/视频/服务器) | 7 |
| **scene** | 场景管理 (CRUD/图片) | 2 |
| **shot** | 镜头系统 (一致性/特征/参考/生成/验证) | 7 |
| **story** | 故事系统 (分镜/生成/规划/模板/编辑器) | 5 |
| **sync** | 同步系统 (引擎/冲突/向量时钟) | 2 |
| **video** | 视频系统 (缓存/恢复/任务管理/智能重试) | 5 |

### 4.2 领域核心 (src/domain/)

| 子目录 | 职责 |
|--------|------|
| `schemas/` | 6 个 Zod Schema 文件: character, scene, story, shot-system, api, media |
| `types/` | 5 个类型文件: result (Result monad + 12 种错误), infrastructure, sync, cloud-provider, video-model |
| `ports/` | 6 个端口文件, 11 个接口: storage-port (IVideoTaskStorage, ICharacterStorage, ISceneStorage, IStoryStorage), ai-provider-port (IVideoProvider, IImageProvider, ITextProvider, IFileUploader), sync-port (ISyncStorage), element-manager-port (IElementManager), reference-engine-port (IReferenceEngine) |
| `services/` | 4 个领域服务: story-generation-service, beat-workflow-service, reference-resolver, reference-check |
| `utils/` | 3 个领域工具: shot-prompt, beat-prompt-builder, prompt-vocabulary |

### 4.3 基础设施 (src/infrastructure/)

| 子目录 | 职责 |
|--------|------|
| `ai-providers/` | 核心 API 客户端 + 6 个提供商适配器 (火山引擎/快手/智谱/Seedance/Pixverse/通用) |
| `storage/` | 16+ 个 SQLite 存储文件 + 4 个子模块拆分 (characters/, elements/, stories/, video-tasks/) |
| `network/` | 熔断器/下载管理/网络监控/请求生命周期/弹性 Fetch/重试执行器 + 5 个拦截器 |
| `di/` | 依赖注入容器 (container, registry, types) — 49 个注册 Token |
| `server/` | 8 个服务端服务 (一致性检查/密钥库/模型检测/提示词构建/提供商解析等) |
| `monitoring/` | 内存泄漏检测/性能监控 |

### 4.4 Electron 安全模块 (electron/src/security/)

```
electron/src/security/          安全模块
├── ssrf-guard/                 SSRF 防护 (6 步验证)
│   ├── ssrf-guard.ts           核心实现 (validate/validateSync/isPrivateIp)
│   └── __tests__/              测试 (40+ 用例)
├── key-storage/                密钥存储 (策略模式)
│   ├── key-storage.ts          KeyStorageManager (CRUD + 策略选择)
│   ├── types.ts                StorageResult/KeyStorageStrategy/EncryptedDataPacket
│   ├── strategies/
│   │   ├── safe-storage.strategy.ts      Electron safeStorage (priority=1)
│   │   └── plaintext-fallback.strategy.ts AES-256-GCM 回退 (priority=99)
│   └── __tests__/              测试 (25+ 用例)
└── index.ts                    统一导出
```

#### SSRF 防护
- 6 步验证：URL 解析 → 协议限制 → 云元数据拦截 → 白名单 → 私有地址检测 → DNS 解析验证
- 全局单例：`ssrfGuard`
- 零外部依赖

#### 密钥存储
- 策略模式：SafeStorage 策略 (OS 级安全, priority=1) → PlaintextFallback 策略 (AES-256-GCM, priority=99)
- 全局单例：`keyStorage`
- 自动降级：优先使用 Electron safeStorage，不可用时回退至 AES-256-GCM 加密

## 5. 核心设计模式

### 5.1 子域契约 (contract.json)

每个子域都有 `contract.json` 定义其公共 API 契约：

```json
{
  "name": "task-management",
  "version": "2.0.0",
  "entryPoints": {
    "hooks": ["hooks/use-video-task-manager.ts"],
    "services": ["services/video-tracker.ts"],
    "presentation": ["presentation/VideoTaskManager.tsx"]
  },
  "exports": ["VideoTask", "useVideoTaskManager", ...],
  "invariants": ["任务状态转换必须通过 TaskMachine"]
}
```

### 5.2 Result Monad

全项目统一使用 `Result<T, E>` 替代异常：

```typescript
type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

function doSomething(): Result<Data> {
  if (success) return ok(data);
  return err(new ApiError("FAILED", "Something went wrong"));
}
```

### 5.3 端口-适配器 + DI 注入

领域层通过 `ports/` 定义接口，基础设施层提供实现，DI 容器管理依赖：

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

### 5.4 Zod Schema-First

所有领域类型使用 Zod Schema 定义，Schema 即类型：

```typescript
// domain/schemas/character.ts
export const characterSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),  // ISO 8601
  // ...
});

// 类型从 Schema 推导
type Character = z.infer<typeof characterSchema>;
```

### 5.5 时间类型统一

全项目统一使用 **ISO 8601 字符串** 表示时间：

```typescript
// ✅ 正确
createdAt: new Date().toISOString()  // "2026-05-18T10:30:00.000Z"

// ❌ 错误
createdAt: Date.now()                // 1747564200000
createdAt: Math.floor(Date.now()/1000) // 1747564200
```

存储层负责 ISO string ↔ Unix timestamp 的转换。

## 6. 双平台构建

| 平台 | 命令 | 数据库引擎 |
|------|------|-----------|
| Web | `npm run build` | sql.js (WASM) |
| Electron | `npm run build:electron` | better-sqlite3 (原生) |

桌面端强制使用 better-sqlite3，不再降级到 sql.js。better-sqlite3 使用 WAL 模式，数据安全性由 SQLite 自身保证。

## 7. 数据流

```
用户操作 → React Component (presentation/)
         → Hook (hooks/)
         → Service (services/) 或 Store (zustand)
         → Port Interface (domain/ports/)
         → Storage Implementation (infrastructure/storage/)
         → SQLite (better-sqlite3 / sql.js)
```

AI 生成流程：

```
用户点击生成 → Hook
            → AI Provider Port (domain/ports/ai-provider-port.ts)
            → Provider Strategy (infrastructure/ai-providers/provider-strategy.ts)
            → 具体 Provider (infrastructure/ai-providers/providers/)
            → API 调用 (火山引擎/快手/智谱/...)
            → 结果通过 Result<T> 返回
```

## 8. API 路由层

项目在 Web 端和 Electron 端采用不同的 API 路由机制，同时 Electron 端通过 IPC 通道实现主进程/渲染进程通信。

### 8.1 Web 端 API 路由 (19 个)

位于 `src/app/api/`，覆盖以下功能：

| 类别 | 路由 | 说明 |
|------|------|------|
| 文本生成 | `/api/text/generate` | AI 文本生成 |
| 图片生成 | `/api/image/generate` | AI 图片生成 |
| 视频生成 | `/api/video/generate` | AI 视频生成 |
| 配置管理 | `/api/config/*` | 应用配置读写 |
| 同步 | `/api/sync/*` | 数据同步操作 |
| 校验 | `/api/validate/*` | 输入校验与验证 |

### 8.2 Electron API Server (35 个)

Electron 模式下使用内置 HTTP API Server 替代 Next.js 路由，提供与 Web 端对等的 API 能力，同时增加桌面端专属接口（如文件系统访问、原生对话框等）。

### 8.3 IPC 通道 (30+ 个)

Electron 主进程/渲染进程通信通道，分为 5 类：

| 类别 | 说明 | 示例通道 |
|------|------|----------|
| 数据库操作 | SQLite CRUD 操作 | `db:query`, `db:execute` |
| 资产管理 | 文件导入/导出/媒体处理 | `asset:import`, `asset:export` |
| 配置管理 | 应用设置读写 | `config:get`, `config:set` |
| 系统事件 | 窗口/菜单/生命周期 | `window:close`, `app:ready` |
| 菜单事件 | 应用菜单交互 | `menu:new`, `menu:save` |

## 9. 数据安全架构

### 9.1 桌面端数据安全

| 机制 | 说明 |
|------|------|
| WAL 模式 | better-sqlite3 使用 WAL 日志模式，崩溃不丢数据 |
| 自动备份 | 每 24 小时自动备份，保留 7 个备份，30 天过期 |
| ENOSPC 检测 | 磁盘满时禁用写入，发送 IPC 警告 |
| 损坏恢复 | 数据库损坏时自动重命名并重建 |

### 9.2 URL 安全验证

```typescript
// shared/utils/url-validation.ts
validateExternalUrl(url)   // 验证 URL 协议安全性
isAllowedImageUrl(url)     // 支持 data:/blob:/file:/http:/https:
isAllowedVideoUrl(url)     // 本地优先项目支持所有本地协议
```

## 10. 性能优化

| 优化 | 说明 |
|------|------|
| `isElectron()` 缓存 | 首次计算后缓存结果，避免每次 DB 操作重复检测 |
| Sync 引擎条件化 | 仅在 `syncConfig.enabled` 时注册 changeTracker，消除写放大 |
| 文件拆分 | 8 个超大文件拆分，最大文件从 1031 行降至 624 行 |
| SafeImage 组件 | 统一 Next/Image 封装，处理 data:/blob: 协议 |
