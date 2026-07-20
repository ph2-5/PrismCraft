/**
 * keywordSearch 纯函数单元测试
 *
 * 覆盖：
 * - 中英文分词（空格、标点分割）
 * - 多关键词命中评分（命中越多分越高）
 * - 时间衰减：7 天内 ×1.5、30 天内 ×1.0、更早 ×0.7
 * - limit 截断
 * - 空 query 走时间倒序
 * - 空 entries 返回空数组
 * - 大小写不敏感
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { keywordSearch } from "../strategies";
import type { ArchivalMemoryEntry } from "@/domain/types/memory";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeEntry(overrides: Partial<ArchivalMemoryEntry> = {}): ArchivalMemoryEntry {
  return {
    id: `mem_${Math.random().toString(36).slice(2, 8)}`,
    type: "summary",
    content: "test content",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("keywordSearch", () => {
  // ============= 空输入处理 =============

  describe("空输入处理", () => {
    it("空 entries 返回空数组", () => {
      expect(keywordSearch("query", [], 5)).toEqual([]);
    });

    it("空 query 按时间倒序返回", () => {
      const entries = [
        makeEntry({ id: "old", createdAt: 1000 }),
        makeEntry({ id: "new", createdAt: 2000 }),
      ];
      const result = keywordSearch("", entries, 5);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("new");
      expect(result[1].id).toBe("old");
    });

    it("纯标点 query 按时间倒序返回（分词后无关键词）", () => {
      const entries = [
        makeEntry({ id: "old", createdAt: 1000 }),
        makeEntry({ id: "new", createdAt: 2000 }),
      ];
      const result = keywordSearch("，。！？；：", entries, 5);
      expect(result[0].id).toBe("new");
      expect(result[1].id).toBe("old");
    });

    it("空 query + 空 entries 返回空数组", () => {
      expect(keywordSearch("", [], 5)).toEqual([]);
    });
  });

  // ============= 中英文分词 =============

  describe("分词", () => {
    it("中文逗号分词", () => {
      const entries = [
        makeEntry({ id: "1", content: "赛博朋克" }),
        makeEntry({ id: "2", content: "奇幻" }),
      ];
      const result = keywordSearch("赛博朋克，奇幻", entries, 5);
      expect(result).toHaveLength(2);
    });

    it("英文空格分词", () => {
      const entries = [
        makeEntry({ id: "1", content: "cat dog" }),
        makeEntry({ id: "2", content: "bird" }),
      ];
      const result = keywordSearch("cat dog", entries, 5);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("中文句号、顿号分词", () => {
      const entries = [
        makeEntry({ id: "1", content: "苹果" }),
        makeEntry({ id: "2", content: "香蕉" }),
        makeEntry({ id: "3", content: "葡萄" }),
      ];
      const result = keywordSearch("苹果。香蕉、葡萄", entries, 5);
      expect(result).toHaveLength(3);
    });

    it("英文分号、冒号分词", () => {
      const entries = [
        makeEntry({ id: "1", content: "alpha" }),
        makeEntry({ id: "2", content: "beta" }),
      ];
      const result = keywordSearch("alpha; beta: gamma", entries, 5);
      expect(result).toHaveLength(2);
    });

    it("问号、感叹号分词（中英文）", () => {
      const entries = [
        makeEntry({ id: "1", content: "what" }),
        makeEntry({ id: "2", content: "wow" }),
      ];
      const result = keywordSearch("what? wow!", entries, 5);
      expect(result).toHaveLength(2);
    });

    it("中文问号、感叹号分词", () => {
      const entries = [
        makeEntry({ id: "1", content: "什么" }),
        makeEntry({ id: "2", content: "哇" }),
      ];
      const result = keywordSearch("什么？哇！", entries, 5);
      expect(result).toHaveLength(2);
    });

    it("中英文混合标点分词", () => {
      const entries = [
        makeEntry({ id: "1", content: "hello 世界" }),
        makeEntry({ id: "2", content: "foo" }),
      ];
      // "hello，world！foo" → ["hello", "world", "foo"]
      const result = keywordSearch("hello，world！foo", entries, 5);
      expect(result).toHaveLength(2);
    });
  });

  // ============= 大小写不敏感 =============

  describe("大小写不敏感", () => {
    it("query 大写匹配 content 小写", () => {
      const entries = [makeEntry({ id: "1", content: "hello world" })];
      const result = keywordSearch("HELLO", entries, 5);
      expect(result).toHaveLength(1);
    });

    it("query 小写匹配 content 大写", () => {
      const entries = [makeEntry({ id: "1", content: "HELLO WORLD" })];
      const result = keywordSearch("hello", entries, 5);
      expect(result).toHaveLength(1);
    });

    it("混合大小写匹配", () => {
      const entries = [makeEntry({ id: "1", content: "ReAct Agent" })];
      const result = keywordSearch("REACT agent", entries, 5);
      expect(result).toHaveLength(1);
    });
  });

  // ============= 多关键词命中评分 =============

  describe("多关键词命中评分", () => {
    it("命中越多分越高", () => {
      const now = Date.now();
      const entries = [
        makeEntry({ id: "single", content: "cat", createdAt: now }),
        makeEntry({ id: "double", content: "cat dog", createdAt: now }),
      ];
      // query "cat dog" → double 命中 2，single 命中 1
      const result = keywordSearch("cat dog", entries, 5);
      expect(result[0].id).toBe("double");
      expect(result[1].id).toBe("single");
    });

    it("无命中的条目不返回", () => {
      const entries = [
        makeEntry({ id: "1", content: "cat" }),
        makeEntry({ id: "2", content: "dog" }),
      ];
      const result = keywordSearch("bird", entries, 5);
      expect(result).toEqual([]);
    });

    it("tags 也参与匹配", () => {
      const entries = [
        makeEntry({ id: "1", content: "hello", tags: ["special", "tag"] }),
        makeEntry({ id: "2", content: "world" }),
      ];
      const result = keywordSearch("special", entries, 5);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("tags 命中与 content 命中累加", () => {
      const now = Date.now();
      const entries = [
        makeEntry({ id: "1", content: "cat", tags: ["dog"], createdAt: now }),
        makeEntry({ id: "2", content: "cat", createdAt: now }),
      ];
      // query "cat dog" → entry 1 命中 cat(content) + dog(tag) = 2, entry 2 命中 cat = 1
      const result = keywordSearch("cat dog", entries, 5);
      expect(result[0].id).toBe("1");
      expect(result[1].id).toBe("2");
    });
  });

  // ============= 时间衰减 =============

  describe("时间衰减", () => {
    beforeEach(() => {
      // 固定 now 避免测试不稳定：day 100
      vi.spyOn(Date, "now").mockReturnValue(100 * DAY_MS);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("7 天内 ×1.5 排在 30 天内 ×1.0 之前", () => {
      const now = Date.now();
      const entries = [
        makeEntry({ id: "month", content: "test", createdAt: now - 20 * DAY_MS }),
        makeEntry({ id: "week", content: "test", createdAt: now - 1 * DAY_MS }),
      ];
      const result = keywordSearch("test", entries, 5);
      expect(result[0].id).toBe("week");   // 1 × 1.5 = 1.5
      expect(result[1].id).toBe("month");  // 1 × 1.0 = 1.0
    });

    it("30 天内 ×1.0 排在更早 ×0.7 之前", () => {
      const now = Date.now();
      const entries = [
        makeEntry({ id: "old", content: "test", createdAt: now - 60 * DAY_MS }),
        makeEntry({ id: "month", content: "test", createdAt: now - 20 * DAY_MS }),
      ];
      const result = keywordSearch("test", entries, 5);
      expect(result[0].id).toBe("month");  // 1 × 1.0 = 1.0
      expect(result[1].id).toBe("old");    // 1 × 0.7 = 0.7
    });

    it("7 天内 ×1.5 排在更早 ×0.7 之前", () => {
      const now = Date.now();
      const entries = [
        makeEntry({ id: "old", content: "test", createdAt: now - 60 * DAY_MS }),
        makeEntry({ id: "week", content: "test", createdAt: now - 1 * DAY_MS }),
      ];
      const result = keywordSearch("test", entries, 5);
      expect(result[0].id).toBe("week");
      expect(result[1].id).toBe("old");
    });

    it("边界：刚好 7 天不乘 1.5（ageDays < 7 才乘）", () => {
      const now = Date.now();
      // 7 天整 → ageDays = 7 → 不 < 7 → ×1.0
      // 6 天 → ageDays = 6 → < 7 → ×1.5
      const entries = [
        makeEntry({ id: "seven", content: "test", createdAt: now - 7 * DAY_MS }),
        makeEntry({ id: "six", content: "test", createdAt: now - 6 * DAY_MS }),
      ];
      const result = keywordSearch("test", entries, 5);
      expect(result[0].id).toBe("six");    // 1.5
      expect(result[1].id).toBe("seven");  // 1.0
    });

    it("边界：刚好 30 天不乘 0.7（ageDays > 30 才乘）", () => {
      const now = Date.now();
      // 30 天整 → ageDays = 30 → 不 > 30 → ×1.0
      // 31 天 → ageDays = 31 → > 30 → ×0.7
      const entries = [
        makeEntry({ id: "thirty", content: "test", createdAt: now - 30 * DAY_MS }),
        makeEntry({ id: "thirtyone", content: "test", createdAt: now - 31 * DAY_MS }),
      ];
      const result = keywordSearch("test", entries, 5);
      expect(result[0].id).toBe("thirty");     // 1.0
      expect(result[1].id).toBe("thirtyone");  // 0.7
    });
  });

  // ============= limit 截断 =============

  describe("limit 截断", () => {
    it("limit 截断结果数", () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeEntry({ id: `${i}`, content: "test" }),
      );
      const result = keywordSearch("test", entries, 3);
      expect(result).toHaveLength(3);
    });

    it("limit=0 返回空数组", () => {
      const entries = [makeEntry({ id: "1", content: "test" })];
      const result = keywordSearch("test", entries, 0);
      expect(result).toEqual([]);
    });

    it("limit 大于结果数时返回全部", () => {
      const entries = [
        makeEntry({ id: "1", content: "test" }),
        makeEntry({ id: "2", content: "test" }),
      ];
      const result = keywordSearch("test", entries, 100);
      expect(result).toHaveLength(2);
    });

    it("空 query 时 limit 也截断", () => {
      const entries = Array.from({ length: 5 }, (_, i) =>
        makeEntry({ id: `${i}`, createdAt: i }),
      );
      const result = keywordSearch("", entries, 2);
      expect(result).toHaveLength(2);
      // 时间倒序：最新的是 id=4
      expect(result[0].id).toBe("4");
      expect(result[1].id).toBe("3");
    });
  });
});
