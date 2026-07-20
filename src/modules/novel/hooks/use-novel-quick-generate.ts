/**
 * P1.5 细化拆分：快速模式一键生成 Handler Hook。
 *
 * 从 useNovelModeHandlers 进一步拆出 handleQuickGenerate，集中管理
 * "快速模式一键生成"业务逻辑：
 *
 * 1. 提取角色/场景（与 content_import → character_manage 一致）
 * 2. 生成分镜（quick 模式没有 segments 选中流程，直接对 rawText 调用 breakdownTextToShotsTool）
 * 3. 更新状态：进入 character_manage 阶段，同时填充 shots
 */

import { useCallback } from "react";
import { errorLogger } from "@/shared/error-logger";
import {
  extractAndMatchEntities,
  breakdownShotsForSegments,
  toCharactersInPipeline,
  toScenesInPipeline,
} from "./pipeline-helpers";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UseNovelQuickGenerateOptions {
  state: UsePipelineStateResult["state"];
  setState: UsePipelineStateResult["setState"];
  isProcessing: boolean;
  setIsProcessing: UsePipelineStateResult["setIsProcessing"];
  setShots: UsePipelineStateResult["setShots"];
  isMountedRef: UsePipelineStateResult["isMountedRef"];
}

export interface UseNovelQuickGenerateResult {
  handleQuickGenerate: () => Promise<void>;
}

/**
 * 快速模式一键生成 Handler Hook。
 */
export function useNovelQuickGenerate({
  state,
  setState,
  isProcessing,
  setIsProcessing,
  setShots,
  isMountedRef,
}: UseNovelQuickGenerateOptions): UseNovelQuickGenerateResult {
  const handleQuickGenerate = useCallback(async () => {
    if (isProcessing || state.rawText.trim().length === 0) return;
    setIsProcessing(true);
    try {
      // 1. 提取角色/场景（与 content_import → character_manage 一致）
      const entityResult = await extractAndMatchEntities(
        state.rawText,
        () => isMountedRef.current,
      );
      if (!isMountedRef.current || !entityResult) return;

      const newCharacters = toCharactersInPipeline(entityResult.characters);
      const newScenes = toScenesInPipeline(entityResult.scenes);

      // 2. 生成分镜（quick 模式没有 segments 选中流程，直接对 rawText 调用 breakdownTextToShotsTool）
      const charactersJson = JSON.stringify(newCharacters);
      const quickShots = await breakdownShotsForSegments(
        [
          {
            id: "quick-1",
            title: "快速模式",
            summary: "",
            startChar: 0,
            endChar: state.rawText.length,
            estimatedDuration: 30,
            keyEvents: [],
            text: state.rawText,
          },
        ],
        charactersJson,
        () => isMountedRef.current,
      );
      if (!isMountedRef.current || !quickShots) return;

      // 3. 更新状态：进入 character_manage 阶段（让用户查看角色），同时填充 shots
      setState((prev) => ({
        ...prev,
        stage: "character_manage",
        step: 1,
        characters: newCharacters,
        scenes: newScenes,
      }));
      setShots(quickShots);
    } catch (err) {
      errorLogger.warn("[useNovelPipeline] handleQuickGenerate 失败", err);
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [isProcessing, state.rawText, setState, setShots, setIsProcessing, isMountedRef]);

  return { handleQuickGenerate };
}
