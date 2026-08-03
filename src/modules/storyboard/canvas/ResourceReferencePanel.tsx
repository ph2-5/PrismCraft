import { X, MapPin, User } from "lucide-react";
import { t } from "@/shared/constants";
import type { StoryBeat } from "@/domain/schemas";
import type { ResourceKind } from "./types";

interface ResourceReferencePanelProps {
  resourceName: string;
  kind: ResourceKind;
  beats: StoryBeat[];
  referencedBeatIds: string[];
  onSelectBeat: (beatId: string) => void;
  onClose: () => void;
}

/**
 * 引用反查面板：点击资源节点后浮出，列出"被哪些分镜引用"。
 * 数据全部从 beats 派生，无额外存储。
 */
export function ResourceReferencePanel({
  resourceName,
  kind,
  beats,
  referencedBeatIds,
  onSelectBeat,
  onClose,
}: ResourceReferencePanelProps) {
  const Icon = kind === "character" ? User : MapPin;
  const referencedBeats = referencedBeatIds
    .map((id) => beats.find((b) => b.id === id))
    .filter((b): b is StoryBeat => Boolean(b));

  return (
    <div
      className="card"
      role="dialog"
      aria-label={t("storyboard.canvas.beatReferences")}
      style={{
        width: 280,
        maxHeight: 320,
        display: "flex",
        flexDirection: "column",
        padding: 12,
        gap: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          className={`badge ${kind === "character" ? "badge-info" : "badge-success"}`}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon style={{ width: 12, height: 12 }} aria-hidden="true" />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {resourceName}
        </span>
        <button
          className="btn btn-ghost btn-xs"
          onClick={onClose}
          aria-label={t("aria.close")}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
        {t("storyboard.canvas.referencedBy", { count: referencedBeats.length })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {referencedBeats.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--muted-fg)", textAlign: "center", padding: "16px 0" }}>
            {t("storyboard.canvas.noReferences")}
          </div>
        ) : (
          referencedBeats.map((beat) => {
            const index = beats.findIndex((b) => b.id === beat.id);
            return (
              <button
                key={beat.id}
                type="button"
                className="btn btn-outline btn-xs"
                style={{ justifyContent: "flex-start", textAlign: "left" }}
                onClick={() => onSelectBeat(beat.id)}
              >
                <span style={{ opacity: 0.6, fontWeight: 700, marginRight: 6 }}>
                  #{index + 1}
                </span>
                {beat.title || t("beat.shotNumber", { number: index + 1 })}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
