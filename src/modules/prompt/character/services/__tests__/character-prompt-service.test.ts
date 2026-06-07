import { describe, it, expect } from "vitest";
import {
  generateCharacterImagePrompt,
  generateOutfitImagePrompt,
  generateCharacterDetailedPromptInstruction,
  generateSimpleCharacterImagePrompt,
} from "../character-prompt-service";
import type { Character, CharacterOutfit } from "@/domain/schemas";

function buildCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "测试角色",
    description: "一个勇敢的战士",
    gender: "男",
    age: 25,
    style: "anime",
    personality: ["勇敢", "正义"],
    appearance: {
      hairColor: "黑色",
      hairStyle: "短发",
      eyeColor: "蓝色",
      height: "高",
      build: "健壮",
      clothing: "铠甲",
    },
    prompt: "",
    ...overrides,
  };
}

function buildOutfit(overrides: Partial<CharacterOutfit> = {}): CharacterOutfit {
  return {
    id: "outfit-1",
    name: "战斗服",
    description: "轻便的战斗装备",
    clothing: "轻甲",
    accessories: [],
    isDefault: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("character-prompt-service", () => {
  describe("generateCharacterImagePrompt", () => {
    it("应生成包含角色信息的提示词", () => {
      const char = buildCharacter();
      const prompt = generateCharacterImagePrompt(char);
      expect(prompt).toContain("anime风格");
      expect(prompt).toContain("男");
      expect(prompt).toContain("铠甲");
      expect(prompt).toContain("character design sheet");
      expect(prompt).toContain("full body");
      expect(prompt).toContain("white background");
    });

    it("应包含风格关键词", () => {
      const char = buildCharacter({ style: "anime" });
      const prompt = generateCharacterImagePrompt(char);
      expect(prompt).toContain("anime style");
    });

    it("应包含外观描述", () => {
      const char = buildCharacter();
      const prompt = generateCharacterImagePrompt(char);
      expect(prompt).toContain("黑色");
      expect(prompt).toContain("铠甲");
    });

    it("应包含质量标签", () => {
      const char = buildCharacter();
      const prompt = generateCharacterImagePrompt(char);
      expect(prompt).toContain("masterpiece");
      expect(prompt).toContain("best quality");
    });

    it("无 name/description/gender 时应返回空字符串", () => {
      const char = buildCharacter({ name: "", description: "", gender: "" });
      const prompt = generateCharacterImagePrompt(char);
      expect(prompt).toBe("");
    });

    it("指定 outfitId 时应替换服装描述", () => {
      const char = buildCharacter({
        outfits: [buildOutfit({ id: "outfit-1", clothing: "便装" })],
      });
      const prompt = generateCharacterImagePrompt(char, "outfit-1");
      expect(prompt).toContain("便装");
    });

    it("指定不存在的 outfitId 时应使用原始服装", () => {
      const char = buildCharacter({
        outfits: [buildOutfit({ id: "outfit-1" })],
      });
      const prompt = generateCharacterImagePrompt(char, "nonexistent");
      expect(prompt).toContain("铠甲");
    });

    it("无 outfits 时指定 outfitId 应忽略", () => {
      const char = buildCharacter();
      const prompt = generateCharacterImagePrompt(char, "outfit-1");
      expect(prompt).toContain("铠甲");
    });

    it("不同风格应生成不同关键词", () => {
      const char = buildCharacter({ style: "realistic" });
      const prompt = generateCharacterImagePrompt(char);
      expect(prompt).toContain("photorealistic");
    });
  });

  describe("generateOutfitImagePrompt", () => {
    it("应生成包含服装信息的提示词", () => {
      const char = buildCharacter();
      const outfit = buildOutfit({ clothing: "礼服" });
      const prompt = generateOutfitImagePrompt(char, outfit);
      expect(prompt).toContain("礼服");
      expect(prompt).toContain("character design sheet");
    });

    it("无 name/description/gender 时应返回空字符串", () => {
      const char = buildCharacter({ name: "", description: "", gender: "" });
      const outfit = buildOutfit();
      const prompt = generateOutfitImagePrompt(char, outfit);
      expect(prompt).toBe("");
    });

    it("应使用 outfit 的服装替换角色原始服装", () => {
      const char = buildCharacter();
      const outfit = buildOutfit({ clothing: "休闲装" });
      const prompt = generateOutfitImagePrompt(char, outfit);
      expect(prompt).toContain("休闲装");
    });
  });

  describe("generateCharacterDetailedPromptInstruction", () => {
    it("应生成详细提示词指令", () => {
      const char = buildCharacter();
      const result = generateCharacterDetailedPromptInstruction(char);
      expect(result).toContain("角色基础信息");
      expect(result).toContain("风格指导");
      expect(result).toContain("面部特征");
      expect(result).toContain("80-150");
    });

    it("应包含对应风格的指导", () => {
      const char = buildCharacter({ style: "realistic" });
      const result = generateCharacterDetailedPromptInstruction(char);
      expect(result).toContain("写实风格");
    });

    it("未知风格应使用 anime 默认指导", () => {
      const char = buildCharacter({ style: "unknown_style" });
      const result = generateCharacterDetailedPromptInstruction(char);
      expect(result).toContain("日式动漫风格");
    });

    it("空角色应返回空字符串", () => {
      const char = buildCharacter({ name: "", description: "", gender: "" });
      const result = generateCharacterDetailedPromptInstruction(char);
      expect(result).toBe("");
    });

    it("应包含负面提示词建议", () => {
      const char = buildCharacter();
      const result = generateCharacterDetailedPromptInstruction(char);
      expect(result).toContain("low quality");
      expect(result).toContain("blurry");
    });
  });

  describe("generateSimpleCharacterImagePrompt", () => {
    it("应生成简化版角色提示词", () => {
      const char = buildCharacter();
      const prompt = generateSimpleCharacterImagePrompt(char);
      expect(prompt).toContain("测试角色");
      expect(prompt).toContain("男");
      expect(prompt).toContain("full body");
      expect(prompt).toContain("character design");
    });

    it("应包含外观属性", () => {
      const char = buildCharacter();
      const prompt = generateSimpleCharacterImagePrompt(char);
      expect(prompt).toContain("发色：黑色");
      expect(prompt).toContain("发型：短发");
      expect(prompt).toContain("眼睛：蓝色");
      expect(prompt).toContain("服装：铠甲");
    });

    it("应包含性格", () => {
      const char = buildCharacter();
      const prompt = generateSimpleCharacterImagePrompt(char);
      expect(prompt).toContain("性格：勇敢, 正义");
    });

    it("缺少外观属性时不应包含对应标签", () => {
      const char = buildCharacter({
        appearance: {
          hairColor: "",
          hairStyle: "",
          eyeColor: "",
          height: "",
          build: "",
          clothing: "",
        },
      });
      const prompt = generateSimpleCharacterImagePrompt(char);
      expect(prompt).not.toContain("发色：");
      expect(prompt).not.toContain("服装：");
    });

    it("空性格数组不应包含性格标签", () => {
      const char = buildCharacter({ personality: [] });
      const prompt = generateSimpleCharacterImagePrompt(char);
      expect(prompt).not.toContain("性格：");
    });
  });
});
