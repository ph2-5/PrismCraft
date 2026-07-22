/**
 * Q3-4 / Task 4.6.2 — 状态推演引擎
 *
 * 实现 propagateStates 算法，按时间线顺序推演每个节点的状态快照。
 *
 * 算法（设计文档 docs/timeline-variant-design.md:414-436）：
 *   1. 初始化 PlotNode_1 的状态（角色默认变体 + 场景默认变体）
 *   2. 对于 i = 2 到 N：
 *      a. 获取 PlotNode_i 的 PlotEvent
 *      b. 查找对应的 StateTransitionRule
 *      c. 应用规则到 PlotNode_{i-1} 的状态
 *      d. 生成 PlotNode_i 的状态快照
 *      e. 缓存结果
 *   3. 返回所有节点的状态快照
 *
 * 零依赖原则：仅导入本目录内相对模块。
 */

import type {
  StoryTimelineLike,
  PlotNodeLike,
  PlotEvent,
  PlotEventType,
  CharacterStateSnapshot,
  SceneStateSnapshot,
  NodeSnapshots,
  PropagationResult,
  CharacterInitialState,
  SceneInitialState,
  StateTransition,
} from "./snapshot-types";
import {
  CHARACTER_RULES,
  SCENE_RULES,
  CASCADE_RULES,
  NO_OP_EVENTS,
  isCompoundEvent,
  createNoOpTransition,
} from "./state-transition-rules";

// ─────────────────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────────────────

/** 生成唯一 ID */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 从 PlotNodeLike 构造 PlotEvent（扁平字段 → PlotEvent 对象）
 */
function buildPlotEvent(node: PlotNodeLike): PlotEvent {
  return {
    id: node.plotEventId ?? `${node.id}-event`,
    nodeId: node.id,
    type: node.plotEventType,
    description: node.plotEventDescription,
    parameters: node.plotEventParameters,
    aiAnalysis: node.aiAnalysis,
  };
}

// ─────────────────────────────────────────────────────────────
// 首节点初始化
// ─────────────────────────────────────────────────────────────

/**
 * 初始化首节点的角色状态快照
 * 使用 characterInitialStates 中的默认变体信息
 */
function initializeCharacterSnapshots(
  node: PlotNodeLike,
): CharacterStateSnapshot[] {
  const initials = node.characterInitialStates ?? [];
  return initials.map((init: CharacterInitialState) => ({
    nodeId: node.id,
    characterId: init.characterId,
    appearance: {
      variantId: init.variantId,
      outfit: init.outfit ?? "",
      expression: init.expression ?? "neutral",
      pose: init.pose ?? "standing",
      injuries: [],
      accessories: init.accessories ?? [],
    },
    innerState: {
      emotion: init.emotion ?? "neutral",
      motivation: "",
      secretRevealed: [],
      relationshipStatus: {},
    },
    abilityState: {
      abilitiesActive: [],
      abilitiesRevealed: [],
      powerLevel: init.powerLevel ?? 0,
    },
    stateSource: {
      baseVariantId: init.variantId,
      transitions: [],
      isModified: false,
    },
  }));
}

/**
 * 初始化首节点的场景状态快照
 * 使用 sceneInitialStates 中的默认变体信息
 */
function initializeSceneSnapshots(
  node: PlotNodeLike,
): SceneStateSnapshot[] {
  const initials = node.sceneInitialStates ?? [];
  return initials.map((init: SceneInitialState) => ({
    nodeId: node.id,
    sceneId: init.sceneId,
    environment: {
      variantId: init.variantId,
      timeOfDay: init.timeOfDay ?? "day",
      weather: init.weather ?? "clear",
      lighting: init.lighting ?? "natural",
      mood: init.mood ?? "neutral",
      destructionLevel: 0,
      crowdLevel: init.crowdLevel ?? "normal",
      atmosphereChanges: [],
    },
    entities: {
      charactersPresent: [],
      itemsPresent: [],
      environmentalObjects: [],
    },
    persistentChanges: {
      addedObjects: [],
      removedObjects: [],
      modifiedObjects: [],
    },
  }));
}

// ─────────────────────────────────────────────────────────────
// 状态推演核心
// ─────────────────────────────────────────────────────────────

/**
 * 对角色快照应用事件规则
 * 若事件类型在 CHARACTER_RULES 中且 parameters.characterId 匹配，则应用规则
 */
