import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockClassifyError } = vi.hoisted(() => ({
  mockClassifyError: vi.fn(),
}));

vi.mock("@/domain/types", () => ({
  classifyError: mockClassifyError,
}));

import {
  classifyNetworkError,
  isNetworkError,
  classifyErrorSeverity,
} from "../error-classifier";

describe("error-classifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("classifyNetworkError", () => {
    it("should map timeout category to timeout", () => {
      mockClassifyError.mockReturnValue("timeout");
      expect(classifyNetworkError("TIMEOUT_ERROR", "timeout")).toBe("timeout");
    });

    it("should map network category to network", () => {
      mockClassifyError.mockReturnValue("network");
      expect(classifyNetworkError("NETWORK_ERROR", "network error")).toBe("network");
    });

    it("should map database_busy category to network", () => {
      mockClassifyError.mockReturnValue("database_busy");
      expect(classifyNetworkError("DATABASE_ERROR", "database is busy")).toBe("network");
    });

    it("should return unknown for rate_limit category", () => {
      mockClassifyError.mockReturnValue("rate_limit");
      expect(classifyNetworkError("RATE_LIMIT_ERROR")).toBe("unknown");
    });

    it("should return unknown for server_error category", () => {
      mockClassifyError.mockReturnValue("server_error");
      expect(classifyNetworkError("API_ERROR")).toBe("unknown");
    });

    it("should return unknown for auth category", () => {
      mockClassifyError.mockReturnValue("auth");
      expect(classifyNetworkError("AUTHENTICATION_ERROR")).toBe("unknown");
    });

    it("should return unknown for unknown category", () => {
      mockClassifyError.mockReturnValue("unknown");
      expect(classifyNetworkError(undefined, undefined)).toBe("unknown");
    });

    it("should return unknown for quota category", () => {
      mockClassifyError.mockReturnValue("quota");
      expect(classifyNetworkError("QUOTA_ERROR")).toBe("unknown");
    });

    it("should return unknown for invalid_params category", () => {
      mockClassifyError.mockReturnValue("invalid_params");
      expect(classifyNetworkError("VALIDATION_ERROR")).toBe("unknown");
    });
  });

  describe("isNetworkError", () => {
    it("should return true for TypeError classified as network", () => {
      mockClassifyError.mockReturnValue("network");
      const error = new TypeError("Failed to fetch");
      expect(isNetworkError(error)).toBe(true);
    });

    it("should return true for TypeError classified as timeout", () => {
      mockClassifyError.mockReturnValue("timeout");
      const error = new TypeError("Network request timeout");
      expect(isNetworkError(error)).toBe(true);
    });

    it("should return false for TypeError classified as unknown", () => {
      mockClassifyError.mockReturnValue("unknown");
      const error = new TypeError("some type error");
      expect(isNetworkError(error)).toBe(false);
    });

    it("should return true for Error with network code", () => {
      mockClassifyError.mockReturnValue("network");
      const error = new Error("connection lost");
      (error as unknown as Record<string, unknown>).code = "NETWORK_ERROR";
      expect(isNetworkError(error)).toBe(true);
    });

    it("should return true for Error with timeout code", () => {
      mockClassifyError.mockReturnValue("timeout");
      const error = new Error("request timed out");
      (error as unknown as Record<string, unknown>).code = "TIMEOUT_ERROR";
      expect(isNetworkError(error)).toBe(true);
    });

    it("should return false for Error classified as unknown", () => {
      mockClassifyError.mockReturnValue("unknown");
      const error = new Error("something went wrong");
      expect(isNetworkError(error)).toBe(false);
    });

    it("should return false for non-Error values", () => {
      expect(isNetworkError("string")).toBe(false);
      expect(isNetworkError(42)).toBe(false);
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
      expect(isNetworkError({ message: "error" })).toBe(false);
    });
  });

  describe("classifyErrorSeverity", () => {
    it("should return app for null error", () => {
      expect(classifyErrorSeverity(null)).toBe("app");
    });

    it("should return network for network errors", () => {
      mockClassifyError.mockReturnValue("network");
      const error = new Error("network failure");
      (error as unknown as Record<string, unknown>).code = "NETWORK_ERROR";
      expect(classifyErrorSeverity(error)).toBe("network");
    });

    it("should return network for timeout errors", () => {
      mockClassifyError.mockReturnValue("timeout");
      const error = new Error("request timeout");
      (error as unknown as Record<string, unknown>).code = "TIMEOUT_ERROR";
      expect(classifyErrorSeverity(error)).toBe("network");
    });

    it("should return loading for chunk load errors", () => {
      mockClassifyError.mockReturnValue("unknown");
      const error = new Error("Loading chunk 5 failed");
      expect(classifyErrorSeverity(error)).toBe("loading");
    });

    it("should return loading for module loading errors", () => {
      mockClassifyError.mockReturnValue("unknown");
      const error = new Error("Cannot find module './component'");
      expect(classifyErrorSeverity(error)).toBe("loading");
    });

    it("should return network for fetch-related messages even if not classified as network error", () => {
      mockClassifyError.mockReturnValue("unknown");
      const error = new Error("Failed to fetch data from server");
      expect(classifyErrorSeverity(error)).toBe("network");
    });

    it("should return network for offline messages", () => {
      mockClassifyError.mockReturnValue("unknown");
      const error = new Error("User is offline");
      expect(classifyErrorSeverity(error)).toBe("network");
    });

    it("should return app for generic errors", () => {
      mockClassifyError.mockReturnValue("unknown");
      const error = new Error("Something unexpected happened");
      expect(classifyErrorSeverity(error)).toBe("app");
    });

    it("should return app for validation errors", () => {
      mockClassifyError.mockReturnValue("unknown");
      const error = new Error("Invalid input parameter");
      expect(classifyErrorSeverity(error)).toBe("app");
    });
  });
});
