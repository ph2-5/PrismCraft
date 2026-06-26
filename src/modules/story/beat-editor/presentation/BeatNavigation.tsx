import { t } from "@/shared/constants";
import { SHOT_SIZE_OPTIONS, CAMERA_MOVEMENT_OPTIONS } from "@/modules/shot";
import type { StoryBeat, ShotInstructionTemplate } from "@/domain/schemas";
import { confirm } from "@/shared/utils/confirm";
import { errorLogger } from "@/shared/error-logger";

interface BeatNavigationProps {
  beat: StoryBeat;
  index: number;
  totalBeats: number;
  onPrevBeat: () => void;
  onNextBeat: () => void;
  onMoveBeat?: (beatId: string, direction: "up" | "down") => void;
  onDeleteBeat: () => void;
}

export function BeatNavigation({
  beat,
  index,
  totalBeats,
  onPrevBeat,
  onNextBeat,
  onMoveBeat,
  onDeleteBeat,
}: BeatNavigationProps) {
  const currentInstruction: ShotInstructionTemplate = beat.shotInstruction || {
    shotSize: "medium" as ShotInstructionTemplate["shotSize"],
    cameraMovement: "static" as ShotInstructionTemplate["cameraMovement"],
    cameraAngle: "eye_level" as ShotInstructionTemplate["cameraAngle"],
  };

  const shotSizeLabel = (() => {
    const option = SHOT_SIZE_OPTIONS.find((o) => o.value === currentInstruction.shotSize);
    return option ? t(option.labelKey) : "";
  })();

  const cameraMovementLabel = (() => {
    const option = CAMERA_MOVEMENT_OPTIONS.find((o) => o.value === currentInstruction.cameraMovement);
    return option ? t(option.labelKey) : "";
  })();

  const durationLabel = beat.duration ?? 0;

  const handleDeleteClick = async () => {
    try {
      const confirmed = await confirm({
        title: t("beat.deleteBeatTitle"),
        description: t("beat.deleteBeatDesc"),
        confirmText: t("common.delete"),
        variant: "danger",
      });
      if (confirmed) onDeleteBeat();
    } catch (err) {
      errorLogger.warn("[BeatDetailEditor] confirm dialog error", err);
    }
  };

  const handleMoveUp = () => {
    if (onMoveBeat && index > 0) {
      onMoveBeat(beat.id, "up");
    }
  };

  const handleMoveDown = () => {
    if (onMoveBeat && index < totalBeats - 1) {
      onMoveBeat(beat.id, "down");
    }
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}
    >
      <div className="toolbar">
        <span
          className="badge badge-info"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {beat.title || t("beat.shotNumber", { number: index + 1 })}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {shotSizeLabel}
          {cameraMovementLabel ? ` · ${cameraMovementLabel}` : ""}
          {` · ${durationLabel}${t("beat.seconds")}`}
        </span>
      </div>
      <div className="toolbar">
        <button
          className="btn btn-outline btn-xs"
          onClick={onPrevBeat}
          disabled={index === 0}
          aria-label={t("aria.prevBeat")}
        >
          ←
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={onNextBeat}
          disabled={index === totalBeats - 1}
          aria-label={t("aria.nextBeat")}
        >
          →
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={handleMoveUp}
          disabled={index === 0}
          aria-label={t("aria.moveUpBeat")}
        >
          ↑
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={handleMoveDown}
          disabled={index === totalBeats - 1}
          aria-label={t("aria.moveDownBeat")}
        >
          ↓
        </button>
        <button
          className="btn btn-danger btn-xs"
          onClick={handleDeleteClick}
          aria-label={t("common.delete")}
        >
          <span aria-hidden="true">🗑</span>
        </button>
      </div>
    </div>
  );
}
