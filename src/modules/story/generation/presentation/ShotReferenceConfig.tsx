import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle } from "lucide-react";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { container } from "@/infrastructure/di";
import type { StoryBeat, ShotReference } from "@/domain/schemas";

interface ShotReferenceConfigProps {
  beat: StoryBeat;
  allShots: StoryBeat[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
}

const directionOptions = [
  { value: "none", label: () => t("shot.noReference") },
  { value: "previous", label: () => t("shot.refPrevious") },
  { value: "next", label: () => t("shot.refNext") },
  { value: "custom", label: () => t("shot.refCustom") },
];

const contentTypeOptions = [
  { value: "full_video", label: () => t("shot.fullVideo") },
  { value: "last_frame", label: () => t("shot.lastFrame") },
  { value: "first_frame", label: () => t("shot.firstFrame") },
  { value: "video_segment", label: () => t("shot.videoSegment") },
];

export function ShotReferenceConfig({
  beat,
  allShots,
  onUpdateBeat,
}: ShotReferenceConfigProps) {
  const [reference, setReference] = useState<ShotReference>(
    beat.reference || {
      direction: "none",
      contentType: "full_video",
    },
  );
  const [validation, setValidation] = useState<{
    valid: boolean;
    error?: string;
    warnings?: string[];
  }>({ valid: true });

  const [prevBeatReference, setPrevBeatReference] = useState(beat.reference);
  if (prevBeatReference !== beat.reference) {
    setPrevBeatReference(beat.reference);
    setReference(beat.reference || {
      direction: "none",
      contentType: "full_video",
    });
  }

  const effectiveValidation = reference.direction === "none"
    ? { valid: true, warnings: [] as string[] }
    : validation;

  const currentIndex = allShots.findIndex((s) => s.id === beat.id);
  const isFirstShot = currentIndex === 0;
  const isLastShot = currentIndex === allShots.length - 1;

  useEffect(() => {
    if (reference.direction === "none") return;
    let cancelled = false;
    container.referenceEngine.then((engine) => {
      if (cancelled) return;
      const result = engine.validateReference(
        beat,
        allShots,
        reference,
      );
      setValidation(result);
    }).catch((err: unknown) => {
      if (!cancelled) {
        errorLogger.warn("[ShotReferenceConfig] 参考验证失败", err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reference, beat, allShots]);

  const handleUpdate = (updates: Partial<ShotReference>) => {
    const base: ShotReference = beat.reference || {
      direction: "none",
      contentType: "full_video",
    };
    const newReference: ShotReference = { ...base, ...updates };
    setReference(newReference);
    onUpdateBeat({ ...beat, reference: newReference });
  };

  const getTargetShot = () => {
    switch (reference.direction) {
      case "previous":
        return currentIndex > 0 ? allShots[currentIndex - 1] : null;
      case "next":
        return currentIndex < allShots.length - 1
          ? allShots[currentIndex + 1]
          : null;
      case "custom":
        return allShots.find((s) => s.id === reference.targetShotId) || null;
      default:
        return null;
    }
  };

  const targetShot = getTargetShot();

  return (
    <div className="space-y-4">
      {(isFirstShot && reference.direction === "previous") ||
      (isLastShot && reference.direction === "next") ? (
        <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4" style={{ color: "var(--warning)" }} />
          <span className="text-sm" style={{ color: "var(--warning)" }}>
            {isFirstShot && reference.direction === "previous"
              ? t("shot.noPreviousBeat")
              : t("shot.noNextBeat")}
          </span>
        </div>
      ) : null}

      <div>
        <label>{t("shot.refDirection")}</label>
        <select
          className="select"
          value={reference.direction}
          onChange={(e) =>
            handleUpdate({ direction: e.target.value as ShotReference["direction"] })
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

      {reference.direction === "custom" && (
        <div>
          <label>{t("shot.selectBeat")}</label>
          <select
            className="select"
            value={reference.targetShotId || ""}
            onChange={(e) =>
              handleUpdate({ targetShotId: e.target.value || undefined })
            }
          >
            <option value="">{t("shot.selectBeatPlaceholder")}</option>
            {allShots
              .filter((s) => s.id !== beat.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {t("shot.beatN", { n: s.sequence })}
                </option>
              ))}
          </select>
        </div>
      )}

      {reference.direction !== "none" && (
        <>
          <div>
            <label>{t("shot.refContent")}</label>
            <select
              className="select"
              value={reference.contentType}
              onChange={(e) =>
                handleUpdate({ contentType: e.target.value as ShotReference["contentType"] })
              }
            >
              {contentTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label()}
                </option>
              ))}
            </select>
          </div>

          {reference.contentType === "video_segment" && (
            <div className="space-y-3">
              <div>
                <label>{t("shot.segmentDuration")}</label>
                <input
                  className="input"
                  type="number"
                  min={0.5}
                  max={beat.duration}
                  step={0.5}
                  value={reference.segmentDuration ?? 2}
                  onChange={(e) =>
                    handleUpdate({
                      segmentDuration: parseFloat(e.target.value) || 2,
                    })
                  }
                />
              </div>
              <div>
                <label>{t("shot.segmentPosition")}</label>
                <select
                  className="select"
                  value={reference.segmentPosition || "end"}
                  onChange={(e) =>
                    handleUpdate({ segmentPosition: e.target.value as "start" | "end" })
                  }
                >
                  <option value="start">{t("common.start")}</option>
                  <option value="end">{t("common.end")}</option>
                </select>
              </div>
            </div>
          )}

          {targetShot && (
            <div className="card" style={{ padding: 16 }}>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {effectiveValidation.valid ? (
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
                    {targetShot.videoGen?.videoUrl ||
                    targetShot.generationResult?.videoUrl ? (
                      <span className="badge badge-info ml-1">
                        {t("shot.generated")}
                      </span>
                    ) : (
                      <span className="badge badge-danger ml-1">
                        {t("shot.notGenerated")}
                      </span>
                    )}
                  </p>
                  {!effectiveValidation.valid && (
                    <p style={{ color: "var(--destructive)" }}>{effectiveValidation.error}</p>
                  )}
                  {effectiveValidation.warnings && effectiveValidation.warnings.length > 0 && (
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
                        {effectiveValidation.warnings.map((w, i) => (
                          <li key={i}>• {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
