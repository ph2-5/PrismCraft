/**
 * Task 2A.5 — Step 6-7: 分镜列表
 *
 * 显示 ShotBreakdown[] 列表，支持：
 * - 拖拽排序（onReorder）
 * - 单个编辑（onEdit）
 * - 生成提示词（onGeneratePrompts）
 *
 * 顶部显示统计 + 生成提示词按钮。
 */

import { useMemo } from "react";
import { Sparkles, Film, ListOrdered } from "lucide-react";
import type { ShotBreakdown } from "../domain/types";
import { ShotCard } from "./ShotCard";

export interface ShotBreakdownListProps {
  shots: ShotBreakdown[];
  onEdit: (shot: ShotBreakdown) => void;
  onReorder: (from: number, to: number) => void;
  onGeneratePrompts: () => void;
}

export function ShotBreakdownList({
  shots,
  onEdit,
  onReorder,
  onGeneratePrompts,
}: ShotBreakdownListProps) {
  // 统计
  const stats = useMemo(() => {
    const total = shots.length;
    const draft = shots.filter((s) => s.status === "draft").length;
    const edited = shots.filter((s) => s.status === "edited").length;
    const final = shots.filter((s) => s.status === "final").length;
    const withPrompt = shots.filter((s) => s.prompt !== undefined).length;
    return { total, draft, edited, final, withPrompt };
  }, [shots]);

  if (shots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Film size={32} className="text-muted-foreground/40 mb-2" />
        <div className="text-[12px] text-muted-foreground">暂无分镜，请先完成段落拆解</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-4xl mx-auto w-full">
      {/* 顶部统计栏 + 操作 */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <ListOrdered size={11} className="text-muted-foreground" />
            <span>{stats.total} 个分镜</span>
          </div>
          <div className="text-muted-foreground">
            草稿 {stats.draft} · 已编辑 {stats.edited} · 定稿 {stats.final}
          </div>
          <div className="text-muted-foreground">
            提示词 {stats.withPrompt}/{stats.total}
          </div>
        </div>
        <button
          type="button"
          onClick={onGeneratePrompts}
          className="btn btn-primary text-[11px] px-3 py-1.5 flex items-center gap-1.5"
          aria-label="生成提示词"
        >
          <Sparkles size={11} />
          生成提示词
        </button>
      </div>

      {/* 分镜列表 */}
      <div className="flex flex-col gap-2">
        {shots.map((shot, index) => (
          <div key={shot.id} className="flex items-center gap-2">
            {/* 拖拽手柄 + 上下移动按钮 */}
            <div className="flex flex-col shrink-0">
              <button
                type="button"
                onClick={() => index > 0 && onReorder(index, index - 1)}
                disabled={index === 0}
                className={[
                  "text-[10px] px-1 py-0.5",
                  index === 0 ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
                aria-label="上移"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => index < shots.length - 1 && onReorder(index, index + 1)}
                disabled={index === shots.length - 1}
                className={[
                  "text-[10px] px-1 py-0.5",
                  index === shots.length - 1 ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
                aria-label="下移"
              >
                ▼
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <ShotCard shot={shot} onEdit={onEdit} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
