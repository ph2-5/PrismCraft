/**
 * Task 2A.22: prompt-builder 单元测试
 *
 * 覆盖：
 * - 语言检测（中英文）
 * - strict / loose 约束级别
 * - preserveUnmasked 后缀
 * - duration 提示
 * - 空指令、长度检查、截断、敏感词、token 估算
 */
import { describe, it, expect } from "vitest";
import {
  buildPartialEditPrompt,
  buildSimplePrompt,
  detectLanguage,
  isEmptyPrompt,
  isPromptTooLong,
  truncatePrompt,
  containsSensitiveContent,
  estimateTokenCount,
} from "../prompt-builder";

describe("prompt-builder", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 用例 1: detectLanguage 检测中英文
  // ─────────────────────────────────────────────────────────────────────────
  describe("detectLanguage", () => {
    it("含中文字符应返回 zh", () => {
      expect(detectLanguage("把背景的树换成霓虹灯")).toBe("zh");
      expect(detectLanguage("hello 你好")).toBe("zh");
    });

    it("纯英文应返回 en", () => {
      expect(detectLanguage("replace the tree with neon sign")).toBe("en");
    });

    it("空字符串应返回 zh（默认）", () => {
      expect(detectLanguage("")).toBe("zh");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 2: buildPartialEditPrompt 中文 strict 模式
  // ─────────────────────────────────────────────────────────────────────────
  describe("buildPartialEditPrompt", () => {
    it("中文 strict 模式应包含约束前缀和 preserve 后缀", () => {
      const result = buildPartialEditPrompt("把背景换成夜景");
      expect(result).toContain("严格保持画面运动轨迹");
      expect(result).toContain("把背景换成夜景");
      expect(result).toContain("保留 mask 外所有像素");
    });

    it("英文 strict 模式应使用英文约束", () => {
      const result = buildPartialEditPrompt("replace background with night scene");
      expect(result).toContain("Strictly preserve");
      expect(result).toContain("replace background with night scene");
      expect(result).toContain("Preserve all pixels outside the mask");
    });

    it("loose 模式应使用宽松约束前缀", () => {
      const result = buildPartialEditPrompt("把背景换成夜景", {
        strictness: "loose",
        language: "zh",
      });
      expect(result).toContain("在保持整体画面一致性的前提下");
      expect(result).not.toContain("严格保持");
    });

    it("preserveUnmasked=false 应不追加 preserve 后缀", () => {
      const result = buildPartialEditPrompt("把背景换成夜景", {
        preserveUnmasked: false,
        language: "zh",
      });
      expect(result).not.toContain("保留 mask 外所有像素");
    });

    it("duration 应追加时长提示", () => {
      const result = buildPartialEditPrompt("test", { duration: 5, language: "zh" });
      expect(result).toContain("5 秒");
      expect(result).toContain("保持原节奏");
    });

    it("duration=0 不应追加时长提示", () => {
      const result = buildPartialEditPrompt("test", { duration: 0, language: "zh" });
      expect(result).not.toContain("秒");
    });

    it("英文 duration 应使用英文提示", () => {
      const result = buildPartialEditPrompt("test", { duration: 8, language: "en" });
      expect(result).toContain("8 seconds");
      expect(result).toContain("maintain the original pacing");
    });

    it("空 prompt 应抛出错误", () => {
      expect(() => buildPartialEditPrompt("")).toThrow();
      expect(() => buildPartialEditPrompt("   ")).toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 3: buildSimplePrompt 不带约束前缀
  // ─────────────────────────────────────────────────────────────────────────
  describe("buildSimplePrompt", () => {
    it("应只包含用户指令 + preserve 后缀", () => {
      const result = buildSimplePrompt("把背景换成红色", { language: "zh" });
      expect(result).toContain("把背景换成红色");
      expect(result).toContain("保留 mask 外所有像素");
      expect(result).not.toContain("严格保持");
    });

    it("空 prompt 应抛出错误", () => {
      expect(() => buildSimplePrompt("")).toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 4: isEmptyPrompt / isPromptTooLong / truncatePrompt
  // ─────────────────────────────────────────────────────────────────────────
  describe("prompt 工具函数", () => {
    it("isEmptyPrompt 应识别空字符串", () => {
      expect(isEmptyPrompt("")).toBe(true);
      expect(isEmptyPrompt("   ")).toBe(true);
      expect(isEmptyPrompt("hello")).toBe(false);
    });

    it("isPromptTooLong 应按 maxLength 检查", () => {
      expect(isPromptTooLong("a".repeat(2001))).toBe(true);
      expect(isPromptTooLong("a".repeat(2000))).toBe(false);
      expect(isPromptTooLong("short", 100)).toBe(false);
    });

    it("truncatePrompt 应截断到 maxLength", () => {
      const long = "a".repeat(3000);
      const truncated = truncatePrompt(long, 100);
      expect(truncated.length).toBe(100);
      // 短字符串不截断
      expect(truncatePrompt("short", 100)).toBe("short");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 5: containsSensitiveContent
  // ─────────────────────────────────────────────────────────────────────────
  describe("containsSensitiveContent", () => {
    it("应检测中文敏感词", () => {
      expect(containsSensitiveContent("包含裸体的画面")).toBe(true);
      expect(containsSensitiveContent("暴力场景")).toBe(true);
      expect(containsSensitiveContent("血腥内容")).toBe(true);
    });

    it("应检测英文敏感词（大小写不敏感）", () => {
      expect(containsSensitiveContent("NUDE content")).toBe(true);
      expect(containsSensitiveContent("contains violence")).toBe(true);
    });

    it("正常内容应返回 false", () => {
      expect(containsSensitiveContent("把背景换成霓虹灯")).toBe(false);
      expect(containsSensitiveContent("change background to night")).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 6: estimateTokenCount
  // ─────────────────────────────────────────────────────────────────────────
  describe("estimateTokenCount", () => {
    it("空字符串应返回 0", () => {
      expect(estimateTokenCount("")).toBe(0);
    });

    it("纯中文应按 1.5 token/字 估算", () => {
      // "把背景换成霓虹灯广告牌" = 11 个中文字符 → ceil(11 * 1.5) = 17
      expect(estimateTokenCount("把背景换成霓虹灯广告牌")).toBe(17);
    });

    it("纯英文应按 0.25 token/字 估算", () => {
      // 20 个英文字符 → 20 * 0.25 = 5
      expect(estimateTokenCount("abcdefghijklmnopqrst")).toBe(5);
    });

    it("中英混合应分别计算", () => {
      // 2 中文 + 5 英文 → 2 * 1.5 + 5 * 0.25 = 3 + 1.25 = 4.25 → ceil = 5
      expect(estimateTokenCount("你好hello")).toBe(5);
    });
  });
});
