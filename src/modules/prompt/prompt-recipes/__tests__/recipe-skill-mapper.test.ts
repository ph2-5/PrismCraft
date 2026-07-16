/**
 * 配方 ↔ Skill 映射器测试（Task 4.7 v5.3 增强）
 */

import { describe, it, expect } from "vitest";
import {
  getRecipe,
  listRecipes,
  applyRecipe,
  getRecipeSkillIds,
  registerCustomRecipe,
  unregisterCustomRecipe,
  type Recipe,
} from "../recipe-skill-mapper";

describe("recipe-skill-mapper", () => {
  describe("getRecipe", () => {
    it("返回赛博朋克配方", () => {
      const recipe = getRecipe("cyberpunk");
      expect(recipe).not.toBeNull();
      expect(recipe!.name).toBe("赛博朋克");
      expect(recipe!.nameEn).toBe("Cyberpunk");
    });

    it("返回日系动画配方", () => {
      const recipe = getRecipe("anime");
      expect(recipe).not.toBeNull();
      expect(recipe!.name).toBe("日系动画");
    });

    it("返回写实风景配方", () => {
      const recipe = getRecipe("realistic_landscape");
      expect(recipe).not.toBeNull();
      expect(recipe!.name).toBe("写实风景");
    });

    it("返回水墨风格配方", () => {
      const recipe = getRecipe("ink_wash");
      expect(recipe).not.toBeNull();
      expect(recipe!.name).toBe("水墨风格");
    });

    it("返回电影质感配方", () => {
      const recipe = getRecipe("cinematic");
      expect(recipe).not.toBeNull();
      expect(recipe!.name).toBe("电影质感");
    });

    it("未知配方返回 null", () => {
      expect(getRecipe("nonexistent")).toBeNull();
    });
  });

  describe("listRecipes", () => {
    it("返回 5 个预设配方", () => {
      const recipes = listRecipes();
      expect(recipes).toHaveLength(5);
    });

    it("每个配方含完整字段", () => {
      const recipes = listRecipes();
      for (const r of recipes) {
        expect(r).toHaveProperty("id");
        expect(r).toHaveProperty("name");
        expect(r).toHaveProperty("nameEn");
        expect(r).toHaveProperty("skillCombination");
        expect(r).toHaveProperty("preview");
      }
    });
  });

  describe("applyRecipe", () => {
    it("赛博朋克配方应用包含 style + lighting + vfx", () => {
      const result = applyRecipe("cyberpunk");
      expect(result).toContain("赛博朋克");
      expect(result).toContain("霓虹光");
      expect(result).toContain("粒子");
    });

    it("日系动画配方应用包含 style + lighting + characters", () => {
      const result = applyRecipe("anime");
      expect(result).toContain("日系动画");
      expect(result).toContain("高调光");
      expect(result).toContain("角色一致性强化");
    });

    it("写实风景配方应用包含 style + lighting + camera", () => {
      const result = applyRecipe("realistic_landscape");
      expect(result).toContain("写实");
      expect(result).toContain("黄金时刻");
      expect(result).toContain("远景");
      expect(result).toContain("固定");
    });

    it("水墨风格配方应用包含 style + lighting + camera", () => {
      const result = applyRecipe("ink_wash");
      expect(result).toContain("水墨");
      expect(result).toContain("自然光");
      expect(result).toContain("远景");
    });

    it("电影质感配方应用包含 style + lighting + camera", () => {
      const result = applyRecipe("cinematic");
      expect(result).toContain("电影质感");
      expect(result).toContain("低调光");
      expect(result).toContain("中景");
      expect(result).toContain("推拉");
    });

    it("未知配方抛错", () => {
      expect(() => applyRecipe("nonexistent")).toThrow();
    });
  });

  describe("getRecipeSkillIds", () => {
    it("赛博朋克配方激活 style/lighting/vfx 三个 Skill", () => {
      const skillIds = getRecipeSkillIds("cyberpunk");
      expect(skillIds).toContain("style");
      expect(skillIds).toContain("lighting");
      expect(skillIds).toContain("vfx");
    });

    it("日系动画配方激活 style/lighting/characters 三个 Skill", () => {
      const skillIds = getRecipeSkillIds("anime");
      expect(skillIds).toContain("style");
      expect(skillIds).toContain("lighting");
      expect(skillIds).toContain("characters");
    });

    it("未知配方返回空数组", () => {
      expect(getRecipeSkillIds("nonexistent")).toEqual([]);
    });
  });

  describe("自定义配方注册", () => {
    it("注册自定义配方后可查询", () => {
      const custom: { id: string } & Omit<Recipe, "id"> = {
        id: "custom_test",
        name: "测试配方",
        nameEn: "Test",
        skillCombination: {
          skillIds: ["style"],
          params: {
            style: { type: "realistic" },
          },
          description: "测试",
        },
        preview: "测试预览",
      };
      registerCustomRecipe(custom);
      expect(getRecipe("custom_test")).not.toBeNull();
      unregisterCustomRecipe("custom_test");
    });

    it("注销自定义配方后不可查询", () => {
      const custom: { id: string } & Omit<Recipe, "id"> = {
        id: "custom_test_2",
        name: "测试配方2",
        nameEn: "Test2",
        skillCombination: {
          skillIds: ["style"],
          params: {},
          description: "测试",
        },
        preview: "测试预览",
      };
      registerCustomRecipe(custom);
      unregisterCustomRecipe("custom_test_2");
      expect(getRecipe("custom_test_2")).toBeNull();
    });
  });
});
