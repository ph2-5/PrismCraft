import type { ShotReference, StoryBeat } from "@/domain/schemas";

export interface ReferenceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateReference(
  reference: ShotReference,
  beats: StoryBeat[],
  currentBeatId: string,
): ReferenceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (reference.direction === "none") {
    return { valid: true, errors: [], warnings: [] };
  }

  if (reference.direction === "custom" && !reference.targetShotId) {
    errors.push("自定义引用必须指定目标镜头");
  }

  if (reference.direction === "previous") {
    const currentIndex = beats.findIndex((b) => b.id === currentBeatId);
    if (currentIndex <= 0) {
      errors.push("第一个镜头无法引用前一个镜头");
    }
  }

  if (reference.direction === "next") {
    const currentIndex = beats.findIndex((b) => b.id === currentBeatId);
    if (currentIndex === -1 || currentIndex >= beats.length - 1) {
      errors.push("最后一个镜头无法引用后一个镜头");
    }
  }

  if (reference.targetShotId) {
    const targetExists = beats.some((b) => b.id === reference.targetShotId);
    if (!targetExists) {
      errors.push(`目标镜头 ${reference.targetShotId} 不存在`);
    }

    if (reference.targetShotId === currentBeatId) {
      errors.push("不能引用自身");
    }
  }

  if (
    reference.contentType === "video_segment" &&
    (!reference.segmentDuration || reference.segmentDuration <= 0)
  ) {
    errors.push("视频片段引用必须指定片段时长");
  }

  if (reference.direction === "previous") {
    const currentIndex = beats.findIndex((b) => b.id === currentBeatId);
    if (currentIndex > 0) {
      const prevBeat = beats[currentIndex - 1]!;
      if (
        reference.contentType === "last_frame" &&
        !prevBeat.framePair?.lastFrameUrl &&
        !prevBeat.keyframe?.imageUrl
      ) {
        warnings.push("前一个镜头没有末帧图片，引用可能无效");
      }
      if (
        reference.contentType === "full_video" &&
        !prevBeat.videoGen?.videoUrl
      ) {
        warnings.push("前一个镜头没有视频，引用可能无效");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function getTargetShot(
  reference: ShotReference,
  beats: StoryBeat[],
  currentBeatId: string,
): StoryBeat | null {
  if (reference.direction === "none") return null;

  const currentIndex = beats.findIndex((b) => b.id === currentBeatId);

  switch (reference.direction) {
    case "previous":
      if (currentIndex > 0) return beats[currentIndex - 1]!;
      return null;

    case "next":
      if (currentIndex >= 0 && currentIndex < beats.length - 1) return beats[currentIndex + 1]!;
      return null;

    case "custom":
      if (reference.targetShotId) {
        return beats.find((b) => b.id === reference.targetShotId) || null;
      }
      return null;

    default:
      return null;
  }
}

export function getReferenceVideoUrl(
  reference: ShotReference,
  beats: StoryBeat[],
  currentBeatId: string,
): string | null {
  const targetBeat = getTargetShot(reference, beats, currentBeatId);
  if (!targetBeat) return null;

  switch (reference.contentType) {
    case "full_video":
      return targetBeat.videoGen?.videoUrl || null;

    case "last_frame":
      return targetBeat.framePair?.lastFrameUrl || targetBeat.keyframe?.imageUrl || null;

    case "first_frame":
      return targetBeat.framePair?.firstFrameUrl || targetBeat.keyframe?.imageUrl || null;

    case "video_segment":
      return targetBeat.videoGen?.videoUrl || null;

    default:
      return null;
  }
}

export function buildReferenceDescription(
  reference: ShotReference,
  beats: StoryBeat[],
  currentBeatId: string,
): string {
  if (reference.direction === "none") return "无引用";

  const targetBeat = getTargetShot(reference, beats, currentBeatId);
  const targetDesc = targetBeat
    ? `"${targetBeat.title || targetBeat.description?.slice(0, 20) || "未命名"}"`
    : "未知镜头";

  const directionMap: Record<string, string> = {
    previous: "前一镜头",
    next: "后一镜头",
    custom: "自定义镜头",
  };

  const contentMap: Record<string, string> = {
    full_video: "完整视频",
    last_frame: "末帧图片",
    first_frame: "首帧图片",
    video_segment: "视频片段",
  };

  const parts = [
    directionMap[reference.direction] || reference.direction,
    targetDesc,
    contentMap[reference.contentType] || reference.contentType,
  ];

  if (reference.segmentDuration) {
    parts.push(`(${reference.segmentDuration}秒)`);
  }

  return parts.join(" → ");
}
