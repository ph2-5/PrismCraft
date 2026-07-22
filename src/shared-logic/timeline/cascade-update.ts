/**
 * Q3-5 / Task 4.6.3 — 级联更新与脏标记
 *
 * 实现增量更新机制，避免每次节点变更都全量重算 propagateStates。
 *
 * 设计来源：docs/timeline-variant-design.md
 *   - 3.2 节（行 549-572）：级联更新流程 + dirty flag 优化策略
 *   - 8.9 节（行 1205-1217）：三层快照架构下的 dirty 标记行为
 *
 * 核心概念：
 *   - DirtyMap：记录哪些节点的状态快照已过期需要重算
 *   - markDirty：将受影响节点标记为脏（直接 + 级联传播）
 *   - incrementalUpdate：仅重算脏节点，非脏节点复用缓存
 *   - 两种模式：current_only（仅当前节点）/ cascade_all（级联全部下游）
 *
 * 与 StalenessTracker 的关系：
 *   novel 模块的 StalenessTracker（src/modules/novel/integration/services/staleness-tracker.ts）
 *   追踪的是"故事结构变更 → 哪些派生数据过期"的跨域传播。
 *   本模块的 DirtyMap 追踪的是"时间线节点变更 → 哪些下游节点状态过期"的时序传播。
 *   时间线变体的 dirty flag 是 StalenessTracker 的超集（设计文档 3.2 节）：
 *   上游结构变更 → StalenessTracker.markStale → 触发时间线 markDirty → incrementalUpdate。
 *
 * 零依赖原则：仅导入本目录内相对模块。
 */

import type {
  StoryTimelineLike,
  PlotNodeLike,
  PropagationResult,
} from "./snapshot-types";
import {
  computeNextNodeSnapshots,
  propagateStates,
} from "./state-propagation-engine";

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/**
 * 级联更新模式
 * - current_only：仅重算直接受影响的节点，下游保持旧状态（用户接受暂时不一致以换取性能）
 * - cascade_all：重算受影响节点及其所有下游节点（保证全局一致性）
 *
 * 设计文档行 571：用户可以选择"仅更新当前节点"或"级联更新全部"
 */
export type CascadeUpdateMode = "current_only" | "cascade_all";

/**
 * 脏标记级别
 * - direct：直接受事件影响的节点（用户修改的节点本身）
 * - propagated：因上游节点变更而级联受影响的下游节点
 */
export type DirtyLevel = "direct" | "propagated";

/**
 * 单个节点的脏标记条目
 */
export interface DirtyEntry {
  /** 脏节点 ID */
  nodeId: string;
  /** 触发脏标记的源节点 ID（用户修改的节点） */
  sourceNodeId: string;
  /** 人类可读的原因（如"上游节点 node-3 变更"） */
  reason: string;
  /** 标记时间戳 */
  timestamp: number;
  /** 脏标记级别 */
  level: DirtyLevel;
}

/**
 * DirtyMap — 脏节点映射表
 * nodeId → DirtyEntry
 *
 * 使用 Map 而非 Record，与 PropagationResult 保持一致，
 * 便于按 nodeId 快速查询和合并。
 */
export type DirtyMap = Map<string, DirtyEntry>;

/**
 * 增量更新结果
 */
export interface IncrementalUpdateResult {
  /** 合并后的完整快照映射（非脏节点复用缓存，脏节点重算） */
  snapshots: PropagationResult;
  /** 实际被重算的节点 ID 列表 */
  recomputedNodeIds: string[];
  /** 保留缓存快照的节点 ID 列表 */
  skippedNodeIds: string[];
}

// ─────────────────────────────────────────────────────────────
// markDirty — 标记脏节点
// ─────────────────────────────────────────────────────────────

/**
 * 标记受影响节点为脏
 *
 * 算法：
 *   1. 对每个 affectedNodeIds 中的节点，标记为 direct 脏
 *   2. 若 mode === "cascade_all"：
 *      找到所有 order > min(affected orders) 的下游节点，标记为 propagated 脏
 *   3. 若 mode === "current_only"：仅标记 affected 节点，不级联
 *   4. 与 prevDirtyMap 合并（保留历史脏标记，追加新标记）
 *
 * @param affectedNodeIds 直接受影响的节点 ID 列表（用户修改的节点）
 * @param timeline 时间线（用于查找下游节点）
 * @param mode 级联模式，默认 cascade_all
 * @param prevDirtyMap 已有的脏映射（可选，用于追加合并）
 * @returns 新的 DirtyMap（包含旧标记 + 新标记）
 */
