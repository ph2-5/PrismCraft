/**
 * Q3-7 / Task 4.6.5 — 状态快照视图
 *
 * 展示角色/场景的状态快照（CharacterStateSnapshot / SceneStateSnapshot）。
 * 被NodeDetailPanel 使用。
 *
 * 设计来源：docs/timeline-variant-design.md 第五章 5.2 节
 */

import { t } from "@/shared/constants";
import { cn } from "@/shared/utils/utils";
import type {
  CharacterStateSnapshot,
  SceneStateSnapshot,
} from "@/shared-logic/timeline";

interface StateSnapshotViewProps {
  characterSnapshots?: CharacterStateSnapshot[];
  sceneSnapshots?: SceneStateSnapshot[];
  className?: string;
}

export function StateSnapshotView({
  characterSnapshots = [],
  sceneSnapshots = [],
  className,
}: StateSnapshotViewProps) {
  const hasData = characterSnapshots.length > 0 || sceneSnapshots.length > 0;

  if (!hasData) {
    return (
      <div className={cn("text-[11px] text-[var(--muted-fg)] py-2", className)}>
        {t("timeline.detail.noSnapshot")}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {characterSnapshots.length > 0 && (
        <section>
          <div className="section-label">{t("timeline.snapshot.character")}</div>
          <div className="flex flex-col gap-2 mt-1">
            {characterSnapshots.map((snap) => (
              <CharacterSnapshotCard key={snap.characterId} snapshot={snap} />
            ))}
          </div>
        </section>
      )}
      {sceneSnapshots.length > 0 && (
        <section>
          <div className="section-label">{t("timeline.snapshot.scene")}</div>
          <div className="flex flex-col gap-2 mt-1">
            {sceneSnapshots.map((snap) => (
              <SceneSnapshotCard key={snap.sceneId} snapshot={snap} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CharacterSnapshotCard({ snapshot: s }: { snapshot: CharacterStateSnapshot }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card2)] p-2">
      <div className="text-[12px] font-semibold mb-1">{s.characterId}</div>
      <div className="text-[11px] text-[var(--muted-fg)] grid grid-cols-2 gap-x-2 gap-y-0.5">
        <span>{t("timeline.snapshot.appearance")}</span>
        <span className="text-[var(--fg)]">
          {s.appearance.outfit || "—"} · {s.appearance.expression}
        </span>
        <span>{t("timeline.detail.emotion")}</span>
        <span className="text-[var(--fg)]">{s.innerState.emotion}</span>
        <span>{t("timeline.detail.injuries")}</span>
        <span className="text-[var(--fg)]">
          {s.appearance.injuries.length > 0
            ? s.appearance.injuries.map((i) => i.type).join(", ")
            : t("timeline.detail.noChange")}
        </span>
        <span>{t("timeline.detail.variant")}</span>
        <span className="text-[var(--fg)]">{s.appearance.variantId}</span>
      </div>
    </div>
  );
}

function SceneSnapshotCard({ snapshot: s }: { snapshot: SceneStateSnapshot }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card2)] p-2">
      <div className="text-[12px] font-semibold mb-1">{s.sceneId}</div>
      <div className="text-[11px] text-[var(--muted-fg)] grid grid-cols-2 gap-x-2 gap-y-0.5">
        <span>{t("timeline.snapshot.environment")}</span>
        <span className="text-[var(--fg)]">
          {s.environment.timeOfDay} · {s.environment.weather}
        </span>
        <span>{t("timeline.detail.destruction")}</span>
        <span className="text-[var(--fg)]">{s.environment.destructionLevel}%</span>
        <span>{t("timeline.detail.atmosphere")}</span>
        <span className="text-[var(--fg)]">{s.environment.mood}</span>
        <span>{t("timeline.snapshot.entities")}</span>
        <span className="text-[var(--fg)]">
          {s.entities.itemsPresent.length} 物品
        </span>
      </div>
    </div>
  );
}
