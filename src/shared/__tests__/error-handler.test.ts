import { describe, it, expect, vi } from "vitest";
import { AppError, GenerationError, RateLimitError, ApiError } from "@/domain/types/result";

const { mockClassifyNetworkError } = vi.hoisted(() => ({
  mockClassifyNetworkError: vi.fn(),
}));

vi.mock("@/shared/utils/error-classifier", () => ({
  classifyNetworkError: mockClassifyNetworkError,
}));

import {
  isAppError,
  createAppError,
  createGenerationError,
  createRateLimitError,
  createApiError,
  handleError,
  handleApiClientError,
  getErrorMessage,
} from "../error-handler";

describe("error-handler", () => {
  describe("isAppError", () => {
    it("should return true for AppError instance", () => {
      expect(isAppError(new AppError("CODE", "message"))).toBe(true);
    });

    it("should return true for GenerationError instance (subclass)", () => {
      expect(isAppError(new GenerationError("message", "video"))).toBe(true);
    });

    it("should return true for RateLimitError instance (subclass)", () => {
      expect(isAppError(new RateLimitError("message"))).toBe(true);
    });

    it("should return true for ApiError instance (subclass)", () => {
      expect(isAppError(new ApiError("message"))).toBe(true);
    });

    it("should return false for plain Error", () => {
      expect(isAppError(new Error("message"))).toBe(false);
    });

    it("should return false for string", () => {
      expect(isAppError("error")).toBe(false);
    });

    it("should return false for null", () => {
      expect(isAppError(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isAppError(undefined)).toBe(false);
    });

    it("should return false for object", () => {
      expect(isAppError({ code: "CODE", message: "msg" })).toBe(false);
    });

    it("should narrow type correctly", () => {
      const error: unknown = new AppError("CODE", "message");
      if (isAppError(error)) {
        expect(error.code).toBe("CODE");
        expect(error.message).toBe("message");
      }
    });
  });

  describe("createAppError", () => {
    it("should create AppError with code and message", () => {
      const error = createAppError("DATABASE_ERROR", "db failed");
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("DATABASE_ERROR");
      expect(error.message).toBe("db failed");
    });

    it("should create AppError with cause", () => {
      const cause = new Error("root cause");
      const error = createAppError("NETWORK_ERROR", "network failed", cause);
      expect(error.cause).toBe(cause);
    });

    it("should create AppError without cause", () => {
      const error = createAppError("UNKNOWN_ERROR", "unknown");
      expect(error.cause).toBeUndefined();
    });
  });

  describe("createGenerationError", () => {
    it("should create GenerationError with generationType", () => {
      const error = createGenerationError("gen failed", "video");
      expect(error).toBeInstanceOf(GenerationError);
      expect(error.code).toBe("GENERATION_ERROR");
      expect(error.generationType).toBe("video");
      expect(error.message).toBe("gen failed");
    });

    it("should create GenerationError with all generation types", () => {
      const types = ["keyframe", "framePair", "video", "image", "text"] as const;
      for (const type of types) {
        const error = createGenerationError("failed", type);
        expect(error.generationType).toBe(type);
      }
    });

    it("should create GenerationError with cause", () => {
      const cause = new Error("api timeout");
      const error = createGenerationError("gen failed", "image", cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("createRateLimitError", () => {
    it("should create RateLimitError without retryAfter", () => {
      const error = createRateLimitError("too many requests");
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.code).toBe("RATE_LIMIT_ERROR");
      expect(error.message).toBe("too many requests");
      expect(error.retryAfter).toBeUndefined();
    });

    it("should create RateLimitError with retryAfter", () => {
      const error = createRateLimitError("too many requests", 60);
      expect(error.retryAfter).toBe(60);
    });

    it("should create RateLimitError with cause", () => {
      const cause = new Error("429 response");
      const error = createRateLimitError("rate limited", 30, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("createApiError", () => {
    it("should create ApiError with message only", () => {
      const error = createApiError("api failed");
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe("API_ERROR");
      expect(error.message).toBe("api failed");
      expect(error.statusCode).toBeUndefined();
      expect(error.apiCode).toBeUndefined();
    });

    it("should create ApiError with statusCode and code", () => {
      const error = createApiError("api failed", 500, "INTERNAL_ERROR");
      expect(error.statusCode).toBe(500);
      expect(error.apiCode).toBe("INTERNAL_ERROR");
    });

    it("should create ApiError with cause", () => {
      const cause = new Error("connection reset");
      const error = createApiError("api failed", 500, "ERR", cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("handleError", () => {
    it("should return existing AppError as-is", () => {
      const appError = new AppError("NETWORK_ERROR", "network failed");
      const result = handleError(appError);
      expect(result).toBe(appError);
    });

    it("should return existing GenerationError as-is", () => {
      const genError = new GenerationError("gen failed", "video");
      const result = handleError(genError);
      expect(result).toBe(genError);
    });

    it("should classify timeout error via classifyNetworkError", () => {
      mockClassifyNetworkError.mockReturnValue("timeout");
      const error = new Error("request timed out");
      const result = handleError(error);
      expect(result.code).toBe("TIMEOUT_ERROR");
      expect(result.message).toBe("request timed out");
    });

    it("should classify network error via classifyNetworkError", () => {
      mockClassifyNetworkError.mockReturnValue("network");
      const error = new Error("connection refused");
      const result = handleError(error);
      expect(result.code).toBe("NETWORK_ERROR");
    });

    it("should classify storage error by message content", () => {
      mockClassifyNetworkError.mockReturnValue("unknown");
      const error = new Error("storage quota exceeded");
      const result = handleError(error);
      expect(result.code).toBe("STORAGE_ERROR");
    });

    it("should classify indexeddb error by message content", () => {
      mockClassifyNetworkError.mockReturnValue("unknown");
      const error = new Error("indexeddb not available");
      const result = handleError(error);
      expect(result.code).toBe("STORAGE_ERROR");
    });

    it("should classify quota error by message content", () => {
      mockClassifyNetworkError.mockReturnValue("unknown");
      const error = new Error("QuotaExceededError");
      const result = handleError(error);
      expect(result.code).toBe("STORAGE_ERROR");
    });

    it("should classify auth error by message content", () => {
      mockClassifyNetworkError.mockReturnValue("unknown");
      const error = new Error("unauthorized access");
      const result = handleError(error);
      expect(result.code).toBe("AUTHENTICATION_ERROR");
    });

    it("should classify forbidden error by message content", () => {
      mockClassifyNetworkError.mockReturnValue("unknown");
      const error = new Error("forbidden resource");
      const result = handleError(error);
      expect(result.code).toBe("AUTHENTICATION_ERROR");
    });

    it("should classify token error by message content", () => {
      mockClassifyNetworkError.mockReturnValue("unknown");
      const error = new Error("token expired");
      const result = handleError(error);
      expect(result.code).toBe("AUTHENTICATION_ERROR");
    });

    it("should classify auth error by message content (case insensitive)", () => {
      mockClassifyNetworkError.mockReturnValue("unknown");
      const error = new Error("Auth required");
      const result = handleError(error);
      expect(result.code).toBe("AUTHENTICATION_ERROR");
    });

    it("should return UNKNOWN_ERROR for unclassified Error", () => {
      mockClassifyNetworkError.mockReturnValue("unknown");
      const error = new Error("something went wrong");
      const result = handleError(error);
      expect(result.code).toBe("UNKNOWN_ERROR");
    });

    it("should handle string error", () => {
      const result = handleError("string error");
      expect(result.code).toBe("UNKNOWN_ERROR");
      expect(result.message).toBe("string error");
    });

    it("should handle number error", () => {
      const result = handleError(404);
      expect(result.code).toBe("UNKNOWN_ERROR");
      expect(result.message).toBe("404");
    });

    it("should handle object error", () => {
      const result = handleError({ code: "ERR" });
      expect(result.code).toBe("UNKNOWN_ERROR");
    });

    it("should preserve cause from original Error", () => {
      mockClassifyNetworkError.mockReturnValue("timeout");
      const cause = new Error("root cause");
      const error = new Error("timeout occurred");
      error.cause = cause;
      const result = handleError(error);
      expect(result.cause).toBe(error);
    });

    it("should use error.code property for classification", () => {
      mockClassifyNetworkError.mockReturnValue("timeout");
      const error = new Error("failed");
      (error as unknown as { code: string }).code = "ETIMEDOUT";
      const result = handleError(error);
      expect(mockClassifyNetworkError).toHaveBeenCalledWith("ETIMEDOUT", "failed");
    });
  });

  describe("handleApiClientError", () => {
    it("should classify 401 as AUTHENTICATION_ERROR", () => {
      const result = handleApiClientError({ statusCode: 401, message: "unauthorized" });
      expect(result.code).toBe("AUTHENTICATION_ERROR");
      expect(result.message).toBe("unauthorized");
    });

    it("should classify 429 as RATE_LIMIT_ERROR", () => {
      const result = handleApiClientError({ statusCode: 429, message: "too many requests" });
      expect(result.code).toBe("RATE_LIMIT_ERROR");
    });

    it("should classify 500 as NETWORK_ERROR", () => {
      const result = handleApiClientError({ statusCode: 500, message: "internal server error" });
      expect(result.code).toBe("NETWORK_ERROR");
    });

    it("should classify 502 as NETWORK_ERROR", () => {
      const result = handleApiClientError({ statusCode: 502, message: "bad gateway" });
      expect(result.code).toBe("NETWORK_ERROR");
    });

    it("should classify 503 as NETWORK_ERROR", () => {
      const result = handleApiClientError({ statusCode: 503, message: "service unavailable" });
      expect(result.code).toBe("NETWORK_ERROR");
    });

    it("should classify 400 as API_ERROR", () => {
      const result = handleApiClientError({ statusCode: 400, message: "bad request" });
      expect(result.code).toBe("API_ERROR");
      expect(result).toBeInstanceOf(ApiError);
    });

    it("should classify 404 as API_ERROR", () => {
      const result = handleApiClientError({ statusCode: 404, message: "not found" });
      expect(result.code).toBe("API_ERROR");
    });

    it("should classify 422 as API_ERROR", () => {
      const result = handleApiClientError({ statusCode: 422, message: "validation error" });
      expect(result.code).toBe("API_ERROR");
    });

    it("should create ApiError with statusCode and code for non-special status codes", () => {
      const result = handleApiClientError({
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "bad request",
      });
      const apiError = result as ApiError;
      expect(apiError.statusCode).toBe(400);
      expect(apiError.apiCode).toBe("VALIDATION_FAILED");
    });

    it("should handle error without statusCode as API_ERROR", () => {
      const result = handleApiClientError({ message: "unknown error" });
      expect(result.code).toBe("API_ERROR");
    });

    it("should preserve original error as cause", () => {
      const original = { statusCode: 401, message: "unauthorized" };
      const result = handleApiClientError(original);
      expect(result.cause).toBe(original);
    });
  });

  describe("getErrorMessage", () => {
    it("should extract message from AppError", () => {
      const error = new AppError("CODE", "app error message");
      expect(getErrorMessage(error)).toBe("app error message");
    });

    it("should extract message from GenerationError", () => {
      const error = new GenerationError("gen failed", "video");
      expect(getErrorMessage(error)).toBe("gen failed");
    });

    it("should extract message from RateLimitError", () => {
      const error = new RateLimitError("rate limited");
      expect(getErrorMessage(error)).toBe("rate limited");
    });

    it("should extract message from ApiError", () => {
      const error = new ApiError("api failed");
      expect(getErrorMessage(error)).toBe("api failed");
    });

    it("should extract message from plain Error", () => {
      const error = new Error("plain error message");
      expect(getErrorMessage(error)).toBe("plain error message");
    });

    it("should convert string error to itself", () => {
      expect(getErrorMessage("string error")).toBe("string error");
    });

    it("should convert number error to string", () => {
      expect(getErrorMessage(404)).toBe("404");
    });

    it("should convert null to string", () => {
      expect(getErrorMessage(null)).toBe("null");
    });

    it("should convert undefined to string", () => {
      expect(getErrorMessage(undefined)).toBe("undefined");
    });

    it("should convert object to string", () => {
      expect(getErrorMessage({ key: "value" })).toBe("[object Object]");
    });
  });
});
