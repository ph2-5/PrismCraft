import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectProvider, validateApiKey, getKeyStrength, getKeyStrengthInfo } from "@/infrastructure/ai-providers/api-config/detect";

describe("api-config/detect", () => {
  describe("detectProvider", () => {
    it("should return null for empty string", () => {
      expect(detectProvider("")).toBeNull();
    });

    it("should return null for short keys (< 10 chars)", () => {
      expect(detectProvider("sk-abc")).toBeNull();
    });

    it("should return null for placeholder keys", () => {
      expect(detectProvider("your_api_key_here_12345")).toBeNull();
      expect(detectProvider("placeholder_key_12345678")).toBeNull();
    });

    it("should detect OpenAI key (48 chars)", () => {
      const key = "sk-" + "a".repeat(48);
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("openai");
      expect(result!.confidence).toBe("high");
    });

    it("should detect OpenAI project key", () => {
      const key = "sk-proj-abc123def456";
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("openai");
      expect(result!.confidence).toBe("high");
    });

    it("should detect Moonshot key with moonshot in name", () => {
      const key = "moonshot-api-key-1234567890";
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("moonshot");
    });

    it("should detect Volcengine UUID key", () => {
      const key = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("volcengine");
      expect(result!.confidence).toBe("high");
    });

    it("should detect OpenRouter key", () => {
      const key = "sk-or-v1-1234567890abcdef";
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("openrouter");
      expect(result!.confidence).toBe("high");
    });

    it("should detect Seedance key", () => {
      const key = "seedance-api-key-1234567890";
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("seedance");
    });

    it("should detect Zhipu old format key", () => {
      const key = "00" + "a".repeat(32) + "." + "b".repeat(16);
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("zhipu");
    });

    it("should return null for unrecognized format", () => {
      const key = "unknown_format_key_12345678901234567890";
      expect(detectProvider(key)).toBeNull();
    });

    it("should return suggestedName from TEMPLATE_NAMES", () => {
      const key = "sk-or-test123";
      const result = detectProvider(key);
      expect(result!.suggestedName).toBe("OpenRouter");
    });
  });

  describe("validateApiKey", () => {
    it("should reject empty key", () => {
      const result = validateApiKey("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("不能为空");
    });

    it("should reject short key", () => {
      const result = validateApiKey("abc");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("长度过短");
    });

    it("should reject overly long key", () => {
      const result = validateApiKey("a".repeat(513));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("长度过长");
    });

    it("should reject placeholder key", () => {
      const result = validateApiKey("your_api_key_here");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("替换");
    });

    it("should reject key with control characters", () => {
      const result = validateApiKey("sk-test\x00key-1234567890");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("非法字符");
    });

    it("should accept valid key", () => {
      const result = validateApiKey("sk-1234567890abcdef1234567890abcdef");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("getKeyStrength", () => {
    it("should return invalid for invalid key", () => {
      expect(getKeyStrength("")).toBe("invalid");
    });

    it("should return weak for short valid key", () => {
      expect(getKeyStrength("sk-1234567890abcdef")).toBe("weak");
    });

    it("should return medium for medium length key", () => {
      expect(getKeyStrength("sk-" + "a".repeat(28))).toBe("medium");
    });

    it("should return strong for long key", () => {
      expect(getKeyStrength("sk-" + "a".repeat(50))).toBe("strong");
    });
  });

  describe("getKeyStrengthInfo", () => {
    it("should return correct info for invalid", () => {
      const info = getKeyStrengthInfo("invalid");
      expect(info.label).toBe("无效");
      expect(info.color).toContain("red");
    });

    it("should return correct info for weak", () => {
      const info = getKeyStrengthInfo("weak");
      expect(info.label).toBe("弱");
    });

    it("should return correct info for medium", () => {
      const info = getKeyStrengthInfo("medium");
      expect(info.label).toBe("中等");
    });

    it("should return correct info for strong", () => {
      const info = getKeyStrengthInfo("strong");
      expect(info.label).toBe("强");
    });
  });
});
