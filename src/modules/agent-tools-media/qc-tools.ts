/**
 * 一致性 QC 工具（Consistency QC Tools）
 *
 * Task 2A.23 Agent 工具集成：把 consistency-qc 模块接入 AI Agent 工具集。
 *
 * 包含工具：
 * - check_video_consistency：对已完成视频任务执行一致性 QC，生成 QCReport 写回 StoryBeat
 * - dispatch_video_fallback：根据 QCReport 主动触发 fallback（regenerate / face_swap / manual_review）
 *
 * 设计要点：
 * - 通过 DI container 访问 videoTaskStorage / storyStorage（非 React hook）
 * - 复用 consistency-qc 模块的 runQualityCheck / dispatchFallback 服务
 * - QC 结果通过 storyStorage.updateStory 持久化到 StoryBeat.qcReport（与 useQCTrigger 一致）
 * - videoTaskStore 适配器：将 IVideoTaskStorage.createVideoTask 包装为 addTask 接口
 *   （fallback-dispatcher 期望 addTask 返回 VideoTask，而 storage 返回 void）
 * - 返回精简字段（不返回完整 frameScores，避免 token 浪费）
 *
 * 特权访问声明：本文件通过 DI container 直接访问 videoTaskStorage / storyStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import type { VideoTask, StoryBeat, Story } from "@/domain/schemas";
import {
  runQualityCheck,
  dispatchFallback,
  buildQCInput,
  isFallbackTerminal,
  predictNextAction,
  type FallbackInput,
} from "@/modules/video/consistency-qc";
import { resolvePolicy, DEFAULT_DRIFT_POLICY } from "@/modules/video/consistency-qc";
import type { QCReport } from "@/modules/video/consistency-qc";

// ============= 辅助函数 =============

/**
 * 将 QCReport 截断为 LLM 友好的摘要（避免完整 frameScores 占用 token）。
 *
 * 保留关键字段：verdict / actionTaken / averageScore / minScore / retryCount / sampledFrames。
 * frameScores 仅返回前 3 个最差帧（用于 AI 理解漂移位置）。
 */
function summarizeQCReport(report: QCReport): Record<string, unknown> {
  // 取最差的 3 帧（cosineSimilarity 最低）
  const worstFrames = [...report.frameScores]
    .sort((a, b) => a.cosineSimilarity - b.cosineSimilarity)
    .slice(0, 3)
    .map((f) => ({
      frameIndex: f.frameIndex,
      timestamp: Number(f.timestamp.toFixed(2)),
      cosineSimilarity: Number(f.cosineSimilarity.toFixed(3)),
      faceDetected: f.faceDetected,
    }));

  return {
    videoTaskId: report.videoTaskId,
    characterId: report.characterId,
    verdict: report.verdict,
    actionTaken: report.actionTaken,
    averageScore: Number(report.averageScore.toFixed(3)),
    minScore: Number(report.minScore.toFixed(3)),
    totalFrames: report.totalFrames,
    sampledFrames: report.sampledFrames,
    retryCount: report.retryCount ?? 0,
    strategy: report.strategy,
    error: report.error,
    worstFrames,
    createdAt: report.createdAt,
  };
}

/**
 * 通过 storyStorage 持久化 qcReport 到 StoryBeat。
 *
 * 模式：读取现有 story → 更新目标 beat.qcReport → updateStory(id, {beats}, version)。
 * 与 useQCTrigger 的 onReportReady 行为一致。
 *
 * 返回更新后的 StoryBeat（若找不到 beat 返回 null）。
 */
async function persistQCReportToBeat(
  beatId: string,
  report: QCReport,
): Promise<{ story: Story; beat: StoryBeat } | null> {
  const story = await container.storyStorage.getStoryByBeatId(beatId);
  if (!story) {
    errorLogger.warn(`[qc-tools] beatId=${beatId} 未找到关联 Story，无法持久化 QCReport`);
    return null;
  }

  const beatIndex = story.beats?.findIndex((b) => b.id === beatId) ?? -1;
  if (!story.beats || beatIndex === -1) {
    errorLogger.warn(`[qc-tools] beatId=${beatId} 在 Story ${story.id} 中未找到`);
    return null;
  }

  const updatedBeats = [...story.beats];
  const updatedBeat: StoryBeat = {
    ...updatedBeats[beatIndex]!,
    qcReport: report,
  };
  updatedBeats[beatIndex] = updatedBeat;

  const version = await container.storyStorage.getStoryVersion(story.id);
  await container.storyStorage.updateStory(story.id, { beats: updatedBeats }, version ?? undefined);

  return { story, beat: updatedBeat };
}

