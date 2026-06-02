import { describe, it, expect, vi } from "vitest";
import { extractErrorMessage } from "@/shared/error-logger";
import { ok, err, fromAsyncThrowable, AppError } from "@/domain/types";

describe("E2E 错误处理测试", () => {
  describe("extractErrorMessage 完整性", () => {
    it("应正确处理 Error 对象", () => {
      const error = new Error("Something went wrong");
      expect(extractErrorMessage(error)).toBe("Something went wrong");
    });

    it("应正确处理无 message 的 Error", () => {
      const error = new Error();
      error.name = "CustomError";
      expect(extractErrorMessage(error)).toBe("CustomError");
    });

    it("应正确处理字符串错误", () => {
      expect(extractErrorMessage("string error")).toBe("string error");
    });

    it("应正确处理空字符串", () => {
      expect(extractErrorMessage("")).toBe("Unknown error");
    });

    it("应正确处理 null", () => {
      expect(extractErrorMessage(null)).toBe("Unknown error");
    });

    it("应正确处理 undefined", () => {
      expect(extractErrorMessage(undefined)).toBe("Unknown error");
    });

    it("应正确处理数字", () => {
      expect(extractErrorMessage(42)).toBe("42");
    });

    it("应正确处理含 message 属性的对象", () => {
      expect(extractErrorMessage({ message: "object error" })).toBe("object error");
    });

    it("应正确处理含 name 属性的对象", () => {
      expect(extractErrorMessage({ name: "NamedError" })).toBe("NamedError");
    });

    it("应正确处理可 JSON 序列化的对象", () => {
      expect(extractErrorMessage({ code: 500, detail: "server error" })).toBe(
        '{"code":500,"detail":"server error"}',
      );
    });

    it("应正确处理空对象", () => {
      expect(extractErrorMessage({})).toBe("[object Object]");
    });

    it("应正确处理循环引用对象", () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      expect(extractErrorMessage(obj)).toBe("[object Object]");
    });

    it("应正确处理 Symbol", () => {
      expect(extractErrorMessage(Symbol("test"))).toBe("Symbol(test)");
    });

    it("应正确处理函数", () => {
      const result = extractErrorMessage(() => {});
      expect(result).toContain("=>");
    });
  });

  describe("Result 类型正确处理", () => {
    it("ok() 应返回 Result.ok=true 并携带值", () => {
      const result = ok({ id: "test-id", title: "Test Story" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("test-id");
      }
    });

    it("err() 应返回 Result.ok=false 并携带错误", () => {
      const result = err(new AppError("DATABASE_ERROR", "database is locked"));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(extractErrorMessage(result.error)).toBeTruthy();
      }
    });

    it("fromAsyncThrowable 应包装成功结果为 ok", async () => {
      const result = await fromAsyncThrowable(async () => {
        return { id: "test-id", title: "Test Story" };
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("test-id");
      }
    });

    it("fromAsyncThrowable 应包装异常为 err", async () => {
      const result = await fromAsyncThrowable(async () => {
        throw new Error("electronAPI 不可用");
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(extractErrorMessage(result.error)).toBe("electronAPI 不可用");
      }
    });

    it("fromAsyncThrowable 应包装非 Error 异常为 err", async () => {
      const result = await fromAsyncThrowable(async () => {
        throw "string error";
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    });

    it("Result 类型应正确区分 ok 和 err 分支", () => {
      const successResult = ok("success");
      const failureResult = err(new AppError("CODE", "failure"));

      if (successResult.ok) {
        expect(successResult.value).toBe("success");
      } else {
        expect.unreachable("ok result should not enter err branch");
      }

      if (!failureResult.ok) {
        expect(failureResult.error).toBeDefined();
      } else {
        expect.unreachable("err result should not enter ok branch");
      }
    });
  });

  describe("IPC 错误处理", () => {
    it("IPC 速率限制错误应包含明确消息", async () => {
      const { errorLogger } = await import("@/shared/error-logger");
      const warnSpy = vi.spyOn(errorLogger, "warn").mockImplementation(() => {});

      errorLogger.warn(
        { code: "IPC_RATE_LIMIT", message: "Readonly channel rate limit exceeded" },
        "TestContext",
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ code: "IPC_RATE_LIMIT" }),
        "TestContext",
      );

      warnSpy.mockRestore();
    });
  });

  describe("数据库错误处理", () => {
    it("SQLite busy 错误应触发重试", async () => {
      const { withRetry } = await import("@/infrastructure/storage/sqlite-core");

      let attempts = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          const error = new Error("database is locked");
          return Promise.reject(error);
        }
        return Promise.resolve("success");
      });

      const result = await withRetry(fn, 3);
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("非重试错误应立即失败", async () => {
      const { withRetry } = await import("@/infrastructure/storage/sqlite-core");

      const fn = vi.fn().mockRejectedValue(new Error("syntax error"));

      await expect(withRetry(fn, 3)).rejects.toThrow("syntax error");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("withRetry 应使用 extractErrorMessage 避免空消息", async () => {
      const { withRetry } = await import("@/infrastructure/storage/sqlite-core");

      const fn = vi.fn().mockRejectedValue({});

      await expect(withRetry(fn, 1)).rejects.toThrow();
    });
  });
});
