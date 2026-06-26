export const ReferenceDirection = {
  None: "none",
  Previous: "previous",
  Next: "next",
  Custom: "custom",
} as const;

export type ReferenceDirectionType =
  (typeof ReferenceDirection)[keyof typeof ReferenceDirection];

export const ReferenceContentType = {
  FullVideo: "full_video",
  LastFrame: "last_frame",
  FirstFrame: "first_frame",
  VideoSegment: "video_segment",
} as const;

export type ReferenceContentTypeType =
  (typeof ReferenceContentType)[keyof typeof ReferenceContentType];

export interface Shot {
  id: string;
  sequence?: number;
  duration?: number;
  videoGen?: { videoUrl?: string };
  generationResult?: {
    videoUrl?: string;
    lastFrameUrl?: string;
    firstFrameUrl?: string;
  };
}

export interface Reference {
  direction: ReferenceDirectionType;
  contentType?: ReferenceContentTypeType;
  targetShotId?: string;
  segmentDuration?: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateReference(
  shot: Shot,
  allShots: Shot[],
  reference: Reference,
): ValidationResult {
  if (
    reference.direction === ReferenceDirection.Custom &&
    reference.targetShotId
  ) {
    const targetShot = allShots.find((s) => s.id === reference.targetShotId);
    if (!targetShot) {
      return { valid: false, error: "Referenced shot does not exist" };
    }
  }

  const targetShot = getTargetShot(shot, allShots, reference);
  if (!targetShot) {
    return { valid: false, error: "Cannot find referenced shot" };
  }
  if (
    !(targetShot.videoGen && targetShot.videoGen.videoUrl) &&
    !(targetShot.generationResult && targetShot.generationResult.videoUrl)
  ) {
    return { valid: false, error: "Referenced shot has not generated video" };
  }

  if (reference.contentType === ReferenceContentType.VideoSegment) {
    if (!reference.segmentDuration || reference.segmentDuration <= 0) {
      return { valid: false, error: "Please set reference segment duration" };
    }
    if (reference.segmentDuration > (targetShot.duration ?? 0)) {
      return { valid: false, error: "Reference segment duration cannot exceed shot duration" };
    }
  }

  return { valid: true };
}

export function getTargetShot(
  shot: Shot,
  allShots: Shot[],
  reference: Reference,
): Shot | undefined {
  switch (reference.direction) {
    case ReferenceDirection.Previous: {
      const currentIndex = allShots.findIndex((s) => s.id === shot.id);
      return currentIndex > 0 ? allShots[currentIndex - 1] : undefined;
    }
    case ReferenceDirection.Next: {
      const currentIndex = allShots.findIndex((s) => s.id === shot.id);
      return currentIndex < allShots.length - 1
        ? allShots[currentIndex + 1]
        : undefined;
    }
    case ReferenceDirection.Custom:
      return allShots.find((s) => s.id === reference.targetShotId);
    default:
      return undefined;
  }
}

export function getReferenceVideoUrl(
  shot: Shot,
  allShots: Shot[],
  reference: Reference,
): string | undefined {
  const targetShot = getTargetShot(shot, allShots, reference);
  if (!targetShot) return undefined;

  const videoUrl =
    (targetShot.videoGen && targetShot.videoGen.videoUrl) ||
    (targetShot.generationResult && targetShot.generationResult.videoUrl);
  if (!videoUrl) return undefined;

  switch (reference.contentType) {
    case ReferenceContentType.FullVideo:
      return videoUrl;
    case ReferenceContentType.LastFrame:
      return targetShot.generationResult?.lastFrameUrl;
    case ReferenceContentType.FirstFrame:
      return targetShot.generationResult?.firstFrameUrl;
    case ReferenceContentType.VideoSegment:
      return videoUrl;
    default:
      return undefined;
  }
}

export function buildReferenceDescription(
  shot: Shot,
  allShots: Shot[],
  reference: Reference,
): string {
  const targetShot = getTargetShot(shot, allShots, reference);
  if (!targetShot) return "";

  const targetSequence = targetShot.sequence;
  const directionText =
    reference.direction === ReferenceDirection.Previous
      ? "previous shot"
      : reference.direction === ReferenceDirection.Next
        ? "next shot"
        : `shot ${targetSequence}`;

  const contentText =
    reference.contentType === ReferenceContentType.FullVideo
      ? "full video"
      : reference.contentType === ReferenceContentType.LastFrame
        ? "last frame"
        : reference.contentType === ReferenceContentType.FirstFrame
          ? "first frame"
          : `${reference.segmentDuration}s segment`;

  return `Reference ${directionText} ${contentText}`;
}
