/**
 * Task 2A.15 — 分镜密度图
 *
 * 垂直柱状图：按 shotType 分组统计分镜数量。
 * 数据源：shots.shotType（景别）。
 *
 * 备选方案：按 segment 分组（需要 segmentId 关联，当前 ShotBreakdown 无此字段，
 * 因此采用按 shotType 分组，展示景别分布，对创作者调优有实际指导意义）。
 *
 * 交互：点击柱 → 跳转到分镜列表（onShotTypeClick 回调）
 *
 * 依赖方向：仅依赖 @/shared/constants（i18n）+ 同模块 domain/types（ShotBreakdown）
 */

import { useMemo } from "react";
import { t } from "@/shared/constants";
import type { ShotBreakdown } from "../../domain/types";

export interface ShotDensityChartProps {
  /** 分镜列表（数据源） */
  shots: ShotBreakdown[];
  /** 点击柱回调（shotType 为景别） */
  onShotTypeClick?: (shotType: string) => void;
}

/** 单个景别的统计 */
interface ShotTypeStats {
  /** 景别（如"特写"/"中景"/"全景"） */
  shotType: string;
  /** 该景别的分镜数量 */
  count: number;
  /** 该景别的平均时长（秒） */
  avgDuration: number;
}

/**
 * 从 shots 数据按 shotType 分组统计。
 *
 * 空 shotType 归类到 "未指定"。
 */
function computeShotTypeStats(shots: ShotBreakdown[]): ShotTypeStats[] {
  const map = new Map<string, { count: number; totalDuration: number }>();
  for (const shot of shots) {
    const type = shot.shotType?.trim() || t("novel.overview.unspecifiedShotType");
    let stats = map.get(type);
    if (!stats) {
      stats = { count: 0, totalDuration: 0 };
      map.set(type, stats);
    }
    stats.count++;
    stats.totalDuration += shot.estimatedDuration;
  }
  return Array.from(map.entries())
    .map(([shotType, s]) => ({
      shotType,
      count: s.count,
      avgDuration: s.totalDuration / s.count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function ShotDensityChart({
  shots,
  onShotTypeClick,
}: ShotDensityChartProps) {
  const stats = useMemo(() => computeShotTypeStats(shots), [shots]);

  if (stats.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground text-center py-4">
        {t("novel.overview.noShotData")}
      </div>
    );
  }

  const maxCount = Math.max(...stats.map((s) => s.count), 1);

  return (
    <div className="space-y-1.5">
      {/* 横向条形图（每个景别一行，比垂直柱状图在窄栏中更易读） */}
      {stats.map((stat) => {
        const widthPct = (stat.count / maxCount) * 100;
        return (
          <button
            key={stat.shotType}
            type="button"
            onClick={() => onShotTypeClick?.(stat.shotType)}
            disabled={!onShotTypeClick}
            className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/40 disabled:cursor-default text-left"
          >
            <span className="text-[11px] w-16 shrink-0 truncate" title={stat.shotType}>
              {stat.shotType}
            </span>
            <div className="relative flex-1 h-3 bg-muted/30 rounded">
              <div
                className="absolute h-full bg-cyan-500 rounded-sm opacity-80 transition-all"
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0 font-mono">
              {stat.count} · {stat.avgDuration.toFixed(1)}s
            </span>
          </button>
        );
      })}
    </div>
  );
}
