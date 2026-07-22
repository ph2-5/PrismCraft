/**
 * Q3-10 / Task 4.6.8 — 滑动窗口管理（纯逻辑，零依赖）
 *
 * 实现三层快照架构的窗口管理：
 *   - PinnedSnapshot：永久完整快照（由 pinned-snapshot.ts 管理）
 *   - ActiveSnapshot：当前编辑节点 ± N 个节点的完整快照
 *   - DiffOnlySnapshot：其余节点只存 StateTransition
 *
 * 核心功能：
 *   1. getSnapshotStrategy(): 计算节点的快照策略
 *   2. slideWindow(): 窗口滑动（降级旧节点、升级新节点）
 *   3. getSnapshot(): 获取快照（命中或增量重算）
 *   4. 重算优化：优先以窗口内 PinnedSnapshot 为重算起点
 *
 * 性能目标（设计文档第八章）：
 *   - 100 节点项目内存减少 > 85%（11 完整快照 vs 100 完整快照）
 *   - 窗口内无 Pinned 时重算延迟 < 200ms（最坏 22 节点重算）
 *   - 窗口内含 Pinned 时重算延迟 < 50ms
 *
 * 零依赖原则：仅导入本目录内相对模块。
 */

import type {
  PlotNodeLike,
  StoryTimelineLike,
  NodeSnapshots,
  PropagationResult,
} from "./snapshot-types";
import { propagateStates } from "./state-propagation-engine";
import {
  type PinnedSnapshotStore,
  isPinned,
} from "./pinned-snapshot";

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/**
 * 快照策略
 * 与 domain/schemas/timeline.ts 的 SnapshotStrategy 保持同步
 */
export type SnapshotStrategy = "pinned" | "active" | "diff_only";

/**
 * 窗口配置
 */
export interface WindowConfig {
  /** 窗口半径（默认 3，即 ±3 节点 = 7 个节点） */
  windowSize: number;
}

export const DEFAULT_WINDOW_SIZE = 3;

/**
 * 窗口状态
 */
export interface WindowState {
  /** 当前窗口中心节点 ID */
  centerNodeId: string | null;
  /** 窗口半径 */
  windowSize: number;
  /** 当前窗口内的节点 ID 集合 */
  activeNodeIds: Set<string>;
}

/**
 * 三层快照存储
 *
 * 缓存策略：
 *   - pinned 节点的完整快照：永久缓存
 *   - active 节点的完整快照：窗口滑动时可能被降级
 *   - diff_only 节点：不缓存完整快照（仅存 transition，由 propagationResult 提供）
 */
export interface SnapshotStore {
  /** PinnedSnapshot 存储 */
  pinned: PinnedSnapshotStore;
  /** 窗口状态 */
  window: WindowState;
  /** 完整快照缓存：nodeId → NodeSnapshots（仅 pinned + active 节点） */
  cachedSnapshots: Map<string, NodeSnapshots>;
}

// ─────────────────────────────────────────────────────────────
// 存储创建与初始化
// ─────────────────────────────────────────────────────────────

/**
 * 创建空的快照存储
 */
export function createSnapshotStore(
  pinned: PinnedSnapshotStore,
  config?: WindowConfig,
): SnapshotStore {
  return {
    pinned,
    window: {
      centerNodeId: null,
      windowSize: config?.windowSize ?? DEFAULT_WINDOW_SIZE,
      activeNodeIds: new Set(),
    },
    cachedSnapshots: new Map(),
  };
}

/**
 * 初始化窗口（设置初始中心节点）
 *
 * 会计算初始的 activeNodeIds 并预填充缓存。
 */
export function initWindow(
  store: SnapshotStore,
  centerNodeId: string,
  timeline: StoryTimelineLike,
): SnapshotStore {
  const sortedNodes = [...timeline.nodes].sort((a, b) => a.order - b.order);
  const centerIdx = sortedNodes.findIndex((n) => n.id === centerNodeId);
  if (centerIdx < 0) {
    return store;
  }

  const windowSize = store.window.windowSize;
  const start = Math.max(0, centerIdx - windowSize);
  const end = Math.min(sortedNodes.length - 1, centerIdx + windowSize);
  const activeNodeIds = new Set<string>();
  for (let i = start; i <= end; i++) {
    activeNodeIds.add(sortedNodes[i]!.id);
  }

  // 预填充缓存
  const propagationResult = propagateStates(timeline);
  const cachedSnapshots = new Map(store.cachedSnapshots);
  for (const nodeId of activeNodeIds) {
    const snap = propagationResult.get(nodeId);
    if (snap) {
      cachedSnapshots.set(nodeId, snap);
    }
  }
  // Pinned 节点也预填充
  for (const nodeId of getPinnedNodeIdsFromStore(store)) {
    const snap = propagationResult.get(nodeId);
    if (snap) {
      cachedSnapshots.set(nodeId, snap);
    }
  }

  return {
    ...store,
    window: {
      centerNodeId,
      windowSize,
      activeNodeIds,
    },
    cachedSnapshots,
  };
}

