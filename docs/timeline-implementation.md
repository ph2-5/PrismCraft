# 时间线变体系统实施指南

> 自动生成于 2026-07-23。基于 `src/shared-logic/timeline/` 实际代码扫描。
> 对应设计文档：`docs/timeline-variant-design.md`
> 对应 Phase：4.6（Q3-1 ~ Q3-10，已全部完成）

---

## 架构概览

时间线变体系统是 PrismCraft 的核心范式升级：把角色和场景的状态看作**故事时间线的函数**，而非独立的配置项。每个 PlotNode 包含剧情事件 + 状态快照 + 状态转换 + 时间线绑定，引擎按时间线顺序推演每个节点的状态。

### 三层快照架构（设计文档第八章）

为治理状态爆炸（100 节点 × 10 角色 × 5 场景 = 5000 完整快照，10-25 MB），系统采用三层快照架构：

```
┌──────────────────────────────────────────────────────────┐
│  Layer 1: PinnedSnapshot（重点标注快照，永久完整）       │
│  触发: 用户手动 / AI 检测到 climax·twist·critical伏笔   │
│  内容: 完整 CharacterStateSnapshot + SceneStateSnapshot  │
│  生命周期: 永久（直到取消标注）                          │
│  数量: 5-15 个/项目                                      │
├──────────────────────────────────────────────────────────┤
│  Layer 2: ActiveSnapshot（滑动窗口完整快照）             │
│  触发: 当前编辑节点 ± N 个节点（默认 N=3）              │
│  内容: 完整快照                                          │
│  生命周期: 滑出窗口时降级为 Layer 3                      │
│  数量: 7 个（窗口大小 2N+1）                             │
├──────────────────────────────────────────────────────────┤
│  Layer 3: DiffOnlySnapshot（差异引用快照，轻量）        │
│  触发: 不在 Pinned 和 Active 窗口内的所有节点            │
│  内容: 仅 StateTransition（变化量）                     │
│  生命周期: 进入 Active 窗口时从最近 Pinned 重算          │
└──────────────────────────────────────────────────────────┘
```

性能目标（设计文档 8.6）：100 节点项目内存减少 > 85%（11 完整快照 vs 100 完整快照）；窗口内含 Pinned 时重算延迟 < 50ms，无 Pinned 时 < 200ms。

### 状态推演引擎核心公式

```
角色在 PlotNode N 的状态 = f(角色在 PlotNode N-1 的状态, PlotNode N 的剧情事件)
场景在 PlotNode N 的状态 = g(场景在 PlotNode N-1 的状态, PlotNode N 的剧情事件)
```

引擎按时间线顺序推演：初始化首节点（角色/场景默认变体）→ 对 i = 2..N，查找对应 `StateTransitionRule` 应用到前节点状态 → 生成当前节点状态快照 → 缓存。

### 级联更新机制

节点变更不需要全量重算 `propagateStates`：
- **DirtyMap**：记录哪些节点的状态快照已过期需要重算。
- **两种模式**：`current_only`（仅重算直接受影响节点，下游保持旧状态）/ `cascade_all`（重算受影响节点及其所有下游，保证全局一致性）。
- **增量重算**：`incrementalUpdate` 仅重算脏节点，非脏节点复用缓存。

### TimelineBinding 注入设计

Prompt 合成时自动注入"前情提要"：
- **10 种 BindingType**：foreshadow / cause_effect / character_arc / scene_continuity / emotional_buildup / mystery_reveal / parallel / callback / irony / user_manual。
- **3 级重要程度**：critical（必须注入）/ important（建议注入）/ optional（token 预算充足时注入）。
- **tokenBudget**：限制注入块大小，防止上下文爆炸。

### 设计文档与实现对应关系

| 设计文档章节 | 实现 Task | 实现文件 |
|------------|----------|---------|
| 第二章 2.3-2.6（PlotEvent / 状态快照） | Q3-1 / Q3-2 | `snapshot-types.ts` + `domain/schemas/timeline.ts` |
| 第三章 3.1（推演算法） | Q3-4 / Task 4.6.2 | `state-propagation-engine.ts` |
| 第三章 3.1（22 种规则） | Q3-4 / Task 4.6.2 | `state-transition-rules.ts` |
| 第三章 3.2（级联更新 + dirty flag） | Q3-5 / Task 4.6.3 | `cascade-update.ts` |
| 第二章 2.7 + 第三章 3.1 步骤 2e + 第四章 + 第六章 | Q3-6 / Task 4.6.4 | `binding-injector.ts` |
| 第七章（时间线编辑器 UI） | Q3-7 / Task 4.6.5 | `modules/timeline/presentation/*` |
| 第四章（增强 Prompt 合成） | Q3-8 / Task 4.6.6 | `prompt-enhancer.ts` |
| 第三章 3.4（多时间线） | Q3-9 / Task 4.6.7 | `cross-timeline-injector.ts` |
| 第八章（滑动窗口 + 重点标注） | Q3-10 / Task 4.6.8 | `pinned-snapshot.ts` + `snapshot-window.ts` |

