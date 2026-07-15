/**
 * 项目类型驱动的 Few-Shot 动态选择测试（Task 4.7）
 */

import { describe, it, expect } from "vitest";
import {
  getGenresByProjectType,
  selectFewShotByProjectType,
  selectFewShotExamples,
  buildFewShotPrompt,
} from "../dynamic-few-shot";

describe("Task 4.7: 项目类型驱动的 Few-Shot 动态选择", () => {
  describe("getGenresByProjectType", () => {
    it("古装项目映射到 drama + action", () => {
      const genres = getGenresByProjectType("ancient");
      expect(genres).toContain("drama");
      expect(genres).toContain("action");
    });

    it("现代项目映射到 drama + romance + comedy", () => {
      const genres = getGenresByProjectType("modern");
      expect(genres).toContain("drama");
      expect(genres).toContain("romance");
      expect(genres).toContain("comedy");
    });

    it("科幻项目映射到 scifi + action", () => {
      const genres = getGenresByProjectType("scifi");
      expect(genres).toContain("scifi");
      expect(genres).toContain("action");
    });

    it("奇幻项目映射到 fantasy + action", () => {
      const genres = getGenresByProjectType("fantasy");
      expect(genres).toContain("fantasy");
      expect(genres).toContain("action");
    });

    it("未知项目类型返回空数组", () => {
      expect(getGenresByProjectType("unknown")).toEqual([]);
      expect(getGenresByProjectType("nonexistent")).toEqual([]);
    });
  });

  describe("selectFewShotByProjectType", () => {
    it("古装项目返回 drama/action 相关示例", () => {
      const examples = selectFewShotByProjectType("ancient", 3);
      expect(examples.length).toBeLessThanOrEqual(3);
      // 古装映射到 drama + action，返回的示例 genre 应在这两个中
      for (const ex of examples) {
        expect(["drama", "action"]).toContain(ex.input.genre);
      }
    });

    it("科幻项目返回 scifi 相关示例", () => {
      const examples = selectFewShotByProjectType("scifi", 5);
      // 应该有 scifi genre 的示例
      expect(examples.some((ex) => ex.input.genre === "scifi")).toBe(true);
    });

    it("奇幻项目返回 fantasy 相关示例", () => {
      const examples = selectFewShotByProjectType("fantasy", 5);
      expect(examples.some((ex) => ex.input.genre === "fantasy")).toBe(true);
    });

    it("未知项目类型返回前 count 个示例", () => {
      const examples = selectFewShotByProjectType("unknown", 2);
      expect(examples).toHaveLength(2);
    });

    it("count 参数生效", () => {
      const examples1 = selectFewShotByProjectType("scifi", 1);
      const examples3 = selectFewShotByProjectType("scifi", 3);
      expect(examples1.length).toBeLessThanOrEqual(1);
      expect(examples3.length).toBeLessThanOrEqual(3);
    });

    it("中文示例默认返回", () => {
      const examples = selectFewShotByProjectType("ancient", 2, "zh");
      expect(examples.length).toBeGreaterThan(0);
    });

    it("英文示例支持", () => {
      const examples = selectFewShotByProjectType("scifi", 2, "en");
      expect(examples.length).toBeGreaterThan(0);
    });
  });

  describe("现有 Few-Shot 功能不受影响", () => {
    it("selectFewShotExamples 仍按 genre/tone 选择", () => {
      const examples = selectFewShotExamples({
        genre: "action",
        tone: "epic",
        beatIndex: 0,
        totalBeats: 8,
        hasAction: true,
      }, 3);
      expect(examples.length).toBeLessThanOrEqual(3);
      // 第一个示例应该是 action genre（最高分）
      expect(examples[0]!.input.genre).toBe("action");
    });

    it("buildFewShotPrompt 仍能构建提示词", () => {
      const examples = selectFewShotExamples({
        genre: "action",
        tone: "epic",
        beatIndex: 0,
        totalBeats: 8,
      }, 2);
      const prompt = buildFewShotPrompt(examples, "zh");
      expect(prompt).toContain("示例");
      expect(prompt).toContain("标题");
    });
  });
});
