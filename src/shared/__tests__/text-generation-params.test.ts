import { describe, it, expect } from "vitest";
import { getRecommendedTextParams } from "../text-generation-params";

/**
 * 模型参数适配测试（P1.3）。
 * 覆盖：各任务类型基础参数、推理/Claude/国产/GPT-4o 模型微调、未知模型兜底。
 */
describe("getRecommendedTextParams", () => {
  it("story_planning：temperature 0.6 / maxTokens 8192", () => {
    expect(getRecommendedTextParams("any-model", "story_planning")).toEqual({
      temperature: 0.6,
      maxTokens: 8192,
    });
  });

  it("shot_contract：temperature 0.55 / maxTokens 4096", () => {
    expect(getRecommendedTextParams("any-model", "shot_contract")).toEqual({
      temperature: 0.55,
      maxTokens: 4096,
    });
  });

  it("frame_prompt：temperature 0.65 / maxTokens 2048", () => {
    expect(getRecommendedTextParams("any-model", "frame_prompt")).toEqual({
      temperature: 0.65,
      maxTokens: 2048,
    });
  });

  it("提取分析类任务统一低温度（0.3）保证确定性", () => {
    for (const task of [
      "character_extraction",
      "scene_extraction",
      "treatment_extraction",
      "structure_analysis",
    ] as const) {
      expect(getRecommendedTextParams("m", task)).toEqual({
        temperature: 0.3,
        maxTokens: 4096,
      });
    }
  });

  it("deepseek 推理型模型：温度下调 0.15", () => {
    const p = getRecommendedTextParams("deepseek-v3", "frame_prompt");
    expect(p.temperature).toBeCloseTo(0.65 - 0.15);
  });

  it("claude 模型：温度略降 0.05", () => {
    const p = getRecommendedTextParams("claude-sonnet", "shot_contract");
    expect(p.temperature).toBeCloseTo(0.55 - 0.05);
  });

  it("qwen 国产模型：温度略升 0.05", () => {
    const p = getRecommendedTextParams("qwen-max", "shot_contract");
    expect(p.temperature).toBeCloseTo(0.55 + 0.05);
  });

  it("gpt-4o 系列：maxTokens 上限保护为 4096", () => {
    const p = getRecommendedTextParams("gpt-4o", "story_planning");
    expect(p.maxTokens).toBe(4096);
  });

  it("未知模型保持基础参数", () => {
    expect(getRecommendedTextParams("unknown-model", "chat")).toEqual({
      temperature: 0.7,
      maxTokens: 2048,
    });
  });
});
