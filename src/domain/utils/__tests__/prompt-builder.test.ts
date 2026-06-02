import { describe, it, expect } from "vitest";
import {
  joinParts,
  QUALITY_TAGS_IMAGE,
  QUALITY_TAGS_VIDEO,
  STYLE_KEYWORDS,
  SCENE_TYPE_KEYWORDS,
  MOOD_KEYWORDS,
  LIGHTING_KEYWORDS,
  CAMERA_ANGLE_KEYWORDS,
  CAMERA_MOVEMENT_KEYWORDS,
  TRANSITION_KEYWORDS,
  POSITION_KEYWORDS,
  buildCharacterAppearanceDesc,
  buildCharacterFullDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  buildElementEffectDesc,
  buildFixedImageDesc,
  buildReferenceVideoDesc,
  buildTemplateDesc,
  getStyleKeywords,
  getSceneTypeKeywords,
  getMoodKeywords,
} from "@/domain/utils/prompt-vocabulary";
import type { Character, Scene, SceneElement, FixedImageConfig, ReferenceVideoConfig, TemplateConfig } from "@/domain/schemas";

function createMockCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Test Character",
    style: "anime",
    gender: "female",
    age: 18,
    personality: ["cheerful", "brave"],
    appearance: {
      hairColor: "black",
      hairStyle: "long",
      eyeColor: "blue",
      height: "tall",
      build: "slim",
      clothing: "school uniform",
    },
    description: "A brave girl with a bright smile",
    ...overrides,
  } as Character;
}

function createMockScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    name: "Test Scene",
    description: "A beautiful park",
    timeOfDay: "sunset",
    weather: "clear",
    mood: "peaceful",
    lighting: "warm",
    elements: ["trees", "bench"],
    colors: ["green", "golden"],
    ...overrides,
  } as Scene;
}

