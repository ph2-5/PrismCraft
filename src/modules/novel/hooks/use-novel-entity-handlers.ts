/**
 * P1.5 细化拆分：角色/场景实体管理 Handlers Hook。
 *
 * 从 useNovelTools 进一步拆出，集中管理 EntityReviewPanel 相关 handlers：
 * - handleConfirmCharacter / handleConfirmScene：标记确认
 * - handleEditCharacter / handleEditScene：内联编辑
 * - handleMatchCharacter：调用 matchEntitiesTool 进行角色匹配
 *
 * 这部分逻辑独立于导入/shot/mode 等 handlers，单独拆出便于维护。
 */

import { useCallback } from "react";
import { errorLogger } from "@/shared/error-logger";
import type {
  CharacterInPipeline,
  SceneInPipeline,
  ExtractedCharacter,
  ExtractedScene,
} from "../domain/types";
import { matchEntitiesTool } from "../tools";
import { NOVEL_TOOL_CTX } from "./pipeline-helpers";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UseNovelEntityHandlersOptions {
  state: UsePipelineStateResult["state"];
  setState: UsePipelineStateResult["setState"];
  setIsProcessing: UsePipelineStateResult["setIsProcessing"];
  isMountedRef: UsePipelineStateResult["isMountedRef"];
}

export interface UseNovelEntityHandlersResult {
  handleConfirmCharacter: (id: string) => void;
  handleConfirmScene: (id: string) => void;
  handleEditCharacter: (c: ExtractedCharacter) => void;
  handleEditScene: (s: ExtractedScene) => void;
  handleMatchCharacter: (id: string, existingId: string) => Promise<void>;
}

/**
 * 角色/场景实体管理 Handlers Hook。
 */
export function useNovelEntityHandlers({
  state,
  setState,
  setIsProcessing,
  isMountedRef,
}: UseNovelEntityHandlersOptions): UseNovelEntityHandlersResult {
  const handleConfirmCharacter = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.tempId === id ? { ...c, confirmed: true } : c,
      ),
    }));
  }, [setState]);

  const handleConfirmScene = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) =>
        s.tempId === id ? { ...s, confirmed: true } : s,
      ),
    }));
  }, [setState]);

  const handleEditCharacter = useCallback((c: ExtractedCharacter) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((ch) =>
        ch.tempId === c.tempId ? ({ ...ch, ...c } as CharacterInPipeline) : ch,
      ),
    }));
  }, [setState]);

  const handleEditScene = useCallback((s: ExtractedScene) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((sc) =>
        sc.tempId === s.tempId ? ({ ...sc, ...s } as SceneInPipeline) : sc,
      ),
    }));
  }, [setState]);

  const handleMatchCharacter = useCallback(async (id: string, existingId: string) => {
    const character = state.characters.find((c) => c.tempId === id);
    if (!character) return;

    setIsProcessing(true);
    try {
      let updatedCharacter: CharacterInPipeline = {
        ...character,
        matchedCharacterId: existingId,
        matchConfidence: 1.0,
        status: "matched",
      };

      try {
        const result = await matchEntitiesTool.execute(
          { charactersJson: JSON.stringify([character]) },
          NOVEL_TOOL_CTX,
        );
        if (!isMountedRef.current) return;
        if (result.success && result.data) {
          const data = result.data as { characters: ExtractedCharacter[] };
          const matchedChar = data.characters?.[0];
          if (matchedChar) {
            updatedCharacter = {
              ...character,
              ...matchedChar,
              status: matchedChar.status === "new" ? "matched" : matchedChar.status,
              matchedCharacterId: existingId,
              matchConfidence: matchedChar.matchConfidence ?? 1.0,
            };
          }
        }
      } catch (err) {
        errorLogger.warn(`[useNovelPipeline] 角色 ${id} 匹配工具调用失败，使用默认值 matched`, err);
      }

      setState((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.tempId === id
            ? {
                ...updatedCharacter,
                confirmed: c.confirmed,
                variants: c.variants,
              }
            : c,
        ),
      }));
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [state.characters, setState, setIsProcessing, isMountedRef]);

  return {
    handleConfirmCharacter,
    handleConfirmScene,
    handleEditCharacter,
    handleEditScene,
    handleMatchCharacter,
  };
}
