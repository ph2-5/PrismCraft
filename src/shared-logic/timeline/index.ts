/**
 * Timeline shared-logic 子模块 barrel
 *
 * 导出状态推演引擎的所有公共 API。
 * 参考 src/shared-logic/video/index.ts 的导出风格（先函数，后类型）。
 */

// ── 主算法 ──
export {
  propagateStates,
  computeNextNodeSnapshots,
  computeCascadeEffects,
  getNodeSnapshots,
  getAllSnapshots,
} from "./state-propagation-engine";

// ── 规则库 ──
export {
  CHARACTER_RULES,
  SCENE_RULES,
  CASCADE_RULES,
  NO_OP_EVENTS,
  isCharacterEvent,
  isSceneEvent,
  isNoOpEvent,
  isCompoundEvent,
  createNoOpTransition,
} from "./state-transition-rules";

// ── 级联更新与脏标记 ──
export {
  markDirty,
  incrementalUpdate,
  isDirty,
  getDirtyEntry,
  getDirtyNodeIds,
  getDirectDirtyNodeIds,
  clearDirty,
  clearAllDirty,
  serializeDirtyMap,
  deserializeDirtyMap,
} from "./cascade-update";
export type {
  CascadeUpdateMode,
  DirtyLevel,
  DirtyEntry,
  DirtyMap,
  IncrementalUpdateResult,
} from "./cascade-update";

// ── TimelineBinding 注入层 ──
export {
  normalizeBinding,
  estimateTokenCount,
  injectBindings,
  buildInjectionBlock,
  computeCascadeAffectedNodeIds,
  getInjectableBindings,
  getNodeBindings,
  getDownstreamNodeIds,
  extractBindingsFromTimeline,
} from "./binding-injector";
export type {
  BindingType,
  BindingImportance,
  BindingPropagation,
  BindingForInjection,
  InjectedBindingInfo,
  SkippedBindingInfo,
  SkipReason,
  TokenBudget,
  InjectionResult,
} from "./binding-injector";

// ── 增强 Prompt 合成 ──
export {
  enhancePrompt,
  formatTimelinePosition,
  formatCharacterStates,
  formatSceneStates,
  formatPlotEvent,
  assembleFinalPrompt,
  batchEnhancePrompts,
} from "./prompt-enhancer";
export type {
  PromptSections,
  EnhancedPrompt,
} from "./prompt-enhancer";

// ── 跨时间线绑定注入（Q3-9 / Task 4.6.7）──
export {
  injectCrossTimelineBindings,
  normalizeCrossTimelineBinding,
  buildCrossTimelineInjectionBlock,
  findRelationship,
  getInboundCrossTimelineBindings,
  getOutboundCrossTimelineBindings,
  getBindingsBetweenTimelines,
  getTimelineRelationships,
  computeTimelineLayers,
} from "./cross-timeline-injector";
export type {
  CrossTimelineBindingType,
  TimelineRelationshipType,
  CrossTimelineBindingLike,
  TimelineRelationshipLike,
  MultiTimelineLike,
  CrossTimelineInjectionResult,
  CrossTimelineSkipReason,
  TimelineLayerInfoLike,
} from "./cross-timeline-injector";

// ── 重点快照标注（Q3-10 / Task 4.6.8）──
export {
  createPinnedSnapshotStore,
  pinNode,
  unpinNode,
  isPinned,
  getPinnedEntry,
  getPinnedNodeIds,
  getPinnedCount,
  shouldAutoPin,
  autoPinFromTimeline,
  getPinnedByReason,
  getPinnedBy,
  serializePinnedStore,
  deserializePinnedStore,
} from "./pinned-snapshot";
export type {
  PinReason,
  PinnedBy,
  PinnedSnapshotEntry,
  PinnedSnapshotStore,
} from "./pinned-snapshot";

// ── 滑动窗口管理（Q3-10 / Task 4.6.8）──
export {
  createSnapshotStore,
  initWindow,
  getSnapshotStrategy,
  slideWindow,
  getSnapshot,
  getWindowNodes,
  getPinnedInWindow,
  getCachedCount,
  getCenterNode,
  DEFAULT_WINDOW_SIZE,
} from "./snapshot-window";
export type {
  SnapshotStrategy,
  WindowConfig,
  WindowState,
  SnapshotStore,
} from "./snapshot-window";

// ── 类型 ──
export type {
  PlotEventType,
  PlotEventParameters,
  PlotEventAIAnalysis,
  PlotEvent,
  Injury,
  CharacterStateSnapshot,
  AtmosphereChange,
  SceneStateSnapshot,
  CharacterTransition,
  SceneTransition,
  StateTransition,
  CharacterStateRule,
  SceneStateRule,
  CascadeRule,
  TimelineBindingLike,
  CharacterInitialState,
  SceneInitialState,
  PlotNodeLike,
  StoryTimelineLike,
  NodeSnapshots,
  PropagationResult,
} from "./snapshot-types";
