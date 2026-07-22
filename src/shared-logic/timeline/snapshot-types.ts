/**
 * Q3-4 / Task 4.6.2 — 状态推演引擎类型定义
 *
 * 本文件为 shared-logic/timeline/ 子模块的自包含类型定义。
 * 依据 architecture-rules.md，shared-logic 层零外部依赖，
 * 所有类型必须内联定义，不得从 @/domain 或任何项目层导入。
 *
 * 设计来源：docs/timeline-variant-design.md 第二章 2.3-2.6 + 第三章 3.1
 *
 * 注意：PlotEventType 与 src/domain/schemas/timeline.ts 的 22 种枚举保持同步，
 * 但本文件独立定义字面量联合类型，避免跨层依赖。
 */

// ─────────────────────────────────────────────────────────────
// PlotEventType — 22 种剧情事件类型（与 domain/schemas/timeline.ts 同步）
// ─────────────────────────────────────────────────────────────

export type PlotEventType =
  | "character_introduce"
  | "character_transform"
  | "character_injury"
  | "character_emotion_change"
  | "character_reveal_secret"
  | "character_relationship_change"
  | "scene_change"
  | "scene_destruction"
  | "scene_transform"
  | "item_introduce"
  | "item_use"
  | "item_destroy"
  | "world_rule_reveal"
  | "foreshadow"
  | "callback"
  | "climax"
  | "twist"
  | "resolution"
  | "compound"
  | "narration"
  | "dialogue"
  | "action";

// ─────────────────────────────────────────────────────────────
// PlotEvent — 剧情事件
// ─────────────────────────────────────────────────────────────

/**
 * PlotEventParameters — 事件参数（按事件类型可选填充）
 *
 * 设计文档 docs/timeline-variant-design.md:176-205
 * 使用 index signature 允许扩展字段，同时声明已知字段。
 */
export interface PlotEventParameters {
  // character 事件
  characterId?: string;
  newVariantId?: string;
  previousVariantId?: string;
  injuryType?: string;
  injuryLocation?: string;
  severity?: "minor" | "moderate" | "severe";
  secretType?: string;
  revealedTo?: string[];
  emotion?: string;
  relationshipId?: string;
  newRelationshipStatus?: string;
  // scene 事件
  sceneId?: string;
  transitionType?: "cut" | "fade" | "dissolve";
  timeOfDay?: string;
  weather?: string;
  lighting?: string;
  mood?: string;
  // item 事件
  itemId?: string;
  itemName?: string;
  // 伏笔/回调
  targetSegmentId?: string;
  foreshadowDescription?: string;
  // compound
  subEvents?: PlotEvent[];
  [key: string]: unknown;
}

export interface PlotEventAIAnalysis {
  foreshadows: string[];
  callbacks: string[];
  emotionalTone: string;
  narrativeFunction: string;
}

export interface PlotEvent {
  id: string;
  nodeId: string;
  type: PlotEventType;
  description: string;
  parameters: PlotEventParameters;
  aiAnalysis?: PlotEventAIAnalysis;
}

// ─────────────────────────────────────────────────────────────
// Injury — 角色伤势
// 设计文档 docs/timeline-variant-design.md:250-256
// ─────────────────────────────────────────────────────────────

export interface Injury {
  type: string;
  location: string;
  severity: "minor" | "moderate" | "severe";
  causeEventId: string;
  recoveredInNodeId?: string;
}

// ─────────────────────────────────────────────────────────────
// CharacterStateSnapshot — 角色状态快照
// 设计文档 docs/timeline-variant-design.md:213-248
// ─────────────────────────────────────────────────────────────