function applyCharacterRule(
  prevSnapshot: CharacterStateSnapshot,
  event: PlotEvent,
  newNodeId: string,
): CharacterStateSnapshot {
  const rule = CHARACTER_RULES[event.type];
  if (!rule) return { ...prevSnapshot, nodeId: newNodeId };

  // characterId 匹配检查：若事件指定了 characterId，仅对匹配的快照应用
  const targetCharId = event.parameters.characterId;
  if (targetCharId && targetCharId !== prevSnapshot.characterId) {
    return { ...prevSnapshot, nodeId: newNodeId };
  }

  const updated = rule.apply(prevSnapshot, event);
  updated.nodeId = newNodeId;
  return updated;
}

/**
 * 对场景快照应用事件规则
 * 若事件类型在 SCENE_RULES 中且 parameters.sceneId 匹配，则应用规则
 */
function applySceneRule(
  prevSnapshot: SceneStateSnapshot,
  event: PlotEvent,
  newNodeId: string,
): SceneStateSnapshot {
  const rule = SCENE_RULES[event.type];
  if (!rule) return { ...prevSnapshot, nodeId: newNodeId };

  // sceneId 匹配检查：若事件指定了 sceneId，仅对匹配的快照应用
  // item 事件（item_introduce/item_use/item_destroy）应用到所有场景快照（无 sceneId 限制）
  const targetSceneId = event.parameters.sceneId;
  if (targetSceneId && targetSceneId !== prevSnapshot.sceneId) {
    return { ...prevSnapshot, nodeId: newNodeId };
  }

  const updated = rule.apply(prevSnapshot, event);
  updated.nodeId = newNodeId;
  return updated;
}

/**
 * 递归处理 compound 事件：对每个 subEvent 依次应用规则
 */
function applyCompoundEvent(
  prevCharSnapshots: CharacterStateSnapshot[],
  prevSceneSnapshots: SceneStateSnapshot[],
  event: PlotEvent,
  newNodeId: string,
): { characters: CharacterStateSnapshot[]; scenes: SceneStateSnapshot[] } {
  const subEvents = event.parameters.subEvents ?? [];
  let currentChars = prevCharSnapshots.map((s) => ({ ...s, nodeId: newNodeId }));
  let currentScenes = prevSceneSnapshots.map((s) => ({ ...s, nodeId: newNodeId }));

  for (const subEvent of subEvents) {
    // 设置 subEvent 的 nodeId 为当前节点
    const normalizedSubEvent: PlotEvent = { ...subEvent, nodeId: event.nodeId };

    if (isCompoundEvent(subEvent.type)) {
      // 嵌套 compound：递归处理
      const result = applyCompoundEvent(
        currentChars,
        currentScenes,
        normalizedSubEvent,
        newNodeId,
      );
      currentChars = result.characters;
      currentScenes = result.scenes;
    } else {
      currentChars = currentChars.map((s) =>
        applyCharacterRule(s, normalizedSubEvent, newNodeId),
      );
      currentScenes = currentScenes.map((s) =>
        applySceneRule(s, normalizedSubEvent, newNodeId),
      );
    }
  }

  return { characters: currentChars, scenes: currentScenes };
}

/**
 * 构造透传事件的 StateTransition（无状态变化但需记录事件）
 */
function buildPassthroughTransition(
  newNodeId: string,
  prevNodeId: string,
  event: PlotEvent,
): StateTransition {
  return {
    id: generateId("transition"),
    nodeId: newNodeId,
    previousNodeId: prevNodeId,
    trigger: { type: "plot_event", eventId: event.id },
    characterChanges: [],
    sceneChanges: [],
    narrativeDescription: event.description,
    visualDescription: "",
  };
}

// ─────────────────────────────────────────────────────────────
// 主算法
// ─────────────────────────────────────────────────────────────

/**
 * 状态推演主函数
 *
 * 输入：StoryTimelineLike（包含有序 nodes + bindings）
 * 输出：Map<nodeId, NodeSnapshots>
 *
 * 算法：
 *   1. 初始化首节点（使用 characterInitialStates / sceneInitialStates）
 *   2. 依次推演后续节点（应用 StateTransitionRule）
 *   3. compound 事件递归处理 subEvents
 *   4. NO_OP 事件透传前一节点状态
 *
 * @example
 * ```typescript
 * const result = propagateStates(timeline);
 * const nodeSnapshots = result.get("node-2");
 * // nodeSnapshots.characterSnapshots, nodeSnapshots.sceneSnapshots
 * ```
 */