/**
 * 通过 taskId 查找 VideoTask + 关联的 StoryBeat + Story。
 *
 * 若 task.beatId 缺失或 Story 不存在，beat / story 返回 undefined。
 */
async function findTaskAndBeat(
  taskId: string,
): Promise<
  { task: VideoTask; beat?: StoryBeat; story?: Story } | { task: null; beat?: undefined; story?: undefined }
> {
  const task = await container.videoTaskStorage.getVideoTaskById(taskId);
  if (!task) {
    return { task: null };
  }

  if (!task.beatId) {
    return { task };
  }

  const story = await container.storyStorage.getStoryByBeatId(task.beatId);
  if (!story) {
    return { task };
  }

  const beat = story.beats?.find((b) => b.id === task.beatId);
  if (!beat) {
    return { task, story };
  }

  return { task, beat, story };
}

/**
 * 构造 videoTaskStore 适配器：将 IVideoTaskStorage.createVideoTask 包装为
 * fallback-dispatcher 期望的 addTask 接口。
 *
 * createVideoTask 返回 void，但 addTask 期望返回 VideoTask。
 * 适配器在 createVideoTask 成功后构造 VideoTask 返回（用传入的字段 + progress/createdAt）。
 */
function createVideoTaskStoreAdapter() {
  return {
    addTask: async (newTask: Omit<VideoTask, "progress" | "createdAt">): Promise<VideoTask> => {
      await container.videoTaskStorage.createVideoTask(newTask);
      return {
        ...newTask,
        progress: 0,
        createdAt: new Date().toISOString(),
      } as VideoTask;
    },
  };
}

// ============= 工具实现 =============

/**
 * 检查视频一致性 QC（check_video_consistency）
 *
 * 对已完成视频任务执行一致性 QC：
 *   1. 通过 taskId 获取 VideoTask
 *   2. 通过 task.beatId 定位 StoryBeat（用于读取参考图 / 持久化 QCReport）
 *   3. 调用 runQualityCheck 抽帧 → embedding → 比对 → 生成 QCReport
 *   4. 持久化 QCReport 到 StoryBeat.qcReport（通过 storyStorage.updateStory）
 *   5. 返回 QCReport 摘要 + needsFallback 标记
 *
 * forceRecheck=true 时强制重新执行 QC（即使 beat.qcReport 已存在）。
 * forceRecheck=false 时若 beat.qcReport 已存在则直接返回（避免重复抽帧）。
 *
 * 注意：QC 涉及视频抽帧和（可选）embedding 计算，可能耗时数秒到数十秒。
 */
