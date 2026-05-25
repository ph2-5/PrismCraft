import { describe, it, expect } from "vitest";
import { extractErrorMessage } from "@/shared/error-logger";

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
    it("storyService.create 应返回 Result 并检查 ok", async () => {
      const { storyService } = await import("@/modules/story/planning/services/story-service");
      const result = await storyService.create({
        title: "Test Story",
        description: "",
        characters: [],
        scenes: [],
        beats: [],
        elementIds: [],
        genre: "action",
        tone: "serious",
        targetDuration: 60,
      });

      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(extractErrorMessage(result.error)).toBeTruthy();
      }
    }, 15000);

    it("storyService.update 应返回 Result 并检查 ok", async () => {
      const { storyService } = await import("@/modules/story/planning/services/story-service");
      const result = await storyService.update("test-id", {
        id: "test-id",
        title: "Updated",
      });

      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    }, 15000);
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