---

## 模块结构

`src/shared-logic/timeline/` 是纯逻辑层（零外部依赖，仅同目录相对导入）。文件清单与职责：

| 文件 | Task | 职责 |
|------|------|------|
| `snapshot-types.ts` | Q3-1 / Q3-2 | 自包含类型定义（22 种 PlotEventType + PlotEvent + CharacterStateSnapshot + SceneStateSnapshot + StateTransition + 规则接口 + Like 类型） |
| `state-transition-rules.ts` | Q3-4 / Task 4.6.2 | 22 种 PlotEventType 对应的状态转换规则库（CHARACTER_RULES / SCENE_RULES / CASCADE_RULES / NO_OP_EVENTS） |
| `state-propagation-engine.ts` | Q3-4 / Task 4.6.2 | 推演引擎主算法 `propagateStates` + 单步 `computeNextNodeSnapshots` + 级联效果计算 `computeCascadeEffects` |
| `cascade-update.ts` | Q3-5 / Task 4.6.3 | 级联更新与脏标记（markDirty / incrementalUpdate / DirtyMap 序列化） |
| `binding-injector.ts` | Q3-6 / Task 4.6.4 | TimelineBinding 注入层（10 种 BindingType + token 预算控制 + 级联效应） |
| `prompt-enhancer.ts` | Q3-8 / Task 4.6.6 | 增强 Prompt 合成（时间线上下文 + 状态快照 + 绑定注入 → 增强 Prompt） |
| `cross-timeline-injector.ts` | Q3-9 / Task 4.6.7 | 跨时间线绑定注入（多时间线视图 + 时间线关系分层） |
| `pinned-snapshot.ts` | Q3-10 / Task 4.6.8 | 重点快照标注管理（PinnedSnapshot 存储与自动检测） |
| `snapshot-window.ts` | Q3-10 / Task 4.6.8 | 滑动窗口管理（三层快照策略 + 重算优化） |
| `index.ts` | — | 桶文件，导出所有公共 API |
| `__tests__/` | — | 8 个测试套件（binding-injector / cascade-update / cross-timeline-injector / pinned-snapshot / prompt-enhancer / snapshot-window / state-propagation-engine / state-transition-rules） |

UI 层位于 `src/modules/timeline/`（非 shared-logic），通过 hooks 调用本层纯逻辑。

---

## 核心组件

### 1. 状态推演引擎 (`state-propagation-engine.ts`)

**对应 Task**：Q3-4 / Task 4.6.2
**设计文档**：第三章 3.1 节（行 414-436）

#### 算法实现

```typescript
propagateStates(timeline: StoryTimelineLike): PropagationResult
```

1. **首节点初始化**（`initializeCharacterSnapshots` / `initializeSceneSnapshots`）
   - 读取 `PlotNodeLike.characterInitialStates` / `sceneInitialStates`
   - 用默认变体填充 `appearance` / `environment`，`expression` 默认 `"neutral"`，`pose` 默认 `"standing"`，`timeOfDay` 默认 `"day"` 等
   - `stateSource.isModified = false`，`transitions = []`

2. **主循环**：对 i = 2..N，调用 `computeNextNodeSnapshots(prevSnapshots, currentNode, prevNodeId)`
   - `buildPlotEvent(node)` 把 PlotNodeLike 扁平字段构造为 PlotEvent 对象
   - 若 `isCompoundEvent(event.type)`（compound 类型）→ `applyCompoundEvent` 递归处理 `subEvents`
   - 若 `NO_OP_EVENTS.has(event.type)`（narration/dialogue/action）→ 透传前一节点状态 + `createNoOpTransition`
   - 否则：对每个角色快照调用 `applyCharacterRule`，对每个场景快照调用 `applySceneRule`
     - `applyCharacterRule` 查找 `CHARACTER_RULES[event.type]`，若 `parameters.characterId` 匹配则应用规则
     - `applySceneRule` 查找 `SCENE_RULES[event.type]`，若 `parameters.sceneId` 匹配则应用规则；item 事件应用到所有场景快照

3. **输出** `PropagationResult = Map<nodeId, NodeSnapshots>`

#### 公共 API

- `propagateStates(timeline)` — 主入口，全量推演
- `computeNextNodeSnapshots(prevSnapshots, currentNode, prevNodeId)` — 单步逻辑（供 `incrementalUpdate` 复用）
- `computeCascadeEffects(event, timeline)` — 计算事件级联影响的下游节点 ID（用 `CASCADE_RULES`）
- `getNodeSnapshots(propagationResult, nodeId)` / `getAllSnapshots(propagationResult)` — 查询

