/**
 * P1-12 测试覆盖 — novel/tools/helpers
 *
 * 覆盖 P1-11 修复的边界：
 * - nameSimilarity 两空字符串返回 0（而非 1.0）
 * - levenshteinDistance 超长输入降级为长度差
 * - asString / asNumber / asStringArray 防御性解析
 *
 * 同时回归验证 generateJsonArrayWithAI / generateJsonObjectWithAI 的
 * 失败路径（textProvider 失败 / 无 JSON / JSON.parse 错误）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: {
      generateText: vi.fn(),
    },
  },
}));

import {
  levenshteinDistance,
  nameSimilarity,
  asString,
  asNumber,
  asStringArray,
  MATCH_THRESHOLDS,
  generateJsonArrayWithAI,
  generateJsonObjectWithAI,
} from "../helpers";
import { container } from "@/infrastructure/di";

const textProvider = vi.mocked(container.textProvider);

describe("helpers — levenshteinDistance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("完全相同的字符串距离为 0", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("空字符串与单字符距离为 1", () => {
    expect(levenshteinDistance("", "a")).toBe(1);
    expect(levenshteinDistance("a", "")).toBe(1);
  });

  it("kitten → sitting 距离为 3", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("P1-11: 超长输入降级为长度差（避免 O(n*m) DoS）", () => {
    const long1 = "a".repeat(500);
    const long2 = "a".repeat(300);
    // 降级路径返回长度差 200，而非真正的 Levenshtein 距离
    expect(levenshteinDistance(long1, long2)).toBe(200);
  });

  it("P1-11: 单边超长输入也降级", () => {
    const long1 = "abc".repeat(200); // 600 字符
    const short = "abc";
    expect(levenshteinDistance(long1, short)).toBe(597);
  });

  it("P1-11: 阈值边界 - 恰好 256 字符仍走正常算法", () => {
    const s1 = "a".repeat(256);
    const s2 = "a".repeat(256);
    expect(levenshteinDistance(s1, s2)).toBe(0);
  });

  it("P1-11: 阈值边界 - 257 字符触发降级", () => {
    const s1 = "a".repeat(257);
    const s2 = "a".repeat(257);
    // 降级路径：长度差 = 0
    expect(levenshteinDistance(s1, s2)).toBe(0);
  });
});

describe("helpers — nameSimilarity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("完全相同名称相似度 = 1.0", () => {
    expect(nameSimilarity("张三", "张三")).toBe(1);
  });

  it("P1-11: 两空字符串返回 0（而非 1.0）", () => {
    // 原行为：maxLen === 0 时返回 1.0，导致两个空名称被误判为"完全匹配"
    // 修复后：返回 0，表示"无信息，不匹配"
    expect(nameSimilarity("", "")).toBe(0);
  });

  it("一空一非空相似度 = 0", () => {
    expect(nameSimilarity("", "张三")).toBe(0);
    expect(nameSimilarity("张三", "")).toBe(0);
  });

  it("单字符相同相似度 = 1.0", () => {
    expect(nameSimilarity("a", "a")).toBe(1);
  });

  it("单字符不同相似度 = 0", () => {
    expect(nameSimilarity("a", "b")).toBe(0);
  });

  it("模糊匹配区间（0.6-0.8）", () => {
    // "张三" vs "张四"：距离 1，maxLen 2，相似度 0.5
    expect(nameSimilarity("张三", "张四")).toBe(0.5);
  });

  it("高相似度（>= 0.8）", () => {
    // "张三丰" vs "张三风"：距离 1，maxLen 3，相似度 0.667
    // "张三丰" vs "张三丰1"：距离 1，maxLen 4，相似度 0.75
    // "abcdefgh" vs "abcdefgh1"：距离 1，maxLen 9，相似度 0.889
    expect(nameSimilarity("abcdefgh", "abcdefgh1")).toBeCloseTo(8 / 9, 5);
  });

  it("MATCH_THRESHOLDS 常量稳定", () => {
    expect(MATCH_THRESHOLDS.exact).toBe(1.0);
    expect(MATCH_THRESHOLDS.fuzzy).toBe(0.8);
    expect(MATCH_THRESHOLDS.conflict).toBe(0.6);
  });
});

describe("helpers — asString", () => {
  it("字符串原样返回", () => {
    expect(asString("hello")).toBe("hello");
  });

  it("非字符串返回 fallback（默认空串）", () => {
    expect(asString(123)).toBe("");
    expect(asString(null)).toBe("");
    expect(asString(undefined)).toBe("");
    expect(asString({})).toBe("");
    expect(asString([])).toBe("");
  });

  it("非字符串返回自定义 fallback", () => {
    expect(asString(123, "fallback")).toBe("fallback");
    expect(asString(null, "fallback")).toBe("fallback");
  });

  it("空字符串原样返回（不用 fallback 替换）", () => {
    expect(asString("")).toBe("");
    expect(asString("", "fallback")).toBe("");
  });
});

describe("helpers — asNumber", () => {
  it("数字原样返回", () => {
    expect(asNumber(42)).toBe(42);
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-1.5)).toBe(-1.5);
  });

  it("非数字返回 fallback（默认 0）", () => {
    expect(asNumber("42")).toBe(0);
    expect(asNumber(null)).toBe(0);
    expect(asNumber(undefined)).toBe(0);
    expect(asNumber(NaN)).toBe(0);
    expect(asNumber(Infinity)).toBe(0);
    expect(asNumber({})).toBe(0);
  });

  it("非数字返回自定义 fallback", () => {
    expect(asNumber("42", 99)).toBe(99);
    expect(asNumber(null, 99)).toBe(99);
  });
});

describe("helpers — asStringArray", () => {
  it("字符串数组原样返回", () => {
    expect(asStringArray(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("空数组返回空数组", () => {
    expect(asStringArray([])).toEqual([]);
  });

  it("混合数组过滤掉非字符串", () => {
    expect(asStringArray(["a", 1, null, "b", undefined, true, "c"])).toEqual(["a", "b", "c"]);
  });

  it("非数组返回空数组", () => {
    expect(asStringArray(null)).toEqual([]);
    expect(asStringArray(undefined)).toEqual([]);
    expect(asStringArray("abc")).toEqual([]);
    expect(asStringArray({})).toEqual([]);
  });
});

describe("helpers — generateJsonArrayWithAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("textProvider 失败时返回 null", async () => {
    textProvider.generateText.mockResolvedValue({
      success: false,
      error: "API error",
    } as never);
    const result = await generateJsonArrayWithAI("prompt");
    expect(result).toBeNull();
  });

  it("textProvider 返回无 JSON 时返回 null", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "this is plain text without json" },
    } as never);
    const result = await generateJsonArrayWithAI("prompt");
    expect(result).toBeNull();
  });

  it("textProvider 返回合法 JSON 数组时解析返回", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: 'Here is the result:\n[{"name":"张三"},{"name":"李四"}]\nDone.' },
    } as never);
    const result = await generateJsonArrayWithAI("prompt");
    expect(result).toEqual([{ name: "张三" }, { name: "李四" }]);
  });

  it("textProvider 返回 JSON 对象（非数组）时返回 null", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: '{"key":"value"}' },
    } as never);
    const result = await generateJsonArrayWithAI("prompt");
    expect(result).toBeNull();
  });

  it("textProvider 抛出异常时 propagate（generateJsonArrayWithAI 不捕获）", async () => {
    textProvider.generateText.mockRejectedValue(new Error("network"));
    await expect(generateJsonArrayWithAI("prompt")).rejects.toThrow("network");
  });
});

describe("helpers — generateJsonObjectWithAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("textProvider 失败时返回 null", async () => {
    textProvider.generateText.mockResolvedValue({
      success: false,
      error: "API error",
    } as never);
    const result = await generateJsonObjectWithAI("prompt");
    expect(result).toBeNull();
  });

  it("textProvider 返回无 JSON 时返回 null", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "no json here" },
    } as never);
    const result = await generateJsonObjectWithAI("prompt");
    expect(result).toBeNull();
  });

  it("textProvider 返回 JSON 对象时解析返回", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: 'Result:\n{"key":"value","num":42}\nEnd.' },
    } as never);
    const result = await generateJsonObjectWithAI("prompt");
    expect(result).toEqual({ key: "value", num: 42 });
  });

  it("textProvider 返回 JSON 数组（非对象）时返回 null", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: '[1,2,3]' },
    } as never);
    const result = await generateJsonObjectWithAI("prompt");
    expect(result).toBeNull();
  });

  it("textProvider 返回 JSON null 时返回 null", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: 'null' },
    } as never);
    const result = await generateJsonObjectWithAI("prompt");
    expect(result).toBeNull();
  });
});
