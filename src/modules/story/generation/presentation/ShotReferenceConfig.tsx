import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
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
    ? { valid: true }
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
        <Label>{t("shot.refDirection")}</Label>
        <Select
          value={reference.direction}
          onValueChange={(value) =>
            handleUpdate({ direction: value as ShotReference["direction"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {directionOptions.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                disabled={
                  (opt.value === "previous" && isFirstShot) ||
                  (opt.value === "next" && isLastShot)
                }
              >
                {opt.label()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reference.direction === "custom" && (
        <div>
          <Label>{t("shot.selectBeat")}</Label>
          <Select
            value={reference.targetShotId || ""}
            onValueChange={(value) =>
              handleUpdate({ targetShotId: value || undefined })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("shot.selectBeatPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {allShots
                .filter((s) => s.id !== beat.id)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {t("shot.beatN", { n: s.sequence })}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {reference.direction !== "none" && (
        <>
          <div>
            <Label>{t("shot.refContent")}</Label>
            <Select
              value={reference.contentType}
              onValueChange={(value) =>
                handleUpdate({ contentType: value as ShotReference["contentType"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contentTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reference.contentType === "video_segment" && (
            <div className="space-y-3">
              <div>
                <Label>{t("shot.segmentDuration")}</Label>
                <Input
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
                <Label>{t("shot.segmentPosition")}</Label>
                <Select
                  value={reference.segmentPosition || "end"}
                  onValueChange={(value) =>
                    handleUpdate({ segmentPosition: value as "start" | "end" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="start">{t("common.start")}</SelectItem>
                    <SelectItem value="end">{t("common.end")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {targetShot && (
            <Card>
              <CardContent className="p-4">
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
                      <Badge variant="default" className="ml-1">
                        {t("shot.generated")}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="ml-1">
                        {t("shot.notGenerated")}
                      </Badge>
                    )}
                  </p>
                  {!effectiveValidation.valid && (
                    <p style={{ color: "var(--destructive)" }}>{effectiveValidation.error}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
