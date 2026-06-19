import type { ShotInstruction, BeatCamera } from "@/domain/schemas";

export interface CameraConsistencyIssue {
  beatIndex: number;
  field: string;
  message: string;
  severity: "warning" | "error";
}

export interface CameraConsistencyResult {
  valid: boolean;
  issues: CameraConsistencyIssue[];
}

/**
 * 校验 beatCamera 与 shotInstruction 的一致性
 * 检查相邻分镜的镜头参数是否与 relationType 矛盾
 */
export function validateCameraConsistency(params: {
  beats: Array<{
    shotInstruction?: ShotInstruction;
    camera?: BeatCamera;
  }>;
}): CameraConsistencyResult {
  const issues: CameraConsistencyIssue[] = [];
  const { beats } = params;

  for (let i = 0; i < beats.length; i++) {
    const current = beats[i]!;
    const prev = i > 0 ? beats[i - 1] : undefined;

    // Rule 4: shotInstruction.cameraMovement = "static" but camera.movement has a non-"static" value
    if (
      current.shotInstruction?.cameraMovement === "static" &&
      current.camera?.movement &&
      current.camera.movement !== "static"
    ) {
      issues.push({
        beatIndex: i,
        field: "cameraMovement",
        message: "分镜指令指定静态镜头，但 beatCamera 指定了运镜",
        severity: "warning",
      });
    }

    if (!prev || !current.camera?.relationType) continue;

    const relationType = current.camera.relationType;
    const transitionType = current.camera.transitionType;

    // Rule 1: relationType = "contrast" but same cameraAngle and cameraMovement as previous
    if (relationType === "contrast" && prev.shotInstruction && current.shotInstruction) {
      const sameAngle = prev.shotInstruction.cameraAngle === current.shotInstruction.cameraAngle;
      const sameMovement = prev.shotInstruction.cameraMovement === current.shotInstruction.cameraMovement;

      if (sameAngle && sameMovement) {
        issues.push({
          beatIndex: i,
          field: "relationType",
          message: "对比镜头应使用不同的角度或运镜",
          severity: "warning",
        });
      }
    }

    // Rule 2: relationType = "continuous" but transitionType = "cut"
    if (relationType === "continuous" && transitionType === "cut") {
      issues.push({
        beatIndex: i,
        field: "transitionType",
        message: "连续镜头通常使用 dissolve 而非 cut 转场",
        severity: "warning",
      });
    }

    // Rule 3: relationType = "fade" but transitionType is not "fade" or "dissolve"
    if (relationType === "fade" && transitionType && transitionType !== "fade" && transitionType !== "dissolve") {
      issues.push({
        beatIndex: i,
        field: "transitionType",
        message: "淡入淡出镜头应使用 fade 或 dissolve 转场",
        severity: "warning",
      });
    }
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}
