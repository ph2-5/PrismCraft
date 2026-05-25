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

describe("常量测试", () => {
  it("QUALITY_TAGS_IMAGE 是非空字符串数组", () => {
    expect(Array.isArray(QUALITY_TAGS_IMAGE)).toBe(true);
    expect(QUALITY_TAGS_IMAGE.length).toBeGreaterThan(0);
    for (const tag of QUALITY_TAGS_IMAGE) {
      expect(typeof tag).toBe("string");
      expect(tag.length).toBeGreaterThan(0);
    }
  });

  it("QUALITY_TAGS_VIDEO 是非空字符串数组", () => {
    expect(Array.isArray(QUALITY_TAGS_VIDEO)).toBe(true);
    expect(QUALITY_TAGS_VIDEO.length).toBeGreaterThan(0);
    for (const tag of QUALITY_TAGS_VIDEO) {
      expect(typeof tag).toBe("string");
      expect(tag.length).toBeGreaterThan(0);
    }
  });

  it("STYLE_KEYWORDS 包含 anime, realistic, 3d, watercolor 等键", () => {
    expect(STYLE_KEYWORDS).toHaveProperty("anime");
    expect(STYLE_KEYWORDS).toHaveProperty("realistic");
    expect(STYLE_KEYWORDS).toHaveProperty("3d");
    expect(STYLE_KEYWORDS).toHaveProperty("watercolor");
  });

  it("SCENE_TYPE_MAP 包含 indoor, outdoor, urban 等键", () => {
    expect(SCENE_TYPE_MAP).toHaveProperty("indoor");
    expect(SCENE_TYPE_MAP).toHaveProperty("outdoor");
    expect(SCENE_TYPE_MAP).toHaveProperty("urban");
  });

  it("MOOD_MAP 包含 happy, sad, tense 等键", () => {
    expect(MOOD_MAP).toHaveProperty("happy");
    expect(MOOD_MAP).toHaveProperty("sad");
    expect(MOOD_MAP).toHaveProperty("tense");
  });

  it("LIGHTING_MAP 包含 natural, dramatic, soft 等键", () => {
    expect(LIGHTING_MAP).toHaveProperty("natural");
    expect(LIGHTING_MAP).toHaveProperty("dramatic");
    expect(LIGHTING_MAP).toHaveProperty("soft");
  });

  it("SHOT_TYPE_MAP 包含 wide, medium, close 等键", () => {
    expect(SHOT_TYPE_MAP).toHaveProperty("wide");
    expect(SHOT_TYPE_MAP).toHaveProperty("medium");
    expect(SHOT_TYPE_MAP).toHaveProperty("close");
  });

  it("CAMERA_MOVEMENT_MAP 包含 static, push, pull 等键", () => {
    expect(CAMERA_MOVEMENT_MAP).toHaveProperty("static");
    expect(CAMERA_MOVEMENT_MAP).toHaveProperty("push");
    expect(CAMERA_MOVEMENT_MAP).toHaveProperty("pull");
  });
});

describe("joinParts", () => {
  it("过滤 undefined 和 null", () => {
    expect(joinParts(["a", undefined, "b", null, "c"])).toBe("a，b，c");
  });

  it("过滤空字符串", () => {
    expect(joinParts(["a", "", "b"])).toBe("a，b");
  });

  it("用中文逗号连接有效部分", () => {
    expect(joinParts(["角色", "场景", "氛围"])).toBe("角色，场景，氛围");
  });

  it("全部为空时返回空字符串", () => {
    expect(joinParts([undefined, null, ""])).toBe("");
  });
});

describe("buildCharacterFullDesc", () => {
  it("完整角色描述包含所有字段", () => {
    const result = buildCharacterFullDesc({
      gender: "女性",
      age: 20,
      style: "动漫",
      appearance: {
        hairColor: "黑",
        hairStyle: "长发",
        eyeColor: "蓝",
        clothing: "校服",
      },
      description: "温柔的性格",
    });
    expect(result).toContain("女性");
    expect(result).toContain("20岁");
    expect(result).toContain("动漫风格");
    expect(result).toContain("黑发");
    expect(result).toContain("长发");
    expect(result).toContain("蓝眼");
    expect(result).toContain("校服");
    expect(result).toContain("温柔的性格");
  });

  it("只有 gender 时只返回 gender", () => {
    expect(buildCharacterFullDesc({ gender: "男性" })).toBe("男性");
  });

  it("appearance 子字段正确拼接", () => {
    const result = buildCharacterFullDesc({
      appearance: {
        hairColor: "金",
        hairStyle: "短发",
        eyeColor: "绿",
        clothing: "西装",
      },
    });
    expect(result).toBe("金发，短发，绿眼，西装");
  });

  it(`age 添加"岁"后缀`, () => {
    expect(buildCharacterFullDesc({ age: 25 })).toBe("25岁");
  });

  it(`style 添加"风格"后缀`, () => {
    expect(buildCharacterFullDesc({ style: "写实" })).toBe("写实风格");
  });

  it("空对象返回空字符串", () => {
    expect(buildCharacterFullDesc({})).toBe("");
  });
});

describe("buildSceneAtmosphereDesc", () => {
  it("包含 timeOfDay, weather, mood", () => {
    const result = buildSceneAtmosphereDesc({
      timeOfDay: "黄昏",
      weather: "小雨",
      mood: "忧郁",
    });
    expect(result).toContain("黄昏");
    expect(result).toContain("小雨");
    expect(result).toContain("忧郁");
  });

  it(`lighting 添加"光线"后缀`, () => {
    expect(buildSceneAtmosphereDesc({ lighting: "自然" })).toBe("自然光线");
  });

  it("空对象返回空字符串", () => {
    expect(buildSceneAtmosphereDesc({})).toBe("");
  });
});

describe("buildSceneVisualDesc", () => {
  it("type 直接使用", () => {
    expect(buildSceneVisualDesc({ type: "indoor" })).toBe("indoor");
  });

  it(`elements 字符串被 JSON.parse 后用"、"连接`, () => {
    const result = buildSceneVisualDesc({
      elements: '["山","水","树"]',
    });
    expect(result).toBe("山、水、树");
  });

  it(`elements 数组直接用"、"连接`, () => {
    const result = buildSceneVisualDesc({
      elements: ["花", "草", "鸟"],
    });
    expect(result).toBe("花、草、鸟");
  });

  it(`colors 添加"色调"后缀`, () => {
    const result = buildSceneVisualDesc({
      colors: ["暖色", "金色"],
    });
    expect(result).toBe("暖色/金色色调");
  });

  it("elements 解析失败时回退为空", () => {
    const result = buildSceneVisualDesc({
      elements: "不是合法JSON",
    });
    expect(result).toBe("");
  });
});
