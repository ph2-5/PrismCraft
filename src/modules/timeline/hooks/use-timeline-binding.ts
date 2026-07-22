/**
 * Q3-6 / Task 4.6.4 — TimelineBinding 注入层 React Hook
 *
 * 封装 shared-logic/timeline/binding-injector 的纯逻辑，提供 React 友好的 API。
 *
 * 职责：
 *   - 管理注入配置（tokenBudget）
 *   - 提供 injectBindings / getInjectableBindings / getNodeBindings 的稳定引用
 *   - 缓存常用查询结果（useMemo）
 *
 * 参考 use-cascade-update.ts 的 stableActions 模式：
 *   所有 action 方法用 useCallback 缓存，避免引用变化引起下游重渲染。
 *
 * 与状态推演引擎的集成：
 *   const propagation = propagateStates(timeline);
 *   const binding = useTimelineBinding();
 *   const downstream = getDownstreamNodeIds(nodeId, timeline);
 *   const result = binding.injectBindings(nodeId, timeline.bindings, basePrompt, {
 *     downstreamNodeIds: downstream,
 *   });
 */

import { useCallback, useMemo, useState } from "react";
import {
  injectBindings as injectBindingsLogic,
  getInjectableBindings as getInjectableBindingsLogic,
  getNodeBindings as getNodeBindingsLogic,
  getDownstreamNodeIds as getDownstreamNodeIdsLogic,
  normalizeBinding as normalizeBindingLogic,
  extractBindingsFromTimeline as extractBindingsFromTimelineLogic,
} from "@/shared-logic/timeline";
import type {
  InjectionResult,
  BindingForInjection,
  TimelineBindingLike,
  StoryTimelineLike,
} from "@/shared-logic/timeline";

/**
 * useTimelineBinding 配置
 */
export interface UseTimelineBindingOptions {
  /** Token 预算，默认 1500 */
  tokenBudget?: number;
}

/**
 * useTimelineBinding 的返回值
 */
export interface TimelineBindingApi {
  /** 当前 token 预算 */
  tokenBudget: number;
  /** 设置 token 预算 */
  setTokenBudget: (budget: number) => void;
  /** 注入绑定到节点 Prompt */
  injectBindings: (
    nodeId: string,
    bindings: Array<TimelineBindingLike | BindingForInjection>,
    basePrompt: string,
    options?: { downstreamNodeIds?: string[] },
  ) => InjectionResult;
  /** 查询节点的可注入绑定（不实际注入） */
  getInjectableBindings: (
    nodeId: string,
    bindings: Array<TimelineBindingLike | BindingForInjection>,
  ) => BindingForInjection[];
  /** 查询节点的所有绑定（inbound + outbound） */
  getNodeBindings: (
    nodeId: string,
    bindings: Array<TimelineBindingLike | BindingForInjection>,
  ) => {
    inbound: BindingForInjection[];
    outbound: BindingForInjection[];
  };
  /** 计算节点的下游节点 ID 列表 */
  getDownstreamNodeIds: (nodeId: string, timeline: StoryTimelineLike) => string[];
  /** 规范化单个绑定 */
  normalizeBinding: (
    binding: TimelineBindingLike | BindingForInjection,
  ) => BindingForInjection;
  /** 从时间线提取所有绑定（规范化） */
  extractBindingsFromTimeline: (timeline: StoryTimelineLike) => BindingForInjection[];
}

/**
 * TimelineBinding 注入层 Hook
 *
 * @example
 * ```tsx
 * const binding = useTimelineBinding({ tokenBudget: 2000 });
 * const timeline = ...;
 * const basePrompt = "生成图片...";
 *
 * // 注入绑定
 * const result = binding.injectBindings("node-3", timeline.bindings, basePrompt, {
 *   downstreamNodeIds: binding.getDownstreamNodeIds("node-3", timeline),
 * });
 * console.log(result.injectedPrompt);
 *
 * // 查询可注入绑定（用于 UI 展示）
 * const injectable = binding.getInjectableBindings("node-3", timeline.bindings);
 * ```
 */
export function useTimelineBinding(
  options?: UseTimelineBindingOptions,
): TimelineBindingApi {
  const [tokenBudget, setTokenBudget] = useState<number>(
    options?.tokenBudget ?? 1500,
  );

  const injectBindings = useCallback(
    (
      nodeId: string,
      bindings: Array<TimelineBindingLike | BindingForInjection>,
      basePrompt: string,
      injectOptions?: { downstreamNodeIds?: string[] },
    ): InjectionResult =>
      injectBindingsLogic(nodeId, bindings, basePrompt, {
        tokenBudget,
        downstreamNodeIds: injectOptions?.downstreamNodeIds,
      }),
    [tokenBudget],
  );

  const getInjectableBindings = useCallback(
    (
      nodeId: string,
      bindings: Array<TimelineBindingLike | BindingForInjection>,
    ): BindingForInjection[] => getInjectableBindingsLogic(nodeId, bindings),
    [],
  );

  const getNodeBindings = useCallback(
    (
      nodeId: string,
      bindings: Array<TimelineBindingLike | BindingForInjection>,
    ) => getNodeBindingsLogic(nodeId, bindings),
    [],
  );

  const getDownstreamNodeIds = useCallback(
    (nodeId: string, timeline: StoryTimelineLike): string[] =>
      getDownstreamNodeIdsLogic(nodeId, timeline),
    [],
  );

  const normalizeBinding = useCallback(
    (binding: TimelineBindingLike | BindingForInjection): BindingForInjection =>
      normalizeBindingLogic(binding),
    [],
  );

  const extractBindingsFromTimeline = useCallback(
    (timeline: StoryTimelineLike): BindingForInjection[] =>
      extractBindingsFromTimelineLogic(timeline),
    [],
  );

  return useMemo(
    () => ({
      tokenBudget,
      setTokenBudget,
      injectBindings,
      getInjectableBindings,
      getNodeBindings,
      getDownstreamNodeIds,
      normalizeBinding,
      extractBindingsFromTimeline,
    }),
    [
      tokenBudget,
      injectBindings,
      getInjectableBindings,
      getNodeBindings,
      getDownstreamNodeIds,
      normalizeBinding,
      extractBindingsFromTimeline,
    ],
  );
}
