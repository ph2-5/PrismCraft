import { describe, it, expect } from "vitest";
import {
  getModelCapabilities,
  supportsLastFrame,
  getMaxReferences,
  adjustReferenceImages,
  getVideoGenerationStrategy,
  MODEL_CAPABILITIES,
  ReferencePriority,
} from "../model-capabilities";
import type { ReferenceImageItem } from "../model-capabilities";

describe("model-capabilities", () => {
  describe("MODEL_CAPABILITIES", () => {
    it("should define capabilities for known models", () => {
      expect(Object.keys(MODEL_CAPABILITIES).length).toBeGreaterThan(0);
    });

    it("should have all required fields for each model", () => {
      for (const [modelId, caps] of Object.entries(MODEL_CAPABILITIES)) {
        expect(caps.maxReferences).toBeTypeOf("number");
        expect(caps.maxResolution).toBeTypeOf("number");
        expect(caps.maxSizeMB).toBeTypeOf("number");
        expect(typeof caps.supportsLastFrame).toBe("boolean");
        expect(["separate", "merged"]).toContain(caps.referenceMode);
      }
    });

    it("should have positive values for numeric fields", () => {
      for (const caps of Object.values(MODEL_CAPABILITIES)) {
        expect(caps.maxReferences).toBeGreaterThan(0);
        expect(caps.maxResolution).toBeGreaterThan(0);
        expect(caps.maxSizeMB).toBeGreaterThan(0);
      }
    });
  });

  describe("getModelCapabilities", () => {
    it("should return exact match capabilities", () => {
      const caps = getModelCapabilities("seedance-2.0");
      expect(caps.maxReferences).toBe(4);
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.referenceMode).toBe("separate");
    });

    it("should return default capabilities for unknown models", () => {
      const caps = getModelCapabilities("totally-unknown-model");
      expect(caps.maxReferences).toBe(4);
      expect(caps.maxResolution).toBe(2048);
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.referenceMode).toBe("separate");
    });

    it("should return runway capabilities", () => {
      const caps = getModelCapabilities("runway-gen3");
      expect(caps.maxReferences).toBe(2);
      expect(caps.supportsLastFrame).toBe(false);
      expect(caps.referenceMode).toBe("merged");
    });

    it("should return kling capabilities", () => {
      const caps = getModelCapabilities("kling-v2-master");
      expect(caps.maxReferences).toBe(4);
      expect(caps.supportsLastFrame).toBe(true);
    });

    it("should return image model capabilities", () => {
      const caps = getModelCapabilities("dall-e-3");
      expect(caps.maxReferences).toBe(1);
      expect(caps.supportsLastFrame).toBe(false);
    });
  });

  describe("supportsLastFrame", () => {
    it("should return true for models that support last frame", () => {
      expect(supportsLastFrame("seedance-2.0")).toBe(true);
      expect(supportsLastFrame("cogvideox-3")).toBe(true);
    });

    it("should return false for models that do not support last frame", () => {
      expect(supportsLastFrame("runway-gen3")).toBe(false);
      expect(supportsLastFrame("svd-2.0")).toBe(false);
    });

    it("should return default (true) for unknown models", () => {
      expect(supportsLastFrame("unknown-model")).toBe(true);
    });
  });

  describe("getMaxReferences", () => {
    it("should return correct max references for known models", () => {
      expect(getMaxReferences("seedance-2.0")).toBe(4);
      expect(getMaxReferences("runway-gen3")).toBe(2);
      expect(getMaxReferences("dall-e-3")).toBe(1);
    });

    it("should return default (4) for unknown models", () => {
      expect(getMaxReferences("unknown-model")).toBe(4);
    });
  });

  describe("adjustReferenceImages", () => {
    const baseReferences: ReferenceImageItem[] = [
      { url: "http://char.jpg", priority: ReferencePriority.CHARACTER_REF, type: "character" },
      { url: "http://scene.jpg", priority: ReferencePriority.SCENE_REF, type: "scene" },
      { url: "http://first.jpg", priority: ReferencePriority.FIRST_FRAME, type: "firstFrame" },
      { url: "http://last.jpg", priority: ReferencePriority.LAST_FRAME, type: "lastFrame" },
    ];

    it("should return all references when within limit", () => {
      const result = adjustReferenceImages(baseReferences, "seedance-2.0", "video");
      expect(result.length).toBe(4);
    });

    it("should sort references by priority", () => {
      const unsorted: ReferenceImageItem[] = [
        { url: "http://last.jpg", priority: ReferencePriority.LAST_FRAME, type: "lastFrame" },
        { url: "http://char.jpg", priority: ReferencePriority.CHARACTER_REF, type: "character" },
        { url: "http://scene.jpg", priority: ReferencePriority.SCENE_REF, type: "scene" },
      ];
      const result = adjustReferenceImages(unsorted, "seedance-2.0", "video");
      expect(result[0].type).toBe("character");
      expect(result[1].type).toBe("scene");
      expect(result[2].type).toBe("lastFrame");
    });

    it("should filter out lastFrame for models that do not support it in video mode", () => {
      const result = adjustReferenceImages(baseReferences, "runway-gen3", "video");
      expect(result.some((r) => r.type === "lastFrame")).toBe(false);
    });

    it("should keep lastFrame in keyframe mode even for unsupported models", () => {
      const limitedRefs: ReferenceImageItem[] = [
        { url: "http://char.jpg", priority: ReferencePriority.CHARACTER_REF, type: "character" },
        { url: "http://last.jpg", priority: ReferencePriority.LAST_FRAME, type: "lastFrame" },
      ];
      const result = adjustReferenceImages(limitedRefs, "runway-gen3", "keyframe");
      expect(result.some((r) => r.type === "lastFrame")).toBe(true);
    });

    it("should drop lower priority references when exceeding max", () => {
      const manyRefs: ReferenceImageItem[] = [
        { url: "http://char1.jpg", priority: ReferencePriority.CHARACTER_REF, type: "character" },
        { url: "http://scene1.jpg", priority: ReferencePriority.SCENE_REF, type: "scene" },
        { url: "http://first.jpg", priority: ReferencePriority.FIRST_FRAME, type: "firstFrame" },
        { url: "http://last.jpg", priority: ReferencePriority.LAST_FRAME, type: "lastFrame" },
      ];
      const result = adjustReferenceImages(manyRefs, "dall-e-3", "video");
      expect(result.length).toBeLessThanOrEqual(1);
      expect(result[0].type).toBe("character");
    });

    it("should handle empty references array", () => {
      const result = adjustReferenceImages([], "seedance-2.0", "video");
      expect(result).toEqual([]);
    });

    it("should not mutate original array", () => {
      const original = [...baseReferences];
      adjustReferenceImages(baseReferences, "seedance-2.0", "video");
      expect(baseReferences).toEqual(original);
    });
  });

  describe("getVideoGenerationStrategy", () => {
    it("should return strategy with lastFrame support for capable models", () => {
      const strategy = getVideoGenerationStrategy("seedance-2.0");
      expect(strategy.useFirstFrame).toBe(true);
      expect(strategy.useLastFrame).toBe(true);
      expect(strategy.useCharacterRef).toBe(true);
      expect(strategy.useSceneRef).toBe(true);
    });

    it("should return strategy without lastFrame for incapable models", () => {
      const strategy = getVideoGenerationStrategy("runway-gen3");
      expect(strategy.useLastFrame).toBe(false);
    });

    it("should always enable firstFrame, characterRef and sceneRef", () => {
      const strategy = getVideoGenerationStrategy("unknown-model");
      expect(strategy.useFirstFrame).toBe(true);
      expect(strategy.useCharacterRef).toBe(true);
      expect(strategy.useSceneRef).toBe(true);
    });
  });

  describe("ReferencePriority", () => {
    it("should have correct priority ordering", () => {
      expect(ReferencePriority.CHARACTER_REF).toBeLessThan(ReferencePriority.SCENE_REF);
      expect(ReferencePriority.SCENE_REF).toBeLessThan(ReferencePriority.FIRST_FRAME);
      expect(ReferencePriority.FIRST_FRAME).toBeLessThan(ReferencePriority.LAST_FRAME);
    });
  });
});
