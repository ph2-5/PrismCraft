/**
 * P5 断点恢复 - 中断会话恢复组件
 *
 * 当检测到有未完成的会话（status=interrupted）时，在消息列表顶部显示横幅：
 * - 默认收起：单行摘要 + 展开按钮 + 全部忽略按钮
 * - 展开后：显示中断会话列表，每项有"恢复"和"忽略"按钮
 *
 * 设计要点：
 * - 醒目的警告色（amber）引起用户注意
 * - 不自动弹窗，仅作为横幅展示，用户可主动忽略
 * - 恢复操作会加载中断会话到当前视图
 */

"use client";

import { useState } from "react";
import type { CheckpointIndexEntry } from "../services/session-checkpoint";
import { t } from "@/shared/constants";
import { AlertCircle, ChevronDown, ChevronUp, RotateCcw, X } from "lucide-react";

interface CheckpointRecoveryProps {
  /** 中断的会话列表 */
  interruptedSessions: CheckpointIndexEntry[];
  /** 恢复指定会话 */
  onResume: (sessionId: string) => void;
  /** 忽略指定会话（清除检查点标记） */
  onDismiss: (sessionId: string) => void;
  /** 忽略全部 */
  onDismissAll: () => void;
}

/** 格式化时间戳为相对时间 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function CheckpointRecovery({
  interruptedSessions,
  onResume,
  onDismiss,
  onDismissAll,
}: CheckpointRecoveryProps) {
  const [expanded, setExpanded] = useState(false);

  // 无中断会话时不渲染
  if (interruptedSessions.length === 0) {
    return null;
  }

  const count = interruptedSessions.length;

  return (
    <div className="mx-auto mb-4 max-w-3xl rounded-lg border border-amber-300/60 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/30">
      {/* 横幅摘要行 */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
            {t("agent.checkpoint.interruptedCount", { count })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* 展开/收起按钮 */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
            aria-label={expanded ? t("agent.checkpoint.collapse") : t("agent.checkpoint.expand")}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                {t("agent.checkpoint.collapse")}
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                {t("agent.checkpoint.expand")}
              </>
            )}
          </button>
          {/* 全部忽略按钮 */}
          <button
            onClick={onDismissAll}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            <X className="h-3 w-3" />
            {t("agent.checkpoint.dismissAll")}
          </button>
        </div>
      </div>

      {/* 展开后的会话列表 */}
      {expanded && (
        <div className="border-t border-amber-200/60 px-4 py-2 dark:border-amber-800/60">
          <div className="space-y-1.5">
            {interruptedSessions.map((entry) => (
              <div
                key={entry.sessionId}
                className="flex items-center justify-between rounded-md bg-white/60 px-3 py-2 dark:bg-black/20"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <RotateCcw className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-amber-900 dark:text-amber-200">
                      {entry.sessionId}
                    </div>
                    <div className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                      {t("agent.checkpoint.interruptedAt", {
                        time: formatRelativeTime(entry.updatedAt),
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => onResume(entry.sessionId)}
                    className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
                  >
                    {t("agent.checkpoint.resume")}
                  </button>
                  <button
                    onClick={() => onDismiss(entry.sessionId)}
                    className="rounded px-2 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
                    aria-label={t("agent.checkpoint.dismiss")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