export const checkVideoConsistencyTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "check_video_consistency",
      description:
        "对已完成的视频任务执行一致性 QC（quality check）。" +
        "通过抽帧、face/visual embedding、与角色参考图比对，生成 QCReport 并持久化到 StoryBeat.qcReport。" +
        "判定结果（verdict）有三种：pass（通过）/ drift_warning（漂移警告，不触发动作）/ drift_critical（严重漂移，需要触发 fallback）。" +
        "若 QCReport 已存在且 forceRecheck=false，直接返回现有报告（避免重复抽帧）。" +
        "适用于：用户要求「检查这个视频的角色一致性」、「视频 QC 结果如何」、「是否需要重新生成」等场景。",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            maxLength: 100,
            description: "视频任务 ID（必填）。任务应为 completed 状态且有 videoUrl。",
          },
          forceRecheck: {
            type: "boolean",
            description: "是否强制重新执行 QC（默认 false）。若 beat.qcReport 已存在则直接返回。",
            default: false,
          },
        },
        required: ["taskId"],
      },
    },
  },
  domain: "video",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args) {
    const taskId = String(args.taskId);
    const forceRecheck = args.forceRecheck === true;

    // 1. 查找 task + beat
    const found = await findTaskAndBeat(taskId);
    if (!found.task) {
      return { success: false, error: `视频任务不存在：${taskId}` };
    }
    const { task, beat } = found;

    // 2. 检查 task 状态（必须 completed 且有 videoUrl）
    if (task.status !== "completed") {
      return {
        success: false,
        error: `任务状态为 ${task.status}，必须为 completed 才能执行 QC`,
      };
    }
    if (!task.videoUrl) {
      return { success: false, error: `任务无 videoUrl，无法抽帧执行 QC` };
    }

    // 3. 若不强制重检查且 beat.qcReport 已存在 → 直接返回
    if (!forceRecheck && beat?.qcReport) {
      return {
        success: true,
        data: {
          taskId,
          cached: true,
          needsFallback: beat.qcReport.verdict === "drift_critical",
          report: summarizeQCReport(beat.qcReport),
        },
      };
    }

    // 4. 构造 QCInput
    const qcInput = buildQCInput(task, beat);

    if (!qcInput.videoUrl) {
      return { success: false, error: "无法构造 QC 输入：videoUrl 缺失" };
    }

    // 5. 执行 QC
    let output;
    try {
      output = await runQualityCheck(qcInput);
    } catch (e) {
      errorLogger.warn(`[qc-tools] runQualityCheck 异常 taskId=${taskId}`, e);
      return {
        success: false,
        error: `QC 执行失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // 6. 持久化 QCReport 到 StoryBeat
    let persisted = false;
    if (task.beatId) {
      try {
        const result = await persistQCReportToBeat(task.beatId, output.report);
        persisted = result !== null;
      } catch (e) {
        errorLogger.warn(`[qc-tools] 持久化 QCReport 失败 taskId=${taskId}`, e);
      }
    }

    // 7. 返回摘要
    return {
      success: true,
      data: {
        taskId,
        cached: false,
        needsFallback: output.needsFallback,
        providerType: output.providerType,
        sampledFrameCount: output.sampledFrameUrls.length,
        persisted,
        report: summarizeQCReport(output.report),
      },
    };
  },
};

/**
 * 触发视频 fallback 调度（dispatch_video_fallback）
 *
 * 根据 VideoTask 关联的 QCReport 决策并执行 fallback 动作：
 *   - regenerate：创建新 VideoTask 复用原参数（retryCount < max）
 *   - face_swap：调用 partial-edit-service.startFaceSwapTask（retryCount 达上限）
 *   - manual_review：标记人工审核（fallback 链终点）
 *
 * 决策规则（由 fallback-dispatcher 内部 decideAction 实现）：
 *   1. verdict != "drift_critical" → action="none"
 *   2. retryCount < maxRegenerateAttempts → action="regenerate"
 *   3. retryCount >= maxRegenerateAttempts 且 policy.fallbackToFaceSwap → action="face_swap"
 *   4. retryCount > maxRegenerateAttempts 或 face-swap 失败 → action="manual_review"
 *
 * forceAction 可选：手动指定动作（"regenerate" / "face_swap" / "manual_review"），
 * 跳过自动决策。用于用户/AI 明确要求执行特定 fallback 时。
 *
 * 注意：regenerate / face_swap 会创建新 VideoTask，但不修改原视频（INV-6）。
 */
export const dispatchVideoFallbackTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "dispatch_video_fallback",
      description:
        "根据视频任务的 QCReport 主动触发 fallback 动作（regenerate / face_swap / manual_review）。" +
        "决策规则：retryCount < maxRegenerateAttempts 时 regenerate；达到上限后 face_swap；face-swap 失败或重试超限后 manual_review。" +
        "forceAction 参数可手动指定动作跳过自动决策。" +
        "regenerate 创建新 VideoTask 复用原参数；face_swap 调用 partial-edit 服务用角色参考图替换面部；manual_review 仅标记人工审核。" +
        "适用于：用户要求「重新生成这个视频」、「尝试 face-swap 修复」、「这个视频交给人工处理」等场景。",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            maxLength: 100,
            description: "视频任务 ID（必填）。任务必须已执行过 QC（即 StoryBeat.qcReport 已存在）。",
          },
          forceAction: {
            type: "string",
            enum: ["regenerate", "face_swap", "manual_review"],
            description:
              "手动指定 fallback 动作（可选，默认 undefined 即自动决策）。" +
              "用于 AI 明确要求执行特定动作时。",
          },
        },
        required: ["taskId"],
      },
    },
  },
  domain: "video",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const taskId = String(args.taskId);
    const forceAction = args.forceAction
      ? (String(args.forceAction) as "regenerate" | "face_swap" | "manual_review")
      : undefined;

    // 1. 查找 task + beat
    const found = await findTaskAndBeat(taskId);
    if (!found.task) {
      return { success: false, error: `视频任务不存在：${taskId}` };
    }
    const { task, beat } = found;

    // 2. 检查 QCReport 是否存在
    if (!beat?.qcReport) {
      return {
        success: false,
        error: `任务 ${taskId} 未执行过 QC，无法触发 fallback。请先调用 check_video_consistency。`,
      };
    }
    const baseReport = beat.qcReport;

    // 3. 若 forceAction 指定 manual_review，直接走 manual_review 路径
    //    （无需调用 dispatchFallback，避免依赖 characterRefImageUrl 等 face-swap 输入）
    if (forceAction === "manual_review") {
      const updatedReport: QCReport = {
        ...baseReport,
        retryCount: (baseReport.retryCount ?? 0) + 1,
        actionTaken: "manual_review",
      };

      // 持久化 updatedReport
      let persisted = false;
      if (task.beatId) {
        try {
          const result = await persistQCReportToBeat(task.beatId, updatedReport);
          persisted = result !== null;
        } catch (e) {
          errorLogger.warn(`[qc-tools] 持久化 manual_review QCReport 失败 taskId=${taskId}`, e);
        }
      }

      return {
        success: true,
        data: {
          taskId,
          action: "manual_review",
          ok: true,
          retryCount: updatedReport.retryCount,
          isTerminal: true,
          persisted,
        },
      };
    }

    // 4. 构造 FallbackInput
    //    characterRefImageUrl 从 QCInput 角度推断：优先 task.fixedImageUrl，其次 beat.fixedImage.imageUrl
    let characterRefImageUrl: string | undefined;
    if (task.fixedImageLockType === "character" && task.fixedImageUrl) {
      characterRefImageUrl = task.fixedImageUrl;
    } else if (beat?.fixedImage?.imageUrl) {
      characterRefImageUrl = beat.fixedImage.imageUrl;
    }
    const characterId = beat?.characterIds?.[0];

    const fallbackInput: FallbackInput = {
      report: baseReport,
      originalTask: task,
      policy: DEFAULT_DRIFT_POLICY,
      currentRetryCount: baseReport.retryCount ?? 0,
      characterRefImageUrl,
      characterId,
      videoTaskStore: createVideoTaskStoreAdapter(),
    };

    // 5. 若 forceAction 指定 regenerate / face_swap，但 dispatchFallback 仍按 retryCount 决策
    //    这里不直接绕过决策逻辑（避免破坏 INV-7: fallback 链式降级）。
    //    若 AI 明确要求 regenerate 但 retryCount 已达上限，dispatchFallback 会自动走 face-swap 或 manual_review。
    //    若 AI 明确要求 face_swap 但 retryCount < max，dispatchFallback 会先走 regenerate。
    //    这是设计决策：保持 fallback 链完整性优先于 forceAction（除非是 manual_review 终态）。
    //    forceAction 的主要用途是 manual_review 提前终止。
    //    注：步骤 3 已处理 manual_review，此处 forceAction 类型已收窄为 regenerate | face_swap。
    if (forceAction === "regenerate" || forceAction === "face_swap") {
      const predictedAction = predictNextAction(baseReport, DEFAULT_DRIFT_POLICY);
      if (predictedAction !== forceAction) {
        return {
          success: false,
          error:
            `forceAction="${forceAction}" 与当前 fallback 链不匹配。` +
            `根据 retryCount=${baseReport.retryCount ?? 0}，自动决策应为 "${predictedAction}"。` +
            `若要跳过中间步骤，请使用 forceAction="manual_review" 终止 fallback。`,
        };
      }
    }

    // 6. 调用 dispatchFallback
    let fallbackResult;
    try {
      fallbackResult = await dispatchFallback(fallbackInput);
    } catch (e) {
      errorLogger.warn(`[qc-tools] dispatchFallback 异常 taskId=${taskId}`, e);
      return {
        success: false,
        error: `fallback 执行异常：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // 7. 持久化 updatedReport 到 StoryBeat
    let persisted = false;
    if (task.beatId) {
      try {
        const result = await persistQCReportToBeat(task.beatId, fallbackResult.updatedReport);
        persisted = result !== null;
      } catch (e) {
        errorLogger.warn(`[qc-tools] 持久化 updatedReport 失败 taskId=${taskId}`, e);
      }
    }

    // 8. 计算是否为终态
    const policy = resolvePolicy(DEFAULT_DRIFT_POLICY);
    const isTerminal = isFallbackTerminal(fallbackResult.updatedReport, policy);

    // 9. 返回结果
    return {
      success: fallbackResult.ok,
      data: {
        taskId,
        action: fallbackResult.action,
        ok: fallbackResult.ok,
        newTaskId: fallbackResult.newTaskId,
        retryCount: fallbackResult.updatedReport.retryCount,
        isTerminal,
        persisted,
        error: fallbackResult.error,
      },
      error: fallbackResult.error,
    };
  },
};

/** 导出所有 QC 工具 */
export const qcTools: ToolImpl[] = [checkVideoConsistencyTool, dispatchVideoFallbackTool];
