import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  fromThrowable,
  fromAsyncThrowable,
  AppError,
  DatabaseError,
  ValidationError,
  ApiError,
  NotFoundError,
  NetworkError,
  StorageError,
  ConfigurationError,
  GenerationError,
  TimeoutError,
  RateLimitError,
  AuthenticationError,
} from "@/domain/types/result";
import type { Result } from "@/domain/types/result";

describe("result", () => {
  describe("ok", () => {
    it("should create a successful result", () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it("should create a successful result with string", () => {
      const result = ok("hello");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("hello");
      }
    });

    it("should create a successful result with null", () => {
      const result = ok(null);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should create a successful result with undefined", () => {
      const result = ok(undefined);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });

    it("should create a successful result with object", () => {
      const result = ok({ name: "test", count: 5 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe("test");
      }
    });
  });

  describe("err", () => {
    it("should create an error result", () => {
      const error = new AppError("TEST_ERROR", "test error message");
      const result = err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
        expect(result.error.code).toBe("TEST_ERROR");
        expect(result.error.message).toBe("test error message");
      }
    });

    it("should create an error result with cause", () => {
      const cause = new Error("original error");
      const error = new AppError("WRAPPED", "wrapped error", cause);
      const result = err(error);
      if (!result.ok) {
        expect(result.error.cause).toBe(cause);
      }
    });
  });

  describe("fromThrowable", () => {
    it("should return ok when function succeeds", () => {
      const result = fromThrowable(() => 42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it("should return err when function throws AppError", () => {
      const appError = new AppError("CUSTOM", "custom error");
      const result = fromThrowable(() => {
        throw appError;
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(appError);
        expect(result.error.code).toBe("CUSTOM");
      }
    });

    it("should return err with UNKNOWN_ERROR when function throws Error", () => {
      const result = fromThrowable(() => {
        throw new Error("some error");
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
        expect(result.error.message).toBe("some error");
      }
    });

    it("should return err with UNKNOWN_ERROR when function throws string", () => {
      const result = fromThrowable(() => {
        throw "string error";
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
        expect(result.error.message).toBe("string error");
      }
    });

    it("should return err with UNKNOWN_ERROR when function throws number", () => {
      const result = fromThrowable(() => {
        throw 404;
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
        expect(result.error.message).toBe("404");
      }
    });
  });

  describe("fromAsyncThrowable", () => {
    it("should return ok when async function succeeds", async () => {
      const result = await fromAsyncThrowable(async () => 42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it("should return err when async function throws AppError", async () => {
      const appError = new AppError("ASYNC_CUSTOM", "async custom error");
      const result = await fromAsyncThrowable(async () => {
        throw appError;
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(appError);
      }
    });

    it("should return err with UNKNOWN_ERROR when async function throws Error", async () => {
      const result = await fromAsyncThrowable(async () => {
        throw new Error("async error");
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
        expect(result.error.message).toBe("async error");
      }
    });

    it("should return err with UNKNOWN_ERROR when async function throws string", async () => {
      const result = await fromAsyncThrowable(async () => {
        throw "async string error";
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
        expect(result.error.message).toBe("async string error");
      }
    });

    it("should return err with UNKNOWN_ERROR when async function rejects with non-Error", async () => {
      const result = await fromAsyncThrowable(async () => {
        throw { message: "object error" };
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
        expect(result.error.message).toBe("[object Object]");
      }
    });
  });

  describe("AppError", () => {
    it("should have correct name", () => {
      const error = new AppError("CODE", "message");
      expect(error.name).toBe("AppError");
    });

    it("should be instance of Error", () => {
      const error = new AppError("CODE", "message");
      expect(error).toBeInstanceOf(Error);
    });

    it("should have toString method", () => {
      const error = new AppError("TEST_CODE", "test message");
      expect(error.toString()).toBe("[TEST_CODE] test message");
    });

    it("should store cause", () => {
      const cause = new Error("root cause");
      const error = new AppError("CODE", "message", cause);
      expect(error.cause).toBe(cause);
    });

    it("should work without cause", () => {
      const error = new AppError("CODE", "message");
      expect(error.cause).toBeUndefined();
    });
  });

  describe("DatabaseError", () => {
    it("should have DATABASE_ERROR code", () => {
      const error = new DatabaseError("db failed");
      expect(error.code).toBe("DATABASE_ERROR");
      expect(error.message).toBe("db failed");
    });

    it("should be instance of AppError", () => {
      const error = new DatabaseError("db failed");
      expect(error).toBeInstanceOf(AppError);
    });

    it("should store cause", () => {
      const cause = new Error("connection refused");
      const error = new DatabaseError("db failed", cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("ValidationError", () => {
    it("should have VALIDATION_ERROR code", () => {
      const error = new ValidationError("invalid input");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toBe("invalid input");
    });

    it("should be instance of AppError", () => {
      const error = new ValidationError("invalid");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("ApiError", () => {
    it("should have API_ERROR code", () => {
      const error = new ApiError("api failed");
      expect(error.code).toBe("API_ERROR");
      expect(error.message).toBe("api failed");
    });

    it("should store statusCode and apiCode", () => {
      const error = new ApiError("api failed", 429, "RATE_LIMITED");
      expect(error.statusCode).toBe(429);
      expect(error.apiCode).toBe("RATE_LIMITED");
    });

    it("should work without optional fields", () => {
      const error = new ApiError("api failed");
      expect(error.statusCode).toBeUndefined();
      expect(error.apiCode).toBeUndefined();
    });

    it("should be instance of AppError", () => {
      const error = new ApiError("api failed");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("NotFoundError", () => {
    it("should have NOT_FOUND code with formatted message", () => {
      const error = new NotFoundError("Video", "vid-123");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toContain("Video");
      expect(error.message).toContain("vid-123");
      expect(error.message).toContain("not found");
    });

    it("should be instance of AppError", () => {
      const error = new NotFoundError("Task", "t-1");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("NetworkError", () => {
    it("should have NETWORK_ERROR code", () => {
      const error = new NetworkError("connection timeout");
      expect(error.code).toBe("NETWORK_ERROR");
    });

    it("should be instance of AppError", () => {
      const error = new NetworkError("err");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("StorageError", () => {
    it("should have STORAGE_ERROR code", () => {
      const error = new StorageError("disk full");
      expect(error.code).toBe("STORAGE_ERROR");
    });

    it("should be instance of AppError", () => {
      const error = new StorageError("err");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("ConfigurationError", () => {
    it("should have CONFIGURATION_ERROR code", () => {
      const error = new ConfigurationError("missing config");
      expect(error.code).toBe("CONFIGURATION_ERROR");
    });

    it("should be instance of AppError", () => {
      const error = new ConfigurationError("err");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("GenerationError", () => {
    it("should have GENERATION_ERROR code and generationType", () => {
      const error = new GenerationError("gen failed", "video");
      expect(error.code).toBe("GENERATION_ERROR");
      expect(error.generationType).toBe("video");
    });

    it("should support all generation types", () => {
      const types = ["keyframe", "framePair", "video", "image", "text"] as const;
      for (const type of types) {
        const error = new GenerationError("failed", type);
        expect(error.generationType).toBe(type);
      }
    });

    it("should be instance of AppError", () => {
      const error = new GenerationError("err", "video");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("TimeoutError", () => {
    it("should have TIMEOUT_ERROR code", () => {
      const error = new TimeoutError("request timed out");
      expect(error.code).toBe("TIMEOUT_ERROR");
    });

    it("should be instance of AppError", () => {
      const error = new TimeoutError("err");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("RateLimitError", () => {
    it("should have RATE_LIMIT_ERROR code", () => {
      const error = new RateLimitError("too many requests");
      expect(error.code).toBe("RATE_LIMIT_ERROR");
    });

    it("should store retryAfter", () => {
      const error = new RateLimitError("rate limited", 60);
      expect(error.retryAfter).toBe(60);
    });

    it("should work without retryAfter", () => {
      const error = new RateLimitError("rate limited");
      expect(error.retryAfter).toBeUndefined();
    });

    it("should be instance of AppError", () => {
      const error = new RateLimitError("err");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("AuthenticationError", () => {
    it("should have AUTHENTICATION_ERROR code", () => {
      const error = new AuthenticationError("invalid token");
      expect(error.code).toBe("AUTHENTICATION_ERROR");
    });

    it("should be instance of AppError", () => {
      const error = new AuthenticationError("err");
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe("Result type narrowing", () => {
    it("should narrow type with ok check", () => {
      const result: Result<number> = ok(42);
      if (result.ok) {
        expect(result.value).toBe(42);
      } else {
        expect.fail("Should be ok");
      }
    });

    it("should narrow type with !ok check", () => {
      const result: Result<number> = err(new AppError("ERR", "error"));
      if (!result.ok) {
        expect(result.error.code).toBe("ERR");
      } else {
        expect.fail("Should be err");
      }
    });
  });
});
