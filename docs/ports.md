# Domain Port Interfaces

## Overview

在 DDD（领域驱动设计）的依赖倒置原则下，Port 接口是模块层与基础设施层之间的解耦边界。模块定义 Port 接口（在 `src/domain/ports/`），基础设施层提供具体实现，通过 DI 容器注入。这确保了：

- **模块不依赖基础设施**：模块仅依赖 `@/domain/ports` 中的抽象接口，不直接导入 `@/infrastructure/*`
- **可测试性**：通过 `overrideToken()` 替换实现，模块可在隔离环境下测试
- **可替换性**：更换存储引擎、AI 提供商等只需修改 DI 注册，不影响业务逻辑

### 依赖方向

```
modules/ ──imports──→ domain/ports/ ←──implements── infrastructure/
                                │
                          DI Container
                        (wiring layer)
```

### Port 分类

| 分类 | 数量 | 说明 |
|------|------|------|
| Storage Port | 5 | 业务数据持久化（视频任务、角色、场景、故事、版本） |
| AI Provider Port | 4 | AI 能力抽象（视频、图像、文本生成，文件上传） |
| Sync Port | 1 | 同步引擎底层 SQL 访问 |
| Repository Port | 1 | Drizzle ORM 风格的媒体资产仓库 |
| Manager Port | 2 | 有状态业务引擎（元素管理、引用引擎） |

---

## Port Registry

### IVideoTaskStorage

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/storage-port.ts` |
| **设计意图** | 视频任务的全生命周期持久化——创建、查询、更新、批量操作、按状态/故事/Beat 过滤删除 |
| **DI Token** | `container.videoTaskStorage` |
| **实现类** | `videoTaskStorage`（来自 `@/infrastructure/storage/video-tasks`） |
| **DI 分类** | A. Domain Port 实现 |

**核心方法**：
- `getVideoTasks()` / `getVideoTaskById()` / `getVideoTasksByStory()` / `getVideoTasksByStatus()` / `getPendingVideoTasks()`
- `createVideoTask()` / `updateVideoTask()` / `deleteVideoTask()`
- `deleteVideoTasksByStatus()` / `deleteVideoTasksByBeatId()` / `deleteVideoTasksByStoryId()` / `deleteExpiredVideoTasks()`
- `bulkPutVideoTasks()` / `batchUpdateVideoTasks()` / `batchDeleteVideoTasks()`

**测试替换示例**：
```typescript
import { overrideToken } from "@/infrastructure/di";
import { tokens } from "@/infrastructure/di/container";

const mockStorage = {
  getVideoTasks: vi.fn().mockResolvedValue([]),
  createVideoTask: vi.fn().mockResolvedValue(undefined),
  // ... 其他方法
};
overrideToken(tokens.videoTaskStorage, () => mockStorage as any);
```

---

### ICharacterStorage

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/storage-port.ts` |
| **设计意图** | 角色数据持久化，含服装（Outfit）子实体的 CRUD 和使用计数递增 |
| **DI Token** | `container.characterStorage` |
| **实现类** | `characterStorage`（来自 `@/infrastructure/storage/characters`） |
| **DI 分类** | A. Domain Port 实现 |

**核心方法**：
- `getCharacters()` / `getCharacterById()` / `createCharacter()` / `updateCharacter()` / `deleteCharacter()`
- `incrementCharacterUseCount()`
- `getOutfitsForCharacter()` / `saveOutfitsForCharacter()` / `updateOutfitImage()`

---

### ISceneStorage

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/storage-port.ts` |
| **设计意图** | 场景数据持久化，提供基础 CRUD 操作 |
| **DI Token** | `container.sceneStorage` |
| **实现类** | `sceneStorage`（来自 `@/infrastructure/storage/scenes`） |
| **DI 分类** | A. Domain Port 实现 |

**核心方法**：
- `getScenes()` / `getSceneById()` / `createScene()` / `updateScene()` / `deleteScene()`

---

### IStoryStorage

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/storage-port.ts` |
| **设计意图** | 故事数据持久化，支持通过 Beat ID 反查所属故事 |
| **DI Token** | `container.storyStorage` |
| **实现类** | `storyStorage`（来自 `@/infrastructure/storage/stories`） |
| **DI 分类** | A. Domain Port 实现 |

**核心方法**：
- `getStories()` / `getStoryById()` / `getStoryByBeatId()` / `createStory()` / `updateStory()` / `deleteStory()`

---

