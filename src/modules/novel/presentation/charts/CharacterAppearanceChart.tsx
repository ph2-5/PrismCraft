/**
 * Task 2A.15 — 角色出场分布图
 *
 * 横向条形图：每个角色一行，按 shot.sequence 范围显示出场分布。
 * 数据源：shots.characters（角色名列表）。
 *
 * 交互：点击角色行 → 跳转到角色管理（onCharacterClick 回调）
 *
 * 依赖方向：仅依赖 @/shared/constants（i18n）+ 同模块 domain/types（ShotBreakdown）
 */

import { useMemo } from "react";
import { t } from "@/shared/constants";
import type { ShotBreakdown } from "../../domain/types";

export interface CharacterAppearanceChartProps {
  /** 分镜列表（数据源） */
  shots: ShotBreakdown[];
  /** 点击角色行回调（name 为角色名） */
  onCharacterClick?: (name: string) => void;
}

/** 单个角色的出场统计 */
interface CharacterStats {
  name: string;
  /** 出现在哪些 shot.sequence（1-based） */
  sequences: number[];
  /** 总出场次数 */
  count: number;
  /** 第一次出场的 sequence */
  firstAppearance: number;
}

/**
 * 从 shots 数据统计每个角色的出场分布。
 */
function computeCharacterStats(shots: ShotBreakdown[]): CharacterStats[] {
  const map = new Map<string, CharacterStats>();
  for (const shot of shots) {
    for (const name of shot.characters) {
      if (!name) continue;
      let stats = map.get(name);
      if (!stats) {
        stats = {
          name,
          sequences: [],
          count: 0,
          firstAppearance: shot.sequence,
        };
        map.set(name, stats);
      }
      stats.sequences.push(shot.sequence);
      stats.count++;
      if (shot.sequence < stats.firstAppearance) {
        stats.firstAppearance = shot.sequence;
      }
    }
  }
  // 按首次出场顺序排序（次要按出场次数降序）
  return Array.from(map.values()).sort((a, b) => {
    if (a.firstAppearance !== b.firstAppearance) {
      return a.firstAppearance - b.firstAppearance;
    }
    return b.count - a.count;
  });
}

export function CharacterAppearanceChart({
  shots,
  onCharacterClick,
}: CharacterAppearanceChartProps) {
  const stats = useMemo(() => computeCharacterStats(shots), [shots]);

  if (stats.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground text-center py-4">
        {t("novel.overview.noCharacterData")}
      </div>
    );
  }

  const maxSequence = shots.length > 0 ? shots[shots.length - 1]!.sequence : 0;

  return (
    <div className="space-y-1.5">
      {stats.map((stat) => {
        // 为每个角色渲染一行：名字 + 出场分布条
        const bars = stat.sequences.map((seq) => {
          const left = ((seq - 1) / Math.max(1, maxSequence)) * 100;
          const width = Math.max(1, (1 / Math.max(1, maxSequence)) * 100);
          return (
            <div
              key={seq}
              className="absolute h-2 bg-[var(--primary)] rounded-sm opacity-70"
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${stat.name} @ #${seq}`}
            />
          );
        });

        return (
          <button
            key={stat.name}
            type="button"
            onClick={() => onCharacterClick?.(stat.name)}
            disabled={!onCharacterClick}
            className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/40 disabled:cursor-default text-left"
          >
            <span className="text-[11px] w-16 shrink-0 truncate" title={stat.name}>
              {stat.name}
            </span>
            <div className="relative flex-1 h-3 bg-muted/30 rounded">
              {bars}
            </div>
            <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0 font-mono">
              {stat.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
