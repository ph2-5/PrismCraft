/**
 * 多语言词汇表测试（Task 4.7 v5.3 增强）
 */

import { describe, it, expect } from "vitest";
import {
  translate,
  getTranslations,
  listConcepts,
  buildMixedPrompt,
} from "../multilingual";

describe("multilingual", () => {
  describe("translate", () => {
    it("返回指定语言的翻译", () => {
      expect(translate("close_up", "zh")).toBe("近景");
      expect(translate("close_up", "en")).toBe("close-up");
      expect(translate("close_up", "ja")).toBe("近景");
      expect(translate("close_up", "ko")).toBe("근경");
      expect(translate("close_up", "es")).toBe("primer plano");
      expect(translate("close_up", "ru")).toBe("крупный план");
    });

    it("景别概念都有 6 种语言翻译", () => {
      const concepts = ["extreme_wide_shot", "wide_shot", "medium_shot", "close_up", "extreme_close_up"];
      for (const c of concepts) {
        const translations = getTranslations(c);
        expect(translations).not.toBeNull();
        expect(Object.keys(translations!)).toHaveLength(6);
      }
    });

    it("运镜概念都有 6 种语言翻译", () => {
      const concepts = ["static", "pan", "tilt", "dolly", "tracking"];
      for (const c of concepts) {
        const translations = getTranslations(c);
        expect(translations).not.toBeNull();
        expect(Object.keys(translations!)).toHaveLength(6);
      }
    });

    it("光照概念都有 6 种语言翻译", () => {
      const concepts = ["natural_light", "low_key_lighting", "high_key_lighting", "golden_hour"];
      for (const c of concepts) {
        const translations = getTranslations(c);
        expect(translations).not.toBeNull();
        expect(Object.keys(translations!)).toHaveLength(6);
      }
    });

    it("风格概念都有 6 种语言翻译", () => {
      const concepts = ["cyberpunk", "anime", "realistic", "cinematic"];
      for (const c of concepts) {
        const translations = getTranslations(c);
        expect(translations).not.toBeNull();
        expect(Object.keys(translations!)).toHaveLength(6);
      }
    });

    it("未知概念返回原 concept 作为 fallback", () => {
      expect(translate("nonexistent_concept", "zh")).toBe("nonexistent_concept");
    });
  });

  describe("getTranslations", () => {
    it("未知概念返回 null", () => {
      expect(getTranslations("nonexistent")).toBeNull();
    });
  });

  describe("listConcepts", () => {
    it("返回非空概念列表", () => {
      const concepts = listConcepts();
      expect(concepts.length).toBeGreaterThan(15);
    });

    it("含景别概念", () => {
      expect(listConcepts()).toContain("close_up");
      expect(listConcepts()).toContain("wide_shot");
    });
  });

  describe("buildMixedPrompt", () => {
    it("单语言构建返回主语言翻译", () => {
      const result = buildMixedPrompt(["close_up", "tracking"], "zh");
      expect(result).toContain("近景");
      expect(result).toContain("跟拍");
    });

    it("双语言构建附加第二语言翻译", () => {
      const result = buildMixedPrompt(["close_up"], "zh", "en");
      expect(result).toContain("近景");
      expect(result).toContain("close-up");
      expect(result).toContain("(");
    });

    it("未知概念原样返回", () => {
      const result = buildMixedPrompt(["unknown_concept"], "zh");
      expect(result).toBe("unknown_concept");
    });

    it("多概念用逗号分隔", () => {
      const result = buildMixedPrompt(["close_up", "pan", "tracking"], "zh");
      expect(result.split("，").length).toBe(3);
    });
  });
});
