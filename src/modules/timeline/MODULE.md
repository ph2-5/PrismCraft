# Timeline Module ✅

> 时间线维度建模（Q3-3）— 故事时间线系统的核心实体和模块边界。
> 设计来源：`docs/timeline-variant-design.md`（故事时间线变体系统）

## 概述

把角色和场景的状态看作**故事时间线的函数**，而非独立配置项。

```
PlotNode 1 ──→ PlotNode 2 ──→ ... ──→ PlotNode N
（第1章片段1）  （第1章片段2）          （第N章片段M）

每个 PlotNode 包含：
  ├── 剧情事件（PlotEvent）：本节点发生了什么
  ├── 状态快照（CharacterStateSnapshot / SceneStateSnapshot）
  ├── 状态转换（StateTransition）：从前一节点到本节点的变化
  └── 时间线绑定（NodeBinding）：与前后节点的关联
```

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 子域

| 子域 | 状态 | 路径 | 说明 |
|------|:----:|------|------|
| domain | ✅ | `@/domain/schemas/timeline.ts` | Zod schemas: StoryTimeline, PlotNode, PlotEventType, SnapshotStrategy |
| storage | ✅ | `@/infrastructure/storage/timelines/` | timeline-manager.ts + plot-node-manager.ts |
| module | ✅ | `src/modules/timeline/` | 模块边界 + contract.json |

## 公共 API

### ✅ Domain Schemas（re-export 自 `@/domain/schemas/timeline`）

| API | 说明 |
|-----|------|
| `storyTimelineSchema` | StoryTimeline Zod schema |
| `createStoryTimelineInputSchema` | 创建时间线输入 schema |
| `updateStoryTimelineInputSchema` | 更新时间线输入 schema |
| `plotNodeSchema` | PlotNode Zod schema |
| `createPlotNodeInputSchema` | 创建剧情节点输入 schema |
| `updatePlotNodeInputSchema` | 更新剧情节点输入 schema |
| `plotEventTypeSchema` | 剧情事件类型 schema（22 种） |
| `timelineTypeSchema` | 时间线类型 schema |
| `snapshotStrategySchema` | 快照策略 schema |

### ✅ Domain Types

| API | 说明 |
|-----|------|
| `StoryTimeline` | 故事时间线实体 |
| `CreateStoryTimelineInput` / `UpdateStoryTimelineInput` | 时间线创建/更新输入 |
| `PlotNode` | 剧情节点实体 |
| `CreatePlotNodeInput` / `UpdatePlotNodeInput` | 节点创建/更新输入 |
| `PlotEventType` | 剧情事件类型 |
| `TimelineType` | 时间线类型 |
| `SnapshotStrategy` | 快照策略 |

### ✅ Hooks 子域

| API | 说明 |
|-----|------|
| `useCascadeUpdate` | 状态级联更新 Hook；`CascadeUpdateApi` 为其返回类型 |
| `useTimelineBinding` | 时间线绑定 Hook（NodeBinding 管理）；`TimelineBindingApi` / `UseTimelineBindingOptions` 为配套类型 |
| `useEnhancedPrompt` | Prompt 合成增强（StateSnapshot + Binding → Enhanced Prompt）；`EnhancedPromptApi` / `UseEnhancedPromptOptions` 为配套类型 |
| `useMultiTimeline` | 多时间线管理 Hook；`MultiTimelineApi` 为其返回类型 |
| `useSnapshotWindow` | 快照窗口管理 Hook（三层快照架构）；`SnapshotWindowApi` / `UseSnapshotWindowOptions` 为配套类型 |

### ✅ Presentation 子域

| API | 说明 |
|-----|------|
| `TimelineEditor` | 时间线编辑器主组件 |
| `TimelineTrack` | 时间线轨道组件 |
| `NodeDetailPanel` | 节点详情面板 |
| `StateSnapshotView` | 状态快照视图 |
| `CharacterStateTrack` | 角色状态轨迹组件 |
| `BindingGraph` | 绑定关系图组件 |
| `BindingCreatorDialog` | 绑定创建对话框；`BindingCreatorResult` 为其结果类型 |
| `MultiTimelineView` | 多时间线视图组件 |

### ✅ 多时间线 Domain 类型

| API | 说明 |
|-----|------|
| `TimelineRelationshipType` / `TIMELINE_RELATIONSHIP_TYPES` | 时间线关系类型（type + 常量列表） |
| `CrossTimelineBindingType` | 跨时间线绑定类型 |
| `NodeMapping` | 节点映射 |
| `TimelineRelationship` | 时间线关系 |
| `CrossTimelineBinding` | 跨时间线绑定 |
| `MultiTimelineViewData` | 多时间线视图数据（domain 类型，区别于同名 UI 组件） |
| `TimelineLayerInfo` | 时间线分层信息 |
| `DomainCrossTimelineInjectionResult` | 跨时间线注入结果（domain 侧） |

## 存储访问

存储（timelineStorage / plotNodeStorage）通过 DI container 获取，见下方「DI Tokens」，不属于模块顶层导出。

## DI Tokens

| Token | Category | 说明 |
|-------|----------|------|
| `timelineStorage` | C (Storage) | StoryTimeline CRUD |
| `plotNodeStorage` | C (Storage) | PlotNode CRUD |

## 边界约束

- 禁止直接导入 `infrastructure/storage`，必须通过 DI container
- 复杂嵌套类型（CharacterStateSnapshot / SceneStateSnapshot / StateTransition / NodeBinding）以 JSON 列存储
- `PlotNode.segmentId` ↔ `NovelSegment.id`（Q2-1 原文回溯锚点）
- `PlotNode.beatId` ↔ `StoryBeat.id`（可选直接关联）
- 删除 `StoryTimeline` 时级联删除其所有 `PlotNode`（FK ON DELETE CASCADE）

## 实现状态

| 能力 | 状态 | 位置 |
|------|------|------|
| 状态推演引擎 | ✅ 已实现 | `@/shared-logic/timeline/state-propagation-engine.ts`（441 行 + 完整测试） |
| 状态推演算法 | ✅ 已实现 | `propagateStates` / `computeNextNodeSnapshots` / 事件规则（compound / NO_OP / 常规） |
| 状态转换规则 | ✅ 已实现 | `CHARACTER_RULES` / `SCENE_RULES` / `CASCADE_RULES` |
| 首节点初始化 | ✅ 已实现 | `initializeCharacterSnapshots` / `initializeSceneSnapshots` |
| React Hooks | ✅ 已实现 | `use-timeline-binding` / `use-snapshot-window` / `use-multi-timeline` / `use-enhanced-prompt` / `use-cascade-update` |
| UI 组件 | ✅ 已实现 | `TimelineEditor` / `TimelineTrack` / `NodeDetailPanel` / `StateSnapshotView` |
| Prompt 合成增强 | ✅ 已实现 | `use-enhanced-prompt`（StateSnapshot + Binding → Enhanced Prompt） |
| 三层快照架构 | ✅ 已实现 | PinnedSnapshot / ActiveSnapshot / DiffOnlySnapshot（治理状态爆炸） |

## 后续扩展方向

- 更多 PlotEventType 规则（当前覆盖核心事件，可按需扩展）
- 状态推演性能优化（大规模 PlotNode 链的增量推演）
- UI 可视化增强（时间线轨迹图、状态差异高亮）
