import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateContentTokens,
  estimateMessagesTokens,
  estimateSystemPromptTokens,
  TOKEN_OVERHEAD_PER_MESSAGE,
  TOKEN_OVERHEAD_PER_TOOL_CALL,
  TOKEN_OVERHEAD_SYSTEM,
} from "../token-estimator";

describe("token-estimator", () => {
  describe("estimateTokens", () => {
    it("空字符串返回 0", () => {
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens("")).toBe(0);
    });

    it("纯英文估算（4 字符 ≈ 1 token）", () => {
      // 5 * 0.25 = 1.25 → ceil = 2
      expect(estimateTokens("hello")).toBe(2);
      // 11 * 0.25 = 2.75 → ceil = 3
      expect(estimateTokens("hello world")).toBe(3);
    });

    it("纯中文估算（1 字 ≈ 1.5 token）", () => {
      // 2 * 1.5 = 3
      expect(estimateTokens("你好")).toBe(3);
      // 4 * 1.5 = 6
      expect(estimateTokens("你好世界")).toBe(6);
    });

    it("中英文混合估算", () => {
      // "你好 world" = 2 中文 + 6 ASCII（含空格）
      // 2 * 1.5 + 6 * 0.25 = 3 + 1.5 = 4.5 → ceil = 5
      expect(estimateTokens("你好 world")).toBe(5);
    });

    it("中文标点估算（1 字 ≈ 1 token）", () => {
      // "你好。" = 2 中文 + 1 CJK标点
      // 2 * 1.5 + 1 * 1.0 = 4
      expect(estimateTokens("你好。")).toBe(4);
    });

    it("全角标点估算", () => {
      // "test！" = 4 ASCII + 1 全角标点（U+FF01）
      // 4 * 0.25 + 1 * 1.0 = 1 + 1 = 2
      expect(estimateTokens("test！")).toBe(2);
    });

    it("长文本估算返回正值", () => {
      const longText = "这是一段中文文本，用于测试 token 估算器的准确性。".repeat(10);
      const tokens = estimateTokens(longText);
      expect(tokens).toBeGreaterThan(0);
    });

    it("数字估算", () => {
      // "12345" = 5 ASCII
      // 5 * 0.25 = 1.25 → ceil = 2
      expect(estimateTokens("12345")).toBe(2);
    });
  });

  describe("estimateContentTokens", () => {
    it("包含 content", () => {
      expect(estimateContentTokens({ content: "hello" })).toBe(2);
    });

    it("包含 toolCalls arguments", () => {
      const result = estimateContentTokens({
        content: "result",
        toolCalls: [{ function: { arguments: '{"key":"value"}' } }],
      });
      // content "result" = 6 * 0.25 = 1.5 → 2
      // arguments '{"key":"value"}' = 16 * 0.25 = 4
      // total = 6
      expect(result).toBe(6);
    });

    it("空 content 返回 0", () => {
      expect(estimateContentTokens({})).toBe(0);
    });

    it("多个 toolCalls 累加", () => {
      const result = estimateContentTokens({
        content: "",
        toolCalls: [
          { function: { arguments: "abc" } },
          { function: { arguments: "def" } },
        ],
      });
      // 6 * 0.25 = 1.5 → 2
      expect(result).toBe(2);
    });
  });

  describe("estimateMessagesTokens", () => {
    it("单条消息含 overhead", () => {
      const tokens = estimateMessagesTokens([{ role: "user", content: "hello" }]);
      // content 2 + overhead 4 = 6
      expect(tokens).toBe(6);
    });

    it("多条消息累加", () => {
      const tokens = estimateMessagesTokens([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ]);
      // (2 + 4) + (1 + 4) = 11
      expect(tokens).toBe(11);
    });

    it("排除 system 消息", () => {
      const tokens = estimateMessagesTokens(
        [
          { role: "system", content: "system prompt" },
          { role: "user", content: "hello" },
        ],
        false,
      );
      // 只算 user: 2 + 4 = 6
      expect(tokens).toBe(6);
    });

    it("包含 toolCalls 的消息", () => {
      const tokens = estimateMessagesTokens([
        {
          role: "assistant",
          content: "",
          toolCalls: [{ function: { arguments: '{"key":"value"}' } }],
        },
      ]);
      // content 0 + arguments 4 + overhead 4 + toolCall overhead 3 = 11
      expect(tokens).toBe(11);
    });

    it("默认包含 system 消息", () => {
      const tokens = estimateMessagesTokens([
        { role: "system", content: "ab" },
        { role: "user", content: "cd" },
      ]);
      // system: 1 + 4 = 5, user: 1 + 4 = 5, total = 10
      expect(tokens).toBe(10);
    });
  });

  describe("estimateSystemPromptTokens", () => {
    it("含 system overhead", () => {
      const tokens = estimateSystemPromptTokens("hello");
      // 2 + 3 = 5
      expect(tokens).toBe(5);
    });

    it("空字符串只返回 overhead", () => {
      expect(estimateSystemPromptTokens("")).toBe(TOKEN_OVERHEAD_SYSTEM);
    });
  });

  describe("常量", () => {
    it("TOKEN_OVERHEAD_PER_MESSAGE", () => {
      expect(TOKEN_OVERHEAD_PER_MESSAGE).toBe(4);
    });

    it("TOKEN_OVERHEAD_PER_TOOL_CALL", () => {
      expect(TOKEN_OVERHEAD_PER_TOOL_CALL).toBe(3);
    });

    it("TOKEN_OVERHEAD_SYSTEM", () => {
      expect(TOKEN_OVERHEAD_SYSTEM).toBe(3);
    });
  });
});
