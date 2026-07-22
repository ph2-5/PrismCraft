# Novel 故事创作流水线实施指南

> 自动生成于 2026-07-23。基于 `src/modules/novel/` 实际代码扫描。
> Phase 2A 全部 23 个任务已于 2026-07-20 完成代码实现并通过代码审查。

---

## 架构概览

Novel 模块（`src/modules/novel/`）是 PrismCraft **Phase 2A 一键成片管道的核心**，承载从小说文本到视频分镜的完整 10 阶段流水线。它对应 v5.1 新增的"小说导入管道（Novel Import Pipeline）"，是连接用户原始素材与下游 Storyboard / Shot / Video 模块的关键中介层。

### 在整体架构中的位置

```
用户原始素材（小说/剧本/大纲）
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│  Novel 模块（src/modules/novel/）                            │
│  ──────────────────────────────────────────                  │
│  10 阶段 PipelineState 状态机                                │
│  quick (3步) / standard (6步) / professional (8步)           │
│                                                              │
│  产出：NovelSegment[] + CharacterInPipeline[] + SceneInPipeline[]
│        + ShotBreakdown[] + SegmentPrompt[] + ShotContract[]  │
└──────────────────────────────────────────────────────────────┘
        │                                       │
        ▼                                       ▼
┌──────────────────────┐         ┌─────────────────────────────┐
│  Storyboard 模块      │         │  shared-logic/story          │
│  （视频分镜/剧本）    │ ◀────── │  StoryBeat 验证/规范化       │
│                      │  复用   │  storyboard-generation       │
└──────────────────────┘         └─────────────────────────────┘
        │
        ▼
   Shot / Video 模块（生成）
```

### 与 Storyboard 模块的关系

Novel 完成导入后通过 `onComplete` 回调导航到 `/storyboard`。Novel 产出的 `Segment` + `ShotBreakdown` + `SegmentPrompt` 是 Storyboard 模块后续分镜化生成的输入源；同时通过 `novel_projects.story_id` 字段软关联到已创建的 Story（Story 详情页可通过 `NovelSourceDialog` 回溯原始小说文本，导入完成时不再物理删除 `novel_projects` 记录）。

### 依赖方向（遵守 architecture-rules.md）

```
novel/
  ├── domain/          → 仅依赖 @/domain/schemas/character（CharacterAppearance）
  ├── tools/           → 仅依赖 @/domain/* + @/shared-logic/* + 同模块 domain
  ├── import/services/ → 仅依赖同模块 domain（纯函数，零外部依赖）
  ├── structure/       → domain 仅依赖同模块 domain/types；services 仅依赖 structure/domain + tools/helpers
  ├── pacing/          → 仅依赖同模块 domain/pacing-types + structure/domain + domain/types
  ├── integration/     → 依赖 @/shared/event-bus + 同模块 domain/staleness-types
  ├── continuity/      → 零外部依赖（同模块）
  ├── workflow/        → 依赖同子域 domain/workflow-mode + retake-protocol
  ├── hooks/           → 仅依赖同模块 domain + 各子域 services
  └── presentation/    → 仅依赖 @/shared/constants + @/shared/presentation + 同模块 domain/hooks/structure
```

**禁止**：依赖其他 `@/modules/*`（`match-entities` 通过动态 import 调用 characterService/sceneService 规避）；直接调用 `electronAPI.*`（文件/配置操作走 `@/shared/file-http`）。

---

## 模块结构

Novel 模块按职责拆分为 9 个子域，每个子域内含 `domain/`、`services/`、`presentation/` 三层（按需），通过 `index.ts` 桶文件统一对外暴露公共 API：

| 子域 | 路径 | 职责 |
|------|------|------|
| `domain` | `domain/` | 领域类型定义（15 个核心类型 + `contract.json` 不变量） |
| `tools` | `tools/` | 5 个 Novel Agent 工具 + 章节识别纯函数 |
| `import/services` | `import/services/` | Pipeline 状态机（10 阶段转换 + 三档模式 + 失败重试 + FALLBACK_STRATEGIES） |
| `structure` | `structure/` | 故事结构分析层（Task 2A.13）：叙事 beats + Treatment + ShotContract |
| `pacing` | `pacing/` | 节奏规划引擎（Task 2A.14）：预设比例 + 时长分配 |
| `integration` | `integration/` | 过期标记追踪（Task 2A.17）：StalenessTracker + TriggerDispatcher |
| `continuity` | `continuity/` | 连续性账本（Task 2A.18）：跨镜头一致性追踪 + 违规修复 |
| `workflow` | `workflow/` | 工作流模式（Task 2A.19）：AutoPipeline + SemiPipeline + RetakeProtocol |
| `hooks` | `hooks/` | React Hooks（`useNovelPipeline` 组合 Hook + 5 个子 Hook） |
| `presentation` | `presentation/` | UI 组件（StoryPipelineShell 三栏布局 + 各阶段 Panel + 图表） |
| `services` | `services/` | 示例项目数据（`sample-projects.ts`） |