### IVideoProvider

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/ai-provider-port.ts` |
| **设计意图** | 视频生成 AI 能力抽象，支持多种生成模式（纯视频、关键帧、帧对、帧对+视频）和状态轮询 |
| **DI Token** | `container.videoProvider` |
| **实现类** | 组合对象（来自 `@/infrastructure/ai-providers/video` 的 `generateVideo`、`queryVideoStatus`、`generateKeyframe`、`generateFramePair`、`generateVideoWithFrames`） |
| **DI 分类** | A. Domain Port 实现 |

**核心方法**：
- `generateVideo(prompt, options?)` — 纯文本到视频
- `queryVideoStatus(taskId, options?)` — 查询异步任务状态
- `generateKeyframe(params)` — 生成关键帧图像
- `generateFramePair(params)` — 生成首帧+末帧图像对
- `generateVideoWithFrames(params)` — 帧对驱动视频生成

---

### IImageProvider

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/ai-provider-port.ts` |
| **设计意图** | 图像生成与分析 AI 能力抽象，支持按用途（purpose）和提供商/模型选择 |
| **DI Token** | `container.imageProvider` |
| **实现类** | 组合对象（来自 `@/infrastructure/ai-providers/image` 的 `generateImage`、`analyzeImage`） |
| **DI 分类** | A. Domain Port 实现 |

**核心方法**：
- `generateImage(prompt, type?, options?)` — 文本到图像
- `analyzeImage(imageUrl, type?, prompt?, options?)` — 图像分析（角色/场景识别）

---

### ITextProvider

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/ai-provider-port.ts` |
| **设计意图** | 文本生成 AI 能力抽象，支持温度和最大 token 控制 |
| **DI Token** | `container.textProvider` |
| **实现类** | 组合对象（来自 `@/infrastructure/ai-providers/text` 的 `generateText`） |
| **DI 分类** | A. Domain Port 实现 |

**核心方法**：
- `generateText(prompt, options?)` — 文本生成

---

### IFileUploader

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/ai-provider-port.ts` |
| **设计意图** | 文件上传能力抽象，返回结构化成功/失败结果（非异常模式） |
| **DI Token** | `container.fileUploader` |
| **实现类** | 组合对象（来自 `@/infrastructure/ai-providers/utils` 的 `uploadFile`） |
| **DI 分类** | A. Domain Port 实现 |

**核心方法**：
- `uploadFile(file)` — 上传文件，返回 `{ success: true, data: { url } }` 或 `{ success: false, error }`

---

### ISyncStorage

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/sync-port.ts` |
| **设计意图** | 同步引擎底层 SQL 访问抽象，提供安全查询、执行、事务和变更追踪注册 |
| **DI Token** | `container.syncStorage` |
| **实现类** | 组合对象（来自 `@/infrastructure/storage/sqlite-core` 的 `safeQuery`/`safeRun`/`safeTransaction` + `@/infrastructure/storage/core` 的 `registerChangeTracker`） |
| **DI 分类** | A. Domain Port 实现 |

**核心方法**：
- `safeQuery<T>(sql, params?)` — 参数化查询
- `safeRun(sql, params?)` — 参数化执行
- `safeTransaction(statements)` — 事务批量执行
- `registerChangeTracker(tracker)` — 注册变更追踪回调

---

### IVersionStorage

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/version-storage-port.ts` |
| **设计意图** | 故事版本快照持久化，支持版本保留策略（按数量清理旧版本） |
| **DI Token** | `container.versionStorage` |
| **实现类** | `versionStorage`（来自 `@/infrastructure/storage/versions`） |
| **DI 分类** | C. Storage 实例 |

**核心方法**：
- `getStoryVersions<T>(storyId)` — 获取故事的所有版本
- `createStoryVersion(version)` — 创建版本快照
- `deleteStoryVersion(versionId)` — 删除单个版本
- `deleteOldStoryVersions(storyId, keepCount)` — 保留最近 N 个版本，删除其余

---

### IElementStorage

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/element-storage-port.ts` |
| **设计意图** | 故事元素持久化，含观察者模式（subscribe/notify）用于 UI 响应式更新 |
| **DI Token** | `container.elementStorage` |
| **实现类** | `elementStorage`（来自 `@/infrastructure/storage/elements`） |
| **DI 分类** | C. Storage 实例 |

**核心方法**：
- `subscribe(listener)` / `notify()` — 观察者模式
- `getLibrary()` / `getElement()` / `getAllElements()` / `getElementsByType()`
- `createElement()` / `updateElement()` / `deleteElement()`

---

### ITemplateStorage

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/template-storage-port.ts` |
| **设计意图** | 视频模板和 AST 模板持久化，支持分类过滤、搜索排序和使用计数 |
| **DI Token** | `container.templateStorage` |
| **实现类** | `templateStorage`（来自 `@/infrastructure/storage/templates`） |
| **DI 分类** | C. Storage 实例 |

**核心方法**：
- `getVideoTemplates<T>()` / `createVideoTemplate()`
- `saveASTTemplate(meta)` / `getASTTemplate(id)` / `getASTTemplates(filters?)` / `deleteASTTemplate(id)` / `incrementASTTemplateUsage(id)`

---

