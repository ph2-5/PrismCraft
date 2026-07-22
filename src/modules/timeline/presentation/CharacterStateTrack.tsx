/**
 * Q3-7 / Task 4.6.5 — 角色状态轨道
 *
 * 在时间线主视图中显示角色状态随节点变化的轨道。
 * 每个角色一行，显示其在各节点的变体/状态。
 */

import { t } from "@/shared/constants";
import { cn } from "@/shared/utils/utils";
import type { CharacterStateSnapshot, PlotNodeLike } from "@/shared-logic/timeline";

interface CharacterStateTrackProps {
  nodes: PlotNodeLike[];
  /** nodeId → CharacterStateSnapshot[] 的映射（来自 propagateStates） */
  snapshotsMap?: Map<string, { characterSnapshots: CharacterStateSnapshot[] }>;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
}

export function CharacterStateTrack({
  nodes,
  snapshotsMap,
  selectedNodeId,
  onSelectNode,
  className,
}: CharacterStateTrackProps) {
  // 收集所有角色 ID（保持出现顺序）
  const characterIds: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const snaps = snapshotsMap?.get(node.id)?.characterSnapshots ?? [];
    for (const snap of snaps) {
      if (!seen.has(snap.characterId)) {
        seen.add(snap.characterId);
        characterIds.push(snap.characterId);
      }
    }
  }

  if (characterIds.length === 0) {
    return (
      <div className={cn("text-[11px] text-[var(--muted-fg)] py-2 px-3", className)}>
        {t("timeline.snapshot.noData")}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="section-label px-3 py-1">{t("timeline.editor.trackCharacter")}</div>
      <div className="flex flex-col gap-0.5">
        {characterIds.map((charId) => (
          <div key={charId} className="flex items-center gap-1 px-3 py-0.5">
            <div className="w-20 text-[11px] text-[var(--muted-fg)] truncate flex-shrink-0">
              {charId}
            </div>
            <div className="flex gap-1 overflow-x-auto flex-1">
              {nodes.map((node) => {
                const snap = snapshotsMap
                  ?.get(node.id)
                  ?.characterSnapshots.find((s) => s.characterId === charId);
                const isSelected = node.id === selectedNodeId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onSelectNode?.(node.id)}
                    className={cn(
                      "min-w-[60px] h-6 rounded-[4px] border text-[10px] px-1 flex items-center justify-center transition-colors",
                      isSelected
                        ? "border-[var(--primary)] bg-[rgba(var(--primary-rgb),0.1)]"
                        : "border-[var(--border)] bg-[var(--card2)] hover:border-[var(--primary)]",
                    )}
                    title={snap?.appearance.variantId ?? t("timeline.detail.noChange")}
                  >
                    {snap ? snap.appearance.variantId : "—"}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