### Hooks 子模块拆分（Task 2A.8）

`useNovelPipeline` 已从原 1523 行单 Hook 拆分为 5 个子 Hook（位于 `hooks/`）：

- `use-pipeline-state.ts` — 15 个 useState + 3 个 useRef 状态容器
- `use-pipeline-derived-flags.ts` — stagesForMode / canProceed / showXxx 等派生标志
- `use-novel-tools.ts` — handleImport / handleQuickGenerate 等 AI 工具调用 + 业务 handlers（不含 handleNext）
- `use-novel-stage-transitions.ts` — handleNext 及 5 个 stage 调度函数（runContentImportNext 等）
- `use-pipeline-persistence.ts` — DB 持久化（2 秒防抖自动保存 / recoverProject / handleFinalizeImport）

辅助函数提取到 `pipeline-helpers.ts`（`createGenerateTextFn` / `makeInitialState` / `extractAndMatchEntities` / `breakdownShotsForSegments` / `recordToProject` 等）。

---

## 核心流程

### 1. 小说导入流程

#### 1.1 三档模式决定阶段子集

`PipelineConfig.aiAssistLevel` 决定流水线经历哪些阶段（由 `getStagesForMode` 计算，`src/modules/novel/import/services/pipeline-machine.ts:128`）：

| 模式 | 阶段数 | 阶段序列 |
|------|--------|----------|
| `quick` | 5 | project_init → content_import → character_manage → generation → done |
| `standard` | 8 | quick + scene_manage + review + storyboard |
| `professional` | 10 | standard + structure_analysis + pacing_planning |

阶段顺序在 `STAGE_ORDER` 中定义；合法转换由 `VALID_TRANSITIONS` 映射（含 v5.1 三档模式跳过路径，如 `content_import → structure_analysis | character_manage`）。

#### 1.2 内容导入与章节分割

入口：用户在 `ImportStep` 粘贴/上传小说文本 → `useNovelPipeline.handleImport(text)`。

流程：
1. **章节识别（纯函数，零 AI 依赖）** — `tools/chapter-detector.ts` 的 `detectChapters(text)` 通过正则识别中文章节标题（`第X章/节/回/卷/部/篇`、`卷X/部X/篇X`）和英文章节（`Chapter N`），返回 `NovelChapter[]`，包含 `startChar` / `endChar` 字符偏移。
2. **AI 分段** — 调用 `segmentNovelTextTool`（`tools/segment-novel-text.ts`）让 AI 把文本切成 `NovelSegment[]`，每段包含 `title` / `summary` / `keyEvents` / `estimatedDuration` / `text`，以及 `startChar` / `endChar` 偏移。大文本通过 `prevSegmentsJson` 参数分块处理 + 重叠合并。
3. **章节归属回填** — 每个 `NovelSegment` 填充 `chapterIndex` / `chapterTitle`（Q2-1 新增），建立 segment↔chapter 归属关系；偏移统一相对于全文 `rawText`。

#### 1.3 角色与场景提取

调用 3 个 Novel Agent 工具：
- `extractCharactersFromTextTool`（`tools/extract-characters-from-text.ts`）→ `ExtractedCharacter[]`（含 `appearance: CharacterAppearance` / `personality` / `firstAppearance`）
- `extractScenesFromTextTool`（`tools/extract-scenes-from-text.ts`）→ `ExtractedScene[]`（含 `atmosphere` / `timeOfDay` / `location`）
- `matchEntitiesTool`（`tools/match-entities.ts`）— 实体三级匹配（精确 → 模糊 → 向量，见 contract.json 不变量 #4），通过动态 `import()` 调用 `characterService` / `sceneService` 规避跨模块硬依赖；匹配后 `status` 流转为 `matched` / `conflict`，匹配成功时填充 `matchedCharacterId` / `matchedSceneId`。

最终聚合成 `CharacterInPipeline[]`（含 `variants: CharacterVariant[]` 与 `importance: P0|P1|P2|P3`）和 `SceneInPipeline[]`（含 `variants: SceneVariant[]`）。变体共享 8 维参数向量（`timeOfDay` / `weather` / `lighting` / `mood` / `crowdLevel` / `cameraAngle` / `season` / `colorPalette`）。

#### 1.4 分镜拆解 + Prompt 分层合成

