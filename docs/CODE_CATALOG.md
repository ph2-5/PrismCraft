# PrismCraft - 完整代码目录

> 版本: 1.0.1 | 更新日期: 2026-07-07 | 架构: Electron + Vite + React + DDD

---

## 目录

1. [项目概述](#1-项目概述)
2. [目录结构总览](#2-目录结构总览)
3. [领域层 (src/domain)](#3-领域层)
4. [共享逻辑层 (src/shared-logic)](#4-共享逻辑层)
5. [模块层 (src/modules)](#5-模块层)
6. [共享层 (src/shared)](#6-共享层)
7. [基础设施层 (src/infrastructure)](#7-基础设施层)
8. [应用层 (src/app)](#8-应用层)
9. [Electron 主进程 (electron/src)](#9-electron-主进程)
10. [测试代码 (tests)](#10-测试代码)
11. [配置文件](#11-配置文件)
12. [构建与校验脚本 (scripts/)](#12-构建与校验脚本)
13. [AI 工具集成文件 (.ai/)](#13-ai-工具集成文件)

---

## 1. 项目概述

PrismCraft 是一款 AI 驱动的动画制作工具，采用本地优先架构，支持从故事创作到视频生成的完整工作流。项目基于 Electron + Vite + React 技术栈，采用 DDD（领域驱动设计）分层架构，将代码组织为 domain → shared-logic → modules → shared → infrastructure → app 六层。

**核心技术栈**：
- 前端：React 19 + TypeScript 6 + Zustand 5 + React Query 5 + Tailwind CSS 4
- 桌面端：Electron 41 + better-sqlite3
- 构建：Vite + electron-builder
- 测试：Vitest + Playwright + Testing Library

---

## 2. 目录结构总览

```
prismcraft-source-code/
├── src/
│   ├── domain/              # 领域层：纯类型、端口接口、领域服务
│   ├── shared-logic/        # 共享逻辑层：零外部依赖的纯函数
│   ├── modules/             # 模块层：9 个业务模块
│   │   ├── asset/           # 资产库管理
│   │   ├── character/       # 角色管理
│   │   ├── persistence/     # 持久化守护
│   │   ├── prompt/          # 提示词生成
│   │   ├── scene/           # 场景管理
│   │   ├── shot/            # 分镜系统
│   │   ├── story/           # 故事创作
│   │   ├── sync/            # 数据同步
│   │   └── video/           # 视频任务管理
│   ├── shared/              # 共享层：跨模块通用工具与代理导出 (含 file-http/ 统一文件操作通信层)
│   ├── infrastructure/      # 基础设施层：存储、AI 提供商、网络、DI 容器
│   └── app/                 # 应用层：页面组件与路由
├── electron/src/            # Electron 主进程
├── tests/                   # E2E 测试
├── docs/                    # 文档
├── scripts/                 # 构建与校验脚本
└── .ai/                     # AI 工具集成文件
```

---

## 3. 领域层

> 领域层是纯业务逻辑层，零外部依赖。包含端口接口、Zod Schema、领域服务、类型定义和工具函数。

### 3.1 端口接口 (`src/domain/ports/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `storage-port.ts` | 存储端口接口 | `IVideoTaskStorage`, `ICharacterStorage`, `ISceneStorage`, `IStoryStorage` |
| `ai-provider-port.ts` | AI 提供商端口接口 | `IVideoProvider`, `IImageProvider`, `ITextProvider`, `IFileUploader` |
| `sync-port.ts` | 同步端口接口 | `ISyncStorage`, `DbRunResult` |
| `element-manager-port.ts` | 元素管理器端口 | `IElementManager` |
| `reference-engine-port.ts` | 引用引擎端口 | `IReferenceEngine` |
| `version-storage-port.ts` | 版本存储端口 | `IVersionStorage` |
| `element-storage-port.ts` | 元素存储端口 | `IElementStorage` |
| `template-storage-port.ts` | 模板存储端口 | `ITemplateStorage` |
| `media-asset-repository-port.ts` | 媒体资产仓库端口 | `IMediaAssetRepository` |
| `index.ts` | 桶导出 | 重新导出以上所有端口类型 |

### 3.2 Schema 定义 (`src/domain/schemas/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `character.ts` | 角色 Schema | `characterSchema`, `Character`, `characterOutfitSchema`, `CharacterOutfit`, `characterAppearanceSchema`, `CharacterAppearance`, `createCharacterInputSchema`, `CreateCharacterInput`, `updateCharacterInputSchema`, `UpdateCharacterInput` |
| `scene.ts` | 场景 Schema | `sceneSchema`, `Scene`, `sceneCameraSchema`, `SceneCamera`, `sceneElementSchema`, `SceneElement`, `createSceneInputSchema`, `CreateSceneInput`, `updateSceneInputSchema`, `UpdateSceneInput` |
| `story.ts` | 故事 Schema | `storySchema`, `Story`, `storyBeatSchema`, `StoryBeat`, `storyBeatKeyframeSchema`, `StoryBeatKeyframe`, `storyBeatFramePairSchema`, `StoryBeatFramePair`, `storyBeatVideoSchema`, `StoryBeatVideoGeneration`, `elementBindingSchema`, `ElementBinding`, `beatCameraSchema`, `BeatCamera`, `chainModeSchema`, `ChainMode`, `promptLabSchema`, `PromptLab`, `storyVersionSchema`, `StoryVersion`, `storyStyleGuideSchema`, `StoryStyleGuide`, `VALID_SHOT_TYPES` |
| `shot-system.ts` | 分镜系统 Schema | `shotInstructionSchema`, `ShotInstruction`, `featureAnchoringSchema`, `consistencyCheckResultSchema`, `ConsistencyCheckResult`, `shotReferenceSchema`, `ShotReference`, `templateConfigSchema`, `TemplateConfig`, `elementTypeSchema`, `ElementType`, `assetTypeSchema`, `AssetType`, `elementFeatureAnchorSchema`, `ElementFeatureAnchor`, `storyElementSchema`, `StoryElement`, `elementLibrarySchema`, `ElementLibrary` |
| `api.ts` | API Schema | `apiConfigSchema`, `ApiConfig`, `videoTaskSchema`, `VideoTask`, `videoTaskStatusSchema`, `VideoTaskStatus`, `imageGenerationResultSchema`, `ImageGenerationResult`, `videoGenerationResultSchema`, `VideoGenerationResult`, `userApiConfigSchema`, `UserApiConfig` |
| `media.ts` | 媒体 Schema | `mediaAssetSchema`, `MediaAsset`, `videoTemplateSchema`, `VideoTemplate`, `collectionSchema`, `Collection`, `batchTaskSchema`, `BatchTask`, `storyboardAssetSchema`, `StoryboardAsset`, `asaExportDataSchema`, `AsaExportData`, `searchResultSchema`, `SearchResult`, `enhancedVideoGenerationParamsSchema`, `EnhancedVideoGenerationParams` |
| `index.ts` | 桶导出 | 重新导出以上所有 Schema 和类型 |

### 3.3 领域服务 (`src/domain/services/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `story-generation-service.ts` | 故事生成服务 | `StoryGenerationService`, `BeatGenerationContext`, `ResolvedGenerationParams` |
| `beat-workflow-service.ts` | 分镜工作流服务 | `BeatWorkflowService`, `GenerationStep`, `BeatWorkflowResult` |
| `reference-resolver.ts` | 引用解析服务 | `resolveCharacterRef`, `resolveCharacterRefs`, `resolveSceneRef` |
| `reference-check.ts` | 引用检查服务 | `checkCharacterReferences`, `checkSceneReferences`, `checkElementReferences`, `ReferenceInfo`, `DeleteCheckResult` |
| `index.ts` | 桶导出 | 重新导出以上所有服务 |

### 3.4 类型定义 (`src/domain/types/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `result.ts` | Result 模式与错误类型 | `Result`, `AppError`, `DatabaseError`, `ValidationError`, `ApiError`, `NotFoundError`, `NetworkError`, `StorageError`, `ConfigurationError`, `GenerationError`, `TimeoutError`, `RateLimitError`, `AuthenticationError`, `ok`, `err`, `fromThrowable`, `fromAsyncThrowable` |
| `sync.ts` | 同步类型 | `SyncStatus`, `SyncEntityType`, `ChangeOperation`, `VectorClock`, `SyncChangeLogEntry`, `SyncPushResult`, `SyncPullResult`, `RemoteChange`, `SyncConflict`, `SyncStatusInfo`, `ConflictStrategy`, `SyncConfig`, `SYNC_TABLES`, `DEFAULT_SYNC_CONFIG`, `createVectorClock`, `incrementVectorClock`, `mergeVectorClocks`, `compareVectorClocks`, `isVectorClockConflict` |
| `electron-api.ts` | Electron API 类型 | `VideoTaskRecord`, `VideoTaskHistory`, `CustomApiConfig` |
| `cloud-provider.ts` | 云提供商类型 | `CloudProviderInfo` |
| `video-model.ts` | 视频模型类型 | `VideoModelFormat` |
| `error-codes.ts` | 错误码类型 | `ErrorDomain`, `ErrorCodeEntry`, `ErrorCategory`, `isRetryable`, `classifyError` |
| `index.ts` | 桶导出 | 重新导出以上所有类型 |

### 3.5 工具函数 (`src/domain/utils/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `shot-prompt.ts` | 分镜提示词工具 | `shotInstructionToPrompt`, `resolveShotInstruction`, `SHOT_SIZE_OPTIONS`, `CAMERA_MOVEMENT_OPTIONS`, `CAMERA_ANGLE_OPTIONS`, `ResolvedShotInstruction` |
| `beat-prompt-builder.ts` | 分镜提示词构建 | `generateBeatImagePrompt`, `generateSimpleBeatImagePrompt`, `getBeatCharacterIds`, `BeatImagePromptParams` |
| `frame-pair-accessors.ts` | 帧对访问器 | `getFirstFrameUrl`, `getLastFrameUrl` |
| `prompt-vocabulary.ts` | 提示词词汇表 | `QUALITY_TAGS_IMAGE`, `QUALITY_TAGS_VIDEO`, `STYLE_KEYWORDS`, `SCENE_TYPE_KEYWORDS`, `MOOD_KEYWORDS`, `LIGHTING_KEYWORDS`, `CAMERA_ANGLE_KEYWORDS`, `CAMERA_MOVEMENT_KEYWORDS`, `joinParts`, `buildCharacterAppearanceDesc`, `buildCharacterFullDesc`, `buildSceneAtmosphereDesc`, `buildSceneVisualDesc` |
| `index.ts` | 桶导出 | 重新导出以上所有工具 |

---

## 4. 共享逻辑层

> 共享逻辑层是零外部依赖的纯函数层，可被渲染进程和主进程共同使用。仅允许目录内相对导入。

### 4.1 目录结构

| 子目录 | 文件 | 说明 | 关键导出 |
|--------|------|------|---------|
| `shot/` | `reference-engine.ts` | 引用引擎 | `ReferenceDirection`, `ReferenceContentType`, `validateReference`, `getTargetShot`, `getReferenceVideoUrl`, `buildReferenceDescription` |
| | `consistency-check.ts` | 一致性检查 | `performConfigCheck`, `performConsistencyCheck`, `validateFeatureAnchoringConfig`, `validateNoFrameBinding` |
| | `reference-check.ts` | 引用检查 | `checkCharacterReferences`, `checkSceneReferences`, `checkMultipleCharacterReferences`, `checkMultipleSceneReferences` |
| | `visual-consistency-check.ts` | 视觉一致性检查 | `buildConsistencyPrompt`, `parseConsistencyAnalysis`, `checkVisualConsistency`, `checkBeatElementConsistency` |
| | `index.ts` | 桶导出 | 重新导出以上所有 |
| `prompt/` | `prompt-engine.ts` | 提示词引擎 | `QUALITY_TAGS_IMAGE`, `QUALITY_TAGS_VIDEO`, `joinParts`, `buildCharacterFullDesc`, `buildSceneAtmosphereDesc`, `STYLE_KEYWORDS`, `SCENE_TYPE_MAP`, `MOOD_MAP`, `LIGHTING_MAP`, `SHOT_TYPE_MAP`, `CAMERA_MOVEMENT_MAP` |
| | `prompt-service.ts` | 提示词服务 | `generateCharacterImagePrompt`, `generateSceneImagePrompt`, `generateVideoPrompt`, `generateSingleBeatPrompt`, `generateQuickModeVideoPrompt`, `generateKeyframePrompt`, `generateFirstFramePrompt`, `generateLastFramePrompt`, `generateStoryPlanPrompt`, `generateCharacterAnalysisPrompt`, `generateSceneAnalysisPrompt` |
| | `index.ts` | 桶导出 | 重新导出以上所有 |
| `video/` | `video-task-params.ts` | 视频任务参数 | `buildVideoGenerationParams`, `buildQuickVideoParams`, `buildKeyframeGenerationParams`, `buildFramePairGenerationParams` |
| | `video-tracker.ts` | 视频追踪 | `PROVIDERS`, `DEFAULT_PROVIDER`, `getProviderInfo`, `buildTrackingInfo`, `TrackingInfo` |
| | `video-recovery.ts` | 视频恢复 | `EXPIRY_HOURS`, `MAX_POLL_DURATION_MS`, `POLL_INTERVAL_MS`, `MAX_RECOVERY_ATTEMPTS`, `recoverVideoByTaskId` |
| | `index.ts` | 桶导出 | 重新导出以上所有 |
| `story/` | `story-service.ts` | 故事服务 | `fixShotParams`, `fixStoryBeat`, `validateStoryPlan`, `parseStoryPlanJSON`, `convertToStoryBeats`, `generateStoryPlanWithValidation` |
| | `storyboard-generation.ts` | 分镜生成 | `generateBeatKeyframe`, `generateBeatFramePair`, `generateBeatVideo`, `generateBeatFullWorkflow`, `generateKeyframeChain` |
| | `index.ts` | 桶导出 | 重新导出以上所有 |
| 根目录 | `index.ts` | 顶层桶导出 | `shot`, `prompt`, `video`, `story` 四个命名空间 |

---

## 5. 模块层

### 5.1 asset 模块

> 资产库管理模块，负责媒体资产的 CRUD、角色/场景/分镜资源管理、项目数据导入导出、收藏集管理。

**路径**: `src/modules/asset/`

| 子域 | 文件 | 说明 |
|------|------|------|
| `asset-library/` | `index.ts` | 资产库服务入口 |
| | `asa-export-service.ts` | ASA 格式导出服务 |
| `media-assets/` | (服务文件) | 媒体资产 CRUD |
| `import-export/` | `index.ts` | 项目导入导出 |
| `hooks/` | (hooks 文件) | React Query Hooks 封装 |
| `presentation/` | `BatchOperations.tsx` | 批量操作组件 |
| | `MediaExporter.tsx` | 媒体导出组件 |
| | `ProjectExportImport.tsx` | 项目导入导出组件 |
| | `VariantGenerator.tsx` | 变体生成器组件 |
| | `BatchProgressDialog.tsx` | 批量进度对话框 |
| | `index.ts` | 桶导出 |

**公共 API 导出** (`index.ts`):
- 服务：`mediaAssetService`, `characterService`, `sceneService`, `storyboardAssetService`, `collectionService`, `assetExportService`
- 类型：`MergeStrategy`, `ProjectData`, `ExportResult`
- Hooks：`useMediaAssets`, `useCreateMediaAsset`, `useDeleteMediaAsset`, `useExportData`, `useDownloadExport`, `useImportData`, `useImportFromFile`, `useProjectExport`
- 组件：`BatchOperations`, `MediaExporter`, `ProjectExportImport`

---

### 5.2 character 模块

> 角色管理模块，负责角色 CRUD、服装管理、角色图片生成。使用 Result 模式处理错误，通过领域事件解耦。

**路径**: `src/modules/character/`

| 子域 | 文件 | 说明 |
|------|------|------|
| `services/` | `index.ts` | 角色 CRUD 服务 |
| `hooks/` | `use-characters.ts` | 角色 CRUD Hooks |
| | `use-character-crud.ts` | 角色 CRUD 组合 Hook |
| | `use-outfit-management.ts` | 服装管理 Hook |
| | `index.ts` | 桶导出 |
| `constants.ts` | | 默认角色、性格建议等常量 |
| `presentation/` | `CharacterListItem.tsx` | 角色列表项组件 |
| | `OutfitDialog.tsx` | 服装编辑对话框 |

**公共 API 导出** (`index.ts`):
- 服务：`characterService`
- 常量：`defaultCharacter`, `personalitySuggestions`, `styleSuggestions`, `genderSuggestions`, `heightSuggestions`, `buildSuggestions`
- Hooks：`useCharacterImage`, `useOutfitManagement`, `useCharacters`, `useCharacter`, `useCharacterCount`, `useCreateCharacter`, `useUpdateCharacter`, `useDeleteCharacter`, `useCharacterCRUD`
- 组件：`CharacterListItem`, `OutfitDialog`

---

### 5.3 persistence 模块

> 持久化守护模块，负责自动保存（带重试限制与最小间隔）、持久化守护、事务性级联删除。

**路径**: `src/modules/persistence/`

| 子域 | 文件 | 说明 |
|------|------|------|
| `hooks/` | `use-auto-save.ts` | 自动保存 Hook（MAX_RETRY=3, MIN_INTERVAL=0.5min） |
| | `use-persistence-guard.ts` | 持久化守护 Hook |
| `services/` | `transactional-delete.ts` | 事务性级联删除（数据库记录 + 本地文件清理） |

**公共 API 导出** (`index.ts`):
- Hooks：`useAutoSave`, `usePersistenceGuard`
- 服务：`deleteCharacterWithRefs`, `deleteSceneWithRefs`

---

### 5.4 prompt 模块

> 提示词生成与管理模块，纯函数模块，所有生成函数均为同步纯函数，无副作用。

**路径**: `src/modules/prompt/`

| 子域 | 文件 | 说明 |
|------|------|------|
| `base/` | `index.ts` | 关键词常量映射（风格/场景/氛围/灯光/镜头）、描述构建工具 |
| `character/` | `index.ts`, `services/character-prompt-service.ts` | 角色图片提示词生成 |
| `scene/` | `index.ts`, `services/scene-prompt-service.ts` | 场景图片提示词生成 |
| `beat-image/` | `index.ts` | 分镜图片提示词生成 |
| `video/` | `index.ts`, `services/video-prompt-service.ts`, `services/professional-video-prompt.ts`, `services/enhanced-video-prompt.ts`, `services/quick-video-prompt.ts`, `services/single-beat-prompt.ts` | 视频/专业/增强/快速/单分镜提示词 |
| `server-prompts/` | `index.ts`, `services/server-prompt-service.ts` | 首帧/尾帧/角色分析/场景分析提示词（API 用） |
| `builder/` | `index.ts`, `prompt-builder.ts`, `story-plan.ts`, `quick-mode.ts` | PromptBuilder 类、故事计划提示词、快速模式提示词、模型选项配置 |
| `presentation/` | `ModelSelector.tsx`, `ConfigCheckBanner.tsx` | 模型选择器、配置检查横幅 |

**公共 API 导出** (`index.ts`):
- 基础：`QUALITY_TAGS_IMAGE`, `QUALITY_TAGS_VIDEO`, `STYLE_KEYWORDS`, `SCENE_TYPE_KEYWORDS`, `MOOD_KEYWORDS`, `LIGHTING_KEYWORDS`, `CAMERA_ANGLE_KEYWORDS`, `CAMERA_MOVEMENT_KEYWORDS`, `joinParts`, `buildCharacterFullDesc`, `buildSceneAtmosphereDesc`, `buildSceneVisualDesc`
- 角色：`generateCharacterImagePrompt`, `generateCharacterDetailedPromptInstruction`, `generateSimpleCharacterImagePrompt`
- 场景：`generateSceneImagePrompt`, `generateSimpleSceneImagePrompt`, `generateScenePromptOptimization`
- 分镜：`generateBeatImagePrompt`, `generateSimpleBeatImagePrompt`
- 视频：`generateProfessionalVideoPrompt`, `generateEnhancedVideoPrompt`, `generateQuickVideoPrompt`, `generateSingleBeatPrompt`
- 服务端：`generateFirstFramePrompt`, `generateLastFramePrompt`, `generateKeyframePrompt`, `generateCharacterAnalysisPrompt`, `generateSceneAnalysisPrompt`
- 构建器：`PromptBuilder`, `promptBuilder`, `generateStoryPlanPrompt`, `generateQuickModeVideoPrompt`, `AVAILABLE_STYLES`, `getDurationOptions`, `getResolutionOptions`, `getDurationOptionsForModel`, `getResolutionOptionsForModel`, `getStyleOptionsForModel`
- 组件：`ModelSelector`, `useModelSelection`, `ModelSelection`, `ConfigCheckBanner`

---

### 5.5 scene 模块

> 场景管理模块，与角色模块结构对称，使用 Result 模式和领域事件。

**路径**: `src/modules/scene/`

| 子域 | 文件 | 说明 |
|------|------|------|
| `services/` | `index.ts` | 场景 CRUD 服务 |
| `hooks/` | (hooks 文件) | 场景 CRUD + 图片生成 Hooks |
| `constants.ts` | | 默认场景、类型/时间/天气/氛围/元素/颜色/角度/距离/运动建议 |
| `presentation/` | `SceneListItem.tsx` | 场景列表项组件 |

**公共 API 导出** (`index.ts`):
- 服务：`sceneService`
- 常量：`defaultScene`, `typeSuggestions`, `timeSuggestions`, `weatherSuggestions`, `moodSuggestions`, `elementSuggestions`, `colorSuggestions`, `angleSuggestions`, `distanceSuggestions`, `movementSuggestions`
- Hooks：`useSceneImage`, `useScenes`, `useScene`, `useSceneCount`, `useCreateScene`, `useUpdateScene`, `useDeleteScene`, `useSceneCRUD`
- 组件：`SceneListItem`

---

### 5.6 shot 模块

> 分镜系统模块，负责视觉一致性检查、元素绑定、特征提取与锚定、镜头指令转换、分镜生成管道、引用引擎和引用检查。

**路径**: `src/modules/shot/`

| 子域 | 文件 | 说明 |
|------|------|------|
| `consistency-check/` | (服务文件) | 视觉一致性检查与配置校验 |
| `element-binding/` | `element-manager.ts`, `useElementBinding.ts` | 元素绑定管理 |
| `feature-extraction/` | `services/feature-extraction-service.ts`, `services/feature-anchoring-service.ts` | 特征提取与锚定 |
| `shot-generation/` | (服务文件) | 分镜生成管道 |
| `shot-instruction/` | `index.ts` | 分镜指令解析与提示词构建 |
| `shot-reference/` | `reference-engine.ts`, `services/shot-reference-service.ts` | 分镜引用管理 |
| `reference-check/` | (重导出自 domain) | 元素引用检查 |

**公共 API 导出** (`index.ts`):
- 一致性检查：`performConsistencyCheck`, `performConfigCheck`, `checkVisualConsistency`, `parseConsistencyAnalysisFromStructured`, `validateFeatureAnchoringConfig`, `validateNoFrameBinding`, `ConsistencyCheckInput`
- 引用检查：`checkCharacterReferences`, `checkSceneReferences`, `checkElementReferences`, `ReferenceInfo`, `DeleteCheckResult`
- 镜头指令：`SHOT_SIZE_OPTIONS`, `CAMERA_MOVEMENT_OPTIONS`, `CAMERA_ANGLE_OPTIONS`, `buildPromptLayers`
- 元素管理：`elementManager`
- 特征锚定：`validateReferenceImageQuality`, `buildFeatureAnchoringConfig`, `extractCharacterFeatures`, `buildFeatureTags`, `buildFeatureAnchor`, `FeatureLanguage`
- 引用引擎：`referenceEngine`
- 分镜生成：`validateShotParams`, `validateStoryBeatOutput`, `validateStoryPlanOutput`, `generateFallbackParams`, `formatValidationResult`, `generateStoryPlanWithValidation`, `ValidationResult`, `ShotParamsType`

---

### 5.7 story 模块

> 故事创作与分镜管理模块，覆盖从故事规划、分镜编辑、AI 生成、批量编排到模板版本控制的完整工作流。

**路径**: `src/modules/story/`

| 子域 | 文件 | 说明 |
|------|------|------|
| `planning/` | `services/story-service.ts` | 故事 CRUD 服务 |
| | `services/story-planning-service.ts` | AI 规划服务 |
| | `hooks/useStorySaver.ts` | 故事保存 Hook |
| | `hooks/useStoryPlanner.ts` | AI 规划 Hook |
| | `hooks/use-stories.ts` | 故事 CRUD Hooks |
| | `story-constants.ts` | 默认故事、类型/基调/分镜类型常量 |
| `beat-editor/` | `hooks/useStoryState.ts` | 分镜状态管理 |
| | `hooks/useAssetLoader.ts` | 资产加载 Hook |
| | `presentation/BeatDetailEditor.tsx` | 分镜详情编辑器（父组件，已拆分为 BeatNavigation + BeatUploadPanel + BeatPromptPanel + BeatGenerationPanel） |
| | `presentation/BeatOverviewCard.tsx` | 分镜概览卡片 |
| | `presentation/SortableBeatList.tsx` | 可排序分镜列表 |
| | `presentation/ElementBindingPanel.tsx` | 元素绑定面板 |
| | `presentation/ProfessionalModeEditor.tsx` | 专业模式编辑器 |
| `generation/` | `services/storyboard-generation-service.ts` | 分镜生成服务 |
| | `services/beat-keyframe-generator.ts` | 关键帧生成 |
| | `services/beat-frame-generator.ts` | 帧对生成 |
| | `services/beat-video-generator.ts` | 视频生成 |
| | `services/beat-chain-generator.ts` | 链式生成 |
| | `services/video-generation-mode.ts` | 视频生成模式 |
| | `services/frame-prompt-service.ts` | 帧提示词服务 |
| | `services/style-guide-service.ts` | 风格指南服务 |
| | `services/video-url-sync.ts` | 视频 URL 同步 |
| | `hooks/useAIGeneratorBase.ts` | AI 生成基础 Hook |
| | `hooks/useKeyframeGenerator.ts` | 关键帧生成 Hook |
| | `hooks/useFramePairGenerator.ts` | 帧对生成 Hook |
| | `hooks/useVideoGenerator.ts` | 视频生成 Hook |
| | `hooks/useBatchGenerator.ts` | 批量生成 Hook |
| | `hooks/useUploadHandlers.ts` | 上传处理 Hook |
| | `presentation/ShotGenerationPanel.tsx` | 分镜生成面板 |
| | `presentation/KeyframePanel.tsx` | 关键帧面板 |
| | `presentation/KeyframeChainVisualizer.tsx` | 关键帧链可视化 |
| | `presentation/PromptPreview.tsx` | 提示词预览 |
| | `presentation/ShotReferenceConfig.tsx` | 分镜引用配置 |
| | `presentation/ReferenceVideoUploader.tsx` | 引用视频上传 |
| `template/` | `services/storyboard-template.ts` | 模板管理服务 |
| | `services/version-control.ts` | 版本控制服务 |
| | `story-templates.ts` | 故事模板数据 |
| | `presentation/TemplateManagerDialog.tsx` | 模板管理对话框 |
| | `presentation/VersionDialog.tsx` | 版本对话框 |
| | `presentation/AssetPicker.tsx` | 资产选择器 |
| `prompt-editor/` | `services/prompt-editor-service.ts` | 提示词 AI 生成服务 |
| | `hooks/use-prompt-editor.ts` | 提示词编辑器 Hook |
| | `presentation/PromptEditor.tsx` | 提示词编辑器 |
| | `presentation/PromptFloatingBall.tsx` | 提示词浮动球 |

**公共 API 导出** (`index.ts`):
- 规划：`storyService`, `useStoryPlanner`, `useStories`, `useStory`, `useStoryCount`, `useCreateStory`, `useUpdateStory`, `useDeleteStory`, `DEFAULT_STORY`, `genres`, `tones`, `beatTypes`, `useStorySaver`, `CreationMode`, `QuickInputMode`, `PlaceholderBinding`, `QuickStoryData`
- 引用解析：`resolveCharacterRef`, `resolveCharacterRefs`, `resolveSceneRef`
- 生成：`useAIGeneratorBase`, `useKeyframeGenerator`, `useFramePairGenerator`, `useVideoGenerator`, `useBatchGenerator`, `useUploadHandlers`, `ShotGenerationPanel`, `KeyframePanel`, `KeyframeChainVisualizer`, `PromptPreview`, `ShotReferenceConfig`, `ReferenceVideoUploader`, `generateBeatKeyframe`, `generateBeatFramePair`, `generateBeatVideo`, `generateBeatFullWorkflow`, `generateKeyframeChain`, `generateFramePairChain`, `determineVideoGenerationMode`, `generateFramePrompts`, `batchGenerateFramePrompts`, `generateStyleGuide`, `generateStylePromptOnly`, `AIGeneratorBaseProps`, `ResolvedRefs`, `VideoGenerationMode`, `BatchStrategy`, `GenerationLevel`, `BatchOptions`, `BatchResult`
- 分镜编辑：`useStoryState`, `useAssetLoader`, `BeatDetailEditor`, `BeatOverviewCard`, `SortableBeatList`, `ElementBindingPanel`, `ProfessionalModeEditor`
- 模板：`TemplateManagerDialog`, `VersionDialog`, `AssetPicker`, `StoryboardTemplate`, `StoryboardTemplateBeat`, `createTemplateFromBeats`, `applyTemplateToBeats`, `exportTemplateToFile`, `importTemplateFromFile`, `restoreVersion`, `formatVersionTime`, `saveVersion`, `getVersions`, `deleteVersion`, `cleanupVersions`, `getVersionStats`, `compareVersions`, `StoryVersion`, `getRecommendedTemplates`, `applyTemplate`, `StoryTemplate`
- 提示词编辑：`generatePromptWithAI`, `buildDefaultPrompt`, `usePromptEditor`, `PromptEditor`, `PromptFloatingBall`, `PromptEditorContext`, `PromptEditorRequest`, `PromptEditorResult`

---

### 5.8 sync 模块

> 多设备数据同步模块，负责变更追踪、向量时钟管理、冲突检测与解决策略、推送/拉取远程变更。

**路径**: `src/modules/sync/`

| 子域 | 文件 | 说明 |
|------|------|------|
| `engine/` | `engine.ts` | 同步引擎入口 |
| | `sync-engine-class.ts` | 同步引擎类 |
| | `changelog.ts` | 变更日志 (含异步 `getDeviceId()`: HTTP `/api/config/get` 优先 + IPC 回退 + 内存缓存) |
| | `conflict-resolution.ts` | 冲突解决 |
| | `remote-changes.ts` | 远程变更处理 |
| | `sync-protocol.ts` | 同步协议 |
| | `entity-mapping.ts` | 实体映射 |
| | `server-store.ts` | 服务端存储 |
| | `types.ts` | 同步类型定义 |
| `presentation/` | `SyncConflictPanel.tsx` | 冲突解决面板 |
| | `SyncSettingsPanel.tsx` | 同步设置面板 |
| | `SyncStatusIndicator.tsx` | 同步状态指示器 |
| | `SyncStatusSection.tsx` | 同步状态区域 |
| | `ServerConfigSection.tsx` | 服务器配置区域 |
| | `ConflictResolutionSection.tsx` | 冲突解决区域 |

**公共 API 导出** (`index.ts`):
- 引擎：`initSyncEngine`, `performSync`, `getSyncStatus`, `updateSyncConfig`, `getSyncConfig`, `setConflictCallback`, `recordChange`
- 类型：`SyncEntityType`, `ChangeOperation`, `SyncChangeLogEntry`, `VectorClock`, `SyncStatus`, `SyncConflict`, `ConflictStrategy`, `SyncConfig`, `SyncStatusInfo`, `SyncPushResult`, `SyncPullResult`, `RemoteChange`
- 向量时钟：`compareVectorClocks`, `mergeVectorClocks`, `createVectorClock`, `incrementVectorClock`, `isVectorClockConflict`, `DEFAULT_SYNC_CONFIG`
- 组件：`SyncConflictPanel`, `SyncSettingsPanel`, `SyncStatusIndicator`

---

### 5.9 video 模块

> 视频任务全生命周期管理：创建、轮询、状态机转换、缓存、智能恢复、编解码检测、帧提取、模板与追踪导出。

**路径**: `src/modules/video/`

| 子域 | 文件 | 说明 |
|------|------|------|
| `task-management/` | `domain/task-machine.ts` | 视频任务状态机 |
| | `domain/task-schema.ts` | 任务 Schema |
| | `domain/task-events.ts` | 任务事件类型 |
| | `domain/policies/timeout-policy.ts` | 超时策略 |
| | `domain/policies/expiration-policy.ts` | 过期策略 |
| | `domain/policies/policy-engine.ts` | 策略引擎 |
| | `hooks/use-video-task-manager.ts` | 任务管理 Hook（CQRS 统一接口） |
| | `hooks/use-video-task-state.ts` | 状态查询 Hook |
| | `hooks/use-video-task-queries.ts` | 查询 Hook |
| | `hooks/use-video-task-commands.ts` | 命令 Hook |
| | `hooks/use-video-task-polling.ts` | 轮询 Hook |
| | `hooks/use-video-tasks.ts` | React Query Hooks |
| | `hooks/internals/polling-engine.ts` | 轮询引擎 |
| | `hooks/internals/sync-engine.ts` | 同步引擎 |
| | `hooks/internals/transition-guard.ts` | 转换守卫 |
| | `hooks/internals/task-removal.ts` | 任务移除 |
| | `hooks/internals/task-initializer.ts` | 任务初始化 |
| | `services/video-tracker.ts` | 视频追踪服务 |
| | `presentation/VideoTaskManager.tsx` | 任务管理器主组件 |
| | `presentation/VideoTaskManagerInitializer.tsx` | 初始化组件 |
| | `presentation/VideoTaskManagerUI.tsx` | 管理 UI 面板 |
| | `presentation/TaskCard.tsx` | 任务卡片 |
| | `presentation/TaskDetailDialog.tsx` | 任务详情对话框 |
| | `presentation/VideoPreviewDialog.tsx` | 视频预览对话框 |
| | `presentation/TaskTrackingDialog.tsx` | 任务追踪对话框 |
| | `presentation/RecoverySection.tsx` | 恢复区域 |
| | `presentation/DeleteConfirmDialog.tsx` | 删除确认对话框 |
| | `presentation/BulkDeleteDialog.tsx` | 批量删除对话框 |
| | `presentation/TaskFilterBar.tsx` | 任务过滤栏 |
| `cache/` | `services/video-cache.ts` | 视频 Blob 磁盘缓存 (已迁移到 `@/shared/file-http` 统一通信层) |
| | `services/video-cache-service.ts` | 视频缓存服务 |
| | `services/image-cache.ts` | 图片磁盘缓存 (已迁移到 `@/shared/file-http` 统一通信层) |
| | `hooks/use-video-cache.ts` | 缓存 Hook |
| `recovery/` | `services/video-recovery.ts` | 视频恢复 |
| | `services/video-recovery-service.ts` | 恢复服务 |
| | `services/video-verification-service.ts` | 视频验证 |
| | `services/duplicate-detection-service.ts` | 重复检测 |
| | `services/smart-retry-engine.ts` | 智能重试引擎 |
| | `services/video-intelligent-recovery-service.ts` | 智能恢复 |
| | `types/video-recovery-types.ts` | 恢复类型定义 |
| `utils/` | `video-templates.ts` | 视频模板 |

**公共 API 导出** (`index.ts`):
- 任务管理：`VideoTask`, `useVideoTaskManager`, `useVideoTaskStore`, `useVideoTaskState`, `useVideoTaskQueries`, `useVideoTaskCommands`, `useVideoTaskPolling`, `useVideoTasks`, `useFailedVideoTasks`, `useRecoverVideo`, `useCleanExpiredTasks`, `useStartBackgroundRecovery`, `buildTrackingInfo`, `VideoTaskManager`, `VideoTaskManagerInitializer`, `VideoTaskManagerUI`
- 缓存：`useVideoCacheStats`, `cacheVideoBlob`, `getCachedVideoUrl`, `getVideoUrlWithCache`, `removeCachedVideo`, `cleanExpiredVideoCache`, `getCacheStats`, `revokeObjectURL`, `touchMemoryCache`, `clearMemoryCache`, `checkCachedVideo`, `getVideoFileStream`, `getCachedVideo`, `cacheImageBlob`, `getCachedImagePath`, `getImageUrlWithCache`, `removeCachedImage`, `cleanExpiredImageCache`, `getImageCacheStats`, `recoverUncachedImages`
- 恢复：`VideoVerificationResult`, `VideoVerificationDetails`, `RetryDecision`, `VideoRecoveryLog`, `VideoTaskRecoveryInfo`, `DuplicateCheckResult`, `RetryConfig`, `recoverVideoByTaskId`, `saveVideoTask`, `verifyVideoUrl`, `verifyMultipleVideos`, `checkForDuplicateVideos`, `findSimilarTasks`, `smartRetryEngine`, `SmartRetryEngine`, `createRetryEngine`, `getTaskRecoveryInfo`, `performIntelligentRecovery`, `checkForTokenWaste`, `registerCacheVideoBlobFn`, `getFailedTasks`, `getTaskById`, `startBackgroundRecovery`, `cleanExpiredTasks`, `getAllTaskHistory`
- 工具：`detectVideoCodec`, `isCodecSupportedByProvider`, `extractVideoFrames`, `downloadJSONFile`, `videoTemplates`, `templateCategories`, `getTemplatesByCategory`, `applyVideoTemplate`, `VideoTemplate`

---

## 6. 共享层

> 共享层提供跨模块通用工具和基础设施代理导出。代理导出目录（db-core, api-config, video-cache, outfit, sql-safety, model-capabilities, file-http）允许从 infrastructure 重新导出。

### 6.1 代理导出模块

| 目录 | 文件 | 说明 | 代理导出源 |
|------|------|------|-----------|
| `db-core/` | `index.ts` | 数据库核心操作 | `@/infrastructure/storage/sqlite-core` → `safeQuery`, `safeRun`, `safeTransaction`, `withRetry` |
| `api-config/` | `index.ts` | API 配置 | `@/infrastructure/ai-providers/api-config/*` → `loadConfig`, `checkConfigStatus`, `initConfig`, `getAllTemplatesAsync`, `loadPluginTemplates`, `ProviderTemplate` |
| `video-cache/` | `index.ts` | 视频缓存 | `@/infrastructure/storage/video-cache` → `registerObjectUrl`, `revokeObjectUrl`, `getObjectUrl`; `@/infrastructure/network/resilient-fetch` → `resilientFetch` |
| `outfit/` | `index.ts` | 服装合成 | `@/infrastructure/ai-providers/outfit-synthesis` → `synthesizeOutfit`, `batchSynthesizeOutfits`; `@/infrastructure/storage/characters` → `updateOutfitImage` |
| `sql-safety/` | `index.ts` | SQL 安全 | `sql-sanitizer.ts` → `sanitizeIdentifier`, `sanitizeTable`, `buildSafeInsert`, `buildSafeUpdate`, `buildSafeDelete`, `toSqlValue`; `schema-registry.ts` → `registerColumn`, `registerColumns`, `getColumnKind`, `getAllRegisteredColumns`, `isColumnRegistered` |
| `model-capabilities.ts` | | 模型能力 | `@/infrastructure/ai-providers/model-capabilities` → `resolveImageSize`, `getModelParameterProfile`, `getModelCapabilities`, `getSupportedImageSizes`, `supportsLastFrame`, `getMaxReferences`, `adjustReferenceImages`, `getVideoGenerationStrategy`, `setModelProfiles`, `loadModelProfilesFromServer`, `ModelCapabilities`, `ModelParameterProfile`, `VideoGenerationStrategy`, `BUILTIN_MODEL_CAPABILITIES` |
| `file-http/` | `index.ts` | 统一文件操作通信层 | `@/shared/file-http` → `writeFile`, `readFile`, `getFileInfo`, `getCacheDirectory`, `getDiskSpace`, `fileExists`, `deleteFile` (HTTP 优先 + IPC 回退) |

### 6.2 通用工具

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `event-bus.ts` | 事件总线 | `eventBus`, `EventHandler`, `EventSubscription` |
| `event-types.ts` | 领域事件类型 | `DomainEvents` (character:created/updated/deleted, scene:created/updated/deleted, story:created/updated/deleted, asset:created/deleted, videoTask:created/updated/completed/failed), `DomainEventType`, `EventPayloadMap` |
| `app-store.ts` | 全局应用状态 | `useAppStore` (activeCharacterId, activeSceneId, activeStoryId, sidebarCollapsed) |
| `error-handler.ts` | 错误处理 | `isAppError`, `createAppError`, `createGenerationError`, `createRateLimitError`, `createApiError`, `handleError`, `handleApiClientError`, `getErrorMessage` |
| `error-logger.ts` | 错误日志 | `errorLogger` (debug/info/warn/error/fatal), `extractErrorMessage`, `setMinLogLevel`, `installGlobalErrorHandlers` |

### 6.3 常量

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `constants/index.ts` | 常量桶导出 | `t`, `hasMessage`, `getAllMessages`, `Messages`, `API_ERROR_CODES`, `getApiErrorI18nKey`, `ApiErrorCode` |
| `constants/messages.ts` | 国际化消息 | `t()` 国际化函数 |
| `constants/error-codes.ts` | API 错误码 | `API_ERROR_CODES`, `getApiErrorI18nKey` |

### 6.4 Hooks

| 文件 | 说明 |
|------|------|
| `hooks/use-entity-crud.ts` | 通用实体 CRUD Hook |
| `hooks/use-model-capabilities.ts` | 模型能力 Hook |
| `hooks/use-provider-templates.ts` | 提供商模板 Hook |
| `hooks/useKeyboardShortcuts.ts` | 键盘快捷键 Hook |
| `hooks/useDebouncedState.ts` | 防抖状态 Hook |
| `hooks/use-virtual-list.ts` | 虚拟列表 Hook |
| `hooks/use-network-monitor.ts` | 网络监控 Hook |
| `hooks/use-memory-monitor.ts` | 内存监控 Hook |
| `hooks/use-global-keyboard-actions.ts` | 全局键盘操作 Hook |
| `hooks/use-dirty-state.ts` | 脏状态管理 Hook |
| `hooks/use-current-time.ts` | 当前时间 Hook |

### 6.5 工具函数

| 文件 | 说明 |
|------|------|
| `utils/user-facing-error.ts` | 用户友好错误 |
| `utils/error-classifier.ts` | 错误分类器 |
| `utils/performance.ts` | 性能工具 |
| `utils/preferences.ts` | 偏好设置工具 |
| `utils/safe-json.ts` | 安全 JSON 解析 |
| `utils/image-url.ts` | 图片 URL 工具 |
| `utils/toast-bridge.ts` | Toast 桥接（非 React 环境通知） |
| `utils/utils.ts` | 通用工具函数 |
| `utils/platform.ts` | 平台检测 |
| `utils/url-validation.ts` | URL 验证 |
| `utils/file-download.ts` | 文件下载 |
| `utils/media-error-handler.ts` | 媒体错误处理 |

### 6.6 视频工具

| 文件 | 说明 |
|------|------|
| `video-utils/video-codec.ts` | 视频编解码检测 |
| `video-utils/video-frame-extractor.ts` | 视频帧提取 |
| `video-utils/codec-check.ts` | 编解码兼容性检查 |
| `video-utils/provider-codecs.ts` | 提供商编解码支持 |

### 6.7 类型

| 文件 | 说明 |
|------|------|
| `types/index.ts` | 类型桶导出 → `ApiRequest`, `ApiResponse`, `RouteHandler`, `IpcArgs`, `IpcResult`, `IpcInvoker`, `MenuEventCallback` |
| `types/api.ts` | API 类型 |
| `types/ipc.ts` | IPC 类型 |

### 6.8 共享 UI 组件 (`shared/presentation/`)

| 文件 | 说明 |
|------|------|
| `button.tsx` | 按钮组件（多变体） |
| `card.tsx` | 卡片组件 |
| `app-card.tsx` | 应用卡片组件 |
| `alert.tsx` | 警告组件 |
| `dialog.tsx` | 对话框组件 |
| `confirm-dialog.tsx` | 确认对话框 |
| `input.tsx` | 输入框组件 |
| `input-group.tsx` | 输入组组件 |
| `textarea.tsx` | 文本域组件 |
| `select.tsx` | 选择器组件 |
| `checkbox.tsx` | 复选框组件 |
| `switch.tsx` | 开关组件 |
| `slider.tsx` | 滑块组件 |
| `badge.tsx` | 徽章组件 |
| `status-badge.tsx` | 状态徽章 |
| `progress.tsx` | 进度条组件 |
| `separator.tsx` | 分隔线组件 |
| `label.tsx` | 标签组件 |
| `tabs.tsx` | 标签页组件 |
| `command.tsx` | 命令面板组件 |
| `safe-image.tsx` | 安全图片组件（错误回退） |
| `feedback.tsx` | 反馈组件 |
| `empty-state.tsx` | 空状态组件 |
| `loading-state.tsx` | 加载状态组件 |

### 6.9 共享展示组件 (`shared/presentation/`)

| 文件 | 说明 |
|------|------|
| `Toast.tsx` | Toast 通知组件 |
| `ErrorBoundary.tsx` | 错误边界组件 |
| `PageErrorBoundary.tsx` | 页面级错误边界 |
| `ThemeProvider.tsx` | 主题提供器 |
| `ThemeSwitcher.tsx` | 主题切换器 |
| `Sidebar.tsx` | 侧边栏组件 |
| `AssetSelectorDialog.tsx` | 资产选择器对话框 |
| `BeforeUnloadGuard.tsx` | 页面卸载守卫 |
| `DeleteConfirmDialog.tsx` | 删除确认对话框 |
| `SearchDialog.tsx` | 搜索对话框 |
| `KeyboardShortcutsDialog.tsx` | 键盘快捷键对话框 |
| `OnboardingGuide.tsx` | 新手引导 |
| `onboarding.tsx` | 新手引导逻辑 |
| `CrashRecoveryDialog.tsx` | 崩溃恢复对话框 |
| `NetworkStatusAlert.tsx` | 网络状态告警 |
| `SaveStatusIndicator.tsx` | 保存状态指示器 |
| `ModelParameterPanel.tsx` | 模型参数面板 |
| `DebugOverlay.tsx` | 调试覆盖层 |
| `VirtualList.tsx` | 虚拟列表组件 |
| `PerformanceMonitorPanel.tsx` | 性能监控面板 |
| `MemoryMonitorPanel.tsx` | 内存监控面板 |

---

## 7. 基础设施层

### 7.1 AI 提供商 (`src/infrastructure/ai-providers/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `core.ts` | API 客户端核心 | `ApiClientError`, `getErrorMessage`, `checkApiHealth`, `apiCallWithRetry` |
| `config.ts` | 配置管理 | `resolveCapability`, `safeTruncatePrompt`, `MAX_PROMPT_LENGTH` |
| `text.ts` | 文本生成 | `generateText` |
| `image.ts` | 图片生成 | `generateImage`, `analyzeImage` |
| `image-normalization.ts` | 图片标准化 | 图片格式转换 |
| `video.ts` | 视频生成 | `generateVideo`, `generateKeyframe`, `generateFramePair`, `generateVideoWithFrames`, `queryVideoStatus` |
| `video-service.ts` | 视频服务 | 视频生成编排 |
| `enhanced-video.ts` | 增强视频生成 | `generateEnhancedVideo` |
| `multi-api.ts` | 多 API 生成 | `generateVideoWithMultiAPI`, `testConnection` |
| `services.ts` | 安全配置与导出 | `secureConfig`, `exportData` |
| `config-status.ts` | 配置状态 | `getConfigStatus`, `clearConfigStatusCache` |
| `utils.ts` | 工具函数 | `imageToBase64`, `uploadFile`, `getConfig`, `clearConfigCache` |
| `errors.ts` | 错误定义 | AI 提供商错误类型 |
| `types.ts` | 类型定义 | `ApiRequestOptions`, `CustomApiConfig`, `ApiProviderConfig`, 各种 RequestBody 类型 |
| `model-capabilities.ts` | 模型能力 | `resolveImageSize`, `getModelCapabilities`, `getVideoGenerationStrategy` 等 |
| `model-capabilities-types.ts` | 模型能力类型 | 模型能力接口定义 |
| `model-capabilities-utils.ts` | 模型能力工具 | 模型能力辅助函数 |
| `builtin-model-capabilities.ts` | 内置模型能力 | 内置模型能力数据 |
| `model-registry.ts` | 模型注册表 | 模型注册与管理 |
| `model-parameter-profile.ts` | 模型参数配置 | 模型参数配置文件 |
| `api-cache.ts` | API 缓存 | API 调用缓存 |
| `offline-queue.ts` | 离线队列 | 离线请求队列 |
| `offline-queue-ops.ts` | 离线队列操作 | 队列操作函数 |
| `offline-queue-utils.ts` | 离线队列工具 | 队列辅助函数 |
| `outfit-synthesis.ts` | 服装合成 | `synthesizeOutfit`, `batchSynthesizeOutfits` |
| `index.ts` | 桶导出 | 重新导出以上所有 |

**API 配置子目录** (`api-config/`):

| 文件 | 说明 |
|------|------|
| `storage.ts` | API 配置存储 |
| `detect.ts` | 配置检测 |
| `templates.ts` | 提供商模板 |
| `provider-templates-data.ts` | 提供商模板数据 |
| `init.ts` | 配置初始化 |
| `server.ts` | 服务端配置 |
| `server-config-loader.ts` | 服务端配置加载 |
| `server-encryption.ts` | 服务端加密 |
| `server-key.ts` | 服务端密钥 |
| `types.ts` | 配置类型定义 |
| `providers/provider-schema.ts` | 提供商 Schema |
| `index.ts` | 桶导出 |

**模型适配器子目录** (`model-adapter/`):

| 文件 | 说明 |
|------|------|
| `index.ts` | 模型适配器入口 |

**提供商子目录** (`providers/`):

| 文件 | 说明 |
|------|------|
| `cloud-providers.ts` | 云提供商聚合 |
| `volcengine.ts` | 火山引擎 |
| `kuaishou.ts` | 快手 |
| `zhipu.ts` | 智谱 |
| `pixverse.ts` | Pixverse |
| `seedance.ts` | Seedance |
| `google.ts` | Google |
| `openai-sora.ts` | OpenAI Sora |
| `openai-compatible.ts` | OpenAI 兼容 |
| `minimax.ts` | MiniMax |
| `anthropic.ts` | Anthropic |
| `pika.ts` | Pika |
| `luma.ts` | Luma |
| `runway.ts` | Runway |
| `index.ts` | 桶导出 |

### 7.2 API 客户端 (`src/infrastructure/api/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `client.ts` | HTTP API 客户端 | `apiClient` |
| `endpoints.ts` | API 端点定义 | `imageApi`, `videoApi`, `textApi`, `configApi` |
| `index.ts` | 桶导出 | 重新导出以上 |

### 7.3 DI 容器 (`src/infrastructure/di/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `container.ts` | DI 容器 | `container`, `resolve`, `AppContainer` |
| `registry.ts` | 模块注册表 | `ModuleRegistry` |
| `types.ts` | DI 类型 | `Token`, `ModuleFactory`, `ModuleContainer`, `Lifecycle`, `createToken` |
| `index.ts` | 桶导出 | `container`, `resolve`, `AppContainer`, `createToken`, `Token`, `ModuleFactory`, `ModuleContainer`, `Lifecycle`, `ModuleRegistry`, `ApiCapability`, `ConfigStatus` |

### 7.4 存储 (`src/infrastructure/storage/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `sqlite-core.ts` | SQLite 核心操作 | `safeQuery`, `safeRun`, `safeTransaction` |
| `core.ts` | 存储核心 | `parseRecord`, `toSqlValue`, `trackChange` |
| `db.ts` | 数据库初始化 | 数据库连接管理 |
| `schema-registry.ts` | Schema 注册表 | 列注册与查询 |
| `sql-sanitizer.ts` | SQL 安全 | SQL 注入防护 |
| `characters.ts` | 角色存储 | `characterStorage` |
| `scenes.ts` | 场景存储 | `sceneStorage` |
| `stories.ts` | 故事存储 | `storyStorage` |
| `video-tasks.ts` | 视频任务存储 | `videoTaskStorage` |
| `video-cache.ts` | 视频缓存存储 | 视频缓存管理 (服务层已迁移到 `@/shared/file-http`) |
| `image-cache.ts` | 图片缓存存储 | 图片缓存管理 (服务层已迁移到 `@/shared/file-http`) |
| `storyboard.ts` | 分镜存储 | `storyboardStorage` |
| `collections.ts` | 收藏集存储 | `collectionStorage` |
| `versions.ts` | 版本存储 | `versionStorage` |
| `templates.ts` | 模板存储 | `templateStorage` |
| `auto-save.ts` | 自动保存存储 | `autoSaveStorage` |
| `sessions.ts` | 会话存储 | `sessionStorage` |
| `import-export.ts` | 导入导出存储 | `importExportStorage` |
| `elements.ts` | 元素存储 | `elementStorage` |
| `error-logs.ts` | 错误日志存储 | `errorLogStorage` |
| `index.ts` | 桶导出 | 重新导出所有 storage 和核心函数 |

**角色子目录** (`characters/`):

| 文件 | 说明 |
|------|------|
| `index.ts` | 桶导出 |
| `parser.ts` | 角色数据解析 |
| `outfit-manager.ts` | 服装管理 |
| `json-schemas.ts` | JSON Schema |

**场景子目录** (`scenes/`):

| 文件 | 说明 |
|------|------|
| `json-schemas.ts` | JSON Schema |

**故事子目录** (`stories/`):

| 文件 | 说明 |
|------|------|
| `relations.ts` | 故事关联管理 |
| `beat-transformer.ts` | 分镜数据转换 |
| `json-schemas.ts` | JSON Schema |
| `index.ts` | 桶导出 |

**元素子目录** (`elements/`):

| 文件 | 说明 |
|------|------|
| `commands.ts` | 元素命令 |
| `queries.ts` | 元素查询 |
| `json-schemas.ts` | JSON Schema |
| `index.ts` | 桶导出 |

**视频任务子目录** (`video-tasks/`):

| 文件 | 说明 |
|------|------|
| `parser.ts` | 任务数据解析 |
| `bulk-operations.ts` | 批量操作 |
| `json-schemas.ts` | JSON Schema |
| `index.ts` | 桶导出 |

### 7.5 网络 (`src/infrastructure/network/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `resilient-fetch.ts` | 弹性 Fetch | `resilientFetch` |
| `retry-executor.ts` | 重试执行器 | `executeWithRetry`, `RETRY_POLICIES` |
| `circuit-breaker.ts` | 熔断器 | `getCircuitBreaker`, `getCircuitState`, `executeThroughCircuit`, `resetCircuitBreaker`, `resetAllCircuitBreakers`, `getAllCircuitStates` |
| `network-monitor.ts` | 网络监控 | `getNetworkQuality`, `getAdaptiveTimeout`, `shouldDeferNonCriticalRequest` |
| `download-manager.ts` | 下载管理器 | 文件下载管理 |
| `request-lifecycle.ts` | 请求生命周期 | 请求状态追踪 |
| `network.config.ts` | 网络配置 | `NETWORK_CONFIG`, `getNetworkConfig` |
| `profiles.ts` | 网络配置文件 | `aiApiProfile`, `syncProfile`, `NetworkProfile` |
| `types.ts` | 网络类型 | `CircuitState`, `NetworkQualityLevel`, `RequestState`, `DownloadTask`, `Interceptor` 等 |
| `index.ts` | 桶导出 | 重新导出以上所有 |

**拦截器子目录** (`interceptors/`):

| 文件 | 说明 |
|------|------|
| `lifecycle.interceptor.ts` | 生命周期拦截器 |
| `circuit-breaker.interceptor.ts` | 熔断器拦截器 |
| `cache.interceptor.ts` | 缓存拦截器 |
| `retry.interceptor.ts` | 重试拦截器 |
| `logging.interceptor.ts` | 日志拦截器 |
| `index.ts` | 桶导出 |

### 7.6 数据库 (`src/infrastructure/database/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `media-asset-repository.ts` | 媒体资产仓库 | `mediaAssetRepository` |
| `index.ts` | 桶导出 | `mediaAssetRepository` |

### 7.7 监控 (`src/infrastructure/monitoring/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `performance-monitor.ts` | 性能监控 | `performanceMonitor`, `PerformanceMetric`, `MetricType`, `PerformanceThreshold` |
| `memory-leak-detector.ts` | 内存泄漏检测 | 内存泄漏检测工具 |
| `index.ts` | 桶导出 | `performanceMonitor` |

### 7.8 服务端工具 (`src/infrastructure/server/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `api-utils.ts` | API 工具 | `safeParseJson`, `sanitizeErrorMessage`, `maskApiKey`, `validateRequiredFields`, `isUrlAllowed`, `ApiError` |
| `index.ts` | 桶导出 | 重新导出以上 |

### 7.9 视频工具 (`src/infrastructure/video-utils/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `index.ts` | 桶导出 | `detectVideoCodec`, `isCodecSupportedByProvider`, `extractVideoFrames` (代理自 `@/shared/video-utils`) |

### 7.10 API 配置门面 (`src/infrastructure/api-config-facade.ts`)

| 文件 | 说明 |
|------|------|
| `api-config-facade.ts` | API 配置门面，统一配置入口 |

---

## 8. 应用层

> 应用层包含页面组件、路由配置和全局 Provider。

### 8.1 页面组件

| 文件 | 说明 |
|------|------|
| `page.tsx` | 首页（项目列表） |
| `layout.tsx` | 布局组件（侧边栏 + 内容区） |
| `not-found.tsx` | 404 页面 |

### 8.2 全局组件

| 文件 | 说明 |
|------|------|
| `ClientProviders.tsx` | 客户端 Provider 组合（QueryClient, EventBus 等） |
| `MigrationInitializer.tsx` | 数据迁移初始化组件 |
| `SidebarWithSearch.tsx` | 带搜索的侧边栏 |
| `QuickActions.tsx` | 快速操作组件 |
| `ProjectList.tsx` | 项目列表组件 |

### 8.3 故事页面 (`app/story/`)

| 文件 | 说明 |
|------|------|
| `page.tsx` | 故事列表页 |
| `StoryHeader.tsx` | 故事头部 |
| `StoryProvider.tsx` | 故事上下文 Provider |
| `useStoryVideo.ts` | 故事视频关联 Hook |
| `useStoryPersistence.ts` | 故事持久化 Hook |
| `useStoryActions.ts` | 故事操作 Hook |
| `story-context-types.ts` | 故事上下文类型 |
| `SwitchConfirmDialog.tsx` | 切换确认对话框 |
| `VideoGeneratorSection.tsx` | 视频生成区域 |
| `beat/$beatId/page.tsx` | 分镜详情页 |
| `beat/$beatId/BeatDetailClient.tsx` | 分镜详情客户端 |
| `beat/$beatId/BeatVideoTab.tsx` | 分镜视频标签页 |
| `beat/$beatId/BeatVideoPreview.tsx` | 分镜视频预览 |
| `beat/$beatId/BeatTechTab.tsx` | 分镜技术标签页 |
| `beat/$beatId/BeatDetailsTab.tsx` | 分镜详情标签页 |
| `beat/$beatId/use-beat-detail.ts` | 分镜详情 Hook |
| `beat/$beatId/use-beat-detail-actions.ts` | 分镜详情操作 Hook |

### 8.4 角色页面 (`app/characters/`)

| 文件 | 说明 |
|------|------|
| `page.tsx` | 角色列表页 |
| `CharacterList.tsx` | 角色列表组件 |
| `CharacterEditor.tsx` | 角色编辑器 |
| `CharacterBasicInfo.tsx` | 角色基本信息 |
| `CharacterImageSection.tsx` | 角色图片区域 |
| `CharacterAppearanceSection.tsx` | 角色外观区域 |

### 8.5 场景页面 (`app/scenes/`)

| 文件 | 说明 |
|------|------|
| `page.tsx` | 场景列表页 |
| `components/BasicTab.tsx` | 基本信息标签页 |
| `components/CameraTab.tsx` | 相机标签页 |
| `components/AtmosphereTab.tsx` | 氛围标签页 |
| `components/SceneEditorTabs.tsx` | 场景编辑器标签页 |
| `components/SceneList.tsx` | 场景列表组件 |
| `components/ImageActionToolbar.tsx` | 图片操作工具栏 |

### 8.6 视频任务页面 (`app/video-tasks/`)

| 文件 | 说明 |
|------|------|
| `page.tsx` | 视频任务管理页 |

### 8.7 快速生成页面 (`app/quick-generate/`)

| 文件 | 说明 |
|------|------|
| `page.tsx` | 快速生成页 |
| `QuickGenerateForm.tsx` | 快速生成表单 |
| `QuickGenerateState.ts` | 快速生成状态 |
| `quick-generate-reducer.ts` | 快速生成 Reducer |
| `TaskResultPanel.tsx` | 任务结果面板 |
| `AdvancedSettingsCard.tsx` | 高级设置卡片 |
| `TemplateSelectDialog.tsx` | 模板选择对话框 |
| `QuickGenerateHistory.tsx` | 快速生成历史 |

### 8.8 资产库页面 (`app/asset-library/`)

| 文件 | 说明 |
|------|------|
| `page.tsx` | 资产库页 |
| `AssetCards.tsx` | 资产卡片组件 |
| `AssetCardGrid.tsx` | 资产卡片网格 |
| `AssetEditDialog.tsx` | 资产编辑对话框 |
| `AssetCollectionDialogs.tsx` | 收藏集对话框 |
| `AssetUploadSection.tsx` | 资产上传区域 |
| `AssetToolbar.tsx` | 资产工具栏 |
| `useAssetLibraryActions.ts` | 资产库操作 Hook |
| `asset-library-shared.ts` | 资产库共享工具 |

### 8.9 设置页面 (`app/settings/`)

| 文件 | 说明 |
|------|------|
| `page.tsx` | 设置页 |
| `ApiConfigPanel.tsx` | API 配置面板 |
| `ProviderCard.tsx` | 提供商卡片 |
| `ProviderForm.tsx` | 提供商表单 |
| `ModelMappingSection.tsx` | 模型映射区域 |
| `ModelParams.tsx` | 模型参数 |
| `PluginManager.tsx` | 插件管理器 |
| `PluginList.tsx` | 插件列表 |
| `PluginDetail.tsx` | 插件详情 |
| `PluginApiConfig.tsx` | 插件 API 配置 |
| `PluginModelDefs.tsx` | 插件模型定义 |
| `PluginRequestFormat.tsx` | 插件请求格式 |
| `PluginResponseFormat.tsx` | 插件响应格式 |
| `PluginUrlRules.tsx` | 插件 URL 规则 |
| `PluginPreviewExport.tsx` | 插件预览导出 |
| `PluginBasicInfo.tsx` | 插件基本信息 |
| `PluginCreator.tsx` | 插件创建器 |
| `plugin-add-form.tsx` | 插件添加表单 |
| `plugin-creator.tsx` | 插件创建器组件 |
| `plugin-spec-viewer.tsx` | 插件规格查看器 |
| `plugin-schema-viewer.tsx` | 插件 Schema 查看器 |
| `plugin-api.ts` | 插件 API |
| `plugin-creator-api.ts` | 插件创建器 API |
| `plugin-creator-types.ts` | 插件创建器类型 |

---

## 9. Electron 主进程

### 9.1 入口与生命周期

| 文件 | 说明 |
|------|------|
| `main.ts` | 主进程入口 |
| `main-dev.ts` | 开发模式入口 |
| `main-common.ts` | 主进程通用逻辑 |
| `api-server.ts` | API 服务器 |
| `protocol.ts` | 自定义协议注册 |
| `menu.ts` | 应用菜单 |
| `db-interface.ts` | 数据库接口 |
| `lifecycle/manager.ts` | 生命周期管理 |
| `lifecycle/cleanup.ts` | 清理逻辑 |
| `lifecycle/recovery.ts` | 恢复逻辑 |
| `lifecycle/states.ts` | 生命周期状态 |
| `lifecycle/index.ts` | 桶导出 |

### 9.2 API 路由 (`electron/src/api/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `server.ts` | API 服务器 | HTTP 服务器实现 |
| `routes.ts` | 路由注册 | `routes` (合并所有路由组) |
| `schemas.ts` | Zod Schema 定义 | 所有 API 请求 Schema 和类型（upload, analyzeImage, generateImage, generateKeyframe, generateFramePair, generateVideo, videoStatus, generateText, testConnection, export, storyPlan, plugin, shot, storyboard, videoRecover 等） |
| `types.ts` | API 类型 | `ApiRequest`, `ApiResponse`, `Route`, `RouteHandler`, `defineRoute` |
| `middleware.ts` | 中间件 | 请求处理中间件 |
| `route-groups/core-routes.ts` | 核心路由 | 基础 API 路由 (含 `config/get`、`config/set`) |
| `route-groups/db-routes.ts` | 数据库路由 | 数据库查询/写入路由 |
| `route-groups/file-routes.ts` | 文件路由 | 文件操作路由 (`file/write`、`file/cache-directory`、`file/disk-space`，`MAX_WRITE_SIZE = 100MB`) |
| `route-groups/generation-routes.ts` | 生成路由 | AI 生成相关路由 |
| `route-groups/plugin-routes.ts` | 插件路由 | 插件管理路由 |
| `route-groups/shot-routes.ts` | 分镜路由 | 分镜系统路由 |
| `route-groups/storyboard-routes.ts` | 分镜板路由 | 分镜板生成路由 |

### 9.3 预加载 (`electron/src/preload.ts`)

IPC 安全桥接，定义了 `electronAPI` 对象，包含：
- **READONLY**: `db:query`, `db:get`, `assets:read-file-base64`, `config:get` 等
- **READWRITE**: `db:run`, `db:batch-insert`, `assets:save-image`, `config:set` 等
- **DANGEROUS**: `db:transaction`, `db:migrate`, `assets:delete-file` 等
- **SYSTEM**: `shell:open-external`, `dialog:open-file`, `dialog:save-file` 等
- **SECURE**: `secure-config:resolve`

### 9.4 插件系统 (`electron/src/plugins/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `base-provider.ts` | 插件基类 | `BaseAIProviderPlugin` |
| `registry.ts` | 插件注册表 | `pluginRegistry`, `USER_PLUGINS_DIR`, `CODE_PLUGINS_DIR` |
| `types.ts` | 插件类型 | `AIProviderPlugin`, `AsyncAIProviderPlugin`, `ModelCapabilities`, `ProviderCapabilities`, `VideoCapabilities`, `ImageCapabilities`, `ImageTransportMode`, `VideoRequestResult`, `ImageRequestResult`, `TextRequestResult`, `VisionRequestResult`, `CloudProviderInfo` |
| `utils.ts` | 插件工具 | `ensureAccessibleUrl`, `resolveLocalUrlToBase64`, `downloadAsBase64`, `stripDataUriPrefix`, `urlToPureBase64` |
| `user-plugin-loader.ts` | 用户插件加载 | `loadUserPlugins`, `saveUserPlugin`, `deleteUserPlugin`, `listUserPluginFiles` |
| `user-plugin-adapter.ts` | 用户插件适配器 | 用户插件适配 |
| `user-plugin-schema.ts` | 用户插件 Schema | `validatePluginConfig`, `PLUGIN_CONFIG_SCHEMA_VERSION`, `UserPluginConfig` |
| `code-plugin-loader.ts` | 代码插件加载 | `scanCodePluginFile`, `listCodePluginFiles`, `CodePluginExport` |
| `code-plugin-adapter.ts` | 代码插件适配器 | `CodePluginAdapter` |
| `plugin-worker.ts` | 插件工作线程 | 插件 Worker |
| `plugin-process-manager.ts` | 插件进程管理 | `PluginProcessManager`, `shutdownAllProcessManagers`, `getAllProcessMetrics`, `PluginLoadResult`, `ProcessMetrics` |
| `index.ts` | 桶导出 | 所有插件类型、提供商、工具 |

**提供商实现** (`plugins/providers/`):

| 文件 | 说明 |
|------|------|
| `volcengine.ts` | 火山引擎提供商 |
| `kuaishou.ts` | 快手提供商 |
| `zhipu.ts` | 智谱提供商 |
| `pixverse.ts` | Pixverse 提供商 |
| `seedance.ts` | Seedance 提供商 |
| `google.ts` | Google 提供商 |
| `openai-sora.ts` | OpenAI Sora 提供商 |
| `openai-compatible.ts` | OpenAI 兼容提供商 |
| `minimax.ts` | MiniMax 提供商 |
| `anthropic.ts` | Anthropic 提供商 |
| `pika.ts` | Pika 提供商 |
| `luma.ts` | Luma 提供商 |
| `runway.ts` | Runway 提供商 |
| `index.ts` | 桶导出 |

### 9.5 安全模块 (`electron/src/security/`)

| 文件 | 说明 | 关键导出 |
|------|------|---------|
| `key-storage/key-storage.ts` | 密钥存储 | `keyStorage`, `KeyStorageManager` |
| `key-storage/types.ts` | 密钥存储类型 | `KeyStorageStrategy`, `StorageResult`, `MigrationResult`, `EncryptedDataPacket`, `KeyStorageConfig` |
| `key-storage/strategies/safe-storage.strategy.ts` | SafeStorage 策略 | Electron safeStorage 加密 |
| `key-storage/strategies/plaintext-fallback.strategy.ts` | 明文回退策略 | 无 safeStorage 时的回退 |
| `ssrf-guard/ssrf-guard.ts` | SSRF 防护 | `ssrfGuard`, `SsrfGuard`, `SsrfValidationResult`, `SsrfGuardConfig` |
| `index.ts` | 桶导出 | `keyStorage`, `KeyStorageManager`, `ssrfGuard`, `SsrfGuard` |

### 9.6 数据库 (`electron/src/database/`)

| 文件 | 说明 |
|------|------|
| `db-connection.ts` | 数据库连接管理 |
| `db-schema.ts` | 数据库 Schema 定义 |
| `migrations.ts` | 数据库迁移 |
| `schema-builder.ts` | Schema 构建器 |
| `index.ts` | 桶导出 |

### 9.7 处理器 (`electron/src/handlers/`)

| 文件 | 说明 |
|------|------|
| `database.ts` | 数据库 IPC 处理器 |
| `assets.ts` | 资产文件 IPC 处理器 |
| `config.ts` | 配置 IPC 处理器 |
| `config-storage.ts` | 配置存储处理器 |
| `sync.ts` | 同步 IPC 处理器 |
| `secure-config.ts` | 安全配置 IPC 处理器 |
| `export.ts` | 导出 IPC 处理器 |
| `test-connection.ts` | 连接测试处理器 |

### 9.8 API 网关 (`electron/src/api-gateway*.ts`)

| 文件 | 说明 |
|------|------|
| `api-gateway.ts` | API 网关主文件 |
| `api-gateway-image.ts` | 图片 API 网关 |
| `api-gateway-retry.ts` | 重试 API 网关 |
| `api-gateway-error-codes.ts` | API 网关错误码 |
| `api-gateway-utils.ts` | API 网关工具 |

### 9.9 日志 (`electron/src/logging/`)

| 文件 | 说明 |
|------|------|
| `logger.ts` | 日志器 |
| `types.ts` | 日志类型 |
| `transports/console.transport.ts` | 控制台传输 |
| `transports/file.transport.ts` | 文件传输 |
| `index.ts` | 桶导出 |

### 9.10 配置 (`electron/src/config/`)

| 文件 | 说明 |
|------|------|
| `config-manager.ts` | 配置管理器 |
| `ports.ts` | 端口配置 |
| `index.ts` | 桶导出 |

### 9.11 同步 HTTP 客户端 (`electron/src/sync-http-client.ts`)

| 文件 | 说明 |
|------|------|
| `sync-http-client.ts` | 同步 HTTP 客户端（用于 beforeunload 同步保存） |

### 9.12 类型定义 (`electron/src/types/`)

| 文件 | 说明 |
|------|------|
| `api.ts` | API 类型 |
| `ipc.ts` | IPC 类型 |
| `story.ts` | 故事类型 |
| `database.ts` | 数据库类型 |
| `sharp.d.ts` | Sharp 类型声明 |
| `sql-modules.d.ts` | SQL 模块类型声明 |

---

## 10. 测试代码

### 10.1 E2E 测试 (`tests/`)

| 文件 | 说明 |
|------|------|
| `smoke.spec.ts` | 冒烟测试 |
| `full-creation-workflow.spec.ts` | 完整创建工作流测试 |
| `story-workflow.spec.ts` | 故事工作流测试 |
| `character-scene-crud.spec.ts` | 角色/场景 CRUD 测试 |
| `database-storage.spec.ts` | 数据库存储测试 |
| `navigation-guard.spec.ts` | 导航守卫测试 |
| `video-generation.spec.ts` | 视频生成测试 |
| `sync-workflow.spec.ts` | 同步工作流测试 |
| `plugin-management.spec.ts` | 插件管理测试 |
| `asset-library-workflow.spec.ts` | 资产库工作流测试 |
| `api-config-workflow.spec.ts` | API 配置工作流测试 |
| `story-delete-confirmation.spec.ts` | 故事删除确认测试 |
| `settings-config.spec.ts` | 设置配置测试 |
| `electron-integration.spec.ts` | Electron 集成测试 |
| `electron-pages.spec.ts` | Electron 页面测试 |
| `debug-test.ts` | 调试测试工具 |

**Electron E2E 测试** (`tests/electron/`):

| 文件 | 说明 |
|------|------|
| `smoke.spec.ts` | Electron 冒烟测试 |
| `database-storage.spec.ts` | 数据库存储测试 |
| `character-scene-crud.spec.ts` | 角色/场景 CRUD 测试 |
| `story-workflow.spec.ts` | 故事工作流测试 |
| `video-generation.spec.ts` | 视频生成测试 |
| `settings-config.spec.ts` | 设置配置测试 |

**测试辅助** (`tests/helpers/`):

| 文件 | 说明 |
|------|------|
| `page-helpers.ts` | 页面辅助工具 |
| `electron-mock.ts` | Electron 模拟 |
| `mock-api.ts` | API 模拟 |
| `electron-page-helpers.ts` | Electron 页面辅助 |
| `electron-fixture.ts` | Electron 测试夹具 |

### 10.2 单元测试分布

单元测试分布在各源码目录的 `__tests__/` 子目录中，主要覆盖：

- `src/domain/` — Schema 验证、领域服务、工具函数测试
- `src/shared/` — 错误处理、事件总线、工具函数、Hooks 测试
- `src/infrastructure/` — 存储、AI 提供商、网络、DI 容器测试
- `src/modules/` — 各模块的服务、Hooks、组件测试
- `electron/src/` — 主进程插件、API、数据库、安全模块测试

---

## 11. 配置文件

| 文件 | 说明 |
|------|------|
| `package.json` | 项目配置：依赖、脚本、electron-builder 配置 |
| `vite.config.ts` | Vite 构建配置：路径别名、代码分割分组 |
| `tsconfig.json` | TypeScript 配置：严格模式、路径别名 |
| `eslint.config.mjs` | ESLint 配置：DDD 分层规则、禁止导入模式、no-direct-db-ipc 自定义规则 |
| `electron/tsconfig.json` | Electron 主进程 TypeScript 配置 |
| `tsconfig.test.json` | 测试 TypeScript 配置 |
| `vitest.config.ts` | Vitest 单元测试配置 |
| `vitest.config.electron.ts` | Electron 测试 Vitest 配置 |
| `playwright.config.ts` | Playwright E2E 测试配置 |
| `playwright.electron.config.ts` | Electron E2E 测试配置 |
| `build-electron.ps1` | Electron 构建脚本 |

### 11.1 NPM Scripts

| 脚本 | 说明 |
|------|------|
| `dev` | 启动开发服务器 |
| `build` | Vite 构建 |
| `build:electron` | Electron 构建 |
| `build:win/mac/linux` | 平台打包 |
| `typecheck` | 渲染进程类型检查 |
| `typecheck:electron` | 主进程类型检查 |
| `lint` | ESLint 检查 |
| `lint:electron` | 主进程 ESLint 检查 |
| `lint:arch` | 架构合规检查 |
| `test` | 运行单元测试 |
| `test:watch` | 监听模式测试 |
| `test:coverage` | 测试覆盖率 |
| `test:e2e` | Playwright E2E 测试 |
| `validate` | 完整验证（typecheck + lint + arch + test） |

### 11.2 路径别名

| 别名 | 路径 | 用途 |
|------|------|------|
| `@/*` | `./src/*` | 渲染进程源码 |
| `@shared-logic/*` | `./src/shared-logic/*` | 共享逻辑层（渲染进程） |
| `@shared-logic/*` | (主进程) | 共享逻辑层（主进程） |

### 11.3 代码分割分组

| 分组 | 匹配规则 | 优先级 |
|------|---------|--------|
| `vendor-react` | react, react-dom, react-router | 30 |
| `vendor-state` | zustand, @tanstack | 25 |
| `vendor-ui` | lucide-react, clsx, tailwind-merge, cva | 25 |
| `vendor-misc` | 其他 node_modules | 10 |
| `app-infra-core` | src/infrastructure/ | 20 |
| `app-shared` | src/shared/ | 18 |
| `app-domain` | src/domain/ | 18 |
| `app-story/video/shot/character/scene/prompt` | 各模块 | 15 |
| `app-infra` | asset, sync, persistence 模块 | 15 |
| `common` | 共享代码（minShareCount=2） | 5 |

---

## 12. 构建与校验脚本 (`scripts/`)

| 文件 | 说明 |
|------|------|
| `check-architecture.mjs` | DDD 分层架构合规检查 |
| `check-module-api-consistency.mjs` | 模块 API 与 MODULE.md 一致性检查 |
| `validate-contracts.mjs` | 模块契约验证 |
| `check-native-modules.mjs` | 原生模块兼容性检查 |
| `build-module-graph.ts` | 模块依赖图生成 |
| `dependency-graph.ts` | 依赖关系图生成 |
| `generate-di-docs.ts` | DI 容器文档生成 |
| `generate-changelog.ts` | 变更日志生成 |
| `ai-context-boundary.ts` | AI 上下文边界分析 |
| `guard-module-size.ts` | 模块大小守卫 |
| `perf-regression.ts` | 性能回归检测 |
| `electron-build-win.js` | Electron Windows 构建脚本 |
| `api-routes-manager.js` | API 路由管理工具 |
| `copy-static-resources.js` | 静态资源复制 |
| `clean-before-build.js` | 构建前清理 |
| `count-code.ps1` | 代码行数统计 |
| `smoke-test.ps1` | 冒烟测试脚本 |
| `clean-user-data.js` | 用户数据清理 |
| `migrate-single-imports.js` | 单导入迁移 |
| `migrate-components.js` | 组件迁移 |
| `migrate-hooks.js` | Hooks 迁移 |
| `migrate-services.js` | 服务迁移 |
| `migrate-files.js` | 文件迁移 |
| `cleanup-lib.js` | lib 目录清理 |
| `validate-contracts.ts` | 契约验证（TypeScript 版） |
| `video-test-tool/cli.ts` | 视频测试工具 CLI |
| `video-test-tool/video-tester.ts` | 视频测试器 |
| `video-test-tool/types.ts` | 视频测试类型 |
| `test-config/cli.ts` | 测试配置 CLI |
| `test-config/config-manager.ts` | 测试配置管理 |
| `test-config/types.ts` | 测试配置类型 |

## 13. AI 工具集成文件 (`.ai/`)

| 文件 | 说明 |
|------|------|
| `README.md` | AI 工具集成说明 |
| `session-notes.md` | 会话记录（追加式） |
| `work-claims.md` | 工作声明（防会话冲突） |
| `context-snapshot.mjs` | 上下文快照脚本 |
| `symbol-index.md` | 符号索引 |
| `modules/asset.md` | asset 模块 AI 上下文 |
| `modules/character.md` | character 模块 AI 上下文 |
| `modules/scene.md` | scene 模块 AI 上下文 |
| `modules/shot.md` | shot 模块 AI 上下文 |
| `modules/story.md` | story 模块 AI 上下文 |
| `modules/persistence.md` | persistence 模块 AI 上下文 |
| `modules/prompt.md` | prompt 模块 AI 上下文 |
| `modules/sync.md` | sync 模块 AI 上下文 |
| `modules/video.md` | video 模块 AI 上下文 |
