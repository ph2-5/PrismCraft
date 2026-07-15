import {
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  RotateCcw,
  Ban,
  Timer,
  PauseCircle,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { VideoTaskStatus } from "@/domain/schemas";
import type { ErrorCategory } from "@/domain/types";
import { t } from "@/shared/constants";

export function getStatusIcon(status: VideoTaskStatus) {
  switch (status) {
    case "pending":
      return <Clock className="w-4 h-4" style={{ color: "var(--warning)" }} />;
    case "generating":
      return <PlayCircle className="w-4 h-4" style={{ color: "var(--primary)" }} />;
    case "completed":
      return <CheckCircle2 className="w-4 h-4" style={{ color: "var(--success)" }} />;
    case "failed":
      return <XCircle className="w-4 h-4" style={{ color: "var(--destructive)" }} />;
    case "retrying":
      return <RotateCcw className="w-4 h-4" style={{ color: "var(--warning)" }} />;
    case "cancelled":
      return <Ban className="w-4 h-4" style={{ color: "var(--muted-fg)" }} />;
    case "timeout":
      return <Timer className="w-4 h-4" style={{ color: "var(--warning)" }} />;
    case "paused":
      return <PauseCircle className="w-4 h-4" style={{ color: "var(--muted-fg)" }} />;
    default:
      return <Clock className="w-4 h-4" style={{ color: "var(--muted-fg)" }} />;
  }
}

export function getStatusColor(status: VideoTaskStatus) {
  switch (status) {
    case "pending":
      return "";
    case "generating":
      return "";
    case "completed":
      return "";
    case "failed":
      return "";
    case "retrying":
      return "";
    case "cancelled":
      return "";
    case "timeout":
      return "";
    case "paused":
      return "";
    default:
      return "";
  }
}

export function getStatusStyle(status: VideoTaskStatus): CSSProperties {
  switch (status) {
    case "pending":
      return { background: "rgba(var(--warning-rgb), 0.1)", color: "var(--warning)" };
    case "generating":
      return { background: "rgba(var(--primary-rgb), 0.1)", color: "var(--primary)" };
    case "completed":
      return { background: "rgba(var(--success-rgb), 0.1)", color: "var(--success)" };
    case "failed":
      return { background: "rgba(var(--destructive-rgb), 0.1)", color: "var(--destructive)" };
    case "retrying":
      return { background: "rgba(var(--warning-rgb), 0.1)", color: "var(--warning)" };
    case "cancelled":
      return { background: "var(--muted)", color: "var(--muted-fg)" };
    case "timeout":
      return { background: "rgba(var(--warning-rgb), 0.1)", color: "var(--warning)" };
    case "paused":
      return { background: "var(--muted)", color: "var(--muted-fg)" };
    default:
      return { background: "var(--muted)", color: "var(--muted-fg)" };
  }
}

export function getStatusLabel(status: VideoTaskStatus) {
  switch (status) {
    case "pending":
      return t("task.pendingLabel");
    case "generating":
      return t("task.generatingLabel");
    case "completed":
      return t("task.completedLabel");
    case "failed":
      return t("task.failedLabel");
    case "cancelled":
      return t("task.cancelledLabel");
    case "retrying":
      return t("task.retryingLabel");
    case "timeout":
      return t("task.timeoutLabel");
    case "paused":
      return t("task.pausedLabel");
    default:
      return status;
  }
}

/**
 * 错误分类 → 边框颜色映射
 * 用于 failed 任务按错误分类显示不同颜色边框。
 */
export function getErrorCategoryBorderColor(category: ErrorCategory): string {
  switch (category) {
    case "timeout":
    case "network":
      // 超时/网络 → 黄色边框
      return "var(--warning)";
    case "invalid_params":
      // 内容拒绝 → 红色边框
      return "var(--destructive)";
    case "server_error":
    case "database_busy":
    case "auth":
    case "rate_limit":
    case "quota":
      // 供应商/服务端错误 → 橙色边框（使用 warning 近似）
      return "var(--warning)";
    default:
      return "var(--destructive)";
  }
}

export function getErrorCategoryLabel(category: ErrorCategory): string {
  return t(`error.category.${category}`);
}