#### 关键设计

- **零外部依赖**：仅导入 `./snapshot-types` + `./state-transition-rules`。
- **不可变快照**：`applyCharacterRule` / `applySceneRule` 不修改原快照，返回新对象（`cloneCharacterSnapshot` / `cloneSceneSnapshot` 浅克隆嵌套字段）。
- **生成 ID**：`generateId(prefix)` = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`（不依赖 crypto）。

### 2. 级联更新与脏标记 (`cascade-update.ts`)

**对应 Task**：Q3-5 / Task 4.6.3
**设计文档**：第三章 3.2 节（行 549-572）+ 第八章 8.9 节（行 1205-1217）

#### 核心类型

```typescript
type CascadeUpdateMode = "current_only" | "cascade_all";
type DirtyLevel = "direct" | "propagated";
interface DirtyEntry { nodeId; sourceNodeId; reason; timestamp; level: DirtyLevel; }
type DirtyMap = Map<string, DirtyEntry>;
interface IncrementalUpdateResult {
  snapshots: PropagationResult;
  recomputedNodeIds: string[];
  skippedNodeIds: string[];
}
```

#### `markDirty` 算法

```typescript
markDirty(affectedNodeIds, timeline, mode = "cascade_all", prevDirtyMap?): DirtyMap
```

1. 从 `prevDirtyMap` 克隆起始（追加式合并，不丢失历史标记）。
2. **Step 1**：对每个 affectedNodeId 标记为 `direct` 脏。
3. **Step 2**（仅 `cascade_all` 模式）：找到最早的受影响节点 `order`，把所有 `order` 更大的下游节点标记为 `propagated` 脏。
4. 返回新的 DirtyMap。

#### `incrementalUpdate` 算法

仅重算脏节点，非脏节点复用缓存：
- 遍历 timeline.nodes，对每个脏节点调用 `computeNextNodeSnapshots(prevSnapshots, currentNode, prevNodeId)` 重算
- 非脏节点直接复用 `prevPropagationResult` 中的快照
- 返回 `IncrementalUpdateResult`（包含 `recomputedNodeIds` / `skippedNodeIds`）

#### 公共 API

- `markDirty` / `incrementalUpdate` — 主算法
- `isDirty(dirtyMap, nodeId)` / `getDirtyEntry(dirtyMap, nodeId)` / `getDirtyNodeIds(dirtyMap)` / `getDirectDirtyNodeIds(dirtyMap)` — 查询
- `clearDirty(dirtyMap, nodeId)` / `clearAllDirty(dirtyMap)` — 清除
- `serializeDirtyMap(dirtyMap)` / `deserializeDirtyMap(data)` — 持久化

#### UI 层封装

`src/modules/timeline/hooks/use-cascade-update.ts` 提供 React 友好的 `useCascadeUpdate` Hook（管理 `DirtyMap` useState + `CascadeUpdateMode` useState + stableActions 模式缓存所有 action 引用）。

### 3. TimelineBinding 注入层 (`binding-injector.ts`)

**对应 Task**：Q3-6 / Task 4.6.4
**设计文档**：第二章 2.7 节（行 362-405）+ 第三章 3.1 步骤 2e + 第四章 + 第六章（行 909-913）

#### 核心类型

- **10 种 BindingType**：foreshadow / cause_effect / character_arc / scene_continuity / emotional_buildup / mystery_reveal / parallel / callback / irony / user_manual
- **3 级 BindingImportance**：critical（必须注入，跳过破坏剧情连贯）/ important（建议注入）/ optional（token 充足时注入）
- **BindingPropagation**：`autoInject: boolean`（是否自动注入）/ `injectToNodes: string[]`（额外注入节点）/ `cascadeEffect: boolean`（是否级联到下游）
- **BindingForInjection**：完整绑定形状，兼容 `TimelineBindingLike` 的最小形状（缺失字段用默认值填充：`autoInject` 默认 true、`cascadeEffect` 默认 false）
- **TokenBudget**：限制注入块大小，防止上下文爆炸
- **InjectionResult**：成功注入的绑定 + 跳过的绑定（带 SkipReason）

#### 公共 API

- `normalizeBinding(binding)` — 把 `TimelineBindingLike` 归一化为 `BindingForInjection`（缺失字段补默认值）
- `estimateTokenCount(text)` — 估算文本 token 数
- `injectBindings(targetNodeId, bindings, timeline, tokenBudget?)` — 主算法，返回 `InjectionResult`
- `buildInjectionBlock(injectedBindings)` — 把绑定列表合成"【前情提要 - 自动注入】..."格式文本块
- `computeCascadeAffectedNodeIds(binding, timeline)` — 计算 binding 级联效应影响的下游节点
- `getInjectableBindings(bindings)` / `getNodeBindings(bindings, nodeId)` / `getDownstreamNodeIds(timeline, nodeId)` / `extractBindingsFromTimeline(timeline)` — 查询辅助

#### 与推演引擎的关系

推演引擎输出节点状态快照，注入层读取快照 + 绑定，合成最终 Prompt。引擎关注"状态如何变化"，注入层关注"如何把变化反馈给 AI"。

### 4. 时间线编辑器 UI

**对应 Task**：Q3-7 / Task 4.6.5
**实现位置**：`src/modules/timeline/presentation/`（**不在 shared-logic 层**，因为含 React/JSX）

| 组件 | 文件 | 职责 |
|------|------|------|
| `TimelineEditor` | `TimelineEditor.tsx` | 时间线编辑器主体（组合 TimelineTrack + NodeDetailPanel + 各子视图） |
| `TimelineTrack` | `TimelineTrack.tsx` | 时间线轨道视图（节点序列可视化 + 当前编辑位置高亮） |
| `NodeDetailPanel` | `NodeDetailPanel.tsx` | 节点详情面板（展示/编辑 PlotEvent + 状态快照） |
| `StateSnapshotView` | `StateSnapshotView.tsx` | 状态快照视图（CharacterStateSnapshot + SceneStateSnapshot） |
| `CharacterStateTrack` | `CharacterStateTrack.tsx` | 角色状态轨道（单角色跨节点状态演变） |
| `BindingGraph` | `BindingGraph.tsx` | 绑定关系图（节点间的 BindingType 边可视化） |
| `BindingCreatorDialog` | `BindingCreatorDialog.tsx` | 绑定创建对话框（用户手动添加 `user_manual` 绑定） |

UI 层通过 `src/modules/timeline/hooks/` 中的 Hook 调用 shared-logic 纯逻辑：
- `use-cascade-update.ts` — 封装 `cascade-update.ts`
- `use-timeline-binding.ts` — 封装 `binding-injector.ts`
- `use-enhanced-prompt.ts` — 封装 `prompt-enhancer.ts`
- `use-multi-timeline.ts` — 封装 `cross-timeline-injector.ts`
- `use-snapshot-window.ts` — 封装 `snapshot-window.ts` + `pinned-snapshot.ts`

### 5. 增强 Prompt 合成

**对应 Task**：Q3-8 / Task 4.6.6
**实现位置**：`src/shared-logic/timeline/prompt-enhancer.ts`

#### 增强公式（设计文档第四章）

```
Prompt = 时间线上下文 + 片段文本 + 角色状态快照 + 场景状态快照 + 绑定注入
```

#### 输出示例（设计文档 4.2 节）

```
【时间线位置】第2章 · 第3段（PlotNode_6）
【前情提要 - 自动注入】...
【角色状态】角色"零"：战斗服（破损），右臂受伤...
【场景状态】场景"新东京"：深夜暴雨，破坏程度30%...
【剧情事件】零与影的最终对决...
【合成 Prompt】<basePrompt>
```

#### 公共 API

- `enhancePrompt(nodeId, basePrompt, timeline, propagationResult, bindings, options?)` — 主函数，返回 `EnhancedPrompt`
- `formatTimelinePosition(timeline, nodeId)` — 格式化"第X章 · 第Y段"
- `formatCharacterStates(snapshots)` / `formatSceneStates(snapshots)` — 格式化角色/场景状态块
- `formatPlotEvent(event)` — 格式化剧情事件块
- `assembleFinalPrompt(sections, basePrompt)` — 拼接最终 Prompt
- `batchEnhancePrompts(nodeIds, basePrompts, timeline, propagationResult, bindings)` — 批量增强

#### 类型

- `PromptSections` — 各组成部分（timelinePosition / bindingInjection / characterStates / sceneStates / plotEvent）
- `EnhancedPrompt` — 完整结果（含 `finalPrompt` / `sections` / `injectionResult` / `characterSnapshots` / `sceneSnapshots` / `estimatedTokens`）

UI 封装：`src/modules/timeline/hooks/use-enhanced-prompt.ts` 提供 `useEnhancedPrompt` Hook。

### 6. 多时间线支持

**对应 Task**：Q3-9 / Task 4.6.7
**实现位置**：`src/shared-logic/timeline/cross-timeline-injector.ts` + `src/modules/timeline/domain/multi-timeline-types.ts`

#### 核心类型（shared-logic 内联定义，零依赖）

- **6 种 CrossTimelineBindingType**：foreshadow / callback / parallel / cause_effect / mystery_reveal / user_manual（跨时间线场景常见类型）
- **6 种 TimelineRelationshipType**：prequel / sequel / parallel / flashback / flashforward / alternate
- **CrossTimelineBindingLike** — 跨时间线绑定最小形状（`sourceTimelineId` / `sourceNodeId` / `targetTimelineId` / `targetNodeId` + `injectionText` + `importance` + `relationshipDescription?` + `autoInject?` + `cascadeEffect?` + `aiDetected?` + `userConfirmed?`）
- **MultiTimelineLike** — 多时间线视图（`timelineIds: string[]` + `relationships: TimelineRelationshipLike[]` + `crossTimelineBindings: CrossTimelineBindingLike[]`）

#### 公共 API

- `injectCrossTimelineBindings(targetNodeId, targetTimelineId, basePrompt, multiTimeline, options?)` — 主算法，返回 `CrossTimelineInjectionResult`
- `normalizeCrossTimelineBinding(binding)` — 归一化（缺失字段补默认值）
- `buildCrossTimelineInjectionBlock(injectedBindings, sourceTimelineId)` — 合成跨时间线注入块
- `findRelationship(fromTimelineId, toTimelineId, multiTimeline)` — 查找两个时间线的关系
- `getInboundCrossTimelineBindings(timelineId, multiTimeline)` / `getOutboundCrossTimelineBindings(timelineId, multiTimeline)` — 查询入站/出站绑定
- `getBindingsBetweenTimelines(fromId, toId, multiTimeline)` — 查询两时间线间的绑定
- `getTimelineRelationships(timelineId, multiTimeline)` — 获取时间线的所有关系
- `computeTimelineLayers(timelineId, multiTimeline)` — 计算时间线层级（用于 UI 分层展示）

#### 与 binding-injector 的关系

`binding-injector` 处理同一时间线内的绑定注入；`cross-timeline-injector` 处理跨时间线的绑定注入。两者可组合使用：先注入同时间线绑定，再注入跨时间线绑定。

UI 封装：`src/modules/timeline/hooks/use-multi-timeline.ts` 提供 `useMultiTimeline` Hook + `src/modules/timeline/presentation/MultiTimelineView.tsx` 多时间线视图。

### 7. 滑动窗口 + 重点标注

**对应 Task**：Q3-10 / Task 4.6.8
**实现位置**：`src/shared-logic/timeline/pinned-snapshot.ts` + `src/shared-logic/timeline/snapshot-window.ts`

#### 7.1 PinnedSnapshot 标注（`pinned-snapshot.ts`）

##### 类型

- **PinReason**：`manual` / `auto_climax` / `auto_twist` / `auto_critical_foreshadow` / `auto_character_arc_midpoint`
- **PinnedBy**：`user` / `ai`
- **PinnedSnapshotEntry**：`nodeId` + `reason` + `pinnedAt` + `pinnedBy`
- **PinnedSnapshotStore**：`entries: Map<string, PinnedSnapshotEntry>`（Map 便于 O(1) 查询）

##### 自动标注规则（设计文档第八章）

- `PlotEvent.type === "climax" | "twist"` → 自动 Pinned（`auto_climax` / `auto_twist`）
- `PlotEvent.type === "foreshadow"` 且 `binding.importance === "critical"` → 自动 Pinned（`auto_critical_foreshadow`）
- `character_arc` binding 的中点 → 自动 Pinned（`auto_character_arc_midpoint`）

##### 公共 API

- `createPinnedSnapshotStore()` — 创建空存储
- `pinNode(store, nodeId, reason, pinnedBy, pinnedAt?)` / `unpinNode(store, nodeId)` — 不可变操作，返回新 store
- `isPinned(store, nodeId)` / `getPinnedEntry(store, nodeId)` / `getPinnedNodeIds(store)` / `getPinnedCount(store)` — 查询
- `shouldAutoPin(node, bindings)` — 判断节点是否应自动标注
- `autoPinFromTimeline(timeline, bindings)` — 扫描整个时间线自动标注
- `getPinnedByReason(store, reason)` / `getPinnedBy(store, pinnedBy)` — 按原因/标注者查询
- `serializePinnedStore(store)` / `deserializePinnedStore(data)` — 持久化

#### 7.2 滑动窗口管理（`snapshot-window.ts`）

##### 三层快照策略

```typescript
type SnapshotStrategy = "pinned" | "active" | "diff_only";
```

- `pinned`：PinnedSnapshot 节点，永久缓存完整快照
- `active`：窗口内节点，缓存完整快照，滑出窗口时降级
- `diff_only`：其余节点，不缓存完整快照（仅存 transition，由 `propagationResult` 提供）

##### `SnapshotStore` 结构

```typescript
interface SnapshotStore {
  pinned: PinnedSnapshotStore;        // PinnedSnapshot 存储
  window: WindowState;                 // 窗口状态（centerNodeId + windowSize + activeNodeIds）
  cachedSnapshots: Map<string, NodeSnapshots>;  // 完整快照缓存（仅 pinned + active 节点）
}
```

##### 公共 API

- `createSnapshotStore(pinned, config?)` — 创建存储（默认 `windowSize = DEFAULT_WINDOW_SIZE = 3`）
- `initWindow(store, centerNodeId, timeline)` — 初始化窗口（计算 active 节点集合）
- `getSnapshotStrategy(nodeId, store)` — 计算节点的快照策略（pinned 优先，其次 active，否则 diff_only）
- `slideWindow(store, newCenterNodeId, timeline)` — 窗口滑动（降级旧节点、升级新节点、清理缓存）
- `getSnapshot(store, nodeId, timeline, propagationResult)` — 获取快照（命中缓存或增量重算）
- `getWindowNodes(store)` / `getPinnedInWindow(store)` / `getCachedCount(store)` / `getCenterNode(store)` — 查询

##### 重算优化（设计文档 8.5）

窗口内含 Pinned 时，从最近的 Pinned 节点重算到当前节点（典型 3 节点，~30ms）；无 Pinned 时从窗口边缘重算（最坏 22 节点，~200ms）。

UI 封装：`src/modules/timeline/hooks/use-snapshot-window.ts` 提供 `useSnapshotWindow` Hook。

---

## 数据模型

所有类型定义于 `src/shared-logic/timeline/snapshot-types.ts`（**shared-logic 层零依赖，所有类型内联定义**，不从 `@/domain` 或任何项目层导入）。持久化层 Schema 定义于 `src/domain/schemas/timeline.ts`（zod）。

### PlotEventType（22 种剧情事件，与 domain/schemas/timeline.ts 同步）

```
角色事件：character_introduce / character_transform / character_injury /
         character_emotion_change / character_reveal_secret / character_relationship_change