- `breakdownTextToShotsTool`（`tools/breakdown-text-to-shots.ts`）将每个 segment 拆为多个 `ShotBreakdown`，附带 Q2-1 原文回溯字段（`sourceSegmentId` / `sourceStartChar` / `sourceEndChar` / `sourceText` / `chapterIndex` / `chapterTitle`），支持原文↔分镜对照视图。
- Prompt 合成采用**分层式**（contract.json 不变量 #6）：`SegmentPrompt.layers` 包含三层
  - `core`：片段描述 + 角色 promptFragment（必填）
  - `enhanced`：场景变体 + 镜头语言（可选）
  - `style`：项目风格 + 全局风格修饰（可选）

#### 1.5 项目持久化与恢复（Task 2A.7）

- `NovelProject` 持久化到 SQLite，每个项目独立的 `PipelineState`。
- 自动保存：2 秒防抖（`use-pipeline-persistence.ts` 的 `debounceRef`），保存时整体序列化 `PipelineState.stepData`。
- `StoryPipelineShell` 挂载时检测未完成项目，若有则渲染 `NovelProjectList` 恢复对话框，用户可选恢复（`recoverProject(id)`）、忽略（`dismissRecovery`）或删除（`deletePendingProject(id)`）。
- 导入完成后通过 `handleFinalizeImport` 写入 `novel_projects.story_id` 完成软关联。

### 2. 故事结构分析

`structure/` 子域（Task 2A.13，v5.3 增强）实现"返回 production object first, then prompt"模式——先产出可编辑的工作产物（treatment + shot contract），再据此构造 prompt。

#### 2.1 叙事 beats 识别（`structure/services/structure-analyzer.ts`）

