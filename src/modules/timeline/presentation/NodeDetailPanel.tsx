/**
 * Q3-7 / Task 4.6.5 — 节点详情面板
 *
 * 显示选中节点的完整信息：剧情事件 + 角色状态快照 + 场景状态快照 + 时间线绑定。
 * 使用 StateSnapshotView 展示快照。
 */

import { t } from "@/shared/constants";
import { cn } from "@/shared/utils/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { StateSnapshotView } from "./StateSnapshotView";
import type {
  PlotNodeLike,
  TimelineBindingLike,
  CharacterStateSnapshot,
  SceneStateSnapshot,
} from "@/shared-logic/timeline";

interface NodeDetailPanelProps {
  node: PlotNodeLike | null;
  bindings: TimelineBindingLike[];
  /** 推演结果：nodeId → 快照 */
  characterSnapshots?: CharacterStateSnapshot[];
  sceneSnapshots?: SceneStateSnapshot[];
  onSelectNode?: (nodeId: string) => void;
  onAddBinding?: () => void;
  onEditEvent?: () => void;
  onDeleteEvent?: () => void;
  className?: string;
}

export function NodeDetailPanel({
  node,
  bindings,
  characterSnapshots = [],
  sceneSnapshots = [],
  onSelectNode,
  onAddBinding,
  onEditEvent,
  onDeleteEvent,
  className,
}: NodeDetailPanelProps) {
  if (!node) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-[11px] text-[var(--muted-fg)] p-4",
          className,
        )}
      >
        {t("timeline.editor.empty")}
      </div>
    );
  }

  const inbound = bindings.filter((b) => b.targetNodeId === node.id);
  const outbound = bindings.filter((b) => b.sourceNodeId === node.id);

  return (
    <div className={cn("flex flex-col gap-3 p-3 overflow-y-auto", className)}>
      {/* 节点标题 */}
      <div>
        <div className="text-[13px] font-semibold">
          {t("timeline.editor.nodeN", { n: node.order + 1 })}
        </div>
        <div className="text-[11px] text-[var(--muted-fg)] mt-0.5">
          {t("timeline.detail.position")}: {node.chapterIndex ?? "—"} ·{" "}
          {t(`timeline.event.${node.plotEventType}`)}
        </div>
      </div>

      {/* 剧情事件 */}
      <section>
        <div className="section-label">{t("timeline.detail.event")}</div>
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card2)] p-2 mt-1">
          <div className="text-[11px] text-[var(--muted-fg)] mb-1">
            {t(`timeline.event.${node.plotEventType}`)}
          </div>
          <div className="text-[12px]">{node.plotEventDescription}</div>
          <div className="flex gap-1 mt-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onEditEvent}
            >
              <Pencil size={10} />
              {t("timeline.detail.editEvent")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-[var(--destructive)]"
              onClick={onDeleteEvent}
            >
              <Trash2 size={10} />
              {t("timeline.detail.deleteEvent")}
            </button>
          </div>
        </div>
      </section>

      {/* 状态快照 */}
      <section>
        <div className="section-label">{t("timeline.detail.characterSnapshot")}</div>
        <StateSnapshotView
          characterSnapshots={characterSnapshots}
          sceneSnapshots={sceneSnapshots}
          className="mt-1"
        />
      </section>

      {/* 时间线绑定 */}
      <section>
        <div className="section-label">{t("timeline.detail.bindings")}</div>
        <div className="flex flex-col gap-2 mt-1">
          {inbound.length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--muted-fg)] mb-1">
                {t("timeline.detail.asTarget")}
              </div>
              {inbound.map((b) => (
                <BindingItem
                  key={b.id}
                  binding={b}
                  direction="inbound"
                  onSelectNode={onSelectNode}
                />
              ))}
            </div>
          )}
          {outbound.length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--muted-fg)] mb-1">
                {t("timeline.detail.asSource")}
              </div>
              {outbound.map((b) => (
                <BindingItem
                  key={b.id}
                  binding={b}
                  direction="outbound"
                  onSelectNode={onSelectNode}
                />
              ))}
            </div>
          )}
          {inbound.length === 0 && outbound.length === 0 && (
            <div className="text-[11px] text-[var(--muted-fg)] py-1">
              {t("timeline.binding.title")}（0）
            </div>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm self-start"
            onClick={onAddBinding}
          >
            <Plus size={10} />
            {t("timeline.detail.addBinding")}
          </button>
        </div>
      </section>
    </div>
  );
}

function BindingItem({
  binding,
  direction,
  onSelectNode,
}: {
  binding: TimelineBindingLike;
  direction: "inbound" | "outbound";
  onSelectNode?: (nodeId: string) => void;
}) {
  const targetNode = direction === "inbound" ? binding.sourceNodeId : binding.targetNodeId;
  return (
    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--card2)] p-1.5">
      <div className="flex items-center gap-1 text-[11px]">
        <span className="text-[var(--muted-fg)]">
          {direction === "inbound" ? "←" : "→"}
        </span>
        <span className="font-medium">{t(`timeline.binding.type.${binding.type}`)}</span>
        <span className="text-[var(--muted-fg)]">
          {direction === "inbound" ? " from " : " to "}
          {targetNode}
        </span>
      </div>
      {binding.injectionText && (
        <div className="text-[10px] text-[var(--muted-fg)] mt-0.5 line-clamp-2">
          {binding.injectionText}
        </div>
      )}
      <button
        type="button"
        className="text-[10px] text-[var(--primary)] hover:underline mt-0.5"
        onClick={() => onSelectNode?.(targetNode)}
      >
        {t("timeline.detail.viewSource")}
      </button>
    </div>
  );
}
