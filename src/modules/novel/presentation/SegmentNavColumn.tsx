/**
 * Task 2A.6 — SegmentNavColumn 左栏片段导航（260px）
 *
 * 显示 PipelineState.segments 列表，每个片段卡片显示：
 * - 序号 + 标题
 * - 状态指示（✓ 已选中 / ● 当前 / 空 未选中）
 * - 预计时长
 *
 * 点击片段卡片切换 currentSegmentIndex。
 * 顶部显示标题"片段导航"和总数。
 */

import { Clock, ListCollapse } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { Segment } from "../domain/types";

export interface SegmentNavColumnProps {
  segments: Segment[];
  currentSegmentIndex: number;
  selectedIds: string[];
  onSelect: (index: number) => void;
}

export function SegmentNavColumn({
  segments,
  currentSegmentIndex,
  selectedIds,
  onSelect,
}: SegmentNavColumnProps) {
  return (
    <aside
      className="w-[180px] lg:w-[220px] xl:w-[260px] shrink-0 border-r border-border bg-card/20 flex flex-col overflow-hidden"
      aria-label={t("novel.shell.segmentNav")}
    >
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t("novel.shell.segmentNav")}
        </div>
        <div className="text-[12px] text-muted-foreground mt-0.5">
          {t("novel.shell.segmentsCount", { count: segments.length })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {segments.length === 0 ? (
          <EmptyState
            icon={ListCollapse}
            title={t("novel.shell.emptySegments")}
            hint={t("novel.shell.emptySegmentsHint")}
            compact
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {segments.map((seg, i) => {
              const isCurrent = i === currentSegmentIndex;
              const isSelected = selectedIds.includes(seg.id);
              return (
                <li key={seg.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className={[
                      "w-full text-left px-2.5 py-2 rounded-md text-[12px] transition-colors",
                      isCurrent
                        ? "bg-[rgba(var(--primary-rgb),0.12)] text-foreground border border-[rgba(var(--primary-rgb),0.3)]"
                        : "hover:bg-muted/50 text-muted-foreground border border-transparent",
                    ].join(" ")}
                    aria-current={isCurrent ? "true" : undefined}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={[
                          "shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold",
                          isSelected
                            ? "bg-[var(--primary)] text-primary-foreground"
                            : isCurrent
                              ? "border-2 border-[var(--primary)] text-[var(--primary)]"
                              : "border border-border text-muted-foreground",
                        ].join(" ")}
                        aria-label={isSelected ? "selected" : "unselected"}
                      >
                        {isSelected ? "✓" : isCurrent ? "●" : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{seg.title}</div>
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground/80">
                          <Clock size={10} />
                          {t("novel.segments.duration", { n: seg.estimatedDuration })}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
