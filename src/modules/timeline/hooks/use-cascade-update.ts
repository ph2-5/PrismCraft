/**
 * Q3-5 / Task 4.6.3 — 级联更新与脏标记 React Hook
 *
 * 封装 shared-logic/timeline/cascade-update 的纯逻辑，提供 React 友好的 API。
 *
 * 职责：
 *   - 管理 DirtyMap 状态（useState）
 *   - 管理 CascadeUpdateMode（useState，默认 cascade_all）
 *   - 提供 markDirty / incrementalUpdate / clearDirty / clearAllDirty 的稳定引用
 *   - 暴露 isDirty / getDirtyNodeIds 查询
 *
 * 参考 use-video-task-queries.ts 的 stableActions 模式：
 *   所有 action 方法用 useMemo 缓存，依赖为常量，避免引用变化引起下游重渲染。
 *
 * 与 StalenessTracker 集成（设计文档 3.2 节）：
 *   上游 novel 模块的结构变更 → StalenessTracker.markStale →
 *   调用方通过本 hook 的 markDirty 触发时间线级联标记 →
 *   调用 incrementalUpdate 增量重算。
 */

import { useCallback, useMemo, useState } from "react";
import {
  markDirty as markDirtyLogic,
  incrementalUpdate as incrementalUpdateLogic,
  isDirty as isDirtyLogic,
  getDirtyNodeIds as getDirtyNodeIdsLogic,
  getDirectDirtyNodeIds as getDirectDirtyNodeIdsLogic,
  clearDirty as clearDirtyLogic,
  clearAllDirty as clearAllDirtyLogic,
} from "@/shared-logic/timeline";
import type {
  CascadeUpdateMode,
  DirtyMap,
  DirtyEntry,
  IncrementalUpdateResult,
  StoryTimelineLike,
  PlotNodeLike,
  PropagationResult,
} from "@/shared-logic/timeline";

/**
 * useCascadeUpdate 的返回值
 */
export interface CascadeUpdateApi {
  /** 当前脏映射（只读） */
  dirtyMap: DirtyMap;
  /** 当前级联模式 */
  updateMode: CascadeUpdateMode;
  /** 设置级联模式 */
  setUpdateMode: (mode: CascadeUpdateMode) => void;
  /** 标记节点为脏（使用当前 updateMode） */
  markDirty: (affectedNodeIds: string[], timeline: StoryTimelineLike) => void;
  /** 增量重算脏节点 */
  incrementalUpdate: (
    timeline: StoryTimelineLike,
    prevResult: PropagationResult,
  ) => IncrementalUpdateResult;
  /** 查询节点是否为脏 */
  isDirty: (nodeId: string) => boolean;
  /** 获取所有脏节点 ID（按 order 排序） */
  getDirtyNodeIds: (timeline: StoryTimelineLike) => string[];
  /** 获取直接脏节点 ID（level=direct） */
  getDirectDirtyNodeIds: () => string[];
  /** 清除指定节点的脏标记 */
  clearDirty: (nodeId: string) => void;
  /** 清除所有脏标记 */
  clearAllDirty: () => void;
  /** 脏节点数量 */
  dirtyCount: number;
}

/**
 * 级联更新与脏标记 Hook
 *
 * @example
 * ```tsx
 * const cascade = useCascadeUpdate();
 * const result = propagateStates(timeline);
 *
 * // 用户修改 node-2 后
 * cascade.markDirty(["node-2"], timeline);
 *
 * // 增量重算
 * const updated = cascade.incrementalUpdate(timeline, result);
 * ```
 */
export function useCascadeUpdate(
  initialMode: CascadeUpdateMode = "cascade_all",
): CascadeUpdateApi {
  const [dirtyMap, setDirtyMap] = useState<DirtyMap>(() => new Map());
  const [updateMode, setUpdateMode] = useState<CascadeUpdateMode>(initialMode);

  const markDirty = useCallback(
    (affectedNodeIds: string[], timeline: StoryTimelineLike) => {
      setDirtyMap((prev) =>
        markDirtyLogic(affectedNodeIds, timeline, updateMode, prev),
      );
    },
    [updateMode],
  );

  const incrementalUpdate = useCallback(
    (timeline: StoryTimelineLike, prevResult: PropagationResult) =>
      incrementalUpdateLogic(dirtyMap, timeline, prevResult),
    [dirtyMap],
  );

  const isDirty = useCallback(
    (nodeId: string) => isDirtyLogic(dirtyMap, nodeId),
    [dirtyMap],
  );

  const getDirtyNodeIds = useCallback(
    (timeline: StoryTimelineLike) => getDirtyNodeIdsLogic(dirtyMap, timeline),
    [dirtyMap],
  );

  const getDirectDirtyNodeIds = useCallback(
    () => getDirectDirtyNodeIdsLogic(dirtyMap),
    [dirtyMap],
  );

  const clearDirty = useCallback((nodeId: string) => {
    setDirtyMap((prev) => clearDirtyLogic(prev, nodeId));
  }, []);

  const clearAllDirty = useCallback(() => {
    setDirtyMap(clearAllDirtyLogic());
  }, []);

  return useMemo(
    () => ({
      dirtyMap,
      updateMode,
      setUpdateMode,
      markDirty,
      incrementalUpdate,
      isDirty,
      getDirtyNodeIds,
      getDirectDirtyNodeIds,
      clearDirty,
      clearAllDirty,
      dirtyCount: dirtyMap.size,
    }),
    [
      dirtyMap,
      updateMode,
      markDirty,
      incrementalUpdate,
      isDirty,
      getDirtyNodeIds,
      getDirectDirtyNodeIds,
      clearDirty,
      clearAllDirty,
    ],
  );
}

// 重导出类型供调用方使用
export type { DirtyEntry, PlotNodeLike };
