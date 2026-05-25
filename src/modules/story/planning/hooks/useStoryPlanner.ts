"use client";

import { useState, useCallback } from "react";
import type { Story, StoryBeat, Character, Scene } from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { generateStoryPlanWithValidation, formatValidationResult } from "@/modules/shot/shot-generation";
import { getErrorMessage } from "@/shared/error-handler";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";

interface UseStoryPlannerProps {
  currentStory: Story;
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  generationEnhanced: boolean;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

export function useStoryPlanner(props: UseStoryPlannerProps) {
  const {
    currentStory,
    beatsRef,
    charactersRef,
    scenesRef,
    setBeats,
    generationEnhanced,
    success,
    showError,
  } = props;

  const [isPlanningStory, setIsPlanningStory] = useState(false);

  const planStoryWithAI = useCallback(async () => {
    if (!currentStory.title && !currentStory.description) {
      showError("需要分镜信息", "请至少填写项目标题或简介");
      return;
    }
    try {
      const config = await container.loadConfig();
      const hasTextApi = config?.providers?.some((p) =>
        p.models?.some((m) => m.capabilities?.includes("text")),
      );
      if (!hasTextApi) {
        showError("无法AI规划", "请先在设置中配置文本生成API");
        return;
      }
    } catch (e) {
      errorLogger.warn(
        "[StoryPlanner] 检查文本API配置失败",
        e instanceof Error ? e.message : e,
      );
    }
    if (beatsRef.current.length > 0) {
      const confirmed = await confirm(
        `当前已有 ${beatsRef.current.length} 个镜头，AI 规划将会覆盖所有现有镜头。确定要继续吗？`,
        "AI 规划确认",
      );
      if (!confirmed) return;
    }
    setIsPlanningStory(true);
    try {
      const elements = await container.elementStorage.getAllElements();

      const result = await generateStoryPlanWithValidation(
        currentStory,
        charactersRef.current,
        scenesRef.current,
        elements,
        {
          maxRetries: generationEnhanced ? 3 : 1,
          autoFix: generationEnhanced,
          fewShotCount: generationEnhanced ? 3 : 1,
          strictMode: false,
          showFixDetails: generationEnhanced,
          enhancedGeneration: generationEnhanced,
          onProgress: (progress) => {
            if (
              progress.stage === "post_validating" &&
              progress.autoFixedCount &&
              progress.autoFixedCount > 0
            ) {
              errorLogger.info(`[Pipeline] 自动修复 ${progress.autoFixedCount} 处`);
            }
          },
        },
        generationEnhanced,
      );

      if (result.beats.length > 0) {
        setBeats(() => result.beats);

        const fixMsg =
          result.autoFixedCount > 0 && generationEnhanced
            ? `，自动修复 ${result.autoFixedCount} 处参数问题`
            : "";
        const retryMsg =
          result.retryCount > 0 ? `（重试 ${result.retryCount} 次后成功）` : "";
        const detailMsg =
          generationEnhanced && result.fixDetails.length > 0
            ? `\n修复详情：${result.fixDetails.slice(0, 3).join("；")}${result.fixDetails.length > 3 ? "等" : ""}`
            : "";

        success(
          "AI规划成功",
          `已为您规划了 ${result.beats.length} 个镜头${fixMsg}${retryMsg}${detailMsg}`,
        );

        if (result.validationResults.some((r) => r.warnings.length > 0)) {
          errorLogger.info(
            "[Pipeline] 校验警告",
            result.validationResults
              .filter((r) => r.warnings.length > 0)
              .map((r) => formatValidationResult(r))
              .join("\n"),
          );
        }
      } else {
        showError("AI规划失败", "未能生成有效的分镜数据，请重试");
      }
    } catch (err) {
      showError("AI规划失败", getErrorMessage(err));
    } finally {
      setIsPlanningStory(false);
    }
  }, [
    currentStory,
    beatsRef,
    charactersRef,
    scenesRef,
    setBeats,
    generationEnhanced,
    success,
    showError,
  ]);

  return { planStoryWithAI, isPlanningStory };
}
