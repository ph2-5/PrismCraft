import { describe, it, expect } from "vitest";
import {
  QUALITY_TAGS_IMAGE,
  QUALITY_TAGS_VIDEO,
  STYLE_KEYWORDS,
  SCENE_TYPE_KEYWORDS,
  MOOD_KEYWORDS,
  LIGHTING_KEYWORDS,
  CAMERA_ANGLE_KEYWORDS,
  CAMERA_MOVEMENT_KEYWORDS,
  joinParts,
  buildCharacterFullDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
} from "@/modules/prompt";
import type { Character, Scene } from "@/domain/schemas";

const defaultCharacter: Character = {
  id: "c1",
  name: "",
  gender: "",
  age: undefined,
  style: "",
  appearance: {
    hairColor: "",
    hairStyle: "",
    eyeColor: "",
    height: "",
    build: "",
    clothing: "",
  },
  personality: [],
  description: "",
  outfits: [],
  prompt: "",
  traits: [],
};

const defaultScene: Scene = {
  id: "s1",
  name: "",
  type: "",
  timeOfDay: "",
  weather: "",
  mood: "",
  lighting: "",
  atmosphere: "",
  elements: [],
  colors: [],
  description: "",
  prompt: "",
};

describe("prompt-engine/base", () => {
  describe("joinParts", () => {
    it("should join non-empty parts with comma", () => {
      expect(joinParts(["a", "b", "c"])).toBe("a, b, c");
    });

    it("should filter out null and undefined and false", () => {
      expect(joinParts(["a", null, undefined, false, "b"])).toBe("a, b");
    });

    it("should return empty string for all falsy", () => {
      expect(joinParts([null, undefined, false])).toBe("");
    });
  });

  describe("buildCharacterFullDesc", () => {
    it("should build full character description", () => {
      const char: Character = {
        ...defaultCharacter,
        name: "小明",
        gender: "女",
        age: 20,
        style: "anime",
        appearance: {
          ...defaultCharacter.appearance!,
          hairColor: "黑",
          hairStyle: "长发",
          eyeColor: "蓝",
          clothing: "校服",
        },
        personality: ["温柔", "善良"],
        description: "温柔少女",
      };
      const result = buildCharacterFullDesc(char);
      expect(result).toContain("anime风格");
      expect(result).toContain("女");
      expect(result).toContain("20岁");
      expect(result).toContain("温柔少女");
    });
  });

  describe("buildSceneAtmosphereDesc", () => {
    it("should build atmosphere description", () => {
      const scene: Scene = {
        ...defaultScene,
        name: "教室",
        timeOfDay: "傍晚",
        weather: "晴",
        mood: "紧张",
        lighting: "自然光",
      };
      const result = buildSceneAtmosphereDesc(scene);
      expect(result).toContain("傍晚");
      expect(result).toContain("晴");
      expect(result).toContain("紧张氛围");
    });
  });

  describe("buildSceneVisualDesc", () => {
    it("should build visual description with elements", () => {
      const scene: Scene = {
        ...defaultScene,
        name: "教室",
        elements: ["桌子", "椅子"],
        colors: ["暖色"],
      };
      const result = buildSceneVisualDesc(scene);
      expect(result).toContain("桌子、椅子");
      expect(result).toContain("暖色色调");
    });
  });

  describe("constants", () => {
    it("QUALITY_TAGS_IMAGE should be non-empty array", () => {
      expect(Array.isArray(QUALITY_TAGS_IMAGE)).toBe(true);
      expect(QUALITY_TAGS_IMAGE.length).toBeGreaterThan(0);
    });

    it("QUALITY_TAGS_VIDEO should be non-empty array", () => {
      expect(Array.isArray(QUALITY_TAGS_VIDEO)).toBe(true);
      expect(QUALITY_TAGS_VIDEO.length).toBeGreaterThan(0);
    });

    it("STYLE_KEYWORDS should contain anime and realistic", () => {
      expect(STYLE_KEYWORDS.anime).toBeDefined();
      expect(STYLE_KEYWORDS.realistic).toBeDefined();
    });

    it("SCENE_TYPE_KEYWORDS should contain Chinese keys", () => {
      expect(SCENE_TYPE_KEYWORDS["室内"]).toBeDefined();
      expect(SCENE_TYPE_KEYWORDS["室外"]).toBeDefined();
    });

    it("MOOD_KEYWORDS should contain Chinese keys", () => {
      expect(MOOD_KEYWORDS["紧张"]).toBeDefined();
      expect(MOOD_KEYWORDS["悲伤"]).toBeDefined();
    });

    it("LIGHTING_KEYWORDS should contain Chinese keys", () => {
      expect(LIGHTING_KEYWORDS["自然光"]).toBeDefined();
      expect(LIGHTING_KEYWORDS["侧光"]).toBeDefined();
    });

    it("CAMERA_ANGLE_KEYWORDS should contain Chinese keys", () => {
      expect(CAMERA_ANGLE_KEYWORDS["特写"]).toBeDefined();
      expect(CAMERA_ANGLE_KEYWORDS["俯拍"]).toBeDefined();
    });

    it("CAMERA_MOVEMENT_KEYWORDS should contain Chinese keys", () => {
      expect(CAMERA_MOVEMENT_KEYWORDS["固定"]).toBeDefined();
      expect(CAMERA_MOVEMENT_KEYWORDS["推"]).toBeDefined();
    });
  });
});
