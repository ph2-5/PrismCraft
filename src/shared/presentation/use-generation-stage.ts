import { useEffect, useState } from "react";
import { t } from "@/shared/constants/messages";

export type GenerationStage = "initial" | "inProgress" | "almostDone";

export interface UseGenerationStageOptions {
  /**
   * 阶段 1（0-10 秒）展示的 i18n key。
   * 默认 "generate.stage.imageInitial"（图片生成场景）。
   * 视频生成场景传入 "generate.stage.videoInitial"。
   */
  initialKey?: string;
  /** 进入 inProgress 阶段的延迟（毫秒），默认 10_000 */
  inProgressDelayMs?: number;
  /** 进入 almostDone 阶段的延迟（毫秒），默认 30_000 */
  almostDoneDelayMs?: number;
}

/**
 * 根据 isGenerating 状态用 setTimeout 切换阶段文字。
 *
 * 阶段：
 *   - initial（0 - 10s）：初始提示，如"正在生成图片..."
 *   - inProgress（10 - 30s）：进行中提示，"AI 正在创作中，请稍候..."
 *   - almostDone（30s+）：即将完成提示，"即将完成..."
 *
 * 用于 AI 图片/视频生成长时间操作的进度反馈，API 不返回真实进度百分比，
 * 故采用时间-based 阶段提示。
 */
export function useGenerationStage(
  isGenerating: boolean,
  options: UseGenerationStageOptions = {},
): { stage: GenerationStage; stageLabel: string } {
  const {
    initialKey = "generate.stage.imageInitial",
    inProgressDelayMs = 10_000,
    almostDoneDelayMs = 30_000,
  } = options;

  const [stage, setStage] = useState<GenerationStage>("initial");

  useEffect(() => {
    if (!isGenerating) {
      setStage("initial");
      return;
    }

    setStage("initial");
    const t1 = setTimeout(() => setStage("inProgress"), inProgressDelayMs);
    const t2 = setTimeout(() => setStage("almostDone"), almostDoneDelayMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isGenerating, inProgressDelayMs, almostDoneDelayMs]);

  const stageLabel =
    stage === "initial"
      ? t(initialKey)
      : stage === "inProgress"
        ? t("generate.stage.inProgress")
        : t("generate.stage.almostDone");

  return { stage, stageLabel };
}