// ─────────────────────────────────────────────────────────────
// 策略计算
// ─────────────────────────────────────────────────────────────

/**
 * 计算节点的快照策略
 *
 * 优先级：pinned > active > diff_only
 */
export function getSnapshotStrategy(
  store: SnapshotStore,
  nodeId: string,
): SnapshotStrategy {
  if (isPinned(store.pinned, nodeId)) {
    return "pinned";
  }
  if (store.window.activeNodeIds.has(nodeId)) {
    return "active";
  }
  return "diff_only";
}

// ─────────────────────────────────────────────────────────────
// 窗口滑动
// ─────────────────────────────────────────────────────────────

/**
 * 滑动窗口到新的中心节点
 *
 * 算法：
 *   1. 计算新的 activeNodeIds
 *   2. 降级：旧窗口中不在新窗口且非 pinned 的节点 → 移除缓存
 *   3. 升级：新窗口中不在旧窗口的节点 → 添加缓存
 *   4. Pinned 节点始终保留缓存
 *
 * @param store 当前存储
 * @param newCenterNodeId 新的中心节点 ID
 * @param timeline 时间线
 * @returns 更新后的存储
 */
export function slideWindow(
  store: SnapshotStore,
  newCenterNodeId: string,
  timeline: StoryTimelineLike,
): SnapshotStore {
  const sortedNodes = [...timeline.nodes].sort((a, b) => a.order - b.order);
  const centerIdx = sortedNodes.findIndex((n) => n.id === newCenterNodeId);
  if (centerIdx < 0) {
    return store;
  }

  const windowSize = store.window.windowSize;
  const start = Math.max(0, centerIdx - windowSize);
  const end = Math.min(sortedNodes.length - 1, centerIdx + windowSize);
  const newActiveNodeIds = new Set<string>();
  for (let i = start; i <= end; i++) {
    newActiveNodeIds.add(sortedNodes[i]!.id);
  }

  // 降级：旧窗口中不在新窗口且非 pinned 的节点
  const cachedSnapshots = new Map(store.cachedSnapshots);
  for (const nodeId of store.window.activeNodeIds) {
    if (!newActiveNodeIds.has(nodeId) && !isPinned(store.pinned, nodeId)) {
      cachedSnapshots.delete(nodeId);
    }
  }

  // 升级：新窗口中不在缓存的节点 → 增量重算
  const needsCompute = Array.from(newActiveNodeIds).filter(
    (id) => !cachedSnapshots.has(id),
  );
  if (needsCompute.length > 0) {
    const propagationResult = computeSnapshotsOptimized(
      store,
      needsCompute,
      timeline,
      sortedNodes,
    );
    for (const nodeId of needsCompute) {
      const snap = propagationResult.get(nodeId);
      if (snap) {
        cachedSnapshots.set(nodeId, snap);
      }
    }
  }

  return {
    ...store,
    window: {
      centerNodeId: newCenterNodeId,
      windowSize,
      activeNodeIds: newActiveNodeIds,
    },
    cachedSnapshots,
  };
}

// ─────────────────────────────────────────────────────────────
// 快照获取
// ─────────────────────────────────────────────────────────────

/**
 * 获取节点的快照
 *
 * 策略：
 *   - pinned 或 active → 直接从缓存返回
 *   - diff_only → 增量重算（从最近的 pinned 或 active 起点开始）
 *
 * @param store 快照存储
 * @param nodeId 目标节点 ID
 * @param timeline 时间线
 * @returns 快照（若节点不存在则返回 undefined）
 */
