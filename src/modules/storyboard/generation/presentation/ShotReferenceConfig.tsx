import { useState, useEffect } from "react";
import { errorLogger } from "@/shared/error-logger";
import { container } from "@/infrastructure/di";
import type { StoryBeat, ShotReference } from "@/domain/schemas";
import {
  getTargetShot,
  BoundaryWarning,
  DirectionSelect,
  CustomShotSelect,
  ContentTypeSelect,
  SegmentConfig,
  TargetShotCard,
  type ReferenceValidation,
} from "./ShotReferenceConfigParts";

interface ShotReferenceConfigProps {
  beat: StoryBeat;
  allShots: StoryBeat[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
}

const DEFAULT_REFERENCE: ShotReference = {
  direction: "none",
  contentType: "full_video",
};

function createDefaultReference(beat: StoryBeat): ShotReference {
  return beat.reference || DEFAULT_REFERENCE;
}

export function ShotReferenceConfig({
  beat,
  allShots,
  onUpdateBeat,
}: ShotReferenceConfigProps) {
  const [reference, setReference] = useState<ShotReference>(
    createDefaultReference(beat),
  );
  const [validation, setValidation] = useState<ReferenceValidation>({
    valid: true,
  });

  const [prevBeatReference, setPrevBeatReference] = useState(beat.reference);
  if (prevBeatReference !== beat.reference) {
    setPrevBeatReference(beat.reference);
    setReference(createDefaultReference(beat));
  }

  const effectiveValidation: ReferenceValidation =
    reference.direction === "none"
      ? { valid: true, warnings: [] }
      : validation;

  const currentIndex = allShots.findIndex((s) => s.id === beat.id);
  const isFirstShot = currentIndex === 0;
  const isLastShot = currentIndex === allShots.length - 1;

  useEffect(() => {
    if (reference.direction === "none") return;
    let cancelled = false;
    container.referenceEngine.then((engine) => {
      if (cancelled) return;
      const result = engine.validateReference(beat, allShots, reference);
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
    const base = createDefaultReference(beat);
    const newReference: ShotReference = { ...base, ...updates };
    setReference(newReference);
    onUpdateBeat({ ...beat, reference: newReference });
  };

  const targetShot = getTargetShot(reference, allShots, currentIndex);

  const showBoundaryWarning =
    (isFirstShot && reference.direction === "previous") ||
    (isLastShot && reference.direction === "next");

  return (
    <div className="space-y-4">
      <BoundaryWarning show={showBoundaryWarning} isFirstShot={isFirstShot} />

      <DirectionSelect
        value={reference.direction}
        isFirstShot={isFirstShot}
        isLastShot={isLastShot}
        onChange={(direction) => handleUpdate({ direction })}
      />

      {reference.direction === "custom" && (
        <CustomShotSelect
          allShots={allShots}
          currentBeatId={beat.id}
          targetShotId={reference.targetShotId}
          onChange={(targetShotId) => handleUpdate({ targetShotId })}
        />
      )}

      {reference.direction !== "none" && (
        <>
          <ContentTypeSelect
            value={reference.contentType}
            onChange={(contentType) => handleUpdate({ contentType })}
          />

          {reference.contentType === "video_segment" && (
            <SegmentConfig
              maxDuration={beat.duration}
              segmentDuration={reference.segmentDuration}
              segmentPosition={reference.segmentPosition}
              onUpdate={handleUpdate}
            />
          )}

          {targetShot && (
            <TargetShotCard
              targetShot={targetShot}
              validation={effectiveValidation}
            />
          )}
        </>
      )}
    </div>
  );
}