场景事件：scene_change / scene_destruction / scene_transform
道具事件：item_introduce / item_use / item_destroy
设定事件：world_rule_reveal
结构事件：foreshadow / callback / climax / twist / resolution
复合事件：compound
通用事件：narration / dialogue / action
```

### PlotEvent

```typescript
interface PlotEvent {
  id: string;
  nodeId: string;
  type: PlotEventType;
  description: string;
  parameters: PlotEventParameters;  // 含 characterId / sceneId / itemId / emotion / severity 等可选字段
  aiAnalysis?: PlotEventAIAnalysis;  // foreshadows / callbacks / emotionalTone / narrativeFunction
}
```

### Injury（角色伤势，设计文档 250-256）

```typescript
interface Injury {
  type: string;
  location: string;
  severity: "minor" | "moderate" | "severe";
  causeEventId: string;
  recoveredInNodeId?: string;
}
```

### CharacterStateSnapshot（设计文档 213-248）

```typescript
interface CharacterStateSnapshot {
  nodeId: string;
  characterId: string;
  appearance: {
    variantId: string;
    outfit: string;
    expression: string;
    pose: string;
    injuries: Injury[];
    accessories: string[];
  };
  innerState: {
    emotion: string;
    motivation: string;
    secretRevealed: string[];
    relationshipStatus: Record<string, string>;  // 使用 Record 便于 JSON 序列化
  };
  abilityState: {
    abilitiesActive: string[];
    abilitiesRevealed: string[];
    powerLevel: number;
  };
  stateSource: {
    baseVariantId: string;
    transitions: StateTransition[];
    isModified: boolean;
  };
}
```

### AtmosphereChange（设计文档 300-305）

```typescript
interface AtmosphereChange {
  causeEventId: string;
  fromMood: string;
  toMood: string;
  description: string;
}
```

### SceneStateSnapshot（设计文档 264-299）

```typescript
interface SceneStateSnapshot {
  nodeId: string;
  sceneId: string;
  environment: {
    variantId: string;
    timeOfDay: string;
    weather: string;
    lighting: string;
    mood: string;
    destructionLevel: number;
    crowdLevel: string;
    atmosphereChanges: AtmosphereChange[];
  };
  entities: {
    charactersPresent: string[];
    itemsPresent: string[];
    environmentalObjects: string[];
  };
  persistentChanges: {
    addedObjects: string[];
    removedObjects: string[];
    modifiedObjects: Array<{ object: string; change: string; causeEventId: string; }>;
  };
}
```

### StateTransition（设计文档 313-359）

```typescript
interface CharacterTransition {
  characterId: string;
  changeType: "variant_change" | "injury_add" | "injury_heal" | "emotion_change" |
              "ability_reveal" | "secret_reveal" | "relationship_change" | "accessory_change";
  fromState: string;
  toState: string;
  cause: string;
  narrativeImpact: string;
}

