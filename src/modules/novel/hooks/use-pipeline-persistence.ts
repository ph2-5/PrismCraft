/**
 * P1.5 拆分：DB 持久化与恢复 Hook。
 *
 * 集中管理 useNovelPipeline 中所有与 NovelProjectStorage 相关的逻辑：
 * - 挂载时加载未完成项目列表（pendingRecoveryProjects）
 * - state 变化时 2 秒防抖自动保存到 DB
 * - recoverProject / dismissRecovery / deletePendingProject
 * - handleFinalizeImport：创建 Story + 完成后清理 DB 项目记录
 *
 * 依赖方向：仅依赖 @/infrastructure/di（访问 novelProjectStorage token）+
 * @/modules/storyboard（动态 import 创建 Story）+ 同模块内文件。
 */

import { useState, useCallback, useEffect } from "react";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";
import type { NovelProject } from "../domain/types";
import type { StoryBeat } from "@/domain/schemas";
import { canTransition, transition } from "../import/services/pipeline-machine";
import { DEFAULT_PACING_CONFIG } from "../pacing";
import { recordToProject } from "./pipeline-helpers";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UsePipelinePersistenceOptions {
  state: UsePipelineStateResult["state"];
  setState: UsePipelineStateResult["setState"];
  selectedSegmentIds: string[];
  setSelectedSegmentIds: UsePipelineStateResult["setSelectedSegmentIds"];
  isImporting: boolean;
  setIsImporting: UsePipelineStateResult["setIsImporting"];
  shots: UsePipelineStateResult["shots"];
  setStoryStructure: UsePipelineStateResult["setStoryStructure"];
  setTreatment: UsePipelineStateResult["setTreatment"];
  setShotContracts: UsePipelineStateResult["setShotContracts"];
  setPacingConfig: UsePipelineStateResult["setPacingConfig"];
  debounceRef: UsePipelineStateResult["debounceRef"];
  hasRecoveredRef: UsePipelineStateResult["hasRecoveredRef"];
  isMountedRef: UsePipelineStateResult["isMountedRef"];
}

export interface UsePipelinePersistenceResult {
  pendingRecoveryProjects: NovelProject[];
  isLoadingRecovery: boolean;
  currentProjectId: string | null;
  lastSavedAt: number | null;
  recoverProject: (id: string) => Promise<void>;
  dismissRecovery: () => void;
  deletePendingProject: (id: string) => Promise<void>;
  handleFinalizeImport: () => Promise<void>;
}

/**
 * DB 持久化与恢复 Hook。
 *
 * 接收 state + setter + refs，返回持久化相关的 state 和 handlers。
 */
