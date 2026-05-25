import { describe, it, expect } from "vitest";
import {
  joinParts,
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
} from "@/modules/prompt/base";
import {
  generateCharacterImagePrompt,
  generateOutfitImagePrompt,
  generateCharacterDetailedPromptInstruction,
  generateSimpleCharacterImagePrompt,
} from "@/modules/prompt/character";
import {
  generateSceneImagePrompt,
  generateSimpleSceneImagePrompt,
  generateScenePromptOptimization,
} from "@/modules/prompt/scene";
import {
  generateQuickModeVideoPrompt,
  AVAILABLE_STYLES,
  DURATION_OPTIONS,
  RESOLUTION_OPTIONS,
} from "@/modules/prompt/builder";
import { generateStoryPlanPrompt } from "@/modules/prompt/builder";
import type {
  Character,
  CharacterOutfit,
  Scene,
  SceneElement,
  FixedImageConfig,
  ReferenceVideoConfig,
  TemplateConfig,
} from "@/domain/schemas";

const makeCharacter = (overrides: Partial<Character> = {}): Character => ({
  id: "char-1",
  name: "测试角色",
  gender: "女性",
  age: 25,
  style: "anime",
  personality: ["勇敢", "聪明"],
  description: "一个测试角色",
  appearance: {
    hairColor: "银色",
    hairStyle: "长发",
    eyeColor: "蓝色",
    height: "170cm",
    build: "纤细",
    clothing: "战斗服",
  },
  outfits: [],
  prompt: "",
  ...overrides,
});

const makeScene = (overrides: Partial<Scene> = {}): Scene => ({
  id: "scene-1",
  name: "测试场景",
  type: "室内",
  description: "一个测试场景",
  timeOfDay: "黄昏",
  weather: "晴朗",
  mood: "平静",
  lighting: "自然光",
  elements: ["桌子", "椅子"],
  colors: ["暖色调"],
  camera: { angle: "平视", movement: "固定" },
  prompt: "",
  ...overrides,
});

const makeSceneElement = (
  overrides: Partial<SceneElement> = {},
): SceneElement => ({
  id: "elem-1",
  name: "测试元素",
  type: "existing_character",
  ...overrides,
});

