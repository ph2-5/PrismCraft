/**
 * Q3-10 / Task 4.6.8 — 重点快照标注管理（纯逻辑，零依赖）
 *
 * 管理 PinnedSnapshot（永久完整快照）的标注、查询和自动检测。
 *
 * 三层快照架构的第一层：PinnedSnapshot
 *   - 用户/AI 标注的关键节点
 *   - 永久保留完整快照（不随窗口滑动降级）
 *   - 典型数量：5-15 个/项目
 *
 * 自动标注规则（设计文档第八章）：
 *   - PlotEvent.type === "climax" | "twist" → 自动 Pinned
 *   - PlotEvent.type === "foreshadow" 且 binding.importance === "critical" → 自动 Pinned
 *   - character_arc binding 的中点 → 自动 Pinned
 *
 * 零依赖原则：仅导入本目录内相对模块。
 */

import type {
  PlotNodeLike,
  TimelineBindingLike,
  StoryTimelineLike,
} from "./snapshot-types";

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/**
 * 标注原因
 */
export type PinReason =
  | "manual" // 用户手动标注
  | "auto_climax" // 自动检测：高潮事件
  | "auto_twist" // 自动检测：转折事件
  | "auto_critical_foreshadow" // 自动检测：关键伏笔
  | "auto_character_arc_midpoint"; // 自动检测：角色弧线中点

/**
 * 标注者
 */
export type PinnedBy = "user" | "ai";

/**
 * 单个标注记录
 */
export interface PinnedSnapshotEntry {
  /** 节点 ID */
  nodeId: string;
  /** 标注原因 */
  reason: PinReason;
  /** 标注时间戳（ms） */
  pinnedAt: number;
  /** 标注者 */
  pinnedBy: PinnedBy;
}

/**
 * PinnedSnapshot 存储
 *
 * 使用 Map 存储，key 为 nodeId，便于 O(1) 查询。
 */
export interface PinnedSnapshotStore {
  /** nodeId → 标注记录 */
  entries: Map<string, PinnedSnapshotEntry>;
}

// ─────────────────────────────────────────────────────────────
// 存储管理函数
// ─────────────────────────────────────────────────────────────

/**
 * 创建空的 PinnedSnapshot 存储
 */
export function createPinnedSnapshotStore(): PinnedSnapshotStore {
  return { entries: new Map() };
}

/**
 * 标注节点为 Pinned（不可变操作，返回新 store）
 *
 * 如果节点已标注，则更新原因和时间戳。
 */
export function pinNode(
  store: PinnedSnapshotStore,
  nodeId: string,
  reason: PinReason,
  pinnedBy: PinnedBy,
  pinnedAt: number = Date.now(),
): PinnedSnapshotStore {
  const entries = new Map(store.entries);
  entries.set(nodeId, { nodeId, reason, pinnedAt, pinnedBy });
  return { entries };
}

/**
 * 取消标注（不可变操作）
 */
export function unpinNode(
  store: PinnedSnapshotStore,
  nodeId: string,
): PinnedSnapshotStore {
  const entries = new Map(store.entries);
  entries.delete(nodeId);
  return { entries };
}

/**
 * 查询节点是否已标注
 */
export function isPinned(
  store: PinnedSnapshotStore,
  nodeId: string,
): boolean {
  return store.entries.has(nodeId);
}

/**
 * 获取标注记录
 */
export function getPinnedEntry(
  store: PinnedSnapshotStore,
  nodeId: string,
): PinnedSnapshotEntry | undefined {
  return store.entries.get(nodeId);
}

/**
 * 获取所有已标注的节点 ID
 */
export function getPinnedNodeIds(store: PinnedSnapshotStore): string[] {
  return Array.from(store.entries.keys());
}

/**
 * 获取标注数量
 */
export function getPinnedCount(store: PinnedSnapshotStore): number {
  return store.entries.size;
}

// ─────────────────────────────────────────────────────────────
// 自动标注检测
// ─────────────────────────────────────────────────────────────

