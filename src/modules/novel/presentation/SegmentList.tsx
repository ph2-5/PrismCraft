/**
 * Task 2A.4 — Step 2-3: 分段列表
 *
 * 显示 NovelSegment 数组，支持单选/全选/取消全选。
 * 顶部显示已选数量统计和全选按钮。
 */

import { CheckSquare, Square, FileText } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { NovelSegment } from "../domain/types";
import { SegmentCard } from "./SegmentCard";

export interface SegmentListProps {
  segments: NovelSegment[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}

export function SegmentList({ segments, selectedIds, onToggle, onSelectAll }: SegmentListProps) {
  const selectedSet = new Set(selectedIds);
  const allSelected = segments.length > 0 && selectedIds.length === segments.length;
  const noneSelected = selectedIds.length === 0;

  if (segments.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={t("novel.segments.empty")}
        hint={t("novel.segments.emptyHint")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-3xl mx-auto w-full">
      {/* 头部：标题 + 全选按钮 + 统计 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">{t("novel.segments.title")}</h2>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {t("novel.segments.selected", { selected: selectedIds.length, total: segments.length })}
          </div>
        </div>
        <button
          type="button"
          onClick={onSelectAll}
          className="btn btn-ghost text-[12px] px-3 py-1.5 flex items-center gap-1.5"
          aria-label={allSelected ? t("novel.segments.deselectAll") : t("novel.segments.selectAll")}
        >
          {allSelected ? <Square size={12} /> : <CheckSquare size={12} />}
          {allSelected ? t("novel.segments.deselectAll") : t("novel.segments.selectAll")}
        </button>
      </div>

      {/* 段落卡片列表 */}
      <div className="grid grid-cols-1 gap-2">
        {segments.map((seg) => (
          <div
            key={seg.id}
            // P2-3: 长列表性能优化 — content-visibility 跳过视口外卡片的渲染
            // 第 6 轮审计修复：使用 "auto 200px" 让浏览器记住实际高度，减少滚动跳变
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
          >
            <SegmentCard
              segment={seg}
              isSelected={selectedSet.has(seg.id)}
              onToggle={() => onToggle(seg.id)}
            />
          </div>
        ))}
      </div>

      {/* 底部说明 */}
      {noneSelected && (
        <div className="text-[11px] text-muted-foreground text-center mt-2">
          {t("novel.controls.cannotProceed")}
        </div>
      )}
    </div>
  );
}