主函数 `analyzeStoryStructure(segments, generateTextFn)`：
1. `buildStructureAnalysisPrompt(segments)` 构建提示词，要求 AI 识别 3-7 个 beats，覆盖 7 种 `NarrativeBeatType`（`setup` / `inciting_incident` / `rising_action` / `midpoint` / `climax` / `falling_action` / `resolution`）。
2. 调用注入的 `generateTextFn`（解耦 infrastructure，便于测试），返回 JSON 数组。
3. `extractJsonArrayFromText` 从 ```json 代码块或最外层 `[...]` 提取，`parseNarrativeBeats` 容错解析（字段缺失时给默认值，不合法 `type` 回退为 `setup`，`emotionIntensity` clamp 到 0-1）。
4. `populateBeatPositionsAndDurations` 计算每个 beat 的 `position`（基于关联 segment 在数组中的加权平均位置，由 `computeBeatPosition` 实现）和 `estimatedDuration`（关联 segments 的 `estimatedDuration` 之和，无匹配时按平均时长估算）。
5. 计算 `emotionCurve`（`computeEmotionCurve`，beat 间线性插值中点）、`overallPacing`（`inferOverallPacing`，按平均 `emotionIntensity` 分类）、`climaxPosition`（`findClimaxPosition`，无显式 climax 时回退 0.75）。

产出 `StoryStructure` 存入 `PipelineState.stepData["structure_analysis"]`。

#### 2.2 Treatment 提取（`structure/services/treatment-extractor.ts`，v5.3）

主函数 `extractTreatment(segments, generateTextFn, characters?)`：
- 构建提示词，要求 AI 从 segments 提取结构化大纲 `StoryTreatment`：
  - `logline`（25-50 字一句话故事梗概）
  - `theme`（主题，如"成长"/"救赎"）
  - `characterArcs: CharacterArc[]`（角色弧光，`characterId` + `arc` 描述）
  - `tone: StoryTone`（6 种：drama/comedy/thriller/horror/romance/action）
  - `settingDescription`（50-200 字世界观/设定）
- `parseTreatment` 容错解析，字段缺失时给默认值（不合法 `tone` 回退 `drama`，`characterArcs` 缺失时空数组）。
- `isTreatmentComplete(treatment)` 校验必填字段非空，不完整的 treatment 不能用于生成 shot contract。

#### 2.3 ShotContract 构建（`structure/services/shot-contract-builder.ts`，v5.3）

主函数 `buildShotContractsForBeats(beats, segments, generateTextFn, treatment?)`：
- 每个 `NarrativeBeat` 产出 1-3 个 `ShotContract`（按 `DEFAULT_SHOT_COUNT_BY_BEAT`：setup=1, climax=3, 其余 2）。
- AI 返回字段缺失时回退到默认值：
  - 焦距：`DEFAULT_LENS_BY_SIZE`（如 `wide: "35mm"`、`extreme_close_up: "100mm"`）
  - 时长：`DEFAULT_DURATION_BY_SIZE`（如 `extreme_wide: 6 秒`、`extreme_close_up: 2 秒`）
  - 灯光：`getDefaultLighting(beat.type)` 按叙事类型推断
- 景别/运动/灯光受枚举约束（`SHOT_SIZES` / `SHOT_MOVEMENTS` / `SHOT_LIGHTINGS`），`validateShotContract` 校验合法性，`clampDuration` 将时长夹紧到 [2, 30]。
- `treatment` 可选注入，若提供则用于指导 AI 生成更贴合的 `blocking`（角色站位/动作描述）。

UI 编辑入口：`presentation/StructureAnalysisPanel.tsx`（编辑 beats）+ `presentation/ShotContractPanel.tsx`（编辑 contracts），分别通过 `handleBeatsChange` / `handleShotContractsChange` 回调写回 state。

### 3. 节奏规划

`pacing/` 子域（Task 2A.14）按叙事节点分配总时长到各 segment，产出可应用的 `PacingResult`。

#### 3.1 配置与预设（`pacing/domain/pacing-types.ts`）

`PacingConfig` 包含 4 个 ratio（`setupDurationRatio` / `risingDurationRatio` / `climaxDurationRatio` / `resolutionDurationRatio`，总和应为 1.0）+ `targetDuration` + `preset`。

3 种预设 `DEFAULT_PACING_PRESETS`：
- `slow`：开端 0.25 / 上升 0.40 / 高潮 0.10 / 结局 0.25（氛围铺垫）
- `normal`：0.20 / 0.40 / 0.15 / 0.25（典型分配）
- `fast`：0.15 / 0.45 / 0.20 / 0.20（紧张刺激）

#### 3.2 主函数 `planPacing`（`pacing/services/pacing-engine.ts`）

步骤：
1. `resolvePacingConfig` 应用预设覆盖（preset ≠ custom 时用预设 ratio 覆盖）。
2. `groupSegmentsByBeat` 按 `beat.segmentIds` 分组 segments（一个 segment 可能属于多个 beat，分到第一个匹配的 beat）。
3. `allocateDurationByBeat` 按 4 阶段比例分配总时长到各 beat（阶段内按 `estimatedDuration` 加权，全 0 时平均分配）。
4. `distributeDurationToSegments` 将 beat 时长按 segment.estimatedDuration 加权分配到 segment，最后 `clampDuration` 到 `[SEGMENT_DURATION_MIN, SEGMENT_DURATION_MAX]`（即 [2, 30] 秒）。
5. `distributeUngroupedSegments` 处理未分组的 segments（剩余时长平均分配）。
6. `generatePacingNotes` 生成 2-4 条人类可读说明（预设说明 + 高潮占比 + 高潮位置 + 整体节奏）。

#### 3.3 应用到 beats

`applyPacingToBeats(beats, pacingResult, segmentIdMap)` 将 segment 时长平均分配到该 segment 下的所有 beats，返回新 beats 数组（不修改原数组）。Task 2A.14 基础实现中 `handleApplyPacing` 直接修改 `segments.estimatedDuration`（影响后续分镜拆解的时长参考），此函数预留给 v5.3 增强（角色化产出）或三档模式完整实现时使用。

UI 入口：`presentation/PacingPanel.tsx`（配置 + 应用建议时长 + 恢复默认）+ `presentation/charts/EmotionCurveChart.tsx`（复用 `PacingResult.emotionCurve` 绘制曲线）。

### 4. StalenessTracker 联动机制

`integration/` 子域（Task 2A.17）实现"上游结构变更 → 派生数据过期"的追踪机制。

#### 4.1 数据结构（`integration/domain/staleness-types.ts`）

- **8 个 StalenessSource**（过期源）：`structure` / `pacing` / `sceneVariant` / `character` / `scene` / `importance` / `mode` / `segment`
- **7 个 StalenessTarget**（过期目标）：`structure` / `pacing` / `importance` / `prompt` / `shotRecommend` / `overview` / `beats`
- **3 种 TriggerType**：
  - `auto_recompute` — 自动重算（影响范围小，立即响应）
  - `stale_marker` — 仅标记 stale（影响范围中，进入时提示）
  - `manual_confirm` — 提示用户确认（影响范围大，代价高）

#### 4.2 传播规则 DAG（`STALENESS_PROPAGATION`）

```typescript
structure:    ["pacing", "importance", "prompt", "overview"]
pacing:       ["prompt", "beats", "overview"]
sceneVariant: ["shotRecommend", "prompt", "overview"]
character:    ["importance", "prompt", "overview"]
scene:        ["importance", "prompt", "overview"]
importance:   ["prompt", "overview"]
mode:         []                                      // 模式切换不触发过期
segment:      ["structure", "pacing", "importance", "prompt", "overview"]
```

`TRIGGER_TYPE` 映射：`sceneVariant` / `mode` 自动重算，`pacing` / `segment` 需用户确认，其余标记 stale。

#### 4.3 StalenessTracker 类（`integration/services/staleness-tracker.ts`）

- 内部 `staleMap: Map<StalenessTarget, StaleEntry[]>`（一个 target 可能被多个 source 标记）。
- `markStale(source, reason, affectedSegmentIds?)`：按 `STALENESS_PROPAGATION` 传播到所有 targets，同 source 的旧条目替换为新条目（去重）。
  - emit `novel:stale-changed` 通知 UI 刷新
  - 若 `triggerType === "auto_recompute"`，额外 emit `novel:auto-recompute` 立即触发下游重算
- `isStale(target)` / `getStaleEntries(target)` / `getStaleTargets()` 查询接口。
- `clearStale(target)` / `clearSource(source)` / `clearAll()` 清除标记并 emit `novel:stale-cleared`。
- `serialize()` / `restore(data)` 用于随 `PipelineState` 持久化到 DB（关闭应用后恢复）。
- 通过 DI 容器注册（Category B：有状态服务，需 test replacement）。

#### 4.4 TriggerDispatcher 类（`integration/services/trigger-dispatcher.ts`）

对 StalenessTracker 的高层封装，提供更友好的 API：
- `notifyChange(source, reason, affectedSegmentIds?)` — 上游调用入口（内部委托给 `stalenessTracker.markStale`）。
- `onRecompute(target, callback)` — 下游订阅重算事件（仅响应 `auto_recompute`）。
- `onStaleChanged(callback)` — UI 订阅"已过期"标记显示。
- `onStaleCleared(callback)` — UI 订阅"过期标记清除"。
- `onModeSwitched(callback)` / `emitModeSwitched(from, to)` — 模式切换事件（由 `handleSelectMode` 触发）。

#### 4.5 完整联动链路

```
StructureAnalysisPanel 编辑 beats
        │
        ▼
