# Timeline 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| domain | 🟡 中 | 多时间线类型定义（multi-timeline-types），被 hooks/presentation 共享 |
| hooks | 🔴 高 | 状态推演、级联更新、快照窗口逻辑，直接影响 prompt 合成正确性 |
| presentation | 🟢 低 | UI 组件，依赖 hooks 提供的数据 |

## 子域依赖图

```
domain（multi-timeline-types）← 无模块内依赖
hooks ← @/domain/schemas/timeline, @/infrastructure/di, @/shared-logic/timeline, domain
presentation ← hooks, domain, @/shared/ui
```

- 状态推演引擎在 `@/shared-logic/timeline/state-propagation-engine.ts`（主/渲染进程共享），不在模块内
- 存储访问必须通过 DI container（`timelineStorage` / `plotNodeStorage`），禁止直接导入 `infrastructure/storage`

## 实际文件结构

```
src/modules/timeline/
  ├── domain/multi-timeline-types.ts   — 多时间线关系/绑定/视图类型 + TIMELINE_RELATIONSHIP_TYPES
  ├── hooks/
  │   ├── use-cascade-update.ts        — 状态级联更新
  │   ├── use-timeline-binding.ts      — 节点绑定管理
  │   ├── use-enhanced-prompt.ts       — StateSnapshot + Binding → Enhanced Prompt
  │   ├── use-multi-timeline.ts        — 多时间线管理
  │   └── use-snapshot-window.ts       — 三层快照窗口（Pinned/Active/DiffOnly）
  ├── presentation/
  │   ├── TimelineEditor.tsx           — 时间线编辑器主组件
  │   ├── TimelineTrack.tsx            — 轨道组件
  │   ├── NodeDetailPanel.tsx          — 节点详情面板
  │   ├── StateSnapshotView.tsx        — 状态快照视图
  │   ├── CharacterStateTrack.tsx      — 角色状态轨迹
  │   ├── BindingGraph.tsx             — 绑定关系图
  │   ├── BindingCreatorDialog.tsx     — 绑定创建对话框
  │   └── MultiTimelineView.tsx        — 多时间线视图
  └── index.ts                         — barrel（schemas 来自 @/domain/schemas/timeline 的 re-export）
```

⚠️ 注意：核心 schemas（StoryTimeline / PlotNode 等）定义在 `@/domain/schemas/timeline.ts`，模块 index.ts 只是 re-export；修改 schema 要去 domain 层，并同步 contract.json 的 publicAPI。
⚠️ 注意：domain 类型 `MultiTimelineView` 在 barrel 中以别名 `MultiTimelineViewData` 导出，与同名 UI 组件区分。

## 常见修改场景

### 1. 新增 PlotEventType 或状态转换规则
- 修改文件：`@/domain/schemas/timeline.ts`、`@/shared-logic/timeline/state-propagation-engine.ts`（CHARACTER_RULES / SCENE_RULES / CASCADE_RULES）
- 检查不变量：每个 PlotNode 必须有 timelineId 和 order；复杂嵌套类型以 JSON 列存储
- 测试：`npx vitest run src/shared-logic/timeline src/modules/timeline`

### 2. 修改状态推演或快照窗口
- 修改文件：`hooks/use-snapshot-window.ts`、`hooks/use-cascade-update.ts`、`@/shared-logic/timeline/state-propagation-engine.ts`
- 检查不变量：三层快照架构（Pinned/Active/DiffOnly）语义不可破坏
- 测试：`npx vitest run src/modules/timeline`

### 3. 修改绑定或 prompt 增强
- 修改文件：`hooks/use-timeline-binding.ts`、`hooks/use-enhanced-prompt.ts`
- 测试：`npx vitest run src/modules/timeline/hooks`

### 4. 修改编辑器 UI
- 修改文件：`presentation/` 下对应组件
- 测试：`npx vitest run src/modules/timeline`

## 测试验证

- 测试命令：`npx vitest run src/modules/timeline`
- 关联测试：`npx vitest run src/shared-logic/timeline`（状态推演引擎）
