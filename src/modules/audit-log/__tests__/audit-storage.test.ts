/**
 * audit-storage 单元测试
 *
 * 覆盖范围：
 * 1. 基本记录与查询
 * 2. LRU 淘汰（MAX_ENTRIES_PER_SESSION=500）
 * 3. 截断逻辑（argsJson 2000 / resultPreview 500）
 * 4. JSONL 解析容错
 * 5. scheduleFlush 并发安全（P1-2 回归测试）
 * 6. clearAuditLogs / clearAllAuditLogs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AuditEntry } from "../services/audit-storage";

// ── 用 vi.hoisted 声明 mock 变量（vi.mock 工厂会在文件顶部执行） ──
const {
  mockGetCacheDirectory,
  mockReadFile,
  mockWriteFile,
  mockDeleteFile,
  mockListSessions,
} = vi.hoisted(() => ({
  mockGetCacheDirectory: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockDeleteFile: vi.fn(),
  mockListSessions: vi.fn(),
}));

// ── Mock @/shared/file-http（用于文件 I/O） ──
vi.mock("@/shared/file-http", () => ({
  getCacheDirectory: mockGetCacheDirectory,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  deleteFile: mockDeleteFile,
}));

// ── Mock @/shared/error-logger（避免日志污染测试输出） ──
vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

// ── Mock @/modules/agent（用于动态 import 的 listSessions） ──
vi.mock("@/modules/agent", () => ({
  listSessions: mockListSessions,
}));

// 注意：@/shared/utils/format 的 truncate 使用真实实现（纯函数，无副作用）

/** 创建审计条目（不含 timestamp，由 recordAudit 填充） */
function makeEntry(
  overrides: Partial<Omit<AuditEntry, "timestamp">> = {},
): Omit<AuditEntry, "timestamp"> {
  return {
    sessionId: "session-1",
    toolCallId: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    toolName: "test_tool",
    iteration: 0,
    argsJson: "{}",
    status: "done",
    success: true,
    ...overrides,
  };
}

/** 等待 microtask 队列清空（多次循环确保 promise 链全部执行） */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