### IMediaAssetRepository

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/media-asset-repository-port.ts` |
| **设计意图** | 媒体资产仓库，采用 Result 类型返回值（非异常模式），与 Drizzle ORM 风格对齐 |
| **DI Token** | `container.mediaAssetRepository` |
| **实现类** | `mediaAssetRepository`（来自 `@/infrastructure/database`） |
| **DI 分类** | D. Repository 实例 |

**核心方法**：
- `findAll()` → `Result<MediaAsset[]>`
- `findById(id)` → `Result<MediaAsset | null>`
- `create(input)` → `Result<MediaAsset>`
- `update(input)` → `Result<MediaAsset>`
- `delete(id)` → `Result<void>`

**测试替换示例**：
```typescript
import { overrideToken } from "@/infrastructure/di";
import { ok } from "@/domain/types/result";

const mockRepo = {
  findAll: vi.fn().mockResolvedValue(ok([])),
  findById: vi.fn().mockResolvedValue(ok(null)),
  create: vi.fn().mockResolvedValue(ok(mockAsset)),
  update: vi.fn().mockResolvedValue(ok(mockAsset)),
  delete: vi.fn().mockResolvedValue(ok(undefined)),
};
overrideToken(tokens.mediaAssetRepository, () => mockRepo as any);
```

---

### IElementManager

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/element-manager-port.ts` |
| **设计意图** | 元素生命周期管理引擎，在 IElementStorage 基础上增加资产绑定/解绑能力，含观察者通知 |
| **DI Token** | `container.elementManager` |
| **实现类** | `elementManager`（来自 `@/modules/shot`，懒加载避免循环依赖） |
| **DI 分类** | E. 懒加载模块 |

**核心方法**：
- `subscribe(listener)` / `getLibrary()` / `getElement()` / `getAllElements()` / `getElementsByType()`
- `createElement()` / `updateElement()` / `deleteElement()`
- `bindAsset(elementId, asset)` / `unbindAsset(elementId, assetUrl)` — 资产绑定/解绑

---

### IReferenceEngine

| 属性 | 值 |
|------|-----|
| **接口文件** | `src/domain/ports/reference-engine-port.ts` |
| **设计意图** | 镜头间引用关系引擎，负责引用验证、目标镜头解析、视频 URL 获取和引用描述生成 |
| **DI Token** | `container.referenceEngine` |
| **实现类** | `referenceEngine`（来自 `@/modules/shot`，懒加载避免循环依赖） |
| **DI 分类** | E. 懒加载模块 |

**核心方法**：
- `validateReference(shot, allShots, reference)` → `ReferenceValidationResult`
- `getTargetShot(shot, allShots, reference)` → `StoryBeat | undefined`
- `getReferenceVideoUrl(shot, allShots, reference)` → `string | undefined`
- `buildReferenceDescription(shot, allShots, reference)` → `string`

---

## DI Token 速查表

| Token 名称 | Port 接口 | DI 分类 | 实现来源 |
|-------------|-----------|---------|----------|
| `videoTaskStorage` | `IVideoTaskStorage` | A | `@/infrastructure/storage/video-tasks` |
| `characterStorage` | `ICharacterStorage` | A | `@/infrastructure/storage/characters` |
| `sceneStorage` | `ISceneStorage` | A | `@/infrastructure/storage/scenes` |
| `storyStorage` | `IStoryStorage` | A | `@/infrastructure/storage/stories` |
| `videoProvider` | `IVideoProvider` | A | `@/infrastructure/ai-providers/video` |
| `imageProvider` | `IImageProvider` | A | `@/infrastructure/ai-providers/image` |
| `textProvider` | `ITextProvider` | A | `@/infrastructure/ai-providers/text` |
| `fileUploader` | `IFileUploader` | A | `@/infrastructure/ai-providers/utils` |
| `syncStorage` | `ISyncStorage` | A | `@/infrastructure/storage/sqlite-core` + `core` |
| `versionStorage` | `IVersionStorage` | C | `@/infrastructure/storage/versions` |
| `elementStorage` | `IElementStorage` | C | `@/infrastructure/storage/elements` |
| `templateStorage` | `ITemplateStorage` | C | `@/infrastructure/storage/templates` |
| `mediaAssetRepository` | `IMediaAssetRepository` | D | `@/infrastructure/database` |
| `elementManager` | `IElementManager` | E | `@/modules/shot`（懒加载） |
| `referenceEngine` | `IReferenceEngine` | E | `@/modules/shot`（懒加载） |

## 测试替换通用模式

```typescript
import { overrideToken, resetContainer } from "@/infrastructure/di";
import { tokens } from "@/infrastructure/di/container";

// 在 beforeEach 中替换
beforeEach(() => {
  overrideToken(tokens.videoTaskStorage, () => mockVideoTaskStorage);
});

// 在 afterEach 中重置
afterEach(() => {
  resetContainer();
});
```