triggerDispatcher.notifyChange("structure", "用户调整了故事结构 beats")
        │
        ▼ stalenessTracker.markStale
        │   ├─ markStale("structure") 标记 pacing/importance/prompt/overview 为 stale
        │   ├─ emit "novel:stale-changed" → UI 显示"已过期"标记
        │   └─ triggerType=stale_marker（不自动重算）
        │
        ▼ 用户进入 pacing_planning 阶段时看到"结构已变化"提示
        │   用户重新规划 pacing
        │
        ▼ triggerDispatcher.notifyChange("pacing", "节奏配置已更新")
        │   ├─ markStale("pacing") 标记 prompt/beats/overview
        │   └─ triggerType=manual_confirm（询问用户是否重生成 prompt）
```

---

## 数据模型

所有类型定义于 `src/modules/novel/domain/types.ts`（contract.json `publicAPI`），以下为关键结构（与代码一致，未编造字段）：

### 基础实体

| 类型 | 说明 | 关键字段 |
|------|------|---------|
| `NovelChapter` | 小说章节（Q2-1 纯函数识别） | `index` / `title` / `startChar` / `endChar` / `segmentIds` |
| `NovelSegment` | 小说分段（基础单元） | `title` / `summary` / `startChar` / `endChar` / `estimatedDuration` / `keyEvents` / `text` / `chapterIndex?` / `chapterTitle?` |
| `ExtractedCharacter` | 从文本提取的角色 | `tempId` / `name` / `appearance: CharacterAppearance` / `personality` / `status: "new"\|"matched"\|"conflict"` / `matchedCharacterId?` |
| `ExtractedScene` | 从文本提取的场景 | `tempId` / `name` / `type` / `atmosphere` / `timeOfDay` / `location` / `status` / `matchedSceneId?` |
| `ShotBreakdown` | 分镜拆解 | `sequence` / `description` / `shotType` / `cameraAngle` / `cameraMovement` / `action` / `characters` / `sceneId?` / `estimatedDuration` / `prompt?` / `status` / 原文回溯字段（Q2-1） |

### 管道状态机

| 类型 | 说明 |
|------|------|
| `PipelineStage` | 10 阶段联合类型（`project_init` / `content_import` / `structure_analysis` / `pacing_planning` / `character_manage` / `scene_manage` / `review` / `storyboard` / `generation` / `done`） |
| `PipelineConfig` | `mode: "auto"\|"semi"` + `aiAssistLevel: "quick"\|"standard"\|"professional"` + `projectName` / `style` / `format` / `aiModel` / `targetLanguage?` + `autoCreateEntities` + `gates`（4 个确认开关） |
| `Segment` | `extends NovelSegment`（预留 `shots?` / `staleness?` 字段位） |

### 变体与合成

| 类型 | 说明 |
|------|------|
| `CharacterVariant` | 变体（如"少年"/"老年"/"战损"）+ `promptFragment` + 8 维参数向量 |
| `CharacterInPipeline` | `extends ExtractedCharacter` + `variants: CharacterVariant[]` + `importance?: P0\|P1\|P2\|P3` |
| `SceneVariant` | 与 `CharacterVariant` 结构一致（8 维参数向量） |
| `SceneInPipeline` | `extends ExtractedScene` + `variants: SceneVariant[]` |
| `SegmentPrompt` | `segmentId` + `en` / `zh` + `layers?: { core; enhanced?; style? }`（v5.1 分层式） |
| `GenerationResult` | `segmentId` / `status` / `videoUrl?` / `startedAt?` / `completedAt?` / `storyBeatId?`（v5.4 QC 闭环预留） |

### 持久化

```typescript
interface PipelineState {
  stage: PipelineStage;
  step: number;
  config: PipelineConfig;
  rawText: string;
  segments: Segment[];
  currentSegmentIndex: number;
  characters: CharacterInPipeline[];
  scenes: SceneInPipeline[];
  characterImportance: Record<string, "P0"|"P1"|"P2"|"P3">;
  prompts: SegmentPrompt[];
  generationResults: GenerationResult[];
  storyId?: string;
  error?: string;
  stepData?: Partial<Record<PipelineStage, unknown>>;  // 各阶段中间数据
}

