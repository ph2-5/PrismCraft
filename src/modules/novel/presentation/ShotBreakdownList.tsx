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
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
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
      <EmptyState
        icon={Film}
        title={t("novel.shotBreakdown.empty")}
        hint={t("novel.shotBreakdown.emptyHint")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-4xl mx-auto w-full">
      {/* 顶部统计栏 + 操作 */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <ListOrdered size={11} className="text-muted-foreground" />
            <span>{t("novel.shotBreakdown.totalCount", { count: stats.total })}</span>
          </div>
          <div className="text-muted-foreground">
            {t("novel.shotBreakdown.draft", { count: stats.draft })} ·{" "}
            {t("novel.shotBreakdown.edited", { count: stats.edited })} ·{" "}
            {t("novel.shotBreakdown.final", { count: stats.final })}
          </div>
          <div className="text-muted-foreground">
            {t("novel.shotBreakdown.promptCount", { count: stats.withPrompt, total: stats.total })}
          </div>
        </div>
        <button
          type="button"
          onClick={onGeneratePrompts}
          className="btn btn-primary text-[11px] px-3 py-1.5 flex items-center gap-1.5"
          aria-label={t("novel.shotBreakdown.generatePrompts")}
        >
          <Sparkles size={11} />
          {t("novel.shotBreakdown.generatePrompts")}
        </button>
      </div>

      {/* 分镜列表 */}
      <div className="flex flex-col gap-2">
        {shots.map((shot, index) => (
          <div
            key={shot.id}
            className="flex items-center gap-2"
            // P2-3: 长列表性能优化 — content-visibility 让浏览器跳过视口外卡片的渲染
            // 第 7 轮审计修复：回退到固定值，避免 "auto Npx" 在早期浏览器上整体声明被丢弃
            // 第 8 轮审计修复：值从 160px 调整为 220px，匹配 ShotCard 完整状态高度（220-260px）
            style={{ contentVisibility: "auto", containIntrinsicSize: "220px" }}
          >
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
                aria-label={t("novel.shotBreakdown.moveUpAriaLabel")}
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
                aria-label={t("novel.shotBreakdown.moveDownAriaLabel")}
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
