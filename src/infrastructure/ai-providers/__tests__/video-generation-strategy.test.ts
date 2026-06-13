import { describe, it, expect } from "vitest";
import { getVideoGenerationStrategy } from "@/infrastructure/ai-providers/model-capabilities-utils";

describe("getVideoGenerationStrategy", () => {
  describe("bake_into_first mode (Seedance pro)", () => {
    it("doubao-seedance-2-0-260128 returns bake_into_first for both refs", () => {
      const strategy = getVideoGenerationStrategy("doubao-seedance-2-0-260128");
      expect(strategy.useCharacterRef).toBe(false);
      expect(strategy.useSceneRef).toBe(false);
      expect(strategy.characterRefMode).toBe("bake_into_first");
      expect(strategy.sceneRefMode).toBe("bake_into_first");
      expect(strategy.useLastFrame).toBe(true);
      expect(strategy.referenceStrategy.characterRef).toBe("bake_into_first");
      expect(strategy.referenceStrategy.sceneRef).toBe("bake_into_first");
    });

    it("doubao-seedance-1-0-pro-250528 returns bake_into_first for both refs", () => {
      const strategy = getVideoGenerationStrategy("doubao-seedance-1-0-pro-250528");
      expect(strategy.useCharacterRef).toBe(false);
      expect(strategy.useSceneRef).toBe(false);
      expect(strategy.characterRefMode).toBe("bake_into_first");
      expect(strategy.sceneRefMode).toBe("bake_into_first");
      expect(strategy.useLastFrame).toBe(true);
    });

    it("doubao-seedance-1-5-pro-251215 returns bake_into_first for both refs", () => {
      const strategy = getVideoGenerationStrategy("doubao-seedance-1-5-pro-251215");
      expect(strategy.useCharacterRef).toBe(false);
      expect(strategy.useSceneRef).toBe(false);
      expect(strategy.characterRefMode).toBe("bake_into_first");
      expect(strategy.sceneRefMode).toBe("bake_into_first");
      expect(strategy.useLastFrame).toBe(true);
    });
  });

  describe("ref_field mode (Seedance lite-i2v)", () => {
    it("doubao-seedance-1-0-lite-i2v-250428 returns ref_field", () => {
      const strategy = getVideoGenerationStrategy("doubao-seedance-1-0-lite-i2v-250428");
      expect(strategy.useCharacterRef).toBe(true);
      expect(strategy.useSceneRef).toBe(true);
      expect(strategy.characterRefMode).toBe("ref_field");
      expect(strategy.sceneRefMode).toBe("ref_field");
      expect(strategy.useLastFrame).toBe(false);
      expect(strategy.referenceStrategy.characterRef).toBe("both");
      expect(strategy.referenceStrategy.sceneRef).toBe("both");
    });
  });

  describe("native_field mode (Kling V2+)", () => {
    it("kling-v2-master returns native_field for character, text_append for scene", () => {
      const strategy = getVideoGenerationStrategy("kling-v2-master");
      expect(strategy.useCharacterRef).toBe(true);
      expect(strategy.characterRefMode).toBe("native_field");
      expect(strategy.useSceneRef).toBe(true);
      expect(strategy.sceneRefMode).toBe("text_append");
      expect(strategy.useLastFrame).toBe(true);
      expect(strategy.referenceStrategy.characterRef).toBe("both");
      expect(strategy.referenceStrategy.sceneRef).toBe("bake_into_first");
    });
  });

  describe("bake_into_first mode (Kling V1)", () => {
    it("kling-v1 returns bake_into_first for character", () => {
      const strategy = getVideoGenerationStrategy("kling-v1");
      expect(strategy.useCharacterRef).toBe(false);
      expect(strategy.characterRefMode).toBe("bake_into_first");
      expect(strategy.useSceneRef).toBe(false);
      expect(strategy.sceneRefMode).toBe("bake_into_first");
      expect(strategy.useLastFrame).toBe(false);
    });
  });

  describe("bake_into_first mode (Google Veo)", () => {
    it("veo-3 returns bake_into_first and does not support last frame", () => {
      const strategy = getVideoGenerationStrategy("veo-3");
      expect(strategy.useCharacterRef).toBe(false);
      expect(strategy.useSceneRef).toBe(false);
      expect(strategy.characterRefMode).toBe("bake_into_first");
      expect(strategy.sceneRefMode).toBe("bake_into_first");
      expect(strategy.useLastFrame).toBe(false);
    });
  });

  describe("text_append mode (unknown model)", () => {
    it("unknown model falls back to conservative defaults with text_append", () => {
      const strategy = getVideoGenerationStrategy("some-unknown-model-123");
      expect(strategy.useCharacterRef).toBe(true);
      expect(strategy.characterRefMode).toBe("text_append");
      expect(strategy.useSceneRef).toBe(true);
      expect(strategy.sceneRefMode).toBe("text_append");
      expect(strategy.useLastFrame).toBe(true);
      expect(strategy.referenceStrategy.characterRef).toBe("bake_into_first");
      expect(strategy.referenceStrategy.sceneRef).toBe("bake_into_first");
    });
  });

  describe("CogVideoX", () => {
    it("cogvideox-3 does not support character ref or last frame", () => {
      const strategy = getVideoGenerationStrategy("cogvideox-3");
      expect(strategy.useCharacterRef).toBe(false);
      expect(strategy.useSceneRef).toBe(false);
      expect(strategy.characterRefMode).toBe("none");
      expect(strategy.sceneRefMode).toBe("none");
      expect(strategy.useLastFrame).toBe(false);
    });
  });

  describe("MiniMax", () => {
    it("MiniMax-Hailuo-02 uses native_field for character, text_append for scene", () => {
      const strategy = getVideoGenerationStrategy("MiniMax-Hailuo-02");
      expect(strategy.useCharacterRef).toBe(true);
      expect(strategy.characterRefMode).toBe("native_field");
      expect(strategy.useSceneRef).toBe(true);
      expect(strategy.sceneRefMode).toBe("text_append");
      expect(strategy.useLastFrame).toBe(false);
    });
  });

  describe("S2V-01", () => {
    it("S2V-01 uses native_field for character ref", () => {
      const strategy = getVideoGenerationStrategy("S2V-01");
      expect(strategy.useCharacterRef).toBe(true);
      expect(strategy.characterRefMode).toBe("native_field");
      expect(strategy.useLastFrame).toBe(true);
    });
  });

  describe("strategy filtering logic", () => {
    it("when useCharacterRef is false, characterRefs should be filtered to undefined", () => {
      const strategy = getVideoGenerationStrategy("doubao-seedance-2-0-260128");
      expect(strategy.useCharacterRef).toBe(false);

      const characterRefs = ["https://example.com/char1.jpg"];
      const filteredRefs = strategy.useCharacterRef ? characterRefs : undefined;
      expect(filteredRefs).toBeUndefined();
    });

    it("when useSceneRef is false, sceneRef should be filtered to undefined", () => {
      const strategy = getVideoGenerationStrategy("kling-v1");
      expect(strategy.useSceneRef).toBe(false);

      const sceneRef = "https://example.com/scene.jpg";
      const filteredSceneRef = strategy.useSceneRef ? sceneRef : undefined;
      expect(filteredSceneRef).toBeUndefined();
    });

    it("when useCharacterRef is true, characterRefs should be preserved", () => {
      const strategy = getVideoGenerationStrategy("kling-v2-master");
      expect(strategy.useCharacterRef).toBe(true);

      const characterRefs = ["https://example.com/char1.jpg"];
      const filteredRefs = strategy.useCharacterRef ? characterRefs : undefined;
      expect(filteredRefs).toEqual(characterRefs);
    });

    it("unknown model with text_append still preserves refs", () => {
      const strategy = getVideoGenerationStrategy("some-unknown-model-456");
      expect(strategy.useCharacterRef).toBe(true);
      expect(strategy.useSceneRef).toBe(true);

      const characterRefs = ["https://example.com/char1.jpg"];
      const sceneRef = "https://example.com/scene.jpg";
      expect(strategy.useCharacterRef ? characterRefs : undefined).toEqual(characterRefs);
      expect(strategy.useSceneRef ? sceneRef : undefined).toBe(sceneRef);
    });
  });

  describe("referenceStrategy delivery modes", () => {
    it("bake_into_first mode maps to bake_into_first delivery", () => {
      const strategy = getVideoGenerationStrategy("doubao-seedance-2-0-260128");
      expect(strategy.referenceStrategy.characterRef).toBe("bake_into_first");
      expect(strategy.referenceStrategy.sceneRef).toBe("bake_into_first");
    });

    it("ref_field with nativeRef=true maps to both delivery", () => {
      const strategy = getVideoGenerationStrategy("doubao-seedance-1-0-lite-i2v-250428");
      expect(strategy.referenceStrategy.characterRef).toBe("both");
      expect(strategy.referenceStrategy.sceneRef).toBe("both");
    });

    it("native_field with nativeRef=true maps to both delivery", () => {
      const strategy = getVideoGenerationStrategy("kling-v2-master");
      expect(strategy.referenceStrategy.characterRef).toBe("both");
    });

    it("text_append maps to bake_into_first delivery", () => {
      const strategy = getVideoGenerationStrategy("some-unknown-model-789");
      expect(strategy.referenceStrategy.characterRef).toBe("bake_into_first");
      expect(strategy.referenceStrategy.sceneRef).toBe("bake_into_first");
    });

    it("none mode maps to bake_into_first delivery", () => {
      const strategy = getVideoGenerationStrategy("cogvideox-3");
      expect(strategy.referenceStrategy.characterRef).toBe("bake_into_first");
      expect(strategy.referenceStrategy.sceneRef).toBe("bake_into_first");
    });
  });

  describe("promptLanguage", () => {
    it("returns auto for models without explicit promptLanguage", () => {
      const strategy = getVideoGenerationStrategy("kling-v2-master");
      expect(strategy.promptLanguage).toBe("auto");
    });
  });

  describe("imageUploadMode", () => {
    it("returns upload for Kling models", () => {
      const strategy = getVideoGenerationStrategy("kling-v2-master");
      expect(strategy.imageUploadMode).toBe("upload");
    });

    it("returns base64 for Volcengine models", () => {
      const strategy = getVideoGenerationStrategy("doubao-seedance-2-0-260128");
      expect(strategy.imageUploadMode).toBe("base64");
    });
  });

  describe("maxCharacterRefs", () => {
    it("returns model-specific maxCharacterRefs when defined", () => {
      const strategy = getVideoGenerationStrategy("kling-v2-master");
      expect(strategy.maxCharacterRefs).toBe(1);
    });

    it("falls back to maxReferences when maxCharacterRefs not defined", () => {
      const strategy = getVideoGenerationStrategy("some-unknown-model-999");
      expect(strategy.maxCharacterRefs).toBe(4);
    });
  });

  describe("useFirstFrame is always true", () => {
    it("always returns useFirstFrame: true", () => {
      const models = [
        "doubao-seedance-2-0-260128",
        "kling-v2-master",
        "cogvideox-3",
        "veo-3",
        "S2V-01",
      ];
      for (const modelId of models) {
        expect(getVideoGenerationStrategy(modelId).useFirstFrame).toBe(true);
      }
    });
  });
});
