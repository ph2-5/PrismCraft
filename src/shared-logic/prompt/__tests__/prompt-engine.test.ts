import { describe, it, expect } from "vitest";
import {
  QUALITY_TAGS_IMAGE,
  QUALITY_TAGS_VIDEO,
  joinParts,
  buildCharacterFullDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  STYLE_KEYWORDS,
  SCENE_TYPE_MAP,
  MOOD_MAP,
  LIGHTING_MAP,
  SHOT_TYPE_MAP,
  CAMERA_MOVEMENT_MAP,
} from "../prompt-engine";

describe("prompt-engine", () => {
  describe("joinParts", () => {
    it("应该用中文逗号连接非空字符串", () => {
      expect(joinParts(["a", "b", "c"])).toBe("a，b，c");
    });

    it("应该过滤掉 null、undefined 和空字符串", () => {
      expect(joinParts(["a", null, undefined, "", "b"])).toBe("a，b");
    });

    it("应该正确处理空数组输入", () => {
      expect(joinParts([])).toBe("");
    });

    it("应该正确处理全部为 falsy 的输入", () => {
      expect(joinParts([null, undefined, ""])).toBe("");
    });

    it("应该正确处理单个元素", () => {
      expect(joinParts(["only"])).toBe("only");
    });
  });

  describe("buildCharacterFullDesc", () => {
    it("应该构建完整的角色描述", () => {
      const result = buildCharacterFullDesc({
        gender: "女",
        age: 20,
        style: "anime",
        appearance: {
          hairColor: "黑",
          hairStyle: "长发",
          eyeColor: "蓝",
          clothing: "校服",
        },
        description: "温柔少女",
      });
      expect(result).toContain("女");
      expect(result).toContain("20岁");
      expect(result).toContain("anime风格");
      expect(result).toContain("黑发");
      expect(result).toContain("长发");
      expect(result).toContain("蓝眼");
      expect(result).toContain("校服");
      expect(result).toContain("温柔少女");
    });

    it("应该正确处理空对象输入", () => {
      expect(buildCharacterFullDesc({})).toBe("");
    });

    it("应该正确处理只有部分字段的角色", () => {
      const result = buildCharacterFullDesc({ gender: "男", age: "三十" });
      expect(result).toBe("男，三十岁");
    });

    it("应该跳过 appearance 中为空的字段", () => {
      const result = buildCharacterFullDesc({
        appearance: {
          hairColor: "金",
          eyeColor: "",
          clothing: undefined,
        },
      });
      expect(result).toBe("金发");
    });

    it("应该正确处理字符串类型的 age", () => {
      const result = buildCharacterFullDesc({ age: "25" });
      expect(result).toBe("25岁");
    });
  });

  describe("buildSceneAtmosphereDesc", () => {
    it("应该构建场景氛围描述", () => {
      const result = buildSceneAtmosphereDesc({
        timeOfDay: "傍晚",
        weather: "晴",
        mood: "紧张",
        atmosphere: "神秘",
        lighting: "侧光",
      });
      expect(result).toContain("傍晚");
      expect(result).toContain("晴");
      expect(result).toContain("紧张");
      expect(result).toContain("神秘");
      expect(result).toContain("侧光光线");
    });

    it("应该正确处理空对象输入", () => {
      expect(buildSceneAtmosphereDesc({})).toBe("");
    });

    it("应该正确处理只有 lighting 字段的场景", () => {
      const result = buildSceneAtmosphereDesc({ lighting: "自然光" });
      expect(result).toBe("自然光光线");
    });
  });

  describe("buildSceneVisualDesc", () => {
    it("应该构建场景视觉描述（数组类型 elements/colors）", () => {
      const result = buildSceneVisualDesc({
        type: "indoor",
        elements: ["桌子", "椅子"],
        colors: ["暖色", "橙色"],
      });
      expect(result).toContain("indoor");
      expect(result).toContain("桌子、椅子");
      expect(result).toContain("暖色/橙色色调");
    });

    it("应该正确处理 JSON 字符串类型的 elements 和 colors", () => {
      const result = buildSceneVisualDesc({
        elements: JSON.stringify(["桌子", "椅子"]),
        colors: JSON.stringify(["红色"]),
      });
      expect(result).toContain("桌子、椅子");
      expect(result).toContain("红色色调");
    });

    it("应该正确处理无效的 JSON 字符串 elements", () => {
      const result = buildSceneVisualDesc({
        elements: "invalid json",
      });
      expect(result).toBe("");
    });

    it("应该正确处理空对象输入", () => {
      expect(buildSceneVisualDesc({})).toBe("");
    });

    it("应该正确处理只有 type 字段的场景", () => {
      const result = buildSceneVisualDesc({ type: "outdoor" });
      expect(result).toBe("outdoor");
    });
  });

  describe("常量导出", () => {
    it("QUALITY_TAGS_IMAGE 应该是非空字符串数组", () => {
      expect(Array.isArray(QUALITY_TAGS_IMAGE)).toBe(true);
      expect(QUALITY_TAGS_IMAGE.length).toBeGreaterThan(0);
      QUALITY_TAGS_IMAGE.forEach((tag) => {
        expect(typeof tag).toBe("string");
        expect(tag.length).toBeGreaterThan(0);
      });
    });

    it("QUALITY_TAGS_VIDEO 应该是非空字符串数组", () => {
      expect(Array.isArray(QUALITY_TAGS_VIDEO)).toBe(true);
      expect(QUALITY_TAGS_VIDEO.length).toBeGreaterThan(0);
    });

    it("STYLE_KEYWORDS 应该包含 anime 和 realistic 等关键风格", () => {
      expect(STYLE_KEYWORDS.anime).toBeDefined();
      expect(STYLE_KEYWORDS.realistic).toBeDefined();
      expect(STYLE_KEYWORDS["3d"]).toBeDefined();
      expect(typeof STYLE_KEYWORDS.anime).toBe("string");
    });

    it("SCENE_TYPE_MAP 应该包含 indoor 和 outdoor 等场景类型", () => {
      expect(SCENE_TYPE_MAP.indoor).toBeDefined();
      expect(SCENE_TYPE_MAP.outdoor).toBeDefined();
      expect(SCENE_TYPE_MAP.space).toBeDefined();
    });

    it("MOOD_MAP 应该包含 happy 和 sad 等情绪", () => {
      expect(MOOD_MAP.happy).toBeDefined();
      expect(MOOD_MAP.sad).toBeDefined();
      expect(MOOD_MAP.horror).toBeDefined();
    });

    it("LIGHTING_MAP 应该包含 natural 和 dramatic 等光照", () => {
      expect(LIGHTING_MAP.natural).toBeDefined();
      expect(LIGHTING_MAP.dramatic).toBeDefined();
      expect(LIGHTING_MAP.neon).toBeDefined();
    });

    it("SHOT_TYPE_MAP 应该包含 wide 和 close 等景别", () => {
      expect(SHOT_TYPE_MAP.wide).toBeDefined();
      expect(SHOT_TYPE_MAP.close).toBeDefined();
      expect(SHOT_TYPE_MAP.birdseye).toBeDefined();
    });

    it("CAMERA_MOVEMENT_MAP 应该包含 static 和 push 等运镜", () => {
      expect(CAMERA_MOVEMENT_MAP.static).toBeDefined();
      expect(CAMERA_MOVEMENT_MAP.push).toBeDefined();
      expect(CAMERA_MOVEMENT_MAP.orbit).toBeDefined();
    });
  });
});
