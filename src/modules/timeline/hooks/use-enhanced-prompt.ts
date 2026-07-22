/**
 * Q3-8 / Task 4.6.6 — 增强 Prompt 合成 React Hook
 *
 * 封装 shared-logic/timeline/prompt-enhancer 的纯逻辑，提供 React 友好的 API。
 *
 * 参考 use-cascade-update.ts 的 stableActions 模式：
 *   所有 action 方法用 useCallback 缓存。
 */

import { useCallback, useMemo, useState } from "react";
import {
  enhancePrompt as enhancePromptLogic,
  batchEnhancePrompts as batchEnhancePromptsLogic,
} from "@/shared-logic/timeline";
import type {
  EnhancedPrompt,
  StoryTimelineLike,
  PropagationResult,
} from "@/shared-logic/timeline";

export interface UseEnhancedPromptOptions {
  /** Token 预算（传给 enhancePrompt） */
  tokenBudget?: number;
}

export interface EnhancedPromptApi {
  /** 当前 token 预算 */
  tokenBudget: number;
  /** 设置 token 预算 */
  setTokenBudget: (budget: number) => void;
  /** 增强单个节点 Prompt */
  enhancePrompt: (
    nodeId: string,
    timeline: StoryTimelineLike,
    basePrompt: string,
    options?: { propagationResult?: PropagationResult; downstreamNodeIds?: string[] },
  ) => EnhancedPrompt;
  /** 批量增强多个节点 Prompt */
  batchEnhancePrompts: (
    nodeIds: string[],
    timeline: StoryTimelineLike,
    basePrompts: Map<string, string>,
    options?: { propagationResult?: PropagationResult },
  ) => Map<string, EnhancedPrompt>;
}

export function useEnhancedPrompt(
  options?: UseEnhancedPromptOptions,
): EnhancedPromptApi {
  const [tokenBudget, setTokenBudget] = useState<number>(
    options?.tokenBudget ?? 1500,
  );

  const enhancePrompt = useCallback(
    (
      nodeId: string,
      timeline: StoryTimelineLike,
      basePrompt: string,
      enhanceOptions?: { propagationResult?: PropagationResult; downstreamNodeIds?: string[] },
    ): EnhancedPrompt =>
      enhancePromptLogic(nodeId, timeline, basePrompt, {
        tokenBudget,
        propagationResult: enhanceOptions?.propagationResult,
        downstreamNodeIds: enhanceOptions?.downstreamNodeIds,
      }),
    [tokenBudget],
  );

  const batchEnhancePrompts = useCallback(
    (
      nodeIds: string[],
      timeline: StoryTimelineLike,
      basePrompts: Map<string, string>,
      batchOptions?: { propagationResult?: PropagationResult },
    ): Map<string, EnhancedPrompt> =>
      batchEnhancePromptsLogic(nodeIds, timeline, basePrompts, {
        tokenBudget,
        propagationResult: batchOptions?.propagationResult,
      }),
    [tokenBudget],
  );

  return useMemo(
    () => ({
      tokenBudget,
      setTokenBudget,
      enhancePrompt,
      batchEnhancePrompts,
    }),
    [tokenBudget, enhancePrompt, batchEnhancePrompts],
  );
}
