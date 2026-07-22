/**
 * Timeline shared-logic 子模块 barrel
 *
 * 导出状态推演引擎的所有公共 API。
 * 参考 src/shared-logic/video/index.ts 的导出风格（先函数，后类型）。
 */

// ── 主算法 ──
export {
  propagateStates,
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
