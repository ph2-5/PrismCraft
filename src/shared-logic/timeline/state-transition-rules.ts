/**
 * Q3-4 / Task 4.6.2 — 状态转换规则库
 *
 * 定义 22 种 PlotEventType 对应的状态转换规则。
 * 规则分为三类：
 *   - CHARACTER_RULES：角色事件 → 对 CharacterStateSnapshot 应用转换
 *   - SCENE_RULES：场景/道具事件 → 对 SceneStateSnapshot 应用转换
 *   - CASCADE_RULES：带级联效应的事件 → 返回受影响的下游节点 ID
 *
 * 设计来源：docs/timeline-variant-design.md:441-545
 *   设计文档显式给出 5 条规则（character_introduce / character_transform /
 *   character_injury / character_reveal_secret / scene_destruction），
 *   其余 17 条基于 PlotEventParameters 与快照字段推断实现。
 *
 * 零依赖原则：本文件仅导入本目录内的相对模块。
 */

import type {
  PlotEventType,
  PlotEvent,
  CharacterStateSnapshot,
  SceneStateSnapshot,
  CharacterStateRule,
  SceneStateRule,
  CascadeRule,
  Injury,
  AtmosphereChange,
  StateTransition,
} from "./snapshot-types";

// ─────────────────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────────────────

/** 生成唯一 ID（shared-logic 内不依赖 crypto，用时间戳 + 随机数） */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 浅克隆角色快照的关键嵌套字段，避免共享引用 */
function cloneCharacterSnapshot(s: CharacterStateSnapshot): CharacterStateSnapshot {
  return {
    ...s,
    nodeId: "", // 由引擎填充
    appearance: {
      ...s.appearance,
      injuries: [...s.appearance.injuries],
      accessories: [...s.appearance.accessories],
    },
    innerState: {
      ...s.innerState,
      secretRevealed: [...s.innerState.secretRevealed],
      relationshipStatus: { ...s.innerState.relationshipStatus },
    },
    abilityState: {
      ...s.abilityState,
      abilitiesActive: [...s.abilityState.abilitiesActive],
      abilitiesRevealed: [...s.abilityState.abilitiesRevealed],
    },
    stateSource: {
      ...s.stateSource,
      transitions: [...s.stateSource.transitions],
    },
  };
}

/** 浅克隆场景快照的关键嵌套字段 */
function cloneSceneSnapshot(s: SceneStateSnapshot): SceneStateSnapshot {
  return {
    ...s,
    nodeId: "", // 由引擎填充
    environment: {
      ...s.environment,
      atmosphereChanges: [...s.environment.atmosphereChanges],
    },
    entities: {
      charactersPresent: [...s.entities.charactersPresent],
      itemsPresent: [...s.entities.itemsPresent],
      environmentalObjects: [...s.entities.environmentalObjects],
    },
    persistentChanges: {
      addedObjects: [...s.persistentChanges.addedObjects],
      removedObjects: [...s.persistentChanges.removedObjects],
      modifiedObjects: [...s.persistentChanges.modifiedObjects],
    },
  };
}

// ─────────────────────────────────────────────────────────────
// CHARACTER_RULES — 角色事件规则
// 设计文档 docs/timeline-variant-design.md:445-508
// ─────────────────────────────────────────────────────────────

