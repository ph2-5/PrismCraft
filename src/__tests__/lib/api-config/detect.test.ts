import { describe, it, expect } from "vitest";
import { detectProvider, validateApiKey } from "@/infrastructure/ai-providers/api-config/detect";

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

    it("should detect Anthropic key", () => {
      const key = "sk-ant-api03-abc123def456ghi789";
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("anthropic");
      expect(result!.confidence).toBe("high");
    });

    it("should detect Google Gemini key", () => {
      const key = "AIza" + "a".repeat(32);
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("google");
      expect(result!.confidence).toBe("high");
    });

    it("should detect DeepSeek key (32 chars)", () => {
      const key = "sk-" + "a".repeat(32);
      const result = detectProvider(key);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe("deepseek");
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
      expect(result.errorKey).toBe("provider.apiKey.empty");
    });

    it("should reject short key", () => {
      const result = validateApiKey("abc");
      expect(result.valid).toBe(false);
      expect(result.errorKey).toBe("provider.apiKey.tooShort");
    });

    it("should reject overly long key", () => {
      const result = validateApiKey("a".repeat(513));
      expect(result.valid).toBe(false);
      expect(result.errorKey).toBe("provider.apiKey.tooLong");
    });

    it("should reject placeholder key", () => {
      const result = validateApiKey("your_api_key_here");
      expect(result.valid).toBe(false);
      expect(result.errorKey).toBe("provider.apiKey.placeholderDetected");
    });

    it("should reject key with control characters", () => {
      const result = validateApiKey("sk-test\x00key-1234567890");
      expect(result.valid).toBe(false);
      expect(result.errorKey).toBe("provider.apiKey.invalidChars");
    });

    it("should accept valid key", () => {
      const result = validateApiKey("sk-1234567890abcdef1234567890abcdef");
      expect(result.valid).toBe(true);
      expect(result.errorKey).toBeUndefined();
    });
  });
});
