/**
 * Task 2A.15 — 场景变化节奏图
 *
 * 横向条形图：每个场景一行，按 shot.sequence 范围显示场景出现分布。
 * 数据源：shots.sceneId（关联到 SceneInPipeline.matchedSceneId 或 tempId）。
 *
 * 交互：点击场景行 → 跳转到场景管理（onSceneClick 回调）
 *
 * 依赖方向：仅依赖 @/shared/constants（i18n）+ 同模块 domain/types（ShotBreakdown/SceneInPipeline）
 */

import { useMemo } from "react";
import { t } from "@/shared/constants";
import type { ShotBreakdown, SceneInPipeline } from "../../domain/types";

export interface ScenePacingChartProps {
  /** 分镜列表（数据源） */
  shots: ShotBreakdown[];
  /** 场景列表（用于名称反查） */
  scenes: SceneInPipeline[];
  /** 点击场景行回调（sceneId 为 matchedSceneId 或 tempId） */
  onSceneClick?: (sceneId: string) => void;
}

/** 单个场景的出场统计 */
interface SceneStats {
  /** matchedSceneId 或 tempId（用于点击回调） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 出现在哪些 shot.sequence（1-based） */
  sequences: number[];
  /** 总出场次数 */
  count: number;
}

/**
 * 从 shots 数据统计每个场景的出场分布。
 *
 * shots.sceneId 可能是 matchedSceneId（DB ID）或为空。
 * 通过 scenes 列表反查名称：优先匹配 matchedSceneId，回退到 tempId。
 */
function computeSceneStats(
  shots: ShotBreakdown[],
  scenes: SceneInPipeline[],
): SceneStats[] {
  const map = new Map<string, SceneStats>();

  // 构建 id → name 映射（matchedSceneId 和 tempId 都映射）
  const nameMap = new Map<string, string>();
  for (const scene of scenes) {
    if (scene.matchedSceneId) {
      nameMap.set(scene.matchedSceneId, scene.name);
    }
    nameMap.set(scene.tempId, scene.name);
  }

  for (const shot of shots) {
    if (!shot.sceneId) continue;
    let stats = map.get(shot.sceneId);
    if (!stats) {
      stats = {
        id: shot.sceneId,
        name: nameMap.get(shot.sceneId) ?? shot.sceneId,
        sequences: [],
        count: 0,
      };
      map.set(shot.sceneId, stats);
    }
    stats.sequences.push(shot.sequence);
    stats.count++;
  }

  // 按首次出场顺序排序
  return Array.from(map.values()).sort((a, b) => {
    const aFirst = a.sequences[0] ?? Number.MAX_SAFE_INTEGER;
    const bFirst = b.sequences[0] ?? Number.MAX_SAFE_INTEGER;
    return aFirst - bFirst;
  });
}

export function ScenePacingChart({
  shots,
  scenes,
  onSceneClick,
}: ScenePacingChartProps) {
  const stats = useMemo(
    () => computeSceneStats(shots, scenes),
    [shots, scenes],
  );

  if (stats.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground text-center py-4">
        {t("novel.overview.noSceneData")}
      </div>
    );
  }

  const maxSequence = shots.length > 0 ? shots[shots.length - 1]!.sequence : 0;

  return (
    <div className="space-y-1.5">
      {stats.map((stat) => {
        const bars = stat.sequences.map((seq) => {
          const left = ((seq - 1) / Math.max(1, maxSequence)) * 100;
          const width = Math.max(1, (1 / Math.max(1, maxSequence)) * 100);
          return (
            <div
              key={seq}
              className="absolute h-2 bg-emerald-500 rounded-sm opacity-70"
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${stat.name} @ #${seq}`}
            />
          );
        });

        return (
          <button
            key={stat.id}
            type="button"
            onClick={() => onSceneClick?.(stat.id)}
            disabled={!onSceneClick}
            className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/40 disabled:cursor-default text-left"
          >
            <span className="text-[11px] w-20 shrink-0 truncate" title={stat.name}>
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
