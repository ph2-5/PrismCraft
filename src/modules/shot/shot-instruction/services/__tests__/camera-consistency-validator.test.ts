import { describe, it, expect } from "vitest";
import {
  validateCameraConsistency,
} from "../camera-consistency-validator";
import type { ShotInstruction, BeatCamera } from "@/domain/schemas";

function makeBeat(overrides: {
  shotInstruction?: ShotInstruction;
  camera?: BeatCamera;
} = {}): { shotInstruction?: ShotInstruction; camera?: BeatCamera } {
  return overrides;
}

describe("validateCameraConsistency", () => {
  it("空 beats 应返回 valid=true 且无 issues", () => {
    const result = validateCameraConsistency({ beats: [] });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("单个 beat 无前驱应不检查 relationType 规则", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
          camera: {
            relationType: "contrast",
            transitionType: "cut",
          },
        }),
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("relationType=contrast 但角度和运镜完全相同应产生 warning", () => {
    const instruction: ShotInstruction = {
      shotSize: "medium",
      cameraMovement: "push",
      cameraAngle: "eye_level",
    };

    const result = validateCameraConsistency({
      beats: [
        makeBeat({ shotInstruction: instruction }),
        makeBeat({
          shotInstruction: instruction,
          camera: { relationType: "contrast" },
        }),
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.severity).toBe("warning");
    expect(result.issues[0]!.message).toContain("对比镜头应使用不同的角度或运镜");
    expect(result.issues[0]!.beatIndex).toBe(1);
  });

  it("relationType=contrast 且角度不同应不产生 warning", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "push",
            cameraAngle: "eye_level",
          },
        }),
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "push",
            cameraAngle: "low",
          },
          camera: { relationType: "contrast" },
        }),
      ],
    });

    expect(result.issues).toHaveLength(0);
  });

  it("relationType=continuous 且 transitionType=cut 应产生 warning", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "push",
            cameraAngle: "eye_level",
          },
        }),
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "push",
            cameraAngle: "eye_level",
          },
          camera: { relationType: "continuous", transitionType: "cut" },
        }),
      ],
    });

    expect(result.issues).toHaveLength(1);
    const transitionIssue = result.issues.find((i) => i.field === "transitionType");
    expect(transitionIssue).toBeDefined();
    expect(transitionIssue!.message).toContain("连续镜头通常使用 dissolve 而非 cut 转场");
  });

  it("relationType=continuous 且 transitionType=dissolve 应不产生 warning", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "push",
            cameraAngle: "eye_level",
          },
        }),
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "push",
            cameraAngle: "low",
          },
          camera: { relationType: "continuous", transitionType: "dissolve" },
        }),
      ],
    });

    expect(result.issues).toHaveLength(0);
  });

  it("relationType=fade 且 transitionType 不是 fade 或 dissolve 应产生 warning", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
        }),
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
          camera: { relationType: "fade", transitionType: "cut" },
        }),
      ],
    });

    const fadeIssue = result.issues.find((i) => i.field === "transitionType" && i.message.includes("淡入淡出"));
    expect(fadeIssue).toBeDefined();
    expect(fadeIssue!.severity).toBe("warning");
  });

  it("relationType=fade 且 transitionType=fade 应不产生 warning", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
        }),
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
          camera: { relationType: "fade", transitionType: "fade" },
        }),
      ],
    });

    const fadeIssue = result.issues.find((i) => i.message.includes("淡入淡出"));
    expect(fadeIssue).toBeUndefined();
  });

  it("relationType=fade 且 transitionType=dissolve 应不产生 warning", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
        }),
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
          camera: { relationType: "fade", transitionType: "dissolve" },
        }),
      ],
    });

    const fadeIssue = result.issues.find((i) => i.message.includes("淡入淡出"));
    expect(fadeIssue).toBeUndefined();
  });

  it("shotInstruction.cameraMovement=static 但 camera.movement 不是 static 应产生 warning", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
          camera: { movement: "push" },
        }),
      ],
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.message).toContain("分镜指令指定静态镜头，但 beatCamera 指定了运镜");
    expect(result.issues[0]!.beatIndex).toBe(0);
  });

  it("shotInstruction.cameraMovement=static 且 camera.movement=static 应不产生 warning", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
          camera: { movement: "static" },
        }),
      ],
    });

    const staticIssue = result.issues.find((i) => i.message.includes("静态镜头"));
    expect(staticIssue).toBeUndefined();
  });

  it("多个问题应同时返回", () => {
    const instruction: ShotInstruction = {
      shotSize: "medium",
      cameraMovement: "push",
      cameraAngle: "eye_level",
    };

    const result = validateCameraConsistency({
      beats: [
        makeBeat({ shotInstruction: instruction }),
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
          camera: { relationType: "contrast", movement: "push" },
        }),
      ],
    });

    // Rule 1: contrast with same angle and movement (push vs static is different, so no rule 1)
    // Rule 4: shotInstruction.cameraMovement=static but camera.movement=push
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
    const staticIssue = result.issues.find((i) => i.message.includes("静态镜头"));
    expect(staticIssue).toBeDefined();
  });

  it("relationType=fade 但无 transitionType 应不产生 warning", () => {
    const result = validateCameraConsistency({
      beats: [
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
        }),
        makeBeat({
          shotInstruction: {
            shotSize: "medium",
            cameraMovement: "static",
            cameraAngle: "eye_level",
          },
          camera: { relationType: "fade" },
        }),
      ],
    });

    const fadeIssue = result.issues.find((i) => i.message.includes("淡入淡出"));
    expect(fadeIssue).toBeUndefined();
  });
});