interface SceneTransition {
  sceneId: string;
  changeType: "variant_change" | "destruction_increase" | "object_add" |
              "object_remove" | "object_modify" | "atmosphere_change" | "crowd_change";
  fromState: string;
  toState: string;
  cause: string;
}

interface StateTransition {
  id: string;
  nodeId: string;
  previousNodeId: string;
  trigger: {
    type: "plot_event" | "time_passage" | "user_manual" | "auto_propagate";
    eventId?: string;
    timeDelta?: number;
    userAction?: string;
  };
  characterChanges: CharacterTransition[];
  sceneChanges: SceneTransition[];
  narrativeDescription: string;
  visualDescription: string;
}
```

### 规则接口

```typescript
interface CharacterStateRule {
  apply: (prevState: CharacterStateSnapshot, event: PlotEvent) => CharacterStateSnapshot;
}
interface SceneStateRule {
  apply: (prevState: SceneStateSnapshot, event: PlotEvent) => SceneStateSnapshot;
}
interface CascadeRule {
  propagate: (event: PlotEvent, timeline: StoryTimelineLike) => string[];
}
```

### Like 类型（引擎契约）

- **TimelineBindingLike**（设计文档 362-407）：`id` / `type` / `sourceNodeId` / `targetNodeId` / `injectionText?` / `importance?`
- **CharacterInitialState** / **SceneInitialState**：首节点初始化用
- **PlotNodeLike**：与 `domain/schemas/timeline.ts` 的 `PlotNode` schema 兼容，仅声明引擎所需字段（`id` / `order` / `plotEventType` / `plotEventDescription` / `plotEventParameters` / `plotEventId?` / `aiAnalysis?` / `characterInitialStates?` / `sceneInitialStates?` / `chapterIndex?` / `chapterTitle?`）
- **StoryTimelineLike**：`id` / `nodes: PlotNodeLike[]` / `bindings: TimelineBindingLike[]`

### 输入/输出类型

- **NodeSnapshots**：`nodeId` + `characterSnapshots` + `sceneSnapshots` + `transitions`
- **PropagationResult** = `Map<string, NodeSnapshots>`

### 持久化层 Schema（`src/domain/schemas/timeline.ts`，zod）

- **StoryTimeline**：`id` / `projectId`（默认 `"default"`）/ `name` / `description` / `type: "main"|"branch"|"flashback"` / `isParallel` / `parentTimelineId?` / `mergeNodeId?` / `bindings`（JSON）/ `metadata`
- **PlotNode**：`id` / `timelineId` / `order` / `chapterIndex?` / `chapterTitle?` / `segmentId?`（关联 NovelSegment）/ `beatId?`（关联 StoryBeat）/ `plotEventType` / `plotEventDescription` / `plotEventParameters` / `aiAnalysis?` / `characterSnapshots` / `sceneSnapshots` / `transitions` / `bindings` / `snapshotStrategy` / `cachedPrompt?`
- **SnapshotStrategy**（zod enum）：`"pinned" | "active" | "diff_only"`（与 shared-logic 的 `SnapshotStrategy` 保持同步）

复杂嵌套类型（CharacterStateSnapshot / SceneStateSnapshot / StateTransition / TimelineBinding）在持久化层以 JSON 列存储（`z.record(z.string(), z.unknown())`），完整类型由 shared-logic 层提供。

---

## 与 Novel 模块的联动

### StalenessTracker 与 DirtyMap 的关系

时间线变体的 dirty flag 是 Novel 模块 `StalenessTracker` 的**超集**（设计文档 3.2 节）：

```
novel 模块 StalenessTracker（src/modules/novel/integration/services/staleness-tracker.ts）
  追踪：故事结构变更 → 哪些派生数据过期（跨域传播）
  数据结构：Map<StalenessTarget, StaleEntry[]>
  事件：novel:stale-changed / novel:auto-recompute / novel:stale-cleared

