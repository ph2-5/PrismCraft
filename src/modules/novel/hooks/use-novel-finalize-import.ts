/**
 * P1.5 细化拆分：导入完成 Handler Hook。
 *
 * 从 usePipelinePersistence 进一步拆出 handleFinalizeImport，集中管理
 * "完成导入"业务逻辑（创建 Story + 清理 DB 项目记录）：
 *
 * 1. 动态 import storyService（避免在 novel 模块顶层依赖 storyboard 模块）
 * 2. 构建 characterIds / sceneIds（仅匹配到现有 DB 实体的）
 * 3. 构建 StoryBeat[]（每个 shot 对应一个 beat）
 * 4. 调用 storyService.create 创建 Story
 * 5. 转换 pipeline stage 到 done
 * 6. 清理 DB 项目记录（物理删除，因为已转换为正式 Story）
 *
 * 这部分逻辑独立于自动保存 / recoverProject / dismissRecovery 等持久化操作。
 */

import { useCallback } from "react";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import type { StoryBeat } from "@/domain/schemas";
import { canTransition, transition } from "../import/services/pipeline-machine";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UseNovelFinalizeImportOptions {
  state: UsePipelineStateResult["state"];
  setState: UsePipelineStateResult["setState"];
  setIsImporting: UsePipelineStateResult["setIsImporting"];
  shots: UsePipelineStateResult["shots"];
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  isMountedRef: UsePipelineStateResult["isMountedRef"];
}

export interface UseNovelFinalizeImportResult {
  handleFinalizeImport: () => Promise<void>;
}

/**
 * 导入完成 Handler Hook。
 */
export function useNovelFinalizeImport({
  state,
  setState,
  setIsImporting,
  shots,
  currentProjectId,
  setCurrentProjectId,
  isMountedRef,
}: UseNovelFinalizeImportOptions): UseNovelFinalizeImportResult {
  const handleFinalizeImport = useCallback(async () => {
    setIsImporting(true);
    try {
      // 动态导入 storyService（避免在 novel 模块顶层依赖 storyboard 模块）
      const { storyService } = await import("@/modules/storyboard");

      // P1-7 修复：组件卸载后不再继续处理
      if (!isMountedRef.current) return;

      // 构建角色 ID 数组：仅匹配到现有 DB 角色的（新角色不会自动创建）
      const characterIds = state.characters
        .map((c) => c.matchedCharacterId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      // 构建场景 ID 数组：仅匹配到现有 DB 场景的
      const sceneIds = state.scenes
        .map((s) => s.matchedSceneId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      // 构建 StoryBeat[]：每个 shot 对应一个 beat
      const beats: StoryBeat[] = shots.map((shot, index) => {
        const beatCharacterIds = shot.characters
          .map((name) => state.characters.find((c) => c.name === name)?.matchedCharacterId)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        return {
          id: `beat_${crypto.randomUUID()}`,
          sequence: index + 1,
          description: shot.description,
          duration: shot.estimatedDuration,
          characterIds: beatCharacterIds,
          sceneId: shot.sceneId,
          elementIds: [],
        } as StoryBeat;
      });

      const title = state.config.projectName || state.rawText.slice(0, 40) || "未命名项目";
      const description = state.rawText.slice(0, 500);

      const result = await storyService.create({
        title,
        description,
        characters: characterIds,
        scenes: sceneIds,
        beats,
        elementIds: [],
      });

      if (!isMountedRef.current) return;

      if (!result.ok) {
        // 创建失败：记录错误，保留当前状态允许用户重试
        errorLogger.error(
          {
            code: "NovelPipelineFinalizeFailed",
            message: result.error.message,
          },
          "useNovelPipeline",
        );
        return;
      }

      // 转换到 done 阶段
      setState((prev) =>
        canTransition(prev.stage, "done") ? transition(prev, "done") : prev,
      );

      // Task 2A.7: 导入完成后清理 DB 项目记录（物理删除，因为已转换为正式 Story）
      if (currentProjectId !== null) {
        container.novelProjectStorage
          .hardDeleteProject(currentProjectId)
          .catch((err) => {
            // P1-3: 清理失败不阻塞 UI，后续 cleanExpiredProjects 会兜底
            errorLogger.warn(`[useNovelPipeline] 清理已完成项目 ${currentProjectId} 失败，后续 cleanExpiredProjects 会兜底`, err);
          });
        setCurrentProjectId(null);
      }
    } catch (err) {
      // 异常路径：记录错误，不阻塞 UI（允许用户重试）
      errorLogger.error(
        {
          code: "NovelPipelineFinalizeError",
          message: err instanceof Error ? err.message : String(err),
          cause: err,
        },
        "useNovelPipeline",
      );
    } finally {
      if (isMountedRef.current) setIsImporting(false);
    }
  }, [
    state.config.projectName,
    state.rawText,
    state.characters,
    state.scenes,
    shots,
    currentProjectId,
    setState,
    setIsImporting,
    isMountedRef,
  ]);

  return { handleFinalizeImport };
}
