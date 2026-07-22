/**
 * Q3-10 / Task 4.6.8 — 滑动窗口 + 重点标注 React Hook
 *
 * 封装 pinned-snapshot + snapshot-window 的纯逻辑，
 * 提供 React 友好的三层快照架构 API。
 *
 * 职责：
 *   - 管理 PinnedSnapshot 标注（手动 + 自动）
 *   - 管理滑动窗口（初始化 + 滑动）
 *   - 获取节点快照（命中缓存或增量重算）
 *
 * stableActions 模式：所有 action 方法用 useCallback 缓存。
 */

import { useCallback, useMemo, useState } from "react";
import {
  createPinnedSnapshotStore as createPinnedSnapshotStoreLogic,
  pinNode as pinNodeLogic,
  unpinNode as unpinNodeLogic,
  isPinned as isPinnedLogic,
  getPinnedNodeIds as getPinnedNodeIdsLogic,
  getPinnedCount as getPinnedCountLogic,
  shouldAutoPin as shouldAutoPinLogic,
  autoPinFromTimeline as autoPinFromTimelineLogic,
  type PinnedSnapshotStore,
  type PinReason,
  type PinnedBy,
} from "@/shared-logic/timeline";
import {
  createSnapshotStore as createSnapshotStoreLogic,
  initWindow as initWindowLogic,
  getSnapshotStrategy as getSnapshotStrategyLogic,
  slideWindow as slideWindowLogic,
  getSnapshot as getSnapshotLogic,
  getWindowNodes as getWindowNodesLogic,
  getPinnedInWindow as getPinnedInWindowLogic,
  getCachedCount as getCachedCountLogic,
  getCenterNode as getCenterNodeLogic,
  type SnapshotStore,
  type WindowConfig,
  type SnapshotStrategy,
} from "@/shared-logic/timeline";
import type {
  StoryTimelineLike,
  NodeSnapshots,
  PlotNodeLike,
  TimelineBindingLike,
} from "@/shared-logic/timeline";

/**
 * useSnapshotWindow 配置
 */
export interface UseSnapshotWindowOptions extends WindowConfig {}

/**
 * useSnapshotWindow 的返回值
 */
export interface SnapshotWindowApi {
  // ── PinnedSnapshot 管理 ──
  /** 标注节点为 Pinned */
  pinNode: (nodeId: string, reason?: PinReason, pinnedBy?: PinnedBy) => void;
  /** 取消标注 */
  unpinNode: (nodeId: string) => void;
  /** 查询节点是否已标注 */
  isPinned: (nodeId: string) => boolean;
  /** 获取所有标注节点 ID */
  getPinnedNodeIds: () => string[];
  /** 获取标注数量 */
  getPinnedCount: () => number;
  /** 自动标注时间线上的关键节点 */
  autoPinFromTimeline: (timeline: StoryTimelineLike) => void;
  /** 检测节点是否应自动标注 */
  shouldAutoPin: (
    node: PlotNodeLike,
    bindings: TimelineBindingLike[],
    allNodes?: PlotNodeLike[],
  ) => PinReason | null;

  // ── 窗口管理 ──
  /** 初始化窗口 */
  initWindow: (centerNodeId: string, timeline: StoryTimelineLike) => void;
  /** 滑动窗口 */
  slideWindow: (newCenterNodeId: string, timeline: StoryTimelineLike) => void;
  /** 获取当前中心节点 */
  getCenterNode: () => string | null;
  /** 获取窗口内节点 */
  getWindowNodes: () => string[];
  /** 获取窗口内 pinned 节点 */
  getPinnedInWindow: () => string[];
  /** 获取缓存数量 */
  getCachedCount: () => number;

  // ── 快照获取 ──
  /** 获取节点快照 */
  getSnapshot: (
    nodeId: string,
    timeline: StoryTimelineLike,
  ) => NodeSnapshots | undefined;
  /** 获取节点快照策略 */
  getSnapshotStrategy: (nodeId: string) => SnapshotStrategy;
}

/**
 * 滑动窗口 + 重点标注 Hook
 *
 * @example
 * ```tsx
 * const sw = useSnapshotWindow({ windowSize: 3 });
 *
 * // 初始化
 * sw.initWindow("n-5", timeline);
 * sw.autoPinFromTimeline(timeline);
 *
 * // 手动标注
 * sw.pinNode("n-3", "manual", "user");
 *
 * // 滑动窗口
 * sw.slideWindow("n-6", timeline);
 *
 * // 获取快照
 * const snap = sw.getSnapshot("n-5", timeline);
 * ```
 */
