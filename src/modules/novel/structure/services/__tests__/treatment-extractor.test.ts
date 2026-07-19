/**
 * Task 2A.13 v5.3 — treatment-extractor 单元测试
 *
 * 覆盖：
 *   1. buildTreatmentExtractionPrompt: 提示词构建
 *   2. parseTreatment: JSON 对象解析与容错
 *   3. extractJsonObjectFromText: 从文本提取 JSON 对象
 *   4. extractTreatment: 主流程（成功 + 失败路径）
 */

import { describe, it, expect } from "vitest";
import {
  buildTreatmentExtractionPrompt,
  parseTreatment,
  extractJsonObjectFromText,
  extractTreatment,
  type GenerateTextFn,
} from "../treatment-extractor";
import { STORY_TONES, EMPTY_TREATMENT, isTreatmentComplete } from "../../domain/treatment";
import type { NovelSegment, ExtractedCharacter } from "../../../domain/types";

// 测试辅助
function makeSegment(overrides: Partial<NovelSegment> = {}): NovelSegment {
  return {
    id: overrides.id ?? `seg-${Math.random().toString(36).slice(2, 8)}`,
    title: overrides.title ?? "测试段落",
    summary: overrides.summary ?? "测试摘要",
    startChar: 0,
    endChar: 100,
    estimatedDuration: 10,
    keyEvents: [],
    text: "",
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<ExtractedCharacter> = {}): ExtractedCharacter {
  return {
    tempId: overrides.tempId ?? `char-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? "测试角色",
    gender: overrides.gender ?? "未知",
    description: overrides.description ?? "",
    appearance: overrides.appearance ?? {
      hairColor: "",
      hairStyle: "",
      eyeColor: "",
      height: "",
      build: "",
      clothing: "",
    },
    personality: overrides.personality ?? [],
    firstAppearance: overrides.firstAppearance ?? "",
    matchedCharacterId: overrides.matchedCharacterId,
    matchConfidence: overrides.matchConfidence,
    status: overrides.status ?? "new",
    confirmed: overrides.confirmed ?? false,
    ...overrides,
  };
}

function makeMockGenerateTextFn(response: string): GenerateTextFn {
  return async () => ({ success: true, data: { text: response } });
}

function makeFailingGenerateTextFn(error: string): GenerateTextFn {
  return async () => ({ success: false, error });
}

describe("Task 2A.13 v5.3 — treatment-extractor", () => {
  describe("buildTreatmentExtractionPrompt", () => {
    it("1. 提示词包含片段信息与角色信息", () => {
      const segments = [makeSegment({ id: "seg-1", title: "段落一" })];
      const characters = [makeCharacter({ tempId: "char-1", name: "主角" })];
      const prompt = buildTreatmentExtractionPrompt(segments, characters);
      expect(prompt).toContain("段落一");
      expect(prompt).toContain("主角");
      expect(prompt).toContain("char-1");
      // 包含所有 tone
      for (const tone of STORY_TONES) {
        expect(prompt).toContain(tone);
      }
    });

    it("2. 无角色时提示词显示暂无角色信息", () => {
      const segments = [makeSegment()];
      const prompt = buildTreatmentExtractionPrompt(segments, []);
      expect(prompt).toContain("暂无角色信息");
    });
  });

  describe("parseTreatment", () => {
    it("3. 正常解析完整 treatment 对象", () => {
      const raw = {
        logline: "主角复仇的故事",
        theme: "复仇",
        tone: "thriller",
        characterArcs: [
          { characterId: "char-1", characterName: "主角", arc: "从懦弱到勇敢" },
        ],
        settingDescription: "古代江湖",
      };
      const treatment = parseTreatment(raw);
      expect(treatment.logline).toBe("主角复仇的故事");
      expect(treatment.theme).toBe("复仇");
      expect(treatment.tone).toBe("thriller");
      expect(treatment.settingDescription).toBe("古代江湖");
      expect(treatment.characterArcs).toHaveLength(1);
      expect(treatment.characterArcs[0]!.characterId).toBe("char-1");
      expect(treatment.characterArcs[0]!.arc).toBe("从懦弱到勇敢");
    });

    it("4. tone 不合法时回退为 drama", () => {
      const raw = { logline: "x", theme: "y", tone: "invalid_tone" };
      const treatment = parseTreatment(raw);
      expect(treatment.tone).toBe("drama");
    });

    it("5. tone 缺失时回退为 drama", () => {
      const raw = { logline: "x", theme: "y" };
      const treatment = parseTreatment(raw);
      expect(treatment.tone).toBe("drama");
    });

    it("6. characterArcs 非数组时为空数组", () => {
      const raw = { logline: "x", characterArcs: "not-an-array" };
      const treatment = parseTreatment(raw);
      expect(treatment.characterArcs).toEqual([]);
    });

    it("7. characterArcs 缺 characterId 或 arc 时被过滤", () => {
      const raw = {
        characterArcs: [
          { characterId: "char-1", arc: "弧光1" },     // 完整
          { characterId: "", arc: "弧光2" },            // 缺 characterId
          { characterId: "char-3", arc: "" },           // 缺 arc
          { characterName: "无 ID" },                   // 都缺
        ],
      };
      const treatment = parseTreatment(raw);
      expect(treatment.characterArcs).toHaveLength(1);
      expect(treatment.characterArcs[0]!.characterId).toBe("char-1");
    });

    it("8. 缺失 logline/theme/settingDescription 时为空字符串", () => {
      const raw = { tone: "comedy" };
      const treatment = parseTreatment(raw);
      expect(treatment.logline).toBe("");
      expect(treatment.theme).toBe("");
      expect(treatment.settingDescription).toBe("");
    });

    it("9. 输入非对象（数组）时返回 EMPTY_TREATMENT", () => {
      const treatment = parseTreatment([1, 2, 3]);
      expect(treatment).toEqual(EMPTY_TREATMENT);
    });

    it("10. 输入 null 时返回 EMPTY_TREATMENT", () => {
      const treatment = parseTreatment(null);
      expect(treatment).toEqual(EMPTY_TREATMENT);
    });
  });

  describe("extractJsonObjectFromText", () => {
    it("11. 提取 ```json 代码块中的对象", () => {
      const text = '说明\n```json\n{"logline":"x"}\n```\n更多';
      expect(extractJsonObjectFromText(text)).toBe('{"logline":"x"}');
    });

    it("12. 无代码块时提取最外层 { }", () => {
      const text = 'AI 回复：{"logline":"x"} 完成';
      expect(extractJsonObjectFromText(text)).toBe('{"logline":"x"}');
    });

    it("13. 无 JSON 对象时返回 null", () => {
      expect(extractJsonObjectFromText("纯文本")).toBeNull();
    });

    it("14. 多行 JSON 对象也能提取", () => {
      const text = '```json\n{\n  "logline": "x",\n  "theme": "y"\n}\n```';
      const result = extractJsonObjectFromText(text);
      expect(result).toContain('"logline"');
      expect(result).toContain('"theme"');
    });
  });

  describe("extractTreatment", () => {
    it("15. 成功路径：AI 返回合法 JSON 对象 → 返回 StoryTreatment", async () => {
      const segments = [makeSegment({ id: "seg-1" })];
      const aiResponse = JSON.stringify({
        logline: "测试 logline",
        theme: "成长",
        tone: "drama",
        characterArcs: [{ characterId: "char-1", arc: "弧光" }],
        settingDescription: "测试设定",
      });
      const result = await extractTreatment(segments, makeMockGenerateTextFn(aiResponse));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.logline).toBe("测试 logline");
        expect(result.data.theme).toBe("成长");
        expect(result.data.tone).toBe("drama");
        expect(result.data.settingDescription).toBe("测试设定");
        expect(result.data.characterArcs).toHaveLength(1);
      }
    });

    it("16. AI 调用失败时返回 error", async () => {
      const segments = [makeSegment()];
      const result = await extractTreatment(segments, makeFailingGenerateTextFn("API 错误"));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("API 错误");
      }
    });

    it("17. AI 返回无法解析为 JSON 时返回 error", async () => {
      const segments = [makeSegment()];
      const result = await extractTreatment(segments, makeMockGenerateTextFn("纯文本"));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("无法解析");
      }
    });

    it("18. AI 返回 JSON 但缺少 logline 时返回 error", async () => {
      const segments = [makeSegment()];
      const aiResponse = JSON.stringify({ theme: "成长" });  // 缺 logline
      const result = await extractTreatment(segments, makeMockGenerateTextFn(aiResponse));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("logline");
      }
    });

    it("19. 空 segments 时返回 error", async () => {
      const result = await extractTreatment([], makeMockGenerateTextFn("{}"));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("无 segments");
      }
    });

    it("20. AI 返回带 ```json 代码块的对象也能解析", async () => {
      const segments = [makeSegment()];
      const aiResponse = '```json\n{"logline":"测试","theme":"x","tone":"comedy"}\n```';
      const result = await extractTreatment(segments, makeMockGenerateTextFn(aiResponse));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.logline).toBe("测试");
        expect(result.data.tone).toBe("comedy");
      }
    });
  });

  describe("isTreatmentComplete", () => {
    it("21. 所有必填字段非空时返回 true", () => {
      const treatment = {
        logline: "x",
        theme: "y",
        characterArcs: [],
        tone: "drama" as const,
        settingDescription: "z",
      };
      expect(isTreatmentComplete(treatment)).toBe(true);
    });

    it("22. logline 为空时返回 false", () => {
      const treatment = {
        logline: "",
        theme: "y",
        characterArcs: [],
        tone: "drama" as const,
        settingDescription: "z",
      };
      expect(isTreatmentComplete(treatment)).toBe(false);
    });

    it("23. settingDescription 仅空白时返回 false", () => {
      const treatment = {
        logline: "x",
        theme: "y",
        characterArcs: [],
        tone: "drama" as const,
        settingDescription: "   ",
      };
      expect(isTreatmentComplete(treatment)).toBe(false);
    });
  });
});