/**
 * 检测节点是否应自动标注
 *
 * 规则（设计文档第八章）：
 *   1. PlotEvent.type === "climax" → auto_climax
 *   2. PlotEvent.type === "twist" → auto_twist
 *   3. PlotEvent.type === "foreshadow" 且存在 importance=critical 的绑定 → auto_critical_foreshadow
 *   4. character_arc binding 的中点 → auto_character_arc_midpoint
 *
 * @param node 待检测节点
 * @param bindings 时间线绑定列表
 * @param allNodes 所有节点（用于 character_arc 中点计算）
 * @returns 标注原因，若不应标注则返回 null
 */
export function shouldAutoPin(
  node: PlotNodeLike,
  bindings: TimelineBindingLike[],
  allNodes?: PlotNodeLike[],
): PinReason | null {
  // 规则 1: climax
  if (node.plotEventType === "climax") {
    return "auto_climax";
  }

  // 规则 2: twist
  if (node.plotEventType === "twist") {
    return "auto_twist";
  }

  // 规则 3: foreshadow + critical binding
  if (node.plotEventType === "foreshadow") {
    const hasCriticalBinding = bindings.some(
      (b) =>
        b.importance === "critical" &&
        (b.sourceNodeId === node.id || b.targetNodeId === node.id),
    );
    if (hasCriticalBinding) {
      return "auto_critical_foreshadow";
    }
  }

  // 规则 4: character_arc binding 中点
  if (allNodes) {
    const arcBindings = bindings.filter((b) => b.type === "character_arc");
    for (const arc of arcBindings) {
      const sourceIdx = allNodes.findIndex((n) => n.id === arc.sourceNodeId);
      const targetIdx = allNodes.findIndex((n) => n.id === arc.targetNodeId);
      if (sourceIdx < 0 || targetIdx < 0) continue;
      const midIdx = Math.floor((sourceIdx + targetIdx) / 2);
      const midNode = allNodes[midIdx];
      if (midNode && midNode.id === node.id) {
        return "auto_character_arc_midpoint";
      }
    }
  }

  return null;
}

/**
 * 从时间线自动标注所有应标注的节点
 *
 * 遍历所有节点，对符合自动标注规则的节点进行标注。
 * 不会覆盖已有的人工标注（pinnedBy="user"）。
 *
 * @param store 现有存储
 * @param timeline 时间线
 * @returns 更新后的存储
 */
export function autoPinFromTimeline(
  store: PinnedSnapshotStore,
  timeline: StoryTimelineLike,
): PinnedSnapshotStore {
  let result = store;
  const sortedNodes = [...timeline.nodes].sort((a, b) => a.order - b.order);

  for (const node of sortedNodes) {
    // 不覆盖已有的人工标注
    const existing = result.entries.get(node.id);
    if (existing && existing.pinnedBy === "user") {
      continue;
    }

    const reason = shouldAutoPin(node, timeline.bindings, sortedNodes);
    if (reason) {
      result = pinNode(result, node.id, reason, "ai");
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// 查询辅助
// ─────────────────────────────────────────────────────────────

/**
 * 按原因筛选标注
 */
export function getPinnedByReason(
  store: PinnedSnapshotStore,
  reason: PinReason,
): PinnedSnapshotEntry[] {
  return Array.from(store.entries.values()).filter((e) => e.reason === reason);
}

/**
 * 按标注者筛选
 */
export function getPinnedBy(
  store: PinnedSnapshotStore,
  pinnedBy: PinnedBy,
): PinnedSnapshotEntry[] {
  return Array.from(store.entries.values()).filter((e) => e.pinnedBy === pinnedBy);
}

/**
 * 序列化 PinnedSnapshotStore（用于持久化）
 */
export function serializePinnedStore(
  store: PinnedSnapshotStore,
): string {
  const entries = Array.from(store.entries.values());
  return JSON.stringify(entries);
}

/**
 * 反序列化 PinnedSnapshotStore
 */
export function deserializePinnedStore(
  json: string,
): PinnedSnapshotStore {
  try {
    const entries = JSON.parse(json) as PinnedSnapshotEntry[];
    const map = new Map<string, PinnedSnapshotEntry>();
    for (const entry of entries) {
      map.set(entry.nodeId, entry);
    }
    return { entries: map };
  } catch {
    return createPinnedSnapshotStore();
  }
}
