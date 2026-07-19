<!-- AI: Before modifying this module, read contract.json for invariants -->
# Novel Module

## 模块概述

小说导入管道（Novel Import Pipeline）模块，是 Phase 2A 一键成片管道的核心。支持从小说文本自动拆解为视频分镜的完整 10 阶段流水线，三档渐进式复杂度（quick/standard/professional）。

**v5.1 关键能力**：
- 10 阶段 PipelineStage 状态机（project_init → done 单向流动）
- 三档模式：quick (3步) / standard (6步) / professional (8步)
- AI 助手工具：分段、角色/场景提取、实体匹配、分镜拆解
- 三栏布局 StoryPipelineShell（顶部指示器 + 左栏片段导航 + 中栏工作区 + 右栏上下文）

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `domain` | [domain/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/novel/domain/) | 领域类型定义（15 个核心类型 + contract.json 不变量） |
| `tools` | [tools/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/novel/tools/) | 5 个 Novel Agent 工具（segmentNovelText / extractCharacters / extractScenes / matchEntities / breakdownTextToShots） |
| `import/services` | [import/services/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/novel/import/services/) | Pipeline 状态机（10 阶段转换 + 三档模式 + 失败重试 + FALLBACK_STRATEGIES） |
| `structure` | [structure/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/novel/structure/) | 故事结构分析层（Task 2A.13）：叙事 beats + Treatment + ShotContract（domain + services） |
| `hooks` | [hooks/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/novel/hooks/) | React Hooks（useNovelPipeline — 管道状态管理） |
| `presentation` | [presentation/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/novel/presentation/) | UI 组件（StoryPipelineShell 三栏布局 + Part 1/2 子组件 + Structure/ShotContract Panel） |

---

## 公共 API（index.ts）

### Domain 类型

`NovelSegment`、`ExtractedCharacter`、`ExtractedScene`、`ShotBreakdown`、`PipelineStage`、`PipelineConfig`、`Segment`、`CharacterVariant`、`CharacterInPipeline`、`SceneVariant`、`SceneInPipeline`、`SegmentPrompt`、`GenerationResult`、`PipelineState`、`NovelProject`

### Tools（5 个 Novel Agent 工具）

`segmentNovelTextTool`、`extractCharactersFromTextTool`、`extractScenesFromTextTool`、`matchEntitiesTool`、`breakdownTextToShotsTool`、`novelTools`

### Pipeline 状态机

`STAGE_ORDER`、`VALID_TRANSITIONS`、`canTransition`、`transition`、`getAutoGates`、`shouldPauseAtStage`、`getStagesForMode`、`retryStage`、`getRetryableStages`、`FALLBACK_STRATEGIES`

### Hooks

`useNovelPipeline` — 管道状态管理 Hook（state + handlers + 派生渲染标志）
`UseNovelPipelineOptions` — useNovelPipeline 入参类型
`UseNovelPipelineResult` — useNovelPipeline 返回值类型

### Presentation 组件

**UI Panel Part 1（Task 2A.4）**：`ImportStep`、`SegmentList`、`SegmentCard`、`PipelineProgress`、`PipelineControls`

> 注：早期版本的 NovelImportPage 已在 P0 修复中删除，被 StoryPipelineShell 完全替代。

**UI Panel Part 2（Task 2A.5）**：`EntityReviewPanel`、`CharacterExtractCard`、`SceneExtractCard`、`ShotBreakdownList`、`ShotCard`、`FinalizePanel`（含 `FinalizeSummary` 类型）

**StoryPipelineShell 三栏布局（Task 2A.6）**：`StoryPipelineShell`、`PhaseIndicator`、`SegmentNavColumn`、`MainWorkArea`、`ContextPanel`

**未完成项目恢复（Task 2A.7）**：`NovelProjectList`（恢复对话框，由 StoryPipelineShell 在挂载时检测到 DB 未完成项目时渲染）

**故事结构分析层（Task 2A.13）**：`StructureAnalysisPanel`、`ShotContractPanel`（v5.3 增强）

### Structure 子域 API（Task 2A.13）

**Domain 类型**：`NarrativeBeat`、`NarrativeBeatType`、`EmotionPoint`、`OverallPacing`、`StoryStructure`、`StoryTone`、`CharacterArc`、`StoryTreatment`、`ShotSize`、`ShotMovement`、`ShotLighting`、`ShotContract`

**Domain 常量与函数**：`NARRATIVE_BEAT_TYPES`、`computeBeatPosition`、`findClimaxPosition`、`inferOverallPacing`、`computeEmotionCurve`、`STORY_TONES`、`EMPTY_TREATMENT`、`isTreatmentComplete`、`SHOT_SIZES`、`SHOT_MOVEMENTS`、`SHOT_LIGHTINGS`、`DEFAULT_LENS_BY_SIZE`、`DEFAULT_DURATION_BY_SIZE`、`validateShotContract`、`clampDuration`