export function markDirty(
  affectedNodeIds: string[],
  timeline: StoryTimelineLike,
  mode: CascadeUpdateMode = "cascade_all",
  prevDirtyMap?: DirtyMap,
): DirtyMap {
  // 从 prevDirtyMap 克隆起始（追加式合并，不丢失历史标记）
  const dirtyMap: DirtyMap = prevDirtyMap
    ? new Map(prevDirtyMap)
    : new Map();

  if (affectedNodeIds.length === 0) return dirtyMap;

  const now = Date.now();
  const sortedNodes = [...timeline.nodes].sort((a, b) => a.order - b.order);

  // ── Step 1: 标记直接受影响节点 ──
  for (const nodeId of affectedNodeIds) {
    dirtyMap.set(nodeId, {
      nodeId,
      sourceNodeId: nodeId,
      reason: "节点内容被修改",
      timestamp: now,
      level: "direct",
    });
  }

  // ── Step 2: cascade_all 模式下，级联标记所有下游节点 ──
  if (mode === "cascade_all") {
    // 找到最早的受影响节点 order
    const affectedOrders = affectedNodeIds
      .map((id) => sortedNodes.find((n) => n.id === id))
      .filter((n): n is PlotNodeLike => n !== undefined)
      .map((n) => n.order);

    if (affectedOrders.length === 0) return dirtyMap;
    const minAffectedOrder = Math.min(...affectedOrders);

    // 所有 order > minAffectedOrder 的节点都是下游 propagated 脏
    for (const node of sortedNodes) {
      if (node.order > minAffectedOrder && !dirtyMap.has(node.id)) {
        // 找到该节点最近的 direct 源（向上查找最近的 affected 节点）
        const sourceNode = sortedNodes
          .filter((n) => n.order <= node.order && affectedNodeIds.includes(n.id))
          .sort((a, b) => b.order - a.order)[0];

        dirtyMap.set(node.id, {
          nodeId: node.id,
          sourceNodeId: sourceNode?.id ?? affectedNodeIds[0]!,
          reason: `上游节点 ${sourceNode?.id ?? affectedNodeIds[0]} 变更导致级联失效`,
          timestamp: now,
          level: "propagated",
        });
      }
    }
  }

  return dirtyMap;
}

// ─────────────────────────────────────────────────────────────
// incrementalUpdate — 增量重算
// ─────────────────────────────────────────────────────────────

/**
 * 增量更新：仅重算脏节点，非脏节点复用缓存快照
 *
 * 算法：
 *   1. 按 order 排序所有节点
 *   2. 遍历节点序列：
 *      a. 非脏节点 → 从 prevResult 复制缓存快照到新结果
 *      b. 脏节点 → 使用 computeNextNodeSnapshots 重算
 *         - 前驱快照来源：若前驱非脏则用缓存，若前驱脏则用新算结果
 *   3. 若最早的脏节点是序列首节点（无前驱），则用其 characterInitialStates 初始化
 *
 * @param dirtyMap 脏节点映射
 * @param timeline 时间线
 * @param prevResult 上一次全量/增量推演的缓存结果
 * @returns 增量更新结果（合并快照 + 重算/跳过节点列表）
 */
