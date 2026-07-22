/**
 * Q3-9 / Task 4.6.7 — 多时间线支持 React Hook
 *
 * 封装 shared-logic/timeline/cross-timeline-injector 的纯逻辑，
 * 提供 React 友好的多时间线 API。
 *
 * 职责：
 *   - 跨时间线绑定注入
 *   - 多时间线关系查询
 *   - 时间线层级计算（UI 嵌套展示用）
 *
 * stableActions 模式：所有 action 方法用 useCallback 缓存。
 */

import { useCallback, useMemo } from "react";
import {
  injectCrossTimelineBindings as injectCrossTimelineBindingsLogic,
  getInboundCrossTimelineBindings as getInboundCrossTimelineBindingsLogic,
  getOutboundCrossTimelineBindings as getOutboundCrossTimelineBindingsLogic,
  getBindingsBetweenTimelines as getBindingsBetweenTimelinesLogic,
  getTimelineRelationships as getTimelineRelationshipsLogic,
  computeTimelineLayers as computeTimelineLayersLogic,
  findRelationship as findRelationshipLogic,
  normalizeCrossTimelineBinding as normalizeCrossTimelineBindingLogic,
  type CrossTimelineBindingLike,
  type MultiTimelineLike,
  type TimelineRelationshipLike,
  type CrossTimelineInjectionResult,
  type TimelineLayerInfoLike,
} from "@/shared-logic/timeline";

/**
 * useMultiTimeline 的返回值
 */
export interface MultiTimelineApi {
  /** 跨时间线绑定注入 */
  injectCrossTimelineBindings: (
    nodeId: string,
    timelineId: string,
    multiView: MultiTimelineLike,
    basePrompt: string,
  ) => CrossTimelineInjectionResult;
  /** 查询指定节点的入站跨时间线绑定 */
  getInboundCrossTimelineBindings: (
    nodeId: string,
    timelineId: string,
    multiView: MultiTimelineLike,
  ) => CrossTimelineBindingLike[];
  /** 查询指定节点的出站跨时间线绑定 */
  getOutboundCrossTimelineBindings: (
    nodeId: string,
    timelineId: string,
    multiView: MultiTimelineLike,
  ) => CrossTimelineBindingLike[];
  /** 查询两个时间线之间的所有绑定 */
  getBindingsBetweenTimelines: (
    fromTimelineId: string,
    toTimelineId: string,
    multiView: MultiTimelineLike,
  ) => CrossTimelineBindingLike[];
  /** 查询涉及指定时间线的所有关系 */
  getTimelineRelationships: (
    timelineId: string,
    multiView: MultiTimelineLike,
  ) => TimelineRelationshipLike[];
  /** 计算时间线层级结构 */
  computeTimelineLayers: (
    timelines: Array<{ id: string; parentTimelineId?: string }>,
  ) => Map<string, TimelineLayerInfoLike>;
  /** 查找两个时间线之间的关系 */
  findRelationship: (
    relationships: TimelineRelationshipLike[],
    fromTimelineId: string,
    toTimelineId: string,
  ) => TimelineRelationshipLike | undefined;
  /** 规范化跨时间线绑定 */
  normalizeCrossTimelineBinding: (
    binding: CrossTimelineBindingLike,
  ) => CrossTimelineBindingLike;
}

/**
 * 多时间线支持 Hook
 *
 * @example
 * ```tsx
 * const multi = useMultiTimeline();
 * const multiView = { timelineIds, relationships, crossTimelineBindings };
 *
 * // 跨时间线注入
 * const result = multi.injectCrossTimelineBindings(
 *   "main-node-1",
 *   "tl-main",
 *   multiView,
 *   "生成图片",
 * );
 *
 * // 计算层级
 * const layers = multi.computeTimelineLayers(timelines);
 * ```
 */
export function useMultiTimeline(): MultiTimelineApi {
  const injectCrossTimelineBindings = useCallback(
    (
      nodeId: string,
      timelineId: string,
      multiView: MultiTimelineLike,
      basePrompt: string,
    ): CrossTimelineInjectionResult =>
      injectCrossTimelineBindingsLogic(nodeId, timelineId, multiView, basePrompt),
    [],
  );

  const getInboundCrossTimelineBindings = useCallback(
    (
      nodeId: string,
      timelineId: string,
      multiView: MultiTimelineLike,
    ): CrossTimelineBindingLike[] =>
      getInboundCrossTimelineBindingsLogic(nodeId, timelineId, multiView),
    [],
  );

  const getOutboundCrossTimelineBindings = useCallback(
    (
      nodeId: string,
      timelineId: string,
      multiView: MultiTimelineLike,
    ): CrossTimelineBindingLike[] =>
      getOutboundCrossTimelineBindingsLogic(nodeId, timelineId, multiView),
    [],
  );

  const getBindingsBetweenTimelines = useCallback(
    (
      fromTimelineId: string,
      toTimelineId: string,
      multiView: MultiTimelineLike,
    ): CrossTimelineBindingLike[] =>
      getBindingsBetweenTimelinesLogic(fromTimelineId, toTimelineId, multiView),
    [],
  );

  const getTimelineRelationships = useCallback(
    (
      timelineId: string,
      multiView: MultiTimelineLike,
    ): TimelineRelationshipLike[] =>
      getTimelineRelationshipsLogic(timelineId, multiView),
    [],
  );

  const computeTimelineLayers = useCallback(
    (
      timelines: Array<{ id: string; parentTimelineId?: string }>,
    ): Map<string, TimelineLayerInfoLike> =>
      computeTimelineLayersLogic(timelines),
    [],
  );

  const findRelationship = useCallback(
    (
      relationships: TimelineRelationshipLike[],
      fromTimelineId: string,
      toTimelineId: string,
    ): TimelineRelationshipLike | undefined =>
      findRelationshipLogic(relationships, fromTimelineId, toTimelineId),
    [],
  );

  const normalizeCrossTimelineBinding = useCallback(
    (binding: CrossTimelineBindingLike): CrossTimelineBindingLike =>
      normalizeCrossTimelineBindingLogic(binding),
    [],
  );

  return useMemo(
    () => ({
      injectCrossTimelineBindings,
      getInboundCrossTimelineBindings,
      getOutboundCrossTimelineBindings,
      getBindingsBetweenTimelines,
      getTimelineRelationships,
      computeTimelineLayers,
      findRelationship,
      normalizeCrossTimelineBinding,
    }),
    [
      injectCrossTimelineBindings,
      getInboundCrossTimelineBindings,
      getOutboundCrossTimelineBindings,
      getBindingsBetweenTimelines,
      getTimelineRelationships,
      computeTimelineLayers,
      findRelationship,
      normalizeCrossTimelineBinding,
    ],
  );
}
