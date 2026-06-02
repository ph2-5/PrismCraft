import React from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  RotateCcw,
  Ban,
} from "lucide-react";
import type { VideoTaskStatus } from "@/domain/schemas";
import { t } from "@/shared/constants";

export function getStatusIcon(status: VideoTaskStatus) {
  switch (status) {
    case "pending":
      return <Clock className="w-4 h-4 text-yellow-500" />;
    case "generating":
      return <PlayCircle className="w-4 h-4 text-blue-500" />;
    case "completed":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "retrying":
      return <RotateCcw className="w-4 h-4 text-orange-500" />;
    case "cancelled":
      return <Ban className="w-4 h-4 text-gray-500" />;
    default:
      return <Clock className="w-4 h-4 text-gray-500" />;
  }
}

export function getStatusColor(status: VideoTaskStatus) {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "generating":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "retrying":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "cancelled":
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
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
    default:
      return status;
  }
}