timeline 模块 DirtyMap（src/shared-logic/timeline/cascade-update.ts）
  追踪：时间线节点变更 → 哪些下游节点状态过期（时序传播）
  数据结构：Map<nodeId, DirtyEntry>
  无事件（纯逻辑，事件由 UI 层 Hook 触发）
```

### 完整联动链路（设计文档 3.2 节）

```
上游 novel 模块的结构变更（如用户编辑 StoryStructure.beats）
        │
        ▼ novel 模块
triggerDispatcher.notifyChange("structure", "用户调整了故事结构 beats")
        │
        ▼ stalenessTracker.markStale
        │   标记 pacing/importance/prompt/overview 为 stale
        │   emit "novel:stale-changed"（UI 显示"已过期"标记）
        │
        ▼ 跨模块：timeline 模块监听 novel 事件
        │   （由调用方在 use-cascade-update.ts 中订阅）
        │
        ▼ timeline 模块
markDirty(affectedNodeIds, timeline, "cascade_all")
        │   标记受影响节点 + 所有下游节点为脏
        │
        ▼ 用户切换到 timeline 视图时
incrementalUpdate(dirtyMap, timeline, prevPropagationResult)
        │   仅重算脏节点，非脏节点复用缓存
        │
        ▼ 重算完成后
clearAllDirty(dirtyMap) + 通知 UI 刷新
```

### 数据回溯字段（Q2-1）

`PlotNode` schema 包含 Q2-1 的原文回溯锚点：
- `PlotNode.segmentId ↔ NovelSegment.id`
- `PlotNode.chapterIndex ↔ NovelSegment.chapterIndex`（1-based，与 NovelSegment 对应）
- `PlotNode.chapterTitle ↔ NovelSegment.chapterTitle`
- `PlotNode.beatId ↔ StoryBeat.id`（可选直接关联）

### 状态快照 variantId 关联

状态快照中的 `appearance.variantId` / `environment.variantId` ↔ Novel 模块的 `CharacterVariant.id` / `SceneVariant.id`（Q3-1）。Novel 的 8 维参数向量（`timeOfDay` / `weather` / `lighting` / `mood` / `crowdLevel` / `cameraAngle` / `season` / `colorPalette`）与 timeline 的 `SceneStateSnapshot.environment` 字段对应。

### 跨层依赖的合规性

timeline 模块（modules 层）→ timeline shared-logic（纯逻辑层）的调用是合规的（modules → shared-logic 允许）。但 shared-logic/timeline 不反向依赖 modules/novel，所有 Novel 相关类型通过 `Like` 接口（`PlotNodeLike` / `StoryTimelineLike` / `TimelineBindingLike`）声明所需最小形状，避免跨层耦合。

---

## 零依赖原则

依据 `architecture-rules.md` 的 Shared-Logic Layer Rules：

### 结构约束

```
src/shared-logic/timeline/
  ├── snapshot-types.ts        → 零外部依赖（类型自包含）
  ├── state-transition-rules.ts → 仅导入 ./snapshot-types
  ├── state-propagation-engine.ts → 仅导入 ./snapshot-types + ./state-transition-rules
  ├── cascade-update.ts        → 仅导入 ./snapshot-types + ./state-propagation-engine
  ├── binding-injector.ts      → 仅导入 ./snapshot-types
  ├── prompt-enhancer.ts       → 仅导入 ./snapshot-types + ./binding-injector + ./state-propagation-engine
  ├── cross-timeline-injector.ts → 零外部依赖（所有类型内联定义）
  ├── pinned-snapshot.ts       → 仅导入 ./snapshot-types
  ├── snapshot-window.ts       → 仅导入 ./snapshot-types + ./state-propagation-engine + ./pinned-snapshot
  └── index.ts                 → 桶文件
