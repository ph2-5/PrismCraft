import type { VideoTask } from "@/domain/schemas";
import { saveVideoTask } from "@/modules/video/recovery";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { emitToast } from "@/shared/utils/toast-bridge";

export interface PersistOptions {
  /** 失败日志级别；默认 "warn"。warn 提取错误消息字符串，error 透传整个错误对象。 */
  logLevel?: "warn" | "error";
  /** 失败日志消息标签（自动补 "[VideoTaskManager] " 前缀）。 */
  logLabel: string;
  /** 失败时弹出的 warning toast。 */
  toastOnFailure?: {
    titleKey: string;
    detailKey: string;
    detailArgs?: Record<string, string | number>;
  };
  /** 是否用 try/catch 防御 saveVideoTask 抛出（默认 true）。设为 false 时异常向上传播。 */
  catchExceptions?: boolean;
}

/**
 * 统一封装 saveVideoTask 调用：失败日志 + 可选 toast + 可选 try/catch。
 *
 * 抽取自 7 处调用点的样板代码（显式字段列表已由调用方合并为完整 task 对象，
 * 因为 saveVideoTask 内部已做 `...task` 展开）。
 */
export async function persistVideoTask(
  task: VideoTask,
  options: PersistOptions,
): Promise<void> {
  const {
    logLevel = "warn",
    logLabel,
    toastOnFailure,
    catchExceptions = true,
  } = options;

  const prefixedLabel = `[VideoTaskManager] ${logLabel}`;

  const logFailure = (error: unknown): void => {
    if (logLevel === "error") {
      errorLogger.error(prefixedLabel, error);
    } else {
      errorLogger.warn(
        prefixedLabel,
        error instanceof Error ? error.message : error,
      );
    }
    if (toastOnFailure) {
      emitToast(
        "warning",
        t(toastOnFailure.titleKey),
        t(toastOnFailure.detailKey, toastOnFailure.detailArgs),
      );
    }
  };

  const run = async (): Promise<void> => {
    const result = await saveVideoTask(task);
    if (!result.ok) {
      logFailure(result.error);
    }
  };

  if (catchExceptions) {
    try {
      await run();
    } catch (saveError) {
      if (logLevel === "error") {
        errorLogger.error(prefixedLabel, saveError);
      } else {
        errorLogger.warn(prefixedLabel, saveError);
      }
    }
  } else {
    await run();
  }
}