interface NovelProject {
  id: string;
  title: string;
  rawText: string;
  state: PipelineState;
  createdAt: number;
  updatedAt: number;
}
```

### Structure / Pacing / Integration 子域类型

| 子域 | 类型 | 来源文件 |
|------|------|---------|
| structure | `NarrativeBeat` / `NarrativeBeatType` / `EmotionPoint` / `OverallPacing` / `StoryStructure` | `structure/domain/narrative-beats.ts` |
| structure | `StoryTone` / `CharacterArc` / `StoryTreatment` | `structure/domain/treatment.ts` |
| structure | `ShotSize` / `ShotMovement` / `ShotLighting` / `ShotContract` | `structure/domain/shot-contract.ts` |
| pacing | `PacingPreset` / `PacingConfig` / `PacingResult` | `pacing/domain/pacing-types.ts` |
| integration | `StalenessSource` / `StalenessTarget` / `TriggerType` / `StaleEntry` | `integration/domain/staleness-types.ts` |
| continuity | `ContinuityCategory` / `ContinuityEntry` / `ContinuityViolation` / `ContinuityLedger` | `continuity/domain/continuity-ledger.ts` |
| workflow | `WorkflowMode` / `RetakeVerdictType` / `RetakeVerdict` / `PipelineStep` / `WorkflowState` | `workflow/domain/workflow-mode.ts` |

### 不变量（contract.json）

1. `PipelineState.stage` 单向流动（不可回退，但子步骤可重做）。
2. `step` 在 stage 内从 1 递增，跨 stage 时重置为 1。
3. `structure_analysis` / `pacing_planning` 在 quick/standard 模式可跳过；professional 模式必须经过。
4. `aiAssistLevel` 决定 `STAGE_ORDER` 子集（`getStagesForMode`）。
5. 上游 stage 产出变化时，必须通过 `stalenessTracker` 标记下游为 stale（Task 2A.17）。
6. `ExtractedCharacter.status === "matched"` 时必须设置 `matchedCharacterId`（场景同理）。
7. 角色/场景三级匹配（精确 → 模糊 → 向量）。
8. 变体 8 维参数向量（`timeOfDay` / `weather` / `lighting` / `mood` / `crowdLevel` / `cameraAngle` / `season` / `colorPalette`）。
9. Prompt 分层合成（core + enhanced + style），由 `SegmentPrompt.layers` 承载。
10. `NovelProject` 持久化到 SQLite，每个项目独立 `PipelineState`。
11. `GenerationResult.storyBeatId` 关联 StoryBeat 表（v5.4 一致性 QC 闭环追踪预留）。
12. 类型无循环引用：NovelSegment / ExtractedCharacter / ExtractedScene 为叶子类型；Segment 继承 NovelSegment；PipelineState 聚合其他类型。

---

## Public API

通过 `src/modules/novel/index.ts` 桶文件统一导出，分为以下几组：

### Domain 类型（15 个）

`NovelSegment` / `ExtractedCharacter` / `ExtractedScene` / `ShotBreakdown` / `PipelineStage` / `PipelineConfig` / `Segment` / `CharacterVariant` / `CharacterInPipeline` / `SceneVariant` / `SceneInPipeline` / `SegmentPrompt` / `GenerationResult` / `PipelineState` / `NovelProject`

### Tools（5 个 Novel Agent 工具 + 章节识别）

`segmentNovelTextTool` / `extractCharactersFromTextTool` / `extractScenesFromTextTool` / `matchEntitiesTool` / `breakdownTextToShotsTool` / `novelTools` + `detectChapters` / `findChapterByOffset`（纯函数）

### Pipeline 状态机

`STAGE_ORDER` / `VALID_TRANSITIONS` / `canTransition` / `transition` / `getAutoGates` / `shouldPauseAtStage` / `getStagesForMode` / `retryStage` / `getRetryableStages` / `FALLBACK_STRATEGIES`

### Hooks

- `useNovelPipeline(options: UseNovelPipelineOptions): UseNovelPipelineResult` — 管道状态管理组合 Hook
- 入参：`onComplete: () => void` + `initialConfig?: Partial<PipelineConfig>`
- 返回：`state` + 派生标志（`stagesForMode` / `canProceed` / `showXxx` / `isDone`）+ 持久化状态（`pendingRecoveryProjects` / `currentProjectId` / `lastSavedAt`）+ handlers（导入/编辑/匹配/编辑 shot/生成 prompt/finalize/auto-run/恢复/删除/模式切换/示例加载/快速生成/工作流切换）

### Presentation 组件

- **UI Panel Part 1（Task 2A.4）**：`ImportStep` / `SegmentList` / `SegmentCard` / `PipelineProgress` / `PipelineControls`
- **UI Panel Part 2（Task 2A.5）**：`EntityReviewPanel` / `CharacterExtractCard` / `SceneExtractCard` / `ShotBreakdownList` / `ShotCard` / `FinalizePanel`（含 `FinalizeSummary` 类型）
- **StoryPipelineShell 三栏布局（Task 2A.6）**：`StoryPipelineShell` / `PhaseIndicator` / `SegmentNavColumn` / `MainWorkArea` / `ContextPanel`
- **未完成项目恢复（Task 2A.7）**：`NovelProjectList`
- **原始小说回溯**：`NovelSourceDialog`（Story 详情页"查看原始小说"对话框）
- **故事结构分析（Task 2A.13）**：`StructureAnalysisPanel` / `ShotContractPanel`
- **节奏规划（Task 2A.14）**：`PacingPanel` + 图表（`ShotDensityChart` / `ScenePacingChart` / `CharacterAppearanceChart` / `EmotionCurveChart`）
- **概览视图（Task 2A.16）**：`StoryOverviewPanel`

### Structure 子域 API（通过 `export * from "./structure"`）

- **Domain 类型**：`NarrativeBeat` / `NarrativeBeatType` / `EmotionPoint` / `OverallPacing` / `StoryStructure` / `StoryTone` / `CharacterArc` / `StoryTreatment` / `ShotSize` / `ShotMovement` / `ShotLighting` / `ShotContract`
- **Domain 常量与函数**：`NARRATIVE_BEAT_TYPES` / `computeBeatPosition` / `findClimaxPosition` / `inferOverallPacing` / `computeEmotionCurve` / `STORY_TONES` / `EMPTY_TREATMENT` / `isTreatmentComplete` / `SHOT_SIZES` / `SHOT_MOVEMENTS` / `SHOT_LIGHTINGS` / `DEFAULT_LENS_BY_SIZE` / `DEFAULT_DURATION_BY_SIZE` / `validateShotContract` / `clampDuration`
- **Services**：`analyzeStoryStructure` / `buildStructureAnalysisPrompt` / `parseNarrativeBeats` / `populateBeatPositionsAndDurations` / `extractJsonArrayFromText` / `suggestDurationByStructure` / `recalculateStoryStructure` / `DEFAULT_DURATION_ADJUSTMENTS` / `extractTreatment` / `buildTreatmentExtractionPrompt` / `parseTreatment` / `extractJsonObjectFromText` / `buildShotContractsForBeats` / `buildShotContractsForBeat` / `buildShotContractPrompt` / `parseShotContracts` / `getDefaultLighting` / `DEFAULT_SHOT_COUNT_BY_BEAT` / `DEFAULT_SHOT_SIZE_BY_BEAT` / `GenerateTextFn`（LLM 调用函数类型，供 services 注入）

### Pacing / Integration / Continuity / Workflow 子域 API

- **Pacing**：`PacingPreset` / `PacingConfig` / `PacingResult` / `DEFAULT_PACING_PRESETS` / `DEFAULT_PACING_CONFIG` / `SEGMENT_DURATION_MIN` / `SEGMENT_DURATION_MAX` / `planPacing` / `groupSegmentsByBeat` / `resolvePacingConfig` / `normalizeRatios` / `allocateDurationByBeat` / `distributeDurationToSegments` / `distributeUngroupedSegments` / `generatePacingNotes` / `applyPacingToBeats`
- **Integration**：`StalenessTracker` / `stalenessTracker` / `TriggerDispatcher` / `triggerDispatcher` / `STALENESS_PROPAGATION` / `TRIGGER_TYPE` / `NOVEL_INTEGRATION_EVENTS` + 类型（`StalenessSource` / `StalenessTarget` / `TriggerType` / `StaleEntry`）
- **Continuity**：`ContinuityTracker` / `continuityTracker` / `ContinuityViolationFixer` / `continuityViolationFixer` / `ContinuityLedgerPanel` + 类型（`ContinuityCategory` / `ContinuityEntry` / `ContinuityViolation`）
- **Workflow**：`AutoPipeline` / `autoPipeline` / `SemiPipeline` / `semiPipeline` / `RetakeProtocol` / `retakeProtocol` / `WorkflowModeSelector` + 类型（`WorkflowMode` / `RetakeVerdict` / `PipelineStep` / `WorkflowState` / `WorkflowEvent`）+ 常量（`RETAKE_THRESHOLDS` / `DEFAULT_ATTEMPT_BUDGET`）

---

## 与其他模块的交互

### 数据流图

```
用户输入（小说文本/示例项目）
        │
        ▼
