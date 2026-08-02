/**
 * Task 2A.6 重设计 — SegmentNavColumn 左栏片段导航（260px）
 *
 * 对齐 design-preview.html 的 page-story 左栏：
 * - 按章节分组（chapterIndex / chapterTitle），每组显示章节标题与片段数
 * - 片段项：序号/状态图标（✓ 已选中 / ● 当前 / 序号 未选中）+ 标题 + 预计时长
 *
 * 点击片段卡片切换 currentSegmentIndex。
 */

import { useMemo } from "react";
import { Clock, ListCollapse, BookOpen } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { Segment } from "../domain/types";

export interface SegmentNavColumnProps {
  segments: Segment[];
  currentSegmentIndex: number;
  selectedIds: string[];
  onSelect: (index: number) => void;
}

/** 章节分组结果：保留原始顺序，无章节信息的分段归入同一组 */
interface ChapterGroup {
  /** 章节标题（无章节信息时为 undefined → 平铺显示） */
  title?: string;
  /** 该章节的片段（含全局 index，用于 onSelect） */
  items: { segment: Segment; index: number }[];
}

export function SegmentNavColumn({
  segments,
  currentSegmentIndex,
  selectedIds,
  onSelect,
}: SegmentNavColumnProps) {
  const groups = useMemo<ChapterGroup[]>(() => {
    const result: ChapterGroup[] = [];
    let current: ChapterGroup | null = null;
    segments.forEach((segment, index) => {
      const title = segment.chapterTitle;
      if (!current || current.title !== title) {
        current = { title, items: [] };
        result.push(current);
      }
      current.items.push({ segment, index });
    });
    return result;
  }, [segments]);

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
          <div className="flex flex-col gap-2">
            {groups.map((group, groupIndex) => (
              <div key={group.title ?? `plain-${groupIndex}`}>
                {group.title && (
                  <div className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 text-[10px] font-semibold text-muted-foreground">
                    <BookOpen size={10} />
                    <span className="truncate">{group.title}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground/70">
                      {group.items.length}
                    </span>
                  </div>
                )}
                <ul className="flex flex-col gap-1">
                  {group.items.map(({ segment, index }) => {
                    const isCurrent = index === currentSegmentIndex;
                    const isSelected = selectedIds.includes(segment.id);
                    return (
                      <li key={segment.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(index)}
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
                              {isSelected ? "✓" : isCurrent ? "●" : index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">{segment.title}</div>
                              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground/80">
                                <Clock size={10} />
                                {t("novel.segments.duration", { n: segment.estimatedDuration })}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
