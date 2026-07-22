import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    fatal: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

import {
  ApiError,
  safeParseJson,
  sanitizeErrorMessage,
  validateRequiredFields,
  isUrlAllowed,
  maskApiKey,
} from "../api-utils";

function makeRequest(body: string, method = "POST"): Request {
  return new Request("http://localhost/api/test", {
    method,
    body: body || undefined,
    headers: { "Content-Type": "application/json" },
  });
}

describe("infrastructure/server/api-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ApiError", () => {
    it("默认 status 为 400", () => {
      const error = new ApiError("bad request");
      expect(error.message).toBe("bad request");
      expect(error.status).toBe(400);
      expect(error.name).toBe("ApiError");
    });

    it("可自定义 status", () => {
      const error = new ApiError("not found", 404);
      expect(error.status).toBe(404);
    });

    it("是 Error 的子类", () => {
      const error = new ApiError("test");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
    });
  });

  describe("safeParseJson", () => {
    it("解析有效的 JSON 对象", async () => {
      const request = makeRequest(JSON.stringify({ foo: "bar", count: 42 }));

      const result = await safeParseJson(request);

      expect(result).toEqual({ foo: "bar", count: 42 });
    });

    it("空请求体抛出 ApiError", async () => {
      const request = makeRequest("");

      await expect(safeParseJson(request)).rejects.toThrow(ApiError);
      try {
        await safeParseJson(makeRequest(""));
      } catch (e) {
        expect((e as ApiError).status).toBe(400);
      }
    });

    it("空白字符请求体抛出 ApiError", async () => {
      const request = makeRequest("   ");

      await expect(safeParseJson(request)).rejects.toThrow(ApiError);
    });

    it("无效 JSON 抛出 ApiError", async () => {
      const request = makeRequest("{invalid json");

      await expect(safeParseJson(request)).rejects.toThrow(ApiError);
      try {
        await safeParseJson(makeRequest("{invalid"));
      } catch (e) {
        expect((e as ApiError).status).toBe(400);
      }
    });

    it("JSON 数组抛出 ApiError（必须是对象）", async () => {
      const request = makeRequest(JSON.stringify([1, 2, 3]));

      await expect(safeParseJson(request)).rejects.toThrow(ApiError);
    });

    it("JSON 原始值（字符串）抛出 ApiError", async () => {
      const request = makeRequest(JSON.stringify("hello"));

      await expect(safeParseJson(request)).rejects.toThrow(ApiError);
    });

    it("JSON null 抛出 ApiError", async () => {
      const request = makeRequest("null");

      await expect(safeParseJson(request)).rejects.toThrow(ApiError);
    });

    it("嵌套对象正确解析", async () => {
      const request = makeRequest(JSON.stringify({ data: { nested: { value: 1 } } }));

      const result = await safeParseJson(request);

      expect(result).toEqual({ data: { nested: { value: 1 } } });
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("ApiError 实例直接返回 message", () => {
      const error = new ApiError("custom api error", 422);
      expect(sanitizeErrorMessage(error)).toBe("custom api error");
    });

    it("脱敏 Windows 文件路径", () => {
      const error = new Error("Failed to read C:\\Users\\admin\\secrets\\key.txt");
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("C:\\Users\\admin");
      expect(sanitized).toContain("[路径]");
    });

    it("脱敏 Unix 文件路径", () => {
      const error = new Error("Failed to read /etc/passwd file");
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("/etc/passwd");
      expect(sanitized).toContain("[路径]");
    });

    it("脱敏 sk- 开头的 API key", () => {
      const error = new Error("Auth failed with key sk-abcdefghijklmnopqrstuvwxyz");
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
      expect(sanitized).toContain("[API_KEY]");
    });

    it("脱敏 key=value 形式的 API key", () => {
      const error = new Error("Config: api_key=abcdefgh12345678 invalid");
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toContain("[API_KEY]");
    });

    it("脱敏 Bearer token", () => {
      const error = new Error("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test");
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiJ9");
      expect(sanitized).toContain("Bearer [TOKEN]");
    });

    it("脱敏堆栈跟踪信息", () => {
      const error = new Error("Something failed at doWork (file.js:10:5) at run (app.js:1:1)");
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("doWork");
      expect(sanitized).toContain("[stack]");
    });

    it("非 Error 非 ApiError 值返回 '内部错误'", () => {
      expect(sanitizeErrorMessage("a string")).toBe("内部错误");
      expect(sanitizeErrorMessage(42)).toBe("内部错误");
      expect(sanitizeErrorMessage(null)).toBe("内部错误");
      expect(sanitizeErrorMessage(undefined)).toBe("内部错误");
      expect(sanitizeErrorMessage({ foo: "bar" })).toBe("内部错误");
    });
  });

  describe("validateRequiredFields", () => {
    it("所有字段都存在时返回 null", () => {
      const result = validateRequiredFields(
        { name: "test", age: 18, email: "a@b.com" },
        ["name", "age", "email"],
      );
      expect(result).toBeNull();
    });

    it("缺少字段时返回错误消息", () => {
      const result = validateRequiredFields(
        { name: "test" },
        ["name", "age", "email"],
      );
      expect(result).not.toBeNull();
      expect(result).toContain("age");
    });

    it("字段值为 undefined 时视为缺失", () => {
      const result = validateRequiredFields(
        { name: "test", age: undefined },
        ["name", "age"],
      );
      expect(result).not.toBeNull();
      expect(result).toContain("age");
    });

    it("字段值为 null 时视为缺失", () => {
      const result = validateRequiredFields(
        { name: "test", age: null },
        ["name", "age"],
      );
      expect(result).not.toBeNull();
      expect(result).toContain("age");
    });

    it("字段值为空字符串时不算缺失", () => {
      const result = validateRequiredFields(
        { name: "", age: 0 },
        ["name", "age"],
      );
      expect(result).toBeNull();
    });

    it("字段值为 0 或 false 时不算缺失", () => {
      const result = validateRequiredFields(
        { count: 0, active: false },
        ["count", "active"],
      );
      expect(result).toBeNull();
    });

    it("空 fields 数组总是返回 null", () => {
      expect(validateRequiredFields({}, [])).toBeNull();
    });

    it("返回第一个缺失字段而非全部", () => {
      const result = validateRequiredFields(
        { name: "test" },
        ["name", "age", "email"],
      );
      // 应返回第一个缺失的字段
      expect(result).toContain("age");
      expect(result).not.toContain("email");
    });
  });

  describe("isUrlAllowed", () => {
    it("普通 URL 返回 true", () => {
      expect(isUrlAllowed("http://localhost:3000/api")).toBe(true);
      expect(isUrlAllowed("https://api.openai.com/v1/chat")).toBe(true);
      expect(isUrlAllowed("https://example.com")).toBe(true);
    });

    it("AWS 元数据端点 169.254.169.254 返回 false", () => {
      expect(isUrlAllowed("http://169.254.169.254/latest/meta-data/")).toBe(false);
    });

    it("GCP 元数据端点 metadata.google.internal 返回 false", () => {
      expect(isUrlAllowed("http://metadata.google.internal/computeMetadata/")).toBe(false);
    });

    it("无效 URL 返回 false", () => {
      expect(isUrlAllowed("not-a-url")).toBe(false);
      expect(isUrlAllowed("")).toBe(false);
      expect(isUrlAllowed("://missing-protocol")).toBe(false);
    });
  });

  describe("maskApiKey", () => {
    it("空字符串返回空字符串", () => {
      expect(maskApiKey("")).toBe("");
    });

    it("短于 8 字符的 key 返回空字符串", () => {
      expect(maskApiKey("short")).toBe("");
      expect(maskApiKey("1234567")).toBe("");
    });

    it("正好 8 字符的 key 正常脱敏", () => {
      const result = maskApiKey("12345678");
      expect(result).toBe("1234****5678");
    });

    it("长 key 保留前 4 和后 4 字符", () => {
      const result = maskApiKey("sk-abcdefghij1234567890");
      expect(result).toBe("sk-a****7890");
      expect(result).toContain("****");
    });

    it("null 或 undefined 返回空字符串", () => {
      expect(maskApiKey(null as unknown as string)).toBe("");
      expect(maskApiKey(undefined as unknown as string)).toBe("");
    });
  });
});