export const CHARACTER_RULES: Partial<Record<PlotEventType, CharacterStateRule>> = {
  // 1. character_introduce — 使用 intro 变体
  // 设计文档行 446-452
  character_introduce: {
    apply: (prevState, event) => {
      const next = cloneCharacterSnapshot(prevState);
      next.appearance.variantId = event.parameters.newVariantId ?? next.appearance.variantId;
      next.innerState.emotion = "neutral";
      next.stateSource.isModified = true;
      return next;
    },
  },

  // 2. character_transform — 切换变体 + 记录转换
  // 设计文档行 455-473
  character_transform: {
    apply: (prevState, event) => {
      const next = cloneCharacterSnapshot(prevState);
      const fromVariant = event.parameters.previousVariantId ?? prevState.appearance.variantId;
      const toVariant = event.parameters.newVariantId ?? prevState.appearance.variantId;
      next.appearance.variantId = toVariant;
      next.stateSource.isModified = true;
      next.stateSource.transitions.push({
        id: generateId("transition"),
        nodeId: event.nodeId,
        previousNodeId: prevState.nodeId,
        trigger: { type: "plot_event", eventId: event.id },
        characterChanges: [
          {
            characterId: prevState.characterId,
            changeType: "variant_change",
            fromState: fromVariant,
            toState: toVariant,
            cause: event.description,
            narrativeImpact: `角色从 ${fromVariant} 切换为 ${toVariant}`,
          },
        ],
        sceneChanges: [],
        narrativeDescription: event.description,
        visualDescription: `服装/形态从 ${fromVariant} 变为 ${toVariant}`,
      });
      return next;
    },
  },

  // 3. character_injury — 添加伤势
  // 设计文档行 476-489
  character_injury: {
    apply: (prevState, event) => {
      const next = cloneCharacterSnapshot(prevState);
      const injury: Injury = {
        type: event.parameters.injuryType ?? "unknown",
        location: event.parameters.injuryLocation ?? "unknown",
        severity: event.parameters.severity ?? "moderate",
        causeEventId: event.id,
      };
      next.appearance.injuries.push(injury);
      next.stateSource.isModified = true;
      return next;
    },
  },

  // 4. character_emotion_change — 情绪变化
  character_emotion_change: {
    apply: (prevState, event) => {
      const next = cloneCharacterSnapshot(prevState);
      const fromEmotion = prevState.innerState.emotion;
      const toEmotion = event.parameters.emotion ?? fromEmotion;
      next.innerState.emotion = toEmotion;
      next.stateSource.isModified = true;
      next.stateSource.transitions.push({
        id: generateId("transition"),
        nodeId: event.nodeId,
        previousNodeId: prevState.nodeId,
        trigger: { type: "plot_event", eventId: event.id },
        characterChanges: [
          {
            characterId: prevState.characterId,
            changeType: "emotion_change",
            fromState: fromEmotion,
            toState: toEmotion,
            cause: event.description,
            narrativeImpact: `情绪从 ${fromEmotion} 变为 ${toEmotion}`,
          },
        ],
        sceneChanges: [],
        narrativeDescription: event.description,
        visualDescription: `表情从 ${fromEmotion} 变为 ${toEmotion}`,
      });
      return next;
    },
  },

  // 5. character_reveal_secret — 揭示秘密
  // 设计文档行 492-508（apply 部分）
  character_reveal_secret: {
    apply: (prevState, event) => {
      const next = cloneCharacterSnapshot(prevState);
      const secret = event.parameters.secretType ?? "unknown";
      if (!next.innerState.secretRevealed.includes(secret)) {
        next.innerState.secretRevealed.push(secret);
      }
      next.stateSource.isModified = true;
      return next;
    },
  },

  // 6. character_relationship_change — 关系变化
  character_relationship_change: {
    apply: (prevState, event) => {
      const next = cloneCharacterSnapshot(prevState);
      const relId = event.parameters.relationshipId ?? "unknown";
      const newStatus = event.parameters.newRelationshipStatus ?? "unknown";
      const prevStatus = prevState.innerState.relationshipStatus[relId] ?? "unknown";
      next.innerState.relationshipStatus[relId] = newStatus;
      next.stateSource.isModified = true;
      next.stateSource.transitions.push({
        id: generateId("transition"),
        nodeId: event.nodeId,
        previousNodeId: prevState.nodeId,
        trigger: { type: "plot_event", eventId: event.id },
        characterChanges: [
          {
            characterId: prevState.characterId,
            changeType: "relationship_change",
            fromState: prevStatus,
            toState: newStatus,
            cause: event.description,
            narrativeImpact: `与 ${relId} 的关系从 ${prevStatus} 变为 ${newStatus}`,
          },
        ],
        sceneChanges: [],
        narrativeDescription: event.description,
        visualDescription: "",
      });
      return next;
    },
  },
};

// ─────────────────────────────────────────────────────────────
// SCENE_RULES — 场景/道具事件规则
// 设计文档 docs/timeline-variant-design.md:510-543（scene_destruction）
// ─────────────────────────────────────────────────────────────