```

### 强制规则

- **ZERO external dependencies**：不导入 `@/` / `@shared/` / `@domain/` / `@shared-logic/*`（其他子目录）/ 任何项目层
- **Only relative imports within `shared-logic/` directory**：仅同目录相对导入
- **All types must be self-contained**：所有类型内联定义（`PlotEventType` 与 `domain/schemas/timeline.ts` 同步但独立定义字面量联合类型）
- **No logger dependencies**：调用方处理日志
- **No I/O — pure functions only**：纯函数，无副作用

### 类型同步策略

`PlotEventType`（22 种）与 `src/domain/schemas/timeline.ts` 的 `plotEventTypeSchema` 保持同步，但本层独立定义字面量联合类型，避免跨层依赖。`SnapshotStrategy` 同理（`"pinned" | "active" | "diff_only"`）。

### 与持久化层的边界

`domain/schemas/timeline.ts`（持久化层）以 `z.record(z.string(), z.unknown())` 存储复杂嵌套类型（CharacterStateSnapshot / SceneStateSnapshot 等），完整类型由 shared-logic 层提供。modules/timeline 层通过 DI container 访问 storage，从 DB 读取后用 shared-logic 的类型断言为完整对象。

---

## 实施进度

Phase 4.6 全部 8 个 Task（Q3-3 ~ Q3-10，对应 Task 4.6.1 ~ 4.6.8）已完成。各 Task 的实现位置见上文"核心组件"章节，测试覆盖见 `src/shared-logic/timeline/__tests__/`（8 个测试套件）。

> Q3-1 / Q3-2（PlotEvent / 状态快照类型建模）由 `domain/schemas/timeline.ts` + `shared-logic/timeline/snapshot-types.ts` 共同承载，属于建模阶段的早期工作。
