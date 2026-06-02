import { describe, it, expect } from "vitest";
import {
  generateBeatImagePrompt,
  generateSimpleBeatImagePrompt,
} from "@/domain/utils/beat-prompt-builder";
import type { StoryBeat, Character, Scene, SceneElement } from "@/domain/schemas";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "测试角色",
    description: "一个勇敢的战士",
    gender: "女性",
    age: 25,
    style: "anime",
    personality: ["勇敢"],
    appearance: {
      hairColor: "银色",
      hairStyle: "长发",
      eyeColor: "蓝色",
      height: "170cm",
      build: "纤细",
      clothing: "战斗服",
    },
    prompt: "",
    ...overrides,
  };
}

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    name: "森林场景",
    description: "一片神秘的古老森林",
    type: "自然",
    timeOfDay: "黄昏",
    weather: "晴朗",
    mood: "神秘",
    lighting: "自然光",
    elements: ["古树", "溪流"],
    colors: ["绿色", "金色"],
    prompt: "",
    ...overrides,
  };
}

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 0,
    description: "",
    duration: 5,
    characters: [],
    characterIds: [],
    elementIds: [],
    ...overrides,
  };
}

describe("generateBeatImagePrompt - 描述完整性", () => {
  describe("非增强模式场景视觉细节", () => {
    it("非增强模式应包含场景视觉描述（元素和色调）", () => {
      const scene = makeScene();
      const beat = makeBeat({ scene: "scene-1" });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [],
        scenes: [scene],
        isEnhanced: false,
      });

      expect(prompt).toContain("古树");
      expect(prompt).toContain("溪流");
      expect(prompt).toContain("绿色");
      expect(prompt).toContain("金色");
    });

    it("增强模式也应包含场景视觉描述", () => {
      const scene = makeScene();
      const beat = makeBeat({ sceneId: "scene-1" });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [],
        scenes: [scene],
        isEnhanced: true,
      });

      expect(prompt).toContain("古树");
      expect(prompt).toContain("溪流");
    });
  });

  describe("existing_character 元素引用", () => {
    it("existing_character 应包含角色性别", () => {
      const char = makeCharacter({ gender: "男性" });
      const element: SceneElement = {
        id: "el-1",
        name: "战士",
        type: "existing_character",
        characterId: "char-1",
      };
      const beat = makeBeat({
        sceneElements: [element],
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      expect(prompt).toContain("男性");
    });

    it("existing_character 应包含角色年龄", () => {
      const char = makeCharacter({ age: 30 });
      const element: SceneElement = {
        id: "el-1",
        name: "战士",
        type: "existing_character",
        characterId: "char-1",
      };
      const beat = makeBeat({
        sceneElements: [element],
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      expect(prompt).toContain("30岁");
    });

    it("existing_character 应包含角色外观描述", () => {
      const char = makeCharacter();
      const element: SceneElement = {
        id: "el-1",
        name: "战士",
        type: "existing_character",
        characterId: "char-1",
      };
      const beat = makeBeat({
        sceneElements: [element],
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      expect(prompt).toContain("银色发色");
      expect(prompt).toContain("穿着战斗服");
    });

    it("existing_character 应包含角色 description 内容", () => {
      const char = makeCharacter({ description: "脸上有刀疤的独眼战士" });
      const element: SceneElement = {
        id: "el-1",
        name: "战士",
        type: "existing_character",
        characterId: "char-1",
      };
      const beat = makeBeat({
        sceneElements: [element],
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      expect(prompt).toContain("脸上有刀疤的独眼战士");
    });

    it("existing_character 无性别年龄时不应出现 undefined", () => {
      const char = makeCharacter({ gender: "", age: 0 });
      const element: SceneElement = {
        id: "el-1",
        name: "战士",
        type: "existing_character",
        characterId: "char-1",
      };
      const beat = makeBeat({
        sceneElements: [element],
        enhancedGeneration: true,
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
        isEnhanced: true,
      });

      expect(prompt).not.toContain("undefined");
      expect(prompt).not.toContain("0岁");
    });
  });

  describe("角色描述完整性", () => {
    it("角色外观描述应包含 description 字段内容", () => {
      const char = makeCharacter({ description: "左眼有伤疤，佩戴银色耳环" });
      const beat = makeBeat({
        characters: ["char-1"],
        characterIds: ["char-1"],
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
      });

      expect(prompt).toContain("左眼有伤疤");
      expect(prompt).toContain("银色耳环");
    });

    it("角色无 description 时应添加默认面部和配饰描述", () => {
      const char = makeCharacter({ description: "" });
      const beat = makeBeat({
        characters: ["char-1"],
        characterIds: ["char-1"],
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
      });

      expect(prompt).toContain("面部特征清晰");
      expect(prompt).toContain("无特殊配饰");
    });

    it("角色 description 包含面部关键词时不应重复添加", () => {
      const char = makeCharacter({ description: "圆脸的少女" });
      const beat = makeBeat({
        characters: ["char-1"],
        characterIds: ["char-1"],
      });

      const prompt = generateBeatImagePrompt({
        beat,
        characters: [char],
        scenes: [],
      });

      expect(prompt).toContain("圆脸的少女");
      expect(prompt).not.toContain("面部特征清晰");
    });
  });
});

describe("generateSimpleBeatImagePrompt - 描述完整性", () => {
  it("应包含场景氛围描述", () => {
    const scene = makeScene();
    const beat = makeBeat({ scene: "scene-1" });

    const prompt = generateSimpleBeatImagePrompt(beat, [], [scene]);

    expect(prompt).toContain("黄昏");
    expect(prompt).toContain("神秘氛围");
    expect(prompt).toContain("自然光照明");
  });

  it("应包含角色外观描述", () => {
    const char = makeCharacter();
    const beat = makeBeat({ characters: ["char-1"], character: "char-1" });

    const prompt = generateSimpleBeatImagePrompt(beat, [char], []);

    expect(prompt).toContain("测试角色");
    expect(prompt).toContain("银色发色");
    expect(prompt).toContain("穿着战斗服");
  });

  it("多角色应用分号分隔", () => {
    const char1 = makeCharacter({ id: "char-1", name: "角色A" });
    const char2 = makeCharacter({ id: "char-2", name: "角色B", appearance: { hairColor: "黑色", hairStyle: "短发", eyeColor: "", height: "", build: "", clothing: "长袍" } });
    const beat = makeBeat({ characters: ["char-1", "char-2"] });

    const prompt = generateSimpleBeatImagePrompt(beat, [char1, char2], []);

    expect(prompt).toContain("角色A");
    expect(prompt).toContain("角色B");
    expect(prompt).toContain("；");
  });

  it("无角色外观时不出现空括号", () => {
    const char = makeCharacter({
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      description: "",
    });
    const beat = makeBeat({ characters: ["char-1"], character: "char-1" });

    const prompt = generateSimpleBeatImagePrompt(beat, [char], []);

    expect(prompt).toContain("测试角色");
    expect(prompt).not.toContain("（）");
  });
});
