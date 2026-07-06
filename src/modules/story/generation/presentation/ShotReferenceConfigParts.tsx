import { AlertCircle, CheckCircle } from "lucide-react";
import { t } from "@/shared/constants";
import type { ShotReference, StoryBeat } from "@/domain/schemas";

export const directionOptions = [
  { value: "none", label: () => t("shot.noReference") },
  { value: "previous", label: () => t("shot.refPrevious") },
  { value: "next", label: () => t("shot.refNext") },
  { value: "custom", label: () => t("shot.refCustom") },
] as const;

export const contentTypeOptions = [
  { value: "full_video", label: () => t("shot.fullVideo") },
  { value: "last_frame", label: () => t("shot.lastFrame") },
  { value: "first_frame", label: () => t("shot.firstFrame") },
  { value: "video_segment", label: () => t("shot.videoSegment") },
] as const;

export function getTargetShot(
  reference: ShotReference,
  allShots: StoryBeat[],
  currentIndex: number,
): StoryBeat | null {
  switch (reference.direction) {
    case "previous":
      return currentIndex > 0 ? allShots[currentIndex - 1] ?? null : null;
    case "next":
      return currentIndex < allShots.length - 1
        ? allShots[currentIndex + 1] ?? null
        : null;
    case "custom":
      return allShots.find((s) => s.id === reference.targetShotId) ?? null;
    default:
      return null;
  }
}

interface BoundaryWarningProps {
  show: boolean;
  isFirstShot: boolean;
}

export function BoundaryWarning({ show, isFirstShot }: BoundaryWarningProps) {
  if (!show) return null;
  return (
    <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <AlertCircle className="w-4 h-4" style={{ color: "var(--warning)" }} />
      <span className="text-sm" style={{ color: "var(--warning)" }}>
        {isFirstShot ? t("shot.noPreviousBeat") : t("shot.noNextBeat")}
      </span>
    </div>
  );
}

interface DirectionSelectProps {
  value: ShotReference["direction"];
  isFirstShot: boolean;
  isLastShot: boolean;
  onChange: (direction: ShotReference["direction"]) => void;
}

export function DirectionSelect({
  value,
  isFirstShot,
  isLastShot,
  onChange,
}: DirectionSelectProps) {
  return (
    <div>
      <label>{t("shot.refDirection")}</label>
      <select
        className="select"
        value={value}
        onChange={(e) =>
          onChange(e.target.value as ShotReference["direction"])
        }
      >
        {directionOptions.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            disabled={
              (opt.value === "previous" && isFirstShot) ||
              (opt.value === "next" && isLastShot)
            }
          >
            {opt.label()}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CustomShotSelectProps {
  allShots: StoryBeat[];
  currentBeatId: string;
  targetShotId?: string;
  onChange: (targetShotId: string | undefined) => void;
}

export function CustomShotSelect({
  allShots,
  currentBeatId,
  targetShotId,
  onChange,
}: CustomShotSelectProps) {
  return (
    <div>
      <label>{t("shot.selectBeat")}</label>
      <select
        className="select"
        value={targetShotId || ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">{t("shot.selectBeatPlaceholder")}</option>
        {allShots
          .filter((s) => s.id !== currentBeatId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {t("shot.beatN", { n: s.sequence })}
            </option>
          ))}
      </select>
    </div>
  );
}

interface ContentTypeSelectProps {
  value: ShotReference["contentType"];
  onChange: (contentType: ShotReference["contentType"]) => void;
}

export function ContentTypeSelect({
  value,
  onChange,
}: ContentTypeSelectProps) {
  return (
    <div>
      <label>{t("shot.refContent")}</label>
      <select
        className="select"
        value={value}
        onChange={(e) =>
          onChange(e.target.value as ShotReference["contentType"])
        }
      >
        {contentTypeOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label()}
          </option>
        ))}
      </select>
    </div>
  );
}

interface SegmentConfigProps {
  maxDuration?: number;
  segmentDuration?: number;
  segmentPosition?: "start" | "end";
  onUpdate: (updates: Partial<ShotReference>) => void;
}

export function SegmentConfig({
  maxDuration,
  segmentDuration,
  segmentPosition,
  onUpdate,
}: SegmentConfigProps) {
  return (
    <div className="space-y-3">
      <div>
        <label>{t("shot.segmentDuration")}</label>
        <input
          className="input"
          type="number"
          min={0.5}
          max={maxDuration}
          step={0.5}
          value={segmentDuration ?? 2}
          onChange={(e) =>
            onUpdate({
              segmentDuration: parseFloat(e.target.value) || 2,
            })
          }
        />
      </div>
      <div>
        <label>{t("shot.segmentPosition")}</label>
        <select
          className="select"
          value={segmentPosition || "end"}
          onChange={(e) =>
            onUpdate({ segmentPosition: e.target.value as "start" | "end" })
          }
        >
          <option value="start">{t("common.start")}</option>
          <option value="end">{t("common.end")}</option>
        </select>
      </div>
    </div>
  );
}

export interface ReferenceValidation {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

interface TargetShotCardProps {
  targetShot: StoryBeat;
  validation: ReferenceValidation;
}

export function TargetShotCard({ targetShot, validation }: TargetShotCardProps) {
  const hasVideo =
    targetShot.videoGen?.videoUrl || targetShot.generationResult?.videoUrl;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div>
        <div className="flex items-center gap-2 mb-2">
          {validation.valid ? (
            <CheckCircle className="w-4 h-4" style={{ color: "var(--success)" }} />
          ) : (
            <AlertCircle className="w-4 h-4" style={{ color: "var(--destructive)" }} />
          )}
          <span className="font-medium">{t("shot.refInfo")}</span>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>{t("shot.targetBeatN", { n: targetShot.sequence })}</p>
          <p>
            {t("shot.genStatus")}
            {hasVideo ? (
              <span className="badge badge-info ml-1">
                {t("shot.generated")}
              </span>
            ) : (
              <span className="badge badge-danger ml-1">
                {t("shot.notGenerated")}
              </span>
            )}
          </p>
          {!validation.valid && (
            <p style={{ color: "var(--destructive)" }}>{validation.error}</p>
          )}
          {validation.warnings && validation.warnings.length > 0 && (
            <div
              className="mt-2 p-2 rounded-lg border"
              style={{
                backgroundColor: "var(--warning-bg, rgba(234, 179, 8, 0.1))",
                borderColor: "var(--warning-border, rgba(234, 179, 8, 0.3))",
              }}
            >
              <p className="text-sm font-medium mb-1" style={{ color: "var(--warning)" }}>
                {t("shot.refWarningsTitle")}
              </p>
              <ul className="text-sm space-y-1" style={{ color: "var(--warning)" }}>
                {validation.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
