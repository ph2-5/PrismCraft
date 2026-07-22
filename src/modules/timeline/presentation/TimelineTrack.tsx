/**
 * Q3-7 / Task 4.6.5 — 时间线主视图（轨道）
 *
 * 水平时间线 + 角色状态轨道 + 场景状态轨道 + 绑定关系图。
 * 支持 100+ 节点的水平滚动。
 */

import { t } from "@/shared/constants";
import { cn } from "@/shared/utils/utils";
import { CharacterStateTrack } from "./CharacterStateTrack";
import { BindingGraph } from "./BindingGraph";
import type {
  PlotNodeLike,
  TimelineBindingLike,
  CharacterStateSnapshot,
  SceneStateSnapshot,
} from "@/shared-logic/timeline";

interface TimelineTrackProps {
  nodes: PlotNodeLike[];
  bindings: TimelineBindingLike[];
  /** 推演结果：nodeId → 快照 */
  snapshotsMap?: Map<string, {
    characterSnapshots: CharacterStateSnapshot[];
    sceneSnapshots: SceneStateSnapshot[];
  }>;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
}

export function TimelineTrack({
  nodes,
  bindings,
  snapshotsMap,
  selectedNodeId,
  onSelectNode,
  className,
}: TimelineTrackProps) {
  const sortedNodes = [...nodes].sort((a, b) => a.order - b.order);

  if (sortedNodes.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8", className)}>
        <div className="text-[12px] text-[var(--muted-fg)]">
          {t("timeline.editor.empty")}
        </div>
        <div className="text-[11px] text-[var(--muted-fg)] mt-1">
          {t("timeline.editor.emptyHint")}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* 时间线节点轨道 */}
      <section>
        <div className="section-label px-3 py-1">{t("timeline.editor.trackTimeline")}</div>
        <div className="flex gap-2 px-3 py-2 overflow-x-auto">
          {sortedNodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const nodeSnaps = snapshotsMap?.get(node.id);
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelectNode?.(node.id)}
                className={cn(
                  "timeline-card",
                  isSelected && "selected",
                )}
                style={{ minWidth: 140 }}
              >
                <div className="tc-thumb">
                  <span className="text-[20px]">
                    {EVENT_ICON[node.plotEventType] ?? "•"}
                  </span>
                </div>
                <div className="tc-info">
                  <div className="tc-title">
                    {t("timeline.editor.nodeN", { n: node.order + 1 })}
                  </div>
                  <div className="tc-dur">
                    {t(`timeline.event.${node.plotEventType}`)}
                  </div>
                  {nodeSnaps && nodeSnaps.characterSnapshots.length > 0 && (
                    <div className="tc-bindings">
                      {nodeSnaps.characterSnapshots.slice(0, 3).map((s) => (
                        <span key={s.characterId} className="tc-bind-tag">
                          {s.characterId}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 角色状态轨道 */}
      <CharacterStateTrack
        nodes={sortedNodes}
        snapshotsMap={snapshotsMap?.get
          ? convertToCharacterMap(snapshotsMap)
          : undefined}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />

      {/* 场景状态轨道 */}
      <SceneStateTrack
        nodes={sortedNodes}
        snapshotsMap={snapshotsMap}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />

      {/* 绑定关系图 */}
      <BindingGraph
        nodes={sortedNodes}
        bindings={bindings}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
    </div>
  );
}

/** 场景状态轨道（内联实现，与 CharacterStateTrack 类似） */
function SceneStateTrack({
  nodes,
  snapshotsMap,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: PlotNodeLike[];
  snapshotsMap?: Map<string, {
    characterSnapshots: CharacterStateSnapshot[];
    sceneSnapshots: SceneStateSnapshot[];
  }>;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
}) {
  const sceneIds: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const snaps = snapshotsMap?.get(node.id)?.sceneSnapshots ?? [];
    for (const snap of snaps) {
      if (!seen.has(snap.sceneId)) {
        seen.add(snap.sceneId);
        sceneIds.push(snap.sceneId);
      }
    }
  }

  if (sceneIds.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="section-label px-3 py-1">{t("timeline.editor.trackScene")}</div>
      <div className="flex flex-col gap-0.5">
        {sceneIds.map((sceneId) => (
          <div key={sceneId} className="flex items-center gap-1 px-3 py-0.5">
            <div className="w-20 text-[11px] text-[var(--muted-fg)] truncate flex-shrink-0">
              {sceneId}
            </div>
            <div className="flex gap-1 overflow-x-auto flex-1">
              {nodes.map((node) => {
                const snap = snapshotsMap
                  ?.get(node.id)
                  ?.sceneSnapshots.find((s) => s.sceneId === sceneId);
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
                    title={snap ? `${snap.environment.destructionLevel}%` : t("timeline.detail.noChange")}
                  >
                    {snap ? `${snap.environment.destructionLevel}%` : "—"}
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

/** 转换 Map 为 CharacterStateTrack 所需的形状 */
function convertToCharacterMap(
  snapshotsMap: Map<string, {
    characterSnapshots: CharacterStateSnapshot[];
    sceneSnapshots: SceneStateSnapshot[];
  }>,
): Map<string, { characterSnapshots: CharacterStateSnapshot[] }> {
  const result = new Map<string, { characterSnapshots: CharacterStateSnapshot[] }>();
  for (const [key, value] of snapshotsMap) {
    result.set(key, { characterSnapshots: value.characterSnapshots });
  }
  return result;
}

const EVENT_ICON: Record<string, string> = {
  character_introduce: "👤",
  character_transform: "🔄",
  character_injury: "🩹",
  character_emotion_change: "💭",
  character_reveal_secret: "🤫",
  character_relationship_change: "🤝",
  scene_change: "🎬",
  scene_destruction: "💥",
  scene_transform: "🌙",
  item_introduce: "📦",
  item_use: "🔧",
  item_destroy: "🗑️",
  world_rule_reveal: "📜",
  foreshadow: "🔮",
  callback: "↩️",
  climax: "⚡",
  twist: "🔀",
  resolution: "✅",
  compound: "🔗",
  narration: "📖",
  dialogue: "💬",
  action: "⚔️",
};