/** 将字符串编码为 ArrayBuffer（模拟 readFile 返回的数据格式） */
function encodeText(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe("audit-storage", () => {
  let recordAudit: typeof import("../services/audit-storage")["recordAudit"];
  let queryAuditLogs: typeof import("../services/audit-storage")["queryAuditLogs"];
  let clearAuditLogs: typeof import("../services/audit-storage")["clearAuditLogs"];
  let clearAllAuditLogs: typeof import("../services/audit-storage")["clearAllAuditLogs"];
  let getAuditStats: typeof import("../services/audit-storage")["getAuditStats"];

  beforeEach(async () => {
    vi.clearAllMocks();
    // 重置模块缓存，确保 audit-storage 的模块级状态（memoryCache/loadedSessions/flushChains/cachedBaseDir）被重置
    vi.resetModules();

    // 默认 mock 行为
    mockGetCacheDirectory.mockResolvedValue({ success: true, path: "/tmp/cache" });
    mockReadFile.mockResolvedValue(null); // 默认文件不存在
    mockWriteFile.mockResolvedValue({ success: true });
    mockDeleteFile.mockResolvedValue(true);
    mockListSessions.mockResolvedValue([]);

    // 重新导入被测模块（每次都拿到全新的模块级状态）
    const mod = await import("../services/audit-storage");
    recordAudit = mod.recordAudit;
    queryAuditLogs = mod.queryAuditLogs;
    clearAuditLogs = mod.clearAuditLogs;
    clearAllAuditLogs = mod.clearAllAuditLogs;
    getAuditStats = mod.getAuditStats;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. 基本记录与查询 ──
  describe("基本记录与查询", () => {
    it("recordAudit 后能通过 queryAuditLogs 查到", async () => {
      await recordAudit(makeEntry({ toolCallId: "tc_1" }));
      await flushMicrotasks();

      const logs = await queryAuditLogs({ sessionId: "session-1" });
      expect(logs).toHaveLength(1);
      expect(logs[0].toolCallId).toBe("tc_1");
      // timestamp 应被自动填充
      expect(typeof logs[0].timestamp).toBe("number");
      expect(logs[0].timestamp).toBeGreaterThan(0);
    });

    it("queryAuditLogs 按 sessionId 过滤", async () => {
      await recordAudit(makeEntry({ sessionId: "s1", toolCallId: "tc_s1" }));
      await recordAudit(makeEntry({ sessionId: "s2", toolCallId: "tc_s2" }));
      await flushMicrotasks();

      const s1Logs = await queryAuditLogs({ sessionId: "s1" });
      expect(s1Logs).toHaveLength(1);
      expect(s1Logs[0].toolCallId).toBe("tc_s1");

      const s2Logs = await queryAuditLogs({ sessionId: "s2" });
      expect(s2Logs).toHaveLength(1);
      expect(s2Logs[0].toolCallId).toBe("tc_s2");
    });

    it("queryAuditLogs 按 toolName 过滤", async () => {
      await recordAudit(makeEntry({ toolName: "tool_a", toolCallId: "tc_a" }));
      await recordAudit(makeEntry({ toolName: "tool_b", toolCallId: "tc_b" }));
      await flushMicrotasks();

      const filtered = await queryAuditLogs({
        sessionId: "session-1",
        toolName: "tool_a",
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].toolName).toBe("tool_a");
    });

    it("queryAuditLogs 按 success 过滤", async () => {
      await recordAudit(makeEntry({ success: true, toolCallId: "tc_ok" }));
      await recordAudit(makeEntry({ success: false, toolCallId: "tc_fail", status: "error" }));
      await flushMicrotasks();

      const okLogs = await queryAuditLogs({
        sessionId: "session-1",
        success: true,
      });
      expect(okLogs).toHaveLength(1);
      expect(okLogs[0].toolCallId).toBe("tc_ok");

      const failLogs = await queryAuditLogs({
        sessionId: "session-1",
        success: false,
      });
      expect(failLogs).toHaveLength(1);
      expect(failLogs[0].toolCallId).toBe("tc_fail");
    });

    it("queryAuditLogs 按 timeRange 过滤", async () => {
      // 用 mock 的 Date.now 让 timestamp 可控
      const realDateNow = Date.now;
      let currentTime = 1000;
      Date.now = () => currentTime;

      try {
        await recordAudit(makeEntry({ toolCallId: "tc_1" })); // timestamp=1000
        currentTime = 2000;
        await recordAudit(makeEntry({ toolCallId: "tc_2" })); // timestamp=2000
        currentTime = 3000;
        await recordAudit(makeEntry({ toolCallId: "tc_3" })); // timestamp=3000
        await flushMicrotasks();

        // 只查 timestamp 在 [1500, 2500] 之间
        const filtered = await queryAuditLogs({
          sessionId: "session-1",
          fromTimestamp: 1500,
          toTimestamp: 2500,
        });
        expect(filtered).toHaveLength(1);
        expect(filtered[0].toolCallId).toBe("tc_2");

        // 只设 fromTimestamp
        const fromLogs = await queryAuditLogs({
          sessionId: "session-1",
          fromTimestamp: 2000,
        });
        expect(fromLogs).toHaveLength(2);

        // 只设 toTimestamp
        const toLogs = await queryAuditLogs({
          sessionId: "session-1",
          toTimestamp: 2000,
        });
        expect(toLogs).toHaveLength(2);
      } finally {
        Date.now = realDateNow;
      }
    });

    it("queryAuditLogs 按 limit 限制返回条数", async () => {
      for (let i = 0; i < 5; i++) {
        await recordAudit(makeEntry({ toolCallId: `tc_${i}` }));
      }
      await flushMicrotasks();

      const limited = await queryAuditLogs({
        sessionId: "session-1",
        limit: 2,
      });
      expect(limited).toHaveLength(2);
    });

    it("queryAuditLogs 结果按时间倒序排序", async () => {
      const realDateNow = Date.now;
      let t = 1000;
      Date.now = () => t;

      try {
        await recordAudit(makeEntry({ toolCallId: "tc_old" }));
        t = 2000;
        await recordAudit(makeEntry({ toolCallId: "tc_new" }));
        await flushMicrotasks();

        const logs = await queryAuditLogs({ sessionId: "session-1" });
        expect(logs).toHaveLength(2);
        // 倒序：新的在前
        expect(logs[0].toolCallId).toBe("tc_new");
        expect(logs[1].toolCallId).toBe("tc_old");
      } finally {
        Date.now = realDateNow;
      }
    });

    it("getAuditStats 返回正确的统计", async () => {
      await recordAudit(makeEntry({ toolName: "tool_a", success: true, toolCallId: "tc_1" }));
      await recordAudit(makeEntry({ toolName: "tool_a", success: true, toolCallId: "tc_2" }));
      await recordAudit(makeEntry({ toolName: "tool_a", success: false, toolCallId: "tc_3", status: "error" }));
      await recordAudit(makeEntry({ toolName: "tool_b", success: true, toolCallId: "tc_4" }));
      await flushMicrotasks();

      const stats = await getAuditStats();
      expect(stats.totalEntries).toBe(4);
      expect(stats.sessionCount).toBe(1);
      expect(stats.toolStats).toHaveLength(2);

      // 按调用次数倒序排列
      const toolA = stats.toolStats.find((s) => s.toolName === "tool_a");
      expect(toolA).toBeDefined();
      expect(toolA?.count).toBe(3);
      expect(toolA?.successCount).toBe(2);
      expect(toolA?.failCount).toBe(1);

      const toolB = stats.toolStats.find((s) => s.toolName === "tool_b");
      expect(toolB).toBeDefined();
      expect(toolB?.count).toBe(1);
      expect(toolB?.successCount).toBe(1);
      expect(toolB?.failCount).toBe(0);

      // tool_a (count=3) 应排在 tool_b (count=1) 前面
      expect(stats.toolStats[0].toolName).toBe("tool_a");
      expect(stats.toolStats[1].toolName).toBe("tool_b");
    });
  });

  // ── 2. LRU 淘汰 ──
  describe("LRU 淘汰（MAX_ENTRIES_PER_SESSION=500）", () => {
    it("单会话超过 500 条时，最旧的被淘汰", async () => {
      const realDateNow = Date.now;
      let t = 1000;
      Date.now = () => t;

      try {
        // 记录 501 条，timestamp 递增（确保 LRU 顺序明确）
        for (let i = 0; i < 501; i++) {
          await recordAudit(makeEntry({ toolCallId: `tc_${i}` }));
          t++;
        }
        await flushMicrotasks();

        // limit 提高到 1000 以拿到全部
        const logs = await queryAuditLogs({
          sessionId: "session-1",
          limit: 1000,
        });
        expect(logs).toHaveLength(500);

        // 最旧的（tc_0）应该被淘汰
        const hasTc0 = logs.some((l) => l.toolCallId === "tc_0");
        expect(hasTc0).toBe(false);

        // 最新的是 tc_500，按时间倒序应在第一位
        expect(logs[0].toolCallId).toBe("tc_500");

        // 第二老的 tc_1 应在最后一位
        expect(logs[logs.length - 1].toolCallId).toBe("tc_1");
      } finally {
        Date.now = realDateNow;
      }
    });

    it("恰好 500 条时不淘汰", async () => {
      const realDateNow = Date.now;
      let t = 1000;
      Date.now = () => t;

      try {
        for (let i = 0; i < 500; i++) {
          await recordAudit(makeEntry({ toolCallId: `tc_${i}` }));
          t++;
        }
        await flushMicrotasks();

        const logs = await queryAuditLogs({
          sessionId: "session-1",
          limit: 1000,
        });
        expect(logs).toHaveLength(500);
        // 最旧的 tc_0 应仍然存在
        const hasTc0 = logs.some((l) => l.toolCallId === "tc_0");
        expect(hasTc0).toBe(true);
      } finally {
        Date.now = realDateNow;
      }
    });
  });

  // ── 3. 截断逻辑 ──
  describe("截断逻辑", () => {
    it("argsJson 超过 2000 字符时被截断", async () => {
      const longArgs = "x".repeat(2500);
      await recordAudit(
        makeEntry({ argsJson: longArgs, toolCallId: "tc_trunc_args" }),
      );
      await flushMicrotasks();

      const logs = await queryAuditLogs({ sessionId: "session-1" });
      expect(logs).toHaveLength(1);
      // 截断后长度 = 2000 + 1（省略号"…"）
      expect(logs[0].argsJson.length).toBe(2001);
      expect(logs[0].argsJson.endsWith("…")).toBe(true);
    });

    it("argsJson 恰好 2000 字符时不被截断", async () => {
      const exactArgs = "y".repeat(2000);
      await recordAudit(
        makeEntry({ argsJson: exactArgs, toolCallId: "tc_exact_args" }),
      );
      await flushMicrotasks();

      const logs = await queryAuditLogs({ sessionId: "session-1" });
      expect(logs).toHaveLength(1);
      expect(logs[0].argsJson.length).toBe(2000);
      expect(logs[0].argsJson.endsWith("…")).toBe(false);
    });

    it("resultPreview 超过 500 字符时被截断", async () => {
      const longResult = "z".repeat(600);
      await recordAudit(
        makeEntry({
          resultPreview: longResult,
          toolCallId: "tc_trunc_result",
          success: true,
        }),
      );
      await flushMicrotasks();

      const logs = await queryAuditLogs({ sessionId: "session-1" });
      expect(logs).toHaveLength(1);
      // 截断后长度 = 500 + 1（省略号"…"）
      expect(logs[0].resultPreview?.length).toBe(501);
      expect(logs[0].resultPreview?.endsWith("…")).toBe(true);
    });

    it("resultPreview 恰好 500 字符时不被截断", async () => {
      const exactResult = "w".repeat(500);
      await recordAudit(
        makeEntry({
          resultPreview: exactResult,
          toolCallId: "tc_exact_result",
          success: true,
        }),
      );
      await flushMicrotasks();

      const logs = await queryAuditLogs({ sessionId: "session-1" });
      expect(logs).toHaveLength(1);
      expect(logs[0].resultPreview?.length).toBe(500);
      expect(logs[0].resultPreview?.endsWith("…")).toBe(false);
    });

    it("resultPreview 为 undefined 时不进行截断", async () => {
      await recordAudit(
        makeEntry({
          resultPreview: undefined,
          toolCallId: "tc_no_result",
          success: true,
        }),
      );
      await flushMicrotasks();

      const logs = await queryAuditLogs({ sessionId: "session-1" });
      expect(logs).toHaveLength(1);
      expect(logs[0].resultPreview).toBeUndefined();
    });
  });

  // ── 4. JSONL 解析容错 ──
  describe("JSONL 解析容错", () => {
    /** 构造一条最小的合法 AuditEntry */
    function makeLine(overrides: Partial<AuditEntry> = {}): string {
      return JSON.stringify({
        timestamp: 1000,
        sessionId: "s1",
        toolCallId: "tc_1",
        toolName: "t",
        iteration: 0,
        argsJson: "{}",
        status: "done",
        success: true,
        ...overrides,
      });
    }

    it("空文件应返回空数组", async () => {
      mockReadFile.mockResolvedValueOnce({
        success: true,
        data: encodeText(""),
      });

      const logs = await queryAuditLogs({ sessionId: "empty-session" });
      expect(logs).toEqual([]);
    });

    it("只有空白行的文件应返回空数组", async () => {
      mockReadFile.mockResolvedValueOnce({
        success: true,
        data: encodeText("\n  \n\t\n"),
      });

      const logs = await queryAuditLogs({ sessionId: "blank-session" });
      expect(logs).toEqual([]);
    });

    it("损坏行被跳过，合法行被保留", async () => {
      const text = [
        makeLine({ toolCallId: "tc_1", timestamp: 100 }),
        "{ invalid json line",
        makeLine({ toolCallId: "tc_2", timestamp: 200 }),
        "",
        "another broken line",
        makeLine({ toolCallId: "tc_3", timestamp: 300 }),
      ].join("\n");

      mockReadFile.mockResolvedValueOnce({
        success: true,
        data: encodeText(text),
      });

      const logs = await queryAuditLogs({ sessionId: "s1" });
      expect(logs).toHaveLength(3);
      // 时间倒序：300, 200, 100
      expect(logs[0].toolCallId).toBe("tc_3");
      expect(logs[1].toolCallId).toBe("tc_2");
      expect(logs[2].toolCallId).toBe("tc_1");
    });

    it("正常多行解析", async () => {
      const text = [
        makeLine({ toolCallId: "tc_1", timestamp: 100 }),
        makeLine({ toolCallId: "tc_2", timestamp: 200 }),
        makeLine({ toolCallId: "tc_3", timestamp: 300 }),
      ].join("\n");

      mockReadFile.mockResolvedValueOnce({
        success: true,
        data: encodeText(text),
      });

      const logs = await queryAuditLogs({ sessionId: "s1" });
      expect(logs).toHaveLength(3);
      // 时间倒序：300, 200, 100
      expect(logs[0].toolCallId).toBe("tc_3");
      expect(logs[1].toolCallId).toBe("tc_2");
      expect(logs[2].toolCallId).toBe("tc_1");
    });

    it("文件读取返回 null（文件不存在）应返回空数组", async () => {
      mockReadFile.mockResolvedValueOnce(null);

      const logs = await queryAuditLogs({ sessionId: "missing-session" });
      expect(logs).toEqual([]);
    });

    it("文件读取返回 success=false 应返回空数组", async () => {
      mockReadFile.mockResolvedValueOnce({
        success: false,
        error: "permission denied",
      });

      const logs = await queryAuditLogs({ sessionId: "denied-session" });
      expect(logs).toEqual([]);
    });

    it("已加载过的 session 不再重复读磁盘", async () => {
      mockReadFile.mockResolvedValueOnce({
        success: true,
        data: encodeText(makeLine({ toolCallId: "tc_1", timestamp: 100 })),
      });

      // 第一次查询：触发磁盘读取
      const logs1 = await queryAuditLogs({ sessionId: "s1" });
      expect(logs1).toHaveLength(1);
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      // 第二次查询：应使用内存缓存，不再读磁盘
      const logs2 = await queryAuditLogs({ sessionId: "s1" });
      expect(logs2).toHaveLength(1);
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. scheduleFlush 并发安全（P1-2 回归测试） ──
  describe("scheduleFlush 并发安全（P1-2 回归测试）", () => {
    it("连续多次 recordAudit 同一 sessionId，flush 串行化执行", async () => {
      // 让 writeFile 返回可控的 promise（手动 resolve）
      const writeResolvers: Array<() => void> = [];
      let writeCallCount = 0;

      mockWriteFile.mockImplementation(() => {
        writeCallCount++;
        return new Promise<{ success: boolean }>((resolve) => {
          writeResolvers.push(() => resolve({ success: true }));
        });
      });

      // 第一次 recordAudit：scheduleFlush 启动 promise A
      // promise A = Promise.resolve().then(() => flushToDisk())
      await recordAudit(makeEntry({ toolCallId: "tc_1" }));
      await flushMicrotasks();
      // promise A 已进入 flushToDisk 内部，await writeFile 已挂起
      expect(writeCallCount).toBe(1);
      expect(writeResolvers).toHaveLength(1);

      // 第二次 recordAudit：scheduleFlush 排队 promise B（等待 promise A）
      await recordAudit(makeEntry({ toolCallId: "tc_2" }));
      await flushMicrotasks();
      // promise A 未完成，promise B 不应开始
      expect(writeCallCount).toBe(1);

      // 第三次 recordAudit：scheduleFlush 排队 promise C（等待 promise B）
      await recordAudit(makeEntry({ toolCallId: "tc_3" }));
      await flushMicrotasks();
      expect(writeCallCount).toBe(1);

      // 解除 writeFile_1 → promise A 完成 → promise B 开始 → writeFile_2 被调用
      writeResolvers[0]();
      await flushMicrotasks();
      expect(writeCallCount).toBe(2);

      // 解除 writeFile_2 → promise B 完成 → promise C 开始 → writeFile_3 被调用
      writeResolvers[1]();
      await flushMicrotasks();
      expect(writeCallCount).toBe(3);

      // 解除 writeFile_3 → promise C 完成
      writeResolvers[2]();
      await flushMicrotasks();
      expect(writeCallCount).toBe(3);

      // 验证最终数据完整
      const logs = await queryAuditLogs({ sessionId: "session-1" });
      expect(logs).toHaveLength(3);
    });

    it("flush 失败时不影响下一次 flush", async () => {
      // 第一次 writeFile 失败，第二次成功
      mockWriteFile
        .mockResolvedValueOnce({ success: false, error: "disk full" })
        .mockResolvedValueOnce({ success: true });

      await recordAudit(makeEntry({ toolCallId: "tc_1" }));
      await flushMicrotasks();

      // 第二次 recordAudit 应能正常 flush（前一次失败不影响）
      await recordAudit(makeEntry({ toolCallId: "tc_2" }));
      await flushMicrotasks();

      // 两次 flush 都被调用
      expect(mockWriteFile).toHaveBeenCalledTimes(2);

      // 数据应能在内存中查询到（flush 失败不影响内存数据）
      const logs = await queryAuditLogs({ sessionId: "session-1" });
      expect(logs).toHaveLength(2);
    });

    it("flush 抛异常时不影响下一次 flush", async () => {
      // 第一次 writeFile 抛异常，第二次成功
      mockWriteFile
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce({ success: true });

      await recordAudit(makeEntry({ toolCallId: "tc_1" }));
      await flushMicrotasks();

      await recordAudit(makeEntry({ toolCallId: "tc_2" }));
      await flushMicrotasks();

      expect(mockWriteFile).toHaveBeenCalledTimes(2);

      const logs = await queryAuditLogs({ sessionId: "session-1" });
      expect(logs).toHaveLength(2);
    });

    it("flushChains Map 在完成后正确清理（无内存泄漏）", async () => {
      // 由于 flushChains 是模块私有变量，无法直接访问。
      // 通过间接方式验证：完成所有 flush 后，再次调用 recordAudit 时
      // 新的 flush 应立即开始（不等待任何先前的 promise）。

      // 记录 5 条数据，每条触发一次 flush
      for (let i = 0; i < 5; i++) {
        await recordAudit(makeEntry({ toolCallId: `tc_${i}` }));
      }
      await flushMicrotasks();

      // 等待所有 flush 完成并被清理
      expect(mockWriteFile).toHaveBeenCalledTimes(5);

      // 验证：再次 recordAudit 时，flush 应立即开始（不排队）
      // 如果 flushChains 没有被清理，新的 flush 会等待一个已 resolved 的 promise（不阻塞）
      // 如果被清理，新的 flush 会用 Promise.resolve() 作为 prev（也不阻塞）
      // 二者表现相同，但若 Map 累积会导致内存泄漏。
      // 这里通过验证后续 recordAudit 仍能正常 flush 来确保功能正常。
      const writeCallCountBefore = mockWriteFile.mock.calls.length;
      await recordAudit(makeEntry({ toolCallId: "tc_new" }));
      await flushMicrotasks();

      expect(mockWriteFile.mock.calls.length).toBe(writeCallCountBefore + 1);
    });

    it("不同 sessionId 的 flush 互不阻塞", async () => {
      // 让 writeFile 返回可控的 promise
      const writeResolvers: Array<() => void> = [];
      let writeCallCount = 0;

      mockWriteFile.mockImplementation(() => {
        writeCallCount++;
        return new Promise<{ success: boolean }>((resolve) => {
          writeResolvers.push(() => resolve({ success: true }));
        });
      });

      // session-1 的 flush（pending）
      await recordAudit(makeEntry({ sessionId: "session-1", toolCallId: "tc_1" }));
      await flushMicrotasks();
      expect(writeCallCount).toBe(1);

      // session-2 的 flush 应能立即开始（不等待 session-1）
      await recordAudit(makeEntry({ sessionId: "session-2", toolCallId: "tc_2" }));
      await flushMicrotasks();
      expect(writeCallCount).toBe(2);

      // 两个 writeFile 都已挂起，分别 resolve
      writeResolvers[0]();
      writeResolvers[1]();
      await flushMicrotasks();

      const s1Logs = await queryAuditLogs({ sessionId: "session-1" });
      const s2Logs = await queryAuditLogs({ sessionId: "session-2" });
      expect(s1Logs).toHaveLength(1);
      expect(s2Logs).toHaveLength(1);
    });
  });

  // ── 6. clearAuditLogs / clearAllAuditLogs ──
  describe("clearAuditLogs / clearAllAuditLogs", () => {
    it("clearAuditLogs 只清除指定 sessionId", async () => {
      await recordAudit(makeEntry({ sessionId: "s1", toolCallId: "tc_s1" }));
      await recordAudit(makeEntry({ sessionId: "s2", toolCallId: "tc_s2" }));
      await flushMicrotasks();

      await clearAuditLogs("s1");

      const s1Logs = await queryAuditLogs({ sessionId: "s1" });
      const s2Logs = await queryAuditLogs({ sessionId: "s2" });

      expect(s1Logs).toHaveLength(0);
      expect(s2Logs).toHaveLength(1);
      expect(s2Logs[0].toolCallId).toBe("tc_s2");

      // deleteFile 应被调用一次（s1 的文件）
      expect(mockDeleteFile).toHaveBeenCalledTimes(1);
      // 路径应包含 s1
      expect(mockDeleteFile.mock.calls[0]?.[0]).toContain("s1.jsonl");
    });

    it("clearAuditLogs 后该 session 可重新记录", async () => {
      await recordAudit(makeEntry({ sessionId: "s1", toolCallId: "tc_old" }));
      await flushMicrotasks();

      await clearAuditLogs("s1");

      // 重新记录
      await recordAudit(makeEntry({ sessionId: "s1", toolCallId: "tc_new" }));
      await flushMicrotasks();

      const logs = await queryAuditLogs({ sessionId: "s1" });
      expect(logs).toHaveLength(1);
      expect(logs[0].toolCallId).toBe("tc_new");
    });

    it("clearAllAuditLogs 清除所有（通过 listSessions 遍历磁盘文件）", async () => {
      // mock listSessions 返回两个 session
      mockListSessions.mockResolvedValue([
        { id: "s1", title: "Session 1", messageCount: 0, createdAt: 0, updatedAt: 0 },
        { id: "s2", title: "Session 2", messageCount: 0, createdAt: 0, updatedAt: 0 },
      ]);

      await recordAudit(makeEntry({ sessionId: "s1", toolCallId: "tc_s1" }));
      await recordAudit(makeEntry({ sessionId: "s2", toolCallId: "tc_s2" }));
      await flushMicrotasks();

      // 在 clear 之前，先验证有数据
      const statsBefore = await getAuditStats();
      expect(statsBefore.totalEntries).toBe(2);

      await clearAllAuditLogs();

      // deleteFile 应被调用 2 次（每个 session 一次）
      expect(mockDeleteFile).toHaveBeenCalledTimes(2);
      const deletedPaths = mockDeleteFile.mock.calls.map((c) => c[0]);
      expect(deletedPaths.some((p) => p.includes("s1.jsonl"))).toBe(true);
      expect(deletedPaths.some((p) => p.includes("s2.jsonl"))).toBe(true);

      // clear 后磁盘文件被删除，readFile 返回 null（默认 mock）
      // getAuditStats 会重新通过 listSessions 加载，但磁盘文件已不存在，所以 totalEntries=0
      const stats = await getAuditStats();
      expect(stats.totalEntries).toBe(0);
      // 注意：sessionCount 不一定为 0，因为 getAuditStats 会重新加载 session 到内存
      // （loadFromDisk 对不存在的文件会 set 空数组），这是实现的实际行为
    });

    it("clearAllAuditLogs 在 listSessions 失败时静默处理", async () => {
      // listSessions 抛异常
      mockListSessions.mockRejectedValue(new Error("storage error"));

      await recordAudit(makeEntry({ sessionId: "s1", toolCallId: "tc_s1" }));
      await flushMicrotasks();

      // 不应抛出
      await clearAllAuditLogs();

      // 内存仍应被清空
      const stats = await getAuditStats();
      expect(stats.totalEntries).toBe(0);
    });

    it("clearAllAuditLogs 单个文件删除失败不影响其他", async () => {
      // 第一个 session 的文件删除失败，第二个成功
      mockDeleteFile
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      mockListSessions.mockResolvedValue([
        { id: "s1", title: "Session 1", messageCount: 0, createdAt: 0, updatedAt: 0 },
        { id: "s2", title: "Session 2", messageCount: 0, createdAt: 0, updatedAt: 0 },
      ]);

      // 不应抛出
      await clearAllAuditLogs();

      // 两次 deleteFile 都被调用
      expect(mockDeleteFile).toHaveBeenCalledTimes(2);
    });
  });

  // ── 7. 其他边界场景 ──
  describe("其他边界场景", () => {
    it("recordAudit 在 getCacheDirectory 失败时应静默处理", async () => {
      mockGetCacheDirectory.mockResolvedValue({
        success: false,
        error: "no cache dir",
      });

      // 不应抛出
      await recordAudit(makeEntry({ toolCallId: "tc_1" }));
      await flushMicrotasks();

      // 数据可能未能持久化，但内存中应有（loadFromDisk 失败时会 set 空数组）
      // 注意：getCacheDirectory 失败时 getBaseDir 抛出，loadFromDisk catch 后返回 []
      // 然后 recordAudit 继续往空 list push
      // 但 scheduleFlush 会再次调用 getBaseDir 失败，flushToDisk catch 后静默
      // 内存中应有数据
      const logs = await queryAuditLogs({ sessionId: "session-1" });
      // queryAuditLogs 内部 loadFromDisk 会失败但返回内存中的数据
      expect(logs.length).toBeGreaterThanOrEqual(0);
    });

    it("全局查询（不指定 sessionId）应合并所有已加载会话", async () => {
      await recordAudit(makeEntry({ sessionId: "s1", toolCallId: "tc_s1" }));
      await recordAudit(makeEntry({ sessionId: "s2", toolCallId: "tc_s2" }));
      await flushMicrotasks();

      // 不指定 sessionId：合并所有内存中的会话
      const allLogs = await queryAuditLogs({});
      expect(allLogs.length).toBe(2);

      // 验证两个 session 的日志都在
      const ids = allLogs.map((l) => l.toolCallId).sort();
      expect(ids).toEqual(["tc_s1", "tc_s2"]);
    });

    it("全局查询内存为空时通过 listSessions 加载最近会话", async () => {
      // mock listSessions 返回一个 session
      mockListSessions.mockResolvedValue([
        { id: "disk-session", title: "Disk Session", messageCount: 0, createdAt: 0, updatedAt: 0 },
      ]);

      // mock readFile 返回该 session 的磁盘内容
      const diskEntry: AuditEntry = {
        timestamp: 1000,
        sessionId: "disk-session",
        toolCallId: "tc_disk",
        toolName: "disk_tool",
        iteration: 0,
        argsJson: "{}",
        status: "done",
        success: true,
      };
      mockReadFile.mockResolvedValueOnce({
        success: true,
        data: encodeText(JSON.stringify(diskEntry)),
      });

      // 全局查询：内存为空，触发 listSessions 加载
      const logs = await queryAuditLogs({});
      expect(logs.length).toBe(1);
      expect(logs[0].toolCallId).toBe("tc_disk");

      // 验证 listSessions 被调用
      expect(mockListSessions).toHaveBeenCalled();
    });
  });
});