export function usePipelinePersistence({
  state,
  setState,
  setSelectedSegmentIds,
  setIsImporting,
  shots,
  setStoryStructure,
  setTreatment,
  setShotContracts,
  setPacingConfig,
  debounceRef,
  hasRecoveredRef,
  isMountedRef,
}: UsePipelinePersistenceOptions): UsePipelinePersistenceResult {
  const [pendingRecoveryProjects, setPendingRecoveryProjects] = useState<NovelProject[]>([]);
  const [isLoadingRecovery, setIsLoadingRecovery] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // ============================================================
  // 挂载时加载未完成项目列表（仅一次），用于 UI 显示恢复对话框
  // ============================================================

  useEffect(() => {
    let cancelled = false;
    const storage = container.novelProjectStorage;
    storage
      .getAllProjects()
      .then((records) => {
        if (cancelled) return;
        const projects = records.map(recordToProject);
        setPendingRecoveryProjects(projects);
        setIsLoadingRecovery(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // P1-3: 加载未完成项目失败时记录日志，仅标记加载完成
        errorLogger.warn("[useNovelPipeline] 挂载时加载未完成项目列表失败", err);
        setIsLoadingRecovery(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ============================================================
  // 自动保存：state 变化时 2 秒防抖保存到 DB
  // ============================================================

  useEffect(() => {
    // 跳过：项目刚恢复（避免立刻覆盖）、用户未输入任何内容、正在加载恢复列表
    if (hasRecoveredRef.current) {
      hasRecoveredRef.current = false;
      return;
    }
    // 只在有 rawText 或已有 currentProjectId 时才自动保存（避免空项目污染 DB）
    const hasContent = state.rawText.trim().length > 0 || currentProjectId !== null;
    if (!hasContent || isLoadingRecovery) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(async () => {
      // L-1 修复：组件卸载后不再 setState
      if (!isMountedRef.current) return;
      try {
        const storage = container.novelProjectStorage;
        const title =
          state.config.projectName ||
          (state.rawText ? state.rawText.slice(0, 40) : "未命名项目");
        if (currentProjectId === null) {
          // 新项目：创建记录
          const id = `np-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await storage.createProject({
            id,
            title,
            rawText: state.rawText,
            state,
          });
          if (!isMountedRef.current) return;
          setCurrentProjectId(id);
        } else {
          // 已有项目：更新
          await storage.updateProject(currentProjectId, {
            title,
            rawText: state.rawText,
            state,
          });
        }
        if (!isMountedRef.current) return;
        setLastSavedAt(Date.now());
      } catch (err) {
        // P1-3: 自动保存失败不阻塞 UI，下次 state 变化时会重试
        if (isMountedRef.current) {
          errorLogger.warn("[useNovelPipeline] 自动保存失败，下次 state 变化时会重试", err);
        }
      }
    }, 2000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [state, currentProjectId, isLoadingRecovery, hasRecoveredRef, debounceRef, isMountedRef]);

  // ============================================================
  // recoverProject：从 DB 加载 pipeline_state_json 恢复状态
  // ============================================================

  const recoverProject = useCallback(async (id: string) => {
    try {
      const storage = container.novelProjectStorage;
      const record = await storage.getProjectById(id);
      if (!record) return;
      const project = recordToProject(record);
      hasRecoveredRef.current = true;
      setState(project.state);
      setSelectedSegmentIds(project.state.segments.map((s) => s.id));
      setCurrentProjectId(project.id);
      setPendingRecoveryProjects([]);
      setLastSavedAt(project.updatedAt);
      // H-1 修复：恢复项目时清空 structure 子域 state（当前不在 PipelineState 中持久化）
      setStoryStructure(null);
      setTreatment(null);
      setShotContracts([]);
      setPacingConfig(DEFAULT_PACING_CONFIG);
    } catch (err) {
      // P1-3: 恢复失败：保留当前状态，不阻塞 UI
      errorLogger.warn(`[useNovelPipeline] 恢复项目 ${id} 失败，保留当前状态`, err);
    }
  }, [
    setState,
    setSelectedSegmentIds,
    setStoryStructure,
    setTreatment,
    setShotContracts,
    setPacingConfig,
    hasRecoveredRef,
  ]);

  // ============================================================
  // dismissRecovery：忽略恢复提示，开始新项目
  // ============================================================

  const dismissRecovery = useCallback(() => {
    setPendingRecoveryProjects([]);
    // H-1 修复：忽略恢复提示意味着用户要开始新项目，清空 structure 子域 state
    setStoryStructure(null);
    setTreatment(null);
    setShotContracts([]);
    setPacingConfig(DEFAULT_PACING_CONFIG);
  }, [setStoryStructure, setTreatment, setShotContracts, setPacingConfig]);

  // ============================================================
  // deletePendingProject：从 DB 物理删除指定未完成项目
  // ============================================================

  const deletePendingProject = useCallback(async (id: string) => {
    // P1-6: 不可逆操作二次确认（项目数据将永久丢失）
    const ok = await confirm({
      title: t("novel.project.deleteConfirmTitle"),
      description: t("novel.project.deleteConfirmDesc"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      const storage = container.novelProjectStorage;
      await storage.hardDeleteProject(id);
      setPendingRecoveryProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      // P1-3: 删除失败：UI 列表保持不变
      errorLogger.warn(`[useNovelPipeline] 删除未完成项目 ${id} 失败，UI 列表保持不变`, err);
    }
  }, []);

  // ============================================================
  // handleFinalizeImport：创建 Story + 清理 DB 项目记录
  // ============================================================

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

  return {
    pendingRecoveryProjects,
    isLoadingRecovery,
    currentProjectId,
    lastSavedAt,
    recoverProject,
    dismissRecovery,
    deletePendingProject,
    handleFinalizeImport,
  };
}