describe("prompt/base", () => {
  describe("joinParts", () => {
    it("should join truthy parts with default separator", () => {
      expect(joinParts(["a", "b", "c"])).toBe("a, b, c");
    });

    it("should filter out null values", () => {
      expect(joinParts(["a", null, "b"])).toBe("a, b");
    });

    it("should filter out undefined values", () => {
      expect(joinParts(["a", undefined, "b"])).toBe("a, b");
    });

    it("should filter out false values", () => {
      expect(joinParts(["a", false, "b"])).toBe("a, b");
    });

    it("should filter out empty strings", () => {
      expect(joinParts(["a", "", "b"])).toBe("a, b");
    });

    it("should return empty string when all parts are falsy", () => {
      expect(joinParts([null, undefined, false, ""])).toBe("");
    });

    it("should use custom separator when provided", () => {
      expect(joinParts(["a", "b", "c"], " | ")).toBe("a | b | c");
    });

    it("should return empty string for empty array", () => {
      expect(joinParts([])).toBe("");
    });
  });

  describe("buildCharacterAppearanceDesc", () => {
    it("should build appearance description with all fields", () => {
      const char = makeCharacter();
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("银色发色");
      expect(result).toContain("长发发型");
      expect(result).toContain("蓝色眼睛");
      expect(result).toContain("170cm身材");
      expect(result).toContain("纤细体型");
      expect(result).toContain("穿着战斗服");
    });

    it("should include '面部特征清晰' when description lacks face keywords", () => {
      const char = makeCharacter({ description: "一个普通角色" });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("面部特征清晰");
    });

    it("should not include '面部特征清晰' when description has face keywords", () => {
      const char = makeCharacter({ description: "圆脸的角色" });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).not.toContain("面部特征清晰");
    });

    it("should include '无特殊配饰' when description lacks accessory keywords", () => {
      const char = makeCharacter({ description: "一个普通角色" });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("无特殊配饰");
    });

    it("should not include '无特殊配饰' when description has accessory keywords", () => {
      const char = makeCharacter({ description: "戴着耳环的角色" });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).not.toContain("无特殊配饰");
    });

    it("should include default face/accessory descriptions when all fields empty", () => {
      const char = makeCharacter({
        appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
        description: "",
      });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("面部特征清晰");
      expect(result).toContain("无特殊配饰");
    });

    it("should handle partial appearance fields", () => {
      const char = makeCharacter({
        appearance: { hairColor: "金色", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "长裙" },
        description: "",
      });
      const result = buildCharacterAppearanceDesc(char);
      expect(result).toContain("金色发色");
      expect(result).toContain("穿着长裙");
      expect(result).not.toContain("发型");
      expect(result).not.toContain("眼睛");
    });
  });

  describe("buildCharacterFullDesc", () => {
    it("should build full character description with all fields", () => {
      const char = makeCharacter();
      const result = buildCharacterFullDesc(char);
      expect(result).toContain("anime风格");
      expect(result).toContain("女性");
      expect(result).toContain("25岁");
      expect(result).toContain("银色发色");
      expect(result).toContain("性格勇敢、聪明");
      expect(result).toContain("一个测试角色");
    });

    it("should skip style when empty", () => {
      const char = makeCharacter({ style: "" });
      const result = buildCharacterFullDesc(char);
      expect(result).not.toContain("风格");
    });

    it("should skip gender when empty", () => {
      const char = makeCharacter({ gender: "" });
      const result = buildCharacterFullDesc(char);
      expect(result).not.toContain("女性");
    });

    it("should skip age when falsy", () => {
      const char = makeCharacter({ age: 0 });
      const result = buildCharacterFullDesc(char);
      expect(result).not.toContain("岁");
    });

    it("should skip personality when empty", () => {
      const char = makeCharacter({ personality: [] });
      const result = buildCharacterFullDesc(char);
      expect(result).not.toContain("性格");
    });

    it("should skip description when empty", () => {
      const char = makeCharacter({ description: "" });
      const result = buildCharacterFullDesc(char);
      expect(result).not.toContain("一个测试角色");
    });

    it("should return default face/accessory descriptions for minimal character with no data", () => {
      const char = makeCharacter({
        style: "",
        gender: "",
        age: 0,
        personality: [],
        description: "",
        appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      });
      const result = buildCharacterFullDesc(char);
      expect(result).toContain("面部特征清晰");
      expect(result).toContain("无特殊配饰");
    });
  });

  describe("buildSceneAtmosphereDesc", () => {
    it("should build atmosphere description with all fields", () => {
      const scene = makeScene();
      const result = buildSceneAtmosphereDesc(scene);
      expect(result).toContain("黄昏");
      expect(result).toContain("晴朗");
      expect(result).toContain("平静氛围");
      expect(result).toContain("自然光照明");
    });

    it("should skip empty fields", () => {
      const scene = makeScene({ timeOfDay: "", weather: "", mood: "", lighting: "" });
      const result = buildSceneAtmosphereDesc(scene);
      expect(result).toBe("");
    });

    it("should handle partial fields", () => {
      const scene = makeScene({ timeOfDay: "夜晚", weather: "", mood: "", lighting: "" });
      const result = buildSceneAtmosphereDesc(scene);
      expect(result).toBe("夜晚");
    });
  });

  describe("buildSceneVisualDesc", () => {
    it("should build visual description with elements and colors", () => {
      const scene = makeScene();
      const result = buildSceneVisualDesc(scene);
      expect(result).toContain("包含桌子、椅子");
      expect(result).toContain("暖色调色调");
    });

    it("should handle empty elements", () => {
      const scene = makeScene({ elements: [], colors: ["冷色调"] });
      const result = buildSceneVisualDesc(scene);
      expect(result).not.toContain("包含");
      expect(result).toContain("冷色调色调");
    });

    it("should handle empty colors", () => {
      const scene = makeScene({ elements: ["山"], colors: [] });
      const result = buildSceneVisualDesc(scene);
      expect(result).toContain("包含山");
      expect(result).not.toContain("色调");
    });

    it("should return empty string when both are empty", () => {
      const scene = makeScene({ elements: [], colors: [] });
      const result = buildSceneVisualDesc(scene);
      expect(result).toBe("");
    });
  });

  describe("buildElementEffectDesc", () => {
    it("should build element effect with all fields", () => {
      const elem = makeSceneElement({
        dialogue: "你好",
        action: "挥剑",
        emotion: "愤怒",
        position: "左侧",
        pose: "站立",
      });
      const result = buildElementEffectDesc(elem);
      expect(result).toContain('说"你好"');
      expect(result).toContain("挥剑");
      expect(result).toContain("表情愤怒");
      expect(result).toContain("位于左侧");
      expect(result).toContain("站立姿态");
    });

    it("should skip empty fields", () => {
      const elem = makeSceneElement({
        dialogue: "",
        action: "",
        emotion: "",
        position: "",
        pose: "",
      });
      const result = buildElementEffectDesc(elem);
      expect(result).toBe("");
    });

    it("should handle partial fields", () => {
      const elem = makeSceneElement({ dialogue: "再见", action: "转身" });
      const result = buildElementEffectDesc(elem);
      expect(result).toContain('说"再见"');
      expect(result).toContain("转身");
      expect(result).not.toContain("表情");
      expect(result).not.toContain("位于");
    });
  });

  describe("buildFixedImageDesc", () => {
    it("should return empty string when disabled", () => {
      const config: FixedImageConfig = {
        enabled: false,
        lockType: "character",
      };
      expect(buildFixedImageDesc(config)).toBe("");
    });

    it("should describe character image references when enabled with characters", () => {
      const config: FixedImageConfig = {
        enabled: true,
        lockType: "character",
        characters: [
          { characterId: "c1", characterName: "角色A", imageUrl: "http://img1.png" },
        ],
      };
      const result = buildFixedImageDesc(config);
      expect(result).toContain('[图片1]');
      expect(result).toContain('角色"角色A"');
      expect(result).toContain('角色外观生成');
    });

    it("should describe scene image reference when lockType is scene and imageUrl provided", () => {
      const config: FixedImageConfig = {
        enabled: true,
        lockType: "scene",
        imageUrl: "http://scene.png",
      };
      const result = buildFixedImageDesc(config);
      expect(result).toContain('[图片1]');
      expect(result).toContain('场景的形象参考图');
    });

    it("should number scene image after character images", () => {
      const config: FixedImageConfig = {
        enabled: true,
        lockType: "scene",
        imageUrl: "http://scene.png",
        characters: [
          { characterId: "c1", characterName: "角色A", imageUrl: "http://img1.png" },
          { characterId: "c2", characterName: "角色B", imageUrl: "http://img2.png" },
        ],
      };
      const result = buildFixedImageDesc(config);
      expect(result).toContain('[图片3]');
      expect(result).toContain('场景的形象参考图');
    });

    it("should not include scene image when lockType is not scene", () => {
      const config: FixedImageConfig = {
        enabled: true,
        lockType: "character",
        imageUrl: "http://img.png",
      };
      const result = buildFixedImageDesc(config);
      expect(result).not.toContain('场景的形象参考图');
    });
  });

  describe("buildReferenceVideoDesc", () => {
    it("should return empty string when disabled", () => {
      const config: ReferenceVideoConfig = {
        enabled: false,
        mimicryLevel: "light",
      };
      expect(buildReferenceVideoDesc(config)).toBe("");
    });

    it("should describe light mimicry level", () => {
      const config: ReferenceVideoConfig = {
        enabled: true,
        mimicryLevel: "light",
      };
      expect(buildReferenceVideoDesc(config)).toBe("轻度模仿参考视频风格");
    });

    it("should describe medium mimicry level", () => {
      const config: ReferenceVideoConfig = {
        enabled: true,
        mimicryLevel: "medium",
      };
      expect(buildReferenceVideoDesc(config)).toBe("中度模仿参考视频风格和节奏");
    });

    it("should describe deep mimicry level", () => {
      const config: ReferenceVideoConfig = {
        enabled: true,
        mimicryLevel: "deep",
      };
      expect(buildReferenceVideoDesc(config)).toBe("深度模仿参考视频的风格、节奏和构图");
    });
  });

  describe("buildTemplateDesc", () => {
    it("should return empty string when disabled", () => {
      const config: TemplateConfig = {
        enabled: false,
        template: { name: "模板A" },
      };
      expect(buildTemplateDesc(config)).toBe("");
    });

    it("should return empty string when template is missing", () => {
      const config: TemplateConfig = {
        enabled: true,
      };
      expect(buildTemplateDesc(config)).toBe("");
    });

    it("should describe template with name", () => {
      const config: TemplateConfig = {
        enabled: true,
        template: { name: "电影级运镜" },
      };
      const result = buildTemplateDesc(config);
      expect(result).toContain('使用"电影级运镜"模板');
    });

    it("should use '未知' when template has no name", () => {
      const config: TemplateConfig = {
        enabled: true,
        template: {},
      };
      const result = buildTemplateDesc(config);
      expect(result).toContain('使用"未知"模板');
    });

    it("should include match options when enabled", () => {
      const config: TemplateConfig = {
        enabled: true,
        template: { name: "模板A" },
        matchCamera: true,
        matchTransition: true,
        matchTiming: true,
      };
      const result = buildTemplateDesc(config);
      expect(result).toContain("匹配运镜");
      expect(result).toContain("匹配转场");
      expect(result).toContain("匹配时间节奏");
    });

    it("should not include match options when not set", () => {
      const config: TemplateConfig = {
        enabled: true,
        template: { name: "模板A" },
      };
      const result = buildTemplateDesc(config);
      expect(result).not.toContain("匹配运镜");
      expect(result).not.toContain("匹配转场");
      expect(result).not.toContain("匹配时间节奏");
    });
  });

  describe("getStyleKeywords", () => {
    it("should return keywords for known style 'anime'", () => {
      const result = getStyleKeywords("anime");
      expect(result).toEqual(STYLE_KEYWORDS.anime);
      expect(result).toContain("anime style");
    });

    it("should return keywords for known style 'realistic'", () => {
      const result = getStyleKeywords("realistic");
      expect(result).toEqual(STYLE_KEYWORDS.realistic);
    });

    it("should return realistic keywords as fallback for unknown style", () => {
      const result = getStyleKeywords("nonexistent");
      expect(result).toEqual(STYLE_KEYWORDS.realistic);
    });

    it("should return keywords for all known styles", () => {
      const styles = Object.keys(STYLE_KEYWORDS);
      for (const style of styles) {
        const result = getStyleKeywords(style);
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getSceneTypeKeywords", () => {
    it("should return keywords for known type '室内'", () => {
      const result = getSceneTypeKeywords("室内");
      expect(result).toEqual(SCENE_TYPE_KEYWORDS["室内"]);
      expect(result).toContain("interior");
    });

    it("should return empty array for unknown type", () => {
      const result = getSceneTypeKeywords("未知类型");
      expect(result).toEqual([]);
    });
  });

  describe("getMoodKeywords", () => {
    it("should return keywords for known mood '平静'", () => {
      const result = getMoodKeywords("平静");
      expect(result).toEqual(MOOD_KEYWORDS["平静"]);
      expect(result).toContain("peaceful");
    });

    it("should return empty array for unknown mood", () => {
      const result = getMoodKeywords("未知情绪");
      expect(result).toEqual([]);
    });
  });

  describe("keyword constants", () => {
    it("QUALITY_TAGS_IMAGE should be non-empty array", () => {
      expect(Array.isArray(QUALITY_TAGS_IMAGE)).toBe(true);
      expect(QUALITY_TAGS_IMAGE.length).toBeGreaterThan(0);
    });

    it("QUALITY_TAGS_VIDEO should be non-empty array", () => {
      expect(Array.isArray(QUALITY_TAGS_VIDEO)).toBe(true);
      expect(QUALITY_TAGS_VIDEO.length).toBeGreaterThan(0);
    });

    it("STYLE_KEYWORDS should be non-empty object", () => {
      expect(typeof STYLE_KEYWORDS).toBe("object");
      expect(Object.keys(STYLE_KEYWORDS).length).toBeGreaterThan(0);
    });

    it("SCENE_TYPE_KEYWORDS should be non-empty object", () => {
      expect(typeof SCENE_TYPE_KEYWORDS).toBe("object");
      expect(Object.keys(SCENE_TYPE_KEYWORDS).length).toBeGreaterThan(0);
    });

    it("MOOD_KEYWORDS should be non-empty object", () => {
      expect(typeof MOOD_KEYWORDS).toBe("object");
      expect(Object.keys(MOOD_KEYWORDS).length).toBeGreaterThan(0);
    });

    it("LIGHTING_KEYWORDS should be non-empty object", () => {
      expect(typeof LIGHTING_KEYWORDS).toBe("object");
      expect(Object.keys(LIGHTING_KEYWORDS).length).toBeGreaterThan(0);
    });

    it("CAMERA_ANGLE_KEYWORDS should be non-empty object", () => {
      expect(typeof CAMERA_ANGLE_KEYWORDS).toBe("object");
      expect(Object.keys(CAMERA_ANGLE_KEYWORDS).length).toBeGreaterThan(0);
    });

    it("CAMERA_MOVEMENT_KEYWORDS should be non-empty object", () => {
      expect(typeof CAMERA_MOVEMENT_KEYWORDS).toBe("object");
      expect(Object.keys(CAMERA_MOVEMENT_KEYWORDS).length).toBeGreaterThan(0);
    });

    it("TRANSITION_KEYWORDS should be non-empty object", () => {
      expect(typeof TRANSITION_KEYWORDS).toBe("object");
      expect(Object.keys(TRANSITION_KEYWORDS).length).toBeGreaterThan(0);
    });

    it("POSITION_KEYWORDS should be non-empty object", () => {
      expect(typeof POSITION_KEYWORDS).toBe("object");
      expect(Object.keys(POSITION_KEYWORDS).length).toBeGreaterThan(0);
    });
  });
});

describe("prompt/character", () => {
  describe("generateCharacterImagePrompt", () => {
    it("should generate prompt with complete character", () => {
      const char = makeCharacter();
      const result = generateCharacterImagePrompt(char);
      expect(result).toContain("anime style");
      expect(result).toContain("character design sheet");
      expect(result).toContain("full body");
      expect(result).toContain("white background");
      expect(result).toContain("masterpiece");
    });

    it("should return empty string when name, description, and gender are all empty", () => {
      const char = makeCharacter({ name: "", description: "", gender: "" });
      const result = generateCharacterImagePrompt(char);
      expect(result).toBe("");
    });

    it("should generate prompt when only name is provided", () => {
      const char = makeCharacter({ name: "角色A", description: "", gender: "" });
      const result = generateCharacterImagePrompt(char);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should generate prompt when only gender is provided", () => {
      const char = makeCharacter({ name: "", description: "", gender: "男性" });
      const result = generateCharacterImagePrompt(char);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should use outfit clothing when outfitId matches", () => {
      const outfit: CharacterOutfit = {
        id: "outfit-1",
        name: "礼服",
        description: "正式礼服",
        clothing: "晚礼服",
        accessories: [],
        isDefault: false,
        createdAt: "2025-01-01T00:00:00Z",
      };
      const char = makeCharacter({ outfits: [outfit] });
      const result = generateCharacterImagePrompt(char, "outfit-1");
      expect(result).toContain("晚礼服");
    });

    it("should ignore outfit when outfitId does not match", () => {
      const outfit: CharacterOutfit = {
        id: "outfit-1",
        name: "礼服",
        description: "正式礼服",
        clothing: "晚礼服",
        accessories: [],
        isDefault: false,
        createdAt: "2025-01-01T00:00:00Z",
      };
      const char = makeCharacter({ outfits: [outfit] });
      const result = generateCharacterImagePrompt(char, "nonexistent");
      expect(result).toContain("战斗服");
    });

    it("should include quality tags", () => {
      const char = makeCharacter();
      const result = generateCharacterImagePrompt(char);
      for (const tag of QUALITY_TAGS_IMAGE) {
        expect(result).toContain(tag);
      }
    });
  });

  describe("generateOutfitImagePrompt", () => {
    it("should generate prompt with outfit clothing", () => {
      const char = makeCharacter();
      const outfit: CharacterOutfit = {
        id: "outfit-1",
        name: "泳装",
        description: "夏日泳装",
        clothing: "比基尼",
        accessories: [],
        isDefault: false,
        createdAt: "2025-01-01T00:00:00Z",
      };
      const result = generateOutfitImagePrompt(char, outfit);
      expect(result).toContain("比基尼");
      expect(result).toContain("character design sheet");
    });

    it("should return empty when character has no name, description, or gender", () => {
      const char = makeCharacter({ name: "", description: "", gender: "" });
      const outfit: CharacterOutfit = {
        id: "outfit-1",
        name: "泳装",
        description: "夏日泳装",
        clothing: "比基尼",
        accessories: [],
        isDefault: false,
        createdAt: "2025-01-01T00:00:00Z",
      };
      const result = generateOutfitImagePrompt(char, outfit);
      expect(result).toBe("");
    });
  });

  describe("generateSimpleCharacterImagePrompt", () => {
    it("should generate simple prompt with basic character info", () => {
      const char = makeCharacter();
      const result = generateSimpleCharacterImagePrompt(char);
      expect(result).toContain("测试角色");
      expect(result).toContain("女性");
      expect(result).toContain("一个测试角色");
      expect(result).toContain("发色：银色");
      expect(result).toContain("发型：长发");
      expect(result).toContain("眼睛：蓝色");
      expect(result).toContain("服装：战斗服");
      expect(result).toContain("性格：勇敢, 聪明");
    });

    it("should skip empty fields", () => {
      const char = makeCharacter({
        name: "",
        gender: "",
        description: "",
        personality: [],
        appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      });
      const result = generateSimpleCharacterImagePrompt(char);
      expect(result).toContain("full body");
      expect(result).toContain("character design");
      expect(result).toContain("high quality");
    });

    it("should always include style keywords and quality tags", () => {
      const char = makeCharacter();
      const result = generateSimpleCharacterImagePrompt(char);
      expect(result).toContain("anime style");
      expect(result).toContain("detailed");
    });
  });

  describe("generateCharacterDetailedPromptInstruction", () => {
    it("should return instruction text for valid character", () => {
      const char = makeCharacter();
      const result = generateCharacterDetailedPromptInstruction(char);
      expect(result).toContain("角色基础信息");
      expect(result).toContain("风格指导");
      expect(result).toContain("anime");
      expect(result).toContain("日式动漫风格");
    });

    it("should return empty string for character with no name/description/gender", () => {
      const char = makeCharacter({ name: "", description: "", gender: "" });
      const result = generateCharacterDetailedPromptInstruction(char);
      expect(result).toBe("");
    });

    it("should include style guide for realistic style", () => {
      const char = makeCharacter({ style: "realistic" });
      const result = generateCharacterDetailedPromptInstruction(char);
      expect(result).toContain("写实风格");
    });

    it("should include detailed requirements", () => {
      const char = makeCharacter();
      const result = generateCharacterDetailedPromptInstruction(char);
      expect(result).toContain("面部特征");
      expect(result).toContain("服装");
      expect(result).toContain("负面提示词");
    });
  });
});

describe("prompt/scene", () => {
  describe("generateSceneImagePrompt", () => {
    it("should generate prompt with complete scene", () => {
      const scene = makeScene();
      const result = generateSceneImagePrompt(scene);
      expect(result).toContain("interior");
      expect(result).toContain("peaceful");
      expect(result).toContain("natural lighting");
      expect(result).toContain("eye level shot");
      expect(result).toContain("scene design");
      expect(result).toContain("background art");
      expect(result).toContain("masterpiece");
    });

    it("should return empty string when name and description are both empty", () => {
      const scene = makeScene({ name: "", description: "" });
      const result = generateSceneImagePrompt(scene);
      expect(result).toBe("");
    });

    it("should use name when description is empty", () => {
      const scene = makeScene({ name: "森林", description: "" });
      const result = generateSceneImagePrompt(scene);
      expect(result).toContain("森林");
    });

    it("should use description when available", () => {
      const scene = makeScene({ description: "幽暗的地下城" });
      const result = generateSceneImagePrompt(scene);
      expect(result).toContain("幽暗的地下城");
    });

    it("should include atmosphere description", () => {
      const scene = makeScene();
      const result = generateSceneImagePrompt(scene);
      expect(result).toContain("黄昏");
      expect(result).toContain("平静氛围");
    });

    it("should include visual description", () => {
      const scene = makeScene();
      const result = generateSceneImagePrompt(scene);
      expect(result).toContain("桌子、椅子");
    });

    it("should handle scene without camera", () => {
      const scene = makeScene({ camera: undefined });
      const result = generateSceneImagePrompt(scene);
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toContain("eye level shot");
    });
  });

  describe("generateSimpleSceneImagePrompt", () => {
    it("should generate simple prompt with basic scene info", () => {
      const scene = makeScene();
      const result = generateSimpleSceneImagePrompt(scene);
      expect(result).toContain("测试场景");
      expect(result).toContain("一个测试场景");
      expect(result).toContain("类型：室内");
      expect(result).toContain("时间：黄昏");
      expect(result).toContain("天气：晴朗");
    });

    it("should include scene type keywords", () => {
      const scene = makeScene();
      const result = generateSimpleSceneImagePrompt(scene);
      expect(result).toContain("interior");
    });

    it("should include quality tags", () => {
      const scene = makeScene();
      const result = generateSimpleSceneImagePrompt(scene);
      expect(result).toContain("high quality");
      expect(result).toContain("detailed");
    });

    it("should skip empty fields", () => {
      const scene = makeScene({
        name: "",
        description: "",
        type: "",
        timeOfDay: "",
        weather: "",
      });
      const result = generateSimpleSceneImagePrompt(scene);
      expect(result).not.toContain("类型：");
      expect(result).not.toContain("时间：");
      expect(result).not.toContain("天气：");
    });
  });

  describe("generateScenePromptOptimization", () => {
    it("should return optimization instruction with user description", () => {
      const result = generateScenePromptOptimization("一座古老的城堡");
      expect(result).toContain("一座古老的城堡");
      expect(result).toContain("优化为更详细");
      expect(result).toContain("视觉细节");
    });

    it("should include all optimization requirements", () => {
      const result = generateScenePromptOptimization("测试");
      expect(result).toContain("空间布局");
      expect(result).toContain("光照");
      expect(result).toContain("300字以内");
      expect(result).toContain("只返回优化后的提示词");
    });
  });
});

describe("prompt/builder/quick-mode", () => {
  describe("generateQuickModeVideoPrompt", () => {
    it("should generate prompt with all options", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "角色在森林中奔跑",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
        characters: [makeCharacter()],
        scene: makeScene(),
      });
      expect(result).toContain("角色在森林中奔跑");
      expect(result).toContain("测试角色");
      expect(result).toContain("测试场景");
      expect(result).toContain("日本动漫风格");
      expect(result).toContain("1920x1080");
      expect(result).toContain("5秒");
    });

    it("should generate prompt without characters", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "日落场景",
        duration: 10,
        resolution: "720p",
        style: "写实",
      });
      expect(result).toContain("日落场景");
      expect(result).not.toContain("【核心角色】");
    });

    it("should generate prompt without scene", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "角色特写",
        duration: 5,
        resolution: "4K",
        style: "电影感",
      });
      expect(result).not.toContain("【固定场景】");
    });

    it("should include character consistency requirement", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
        characters: [makeCharacter()],
      });
      expect(result).toContain("角色要求");
      expect(result).toContain("形象、服装、特征完全一致");
    });

    it("should include scene consistency requirement", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
        scene: makeScene(),
      });
      expect(result).toContain("场景要求");
      expect(result).toContain("场景环境、光线、空间结构完全一致");
    });

    it("should include reference image instruction when provided", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
        referenceImage: "http://ref.png",
      });
      expect(result).toContain("参考素材");
    });

    it("should not include reference image instruction when not provided", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
      });
      expect(result).not.toContain("参考素材");
    });

    it("should include smart optimization by default", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
      });
      expect(result).toContain("智能优化");
    });

    it("should not include smart optimization when disabled", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
        enableSmartOptimization: false,
      });
      expect(result).not.toContain("智能优化");
    });

    it("should include negative prompt when provided", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
        negativePrompt: "no cats",
      });
      expect(result).toContain("no cats");
    });

    it("should include quality tags", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
      });
      expect(result).toContain("high quality");
      expect(result).toContain("cinematic");
    });

    it("should include base negative content", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
      });
      expect(result).toContain("禁止内容");
      expect(result).toContain("no clipping");
    });

    it("should note character generatedImage when present", () => {
      const char = makeCharacter({ generatedImage: "http://char.png" });
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
        characters: [char],
      });
      expect(result).toContain("保持角色形象与参考图片完全一致");
    });

    it("should note scene generatedImage when present", () => {
      const scene = makeScene({ generatedImage: "http://scene.png" });
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "动漫",
        scene,
      });
      expect(result).toContain("保持场景与参考图片完全一致");
    });

    it("should use style string directly when not in presets", () => {
      const result = generateQuickModeVideoPrompt({
        prompt: "测试",
        duration: 5,
        resolution: "1080p",
        style: "自定义风格",
      });
      expect(result).toContain("自定义风格");
    });
  });

  describe("AVAILABLE_STYLES", () => {
    it("should be non-empty array", () => {
      expect(Array.isArray(AVAILABLE_STYLES)).toBe(true);
      expect(AVAILABLE_STYLES.length).toBeGreaterThan(0);
    });

    it("should contain expected styles", () => {
      expect(AVAILABLE_STYLES).toContain("写实");
      expect(AVAILABLE_STYLES).toContain("动漫");
      expect(AVAILABLE_STYLES).toContain("电影感");
      expect(AVAILABLE_STYLES).toContain("赛博朋克");
    });
  });

  describe("DURATION_OPTIONS", () => {
    it("should have expected values", () => {
      expect(DURATION_OPTIONS).toEqual([
        { value: 2, label: "2秒" },
        { value: 5, label: "5秒" },
        { value: 10, label: "10秒" },
        { value: 15, label: "15秒" },
        { value: 30, label: "30秒" },
      ]);
    });
  });

  describe("RESOLUTION_OPTIONS", () => {
    it("should have expected values", () => {
      expect(RESOLUTION_OPTIONS).toEqual([
        { value: "1280x720", label: "720p HD", width: 1280, height: 720 },
        { value: "1920x1080", label: "1080p Full HD", width: 1920, height: 1080 },
        { value: "3840x2160", label: "4K Ultra HD", width: 3840, height: 2160 },
      ]);
    });
  });
});