describe("prompt-vocabulary", () => {
  describe("joinParts", () => {
    it("should join truthy parts with default separator", () => {
      expect(joinParts(["a", "b", "c"])).toBe("a, b, c");
    });

    it("should filter out falsy values", () => {
      expect(joinParts(["a", null, "b", undefined, "c", false, ""])).toBe("a, b, c");
    });

    it("should use custom separator", () => {
      expect(joinParts(["a", "b", "c"], " | ")).toBe("a | b | c");
    });

    it("should return empty string for all falsy parts", () => {
      expect(joinParts([null, undefined, false, ""])).toBe("");
    });

    it("should return empty string for empty array", () => {
      expect(joinParts([])).toBe("");
    });

    it("should handle single element", () => {
      expect(joinParts(["only"])).toBe("only");
    });
  });

  describe("QUALITY_TAGS_IMAGE", () => {
    it("should contain expected quality tags", () => {
      expect(QUALITY_TAGS_IMAGE).toContain("masterpiece");
      expect(QUALITY_TAGS_IMAGE).toContain("best quality");
      expect(QUALITY_TAGS_IMAGE).toContain("highly detailed");
    });
  });

  describe("QUALITY_TAGS_VIDEO", () => {
    it("should contain expected quality tags", () => {
      expect(QUALITY_TAGS_VIDEO).toContain("high quality");
      expect(QUALITY_TAGS_VIDEO).toContain("smooth motion");
      expect(QUALITY_TAGS_VIDEO).toContain("cinematic");
    });
  });

  describe("STYLE_KEYWORDS", () => {
    it("should have keywords for anime style", () => {
      expect(STYLE_KEYWORDS.anime).toBeDefined();
      expect(STYLE_KEYWORDS.anime.length).toBeGreaterThan(0);
    });

    it("should have keywords for realistic style", () => {
      expect(STYLE_KEYWORDS.realistic).toBeDefined();
      expect(STYLE_KEYWORDS.realistic.length).toBeGreaterThan(0);
    });

    it("should have keywords for 3d style", () => {
      expect(STYLE_KEYWORDS["3d"]).toBeDefined();
    });
  });

  describe("SCENE_TYPE_KEYWORDS", () => {
    it("should have keywords for indoor scene", () => {
      expect(SCENE_TYPE_KEYWORDS["室内"]).toBeDefined();
    });

    it("should have keywords for outdoor scene", () => {
      expect(SCENE_TYPE_KEYWORDS["室外"]).toBeDefined();
    });
  });

  describe("MOOD_KEYWORDS", () => {
    it("should have keywords for peaceful mood", () => {
      expect(MOOD_KEYWORDS["平静"]).toBeDefined();
    });

    it("should have keywords for tense mood", () => {
      expect(MOOD_KEYWORDS["紧张"]).toBeDefined();
    });
  });

  describe("LIGHTING_KEYWORDS", () => {
    it("should have keyword for natural lighting", () => {
      expect(LIGHTING_KEYWORDS["自然光"]).toBe("natural lighting");
    });

    it("should have keyword for neon lighting", () => {
      expect(LIGHTING_KEYWORDS["霓虹"]).toBe("neon lighting, colorful glow");
    });
  });

  describe("CAMERA_ANGLE_KEYWORDS", () => {
    it("should have keyword for eye level", () => {
      expect(CAMERA_ANGLE_KEYWORDS["平视"]).toBe("eye level shot");
    });

    it("should have keyword for bird's eye view", () => {
      expect(CAMERA_ANGLE_KEYWORDS["鸟瞰"]).toBe("bird's eye view, overhead");
    });
  });

  describe("CAMERA_MOVEMENT_KEYWORDS", () => {
    it("should have keyword for static camera", () => {
      expect(CAMERA_MOVEMENT_KEYWORDS["固定"]).toBe("static camera, fixed shot");
    });

    it("should have keyword for push in", () => {
      expect(CAMERA_MOVEMENT_KEYWORDS["推"]).toBe("push in, zoom in, dolly in");
    });
  });

  describe("TRANSITION_KEYWORDS", () => {
    it("should have empty string for no transition", () => {
      expect(TRANSITION_KEYWORDS["无"]).toBe("");
    });

    it("should have keyword for fade transition", () => {
      expect(TRANSITION_KEYWORDS["淡入淡出"]).toBe("fade transition");
    });
  });

  describe("POSITION_KEYWORDS", () => {
    it("should have keyword for left position", () => {
      expect(POSITION_KEYWORDS["左侧"]).toBe("positioned on the left side");
    });

    it("should have keyword for center position", () => {
      expect(POSITION_KEYWORDS["中间"]).toBe("positioned in the center");
    });
  });

  describe("buildCharacterAppearanceDesc", () => {
    it("should build appearance description with all fields", () => {
      const char = createMockCharacter();
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("black发色");
      expect(result).toContain("long发型");
      expect(result).toContain("blue眼睛");
      expect(result).toContain("tall身材");
      expect(result).toContain("slim体型");
      expect(result).toContain("穿着school uniform");
    });

    it("should handle character with no appearance fields", () => {
      const char = createMockCharacter({
        appearance: {} as Character["appearance"],
      });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("面部特征清晰");
      expect(result).toContain("无特殊配饰");
    });

    it("should add face description when description lacks face keywords", () => {
      const char = createMockCharacter({ description: "A brave girl" });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("面部特征清晰");
    });

    it("should not add face description when description has face keywords", () => {
      const char = createMockCharacter({ description: "A girl with a round face" });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).not.toContain("面部特征清晰");
    });

    it("should add accessory description when description lacks accessory keywords", () => {
      const char = createMockCharacter({ description: "A brave girl" });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("无特殊配饰");
    });

    it("should not add accessory description when description has accessory keywords", () => {
      const char = createMockCharacter({ description: "A girl wearing a necklace" });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).not.toContain("无特殊配饰");
    });

    it("should handle partial appearance fields", () => {
      const char = createMockCharacter({
        appearance: { hairColor: "red" } as Character["appearance"],
      });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("red发色");
    });
  });

  describe("buildCharacterFullDesc", () => {
    it("should build full character description", () => {
      const char = createMockCharacter();
      const result = buildCharacterFullDesc(char);
      expect(result).toContain("anime风格");
      expect(result).toContain("female");
      expect(result).toContain("18岁");
      expect(result).toContain("性格cheerful、brave");
      expect(result).toContain("A brave girl with a bright smile");
    });

    it("should handle character without style", () => {
      const char = createMockCharacter({ style: undefined });
      const result = buildCharacterFullDesc(char);
      expect(result).not.toContain("undefined风格");
    });

    it("should handle character without personality", () => {
      const char = createMockCharacter({ personality: [] });
      const result = buildCharacterFullDesc(char);
      expect(result).not.toContain("性格");
    });
  });

  describe("buildSceneAtmosphereDesc", () => {
    it("should build atmosphere description with all fields", () => {
      const scene = createMockScene();
      const result = buildSceneAtmosphereDesc(scene);
      expect(result).toContain("sunset");
      expect(result).toContain("clear");
      expect(result).toContain("peaceful氛围");
      expect(result).toContain("warm照明");
    });

    it("should handle scene with partial fields", () => {
      const scene = createMockScene({
        timeOfDay: undefined,
        weather: undefined,
      });
      const result = buildSceneAtmosphereDesc(scene);
      expect(result).toContain("peaceful氛围");
    });
  });

  describe("buildSceneVisualDesc", () => {
    it("should build visual description with elements and colors", () => {
      const scene = createMockScene();
      const result = buildSceneVisualDesc(scene);
      expect(result).toContain("trees、bench");
      expect(result).toContain("green、golden色调");
    });

    it("should handle scene without elements", () => {
      const scene = createMockScene({ elements: [] });
      const result = buildSceneVisualDesc(scene);
      expect(result).not.toContain("包含");
    });

    it("should handle scene without colors", () => {
      const scene = createMockScene({ colors: [] });
      const result = buildSceneVisualDesc(scene);
      expect(result).not.toContain("色调");
    });
  });

  describe("buildElementEffectDesc", () => {
    it("should build element description with all fields", () => {
      const element = {
        dialogue: "Hello!",
        action: "waving hand",
        emotion: "happy",
        position: "center",
        pose: "standing",
      } as SceneElement;
      const result = buildElementEffectDesc(element);
      expect(result).toContain("说\"Hello!\"");
      expect(result).toContain("waving hand");
      expect(result).toContain("表情happy");
      expect(result).toContain("位于center");
      expect(result).toContain("standing姿态");
    });

    it("should handle element with no fields", () => {
      const element = {} as SceneElement;
      const result = buildElementEffectDesc(element);
      expect(result).toBe("");
    });
  });

  describe("buildFixedImageDesc", () => {
    it("should return empty string when not enabled", () => {
      const config = { enabled: false } as FixedImageConfig;
      expect(buildFixedImageDesc(config)).toBe("");
    });

    it("should build description with character references", () => {
      const config = {
        enabled: true,
        characters: [{ characterName: "Alice" }],
      } as unknown as FixedImageConfig;
      const result = buildFixedImageDesc(config);
      expect(result).toContain("Alice");
      expect(result).toContain("角色");
    });

    it("should build description with scene image reference", () => {
      const config = {
        enabled: true,
        imageUrl: "https://example.com/scene.png",
        lockType: "scene",
      } as unknown as FixedImageConfig;
      const result = buildFixedImageDesc(config);
      expect(result).toContain("场景");
    });

    it("should build description with both characters and scene", () => {
      const config = {
        enabled: true,
        characters: [{ characterName: "Alice" }, { characterName: "Bob" }],
        imageUrl: "https://example.com/scene.png",
        lockType: "scene",
      } as unknown as FixedImageConfig;
      const result = buildFixedImageDesc(config);
      expect(result).toContain("Alice");
      expect(result).toContain("Bob");
      expect(result).toContain("场景");
    });

    it("should not include scene when lockType is not scene", () => {
      const config = {
        enabled: true,
        characters: [{ characterName: "Alice" }],
        imageUrl: "https://example.com/ref.png",
        lockType: "character",
      } as unknown as FixedImageConfig;
      const result = buildFixedImageDesc(config);
      expect(result).not.toContain("场景");
    });
  });

  describe("buildReferenceVideoDesc", () => {
    it("should return empty string when not enabled", () => {
      const config = { enabled: false } as ReferenceVideoConfig;
      expect(buildReferenceVideoDesc(config)).toBe("");
    });

    it("should return light mimicry description", () => {
      const config = { enabled: true, mimicryLevel: "light" } as ReferenceVideoConfig;
      const result = buildReferenceVideoDesc(config);
      expect(result).toContain("轻度模仿");
    });

    it("should return medium mimicry description", () => {
      const config = { enabled: true, mimicryLevel: "medium" } as ReferenceVideoConfig;
      const result = buildReferenceVideoDesc(config);
      expect(result).toContain("中度模仿");
    });

    it("should return deep mimicry description", () => {
      const config = { enabled: true, mimicryLevel: "deep" } as ReferenceVideoConfig;
      const result = buildReferenceVideoDesc(config);
      expect(result).toContain("深度模仿");
    });

    it("should return empty string for unknown mimicry level", () => {
      const config = { enabled: true, mimicryLevel: "unknown" } as unknown as ReferenceVideoConfig;
      expect(buildReferenceVideoDesc(config)).toBe("");
    });
  });

  describe("buildTemplateDesc", () => {
    it("should return empty string when not enabled", () => {
      const config = { enabled: false } as TemplateConfig;
      expect(buildTemplateDesc(config)).toBe("");
    });

    it("should return empty string when no template", () => {
      const config = { enabled: true, template: null } as unknown as TemplateConfig;
      expect(buildTemplateDesc(config)).toBe("");
    });

    it("should build template description with name", () => {
      const config = {
        enabled: true,
        template: { name: "Action Template" },
        matchCamera: true,
        matchTransition: false,
        matchTiming: true,
      } as unknown as TemplateConfig;
      const result = buildTemplateDesc(config);
      expect(result).toContain("Action Template");
      expect(result).toContain("匹配运镜");
      expect(result).toContain("匹配时间节奏");
      expect(result).not.toContain("匹配转场");
    });

    it("should handle template without name", () => {
      const config = {
        enabled: true,
        template: {},
      } as unknown as TemplateConfig;
      const result = buildTemplateDesc(config);
      expect(result).toContain("未知");
    });
  });

  describe("getStyleKeywords", () => {
    it("should return keywords for known style", () => {
      const result = getStyleKeywords("anime");
      expect(result).toEqual(STYLE_KEYWORDS.anime);
    });

    it("should return realistic keywords for unknown style", () => {
      const result = getStyleKeywords("unknown_style");
      expect(result).toEqual(STYLE_KEYWORDS.realistic);
    });
  });

  describe("getSceneTypeKeywords", () => {
    it("should return keywords for known scene type", () => {
      const result = getSceneTypeKeywords("室内");
      expect(result).toEqual(SCENE_TYPE_KEYWORDS["室内"]);
    });

    it("should return empty array for unknown scene type", () => {
      const result = getSceneTypeKeywords("unknown");
      expect(result).toEqual([]);
    });
  });

  describe("getMoodKeywords", () => {
    it("should return keywords for known mood", () => {
      const result = getMoodKeywords("平静");
      expect(result).toEqual(MOOD_KEYWORDS["平静"]);
    });

    it("should return empty array for unknown mood", () => {
      const result = getMoodKeywords("unknown");
      expect(result).toEqual([]);
    });
  });
});