export interface CharacterStateSnapshot {
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
    /** relationshipStatus 使用 Record 而非 Map，便于 JSON 序列化 */
    relationshipStatus: Record<string, string>;
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

// ─────────────────────────────────────────────────────────────
// AtmosphereChange — 场景氛围变化
// 设计文档 docs/timeline-variant-design.md:300-305
// ─────────────────────────────────────────────────────────────

export interface AtmosphereChange {
  causeEventId: string;
  fromMood: string;
  toMood: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────
// SceneStateSnapshot — 场景状态快照
// 设计文档 docs/timeline-variant-design.md:264-299
// ─────────────────────────────────────────────────────────────

export interface SceneStateSnapshot {
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
    modifiedObjects: Array<{
      object: string;
      change: string;
      causeEventId: string;
    }>;
  };
}

// ─────────────────────────────────────────────────────────────
// StateTransition — 状态转换记录
// 设计文档 docs/timeline-variant-design.md:313-359
// ─────────────────────────────────────────────────────────────

export interface CharacterTransition {
  characterId: string;
  changeType:
    | "variant_change"
    | "injury_add"
    | "injury_heal"
    | "emotion_change"
    | "ability_reveal"
    | "secret_reveal"
    | "relationship_change"
    | "accessory_change";
  fromState: string;
  toState: string;
  cause: string;
  narrativeImpact: string;
}

export interface SceneTransition {
  sceneId: string;
  changeType:
    | "variant_change"
    | "destruction_increase"
    | "object_add"
    | "object_remove"
    | "object_modify"
    | "atmosphere_change"
    | "crowd_change";
  fromState: string;
  toState: string;
  cause: string;
}

export interface StateTransition {
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

// ─────────────────────────────────────────────────────────────
// StateTransitionRule — 状态转换规则
// 设计文档 docs/timeline-variant-design.md:441-545
// ─────────────────────────────────────────────────────────────

/**
 * 角色状态规则：对单个 CharacterStateSnapshot 应用转换
 */
export interface CharacterStateRule {
  apply: (
    prevState: CharacterStateSnapshot,
    event: PlotEvent,
  ) => CharacterStateSnapshot;
}

/**
 * 场景状态规则：对单个 SceneStateSnapshot 应用转换
 */
export interface SceneStateRule {
  apply: (
    prevState: SceneStateSnapshot,
    event: PlotEvent,
  ) => SceneStateSnapshot;
}

/**
 * 级联传播规则：返回受事件影响的下游节点 ID 列表
 */
export interface CascadeRule {
  propagate: (
    event: PlotEvent,
    timeline: StoryTimelineLike,
  ) => string[];
}

// ─────────────────────────────────────────────────────────────
// 输入/输出类型 — 引擎与调用方的契约
// ─────────────────────────────────────────────────────────────

/**
 * TimelineBindingLike — 级联传播所需的最小绑定形状
 * 设计文档 docs/timeline-variant-design.md:362-407
 */
export interface TimelineBindingLike {
  id: string;
  type: string;
  sourceNodeId: string;
  targetNodeId: string;
  injectionText?: string;
  importance?: "critical" | "important" | "optional";
}

/**
 * 角色初始状态（首节点初始化用）
 */
export interface CharacterInitialState {
  characterId: string;
  variantId: string;
  outfit?: string;
  expression?: string;
  pose?: string;
  accessories?: string[];
  emotion?: string;
  motivation?: string;
  powerLevel?: number;
}

/**
 * 场景初始状态（首节点初始化用）
 */
export interface SceneInitialState {
  sceneId: string;
  variantId: string;
  timeOfDay?: string;
  weather?: string;
  lighting?: string;
  mood?: string;
  crowdLevel?: string;
}

/**
 * PlotNodeLike — 推演引擎所需的最小节点形状
 *
 * 注意：与 domain/schemas/timeline.ts 的 PlotNode schema 兼容，
 * 但仅声明引擎所需字段，避免跨层依赖。
 */
export interface PlotNodeLike {
  id: string;
  order: number;
  plotEventType: PlotEventType;
  plotEventDescription: string;
  plotEventParameters: PlotEventParameters;
  /** 可选：事件 ID（用于追溯，若未提供则用 nodeId 派生） */
  plotEventId?: string;
  /** 可选：AI 分析结果 */
  aiAnalysis?: PlotEventAIAnalysis;
  /** 首节点初始化用：角色初始状态 */
  characterInitialStates?: CharacterInitialState[];
  /** 首节点初始化用：场景初始状态 */
  sceneInitialStates?: SceneInitialState[];
}

/**
 * StoryTimelineLike — 推演引擎所需的最小时间线形状
 */
export interface StoryTimelineLike {
  id: string;
  nodes: PlotNodeLike[];
  bindings: TimelineBindingLike[];
}

/**
 * NodeSnapshots — 单个节点的完整状态快照
 * 引擎的输出类型
 */
export interface NodeSnapshots {
  nodeId: string;
  characterSnapshots: CharacterStateSnapshot[];
  sceneSnapshots: SceneStateSnapshot[];
  transitions: StateTransition[];
}

/**
 * PropagationResult — 推演结果
 * nodeId → NodeSnapshots 的映射
 */
export type PropagationResult = Map<string, NodeSnapshots>;
