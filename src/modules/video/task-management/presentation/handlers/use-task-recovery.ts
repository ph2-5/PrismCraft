import { useState, useCallback } from "react";
import { recoverVideoByTaskId } from "@/modules/video/recovery";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { t } from "@/shared/constants/messages";

interface UseTaskRecoveryDeps {
  onTaskRecovered?: (taskId: string, status: string, videoUrl?: string) => void;
}

/**
 * 视频任务恢复相关状态和回调。
 * 提取为独立 hook 以降低 useVideoTaskHandlers 的行数。
 */
export function useTaskRecovery({ onTaskRecovered }: UseTaskRecoveryDeps) {
  const { success, error } = useToastHelpers();
  const [recoveryTaskId, setRecoveryTaskId] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  /** 正在恢复中的 taskId 集合（用于失败列表的 per-task loading 状态） */
  const [recoveringTaskIds, setRecoveringTaskIds] = useState<Set<string>>(new Set());

  /** 手动输入 taskId 恢复（用于高级输入框） */
  const handleRecoverVideo = async () => {
    if (!recoveryTaskId.trim()) { error(t("video.enterTaskId"), t("video.enterTaskIdHint")); return; }
    setIsRecovering(true);
    try {
      const result = await recoverVideoByTaskId(recoveryTaskId.trim());
      if (result.ok) {
        success(t("video.recovered"), result.value.message);
        setRecoveryTaskId("");
        if (onTaskRecovered && result.value.status) onTaskRecovered(recoveryTaskId.trim(), result.value.status, result.value.videoUrl);
      } else {
        error(t("error.operationFailed"), mapUserFacingError(result.error));
      }
    } catch (err) { error(t("error.operationFailed"), mapUserFacingError(err)); }
    finally { setIsRecovering(false); }
  };

  /** 按 taskId 恢复单个失败任务（用于失败列表的 per-task 恢复按钮） */
  const handleRecoverTaskById = useCallback(async (taskId: string) => {
    if (!taskId.trim()) return;
    setRecoveringTaskIds((prev) => new Set(prev).add(taskId));
    try {
      const result = await recoverVideoByTaskId(taskId.trim());
      if (result.ok) {
        success(t("video.recovered"), result.value.message);
        if (onTaskRecovered && result.value.status) onTaskRecovered(taskId.trim(), result.value.status, result.value.videoUrl);
      } else {
        error(t("error.operationFailed"), mapUserFacingError(result.error));
      }
    } catch (err) { error(t("error.operationFailed"), mapUserFacingError(err)); }
    finally {
      setRecoveringTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, [onTaskRecovered, success, error]);

  /** 批量恢复失败任务（用于"一键恢复全部"按钮） */
  const handleRecoverAllFailed = useCallback(async (taskIds: string[]) => {
    if (taskIds.length === 0) return;
    let okCount = 0;
    let failCount = 0;
    for (const taskId of taskIds) {
      setRecoveringTaskIds((prev) => new Set(prev).add(taskId));
      try {
        const result = await recoverVideoByTaskId(taskId);
        if (result.ok) {
          okCount++;
          if (onTaskRecovered && result.value.status) {
            onTaskRecovered(taskId, result.value.status, result.value.videoUrl);
          }
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      } finally {
        setRecoveringTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    }
    if (okCount > 0) success(t("video.recovered"), t("task.recoveredCount", { count: okCount }));
    if (failCount > 0) error(t("error.operationFailed"), t("task.recoveryFailedCount", { count: failCount }));
  }, [onTaskRecovered, success, error]);

  return {
    recoveryTaskId,
    setRecoveryTaskId,
    isRecovering,
    recoveringTaskIds,
    handleRecoverVideo,
    handleRecoverTaskById,
    handleRecoverAllFailed,
  };
}