export function incrementalUpdate(
  dirtyMap: DirtyMap,
  timeline: StoryTimelineLike,
  prevResult: PropagationResult,
): IncrementalUpdateResult {
  const sortedNodes = [...timeline.nodes].sort((a, b) => a.order - b.order);
  const result: PropagationResult = new Map();
  const recomputedNodeIds: string[] = [];
  const skippedNodeIds: string[] = [];

  for (let i = 0; i < sortedNodes.length; i++) {
    const currentNode = sortedNodes[i]!;
    const isDirty = dirtyMap.has(currentNode.id);

    if (!isDirty) {
      // ── 非脏节点：复用缓存 ──
      const cached = prevResult.get(currentNode.id);
      if (cached) {
        result.set(currentNode.id, cached);
        skippedNodeIds.push(currentNode.id);
      } else {
        // 缓存缺失（不应发生），用空快照兜底
        result.set(currentNode.id, {
          nodeId: currentNode.id,
          characterSnapshots: [],
          sceneSnapshots: [],
          transitions: [],
        });
        recomputedNodeIds.push(currentNode.id);
      }
      continue;
    }

    // ── 脏节点：重算 ──
    if (i === 0) {
      // 首节点脏：用 characterInitialStates / sceneInitialStates 重新初始化
      // 首节点无前驱，需用 propagateStates 对单节点子时间线重新初始化
      const subTimeline: StoryTimelineLike = {
        id: timeline.id,
        nodes: [currentNode],
        bindings: timeline.bindings,
      };
      const subResult = propagateStates(subTimeline);
      const subSnapshots = subResult.get(currentNode.id);
      if (subSnapshots) {
        result.set(currentNode.id, subSnapshots);
      } else {
        result.set(currentNode.id, {
          nodeId: currentNode.id,
          characterSnapshots: [],
          sceneSnapshots: [],
          transitions: [],
        });
      }
      recomputedNodeIds.push(currentNode.id);
      continue;
    }

    // 非首脏节点：取前驱快照（缓存或新算）
    const prevNode = sortedNodes[i - 1]!;
    const prevSnapshots = result.get(prevNode.id);

    if (!prevSnapshots) {
      // 前驱快照缺失，用空快照兜底
      result.set(currentNode.id, {
        nodeId: currentNode.id,
        characterSnapshots: [],
        sceneSnapshots: [],
        transitions: [],
      });
      recomputedNodeIds.push(currentNode.id);
      continue;
    }

    const { characterSnapshots, sceneSnapshots, transitions } =
      computeNextNodeSnapshots(prevSnapshots, currentNode, prevNode.id);

    result.set(currentNode.id, {
      nodeId: currentNode.id,
      characterSnapshots,
      sceneSnapshots,
      transitions,
    });
    recomputedNodeIds.push(currentNode.id);
  }

  return {
    snapshots: result,
    recomputedNodeIds,
    skippedNodeIds,
  };
}

// ─────────────────────────────────────────────────────────────
// DirtyMap 查询/操作辅助
// ─────────────────────────────────────────────────────────────

/**
 * 查询节点是否为脏
 */
export function isDirty(dirtyMap: DirtyMap, nodeId: string): boolean {
  return dirtyMap.has(nodeId);
}

/**
 * 获取节点的脏标记条目
 */
export function getDirtyEntry(
  dirtyMap: DirtyMap,
  nodeId: string,
): DirtyEntry | undefined {
  return dirtyMap.get(nodeId);
}

/**
 * 获取所有脏节点 ID（按 order 排序）
 */
export function getDirtyNodeIds(
  dirtyMap: DirtyMap,
  timeline: StoryTimelineLike,
): string[] {
  const sortedNodes = [...timeline.nodes].sort((a, b) => a.order - b.order);
  return sortedNodes.filter((n) => dirtyMap.has(n.id)).map((n) => n.id);
}

/**
 * 获取直接脏节点（level === "direct"）
 */
export function getDirectDirtyNodeIds(dirtyMap: DirtyMap): string[] {
  return [...dirtyMap.values()]
    .filter((e) => e.level === "direct")
    .map((e) => e.nodeId);
}

/**
 * 清除指定节点的脏标记
 */
export function clearDirty(dirtyMap: DirtyMap, nodeId: string): DirtyMap {
  const next = new Map(dirtyMap);
  next.delete(nodeId);
  return next;
}

/**
 * 清除所有脏标记
 */
export function clearAllDirty(): DirtyMap {
  return new Map();
}

/**
 * 序列化 DirtyMap（用于持久化到 DB）
 * 参考 StalenessTracker.serialize 的模式
 */
export function serializeDirtyMap(
  dirtyMap: DirtyMap,
): Record<string, DirtyEntry> {
  const result: Record<string, DirtyEntry> = {};
  for (const [nodeId, entry] of dirtyMap) {
    result[nodeId] = entry;
  }
  return result;
}

/**
 * 反序列化 DirtyMap（从 DB 恢复）
 */
export function deserializeDirtyMap(
  data: Record<string, DirtyEntry>,
): DirtyMap {
  return new Map(Object.entries(data));
}
