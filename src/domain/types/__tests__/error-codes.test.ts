import { describe, it, expect } from "vitest";
import {
  getErrorCodeEntry,
  isRetryable,
  getErrorDomain,
  getAllErrorCodes,
  getErrorCodesByDomain,
  isRegisteredCode,
  classifyError,
} from "@/domain/types/error-codes";
import type { ErrorCodeEntry, ErrorDomain, ErrorCategory } from "@/domain/types/error-codes";

describe("error-codes", () => {
  describe("getErrorCodeEntry", () => {
    it("should return entry for known code", () => {
      const entry = getErrorCodeEntry("DATABASE_ERROR");
      expect(entry).toBeDefined();
      expect(entry!.code).toBe("DATABASE_ERROR");
      expect(entry!.domain).toBe("database");
      expect(entry!.description).toBe("数据库操作失败");
      expect(entry!.retryable).toBe(true);
    });

    it("should return entry for TIMEOUT_ERROR", () => {
      const entry = getErrorCodeEntry("TIMEOUT_ERROR");
      expect(entry).toBeDefined();
      expect(entry!.domain).toBe("network");
      expect(entry!.retryable).toBe(true);
    });

    it("should return entry for AUTHENTICATION_ERROR", () => {
      const entry = getErrorCodeEntry("AUTHENTICATION_ERROR");
      expect(entry).toBeDefined();
      expect(entry!.domain).toBe("auth");
      expect(entry!.retryable).toBe(false);
    });

    it("should return undefined for unknown code", () => {
      expect(getErrorCodeEntry("NONEXISTENT_CODE")).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      expect(getErrorCodeEntry("")).toBeUndefined();
    });

    it("should be case-sensitive", () => {
      expect(getErrorCodeEntry("database_error")).toBeUndefined();
    });
  });

  describe("isRetryable", () => {
    it("should return true for retryable codes", () => {
      expect(isRetryable("DATABASE_ERROR")).toBe(true);
      expect(isRetryable("API_ERROR")).toBe(true);
      expect(isRetryable("NETWORK_ERROR")).toBe(true);
      expect(isRetryable("TIMEOUT_ERROR")).toBe(true);
      expect(isRetryable("RATE_LIMIT_ERROR")).toBe(true);
      expect(isRetryable("GENERATION_ERROR")).toBe(true);
      expect(isRetryable("STORAGE_ERROR")).toBe(true);
      expect(isRetryable("VERIFICATION_FAILED")).toBe(true);
      expect(isRetryable("RECOVERY_PENDING")).toBe(true);
      expect(isRetryable("QUERY_FAILED")).toBe(true);
    });

    it("should return false for non-retryable codes", () => {
      expect(isRetryable("VALIDATION_ERROR")).toBe(false);
      expect(isRetryable("NOT_FOUND")).toBe(false);
      expect(isRetryable("CONFIGURATION_ERROR")).toBe(false);
      expect(isRetryable("AUTHENTICATION_ERROR")).toBe(false);
      expect(isRetryable("UNKNOWN_ERROR")).toBe(false);
      expect(isRetryable("INVALID_TRANSITION")).toBe(false);
      expect(isRetryable("RETRY_NOT_RECOMMENDED")).toBe(false);
      expect(isRetryable("DUPLICATE_DETECTED")).toBe(false);
      expect(isRetryable("HIGH_RISK_RETRY")).toBe(false);
      expect(isRetryable("RECOVERY_FAILED")).toBe(false);
    });

    it("should return false for unknown codes", () => {
      expect(isRetryable("NONEXISTENT_CODE")).toBe(false);
    });
  });

  describe("getErrorDomain", () => {
    it("should return correct domain for database codes", () => {
      expect(getErrorDomain("DATABASE_ERROR")).toBe("database");
      expect(getErrorDomain("NOT_FOUND")).toBe("database");
    });

    it("should return correct domain for network codes", () => {
      expect(getErrorDomain("NETWORK_ERROR")).toBe("network");
      expect(getErrorDomain("TIMEOUT_ERROR")).toBe("network");
    });

    it("should return correct domain for api codes", () => {
      expect(getErrorDomain("API_ERROR")).toBe("api");
      expect(getErrorDomain("RATE_LIMIT_ERROR")).toBe("api");
    });

    it("should return correct domain for auth codes", () => {
      expect(getErrorDomain("AUTHENTICATION_ERROR")).toBe("auth");
    });

    it("should return correct domain for generation codes", () => {
      expect(getErrorDomain("GENERATION_ERROR")).toBe("generation");
      expect(getErrorDomain("SYNTHESIZE_PROGRESS")).toBe("generation");
    });

    it("should return correct domain for recovery codes", () => {
      expect(getErrorDomain("RETRY_NOT_RECOMMENDED")).toBe("recovery");
      expect(getErrorDomain("DUPLICATE_DETECTED")).toBe("recovery");
      expect(getErrorDomain("VERIFICATION_FAILED")).toBe("recovery");
      expect(getErrorDomain("RECOVERY_INCOMPLETE")).toBe("recovery");
      expect(getErrorDomain("RECOVERY_FAILED")).toBe("recovery");
      expect(getErrorDomain("RECOVERY_PENDING")).toBe("recovery");
      expect(getErrorDomain("UNKNOWN_STATUS")).toBe("recovery");
      expect(getErrorDomain("QUERY_FAILED")).toBe("recovery");
      expect(getErrorDomain("BACKGROUND_RECOVERY_ERROR")).toBe("recovery");
    });

    it("should return correct domain for cache codes", () => {
      expect(getErrorDomain("CACHE_CLEANUP_ERROR")).toBe("cache");
      expect(getErrorDomain("CACHE_VIDEO_ERROR")).toBe("cache");
      expect(getErrorDomain("CACHE_DB_ERROR")).toBe("cache");
    });

    it("should return correct domain for state codes", () => {
      expect(getErrorDomain("INVALID_TRANSITION")).toBe("state");
    });

    it("should return correct domain for system codes", () => {
      expect(getErrorDomain("UNKNOWN_ERROR")).toBe("system");
      expect(getErrorDomain("CLEANUP_ERROR")).toBe("system");
      expect(getErrorDomain("UNHANDLED_REJECTION")).toBe("system");
      expect(getErrorDomain("LOG")).toBe("system");
    });

    it("should return correct domain for config codes", () => {
      expect(getErrorDomain("CONFIGURATION_ERROR")).toBe("config");
    });

    it("should return correct domain for storage codes", () => {
      expect(getErrorDomain("STORAGE_ERROR")).toBe("storage");
    });

    it("should return undefined for unknown codes", () => {
      expect(getErrorDomain("NONEXISTENT_CODE")).toBeUndefined();
    });
  });

  describe("getAllErrorCodes", () => {
    it("should return all error code entries", () => {
      const all = getAllErrorCodes();
      expect(all.length).toBeGreaterThan(0);
    });

    it("should return entries with all required fields", () => {
      const all = getAllErrorCodes();
      for (const entry of all) {
        expect(entry).toHaveProperty("code");
        expect(entry).toHaveProperty("domain");
        expect(entry).toHaveProperty("description");
        expect(entry).toHaveProperty("retryable");
        expect(typeof entry.code).toBe("string");
        expect(typeof entry.domain).toBe("string");
        expect(typeof entry.description).toBe("string");
        expect(typeof entry.retryable).toBe("boolean");
      }
    });

    it("should have unique codes", () => {
      const all = getAllErrorCodes();
      const codes = all.map((e) => e.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it("should include all expected codes", () => {
      const all = getAllErrorCodes();
      const codes = all.map((e) => e.code);
      expect(codes).toContain("DATABASE_ERROR");
      expect(codes).toContain("VALIDATION_ERROR");
      expect(codes).toContain("API_ERROR");
      expect(codes).toContain("NETWORK_ERROR");
      expect(codes).toContain("TIMEOUT_ERROR");
      expect(codes).toContain("RATE_LIMIT_ERROR");
      expect(codes).toContain("AUTHENTICATION_ERROR");
      expect(codes).toContain("UNKNOWN_ERROR");
    });
  });

  describe("getErrorCodesByDomain", () => {
    it("should filter by database domain", () => {
      const entries = getErrorCodesByDomain("database");
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.domain).toBe("database");
      }
    });

    it("should filter by network domain", () => {
      const entries = getErrorCodesByDomain("network");
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.domain).toBe("network");
      }
    });

    it("should filter by recovery domain", () => {
      const entries = getErrorCodesByDomain("recovery");
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.domain).toBe("recovery");
      }
    });

    it("should return empty array for domain with no codes", () => {
      const entries = getErrorCodesByDomain("validation" as ErrorDomain);
      expect(entries.length).toBeGreaterThan(0);
    });

    it("should return empty array for unused domain", () => {
      const entries = getErrorCodesByDomain("generation");
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe("isRegisteredCode", () => {
    it("should return true for registered codes", () => {
      expect(isRegisteredCode("DATABASE_ERROR")).toBe(true);
      expect(isRegisteredCode("NETWORK_ERROR")).toBe(true);
      expect(isRegisteredCode("TIMEOUT_ERROR")).toBe(true);
      expect(isRegisteredCode("RATE_LIMIT_ERROR")).toBe(true);
    });

    it("should return false for unregistered codes", () => {
      expect(isRegisteredCode("NONEXISTENT_CODE")).toBe(false);
      expect(isRegisteredCode("")).toBe(false);
    });

    it("should be case-sensitive", () => {
      expect(isRegisteredCode("database_error")).toBe(false);
    });
  });

  describe("classifyError", () => {
    it("should classify known error codes via ERROR_CATEGORY_MAP", () => {
      expect(classifyError("TIMEOUT_ERROR")).toBe("timeout");
      expect(classifyError("RATE_LIMIT_ERROR")).toBe("rate_limit");
      expect(classifyError("NETWORK_ERROR")).toBe("network");
      expect(classifyError("DATABASE_ERROR")).toBe("database_busy");
      expect(classifyError("AUTHENTICATION_ERROR")).toBe("auth");
      expect(classifyError("VALIDATION_ERROR")).toBe("invalid_params");
      expect(classifyError("API_ERROR")).toBe("server_error");
      expect(classifyError("GENERATION_ERROR")).toBe("server_error");
      expect(classifyError("STORAGE_ERROR")).toBe("database_busy");
      expect(classifyError("CONFIGURATION_ERROR")).toBe("invalid_params");
      expect(classifyError("NOT_FOUND")).toBe("invalid_params");
    });

    it("should classify by error code pattern matching", () => {
      expect(classifyError("REQUEST_TIMEOUT")).toBe("timeout");
      expect(classifyError("RATE_LIMITED")).toBe("rate_limit");
      expect(classifyError("QUOTA_EXCEEDED")).toBe("quota");
      expect(classifyError("INVALID_INPUT")).toBe("invalid_params");
      expect(classifyError("INTERNAL_ERROR")).toBe("server_error");
      expect(classifyError("UNAUTHORIZED_ACCESS")).toBe("auth");
    });

    it("should classify by error message pattern - timeout", () => {
      expect(classifyError(undefined, "Request timeout")).toBe("timeout");
      expect(classifyError(undefined, "timed out after 30s")).toBe("timeout");
      expect(classifyError(undefined, "ETIMEDOUT")).toBe("timeout");
      expect(classifyError(undefined, "ECONNABORTED")).toBe("timeout");
      expect(classifyError(undefined, "连接超时")).toBe("timeout");
    });

    it("should classify by error message pattern - rate_limit", () => {
      expect(classifyError(undefined, "Rate limit exceeded")).toBe("rate_limit");
      expect(classifyError(undefined, "rate_limit exceeded")).toBe("rate_limit");
      expect(classifyError(undefined, "请求过于频繁")).toBe("rate_limit");
      expect(classifyError(undefined, "429 Too Many Requests")).toBe("rate_limit");
    });

    it("should classify by error message pattern - quota", () => {
      expect(classifyError(undefined, "Quota exceeded")).toBe("quota");
      expect(classifyError(undefined, "余额不足")).toBe("quota");
      expect(classifyError(undefined, "额度已用完")).toBe("quota");
      expect(classifyError(undefined, "配额超限")).toBe("quota");
      expect(classifyError(undefined, "insufficient balance")).toBe("quota");
      expect(classifyError(undefined, "402 Payment Required")).toBe("quota");
    });

    it("should classify by error message pattern - invalid_params", () => {
      expect(classifyError(undefined, "Invalid parameter")).toBe("invalid_params");
      expect(classifyError(undefined, "参数错误")).toBe("invalid_params");
      expect(classifyError(undefined, "Bad Request")).toBe("invalid_params");
      expect(classifyError(undefined, "400 Bad Request")).toBe("invalid_params");
    });

    it("should classify by error message pattern - network", () => {
      expect(classifyError(undefined, "ECONNREFUSED")).toBe("network");
      expect(classifyError(undefined, "ECONNRESET")).toBe("network");
      expect(classifyError(undefined, "ENOTFOUND")).toBe("network");
      expect(classifyError(undefined, "network error")).toBe("network");
      expect(classifyError(undefined, "Failed to fetch")).toBe("network");
      expect(classifyError(undefined, "NetworkError")).toBe("network");
      expect(classifyError(undefined, "网络错误")).toBe("network");
      expect(classifyError(undefined, "连接失败")).toBe("network");
    });

    it("should classify by error message pattern - server_error", () => {
      expect(classifyError(undefined, "internal error")).toBe("server_error");
      expect(classifyError(undefined, "internal_error")).toBe("server_error");
      expect(classifyError(undefined, "internal-error")).toBe("server_error");
      expect(classifyError(undefined, "服务器错误")).toBe("server_error");
      expect(classifyError(undefined, "Service Unavailable")).toBe("server_error");
      expect(classifyError(undefined, "service_unavailable")).toBe("server_error");
      expect(classifyError(undefined, "502 Bad Gateway")).toBe("server_error");
      expect(classifyError(undefined, "503 Service Unavailable")).toBe("server_error");
    });

    it("should classify by error message pattern - database_busy", () => {
      expect(classifyError(undefined, "database is busy")).toBe("database_busy");
      expect(classifyError(undefined, "database is locked")).toBe("database_busy");
    });

    it("should classify by error message pattern - auth", () => {
      expect(classifyError(undefined, "Unauthorized")).toBe("auth");
      expect(classifyError(undefined, "Forbidden")).toBe("auth");
      expect(classifyError(undefined, "401 Unauthorized")).toBe("auth");
      expect(classifyError(undefined, "403 Forbidden")).toBe("auth");
    });

    it("should prefer error code over error message", () => {
      expect(classifyError("TIMEOUT_ERROR", "network error")).toBe("timeout");
    });

    it("should fall back to message when code is not in map and no pattern matches code", () => {
      expect(classifyError("CUSTOM_CODE", "Request timeout")).toBe("timeout");
    });

    it("should return unknown when neither code nor message matches", () => {
      expect(classifyError("CUSTOM_CODE", "Something happened")).toBe("unknown");
    });

    it("should return unknown when both are undefined", () => {
      expect(classifyError(undefined, undefined)).toBe("unknown");
    });

    it("should return unknown when both are empty", () => {
      expect(classifyError("", "")).toBe("unknown");
    });

    it("should return unknown for code not in map with no pattern match and no message", () => {
      expect(classifyError("SOME_RANDOM_CODE")).toBe("unknown");
    });
  });
});
