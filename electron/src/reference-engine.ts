/**
 * @deprecated 此模块与 src/ 中的实现重复，计划迁移到共享服务层。
 * 对应的 src/ 实现: src/modules/shot/shot-reference/reference-engine.ts
 * 参见: src/infrastructure/server/ 用于服务端共享逻辑
 */
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
      return { valid: false, error: "引用的分镜不存在" };
    }
  }

  const targetShot = getTargetShot(shot, allShots, reference);
  if (!targetShot) {
    return { valid: false, error: "无法找到引用的分镜" };
  }
  if (
    !(targetShot.videoGen && targetShot.videoGen.videoUrl) &&
    !(targetShot.generationResult && targetShot.generationResult.videoUrl)
  ) {
    return { valid: false, error: "被引用的分镜尚未生成视频" };
  }

  if (reference.contentType === ReferenceContentType.VideoSegment) {
    if (!reference.segmentDuration || reference.segmentDuration <= 0) {
      return { valid: false, error: "请设置引用片段时长" };
    }
    if (reference.segmentDuration > (targetShot.duration ?? 0)) {
      return { valid: false, error: "引用片段时长不能超过分镜时长" };
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
      ? "上一分镜"
      : reference.direction === ReferenceDirection.Next
        ? "下一分镜"
        : `第${targetSequence}分镜`;

  const contentText =
    reference.contentType === ReferenceContentType.FullVideo
      ? "完整视频"
      : reference.contentType === ReferenceContentType.LastFrame
        ? "结尾画面"
        : reference.contentType === ReferenceContentType.FirstFrame
          ? "开头画面"
          : `${reference.segmentDuration}秒片段`;

  return `引用${directionText}的${contentText}`;
}