export function propagateStates(
  timeline: StoryTimelineLike,
): PropagationResult {
  const result: PropagationResult = new Map();
  const nodes = [...timeline.nodes].sort((a, b) => a.order - b.order);

  if (nodes.length === 0) return result;

  // ── Step 1: 初始化首节点 ──
  const firstNode = nodes[0]!;
  const firstSnapshots: NodeSnapshots = {
    nodeId: firstNode.id,
    characterSnapshots: initializeCharacterSnapshots(firstNode),
    sceneSnapshots: initializeSceneSnapshots(firstNode),
    transitions: [],
  };
  result.set(firstNode.id, firstSnapshots);

  // ── Step 2: 依次推演后续节点 ──
  for (let i = 1; i < nodes.length; i++) {
    const currentNode = nodes[i]!;
    const prevNode = nodes[i - 1]!;
    const prevSnapshots = result.get(prevNode.id);

    if (!prevSnapshots) {
      // 前一节点缺失快照（不应发生），用空快照兜底
      result.set(currentNode.id, {
        nodeId: currentNode.id,
        characterSnapshots: [],
        sceneSnapshots: [],
        transitions: [],
      });
      continue;
    }

    const event = buildPlotEvent(currentNode);
    const eventType: PlotEventType = event.type;

    let newCharSnapshots: CharacterStateSnapshot[];
    let newSceneSnapshots: SceneStateSnapshot[];
    let transitions: StateTransition[];

    if (isCompoundEvent(eventType)) {
      // ── compound 事件：递归处理 subEvents ──
      const compoundResult = applyCompoundEvent(
        prevSnapshots.characterSnapshots,
        prevSnapshots.sceneSnapshots,
        event,
        currentNode.id,
      );
      newCharSnapshots = compoundResult.characters;
      newSceneSnapshots = compoundResult.scenes;
      transitions = [
        {
          id: generateId("transition"),
          nodeId: currentNode.id,
          previousNodeId: prevNode.id,
          trigger: { type: "plot_event", eventId: event.id },
          characterChanges: [],
          sceneChanges: [],
          narrativeDescription: event.description,
          visualDescription: `复合事件（${event.parameters.subEvents?.length ?? 0} 个子事件）`,
        },
      ];
    } else if (NO_OP_EVENTS.has(eventType)) {
      // ── NO_OP 事件：透传前一节点状态 ──
      newCharSnapshots = prevSnapshots.characterSnapshots.map((s) => ({
        ...s,
        nodeId: currentNode.id,
      }));
      newSceneSnapshots = prevSnapshots.sceneSnapshots.map((s) => ({
        ...s,
        nodeId: currentNode.id,
      }));
      transitions = [createNoOpTransition(currentNode.id, prevNode.id, event)];
    } else {
      // ── 常规事件：应用角色/场景规则 ──
      newCharSnapshots = prevSnapshots.characterSnapshots.map((s) =>
        applyCharacterRule(s, event, currentNode.id),
      );
      newSceneSnapshots = prevSnapshots.sceneSnapshots.map((s) =>
        applySceneRule(s, event, currentNode.id),
      );
      // 构造透传 transition（规则内部已记录具体变化到 stateSource.transitions）
      transitions = [buildPassthroughTransition(currentNode.id, prevNode.id, event)];
    }

    result.set(currentNode.id, {
      nodeId: currentNode.id,
      characterSnapshots: newCharSnapshots,
      sceneSnapshots: newSceneSnapshots,
      transitions,
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// 级联传播辅助
// ─────────────────────────────────────────────────────────────

/**
 * 计算事件触发的级联影响（返回受影响的下游节点 ID 列表）
 *
 * 用于级联更新机制（Task 4.6.3）：当某节点事件发生时，
 * 查询 CASCADE_RULES 获取需要标记 dirty 的下游节点。
 */
export function computeCascadeEffects(
  event: PlotEvent,
  timeline: StoryTimelineLike,
): string[] {
  const rule = CASCADE_RULES[event.type];
  if (!rule) return [];
  return rule.propagate(event, timeline);
}

/**
 * 获取指定节点的推演结果
 */
export function getNodeSnapshots(
  result: PropagationResult,
  nodeId: string,
): NodeSnapshots | undefined {
  return result.get(nodeId);
}

/**
 * 获取所有节点的推演结果（按 order 排序）
 */
export function getAllSnapshots(
  result: PropagationResult,
  timeline: StoryTimelineLike,
): NodeSnapshots[] {
  return [...timeline.nodes]
    .sort((a, b) => a.order - b.order)
    .map((n) => result.get(n.id))
    .filter((s): s is NodeSnapshots => s !== undefined);
}
