import { describe, it, expect } from "vitest";
import { BeatWorkflowService } from "@/domain/services/beat-workflow-service";
import { resolveCharacterRef, resolveSceneRef } from "@/domain/services/reference-resolver";
import type { StoryBeat, Character, StoryElement } from "@/domain/schemas";

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 1,
    description: "test beat",
    duration: 5,
    characters: [],
    elementIds: [],
    characterIds: [],
    enhancedGeneration: false,
    ...overrides,
  } as StoryBeat;
}

describe("domain-services", () => {
  describe("BeatWorkflowService", () => {
    describe("getNextStep", () => {
      it('should return "keyframe" when no keyframe imageUrl', () => {
        const beat = makeBeat();
        expect(BeatWorkflowService.getNextStep(beat)).toBe("keyframe");
      });

      it('should return "framePair" when keyframe exists but no framePair firstFrame imageUrl', () => {
        const beat = makeBeat({
          keyframe: { imageUrl: "http://example.com/keyframe.png" },
        });
        expect(BeatWorkflowService.getNextStep(beat)).toBe("framePair");
      });

      it('should return "video" when keyframe and framePair exist but no videoUrl', () => {
        const beat = makeBeat({
          keyframe: { imageUrl: "http://example.com/keyframe.png" },
          framePair: { firstFrame: { imageUrl: "http://example.com/first.png", prompt: "", derivedFrom: "" } },
        });
        expect(BeatWorkflowService.getNextStep(beat)).toBe("video");
      });

      it("should return null when all steps complete", () => {
        const beat = makeBeat({
          keyframe: { imageUrl: "http://example.com/keyframe.png" },
          framePair: { firstFrame: { imageUrl: "http://example.com/first.png", prompt: "", derivedFrom: "" } },
          videoGen: { videoUrl: "http://example.com/video.mp4" },
        });
        expect(BeatWorkflowService.getNextStep(beat)).toBeNull();
      });
    });

    describe("getStepPrereqs", () => {
      it('should return correct description for "keyframe" step', () => {
        expect(BeatWorkflowService.getStepPrereqs("keyframe")).toBe(
          "BEAT_REQUIRES_CHARACTER_OR_SCENE",
        );
      });

      it('should return correct description for "framePair" step', () => {
        expect(BeatWorkflowService.getStepPrereqs("framePair")).toBe(
          "KEYFRAME_REQUIRED",
        );
      });

      it('should return correct description for "video" step', () => {
        expect(BeatWorkflowService.getStepPrereqs("video")).toBe(
          "FRAME_PAIR_REQUIRED",
        );
      });
    });

    describe("shouldAutoAdvance", () => {
      it("should return true when keyframe and framePair exist", () => {
        const beat = makeBeat({
          keyframe: { imageUrl: "http://example.com/keyframe.png" },
          framePair: { firstFrame: { imageUrl: "http://example.com/first.png", prompt: "", derivedFrom: "" } },
        });
        expect(BeatWorkflowService.shouldAutoAdvance(beat)).toBe(true);
      });

      it("should return false when keyframe is missing", () => {
        const beat = makeBeat({
          framePair: { firstFrame: { imageUrl: "http://example.com/first.png", prompt: "", derivedFrom: "" } },
        });
        expect(BeatWorkflowService.shouldAutoAdvance(beat)).toBe(false);
      });

      it("should return false when framePair is missing", () => {
        const beat = makeBeat({
          keyframe: { imageUrl: "http://example.com/keyframe.png" },
        });
        expect(BeatWorkflowService.shouldAutoAdvance(beat)).toBe(false);
      });
    });
  });

  describe("ReferenceResolver", () => {
    describe("resolveCharacterRef", () => {
      it("with avatarPath should return avatarPath", () => {
        const character = {
          id: "char-1",
          avatarPath: "http://example.com/avatar.png",
        } as Character;
        expect(resolveCharacterRef(character)).toBe("http://example.com/avatar.png");
      });

      it("with generatedImage should return generatedImage", () => {
        const character = {
          id: "char-1",
          generatedImage: "http://example.com/generated.png",
        } as Character;
        expect(resolveCharacterRef(character)).toBe("http://example.com/generated.png");
      });

      it("with outfit in beat should return outfit imageUrl", () => {
        const character = {
          id: "char-1",
          outfits: [{ id: "outfit-1", imageUrl: "http://example.com/outfit.png" }],
        } as Character;
        const beat = makeBeat({
          characterOutfits: { "char-1": "outfit-1" },
        });
        expect(resolveCharacterRef(character, beat)).toBe("http://example.com/outfit.png");
      });

      it("with no images should return undefined", () => {
        const character = { id: "char-1" } as Character;
        expect(resolveCharacterRef(character)).toBeUndefined();
      });

      it("with element binding image should return element binding image", () => {
        const character = { id: "char-1" } as Character;
        const elements = [
          {
            id: "char-1",
            type: "character",
            name: "角色1",
            description: "测试角色",
            bindings: [{ type: "image", url: "http://example.com/element-ref.png", isPrimary: true, name: "ref", uploadedAt: "2024-01-01" }],
            createdAt: "2024-01-01",
            updatedAt: "2024-01-01",
          },
        ] as StoryElement[];
        expect(resolveCharacterRef(character, null, elements)).toBe("http://example.com/element-ref.png");
      });

      it("element binding image takes priority over avatarPath", () => {
        const character = {
          id: "char-1",
          avatarPath: "http://example.com/avatar.png",
        } as Character;
        const elements = [
          {
            id: "char-1",
            type: "character",
            name: "角色1",
            description: "测试角色",
            bindings: [{ type: "image", url: "http://example.com/element-ref.png", isPrimary: true, name: "ref", uploadedAt: "2024-01-01" }],
            createdAt: "2024-01-01",
            updatedAt: "2024-01-01",
          },
        ] as StoryElement[];
        expect(resolveCharacterRef(character, null, elements)).toBe("http://example.com/element-ref.png");
      });

      it("outfit takes priority over element binding image", () => {
        const character = {
          id: "char-1",
          outfits: [{ id: "outfit-1", imageUrl: "http://example.com/outfit.png" }],
        } as Character;
        const beat = makeBeat({ characterOutfits: { "char-1": "outfit-1" } });
        const elements = [
          {
            id: "char-1",
            type: "character",
            name: "角色1",
            description: "测试角色",
            bindings: [{ type: "image", url: "http://example.com/element-ref.png", isPrimary: true, name: "ref", uploadedAt: "2024-01-01" }],
            createdAt: "2024-01-01",
            updatedAt: "2024-01-01",
          },
        ] as StoryElement[];
        expect(resolveCharacterRef(character, beat, elements)).toBe("http://example.com/outfit.png");
      });

      it("featureAnchor referenceImageUrl as fallback", () => {
        const character = { id: "char-1" } as Character;
        const elements = [
          {
            id: "char-1",
            type: "character",
            name: "角色1",
            description: "测试角色",
            bindings: [],
            featureAnchor: {
              elementId: "char-1",
              elementType: "character",
              referenceImageUrl: "http://example.com/anchor-ref.png",
              featureTags: ["银色长发"],
              confidence: 0.9,
              extractedAt: "2024-01-01",
            },
            createdAt: "2024-01-01",
            updatedAt: "2024-01-01",
          },
        ] as StoryElement[];
        expect(resolveCharacterRef(character, null, elements)).toBe("http://example.com/anchor-ref.png");
      });

      it("non-matching element should not affect result", () => {
        const character = {
          id: "char-1",
          avatarPath: "http://example.com/avatar.png",
        } as Character;
        const elements = [
          {
            id: "char-2",
            type: "character",
            bindings: [{ type: "image", url: "http://example.com/other.png", isPrimary: true }],
          },
        ] as StoryElement[];
        expect(resolveCharacterRef(character, null, elements)).toBe("http://example.com/avatar.png");
      });
    });

    describe("resolveSceneRef", () => {
      it("with refImagePath should return refImagePath", () => {
        expect(resolveSceneRef({ refImagePath: "http://example.com/ref.png" })).toBe(
          "http://example.com/ref.png",
        );
      });

      it("with scenePath should return scenePath", () => {
        expect(resolveSceneRef({ scenePath: "http://example.com/scene.png" })).toBe(
          "http://example.com/scene.png",
        );
      });

      it("with generatedImage should return generatedImage", () => {
        expect(resolveSceneRef({ generatedImage: "http://example.com/gen.png" })).toBe(
          "http://example.com/gen.png",
        );
      });

      it("with no images should return undefined", () => {
        expect(resolveSceneRef({})).toBeUndefined();
      });
    });
  });
});