**Services**：`analyzeStoryStructure`、`buildStructureAnalysisPrompt`、`parseNarrativeBeats`、`populateBeatPositionsAndDurations`、`extractJsonArrayFromText`、`suggestDurationByStructure`、`recalculateStoryStructure`、`DEFAULT_DURATION_ADJUSTMENTS`（结构化时长调整常量）、`extractTreatment`、`buildTreatmentExtractionPrompt`、`parseTreatment`、`extractJsonObjectFromText`、`buildShotContractsForBeats`、`buildShotContractsForBeat`、`buildShotContractPrompt`、`parseShotContracts`、`getDefaultLighting`、`DEFAULT_SHOT_COUNT_BY_BEAT`（每 beat 默认镜头数）、`DEFAULT_SHOT_SIZE_BY_BEAT`（每 beat 默认景别）、`GenerateTextFn`（LLM 调用函数类型，供 services 注入）

---

## 关键不变量（详见 [domain/contract.json](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/novel/domain/contract.json)）

1. **stage 单向流动**：`project_init → content_import → [structure_analysis] → [pacing_planning] → character_manage → scene_manage → review → storyboard → generation → done`（不可回退，但子步骤可重做）
2. **三档模式决定阶段子集**：`getStagesForMode(aiAssistLevel)` 返回 quick/standard/professional 对应的阶段序列
3. **structure_analysis / pacing_planning** 在 quick/standard 模式可跳过；professional 模式必须经过
4. **实体三级匹配**：精确 → 模糊 → 向量（降低重复创建）
5. **变体 8 维参数向量**：timeOfDay / weather / lighting / mood / crowdLevel / cameraAngle / season / colorPalette
6. **Prompt 分层合成**：core（核心层）+ enhanced（增强层）+ style（风格层）
7. **状态机转换校验**：所有 stage 转换必须通过 `canTransition` 校验，使用 `transition` 函数执行

---

## 依赖方向

```
novel/
  ├── domain/          → 仅依赖 @/domain/schemas/character（CharacterAppearance）
  ├── tools/           → 仅依赖 @/domain/* + @/shared-logic/* + 同模块 domain
  ├── import/services/ → 仅依赖同模块 domain（纯函数，零外部依赖）
  ├── structure/
  │   ├── domain/      → 仅依赖同模块 domain/types（NovelSegment），零外部依赖
  │   └── services/    → 仅依赖同模块 structure/domain + tools/helpers，零外部依赖
  ├── hooks/           → 仅依赖同模块 domain + import/services
  └── presentation/    → 仅依赖 @/shared/constants + @/shared/presentation + 同模块 domain/hooks/structure
```

**禁止**：
- 依赖其他 `@/modules/*`（match-entities 通过动态 import 调用 characterService/sceneService）
- 直接调用 `electronAPI.*`（如需文件/配置操作，通过 `@/shared/file-http`）
- 在 domain/ 中导入 infrastructure / modules / shared-logic

---

## 路由入口

- `/story` → `src/app/story/page.tsx` → `<StoryPipelineShell />`（Task 2A.6）
- 完成导入后（onComplete）导航到 `/storyboard`

---

## v5.4 协同预留

- `ShotBreakdown.shotStrategy?` / `ShotBreakdown.qcReport?` — Task 2A.23 一致性 QC 闭环
- `GenerationResult.storyBeatId` — 关联 StoryBeat 表用于漂移检测
- `Segment.staleness?` — Task 2A.17 过期标记机制

---

## 实施进度

| Task | 状态 | 说明 |
|------|------|------|
| 2A.1 | ✅ | domain 类型定义（15 个核心类型 + contract.json） |
| 2A.2 | ✅ | Novel Agent 工具（5 个） |
| 2A.3 | ✅ | Pipeline 状态机（10 阶段 + 三档模式 + 失败重试） |
| 2A.4 | ✅ | UI Panel Part 1（导入+分段） |
| 2A.5 | ✅ | UI Panel Part 2（提取+拆解+提示词） |
| 2A.6 | ✅ | StoryPipelineShell 三栏布局 + useNovelPipeline Hook |
| 2A.7 | ✅ | 小说项目持久化（novel_projects 表 + CRUD + 2秒防抖自动保存 + 恢复对话框） |
| 2A.13 | ✅ | 故事结构分析层（叙事 beats + Treatment + ShotContract，domain + services + UI Panel + 106 个测试） |
| 2A.8-2A.12, 2A.14-2A.23 | ⏳ | 待实施（道具库 / 变体 / Prompt 合成 / 节奏规划 / 三档模式 / 联动机制 / 过期标记 / 一致性 QC 等） |
