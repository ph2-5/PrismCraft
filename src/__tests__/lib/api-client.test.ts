import { describe, it, expect } from "vitest";
import { ApiClientError } from "@/infrastructure/ai-providers/errors";
import { safeTruncatePrompt, MAX_PROMPT_LENGTH } from "@/infrastructure/ai-providers/config";

describe("ApiClientError", () => {
  it("should create error with message", () => {
    const error = new ApiClientError("Test error");
    expect(error.message).toBe("Test error");
    expect(error.name).toBe("ApiClientError");
    expect(error instanceof Error).toBe(true);
  });

  it("should create error with statusCode", () => {
    const error = new ApiClientError("Not found", 404);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Not found");
  });

  it("should create error with code", () => {
    const error = new ApiClientError("Rate limited", 429, "RATE_LIMITED");
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.statusCode).toBe(429);
  });

  it("should have undefined statusCode and code by default", () => {
    const error = new ApiClientError("Simple error");
    expect(error.statusCode).toBeUndefined();
    expect(error.code).toBeUndefined();
  });

  it("should be catchable as Error", () => {
    const throwIt = () => {
      throw new ApiClientError("test", 500, "INTERNAL_ERROR");
    };

    expect(throwIt).toThrow(Error);
    expect(throwIt).toThrow(ApiClientError);
  });

  it("should distinguish from regular Error", () => {
    const apiError = new ApiClientError("api", 400);
    const regularError = new Error("regular");

    expect(apiError instanceof ApiClientError).toBe(true);
    expect(regularError instanceof ApiClientError).toBe(false);
  });

  it("should handle common HTTP error codes", () => {
    const unauthorized = new ApiClientError("Unauthorized", 401, "INVALID_API_KEY");
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.code).toBe("INVALID_API_KEY");

    const notFound = new ApiClientError("Not found", 404, "ENDPOINT_NOT_FOUND");
    expect(notFound.statusCode).toBe(404);

    const serverError = new ApiClientError("Server error", 500, "API_SERVER_ERROR");
    expect(serverError.statusCode).toBe(500);
  });
});

describe("safeTruncatePrompt", () => {
  it("should not truncate prompt within limit", () => {
    const prompt = "a".repeat(100);
    const result = safeTruncatePrompt(prompt);
    expect(result.truncated).toBe(prompt);
    expect(result.wasTruncated).toBe(false);
  });

  it("should truncate prompt exceeding MAX_PROMPT_LENGTH", () => {
    const prompt = "a".repeat(MAX_PROMPT_LENGTH + 5000);
    const result = safeTruncatePrompt(prompt);
    expect(result.truncated.length).toBeLessThanOrEqual(MAX_PROMPT_LENGTH);
    expect(result.wasTruncated).toBe(true);
  });

  it("should preserve start and end content after truncation", () => {
    const startContent = "START_MARKER";
    const endContent = "END_MARKER";
    const middle = "x".repeat(MAX_PROMPT_LENGTH + 5000);
    const prompt = startContent + middle + endContent;

    const result = safeTruncatePrompt(prompt);
    expect(result.truncated).toContain("START_MARKER");
    expect(result.truncated).toContain("END_MARKER");
    expect(result.truncated).toContain("内容已截断");
  });

  it("should handle prompt exactly at MAX_PROMPT_LENGTH", () => {
    const prompt = "a".repeat(MAX_PROMPT_LENGTH);
    const result = safeTruncatePrompt(prompt);
    expect(result.wasTruncated).toBe(false);
  });

  it("should handle empty string", () => {
    const result = safeTruncatePrompt("");
    expect(result.truncated).toBe("");
    expect(result.wasTruncated).toBe(false);
  });
});
