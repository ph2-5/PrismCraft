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
- 复杂嵌套类型以 JSON 列存储，完整类型定义在状态推演引擎实现时细化
- `PlotNode.segmentId` ↔ `NovelSegment.id`（Q2-1 原文回溯锚点）
- `PlotNode.beatId` ↔ `StoryBeat.id`（可选直接关联）
- 删除 `StoryTimeline` 时级联删除其所有 `PlotNode`（FK ON DELETE CASCADE）

## 未来扩展（Phase 4.6）

- 状态推演引擎（`timeline-engine.ts`）：基于 PlotEvent 自动推演状态变化
- React Query hooks：`useTimeline`, `usePlotNodes`, `useStatePropagation`
- UI 组件：`TimelineEditor`, `TimelineTrack`, `NodeDetailPanel`, `StateSnapshotView`
- Prompt 合成增强：StateSnapshot + Binding → Enhanced Prompt
- 三层快照架构：PinnedSnapshot / ActiveSnapshot / DiffOnlySnapshot（治理状态爆炸）
