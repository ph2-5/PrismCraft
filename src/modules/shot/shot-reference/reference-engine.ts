import type { ShotReference, StoryBeat } from "@/domain/schemas";
import { t } from "@/shared/constants";

export class ReferenceEngine {
  validateReference(
    shot: StoryBeat,
    allShots: StoryBeat[],
    reference: ShotReference,
  ): { valid: boolean; error?: string } {
    if (
      reference.direction === "custom" &&
      reference.targetShotId
    ) {
      const targetShot = allShots.find((s) => s.id === reference.targetShotId);
      if (!targetShot) {
        return { valid: false, error: t("shot.refTargetNotFound") };
      }
    }

    const targetShot = this.getTargetShot(shot, allShots, reference);
    if (!targetShot) {
      return { valid: false, error: t("shot.refNotFound") };
    }
    if (
      !targetShot.videoGen?.videoUrl &&
      !targetShot.generationResult?.videoUrl
    ) {
      return { valid: false, error: t("shot.refVideoNotGenerated") };
    }

    if (reference.contentType === "video_segment") {
      if (!reference.segmentDuration || reference.segmentDuration <= 0) {
        return { valid: false, error: t("shot.refSegmentDurationRequired") };
      }
      if (reference.segmentDuration > (targetShot.duration ?? 0)) {
        return { valid: false, error: t("shot.refSegmentDurationExceeds") };
      }
    }

    return { valid: true };
  }

  getTargetShot(
    shot: StoryBeat,
    allShots: StoryBeat[],
    reference: ShotReference,
  ): StoryBeat | undefined {
    switch (reference.direction) {
      case "previous": {
        const currentIndex = allShots.findIndex((s) => s.id === shot.id);
        return currentIndex > 0 ? allShots[currentIndex - 1] : undefined;
      }
      case "next": {
        const currentIndex = allShots.findIndex((s) => s.id === shot.id);
        return currentIndex < allShots.length - 1
          ? allShots[currentIndex + 1]
          : undefined;
      }
      case "custom":
        return allShots.find((s) => s.id === reference.targetShotId);
      default:
        return undefined;
    }
  }

  getReferenceVideoUrl(
    shot: StoryBeat,
    allShots: StoryBeat[],
    reference: ShotReference,
  ): string | undefined {
    const targetShot = this.getTargetShot(shot, allShots, reference);
    if (!targetShot) return undefined;

    const videoUrl =
      targetShot.videoGen?.videoUrl || targetShot.generationResult?.videoUrl;
    if (!videoUrl) return undefined;

    switch (reference.contentType) {
      case "full_video":
        return videoUrl;
      case "last_frame":
        return targetShot.generationResult?.lastFrameUrl;
      case "first_frame":
        return targetShot.generationResult?.firstFrameUrl;
      case "video_segment":
        return videoUrl;
      default:
        return undefined;
    }
  }

  buildReferenceDescription(
    shot: StoryBeat,
    allShots: StoryBeat[],
    reference: ShotReference,
  ): string {
    const targetShot = this.getTargetShot(shot, allShots, reference);
    if (!targetShot) return "";

    const targetSequence = targetShot.sequence;
    const directionText =
      reference.direction === "previous"
        ? "上一分镜"
        : reference.direction === "next"
          ? "下一分镜"
          : `第${targetSequence}分镜`;

    const contentText =
      reference.contentType === "full_video"
        ? "完整视频"
        : reference.contentType === "last_frame"
          ? "结尾画面"
          : reference.contentType === "first_frame"
            ? "开头画面"
            : `${reference.segmentDuration}秒片段`;

    return `引用${directionText}的${contentText}`;
  }
}

export const referenceEngine = new ReferenceEngine();
