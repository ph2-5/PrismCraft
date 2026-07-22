# Timeline Module

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

## 子域

| 子域 | 路径 | 说明 |
|------|------|------|
| domain | `@/domain/schemas/timeline.ts` | Zod schemas: StoryTimeline, PlotNode, PlotEventType, SnapshotStrategy |
| storage | `@/infrastructure/storage/timelines/` | timeline-manager.ts + plot-node-manager.ts |
| module | `src/modules/timeline/` | 模块边界 + contract.json |

## 公共 API

| 类别 | API |
|------|-----|
| Schemas | `storyTimelineSchema`, `plotNodeSchema`, `plotEventTypeSchema`, `timelineTypeSchema`, `snapshotStrategySchema` |
| Types | `StoryTimeline`, `PlotNode`, `PlotEventType`, `TimelineType`, `SnapshotStrategy` |
| Storage | `container.timelineStorage`, `container.plotNodeStorage`, `ensureMainTimeline()` |

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
