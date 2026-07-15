/**
 * 反空泛词汇过滤器测试（Task 1.4 v5.3 增强）
 */

import { describe, it, expect } from "vitest";
import { filterAntislop, hasSlop, listSlopVocabulary } from "../antislop";

describe("antislop", () => {
  describe("filterAntislop", () => {
    it("过滤空泛质量词（masterpiece/best quality 直接删除）", () => {
      const result = filterAntislop("a masterpiece, best quality girl");
      expect(result.replacements).toHaveLength(2);
      expect(result.replacements[0]!.original).toBe("masterpiece");
      expect(result.replacements[1]!.original).toBe("best quality");
      expect(result.filtered).not.toContain("masterpiece");
      expect(result.filtered).not.toContain("best quality");
    });

    it("替换分辨率词（4k/8k → 高分辨率）", () => {
      const result = filterAntislop("4k cinematic 8k detailed");
      expect(result.filtered).toContain("高分辨率");
      expect(result.filtered).not.toContain("4k");
      expect(result.filtered).not.toContain("8k");
    });

    it("大小写不敏感匹配", () => {
      const result = filterAntislop("MASTERPIECE Best Quality");
      expect(result.replacements.length).toBeGreaterThanOrEqual(2);
      expect(result.filtered).not.toContain("MASTERPIECE");
      expect(result.filtered).not.toContain("Best Quality");
    });

    it("替换细节词为中文等价物", () => {
      const result = filterAntislop("highly detailed sharp focus");
      expect(result.filtered).toContain("细节丰富");
      expect(result.filtered).toContain("焦点清晰");
    });

    it("无空泛词汇时返回原文", () => {
      const original = "一个穿红裙子的女孩在雨中奔跑";
      const result = filterAntislop(original);
      expect(result.replacements).toHaveLength(0);
      expect(result.filtered).toBe(original);
    });

    it("清理删除后的多余逗号和空格", () => {
      const result = filterAntislop("masterpiece, beautiful girl, 4k");
      // 删除 masterpiece 和 beautiful 后，逗号应被清理
      expect(result.filtered).not.toContain(",,");
      expect(result.filtered).not.toMatch(/^,/);
      expect(result.filtered).not.toMatch(/,$/);
    });

    it("替换记录包含原因说明", () => {
      const result = filterAntislop("masterpiece");
      expect(result.replacements[0]!.reason).toContain("空泛");
    });
  });

  describe("hasSlop", () => {
    it("含空泛词汇返回 true", () => {
      expect(hasSlop("masterpiece girl")).toBe(true);
      expect(hasSlop("4k video")).toBe(true);
      expect(hasSlop("best quality")).toBe(true);
    });

    it("不含空泛词汇返回 false", () => {
      expect(hasSlop("一个穿红裙子的女孩")).toBe(false);
      expect(hasSlop("cinematic lighting")).toBe(false);
    });

    it("大小写不敏感", () => {
      expect(hasSlop("MASTERPIECE")).toBe(true);
      expect(hasSlop("Stunning")).toBe(true);
    });
  });

  describe("listSlopVocabulary", () => {
    it("返回非空词汇表", () => {
      const vocab = listSlopVocabulary();
      expect(vocab.length).toBeGreaterThan(10);
    });

    it("每条含 slop/replacement/reason 字段", () => {
      const vocab = listSlopVocabulary();
      const first = vocab[0]!;
      expect(first).toHaveProperty("slop");
      expect(first).toHaveProperty("replacement");
      expect(first).toHaveProperty("reason");
    });

    it("含已知空泛词", () => {
      const vocab = listSlopVocabulary();
      const slops = vocab.map((v) => v.slop);
      expect(slops).toContain("masterpiece");
      expect(slops).toContain("best quality");
      expect(slops).toContain("4k");
      expect(slops).toContain("8k");
    });
  });
});