export const SCENE_RULES: Partial<Record<PlotEventType, SceneStateRule>> = {
  // 7. scene_change — 场景切换
  scene_change: {
    apply: (prevState, event) => {
      const next = cloneSceneSnapshot(prevState);
      const fromVariant = prevState.environment.variantId;
      const toVariant = event.parameters.newVariantId ?? fromVariant;
      next.environment.variantId = toVariant;
      return next;
    },
  },

  // 8. scene_destruction — 破坏累加
  // 设计文档行 510-543
  scene_destruction: {
    apply: (prevState, event) => {
      const next = cloneSceneSnapshot(prevState);
      const fromMood = prevState.environment.mood;
      const newDestruction = Math.min(100, prevState.environment.destructionLevel + 30);
      next.environment.destructionLevel = newDestruction;
      const atmoChange: AtmosphereChange = {
        causeEventId: event.id,
        fromMood,
        toMood: "chaotic",
        description: event.description,
      };
      next.environment.atmosphereChanges.push(atmoChange);
      next.environment.mood = "chaotic";
      next.persistentChanges.modifiedObjects.push({
        object: "environment",
        change: `destruction level increased to ${newDestruction}`,
        causeEventId: event.id,
      });
      return next;
    },
  },

  // 9. scene_transform — 场景变形（时间/天气/光照/氛围变化）
  scene_transform: {
    apply: (prevState, event) => {
      const next = cloneSceneSnapshot(prevState);
      const params = event.parameters;
      if (params.timeOfDay !== undefined) next.environment.timeOfDay = params.timeOfDay;
      if (params.weather !== undefined) next.environment.weather = params.weather;
      if (params.lighting !== undefined) next.environment.lighting = params.lighting;
      if (params.mood !== undefined) {
        const fromMood = prevState.environment.mood;
        next.environment.mood = params.mood;
        next.environment.atmosphereChanges.push({
          causeEventId: event.id,
          fromMood,
          toMood: params.mood,
          description: event.description,
        });
      }
      return next;
    },
  },

  // 10. item_introduce — 道具登场
  item_introduce: {
    apply: (prevState, event) => {
      const next = cloneSceneSnapshot(prevState);
      const itemId = event.parameters.itemId ?? event.parameters.itemName ?? "unknown";
      if (!next.entities.itemsPresent.includes(itemId)) {
        next.entities.itemsPresent.push(itemId);
      }
      next.persistentChanges.addedObjects.push(itemId);
      return next;
    },
  },

  // 11. item_use — 道具使用（无持久状态变化，仅记录氛围变化）
  item_use: {
    apply: (prevState) => {
      // 道具使用不改变场景持久状态，直接返回克隆（避免共享引用）
      return cloneSceneSnapshot(prevState);
    },
  },

  // 12. item_destroy — 道具销毁
  item_destroy: {
    apply: (prevState, event) => {
      const next = cloneSceneSnapshot(prevState);
      const itemId = event.parameters.itemId ?? event.parameters.itemName ?? "unknown";
      next.entities.itemsPresent = next.entities.itemsPresent.filter((id) => id !== itemId);
      next.persistentChanges.removedObjects.push(itemId);
      return next;
    },
  },
};

// ─────────────────────────────────────────────────────────────
// CASCADE_RULES — 级联传播规则
// 设计文档 docs/timeline-variant-design.md:492-508, 510-543
// ─────────────────────────────────────────────────────────────

export const CASCADE_RULES: Partial<Record<PlotEventType, CascadeRule>> = {
  // character_reveal_secret — 级联到回收该秘密的下游节点
  // 设计文档行 503-507
  character_reveal_secret: {
    propagate: (event, timeline) => {
      const affectedBindings = timeline.bindings.filter(
        (b) => b.type === "callback" && b.sourceNodeId === event.nodeId,
      );
      return affectedBindings.map((b) => b.targetNodeId);
    },
  },

  // scene_destruction — 级联到使用同一场景的下游节点
  // 设计文档行 536-542
  scene_destruction: {
    propagate: (event, timeline) => {
      const sourceNode = timeline.nodes.find((n) => n.id === event.nodeId);
      if (!sourceNode) return [];
      const sceneId = event.parameters.sceneId;
      if (!sceneId) return [];
      const downstreamNodes = timeline.nodes.filter(
        (n) => n.order > sourceNode.order,
      );
      // 下游节点若在初始状态中引用了同一 sceneId，则受影响
      return downstreamNodes
        .filter((n) =>
          n.sceneInitialStates?.some((s) => s.sceneId === sceneId),
        )
        .map((n) => n.id);
    },
  },
};

// ─────────────────────────────────────────────────────────────
// NO_OP_EVENTS — 无状态变化的事件类型
// 这些事件不改变快照，仅透传前一节点状态（可能触发 PinnedSnapshot 标记）
// ─────────────────────────────────────────────────────────────

export const NO_OP_EVENTS: ReadonlySet<PlotEventType> = new Set<PlotEventType>([
  "world_rule_reveal",
  "foreshadow",
  "callback",
  "climax",
  "twist",
  "resolution",
  "narration",
  "dialogue",
  "action",
]);

// ─────────────────────────────────────────────────────────────
// 事件分类辅助
// ─────────────────────────────────────────────────────────────

/** 判断事件是否为角色事件 */
export function isCharacterEvent(type: PlotEventType): boolean {
  return type in CHARACTER_RULES;
}

/** 判断事件是否为场景事件 */
export function isSceneEvent(type: PlotEventType): boolean {
  return type in SCENE_RULES;
}

/** 判断事件是否为无状态变化事件 */
export function isNoOpEvent(type: PlotEventType): boolean {
  return NO_OP_EVENTS.has(type);
}

/** 判断事件是否为复合事件 */
export function isCompoundEvent(type: PlotEventType): boolean {
  return type === "compound";
}

// ─────────────────────────────────────────────────────────────
// StateTransition 构造辅助
// ─────────────────────────────────────────────────────────────

/**
 * 为无状态变化的事件创建透传 StateTransition（无 character/scene 变化）
 */
export function createNoOpTransition(
  nodeId: string,
  previousNodeId: string,
  event: PlotEvent,
): StateTransition {
  return {
    id: generateId("transition"),
    nodeId,
    previousNodeId,
    trigger: { type: "plot_event", eventId: event.id },
    characterChanges: [],
    sceneChanges: [],
    narrativeDescription: event.description,
    visualDescription: "",
  };
}
