import {
  recommendShotBySceneVariant,
  type ShotRecommendation,
  type SceneVariantInput,
} from "@/shared-logic/shot/mood-shot-mapping";
import { SHOT_SIZE_OPTIONS, CAMERA_MOVEMENT_OPTIONS, CAMERA_ANGLE_OPTIONS } from "@/domain/utils/shot-prompt";
import type { ShotInstructionTemplate } from "@/domain/schemas";

export { recommendShotBySceneVariant } from "@/shared-logic/shot/mood-shot-mapping";
export type { ShotRecommendation, SceneVariantInput } from "@/shared-logic/shot/mood-shot-mapping";

/**
 * 将推荐结果转换为 ShotInstructionTemplate（可直接应用到 StoryBeat.shotInstruction）。
 */
export function recommendationToShotInstruction(
  rec: ShotRecommendation,
): ShotInstructionTemplate {
  return {
    shotSize: rec.recommendedShotSize,
    cameraMovement: rec.recommendedCameraMovement,
    cameraAngle: rec.recommendedCameraAngle,
  };
}

/**
 * 获取推荐值的中文标签（用于 UI 显示）。
 */
export function getRecommendationLabels(rec: ShotRecommendation): {
  shotSizeLabel: string;
  cameraMovementLabel: string;
  cameraAngleLabel: string;
} {
  const shotSizeLabel = SHOT_SIZE_OPTIONS.find((o) => o.value === rec.recommendedShotSize)?.label ?? rec.recommendedShotSize;
  const cameraMovementLabel = CAMERA_MOVEMENT_OPTIONS.find((o) => o.value === rec.recommendedCameraMovement)?.label ?? rec.recommendedCameraMovement;
  const cameraAngleLabel = CAMERA_ANGLE_OPTIONS.find((o) => o.value === rec.recommendedCameraAngle)?.label ?? rec.recommendedCameraAngle;
  return { shotSizeLabel, cameraMovementLabel, cameraAngleLabel };
}

/**
 * 便捷封装：从场景变体直接得到可应用的 ShotInstructionTemplate。
 * 等价于 recommendationToShotInstruction(recommendShotBySceneVariant(variant))。
 */
export function recommendShotInstruction(variant: SceneVariantInput): ShotInstructionTemplate {
  return recommendationToShotInstruction(recommendShotBySceneVariant(variant));
}
