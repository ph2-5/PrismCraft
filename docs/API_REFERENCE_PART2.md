# API 参考手册 — 第二部分：模块层

> 自动生成于 2026-07-23。基于 `src/modules/` 实际代码扫描。
> 模块总数：**42 个**（核心业务 25 / 基础设施 4 / 工具 13）
> 模块间引用请使用桶导出路径 `@/modules/xxx`，禁止使用深层路径 `@/modules/xxx/hooks/yyy`。
> 每个模块的导出名直接取自其 `index.ts`，未在源码中导出的成员不属于公共 API。

---

## 目录

- [模块分类总览](#模块分类总览)
- [1. 核心业务模块（25 个）](#1-核心业务模块25-个)
  - [1.1 agent](#11-agent)
  - [1.2 agent-memory](#12-agent-memory)
  - [1.3 agent-session](#13-agent-session)
  - [1.4 agent-specialist](#14-agent-specialist)
  - [1.5 agent-fewshot](#15-agent-fewshot)
  - [1.6 asset](#16-asset)
  - [1.7 asset-library](#17-asset-library)
  - [1.8 audit-log](#18-audit-log)
  - [1.9 blockout-3d](#19-blockout-3d)
  - [1.10 character](#110-character)
  - [1.11 characters](#111-characters)
  - [1.12 compositor](#112-compositor)
  - [1.13 novel](#113-novel)
  - [1.14 prompt](#114-prompt)
  - [1.15 quick-generate](#115-quick-generate)
  - [1.16 scene](#116-scene)
  - [1.17 scenes](#117-scenes)
  - [1.18 search](#118-search)
  - [1.19 settings](#119-settings)
  - [1.20 shot](#120-shot)
  - [1.21 storyboard](#121-storyboard)
  - [1.22 timeline](#122-timeline)
  - [1.23 video](#123-video)
  - [1.24 video-compose](#124-video-compose)
  - [1.25 video-tasks](#125-video-tasks)
- [2. 基础设施模块（4 个）](#2-基础设施模块4-个)
  - [2.1 persistence](#21-persistence)
  - [2.2 sync](#22-sync)
  - [2.3 vector-search](#23-vector-search)
  - [2.4 ffmpeg-runner](#24-ffmpeg-runner)
- [3. 工具模块（13 个）](#3-工具模块13-个)
- [统计与验证](#统计与验证)

---

## 模块分类总览

模块按功能职责分为三大类（依据各模块 `MODULE.md` 契约与 `index.ts` 公共 API 的实际职责）：

| 类别 | 数量 | 职责 |
|------|------|------|
| 核心业务模块 | 25 | 承载 PrismCraft 创作流程：智能体编排、资产管理、角色/场景/分镜/视频生成、小说导入、镜头编辑、合成与时间线 |
| 基础设施模块 | 4 | 为业务模块提供横切能力：持久化、同步、向量检索、ffmpeg 执行 |
| 工具模块 | 13 | 由 `agent` 拆分出的工具子集，按业务领域归类，供 `toolRegistry` / `toolExecutor` 调度 |

---

## 1. 核心业务模块（25 个）

### 1.1 agent

> 路径：`src/modules/agent/`
> 职责：智能体主入口，统一编排会话、工具执行、专家调度、记忆服务
> 子域：`tools/`（工具聚合）
> 依赖：`agent-memory`、`agent-session`、`agent-specialist`、`agent-fewshot`、全部 `agent-tools-*`（经 DI container 异步获取）

#### 页面组件

- `AgentPage` — 智能体主页面
- `AgentSettingsPage` — Agent 设置独立页面（路由 `/agent/settings`）

#### 核心服务

- `toolRegistry` — 工具注册表
- `toolExecutor` — 工具执行器
- `conversationManager` — 会话管理器
- `memoryService`、`MemoryService`、`prewarmEmbeddings` — 记忆服务（re-export 自 `@/modules/agent-memory`）
- `runSpecialist` — 运行专家 Agent
- `listAvailableSpecialists` — 列出可用专家
- `listSessions` — 列出会话（re-export 自 `@/modules/agent-session`）
- `createEmptySession`、`generateMessageId` — 工厂函数

#### 类型导出

- `UseAgentReturn`、`AgentSettings`、`AgentPersona`
- `AgentSession`、`AgentMessage`、`AgentRole`
- `ToolImpl`、`ToolResult`、`ToolContext`、`ToolDomain`、`ToolExecution`、`ToolExecutionStatus`
- `AgentLoopConfig`、`AgentLoopCallbacks`、`ContextBudget`
- `CoreMemory`、`MemoryFact`、`ArchivalMemoryEntry`、`ExtractedMemory`
- `SessionListItem`、`SessionCheckpoint`、`CheckpointStatus`、`CheckpointIndexEntry`
- `IConversationManager`、`IToolRegistry`、`IToolExecutor`、`IMemoryService`、`AgentLoopDeps`
- `SpecialistAgent`
- `ToolPluginConfig`、`ToolPluginTool`、`ToolPluginAction`、`HttpCallAction`、`BuiltinMirrorAction`、`TextTemplateAction`、`ToolPluginLoadResult`、`ToolPluginsConfig`

---

### 1.2 agent-memory

> 路径：`src/modules/agent-memory/`
> 职责：三层记忆架构（core/archival/working）核心实现
> 依赖：无跨模块依赖（向量检索委托 `@/modules/vector-search`）

#### 服务

- `memoryService` / `MemoryService` — 记忆服务单例与类
- 核心记忆：`getCoreMemory`、`saveCoreMemory`、`updatePreference`、`saveFact`、`removeFact`、`removePreference`、`clearCoreMemory`、`buildCoreMemoryPrompt`、`shouldExtract`、`getCoreMemorySize`
- 归档记忆：`getAllArchivalMemory`、`addArchivalMemory`、`searchArchivalMemory`、`deleteArchivalMemory`、`getArchivalMemoryCount`
- 种子记忆：`ensureSeedMemory`、`getSeedMemoryStats`、`resetSeedMemoryFlag`
- 嵌入预热：`prewarmEmbeddings`、`searchRelevantMemory`
- 抽取与摘要：`extractFromConversation`、`applyExtractedMemory`、`summarizeConversation`
- 测试辅助：`_setSearchEngine`、`_resetSearchEngine`、`_getTestEmbeddingStore`、`_resetAllMemory`

#### 类型导出

- `CoreMemory`、`MemoryFact`、`ExtractedMemory`、`ArchivalMemoryEntry`

---

### 1.3 agent-session

> 路径：`src/modules/agent-session/`
> 职责：智能体会话持久化与检查点服务（从 `agent` 拆分而来，阶段 2-b）
> 依赖：类型依赖 `@/modules/agent`（仅类型），运行时依赖 `@/shared/file-http`

#### 会话存储服务

- `saveSession`、`loadSession`、`listSessions`、`updateSessionIndex`、`deleteSession`、`persistSession`

#### 会话搜索与导出服务

- `searchSessionList`、`searchInSession`、`searchAcrossSessions`
- `serializeSessionAsJSON`、`serializeSessionAsMarkdown`、`buildExportFilename`

#### 检查点服务

- `saveCheckpoint`、`initCheckpoint`、`clearCheckpoint`
- `markInterrupted`、`markRunningAsInterrupted`
- `listInterruptedSessions`、`listRunningSessions`
- `getCheckpoint`、`loadInterruptedSession`
- `_resetCheckpointIndex`（测试辅助）
- `createCheckpoint`（工厂函数）

#### 类型导出

- `SessionListItem`
- `MessageSearchMatch`、`SessionSearchResult`、`ExportFormat`
- `SessionCheckpoint`、`CheckpointIndexEntry`、`CheckpointStatus`

---

### 1.4 agent-specialist

> 路径：`src/modules/agent-specialist/`
> 职责：专家注册表与内置专家定义
> 依赖：无跨模块依赖

#### 服务

- `specialistRegistry` — 专家注册表单例
- `SpecialistRegistry` — 注册表类

#### 常量与类型

- `BUILTIN_SPECIALISTS` — 内置专家集合
- `SpecialistAgent` — 专家类型

---

### 1.5 agent-fewshot

> 路径：`src/modules/agent-fewshot/`
> 职责：Few-shot 示例库与提示构建
> 依赖：无跨模块依赖
> 消费者：`@/modules/agent/services/agent-loop.ts`

#### 运行时缓存服务

- `recordFewShot`、`getFewShots`、`getRelevantFewShots`、`buildFewShotPrompt`、`clearFewShotCache`、`getFewShotStats`

#### 内置示例库

- `BUILTIN_FEWSHOT_EXAMPLES`
- `getBuiltinFewShotExamples`、`getBuiltinFewShotsByTool`、`getRelevantBuiltinFewShots`、`getBuiltinFewShotStats`

#### 类型导出

- `FewShotEntry`

---

### 1.6 asset

> 路径：`src/modules/asset/`
> 职责：资产总库，统一管理角色/场景/媒体/道具/集合/导入导出/编辑/生成资产
> 子域（8 个）：`import-export/`、`props/`、`generation-assets/`、`editor/`、`asset-library/`、`presentation/`、`media-assets/`、`hooks/`
> 依赖：无跨模块依赖（基础领域模块）

#### 服务

- `mediaAssetService` — 媒体资产服务
- `characterService`、`sceneService`、`storyboardAssetService`、`collectionService` — 资产库服务（re-export 自 `./asset-library`）
- `assetExportService` — 资产导出服务

#### 生成资产（generation_assets 表）

- 查询：`listAssetsByType`、`listAssetsByProject`、`listAssetsByBeat`、`getAsset`、`getReferenceInfo`
- CRUD：`createAsset`、`updateAsset`、`deleteAsset`、`deleteUnreferencedAssets`
- Hook：`useGenerationAssets`
- 组件：`AssetGallery`
- 类型：`UseGenerationAssetsResult`

#### 道具库（props 表）

- 查询：`getAllProps`、`getPropById`、`listPropsByType`、`listPropsByTag`
- CRUD：`createProp`、`updateProp`、`deleteProp`
- 迁移：`migrateOutfitsToProps`、`initializePropMigration`
- Hooks：`useProps`、`usePropsByType`、`usePropsByTag`、`useCreateProp`、`useUpdateProp`、`useDeleteProp`、`useMigrateOutfits`
- 常量：`PROP_QUERY_KEYS`

#### Hooks（资产导入导出）

- `useMediaAssets`、`useCreateMediaAsset`、`useDeleteMediaAsset`
- `useExportData`、`useDownloadExport`、`useImportData`、`useImportFromFile`、`useProjectExport`

#### 组件

- `BatchOperations`、`ProjectExportImport`（来自 `./presentation`）

#### 类型导出

- `MergeStrategy`、`ProjectData`、`ExportResult`

---

### 1.7 asset-library

> 路径：`src/modules/asset-library/`
> 职责：资产库页面型模块（路由入口）
> 依赖：`asset`

#### 页面组件

- `AssetLibraryPage`（默认导出）

---

### 1.8 audit-log

> 路径：`src/modules/audit-log/`
> 职责：审计日志记录与查询（从 `agent` 拆分而来）
> 依赖：无跨模块依赖

#### 服务

- `recordAudit` — 记录审计条目
- `queryAuditLogs` — 查询审计日志
- `clearAuditLogs` — 清除审计日志
- `clearAllAuditLogs` — 清除全部审计日志
- `getAuditStats` — 获取审计统计

#### 类型导出

- `AuditEntry`、`AuditQueryFilter`

---

### 1.9 blockout-3d

> 路径：`src/modules/blockout-3d/`
> 职责：3D 场景布局预演（Blockout）— provider-agnostic 场景图 + Three.js 渲染 + Seedance 2.5 / fallback 适配器
> 依赖：`ffmpeg-runner`

#### Domain 层（类型 + 工厂函数）

场景 schema：`Vec3`、`Vec2`、`GroundType`、`GroundPlane`、`PrimitiveType`、`PrimitiveShape`、`LightingType`、`LightingPreset`、`ShotCamera`、`BlockoutScene`
- 工厂：`createDefaultGround`、`createDefaultLighting`、`createDefaultCamera`、`createEmptyScene`

人偶类型：`PosePreset`、`PoseMetadata`、`HeightPreset`、`HeightMetadata`、`Mannequin`
- 常量与工厂：`POSE_PRESETS`、`POSE_PRESET_LIST`、`HEIGHT_PRESETS`、`HEIGHT_PRESET_LIST`、`createDefaultMannequin`、`getMannequinHeight`、`getMannequinWidth`

镜头路径：`CameraInterpolation`、`CameraKeyframe`、`CameraPath`、`CameraPathValidation`
- 常量与函数：`INTERPOLATION_TYPES`、`validateCameraPath`、`createDefaultCameraPath`、`cameraPathToKeyframes`

场景预设：`ScenePresetId`、`ScenePreset`
- 常量与函数：`SCENE_PRESETS`、`SCENE_PRESET_LIST`、`getScenePreset`、`createSceneFromPreset`

#### Services 层（纯逻辑）

相机动画：`CameraPose`、`CameraInterpolation as AnimatorInterpolation`
- 函数：`lerp`、`lerpVec3`、`distanceVec3`、`arcMidpoint`、`bezier2`、`interpolateKeyframes`、`getCameraPoseAtTime`、`sampleCameraPoses`、`sampleKeyframeThumbnails`

人偶服务：`MannequinGeometry`
- 函数：`createMannequin`、`moveMannequin`、`rotateMannequin`、`applyPose`、`applyHeight`、`toggleVisibility`、`addMannequin`、`removeMannequin`、`updateMannequin`、`findMannequin`、`getVisibleMannequins`、`getMannequinsByVariantId`、`getMannequinGeometry`

Seedance 适配器：`Seedance3DInput`、`SeedanceSceneMetadata`、`SeedanceAdapterOptions`、`SeedanceAdapterValidation`
- 函数：`adaptToSeedanceInput`、`validateForSeedance`

Fallback 适配器：`FallbackKeyframeSet`、`FallbackKeyframe`、`FallbackAdapterValidation`
- 函数：`adaptToFallbackKeyframes`、`validateForFallback`、`fillFramePaths`、`getFirstFramePath`、`getAllFramePaths`

#### Services 层（Three.js 依赖 — 动态加载）

场景构建：`BuiltScene`、`SceneBuilderOptions`、`Disposable`、`SceneStats`
- 函数：`buildScene`、`disposeScene`、`applyCameraPose`、`applyShotCamera`、`computeSceneStats`

渲染服务：`RenderOptions`、`RenderResult`、`FrameSequenceResult`、`FrameSequenceOptions`、`KeyframeSetRenderResult`
- 函数：`DEFAULT_RENDER_OPTIONS`、`renderFrame`、`renderStaticView`、`renderFrameSequence`、`renderKeyframeSet`、`writeFramesToFiles`、`isWebGLAvailable`、`isOffscreenCanvasAvailable`

Animatic 导出：`AnimaticExportOptions`、`AnimaticExportResult`、`PreviewSnapshotResult`
- 函数：`exportAnimatic`、`exportPreviewSnapshot`

场景 IO：`GlbExportOptions`、`JsonExportOptions`、`JsonImportResult`、`ExternalModelImportResult`
- 函数：`exportSceneAsGlb`、`serializeSceneToJson`、`exportSceneAsJson`、`parseSceneFromJson`、`importSceneFromJson`、`importExternalModel`、`validateBlockoutScene`

#### Presentation 层

- `Blockout3DPanel` / `Blockout3DPanelProps`
- `Blockout3DCanvas` / `Blockout3DCanvasProps`
- `SceneOutliner` / `SceneOutlinerProps`
- `PresetSelector` / `PresetSelectorProps`
- `MannequinControls` / `MannequinControlsProps`
- `CameraPathEditor` / `CameraPathEditorProps`
- `ExportPanel` / `ExportPanelProps`、`ExportedAsset`

---

### 1.10 character

> 路径：`src/modules/character/`
> 职责：角色领域，提供服务 + 变体 + 展示 + hooks
> 子域（4 个）：`variants/`、`services/`、`presentation/`、`hooks/`
> 依赖：无跨模块依赖（基础领域模块）

#### 服务

- `characterService` — 角色服务

#### 常量

- `defaultCharacter`、`personalitySuggestions`、`styleSuggestions`、`genderSuggestions`、`heightSuggestions`、`buildSuggestions`
- 类型：`StyleOption`

#### Hooks

- `useCharacterImage`、`useOutfitManagement`
- `useCharacters`、`useCharacter`、`useCharacterCount`
- `useCreateCharacter`、`useUpdateCharacter`、`useDeleteCharacter`、`useCharacterCRUD`

#### 组件

- `CharacterListItem`、`OutfitDialog`

#### 角色变体子域（Task 2A.10，替代 character_outfits）

Schemas：`characterVariantSchema`、`createCharacterVariantInputSchema`、`updateCharacterVariantInputSchema`

类型：`CharacterVariant`、`CreateCharacterVariantInput`、`UpdateCharacterVariantInput`、`VariantListProps`、`VariantFormState`

服务：`listVariantsForCharacter`、`listAllVariants`、`getVariantById`、`getDefaultVariant`、`createVariant`、`updateVariant`、`deleteVariant`、`setDefaultVariant`、`updateVariantImage`、`migrateOutfitsToVariants`、`createVariantFromCompositorAsset`、`initializeVariantMigration`

Hooks：`useCharacterVariants`、`useAllCharacterVariants`、`useVariant`、`useCreateVariant`、`useUpdateVariant`、`useDeleteVariant`、`useSetDefaultVariant`、`useMigrateOutfitsToVariants`、`VARIANT_QUERY_KEYS`

组件：`VariantList`、`VariantListContainer`、`VariantDialog`、`variantToForm`

---

### 1.11 characters

> 路径：`src/modules/characters/`
> 职责：角色页面型模块（路由入口）
> 依赖：`character`

#### 页面组件

- `CharactersPage`（默认导出）

---

### 1.12 compositor

> 路径：`src/modules/compositor/`
> 职责：图像合成器，组合角色 + 道具 + 场景 → AI 图像合成（Task 2A.9）
> 依赖：`character`、`scene`、`asset`

#### Domain schemas

- `compositorInputSchema`、`compositorResultSchema`、`composerLayerSchema`、`composerLayerTypeSchema`、`compositorPresetSchema`、`compositorStatusSchema`

#### 类型导出

- `CompositorInput`、`CompositorResult`、`ComposerLayer`、`ComposerLayerType`、`CompositorPreset`、`CompositorStatus`

#### 服务

- `composeImage` — 图像合成主函数
- `buildCompositorPrompt` — 构建合成提示词
- `getCompositorErrorMessage` — 获取错误消息

#### Hooks

- `useCompositor` / `UseCompositorResult`

#### 组件

- `CompositorPanel`

---

### 1.13 novel

> 路径：`src/modules/novel/`
> 职责：小说导入流水线（10 阶段状态机）+ 结构/节奏/连续性分析
> 子域（6 个）：`tools/`、`workflow/`、`continuity/`、`integration/`、`pacing/`、`structure/`
> 依赖：无跨模块依赖（流水线自包含；match-entities 通过动态 import 调用 characterService/sceneService）

#### Domain 类型

- `NovelSegment`、`ExtractedCharacter`、`ExtractedScene`、`ShotBreakdown`
- `PipelineStage`、`PipelineConfig`、`Segment`
- `CharacterVariant`、`CharacterInPipeline`、`SceneVariant`、`SceneInPipeline`
- `SegmentPrompt`、`GenerationResult`、`PipelineState`、`NovelProject`

#### Tools（5 个 Novel Agent 工具）

- `segmentNovelTextTool`、`extractCharactersFromTextTool`、`extractScenesFromTextTool`、`matchEntitiesTool`、`breakdownTextToShotsTool`
- 聚合：`novelTools`

#### Pipeline 状态机

- 常量：`STAGE_ORDER`、`VALID_TRANSITIONS`、`FALLBACK_STRATEGIES`
- 函数：`canTransition`、`transition`、`getAutoGates`、`shouldPauseAtStage`、`getStagesForMode`、`retryStage`、`getRetryableStages`

#### Hooks

- `useNovelPipeline` / `UseNovelPipelineOptions` / `UseNovelPipelineResult`

#### Presentation 组件

UI Panel Part 1（导入 + 分段）：
- `ImportStep` / `ImportStepProps`
- `SegmentList` / `SegmentListProps`
- `SegmentCard` / `SegmentCardProps`
- `PipelineProgress` / `PipelineProgressProps`
- `PipelineControls` / `PipelineControlsProps`

UI Panel Part 2（提取 + 拆解 + 提示词）：
- `EntityReviewPanel` / `EntityReviewPanelProps`
- `CharacterExtractCard` / `CharacterExtractCardProps`
- `SceneExtractCard` / `SceneExtractCardProps`
- `ShotBreakdownList` / `ShotBreakdownListProps`
- `ShotCard` / `ShotCardProps`
- `FinalizePanel` / `FinalizePanelProps` / `FinalizeSummary`

StoryPipelineShell 三栏布局：
- `StoryPipelineShell` / `StoryPipelineShellProps`
- `PhaseIndicator` / `PhaseIndicatorProps`
- `SegmentNavColumn` / `SegmentNavColumnProps`
- `MainWorkArea` / `MainWorkAreaProps`
- `ContextPanel` / `ContextPanelProps`

未完成项目恢复：
- `NovelProjectList` / `NovelProjectListProps`

原始小说回溯对话框：
- `NovelSourceDialog` / `NovelSourceDialogProps` / `NovelSourceDialogData`

故事结构分析面板：
- `StructureAnalysisPanel` / `StructureAnalysisPanelProps`
- `ShotContractPanel` / `ShotContractPanelProps`

Structure 子域：通过 `export * from "./structure"` 桶导出（叙事 beats + Treatment + ShotContract）

---

### 1.14 prompt

> 路径：`src/modules/prompt/`
> 职责：提示词引擎，覆盖角色/场景/视频/节拍图/配方/模板
> 子域（10 个）：`prompt-recipes/`、`templates/`、`presentation/`、`video/`、`server-prompts/`、`scene/`、`character/`、`builder/`、`beat-image/`、`base/`
> 依赖：无跨模块依赖（纯逻辑模块）

#### Base 基础提示词

- 常量：`QUALITY_TAGS_IMAGE`、`QUALITY_TAGS_VIDEO`、`STYLE_KEYWORDS`、`SCENE_TYPE_KEYWORDS`、`MOOD_KEYWORDS`、`LIGHTING_KEYWORDS`、`CAMERA_ANGLE_KEYWORDS`、`CAMERA_MOVEMENT_KEYWORDS`
- 函数：`joinParts`、`buildCharacterFullDesc`、`buildSceneAtmosphereDesc`、`buildSceneVisualDesc`

#### 角色提示词

- `generateCharacterImagePrompt`、`generateCharacterDetailedPromptInstruction`、`generateSimpleCharacterImagePrompt`

#### 场景提示词

- `generateSceneImagePrompt`、`generateSimpleSceneImagePrompt`、`generateScenePromptOptimization`

#### 节拍图提示词

- `generateBeatImagePrompt`、`generateSimpleBeatImagePrompt`

#### 视频提示词

- `generateProfessionalVideoPrompt`、`generateEnhancedVideoPrompt`、`generateQuickVideoPrompt`、`generateSingleBeatPrompt`

#### 服务端提示词

- `generateFirstFramePrompt`、`generateLastFramePrompt`、`generateKeyframePrompt`
- `generateCharacterAnalysisPrompt`、`generateSceneAnalysisPrompt`

#### Builder 提示词构建器

- `PromptBuilder`、`promptBuilder`
- `generateStoryPlanPrompt`、`generateQuickModeVideoPrompt`
- `AVAILABLE_STYLES`、`getDurationOptions`、`getResolutionOptions`
- `getDurationOptionsForModel`、`getResolutionOptionsForModel`、`getStyleOptionsForModel`

#### Presentation

- `ModelSelector`、`useModelSelection`、`ModelSelection`

#### Prompt 配方库（Task 4.7，Skill 调用模式）

- 函数：`getRecipe`、`listRecipes`、`applyRecipe`、`getRecipeSkillIds`、`registerCustomRecipe`、`unregisterCustomRecipe`
- 组件：`PromptRecipePanel`
- 类型：`RecipeId`、`SkillCombination`、`RecipeSkillParams`、`Recipe`、`PromptRecipePanelProps`

#### 提示词模板库

类型：`PromptTemplateCategory`、`PromptTemplateTarget`、`PromptTemplateVariable`、`PromptTemplate`、`CreatePromptTemplateInput`、`ApplyTemplateResult`、`NegativePromptConfig`、`NegativePromptScene`、`OptimizedPromptResult`

常量：`CATEGORY_LABELS`、`TARGET_LABELS`、`BUILTIN_TEMPLATES`

模板管理函数：`initTemplates`、`listPromptTemplates`、`searchPromptTemplates`、`getPromptTemplate`、`createPromptTemplate`、`updatePromptTemplate`、`deletePromptTemplate`、`applyPromptTemplate`、`exportPromptTemplates`、`importPromptTemplates`、`getPromptTemplateStats`

负面提示词：`getNegativePrompt`、`enhanceNegativePromptWithLLM`、`getNegativePromptConfig`、`saveNegativePromptConfig`、`getSmartNegativePrompt`

LLM 自动优化：`optimizeCharacterPrompt`、`optimizeVideoPrompt`、`optimizePrompt`、`getCharacterStyles`、`getVideoStyles`

---

### 1.15 quick-generate

> 路径：`src/modules/quick-generate/`
> 职责：快速生成页面型模块（图/视频一键生成）
> 依赖：`video`、`prompt`、`character`、`scene`、`asset`

#### 页面组件

- `QuickGeneratePage`（默认导出）

---

### 1.16 scene

> 路径：`src/modules/scene/`
> 职责：场景领域，提供服务 + 变体 + 展示 + hooks
> 子域（4 个）：`variants/`、`services/`、`presentation/`、`hooks/`
> 依赖：无跨模块依赖（基础领域模块）

#### 服务

- `sceneService` — 场景服务

#### 常量

- `defaultScene`、`typeSuggestions`、`timeSuggestions`、`weatherSuggestions`、`moodSuggestions`、`elementSuggestions`、`colorSuggestions`、`angleSuggestions`、`distanceSuggestions`、`movementSuggestions`

#### Hooks

- `useSceneImage`
- `useScenes`、`useScene`、`useSceneCount`
- `useCreateScene`、`useUpdateScene`、`useDeleteScene`、`useSceneCRUD`

#### 组件

- `SceneListItem`

#### 场景变体子域（Q3-1）

Schemas：`sceneVariantSchema`、`createSceneVariantInputSchema`、`updateSceneVariantInputSchema`

类型：`SceneVariant`、`CreateSceneVariantInput`、`UpdateSceneVariantInput`、`SceneVariantListProps`、`SceneVariantFormState`

服务：`listVariantsForScene`、`listAllVariants`、`getVariantById`、`getDefaultVariant`、`createSceneVariant`、`updateSceneVariant`、`deleteSceneVariant`、`setDefaultSceneVariant`、`updateSceneVariantImage`

Hooks：`useSceneVariants`、`useAllSceneVariants`、`useSceneVariant`、`useCreateSceneVariant`、`useUpdateSceneVariant`、`useDeleteSceneVariant`、`useSetDefaultSceneVariant`、`SCENE_VARIANT_QUERY_KEYS`

组件：`SceneVariantList`、`SceneVariantListContainer`、`SceneVariantDialog`、`sceneVariantToForm`

---

### 1.17 scenes

> 路径：`src/modules/scenes/`
> 职责：场景页面型模块（路由入口）
> 依赖：`scene`

#### 页面组件

- `ScenesPage`（默认导出）

---

### 1.18 search

> 路径：`src/modules/search/`
> 职责：全局搜索与快速搜索
> 依赖：`vector-search`

#### 搜索服务

- `globalSearch` — 全局搜索
- `quickSearch` — 快速搜索
- `getSearchResultRoute` — 获取搜索结果路由

#### 类型导出

- `GlobalSearchOptions`、`GlobalSearchResult`、`SearchableType`

#### UI 组件

- `SearchBar` — 搜索栏组件

---

### 1.19 settings

> 路径：`src/modules/settings/`
> 职责：设置页面型模块（路由入口）
> 依赖：无跨模块依赖

#### 页面组件

- `SettingsPage`（默认导出）

---

### 1.20 shot

> 路径：`src/modules/shot/`
> 职责：镜头领域，覆盖一致性检查/元素绑定/特征提取/生成/编辑/比较/参考
> 子域（10 个）：`consistency-check/`、`sub-shot/`、`shot-comparison/`、`shot-generation/`、`shot-instruction/`、`shot-editor/`、`element-binding/`、`shot-reference/`、`reference-check/`、`feature-extraction/`
> 依赖：无跨模块依赖（基础领域模块）

#### 一致性检查

- `performConsistencyCheck`、`performConfigCheck`、`checkVisualConsistency`、`parseConsistencyAnalysisFromStructured`
- `validateFeatureAnchoringConfig`、`validateNoFrameBinding`
- 类型：`ConsistencyCheckInput`

#### 元素引用检查（character / scene 模块删除前校验）

- `checkCharacterReferences`、`checkSceneReferences`、`checkElementReferences`
- 类型：`ReferenceInfo`、`DeleteCheckResult`

#### 分镜指令常量

- `SHOT_SIZE_OPTIONS`、`CAMERA_MOVEMENT_OPTIONS`、`CAMERA_ANGLE_OPTIONS`、`buildPromptLayers`

#### 镜头推荐（Task 2B.12）

- `recommendShotBySceneVariant`、`recommendationToShotInstruction`、`recommendShotInstruction`、`getRecommendationLabels`
- 类型：`ShotRecommendation`、`SceneVariantInput`

#### 元素管理

- `elementManager` — 元素管理器

#### 特征锚定

- `validateReferenceImageQuality`、`buildFeatureAnchoringConfig`、`extractCharacterFeatures`、`buildFeatureTags`、`buildFeatureAnchor`
- 类型：`FeatureLanguage`

#### 引用引擎

- `referenceEngine` — 引用引擎

#### 分镜生成与校验

- `validateShotParams`、`validateStoryBeatOutput`、`validateStoryPlanOutput`、`generateFallbackParams`、`formatValidationResult`、`generateStoryPlanWithValidation`
- 类型：`ValidationResult`、`ShotParamsType`

#### 分镜编辑器布局组件（Task 2B.11）

- `ShotEditorLayout`、`PromptEditorColumn`、`ElementBindingColumn`、`PreviewColumn`、`ShotTimeline`

#### 分镜对比视图（Task 4.4）

- `ShotCompareView`、`ComparePanel`、`diffText`、`countDifferences`
- 类型：`ShotVersion`、`ShotVersionType`、`ShotVersionParameters`、`DiffLine`、`ShotCompareViewProps`、`ComparePanelProps`

#### 单分镜多镜头 SubShot（Task 4.10）

服务：`listSubShots`、`createSubShot`、`updateSubShot`、`deleteSubShot`、`deleteSubShotsByBeatId`、`moveSubShot`、`reorderSubShots`
Hook：`useSubShots` / `UseSubShotsResult`
组件：`SubShotList`

---

### 1.21 storyboard

> 路径：`src/modules/storyboard/`
> 职责：分镜，提供规划/生成/节拍编辑/提示词编辑/模板
> 子域（5 个）：`planning/`、`template/`、`beat-editor/`、`prompt-editor/`、`generation/`
> 依赖：`novel`、`shot`、`video`

#### Planning 子域

服务：`storyService`、`planStory`
Hooks：`useStoryPlanner`、`useStories`、`useStory`、`useStoryCount`、`useSearchStories`、`useCreateStory`、`useUpdateStory`、`useDeleteStory`、`useUpdateStoryStatus`、`useStoriesByStatus`、`useDuplicateStory`、`useStoryNovelSource`、`useStorySaver`
常量：`NOVEL_SOURCE_QUERY_KEY`、`DEFAULT_STORY`、`genres`、`tones`、`beatTypes`
类型：`CreationMode`、`NovelSource`、`StoryWithNovelSource`、`StorySearchOptions`

引用解析（re-export 自 `@/domain/services/reference-resolver`）：
- `resolveCharacterRef`、`resolveCharacterRefs`、`resolveSceneRef`

#### Generation 子域

Hooks：`useAIGeneratorBase`、`useKeyframeGenerator`、`useFramePairGenerator`、`useVideoGenerator`、`useBatchGenerator`、`useUploadHandlers`
组件：`KeyframePanel`、`PromptPreview`、`ShotReferenceConfig`、`ReferenceVideoUploader`
函数：`generateBeatKeyframe`、`generateBeatFramePair`、`generateBeatVideo`、`generateBeatFullWorkflow`、`generateKeyframeChain`、`determineVideoGenerationMode`、`generateFramePrompts`、`batchGenerateFramePrompts`、`generateStyleGuide`
类型：`AIGeneratorBaseProps`、`ResolvedRefs`、`VideoGenerationMode`、`BatchOptions`、`BatchResult`
枚举：`BatchStrategy`、`GenerationLevel`

#### Beat Editor 子域

- `useStoryState`、`useAssetLoader`
- `BeatDetailEditor`、`BeatOverviewCard`、`SortableBeatList`、`ElementBindingPanel`、`ProfessionalModeEditor`

#### Template 子域

组件：`TemplateManagerDialog`、`VersionDialog`、`AssetPicker`
类型：`StoryboardTemplate`、`StoryboardTemplateBeat`、`StoryVersion`、`StoryTemplate`
模板函数：`createTemplateFromBeats`、`applyTemplateToBeats`、`exportTemplateToFile`、`importTemplateFromFile`、`getRecommendedTemplates`、`applyTemplate`
保存模板：`getAllSavedTemplates`、`saveSavedTemplate`、`deleteSavedTemplate`、`updateSavedTemplate`、`getSavedTemplateById`、`deleteAllSavedTemplates`
Hooks：`useSavedTemplates`、`useCreateSavedTemplate`、`useDeleteSavedTemplate`、`SAVED_TEMPLATE_QUERY_KEYS`
版本管理：`restoreVersion`、`formatVersionTime`、`saveVersion`、`getVersions`、`deleteVersion`、`cleanupVersions`、`getVersionStats`

#### Prompt Editor 子域

- `generatePromptWithAI`、`buildDefaultPrompt`
- `usePromptEditor`、`PromptEditor`、`PromptFloatingBall`
- 类型：`PromptEditorContext`、`PromptEditorRequest`、`PromptEditorResult`

---

### 1.22 timeline

> 路径：`src/modules/timeline/`
> 职责：时间线编辑（8 维变体参数系统）
> 依赖：`video`、`storyboard`

#### Domain schemas & types

Schemas（re-export 自 `@/domain/schemas/timeline`）：
- `storyTimelineSchema`、`createStoryTimelineInputSchema`、`updateStoryTimelineInputSchema`
- `plotNodeSchema`、`createPlotNodeInputSchema`、`updatePlotNodeInputSchema`
- `plotEventTypeSchema`、`timelineTypeSchema`、`snapshotStrategySchema`

类型：
- `StoryTimeline`、`CreateStoryTimelineInput`、`UpdateStoryTimelineInput`
- `PlotNode`、`CreatePlotNodeInput`、`UpdatePlotNodeInput`
- `PlotEventType`、`TimelineType`、`SnapshotStrategy`

#### Hooks

- `useCascadeUpdate` / `CascadeUpdateApi`（Q3-5 / Task 4.6.3）
- `useTimelineBinding` / `TimelineBindingApi` / `UseTimelineBindingOptions`（Q3-6 / Task 4.6.4）
- `useEnhancedPrompt` / `EnhancedPromptApi` / `UseEnhancedPromptOptions`（Q3-8 / Task 4.6.6）
- `useMultiTimeline` / `MultiTimelineApi`（Q3-9 / Task 4.6.7）
- `useSnapshotWindow` / `SnapshotWindowApi` / `UseSnapshotWindowOptions`（Q3-10 / Task 4.6.8）

#### Presentation 组件

- `TimelineEditor`、`TimelineTrack`、`NodeDetailPanel`
- `StateSnapshotView`、`CharacterStateTrack`
- `BindingGraph`、`BindingCreatorDialog` / `BindingCreatorResult`
- `MultiTimelineView`（Q3-9 / Task 4.6.7）

#### 多时间线 Domain 类型

- `TimelineRelationshipType`、`CrossTimelineBindingType`、`NodeMapping`、`TimelineRelationship`、`CrossTimelineBinding`
- `MultiTimelineView as MultiTimelineViewData`、`TimelineLayerInfo`、`CrossTimelineInjectionResult as DomainCrossTimelineInjectionResult`
- 常量：`TIMELINE_RELATIONSHIP_TYPES`

---

### 1.23 video

> 路径：`src/modules/video/`
> 职责：视频任务 CQRS + 缓存 + 恢复 + 一致性 QC + 局部编辑
> 子域（6 个）：`partial-edit/`、`consistency-qc/`、`task-management/`、`cache/`、`utils/`、`recovery/`
> 依赖：`sync`

#### 任务管理（CQRS 模式）

- 类型：`VideoTask`
- Hooks：`useVideoTaskManager`、`useVideoTaskStore`、`useVideoTaskQueries`、`useVideoTaskCommands`、`useVideoTaskPolling`
- 便捷 Hooks：`useVideoTasks`、`useFailedVideoTasks`、`useRecoverVideo`、`useCleanExpiredTasks`、`useStartBackgroundRecovery`
- 追踪：`buildTrackingInfoByProviderId`
- 组件：`VideoTaskManager`、`VideoTaskManagerInitializer`、`VideoTaskManagerUI`、`TaskDiagnosticPanel`、`AgentBar`、`TaskErrorGroup`、`ProviderHealthCard`
- 类型：`DiagnoseResult`、`ProviderHealth`

#### 缓存（视频）

- `useVideoCacheStats`
- `cacheVideoBlob`、`getCachedVideoUrl`、`getVideoUrlWithCache`、`removeCachedVideo`、`cleanExpiredVideoCache`、`getCacheStats`、`revokeObjectURL`、`touchMemoryCache`、`clearMemoryCache`、`checkCachedVideo`、`getVideoFileStream`、`getCachedVideo`
- 注册：`registerCacheVideoBlobFn`

#### 缓存（图像）

- `cacheImageBlob`、`getCachedImagePath`、`getImageUrlWithCache`、`removeCachedImage`、`cleanExpiredImageCache`、`getImageCacheStats`、`recoverUncachedImages`

#### 恢复

- `recoverVideoByTaskId`、`saveVideoTask`
- 验证：`verifyVideoUrl`、`verifyMultipleVideos`
- 去重：`checkForDuplicateVideos`、`findSimilarTasks`
- 智能重试：`smartRetryEngine`、`SmartRetryEngine`、`createRetryEngine`
- 恢复信息：`getTaskRecoveryInfo`、`performIntelligentRecovery`、`checkForTokenWaste`
- 后台恢复：`getFailedTasks`、`getTaskById`、`startBackgroundRecovery`、`cleanExpiredTasks`、`getAllTaskHistory`
- 类型：`VideoVerificationResult`、`VideoVerificationDetails`、`RetryDecision`、`VideoRecoveryLog`、`VideoTaskRecoveryInfo`、`DuplicateCheckResult`、`RetryConfig`

#### Utils

- `detectVideoCodec`、`isCodecSupportedByProvider`
- `extractVideoFrames`
- `downloadJSONFile`
- 模板：`videoTemplates`、`templateCategories`、`getTemplatesByCategory`、`applyVideoTemplate`、`VideoTemplate`

#### consistency-qc & partial-edit 子域

通过 `export * from "./consistency-qc"` 与 `export * from "./partial-edit"` 桶导出（详见各子域 `index.ts`）

---

### 1.24 video-compose

> 路径：`src/modules/video-compose/`
> 职责：视频片段合成（15 种转场效果，Task 4.3）
> 依赖：`ffmpeg-runner`、`video`（经 `container.videoTaskStorage` 获取已完成任务）

#### 组件

- `VideoComposePanel`

#### 服务

- `composeVideoSegments` — 视频片段合成主函数
- `checkComposerAvailable` — 检查合成器可用性
- `pickLocalVideoFiles` — 选择本地视频文件
- `listCompletedVideoTasks` — 列出已完成视频任务
- 常量：`TRANSITION_OPTIONS`

#### 类型导出

- `VideoSegment`、`ComposeResult`、`TransitionOption`

#### Hooks

- `useVideoCompose` / `UseVideoComposeResult`

---

### 1.25 video-tasks

> 路径：`src/modules/video-tasks/`
> 职责：视频任务列表页面型模块（路由入口）
> 依赖：`video`（通过 `useVideoTaskState`/`useVideoTaskQueries` 等 hook 读取任务状态）

#### 页面组件

- `VideoTasksPage`（默认导出）

---

## 2. 基础设施模块（4 个）

### 2.1 persistence

> 路径：`src/modules/persistence/`
> 职责：自动保存 + 角色/场景引用删除保护
> 依赖：无跨模块依赖

#### Hooks

- `useAutoSave` — 自动保存 Hook

#### 服务

- `deleteCharacterWithRefs` — 事务性删除角色（含引用保护）
- `deleteSceneWithRefs` — 事务性删除场景（含引用保护）

---

### 2.2 sync

> 路径：`src/modules/sync/`
> 职责：同步引擎（SyncEngine 类）+ 设置面板
> 子域（2 个）：`engine/`、`presentation/`
> 依赖：无跨模块依赖

#### 引擎 API

- `initSyncEngine` — 初始化同步引擎
- `destroySyncEngine` — 销毁同步引擎
- `performSync` — 执行同步
- `getSyncStatus` — 获取同步状态
- `updateSyncConfig` — 更新同步配置
- `setConflictCallback` — 设置冲突回调
- `syncEngine` — 引擎单例

#### 类型导出

- `SyncEntityType`、`ChangeOperation`、`SyncChangeLogEntry`、`VectorClock`、`SyncStatus`
- `SyncConflict`、`ConflictStrategy`、`SyncConfig`、`SyncStatusInfo`、`SyncPushResult`、`SyncPullResult`、`RemoteChange`

#### 组件

- `SyncSettingsPanel` — 同步设置面板

---

### 2.3 vector-search

> 路径：`src/modules/vector-search/`
> 职责：向量检索（API > 本地 ONNX > 关键词 三策略链）
> 依赖：无跨模块依赖

#### 类型导出

- `EmbeddingStore`、`EmbeddingMeta`、`RetrievalStrategy`、`SearchProgress`、`ProgressCallback`

#### 嵌入存储

- `FileEmbeddingStore` — 文件嵌入存储类
- `createEmbeddingStore` — 创建嵌入存储

#### 检索策略

- `ApiVectorStrategy` — API 向量策略
- `LocalVectorStrategy` — 本地向量策略
- `KeywordStrategy` — 关键词策略
- `keywordSearch` — 关键词搜索函数

#### 引擎

- `VectorSearchEngine` — 向量检索引擎类
- `createDefaultEngine` — 创建默认引擎

---

### 2.4 ffmpeg-runner

> 路径：`src/modules/ffmpeg-runner/`
> 职责：ffmpeg 服务封装（probe/transcode/merge/extract-frames）
> 依赖：无跨模块依赖
> 导出方式：`export * from "./services/ffmpeg-service"`

#### 类型导出

- `FfmpegResult` — ffmpeg 操作结果类型（`{ ok: true, value } | { ok: false, error }` 模式）

#### 核心 API

- `executeFfmpeg` — 执行 ffmpeg 命令
- `checkFfmpegAvailable` — 检查 ffmpeg 可用性
- `resetFfmpegCache` — 重置可用性缓存

#### 音频操作（5 个）

- `mixAudio` — 混合音频
- `adjustAudioSpeed` — 调整音频速度
- `normalizeAudio` — 标准化音频
- `removeNoise` — 降噪
- `splitAudio` — 分割音频

#### 视频操作（8 个）

- `mergeVideos` — 合并视频
- `trimVideo` — 裁剪视频
- `addTransition` — 添加转场
- `addSubtitle` — 添加字幕
- `adjustVideoSpeed` — 调整视频速度
- `extractAudio` — 提取音频
- `replaceAudio` — 替换音频
- `generateThumbnail` — 生成缩略图

#### 一键合成

- `composeFinalVideo` — 合成最终视频

---

## 3. 工具模块（13 个）

> 所有工具模块均由 `agent` 模块拆分而来（阶段 3-2），按业务领域归类。
> 工具实现统一遵循 `ToolImpl` 类型（来自 `@/domain/types/agent-tools`）。
> 详细工具架构与调度机制请参考 `docs/agent-tools-architecture.md`。
> 每个模块导出单个工具、工具子集数组与（多数模块）`all*Tools` 聚合数组。

### 3.1 agent-tools-asset

- **路径**：`src/modules/agent-tools-asset/`
- **域**：资产管理
- **工具数**：14（5 查询 + 9 CRUD）
- **依赖**：`asset`

查询工具（5）：`listCharactersTool`、`listScenesTool`、`getCharacterTool`、`getSceneTool`、`searchAssetsTool` — 聚合为 `assetTools`
CRUD 工具（9）：`createCharacterTool`、`updateCharacterTool`、`deleteCharacterTool`、`createSceneTool`、`updateSceneTool`、`deleteSceneTool`、`tagAssetTool`、`organizeAssetsTool`、`deduplicateAssetsTool` — 聚合为 `assetCrudTools`

### 3.2 agent-tools-generation

- **路径**：`src/modules/agent-tools-generation/`
- **域**：AI 生成与图像编辑
- **工具数**：19（9 生成 + 10 图像编辑）
- **依赖**：`video`、`prompt`

生成工具（9）：`generateCharacterImageTool`、`generateSceneImageTool`、`generatePropImageTool`、`analyzeImageTool`、`generateTextTool`、`generateMusicTool`、`generateVoiceoverTool`、`textToSpeechTool`、`transcribeAudioTool` — 聚合为 `generationTools`
图像编辑工具（10）：`editImageTool`、`cropImageTool`、`mergeImagesTool`、`compositeImageTool`、`removeBackgroundTool`、`applyFilterTool`、`adjustColorsTool`、`inpaintTool`、`addTextOverlayTool`、`resizeImageTool` — 聚合为 `imageEditTools`

### 3.3 agent-tools-media

- **路径**：`src/modules/agent-tools-media/`
- **域**：音频/视频/视频后期/QC
- **工具数**：23（5 音频 + 7 视频 + 9 后期 + 2 QC）
- **依赖**：`video`、`ffmpeg-runner`

音频工具（5）：`mixAudioTool`、`adjustAudioSpeedTool`、`normalizeAudioTool`、`removeNoiseTool`、`splitAudioTool` — 聚合为 `audioTools`
视频任务工具（7）：`createVideoTaskTool`、`listVideoTasksTool`、`getVideoTaskTool`、`queryVideoStatusTool`、`cancelVideoTaskTool`、`recoverVideoTaskTool`、`batchCreateVideoTasksTool` — 聚合为 `videoTools`
视频后期工具（9）：`mergeVideosTool`、`trimVideoTool`、`addTransitionTool`、`addSubtitleTool`、`adjustVideoSpeedTool`、`extractAudioTool`、`replaceAudioTool`、`generateThumbnailTool`、`composeFinalVideoTool` — 聚合为 `videoPostTools`
QC 工具（2）：`checkVideoConsistencyTool`、`dispatchVideoFallbackTool` — 聚合为 `qcTools`

### 3.4 agent-tools-memory

- **路径**：`src/modules/agent-tools-memory/`
- **域**：记忆管理
- **工具数**：6
- **依赖**：`agent-memory`

工具：`saveMemoryTool`、`recallMemoryTool`、`getUserPreferencesTool`、`updatePreferenceTool`、`deleteMemoryTool`、`listArchivalMemoryTool` — 聚合为 `memoryTools` 与 `allMemoryTools`

### 3.5 agent-tools-meta

- **路径**：`src/modules/agent-tools-meta/`
- **域**：系统配置/诊断/监控/帮助
- **工具数**：21（6 config + 4 diagnostic + 5 monitor + 6 help）
- **依赖**：无跨模块依赖（通过 DI container 异步获取 `toolRegistry` 等）

config-tools（6）：聚合为 `configTools`（具体工具未在 index.ts 单独导出）
diagnostic-tools（4）：`diagnoseErrorTool`、`autoFixTool`、`diagnoseSystemHealthTool`、`rollbackTool` — 聚合为 `diagnosticTools`
monitor-tools（5）：`monitorTasksTool`、`notifyCompletionTool`、`getActivityLogTool`、`watchProgressTool`、`getErrorHistoryTool` — 聚合为 `monitorTools`
help-tools（6）：`explainFeatureTool`、`showTutorialTool`、`getHelpTool`、`listAvailableCommandsTool`、`suggestNextActionTool`、`getKeyboardShortcutsTool` — 聚合为 `helpTools`
聚合：`allMetaTools`

### 3.6 agent-tools-project-io

- **路径**：`src/modules/agent-tools-project-io/`
- **域**：项目导入导出
- **工具数**：4
- **依赖**：`persistence`、`asset`（动态导入）

工具：`exportProjectTool`、`importProjectTool`、`exportCharactersTool`、`exportScenesTool` — 聚合为 `projectIoTools` 与 `allProjectIoTools`

### 3.7 agent-tools-shot

- **路径**：`src/modules/agent-tools-shot/`
- **域**：分镜生成
- **工具数**：5
- **依赖**：`shot`、`video`、`storyboard`/`character`/`scene`（动态导入）

工具：`generateBeatKeyframeTool`、`generateBeatFramePairTool`、`generateBeatVideoTool`、`batchGenerateTool`、`regenerateBeatTool` — 聚合为 `shotTools` 与 `allShotTools`

### 3.8 agent-tools-specialist

- **路径**：`src/modules/agent-tools-specialist/`
- **域**：专家委派（P4 多 Agent 编排）
- **工具数**：2
- **依赖**：`agent-specialist`、`agent`（动态导入）

工具：`delegateToSpecialistTool`、`listSpecialistsTool` — 聚合为 `specialistTools` 与 `allSpecialistTools`

### 3.9 agent-tools-story

- **路径**：`src/modules/agent-tools-story/`
- **域**：故事创作
- **工具数**：13（5 CRUD + 2 planning + 3 generation + 3 suggestions）
- **依赖**：`storyboard`、`novel`

CRUD（5）：`listStoriesTool`、`getStoryTool`、`createStoryTool`、`updateStoryTool`、`deleteStoryTool`
planning（2）：`planStoryTool`、`validateStoryPlanTool`
generation（3）：`generateStyleGuideTool`、`generateFramePromptsTool`、`generateStoryIdeasTool`
suggestions（3）：`suggestCharacterBackstoryTool`、`suggestSceneDescriptionTool`、`checkStoryConsistencyTool`
聚合：`storyTools`

### 3.10 agent-tools-system

- **路径**：`src/modules/agent-tools-system/`
- **域**：系统/项目信息
- **工具数**：3
- **依赖**：无跨模块依赖（通过 DI container 与动态 import 访问服务）

工具：`getProjectStatsTool`、`getAppInfoTool`、`getDiskUsageTool` — 聚合为 `systemTools` 与 `allSystemTools`

### 3.11 agent-tools-template

- **路径**：`src/modules/agent-tools-template/`
- **域**：项目模板 + Prompt 模板
- **工具数**：9（5 项目模板 + 4 Prompt 模板）
- **依赖**：`storyboard/template`、`character`/`scene`（动态导入）

项目模板工具（5）：`listTemplatesTool`、`applyTemplateTool`、`createTemplateTool`、`importTemplateTool`、`exportTemplateTool` — 聚合为 `templateTools`
Prompt 模板工具（4）：聚合为 `promptTemplateTools`（具体工具未在 index.ts 单独导出）
聚合：`allTemplateTools`

### 3.12 agent-tools-web-file

- **路径**：`src/modules/agent-tools-web-file/`
- **域**：浏览器/网络 + 文件管理
- **工具数**：14（8 web + 6 文件管理）
- **依赖**：`@/shared/file-http`

Web 工具（8）：`searchWebImagesTool`、`searchWebTool`、`downloadWebAssetTool`、`importFromUrlTool`、`fetchWebContentTool`、`openInBrowserTool`、`bookmarkResourceTool`、`listBookmarksTool` — 聚合为 `webTools`
文件管理工具（6）：`listFilesTool`、`getFileInfoTool`、`deleteFileTool`、`copyFileTool`、`moveFileTool`、`getDiskSpaceTool` — 聚合为 `fileManagementTools`

### 3.13 agent-tools-workflow

- **路径**：`src/modules/agent-tools-workflow/`
- **域**：工作流编排 + 子流程
- **工具数**：14（5 工作流 + 9 子流程）
- **依赖**：`agent`（经 DI container 异步获取 `toolExecutor`/`toolRegistry`，无静态导入）

工作流工具（5）：`createWorkflowTool`、`executeWorkflowTool`、`batchProcessTool`、`chainOperationsTool`、`scheduleTaskTool` — 聚合为 `workflowTools`
子流程工具（9）：`autoCreateCharacterTool`、`autoCreateSceneTool`、`autoPlanStoryboardTool`、`autoCreateFromNovelTool`、`autoGenerateBeatFullTool`、`autoGenerateVideoFullTool`、`autoPolishVideoTool`、`autoFindAndImportAssetTool`、`autoFixCommonErrorsTool` — 聚合为 `subworkflowTools`
子流程共享辅助：`NOVEL_TEXT_MAX_CHARS`、`generateJsonWithAI`、`generateJsonArrayWithAI`、`executeTool`、`pollVideoTask`、`toStringArray`
聚合：`allWorkflowTools`

---

## 统计与验证

| 类别 | 模块数 | 说明 |
|------|--------|------|
| 核心业务模块 | 25 | 智能体、资产、角色、场景、分镜、视频、小说、镜头、合成、时间线、页面型模块等 |
| 基础设施模块 | 4 | persistence、sync、vector-search、ffmpeg-runner |
| 工具模块 | 13 | agent-tools-* 系列（合计 147 个工具，为各模块工具数之和） |
| **合计** | **42** | 与 `src/modules/*/index.ts` 实际文件数一致 |

### 验证清单

- 模块总数：42 个（与 `src/modules/*/index.ts` 实际文件数一致）
- 每个模块的导出名均取自其 `index.ts` 源码，未在源码中导出的成员不属于公共 API
- agent-tools-* 模块的工具数取自各模块 `index.ts` 源码（合计 147 个工具，为各模块工具数之和；`docs/MODULES.md` 统计表中的 153 与其自身分项明细求和不一致，本手册以源码分项为准）
- 文档生成日期：2026-07-23
- 数据来源：实际扫描 `src/modules/*/index.ts`（含 `ffmpeg-runner/services/ffmpeg-service.ts` 用于展开通配导出）
- 模块分类依据：`docs/MODULES.md` 模块全景图
