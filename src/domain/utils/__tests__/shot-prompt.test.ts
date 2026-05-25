import { describe, it, expect } from "vitest";
import {
  shotInstructionToPrompt,
  SHOT_SIZE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
} from "@/domain/utils/shot-prompt";
import type { ShotInstructionTemplate } from "@/domain/schemas";

describe("shot-prompt", () => {
  describe("SHOT_SIZE_OPTIONS", () => {
    it("should have 5 entries", () => {
      expect(SHOT_SIZE_OPTIONS).toHaveLength(5);
    });

    it("each entry should have value, label, description, and keyword", () => {
      for (const option of SHOT_SIZE_OPTIONS) {
        expect(option).toHaveProperty("value");
        expect(option).toHaveProperty("label");
        expect(option).toHaveProperty("description");
        expect(option).toHaveProperty("keyword");
        expect(typeof option.value).toBe("string");
        expect(typeof option.label).toBe("string");
        expect(typeof option.description).toBe("string");
        expect(typeof option.keyword).toBe("string");
      }
    });

    it("each option should have a unique value", () => {
      const values = SHOT_SIZE_OPTIONS.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe("CAMERA_MOVEMENT_OPTIONS", () => {
    it("should have 8 entries", () => {
      expect(CAMERA_MOVEMENT_OPTIONS).toHaveLength(8);
    });

    it("each entry should have value, label, description, and keyword", () => {
      for (const option of CAMERA_MOVEMENT_OPTIONS) {
        expect(option).toHaveProperty("value");
        expect(option).toHaveProperty("label");
        expect(option).toHaveProperty("description");
        expect(option).toHaveProperty("keyword");
        expect(typeof option.value).toBe("string");
        expect(typeof option.label).toBe("string");
        expect(typeof option.description).toBe("string");
        expect(typeof option.keyword).toBe("string");
      }
    });

    it("each option should have a unique value", () => {
      const values = CAMERA_MOVEMENT_OPTIONS.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe("CAMERA_ANGLE_OPTIONS", () => {
    it("should have 6 entries", () => {
      expect(CAMERA_ANGLE_OPTIONS).toHaveLength(6);
    });

    it("each entry should have value, label, description, and keyword", () => {
      for (const option of CAMERA_ANGLE_OPTIONS) {
        expect(option).toHaveProperty("value");
        expect(option).toHaveProperty("label");
        expect(option).toHaveProperty("description");
        expect(option).toHaveProperty("keyword");
        expect(typeof option.value).toBe("string");
        expect(typeof option.label).toBe("string");
        expect(typeof option.description).toBe("string");
        expect(typeof option.keyword).toBe("string");
      }
    });

    it("each option should have a unique value", () => {
      const values = CAMERA_ANGLE_OPTIONS.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe("shotInstructionToPrompt", () => {
    it("with all fields set should produce the combined prompt", () => {
      const instruction: ShotInstructionTemplate = {
        shotSize: "extreme_close",
        cameraMovement: "push",
        cameraAngle: "eye_level",
      };
      expect(shotInstructionToPrompt(instruction)).toBe(
        "extreme close-up shot, push in, zoom in, dolly in, eye level shot",
      );
    });

    it("with only shotSize should produce just the shot size keyword", () => {
      const instruction: ShotInstructionTemplate = {
        shotSize: "close",
        cameraMovement: undefined as unknown as ShotInstructionTemplate["cameraMovement"],
        cameraAngle: undefined as unknown as ShotInstructionTemplate["cameraAngle"],
      };
      expect(shotInstructionToPrompt(instruction)).toBe("close-up shot");
    });

    it("with only cameraMovement should produce just the movement keyword", () => {
      const instruction: ShotInstructionTemplate = {
        shotSize: undefined as unknown as ShotInstructionTemplate["shotSize"],
        cameraMovement: "static",
        cameraAngle: undefined as unknown as ShotInstructionTemplate["cameraAngle"],
      };
      expect(shotInstructionToPrompt(instruction)).toBe("static camera, fixed shot");
    });

    it("with only cameraAngle should produce just the angle keyword", () => {
      const instruction: ShotInstructionTemplate = {
        shotSize: undefined as unknown as ShotInstructionTemplate["shotSize"],
        cameraMovement: undefined as unknown as ShotInstructionTemplate["cameraMovement"],
        cameraAngle: "low",
      };
      expect(shotInstructionToPrompt(instruction)).toBe("low angle shot, looking up");
    });

    it("with empty/undefined fields should return an empty string", () => {
      const instruction = {} as ShotInstructionTemplate;
      expect(shotInstructionToPrompt(instruction)).toBe("");
    });
  });
});
