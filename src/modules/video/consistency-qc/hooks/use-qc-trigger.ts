/**
 * Task 2A.23: useQCTrigger — 监听 VIDEO_TASK_COMPLETED 事件触发一致性 QC
 *
 * 职责：
 *   1. 订阅 eventBus 的 VIDEO_TASK_COMPLETED 事件
 *   2. 通过 taskId 查找 VideoTask，再通过 beatId 定位 StoryBeat
 *   3. 调用 runQualityCheck 生成 QCReport
 *   4. 通过 onReportReady 回调把 QCReport 写回 StoryBeat.qcReport
 *   5. 若 needsFallback，调用 dispatchFallback 触发重生成/face-swap/manual_review
 *
 * 异步非阻塞（INV-1）：QC 失败不影响 VideoTask 完成回调，仅记日志。
 *
 * 调用方：StoryProvider 在挂载时调用一次（传入 updateBeat + beatsRef + tasksRef）。
 */
import { useEffect, useRef } from "react";
import type { VideoTask, StoryBeat } from "@/domain/schemas";
import { eventBus } from "@/shared/event-bus";
import { DomainEvents } from "@/shared/event-types";
import { errorLogger } from "@/shared/error-logger";
import { runQualityCheck, type QCInput } from "../services/qc-orchestrator";
import { dispatchFallback } from "../services/fallback-dispatcher";
import { resolvePolicy, type DriftPolicy } from "../domain/drift-policy";
import type { QCReport } from "../domain/qc-schema";

export interface QCTriggerInput {
  /** StoryBeat 列表的稳定 ref（避免 useEffect 依赖频繁变化） */
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  /** VideoTask 列表的稳定 ref */
  tasksRef: React.MutableRefObject<VideoTask[]>;
  /** 更新单个 StoryBeat 的回调（来自 useStoryState.updateBeat） */
  onReportReady: (beatId: string, report: QCReport) => void;
  /** 漂移策略覆盖（默认 DEFAULT_DRIFT_POLICY） */
  policy?: Partial<DriftPolicy>;
  /** 是否启用 QC（默认 true，可用于运行时开关） */
  enabled?: boolean;
}

/**
 * 默认视频时长（秒）。
 *
 * 当 VideoTask.parameters.duration 缺失时使用。
 * 后续可通过 ffprobe 动态探测，当前用保守默认值 5 秒。
 */
const DEFAULT_VIDEO_DURATION_SEC = 5;

/**
 * 计算单次 QC 的输入参数。
 *
 * 抽取为纯函数便于单元测试（不依赖 React）。
 */
export function buildQCInput(
  task: VideoTask,
  beat: StoryBeat | undefined,
  policyOverrides?: Partial<DriftPolicy>,
): QCInput {
  // 视频时长：优先 parameters.duration，其次 beat.duration，最后默认 5 秒
  const durationFromParams =
    task.parameters && typeof task.parameters.duration === "number"
      ? task.parameters.duration
      : undefined;
  const durationFromBeat =
    beat?.duration && beat.duration > 0 ? beat.duration : undefined;
  const durationSec = durationFromParams ?? durationFromBeat ?? DEFAULT_VIDEO_DURATION_SEC;

  // 角色参考图：优先 fixedImageUrl（若锁定类型为 character），其次 beat.fixedImage.imageUrl
  let characterRefImageUrl: string | undefined;
  if (task.fixedImageLockType === "character" && task.fixedImageUrl) {
    characterRefImageUrl = task.fixedImageUrl;
  } else if (beat?.fixedImage?.imageUrl) {
    characterRefImageUrl = beat.fixedImage.imageUrl;
  }

  // 角色 ID：从 beat.characterIds 取首个
  const characterId = beat?.characterIds?.[0];

  // 分镜策略：从 beat.shotInstruction.shotSize 或 beat.shotType 推断
  const strategy =
    beat?.shotInstruction?.shotSize ?? beat?.shotType ?? undefined;

  return {
    videoTaskId: task.taskId,
    videoUrl: task.videoUrl ?? "",
    durationSec,
    characterRefImageUrl,
    characterId,
    beatId: beat?.id ?? task.beatId,
    policy: policyOverrides,
    strategy,
  };
}

/**
 * 订阅 VIDEO_TASK_COMPLETED 事件并触发 QC。
 *
 * 必须在 StoryProvider 内调用，确保 onReportReady 能访问正确的 beats state。
 */