[Novel 模块] useNovelPipeline
        │
        ├─→ Segment[] + ShotBreakdown[] + SegmentPrompt[]
        │   │
        │   ▼
        │   [Storyboard 模块] /storyboard 路由
        │   │
        │   ▼ 复用
        │   [shared-logic/story] story-service.ts
        │   - validateStoryPlan / fixStoryBeat / convertToStoryBeats
        │   - storyboard-generation.ts
        │     generateBeatKeyframe / generateBeatFramePair / generateBeatVideo
        │   │
        │   ▼
        │   [Shot / Video 模块] 生成
        │
        ├─→ novel_projects.story_id（软关联 Story）
        │   │
        │   ▼
        │   [Story 模块] 详情页"查看原始小说" → NovelSourceDialog
        │
        ├─→ GenerationResult.storyBeatId → [Storyboard StoryBeat 表]（v5.4 QC 闭环追踪）
        │
        └─→ [跨模块 v5.4 协同]
            ├── @/modules/blockout-3d（Seedance 2.5 + 3D 白盒）
            ├── @/modules/video/partial-edit（局部重绘）
            └── @/modules/video/consistency-qc（一致性 QC 闭环）
```

### 跨模块通信机制（遵守 architecture-rules.md）

| 机制 | 用途 | Novel 模块示例 |
|------|------|---------------|
| **DI Container** | Port 实现 / 有状态服务 | `stalenessTracker` / `triggerDispatcher`（Category B：test-replaceable） |
| **Zustand Store** | 模块内状态 | `useNovelPipeline` 内部 state（不对外暴露 store） |
| **Event Bus** | Fire-and-forget 通知 | `novel:stale-changed` / `novel:auto-recompute` / `novel:stale-cleared` / `novel:mode-switched`（4 个 Novel 集成层事件） |
| **动态 import** | 跨模块调用 | `match-entities.ts` 动态 import `characterService` / `sceneService`（规避跨模块硬依赖） |

### 路由入口

- `/story` → `src/app/story/page.tsx` → `<StoryPipelineShell />`（Task 2A.6）
- 完成导入后（`onComplete`）导航到 `/storyboard`

### v5.4 协同预留字段

- `ShotBreakdown.shotStrategy?` / `ShotBreakdown.qcReport?` — Task 2A.23 一致性 QC 闭环（类型定义见 `@/modules/video/consistency-qc/domain/qc-schema.ts`）
- `GenerationResult.storyBeatId` — 关联 StoryBeat 表用于漂移检测
- `Segment.staleness?` — Task 2A.17 过期标记机制（"fresh" | "stale" | "dirty"）

---

## 实施进度

Phase 2A 全部 23 个任务已完成。详见 `MODULE.md` 中的 Task 表（2A.1 ~ 2A.23）。本指南仅覆盖代码层面的实施细节，进度跟踪以 `MODULE.md` 为准。
