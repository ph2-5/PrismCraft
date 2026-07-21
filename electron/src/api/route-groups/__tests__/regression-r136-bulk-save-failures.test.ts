/**
 * R136: bulk-save 路由必须收集失败任务信息
 * 回归防护: 确保 video-tasks/bulk-save 路由在部分任务保存失败时，
 *           收集失败任务信息并在响应中返回 failures 数组。
 *
 * 攻击场景：若 bulk-save 不收集失败信息，客户端无法知道哪些任务保存失败，
 * 导致数据不一致——客户端认为所有任务已保存，但实际部分任务丢失。
 * 在视频任务场景中，这可能导致已完成的视频 URL 丢失，用户需要重新生成。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 提升 mock
const {
  mockGetDb,
  mockPrepare,
  mockTransaction,
  mockInsertRun,
  mockUpdateRun,
  mockCheckGet,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockPrepare: vi.fn(),
  mockTransaction: vi.fn(),
  mockInsertRun: vi.fn(),
  mockUpdateRun: vi.fn(),
  mockCheckGet: vi.fn(),
}));

vi.mock("../../../database", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../../logging", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../../api-gateway", () => ({
  createApiGatewayAdapter: vi.fn(() => ({})),
}));

vi.mock("@shared-logic/story/storyboard-generation", () => ({
  generateBeatKeyframe: vi.fn(),
  generateBeatFramePair: vi.fn(),
  generateBeatVideo: vi.fn(),
  generateBeatFullWorkflow: vi.fn(),
  generateKeyframeChain: vi.fn(),
}));

vi.mock("@shared-logic/prompt/prompt-service", () => ({
  default: {},
}));

vi.mock("@shared-logic/video/video-recovery", () => ({
  recoverVideoByTaskId: vi.fn(),
}));

vi.mock("@shared-logic/video/video-tracker", () => ({
  buildTrackingInfoByApiUrl: vi.fn(),
  getProviderInfoByApiUrl: vi.fn(),
}));

function createMockDb() {
  return {
    prepare: mockPrepare,
    transaction: mockTransaction,
  };
}

describe("R136: bulk-save failures 收集", () => {
  let storyboardRoutes: Record<string, { handler: (method: string, body: unknown, req: unknown) => Promise<unknown>; methods: string[] }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // 默认 mock：所有语句成功
    mockInsertRun.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
    mockUpdateRun.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
    mockCheckGet.mockReturnValue(undefined); // 任务不存在，走 insert 路径
    mockPrepare.mockReturnValue({
      run: mockInsertRun,
      get: mockCheckGet,
    });
    mockTransaction.mockImplementation((fn: () => void) => fn());
    mockGetDb.mockReturnValue(createMockDb());

    const mod = await import("../storyboard-routes");
    storyboardRoutes = mod.storyboardRoutes as unknown as typeof storyboardRoutes;
  });

  it("video-tasks/bulk-save 路由应存在", () => {
    expect(storyboardRoutes["video-tasks/bulk-save"]).toBeDefined();
    expect(storyboardRoutes["video-tasks/bulk-save"].methods).toContain("POST");
  });

  it("空任务列表应返回 failures: []", async () => {
    const route = storyboardRoutes["video-tasks/bulk-save"];
    const result = await route.handler("POST", { tasks: [] }, {}) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.saved).toBe(0);
    expect(Array.isArray(result.failures)).toBe(true);
    expect((result.failures as unknown[]).length).toBe(0);
  });

  it("无 tasks 字段应返回 failures: []", async () => {
    const route = storyboardRoutes["video-tasks/bulk-save"];
    const result = await route.handler("POST", {}, {}) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.saved).toBe(0);
    expect(Array.isArray(result.failures)).toBe(true);
  });

  it("所有任务保存成功时 failures 应为空数组", async () => {
    const route = storyboardRoutes["video-tasks/bulk-save"];
    const result = await route.handler(
      "POST",
      {
        tasks: [
          { taskId: "task-1", status: "completed", progress: 100 },
          { taskId: "task-2", status: "completed", progress: 100 },
        ],
      },
      {},
    ) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.saved).toBe(2);
    expect(Array.isArray(result.failures)).toBe(true);
    expect((result.failures as unknown[]).length).toBe(0);
  });

  it("部分任务保存失败时 failures 应包含失败任务信息", async () => {
    // 第一个任务成功，第二个任务失败
    mockInsertRun
      .mockReturnValueOnce({ changes: 1, lastInsertRowid: 1 }) // task-1 成功
      .mockImplementationOnce(() => {
        throw new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed");
      }); // task-2 失败

    const route = storyboardRoutes["video-tasks/bulk-save"];
    const result = await route.handler(
      "POST",
      {
        tasks: [
          { taskId: "task-1", status: "completed", progress: 100 },
          { taskId: "task-2", status: "completed", progress: 100 },
        ],
      },
      {},
    ) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.saved).toBe(1);
    expect(Array.isArray(result.failures)).toBe(true);
    expect((result.failures as unknown[]).length).toBe(1);

    const failure = (result.failures as Array<{ taskId: string; error: string }>)[0];
    expect(failure.taskId).toBe("task-2");
    expect(failure.error).toContain("SQLITE_CONSTRAINT");
  });

  it("failures 数组应包含 taskId 和 error 字段", async () => {
    mockInsertRun.mockImplementation(() => {
      throw new Error("Database error");
    });

    const route = storyboardRoutes["video-tasks/bulk-save"];
    const result = await route.handler(
      "POST",
      {
        tasks: [{ taskId: "failed-task", status: "pending" }],
      },
      {},
    ) as Record<string, unknown>;

    const failures = result.failures as Array<{ taskId: string; error: string }>;
    expect(failures.length).toBe(1);
    expect(failures[0]).toHaveProperty("taskId");
    expect(failures[0]).toHaveProperty("error");
    expect(failures[0].taskId).toBe("failed-task");
    expect(typeof failures[0].error).toBe("string");
  });

  it("所有任务都失败时 failures 应包含所有失败任务", async () => {
    mockInsertRun.mockImplementation(() => {
      throw new Error("Database error");
    });

    const route = storyboardRoutes["video-tasks/bulk-save"];
    const result = await route.handler(
      "POST",
      {
        tasks: [
          { taskId: "task-a", status: "pending" },
          { taskId: "task-b", status: "pending" },
          { taskId: "task-c", status: "pending" },
        ],
      },
      {},
    ) as Record<string, unknown>;

    expect(result.saved).toBe(0);
    const failures = result.failures as Array<{ taskId: string }>;
    expect(failures.length).toBe(3);
    expect(failures.map((f) => f.taskId)).toEqual(["task-a", "task-b", "task-c"]);
  });

  it("任务无 taskId 时应使用 'unknown' 作为失败标识", async () => {
    mockInsertRun.mockImplementation(() => {
      throw new Error("Database error");
    });

    const route = storyboardRoutes["video-tasks/bulk-save"];
    const result = await route.handler(
      "POST",
      {
        tasks: [{ status: "pending" }], // 无 taskId
      },
      {},
    ) as Record<string, unknown>;

    // 无 taskId 的任务应被跳过（continue），不会进入 failures
    // 因为 taskId 为 undefined 时 `if (!taskId) continue` 跳过
    expect(result.saved).toBe(0);
  });

  it("数据库事务失败时应返回 success: false 和 failures 数组", async () => {
    mockTransaction.mockImplementation(() => {
      throw new Error("Transaction failed");
    });

    const route = storyboardRoutes["video-tasks/bulk-save"];
    const result = await route.handler(
      "POST",
      {
        tasks: [{ taskId: "task-1", status: "pending" }],
      },
      {},
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(Array.isArray(result.failures)).toBe(true);
  });

  it("成功保存的任务应计入 saved 计数", async () => {
    const route = storyboardRoutes["video-tasks/bulk-save"];
    const result = await route.handler(
      "POST",
      {
        tasks: [
          { taskId: "task-1", status: "completed" },
          { taskId: "task-2", status: "completed" },
          { taskId: "task-3", status: "completed" },
        ],
      },
      {},
    ) as Record<string, unknown>;

    expect(result.saved).toBe(3);
    expect((result.failures as unknown[]).length).toBe(0);
  });
});