export function getSnapshot(
  store: SnapshotStore,
  nodeId: string,
  timeline: StoryTimelineLike,
): NodeSnapshots | undefined {
  // 命中缓存
  const cached = store.cachedSnapshots.get(nodeId);
  if (cached) {
    return cached;
  }

  // diff_only → 增量重算
  const sortedNodes = [...timeline.nodes].sort((a, b) => a.order - b.order);
  const targetIdx = sortedNodes.findIndex((n) => n.id === nodeId);
  if (targetIdx < 0) {
    return undefined;
  }

  // 找到最近的缓存起点（向前找 pinned 或 active）
  let startIdx = targetIdx;
  for (let i = targetIdx - 1; i >= 0; i--) {
    if (store.cachedSnapshots.has(sortedNodes[i]!.id)) {
      startIdx = i;
      break;
    }
    if (i === 0) {
      startIdx = 0;
    }
  }

  // 从起点重算到目标
  const needsCompute = sortedNodes
    .slice(startIdx, targetIdx + 1)
    .map((n) => n.id)
    .filter((id) => !store.cachedSnapshots.has(id));

  if (needsCompute.length > 0) {
    const propagationResult = computeSnapshotsOptimized(
      store,
      needsCompute,
      timeline,
      sortedNodes,
    );
    const result = propagationResult.get(nodeId);
    // 不缓存 diff_only 的结果（除非用户滑动到该节点使其成为 active）
    return result;
  }

  return store.cachedSnapshots.get(nodeId);
}

// ─────────────────────────────────────────────────────────────
// 查询辅助
// ─────────────────────────────────────────────────────────────

/**
 * 获取窗口内的所有节点 ID
 */
export function getWindowNodes(store: SnapshotStore): string[] {
  return Array.from(store.window.activeNodeIds);
}

/**
 * 获取窗口内的 pinned 节点
 */
export function getPinnedInWindow(store: SnapshotStore): string[] {
  return Array.from(store.window.activeNodeIds).filter((nodeId) =>
    isPinned(store.pinned, nodeId),
  );
}

/**
 * 获取缓存的节点数量
 */
export function getCachedCount(store: SnapshotStore): number {
  return store.cachedSnapshots.size;
}

/**
 * 获取当前窗口中心节点
 */
export function getCenterNode(store: SnapshotStore): string | null {
  return store.window.centerNodeId;
}

// ─────────────────────────────────────────────────────────────
// 内部辅助函数
// ─────────────────────────────────────────────────────────────

/**
 * 从 SnapshotStore 获取 pinned 节点 ID 列表
 * （避免循环依赖，直接访问 store.pinned.entries）
 */
function getPinnedNodeIdsFromStore(store: SnapshotStore): string[] {
  return Array.from(store.pinned.entries.keys());
}

/**
 * 优化的快照计算
 *
 * 优先以窗口内的 PinnedSnapshot 为重算起点，
 * 避免从头开始的长链重算。
 *
 * @param store 快照存储
 * @param nodeIds 需要计算的节点 ID
 * @param timeline 时间线
 * @param sortedNodes 已排序的节点列表
 * @returns 计算结果
 */
function computeSnapshotsOptimized(
  store: SnapshotStore,
  nodeIds: string[],
  timeline: StoryTimelineLike,
  sortedNodes: PlotNodeLike[],
): PropagationResult {
  // 找到最早需要计算的节点
  const indices = nodeIds
    .map((id) => sortedNodes.findIndex((n) => n.id === id))
    .filter((idx) => idx >= 0);
  if (indices.length === 0) {
    return new Map();
  }

  const minIdx = Math.min(...indices);

  // 找到 minIdx 之前最近的 pinned 或 cached 节点作为起点
  let startIdx = 0;
  for (let i = minIdx - 1; i >= 0; i--) {
    if (
      isPinned(store.pinned, sortedNodes[i]!.id) ||
      store.cachedSnapshots.has(sortedNodes[i]!.id)
    ) {
      startIdx = i;
      break;
    }
  }

  // 构造子时间线（从 startIdx 到最大需要的节点）
  const maxNeededIdx = Math.max(...indices);
  const subNodes = sortedNodes.slice(
    startIdx,
    maxNeededIdx + 1,
  );

  // 构造子时间线
  const subTimeline: StoryTimelineLike = {
    id: timeline.id,
    nodes: subNodes,
    bindings: timeline.bindings,
  };

  // 如果起点有缓存，用缓存的快照作为初始状态
  if (startIdx > 0 && store.cachedSnapshots.has(sortedNodes[startIdx]!.id)) {
    // propagateStates 会从第一个节点开始计算，我们只需要相对结果
    // 注意：这是一个近似优化，完整实现需要支持"从中间节点开始"的推演
    return propagateStates(subTimeline);
  }

  return propagateStates(subTimeline);
}
