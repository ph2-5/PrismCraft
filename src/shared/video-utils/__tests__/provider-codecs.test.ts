import { describe, it, expect } from "vitest";
import {
  getProviderSupportedCodecs,
  getProviderMaxDuration,
} from "../provider-codecs";

describe("provider-codecs", () => {
  describe("getProviderSupportedCodecs", () => {
    it("should return correct codecs for volcengine", () => {
      expect(getProviderSupportedCodecs("volcengine")).toEqual(["h264", "h265"]);
    });

    it("should return correct codecs for kuaishou", () => {
      expect(getProviderSupportedCodecs("kuaishou")).toEqual(["h264", "h265"]);
    });

    it("should return correct codecs for zhipu", () => {
      expect(getProviderSupportedCodecs("zhipu")).toEqual(["h264"]);
    });

    it("should return correct codecs for pixverse", () => {
      expect(getProviderSupportedCodecs("pixverse")).toEqual(["h264", "h265"]);
    });

    it("should return correct codecs for seedance", () => {
      expect(getProviderSupportedCodecs("seedance")).toEqual(["h264", "h265"]);
    });

    it("should return correct codecs for google", () => {
      expect(getProviderSupportedCodecs("google")).toEqual(["h264", "h265", "vp9"]);
    });

    it("should return correct codecs for anthropic", () => {
      expect(getProviderSupportedCodecs("anthropic")).toEqual(["h264", "h265"]);
    });

    it("should return correct codecs for openai-sora", () => {
      expect(getProviderSupportedCodecs("openai-sora")).toEqual(["h264", "h265"]);
    });

    it("should return correct codecs for minimax", () => {
      expect(getProviderSupportedCodecs("minimax")).toEqual(["h264", "h265"]);
    });

    it("should return correct codecs for openai", () => {
      expect(getProviderSupportedCodecs("openai")).toEqual(["h264", "h265"]);
    });

    it("should return correct codecs for openai-compatible", () => {
      expect(getProviderSupportedCodecs("openai-compatible")).toEqual(["h264", "h265"]);
    });

    it("should fall back to openai-compatible for unknown provider", () => {
      expect(getProviderSupportedCodecs("unknown-provider")).toEqual(["h264", "h265"]);
    });

    it("should fall back to openai-compatible for empty string", () => {
      expect(getProviderSupportedCodecs("")).toEqual(["h264", "h265"]);
    });
  });

  describe("getProviderMaxDuration", () => {
    it("should return 12 for volcengine", () => {
      expect(getProviderMaxDuration("volcengine")).toBe(12);
    });

    it("should return 10 for kuaishou", () => {
      expect(getProviderMaxDuration("kuaishou")).toBe(10);
    });

    it("should return 10 for zhipu", () => {
      expect(getProviderMaxDuration("zhipu")).toBe(10);
    });

    it("should return 10 for pixverse", () => {
      expect(getProviderMaxDuration("pixverse")).toBe(10);
    });

    it("should return 12 for seedance", () => {
      expect(getProviderMaxDuration("seedance")).toBe(12);
    });

    it("should return 8 for google", () => {
      expect(getProviderMaxDuration("google")).toBe(8);
    });

    it("should return 20 for openai-sora", () => {
      expect(getProviderMaxDuration("openai-sora")).toBe(20);
    });

    it("should return 10 for minimax", () => {
      expect(getProviderMaxDuration("minimax")).toBe(10);
    });

    it("should return 12 for openai-compatible", () => {
      expect(getProviderMaxDuration("openai-compatible")).toBe(12);
    });

    it("should return undefined for unknown provider", () => {
      expect(getProviderMaxDuration("unknown-provider")).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      expect(getProviderMaxDuration("")).toBeUndefined();
    });

    it("should return undefined for openai (not in max duration map)", () => {
      expect(getProviderMaxDuration("openai")).toBeUndefined();
    });
  });
});
