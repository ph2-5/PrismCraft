import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTestDatabase, closeTestDatabase } from "../mocks/in-memory-db";
import { setupElectronApiMock, getElectronApiMock } from "../mocks/electron-api";
import { setupApiCallMock, clearMockAIResponses } from "../mocks/ai-call-mock";

const mockApiCall = setupApiCallMock();

vi.mock("@/infrastructure/ai-providers/core", () => ({
  apiCall: (...args: unknown[]) => mockApiCall(args[0] as string, args[1] as { method?: string; body?: string }),
  apiCallWithRetry: (...args: unknown[]) => mockApiCall(args[0] as string, args[1] as { method?: string; body?: string }),
  ApiClientError: class ApiClientError extends Error {
    statusCode?: number;
    code?: string;
    constructor(message: string, statusCode?: number, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  isQueuedResponse: () => false,
  getErrorMessage: (e: unknown) => e instanceof Error ? e.message : String(e),
  checkApiHealth: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/infrastructure/ai-providers/config", async () => {
  const actual = await vi.importActual("@/infrastructure/ai-providers/config");
  return {
    ...actual,
    resolveCapability: vi.fn().mockResolvedValue({
      provider: { id: "volcengine", name: "火山引擎", apiKey: "sk-test", baseUrl: "https://api.volcengine.com", format: "openai" },
      model: { id: "seedance-1.5", name: "Seedance 1.5", capabilities: ["video"] },
    }),
  };
});

vi.mock("@/infrastructure/ai-providers/offline-queue", () => ({
  enqueueRequest: vi.fn().mockResolvedValue(null),
  getQueueStats: vi.fn().mockReturnValue({ pending: 0, generating: 0, completed: 0, failed: 0 }),
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: () => true,
}));

beforeEach(() => {
  const db = getTestDatabase();
  const mock = setupElectronApiMock();

  mock.dbQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    try {
      const data = db.query(sql, params);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  mock.dbRun.mockImplementation(async (sql: string, params: unknown[] = []) => {
    try {
      const result = db.run(sql, params);
      return { success: true, data: result, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  mock.dbTransaction.mockImplementation(async (statements: { sql: string; params: unknown[] }[]) => {
    try {
      const data = db.transaction(statements);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  mockApiCall.mockClear();
  clearMockAIResponses();
});

afterEach(() => {
  closeTestDatabase();
});

describe("E2E Electron IPC 集成", () => {
  describe("数据库 IPC 通道", () => {
    it("dbQuery 应通过 IPC 正确返回数据", async () => {
      const { safeQuery } = await import("@/infrastructure/storage/sqlite-core");
      const db = getTestDatabase();

      db.run("INSERT INTO stories (id, title, created_at) VALUES (?, ?, strftime('%s','now'))", ["ipc-s1", "IPC测试故事"]);

      const results = await safeQuery<Record<string, unknown>>("SELECT * FROM stories WHERE id = ?", ["ipc-s1"]);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("IPC测试故事");
    });

    it("dbRun 应通过 IPC 正确执行写入", async () => {
      const { safeRun } = await import("@/infrastructure/storage/sqlite-core");

      const result = await safeRun(
        "INSERT INTO stories (id, title, created_at) VALUES (?, ?, strftime('%s','now'))",
        ["ipc-s2", "IPC写入测试"],
      );
      expect(result.changes).toBe(1);
    });

    it("dbTransaction 应通过 IPC 原子执行多条语句", async () => {
      const { safeTransaction } = await import("@/infrastructure/storage/sqlite-core");

      const results = await safeTransaction([
        { sql: "INSERT INTO stories (id, title, created_at) VALUES (?, ?, strftime('%s','now'))", params: ["ipc-txn-1", "事务故事1"] },
        { sql: "INSERT INTO stories (id, title, created_at) VALUES (?, ?, strftime('%s','now'))", params: ["ipc-txn-2", "事务故事2"] },
      ]);

      expect(results).toHaveLength(2);
    });

    it("dbTransaction 失败应正确传播错误", async () => {
      const { safeTransaction } = await import("@/infrastructure/storage/sqlite-core");

      await expect(
        safeTransaction([
          { sql: "INSERT INTO nonexistent_table (id) VALUES (?)", params: ["fail"] },
        ]),
      ).rejects.toThrow();
    });
  });

  describe("IPC 错误恢复", () => {
    it("数据库锁定应触发重试", async () => {
      const mock = getElectronApiMock();
      let callCount = 0;

      const originalDbRun = mock.dbRun;
      mock.dbRun.mockImplementation(async (sql: string, params: unknown[] = []) => {
        callCount++;
        if (callCount <= 2 && sql.includes("INSERT")) {
          return { success: false, error: "database is locked" };
        }
        const db = await getTestDatabase();
        try {
          const result = db.run(sql, params);
          return { success: true, data: result, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      });

      const { safeRun } = await import("@/infrastructure/storage/sqlite-core");
      const result = await safeRun(
        "INSERT INTO stories (id, title, created_at) VALUES (?, ?, strftime('%s','now'))",
        ["retry-s1", "重试测试"],
      );
      expect(result.changes).toBe(1);

      mock.dbRun = originalDbRun;
    });
  });

  describe("Electron API 可用性", () => {
    it("window.electronAPI 应包含所有必要方法", () => {
      const mock = getElectronApiMock();
      const requiredMethods = [
        "dbQuery", "dbRun", "dbTransaction",
        "saveImage", "readFile", "writeFile",
        "openExternal", "getCacheDirectory",
      ];

      for (const method of requiredMethods) {
        expect(typeof (mock as Record<string, unknown>)[method]).toBe("function");
      }
    });

    it("platform 信息应可用", () => {
      const mock = getElectronApiMock();
      expect(mock.platform).toBeTruthy();
      expect(mock.versions).toBeDefined();
    });
  });
});

describe("E2E 安全与边界", () => {
  describe("API 密钥安全", () => {
    it("config API 返回的密钥应已脱敏", async () => {
      const body = await mockApiCall("config") as { data?: { providers?: Array<{ id?: string; apiKey?: string }> } };

      if (body.data?.providers) {
        for (const provider of body.data.providers) {
          if (provider.apiKey) {
            expect(
              provider.apiKey.includes("***") || provider.apiKey.length < 10,
              `Provider ${provider.id} 的 apiKey 未脱敏`,
            ).toBe(true);
          }
        }
      }
    });

    it("buildTrackingInfo 不应暴露完整密钥", async () => {
      const { buildTrackingInfo } = await import("@/modules/video/task-management/services/video-tracker");

      const info = buildTrackingInfo("sec-1", "https://api.example.com", undefined, "model-v1");
      expect(info).not.toHaveProperty("apiKeyPreview");
      expect(info).not.toHaveProperty("apiKey");
    });
  });

  describe("输入验证", () => {
    it("空 prompt 应被拒绝", async () => {
      try {
        await mockApiCall("generate-video", { method: "POST", body: JSON.stringify({}) });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect((e as Error & { statusCode?: number }).statusCode).toBe(400);
      }
    });

    it("空 taskId 应被拒绝", async () => {
      try {
        await mockApiCall("video-status", { method: "POST", body: JSON.stringify({}) });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect((e as Error & { statusCode?: number }).statusCode).toBe(400);
      }
    });
  });

  describe("SQL 注入防护", () => {
    it("参数化查询应防止 SQL 注入", async () => {
      const { safeQuery } = await import("@/infrastructure/storage/sqlite-core");
      const db = getTestDatabase();

      db.run("INSERT INTO stories (id, title, created_at) VALUES (?, ?, strftime('%s','now'))", ["sqli-1", "正常故事"]);

      const maliciousId = "sqli-1' OR '1'='1";
      const results = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM stories WHERE id = ?",
        [maliciousId],
      );

      expect(results.length).toBe(0);
    });
  });

  describe("Zod Schema 验证", () => {
    it("videoTaskStatusSchema 应只接受合法状态", async () => {
      const { videoTaskStatusSchema } = await import("@/domain/schemas/api");

      const validStatuses = ["pending", "generating", "completed", "failed", "cancelled", "retrying"];
      for (const status of validStatuses) {
        const result = videoTaskStatusSchema.safeParse(status);
        expect(result.success, `状态 '${status}' 应通过验证`).toBe(true);
      }

      const invalidStatuses = ["processing", "running", "unknown", ""];
      for (const status of invalidStatuses) {
        const result = videoTaskStatusSchema.safeParse(status);
        expect(result.success, `状态 '${status}' 应被拒绝`).toBe(false);
      }
    });

    it("characterSchema 应验证必填字段", async () => {
      const { characterSchema } = await import("@/domain/schemas/character");

      const validCharacter = {
        id: "schema-test-1",
        name: "测试角色",
        description: "描述",
        gender: "female",
        style: "写实",
        personality: [],
        appearance: { hairColor: "黑色" },
        prompt: "提示词",
      };
      const validResult = characterSchema.safeParse(validCharacter);
      expect(validResult.success).toBe(true);

      const invalidCharacter = {
        id: "schema-test-2",
        name: "",
      };
      const invalidResult = characterSchema.safeParse(invalidCharacter);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("Result 类型正确传播", () => {
    it("TaskMachine.transition 失败应返回 err Result", async () => {
      const { TaskMachine } = await import("@/modules/video/task-management/domain/task-machine");

      const task = {
        taskId: "result-test",
        status: "completed" as const,
        progress: 100,
        message: "",
        createdAt: new Date().toISOString(),
      };

      const result = TaskMachine.transition(task, "generating");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    });

    it("fromAsyncThrowable 应捕获异常并返回 err", async () => {
      const { fromAsyncThrowable } = await import("@/domain/types/result");

      const result = await fromAsyncThrowable(async () => {
        throw new Error("测试异常");
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("测试异常");
      }
    });
  });
});