describe("prompt/builder/story-plan", () => {
  describe("generateStoryPlanPrompt", () => {
    it("should return prompt with title, description, genre, tone", () => {
      const result = generateStoryPlanPrompt({
        title: "星际旅行",
        description: "一段穿越银河的冒险",
        genre: "科幻",
        tone: "史诗",
        targetDuration: 60,
        characters: [],
        scenes: [],
      });
      expect(result).toContain("星际旅行");
      expect(result).toContain("穿越银河的冒险");
      expect(result).toContain("科幻");
      expect(result).toContain("史诗");
      expect(result).toContain("60");
    });

    it("should include genre guide for known genre", () => {
      const result = generateStoryPlanPrompt({
        title: "测试",
        description: "测试",
        genre: "喜剧",
        tone: "轻松",
        targetDuration: 30,
        characters: [],
        scenes: [],
      });
      expect(result).toContain("喜剧节奏");
      expect(result).toContain("误会叠加");
    });

    it("should include tone guide for known tone", () => {
      const result = generateStoryPlanPrompt({
        title: "测试",
        description: "测试",
        genre: "剧情",
        tone: "温馨",
        targetDuration: 30,
        characters: [],
        scenes: [],
      });
      expect(result).toContain("温馨细腻");
    });

    it("should include character descriptions when provided", () => {
      const char = makeCharacter({ name: "主角A" });
      const result = generateStoryPlanPrompt({
        title: "测试",
        description: "测试",
        genre: "剧情",
        tone: "中性",
        targetDuration: 30,
        characters: [char],
        scenes: [],
      });
      expect(result).toContain("主角A");
      expect(result).toContain("已有角色");
    });

    it("should include scene descriptions when provided", () => {
      const scene = makeScene({ name: "古堡" });
      const result = generateStoryPlanPrompt({
        title: "测试",
        description: "测试",
        genre: "剧情",
        tone: "中性",
        targetDuration: 30,
        characters: [],
        scenes: [scene],
      });
      expect(result).toContain("古堡");
      expect(result).toContain("已有场景");
    });

    it("should use defaults for empty title and description", () => {
      const result = generateStoryPlanPrompt({
        title: "",
        description: "",
        genre: "",
        tone: "",
        targetDuration: 0,
        characters: [],
        scenes: [],
      });
      expect(result).toContain("未命名");
      expect(result).toContain("无");
    });

    it("should include JSON format instructions", () => {
      const result = generateStoryPlanPrompt({
        title: "测试",
        description: "测试",
        genre: "剧情",
        tone: "中性",
        targetDuration: 60,
        characters: [],
        scenes: [],
      });
      expect(result).toContain("JSON");
      expect(result).toContain("duration");
      expect(result).toContain("content");
    });

    it("should include shot count recommendation based on duration", () => {
      const result = generateStoryPlanPrompt({
        title: "测试",
        description: "测试",
        genre: "剧情",
        tone: "中性",
        targetDuration: 60,
        characters: [],
        scenes: [],
      });
      expect(result).toContain("镜头数量建议");
    });

    it("should include duration sum constraint", () => {
      const result = generateStoryPlanPrompt({
        title: "测试",
        description: "测试",
        genre: "剧情",
        tone: "中性",
        targetDuration: 60,
        characters: [],
        scenes: [],
      });
      expect(result).toContain("duration 总和必须等于目标总时长");
    });
  });
});
