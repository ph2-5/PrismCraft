/**
 * Task 2A.4 — 单个分段卡片
 *
 * 显示：标题、摘要、预计时长、关键事件。
 * 点击切换选中状态（边框/背景色变化）。
 */

import { Clock, ListChecks } from "lucide-react";
import { t } from "@/shared/constants";
import type { NovelSegment } from "../domain/types";

export interface SegmentCardProps {
  segment: NovelSegment;
  isSelected: boolean;
  onToggle: () => void;
}

export function SegmentCard({ segment, isSelected, onToggle }: SegmentCardProps) {
  return (
    <div
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={[
        "card p-3 cursor-pointer transition-all",
        isSelected
          ? "border-[var(--primary)] bg-[rgba(var(--primary-rgb),0.05)] ring-1 ring-[var(--primary)]"
          : "hover:border-[var(--primary-hover)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <div
          className={[
            "mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0",
            isSelected
              ? "bg-[var(--primary)] border-[var(--primary)] text-primary-foreground"
              : "border-border",
          ].join(" ")}
        >
          {isSelected && (
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="currentColor">
              <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-bold truncate">{segment.title || t("novel.segments.titleFallback", { id: segment.id.slice(0, 6) })}</div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
              <Clock size={10} />
              {t("novel.segments.duration", { n: Math.round(segment.estimatedDuration) })}
            </div>
          </div>
          {segment.summary && (
            <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
              {segment.summary}
            </div>
          )}
          {segment.keyEvents.length > 0 && (
            <div className="mt-2 flex items-start gap-1">
              <ListChecks size={10} className="text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {segment.keyEvents.slice(0, 3).map((ev, i) => (
                  <span key={i} className="badge badge-info text-[9px] px-1.5 py-0.5">
                    {ev}
                  </span>
                ))}
                {segment.keyEvents.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">
                    +{segment.keyEvents.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
