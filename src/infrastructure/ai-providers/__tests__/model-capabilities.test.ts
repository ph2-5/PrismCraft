import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: mockWarn },
}));

import {
  getModelCapabilities,
  supportsLastFrame,
  getMaxReferences,
  adjustReferenceImages,
  getVideoGenerationStrategy,
  resolveImageSize,
  getSupportedImageSizes,
  setModelProfiles,
  getModelParameterProfile,
  getAllModelProfiles,
  BUILTIN_MODEL_CAPABILITIES,
  ReferencePriority,
} from "../model-capabilities";
import type { ReferenceImageItem, ModelParameterProfile } from "../model-capabilities";

describe("model-capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setModelProfiles({});
  });

  describe("BUILTIN_MODEL_CAPABILITIES", () => {
    it("should define capabilities for known models", () => {
      expect(Object.keys(BUILTIN_MODEL_CAPABILITIES).length).toBeGreaterThan(0);
    });

    it("should have all required fields for each model", () => {
      for (const caps of Object.values(BUILTIN_MODEL_CAPABILITIES)) {
        expect(caps.maxReferences).toBeTypeOf("number");
        expect(caps.maxResolution).toBeTypeOf("number");
        expect(caps.maxSizeMB).toBeTypeOf("number");
        expect(typeof caps.supportsLastFrame).toBe("boolean");
        expect(["separate", "merged"]).toContain(caps.referenceMode);
      }
    });

    it("should have positive values for numeric fields", () => {
      for (const caps of Object.values(BUILTIN_MODEL_CAPABILITIES)) {
        expect(caps.maxReferences).toBeGreaterThan(0);
        expect(caps.maxResolution).toBeGreaterThan(0);
        expect(caps.maxSizeMB).toBeGreaterThan(0);
      }
    });
  });

  describe("getModelCapabilities", () => {
    it("should return exact match from BUILTIN_MODEL_CAPABILITIES", () => {
      const caps = getModelCapabilities("seedance-2.0");
      expect(caps.maxReferences).toBe(4);
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.referenceMode).toBe("separate");
    });

    it("should return capabilities from cache when available", () => {
      const customCaps = {
        maxReferences: 8,
        maxResolution: 4096,
        maxSizeMB: 20,
        supportsLastFrame: false,
        referenceMode: "merged" as const,
      };
      setModelProfiles({
        "custom-model": {
          modelId: "custom-model",
          capabilities: customCaps,
          parameters: {},
        },
      });
      const caps = getModelCapabilities("custom-model");
      expect(caps.maxReferences).toBe(8);
      expect(caps.maxResolution).toBe(4096);
      expect(caps.supportsLastFrame).toBe(false);
      expect(caps.referenceMode).toBe("merged");
    });

    it("should prefer cache over BUILTIN_MODEL_CAPABILITIES", () => {
      const cachedCaps = {
        maxReferences: 99,
        maxResolution: 9999,
        maxSizeMB: 99,
        supportsLastFrame: false,
        referenceMode: "separate" as const,
      };
      setModelProfiles({
        "seedance-2.0": {
          modelId: "seedance-2.0",
          capabilities: cachedCaps,
          parameters: {},
        },
      });
      const caps = getModelCapabilities("seedance-2.0");
      expect(caps.maxReferences).toBe(99);
    });

    it("should fuzzy match by prefix and substring inclusion", () => {
      const caps = getModelCapabilities("seedance-2.0-pro");
      expect(caps.maxReferences).toBe(4);
      expect(caps.supportsLastFrame).toBe(true);
    });

    it("should fuzzy match by substring inclusion when key length >= 4", () => {
      const caps = getModelCapabilities("my-kling-v2-master-plus");
      expect(caps.maxReferences).toBe(4);
      expect(caps.supportsLastFrame).toBe(true);
    });

    it("should return default capabilities for unknown models", () => {
      const caps = getModelCapabilities("totally-unknown-model");
      expect(caps.maxReferences).toBe(4);
      expect(caps.maxResolution).toBe(2048);
      expect(caps.maxSizeMB).toBe(10);
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.referenceMode).toBe("separate");
      expect(caps.urlTtl).toBe(3600);
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
      expect(supportsLastFrame("veo-3")).toBe(true);
    });

    it("should return false for models that do not support last frame", () => {
      expect(supportsLastFrame("runway-gen3")).toBe(false);
      expect(supportsLastFrame("svd-2.0")).toBe(false);
      expect(supportsLastFrame("flux-pro")).toBe(false);
      expect(supportsLastFrame("seedream-3.0")).toBe(false);
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

    it("should sort references by priority ascending", () => {
      const unsorted: ReferenceImageItem[] = [
        { url: "http://last.jpg", priority: ReferencePriority.LAST_FRAME, type: "lastFrame" },
        { url: "http://char.jpg", priority: ReferencePriority.CHARACTER_REF, type: "character" },
        { url: "http://scene.jpg", priority: ReferencePriority.SCENE_REF, type: "scene" },
      ];
      const result = adjustReferenceImages(unsorted, "seedance-2.0", "video");
      expect(result[0]!.type).toBe("character");
      expect(result[1]!.type).toBe("scene");
      expect(result[2]!.type).toBe("lastFrame");
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

    it("should keep lastFrame in framePair mode for unsupported models", () => {
      const refs: ReferenceImageItem[] = [
        { url: "http://char.jpg", priority: ReferencePriority.CHARACTER_REF, type: "character" },
        { url: "http://last.jpg", priority: ReferencePriority.LAST_FRAME, type: "lastFrame" },
      ];
      const result = adjustReferenceImages(refs, "runway-gen3", "framePair");
      expect(result.some((r) => r.type === "lastFrame")).toBe(true);
    });

    it("should truncate to maxReferences and log warning", () => {
      const manyRefs: ReferenceImageItem[] = [
        { url: "http://char1.jpg", priority: ReferencePriority.CHARACTER_REF, type: "character" },
        { url: "http://scene1.jpg", priority: ReferencePriority.SCENE_REF, type: "scene" },
        { url: "http://first.jpg", priority: ReferencePriority.FIRST_FRAME, type: "firstFrame" },
        { url: "http://last.jpg", priority: ReferencePriority.LAST_FRAME, type: "lastFrame" },
      ];
      const result = adjustReferenceImages(manyRefs, "dall-e-3", "video");
      expect(result.length).toBeLessThanOrEqual(1);
      expect(result[0]!.type).toBe("character");
      expect(mockWarn).toHaveBeenCalled();
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

    it("should filter lastFrame then truncate", () => {
      const refs: ReferenceImageItem[] = [
        { url: "http://last.jpg", priority: ReferencePriority.LAST_FRAME, type: "lastFrame" },
        { url: "http://char.jpg", priority: ReferencePriority.CHARACTER_REF, type: "character" },
        { url: "http://scene.jpg", priority: ReferencePriority.SCENE_REF, type: "scene" },
      ];
      const result = adjustReferenceImages(refs, "runway-gen3", "video");
      expect(result.some((r) => r.type === "lastFrame")).toBe(false);
      expect(result.length).toBe(2);
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

  describe("resolveImageSize", () => {
    it("should return preferred size when supported (WxH format)", () => {
      const result = resolveImageSize("seedance-2.0", "keyframe", "1920x1280");
      expect(result).toBe("1920x1280");
    });

    it("should return preferred size when supported (W*H format)", () => {
      const result = resolveImageSize("seedance-2.0", "keyframe", "1920*1280");
      expect(result).toBe("1920*1280");
    });

    it("should find closest size when preferred size is not directly supported", () => {
      const result = resolveImageSize("seedance-2.0", "keyframe", "1920x1080");
      expect(result).toMatch(/^\d+x\d+$/);
    });

    it("should return preferred size as-is when model has no supportedImageSizes", () => {
      setModelProfiles({
        "no-sizes-model": {
          modelId: "no-sizes-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
          },
          parameters: {},
        },
      });
      const result = resolveImageSize("no-sizes-model", "keyframe", "999x888");
      expect(result).toBe("999x888");
    });

    it("should return defaultImageSize when no preferred size", () => {
      const result = resolveImageSize("seedance-2.0", "keyframe");
      expect(result).toBe("1920x1920");
    });

    it("should match purpose-based aspect ratio when no defaultImageSize", () => {
      setModelProfiles({
        "no-default-model": {
          modelId: "no-default-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
            supportedImageSizes: [
              { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
              { width: 1920, height: 1080, label: "16:9", aspectRatio: "16:9" },
              { width: 1280, height: 1920, label: "2:3", aspectRatio: "2:3" },
            ],
          },
          parameters: {},
        },
      });
      const result = resolveImageSize("no-default-model", "keyframe");
      expect(result).toBe("1920x1080");
    });

    it("should return first supported size when no aspect ratio match", () => {
      setModelProfiles({
        "limited-ratio-model": {
          modelId: "limited-ratio-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
            supportedImageSizes: [
              { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
            ],
          },
          parameters: {},
        },
      });
      const result = resolveImageSize("limited-ratio-model", "scene");
      expect(result).toBe("1024x1024");
    });

    it("should fall back to maxResolution when no supportedImageSizes and no defaultImageSize", () => {
      setModelProfiles({
        "bare-model": {
          modelId: "bare-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 1024,
            maxSizeMB: 5,
            supportsLastFrame: false,
            referenceMode: "merged",
          },
          parameters: {},
        },
      });
      const result = resolveImageSize("bare-model", "keyframe");
      expect(result).toBe("1024x1024");
    });

    it("should use character purpose aspect ratio (2:3)", () => {
      setModelProfiles({
        "purpose-model": {
          modelId: "purpose-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
            supportedImageSizes: [
              { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
              { width: 1280, height: 1920, label: "2:3", aspectRatio: "2:3" },
            ],
          },
          parameters: {},
        },
      });
      const result = resolveImageSize("purpose-model", "character");
      expect(result).toBe("1280x1920");
    });

    it("should use style_guide purpose aspect ratio (1:1)", () => {
      setModelProfiles({
        "purpose-model": {
          modelId: "purpose-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
            supportedImageSizes: [
              { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
              { width: 1920, height: 1080, label: "16:9", aspectRatio: "16:9" },
            ],
          },
          parameters: {},
        },
      });
      const result = resolveImageSize("purpose-model", "style_guide");
      expect(result).toBe("1920x1920");
    });
  });

  describe("getSupportedImageSizes", () => {
    it("should return supportedImageSizes for known model", () => {
      const sizes = getSupportedImageSizes("seedance-2.0");
      expect(sizes.length).toBeGreaterThan(0);
      expect(sizes[0]).toHaveProperty("width");
      expect(sizes[0]).toHaveProperty("height");
      expect(sizes[0]).toHaveProperty("label");
      expect(sizes[0]).toHaveProperty("aspectRatio");
    });

    it("should return fallback size when model has no supportedImageSizes", () => {
      setModelProfiles({
        "no-sizes-model": {
          modelId: "no-sizes-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 1024,
            maxSizeMB: 5,
            supportsLastFrame: false,
            referenceMode: "merged",
          },
          parameters: {},
        },
      });
      const sizes = getSupportedImageSizes("no-sizes-model");
      expect(sizes).toEqual([{ width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" }]);
    });

    it("should return fallback for unknown model using default supportedImageSizes", () => {
      const sizes = getSupportedImageSizes("totally-unknown-model");
      expect(sizes).toEqual([{ width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" }]);
    });
  });

  describe("setModelProfiles / getModelParameterProfile / getAllModelProfiles", () => {
    it("should return undefined before profiles are set", () => {
      expect(getModelParameterProfile("any-model")).toBeUndefined();
      expect(getAllModelProfiles()).toEqual({});
    });

    it("should set and retrieve a model profile", () => {
      const profile: ModelParameterProfile = {
        modelId: "test-model",
        displayName: "Test Model",
        providerId: "test-provider",
        capabilities: {
          maxReferences: 6,
          maxResolution: 4096,
          maxSizeMB: 20,
          supportsLastFrame: true,
          referenceMode: "separate",
        },
        parameters: {
          durations: [{ value: 5, label: "5s" }],
        },
      };
      setModelProfiles({ "test-model": profile });
      expect(getModelParameterProfile("test-model")).toBe(profile);
    });

    it("should return all profiles after setting", () => {
      const profiles: Record<string, ModelParameterProfile> = {
        "model-a": {
          modelId: "model-a",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
          },
          parameters: {},
        },
        "model-b": {
          modelId: "model-b",
          capabilities: {
            maxReferences: 2,
            maxResolution: 1024,
            maxSizeMB: 5,
            supportsLastFrame: false,
            referenceMode: "merged",
          },
          parameters: {},
        },
      };
      setModelProfiles(profiles);
      const all = getAllModelProfiles();
      expect(Object.keys(all)).toEqual(["model-a", "model-b"]);
    });

    it("should replace profiles on subsequent calls", () => {
      const first: Record<string, ModelParameterProfile> = {
        "model-a": {
          modelId: "model-a",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
          },
          parameters: {},
        },
      };
      const second: Record<string, ModelParameterProfile> = {
        "model-b": {
          modelId: "model-b",
          capabilities: {
            maxReferences: 2,
            maxResolution: 1024,
            maxSizeMB: 5,
            supportsLastFrame: false,
            referenceMode: "merged",
          },
          parameters: {},
        },
      };
      setModelProfiles(first);
      expect(getModelParameterProfile("model-a")).toBeDefined();
      setModelProfiles(second);
      expect(getModelParameterProfile("model-a")).toBeUndefined();
      expect(getModelParameterProfile("model-b")).toBeDefined();
    });
  });

  describe("ReferencePriority", () => {
    it("should have correct priority ordering", () => {
      expect(ReferencePriority.CHARACTER_REF).toBeLessThan(ReferencePriority.SCENE_REF);
      expect(ReferencePriority.SCENE_REF).toBeLessThan(ReferencePriority.FIRST_FRAME);
      expect(ReferencePriority.FIRST_FRAME).toBeLessThan(ReferencePriority.LAST_FRAME);
      expect(ReferencePriority.LAST_FRAME).toBeLessThan(ReferencePriority.KEYFRAME_COMPOSITION);
      expect(ReferencePriority.KEYFRAME_COMPOSITION).toBeLessThan(ReferencePriority.PREV_KEYFRAME_STYLE);
    });
  });
});