export function useSnapshotWindow(
  options?: UseSnapshotWindowOptions,
): SnapshotWindowApi {
  const [pinnedStore, setPinnedStore] = useState<PinnedSnapshotStore>(
    () => createPinnedSnapshotStoreLogic(),
  );
  const [store, setStore] = useState<SnapshotStore>(() =>
    createSnapshotStoreLogic(createPinnedSnapshotStoreLogic(), options),
  );

  // ── PinnedSnapshot 管理 ──
  const pinNode = useCallback(
    (nodeId: string, reason: PinReason = "manual", pinnedBy: PinnedBy = "user") => {
      setPinnedStore((prev) => pinNodeLogic(prev, nodeId, reason, pinnedBy));
      // 同时更新 store 的 pinned 引用
      setStore((prev) => ({
        ...prev,
        pinned: pinNodeLogic(prev.pinned, nodeId, reason, pinnedBy),
      }));
    },
    [],
  );

  const unpinNode = useCallback((nodeId: string) => {
    setPinnedStore((prev) => unpinNodeLogic(prev, nodeId));
    setStore((prev) => ({
      ...prev,
      pinned: unpinNodeLogic(prev.pinned, nodeId),
    }));
  }, []);

  const isPinned = useCallback(
    (nodeId: string) => isPinnedLogic(pinnedStore, nodeId),
    [pinnedStore],
  );

  const getPinnedNodeIds = useCallback(
    () => getPinnedNodeIdsLogic(pinnedStore),
    [pinnedStore],
  );

  const getPinnedCount = useCallback(
    () => getPinnedCountLogic(pinnedStore),
    [pinnedStore],
  );

  const autoPinFromTimeline = useCallback(
    (timeline: StoryTimelineLike) => {
      setPinnedStore((prev) => autoPinFromTimelineLogic(prev, timeline));
      setStore((prev) => ({
        ...prev,
        pinned: autoPinFromTimelineLogic(prev.pinned, timeline),
      }));
    },
    [],
  );

  const shouldAutoPin = useCallback(
    (
      node: PlotNodeLike,
      bindings: TimelineBindingLike[],
      allNodes?: PlotNodeLike[],
    ) => shouldAutoPinLogic(node, bindings, allNodes),
    [],
  );

  // ── 窗口管理 ──
  const initWindow = useCallback(
    (centerNodeId: string, timeline: StoryTimelineLike) => {
      setStore((prev) => initWindowLogic(prev, centerNodeId, timeline));
    },
    [],
  );

  const slideWindow = useCallback(
    (newCenterNodeId: string, timeline: StoryTimelineLike) => {
      setStore((prev) => slideWindowLogic(prev, newCenterNodeId, timeline));
    },
    [],
  );

  const getCenterNode = useCallback(
    () => getCenterNodeLogic(store),
    [store],
  );

  const getWindowNodes = useCallback(
    () => getWindowNodesLogic(store),
    [store],
  );

  const getPinnedInWindow = useCallback(
    () => getPinnedInWindowLogic(store),
    [store],
  );

  const getCachedCount = useCallback(
    () => getCachedCountLogic(store),
    [store],
  );

  // ── 快照获取 ──
  const getSnapshot = useCallback(
    (nodeId: string, timeline: StoryTimelineLike) =>
      getSnapshotLogic(store, nodeId, timeline),
    [store],
  );

  const getSnapshotStrategy = useCallback(
    (nodeId: string) => getSnapshotStrategyLogic(store, nodeId),
    [store],
  );

  return useMemo(
    () => ({
      pinNode,
      unpinNode,
      isPinned,
      getPinnedNodeIds,
      getPinnedCount,
      autoPinFromTimeline,
      shouldAutoPin,
      initWindow,
      slideWindow,
      getCenterNode,
      getWindowNodes,
      getPinnedInWindow,
      getCachedCount,
      getSnapshot,
      getSnapshotStrategy,
    }),
    [
      pinNode,
      unpinNode,
      isPinned,
      getPinnedNodeIds,
      getPinnedCount,
      autoPinFromTimeline,
      shouldAutoPin,
      initWindow,
      slideWindow,
      getCenterNode,
      getWindowNodes,
      getPinnedInWindow,
      getCachedCount,
      getSnapshot,
      getSnapshotStrategy,
    ],
  );
}