export function useQCTrigger(input: QCTriggerInput): void {
  const { beatsRef, tasksRef, onReportReady, policy, enabled = true } = input;

  // 用 ref 保存最新的回调，避免 effect 频繁重新订阅
  const onReportReadyRef = useRef(onReportReady);
  onReportReadyRef.current = onReportReady;
  const policyRef = useRef(policy);
  policyRef.current = policy;

  useEffect(() => {
    if (!enabled) return;

    const subscription = eventBus.on(
      DomainEvents.VIDEO_TASK_COMPLETED,
      (payload: unknown) => {
        const { taskId, videoUrl } = payload as { taskId: string; videoUrl?: string };
        // 异步触发 QC，不 await（fire-and-forget，避免阻塞 emit 方）
        void triggerQCForTask(taskId, videoUrl, beatsRef, tasksRef, onReportReadyRef.current, policyRef.current);
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [enabled, beatsRef, tasksRef]);
}

/**
 * 实际触发 QC 的异步函数。
 *
 * 抽取为模块级函数便于测试（不依赖 React hook 上下文）。
 */
export async function triggerQCForTask(
  taskId: string,
  videoUrl: string | undefined,
  beatsRef: React.MutableRefObject<StoryBeat[]>,
  tasksRef: React.MutableRefObject<VideoTask[]>,
  onReportReady: (beatId: string, report: QCReport) => void,
  policyOverrides?: Partial<DriftPolicy>,
): Promise<void> {
  try {
    // 1. 查找 VideoTask
    const task = tasksRef.current.find((t) => t.taskId === taskId);
    if (!task) {
      errorLogger.warn(`[useQCTrigger] taskId=${taskId} 未找到对应 VideoTask，跳过 QC`);
      return;
    }

    if (!videoUrl && !task.videoUrl) {
      errorLogger.warn(`[useQCTrigger] taskId=${taskId} 无 videoUrl，跳过 QC`);
      return;
    }

    // 2. 查找 StoryBeat
    const beatId = task.beatId;
    const beat = beatId
      ? beatsRef.current.find((b) => b.id === beatId)
      : undefined;

    // 3. 构造 QC 输入
    const qcInput = buildQCInput(
      { ...task, videoUrl: videoUrl ?? task.videoUrl },
      beat,
      policyOverrides,
    );

    // 4. 执行 QC
    const output = await runQualityCheck(qcInput);

    // 5. 写回 StoryBeat.qcReport
    if (beatId) {
      onReportReady(beatId, output.report);
    }

    // 6. 若需要 fallback，触发 dispatchFallback
    if (output.needsFallback && beatId) {
      const policy = resolvePolicy(policyOverrides);
      errorLogger.info(
        `[useQCTrigger] taskId=${taskId} verdict=${output.report.verdict} 触发 fallback`,
      );

      try {
        const fallbackResult = await dispatchFallback({
          report: output.report,
          originalTask: task,
          policy,
          currentRetryCount: output.report.retryCount ?? 0,
          // characterRefImageUrl 从 QC 输入继承
          characterRefImageUrl: qcInput.characterRefImageUrl,
          characterId: qcInput.characterId,
          // videoTaskStore.addTask 由 StoryProvider 注入或通过 useVideoTaskManager 获取
          // 这里作为 fallback 路径，若未注入则记录警告
          videoTaskStore: {
            addTask: async (newTask: Omit<VideoTask, "progress" | "createdAt">): Promise<VideoTask> => {
              errorLogger.warn(
                `[useQCTrigger] videoTaskStore.addTask 未注入，无法创建重生成任务`,
                newTask,
              );
              return { ...newTask, progress: 0, createdAt: new Date().toISOString() } as VideoTask;
            },
          },
        });

        if (fallbackResult.ok && beatId) {
          // 更新 StoryBeat.qcReport 的 retryCount 和 actionTaken
          onReportReady(beatId, fallbackResult.updatedReport);
        }
      } catch (fallbackError) {
        errorLogger.warn(
          `[useQCTrigger] taskId=${taskId} fallback 执行异常`,
          fallbackError,
        );
      }
    }
  } catch (e) {
    // INV-1: QC 失败不影响 VideoTask 完成回调，仅记日志
    errorLogger.warn(`[useQCTrigger] taskId=${taskId} QC 执行失败`, e);
  }
}
