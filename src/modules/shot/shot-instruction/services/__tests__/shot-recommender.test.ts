import { describe, it, expect } from "vitest";
import {
  recommendShotBySceneVariant,
  recommendationToShotInstruction,
  recommendShotInstruction,
  getRecommendationLabels,
} from "../shot-recommender";
import { MOOD_TO_CAMERA_MAPPING, WEATHER_MODIFIERS, CROWD_MODIFIERS } from "@/shared-logic/shot/mood-shot-mapping";

describe("shot-recommender", () => {
  describe("recommendShotBySceneVariant", () => {
    it("紧张氛围应推荐 close + tracking + dutch/low", () => {
      const rec = recommendShotBySceneVariant({ mood: "tense" });
      expect(rec.recommendedShotSize).toBe("close");
      expect(rec.recommendedCameraMovement).toBe("tracking");
      expect(["dutch", "low"]).toContain(rec.recommendedCameraAngle);
    });

    it("宁静氛围应推荐 wide + static + eye_level", () => {
      const rec = recommendShotBySceneVariant({ mood: "peaceful" });
      expect(rec.recommendedShotSize).toBe("wide");
      expect(rec.recommendedCameraMovement).toBe("static");
      expect(rec.recommendedCameraAngle).toBe("eye_level");
    });

    it("浪漫氛围应推荐 medium + push + eye_level/low", () => {
      const rec = recommendShotBySceneVariant({ mood: "romantic" });
      expect(rec.recommendedShotSize).toBe("medium");
      expect(rec.recommendedCameraMovement).toBe("push");
      expect(["eye_level", "low"]).toContain(rec.recommendedCameraAngle);
    });

    it("神秘氛围应推荐 wide + pan + high/dutch", () => {
      const rec = recommendShotBySceneVariant({ mood: "mysterious" });
      expect(rec.recommendedShotSize).toBe("wide");
      expect(rec.recommendedCameraMovement).toBe("pan");
      expect(["high", "dutch"]).toContain(rec.recommendedCameraAngle);
    });

    it("未知 mood 应回退到 peaceful 默认映射", () => {
      const rec = recommendShotBySceneVariant({ mood: "unknown_mood_xyz" });
      const peaceful = MOOD_TO_CAMERA_MAPPING.peaceful!;
      expect(rec.recommendedShotSize).toBe(peaceful.shotSize[0]);
      expect(rec.recommendedCameraMovement).toBe(peaceful.cameraMovement[0]);
    });

    it("weather 修正应覆盖 cameraMovement", () => {
      const rec = recommendShotBySceneVariant({ mood: "peaceful", weather: "stormy" });
      // peaceful 默认 static，但 stormy weather 修正为 tracking
      expect(rec.recommendedCameraMovement).toBe("tracking");
    });

    it("crowdLevel 修正应覆盖 shotSize", () => {
      const rec = recommendShotBySceneVariant({ mood: "peaceful", crowdLevel: "crowded" });
      // peaceful 默认 wide，但 crowded 修正为 close
      expect(rec.recommendedShotSize).toBe("close");
    });

    it("空旷人群应推荐 extreme_wide", () => {
      const rec = recommendShotBySceneVariant({ mood: "melancholic", crowdLevel: "empty" });
      expect(rec.recommendedShotSize).toBe("extreme_wide");
    });

    it("rationale 应包含 mood + weather + crowd 修正说明", () => {
      const rec = recommendShotBySceneVariant({
        mood: "tense",
        weather: "stormy",
        crowdLevel: "crowded",
      });
      expect(rec.rationale).toContain("紧张");
      expect(rec.rationale).toContain("暴风雨");
      expect(rec.rationale).toContain("拥挤");
    });

    it("alternatives 应包含 mood 映射的其余项", () => {
      const rec = recommendShotBySceneVariant({ mood: "tense" });
      const tenseMapping = MOOD_TO_CAMERA_MAPPING.tense!;
      // alternatives 应包含 shotSize[1..], cameraMovement[1..], cameraAngle[1..]
      expect(rec.alternatives.length).toBeGreaterThan(0);
      expect(rec.alternatives).toContain(tenseMapping.shotSize[1]);
      expect(rec.alternatives).toContain(tenseMapping.cameraMovement[1]);
    });
  });

  describe("recommendationToShotInstruction", () => {
    it("应生成合法的 ShotInstructionTemplate", () => {
      const rec = recommendShotBySceneVariant({ mood: "romantic" });
      const instruction = recommendationToShotInstruction(rec);
      expect(instruction.shotSize).toBe(rec.recommendedShotSize);
      expect(instruction.cameraMovement).toBe(rec.recommendedCameraMovement);
      expect(instruction.cameraAngle).toBe(rec.recommendedCameraAngle);
    });
  });

  describe("recommendShotInstruction", () => {
    it("应等价于 recommendationToShotInstruction(recommendShotBySceneVariant(...))", () => {
      const variant = { mood: "neon", weather: "foggy" };
      const direct = recommendShotInstruction(variant);
      const stepByStep = recommendationToShotInstruction(recommendShotBySceneVariant(variant));
      expect(direct).toEqual(stepByStep);
    });
  });

  describe("getRecommendationLabels", () => {
    it("应返回中文标签", () => {
      const rec = recommendShotBySceneVariant({ mood: "peaceful" });
      const labels = getRecommendationLabels(rec);
      expect(typeof labels.shotSizeLabel).toBe("string");
      expect(labels.shotSizeLabel.length).toBeGreaterThan(0);
      expect(typeof labels.cameraMovementLabel).toBe("string");
      expect(typeof labels.cameraAngleLabel).toBe("string");
    });

    it("对未知值应回退到原始字符串", () => {
      // 构造一个带有无效值的推荐（通过类型断言绕过）
      const rec = {
        recommendedShotSize: "invalid_value" as never,
        recommendedCameraMovement: "static" as const,
        recommendedCameraAngle: "eye_level" as const,
        alternatives: [],
        rationale: "",
      };
      const labels = getRecommendationLabels(rec);
      expect(labels.shotSizeLabel).toBe("invalid_value");
    });
  });

  describe("映射表完整性", () => {
    it("MOOD_TO_CAMERA_MAPPING 每个映射都应有非空数组", () => {
      for (const [mood, mapping] of Object.entries(MOOD_TO_CAMERA_MAPPING)) {
        expect(mapping.shotSize.length).toBeGreaterThan(0);
        expect(mapping.cameraMovement.length).toBeGreaterThan(0);
        expect(mapping.cameraAngle.length).toBeGreaterThan(0);
        expect(mapping.rationale.length).toBeGreaterThan(0);
      }
    });

    it("WEATHER_MODIFIERS 的 cameraMovementPreference 应是合法 enum 值", () => {
      const validMovements = ["static", "push", "pull", "pan", "orbit", "crane_up", "crane_down", "tracking"];
      for (const [, mod] of Object.entries(WEATHER_MODIFIERS)) {
        if (mod.cameraMovementPreference) {
          expect(validMovements).toContain(mod.cameraMovementPreference);
        }
      }
    });

    it("CROWD_MODIFIERS 的 shotSizePreference 应是合法 enum 值", () => {
      const validSizes = ["extreme_close", "close", "medium", "wide", "extreme_wide"];
      for (const [, mod] of Object.entries(CROWD_MODIFIERS)) {
        if (mod.shotSizePreference) {
          expect(validSizes).toContain(mod.shotSizePreference);
        }
      }
    });
  });
});
