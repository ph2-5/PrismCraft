/**
 * P5 断点恢复 - session-checkpoint 测试
 *
 * 测试覆盖：
 * - initCheckpoint：初始化检查点
 * - saveCheckpoint：增量更新检查点
 * - clearCheckpoint：清除检查点
 * - markInterrupted：标记中断
 * - markRunningAsInterrupted：启动时批量标记
 * - listInterruptedSessions：列出中断会话
 * - listRunningSessions：列出运行中会话
 * - getCheckpoint：获取检查点详情
 * - loadInterruptedSession：加载并修正过期状态
 * - 索引清理策略（completed 超 7 天清理、保留 100 条）
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentSession } from "../../domain/types";
import { createEmptySession } from "../../domain/types";

// 内存存储模拟
const mockConfig = new Map<string, unknown>();
const mockFiles = new Map<string, string>();

// Mock session-storage（session-checkpoint 依赖 saveSession/loadSession）
vi.mock("../session-storage", () => ({
  saveSession: vi.fn().mockImplementation(async (session: AgentSession) => {
    const filePath = `/mock-cache/agent/sessions/${session.id}.json`;
    mockFiles.set(filePath, JSON.stringify(session));
    return true;
  }),
  loadSession: vi.fn().mockImplementation(async (sessionId: string) => {
    const filePath = `/mock-cache/agent/sessions/${sessionId}.json`;
    const data = mockFiles.get(filePath);
    if (!data) return null;
    const session = JSON.parse(data) as AgentSession;
    // 模拟 loadSession 的行为：重置 streaming 状态
    session.messages = session.messages.map((m) => ({ ...m, streaming: false }));
    return session;
  }),
}));

// Mock file-http（session-checkpoint 依赖 getConfig/setConfig）
vi.mock("@/shared/file-http", () => ({
  getConfig: vi.fn().mockImplementation(async (key: string) => {
    return mockConfig.get(key) ?? null;
  }),
  setConfig: vi.fn().mockImplementation(async (key: string, value: unknown) => {
    mockConfig.set(key, value);
    return true;
  }),
}));

// 导入被测模块（在 mock 之后）
import {
  initCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
  markInterrupted,
  markRunningAsInterrupted,
  listInterruptedSessions,
  listRunningSessions,
  getCheckpoint,
  loadInterruptedSession,
  _resetCheckpointIndex,
} from "../session-checkpoint";

function createTestSession(id?: string): AgentSession {
  const session = createEmptySession();
  if (id) session.id = id;
  session.title = "测试会话";
  session.messages = [
    { id: "msg1", role: "user", content: "你好", timestamp: Date.now() },
  ];
  return session;
}

describe("SessionCheckpoint", () => {
  beforeEach(() => {
    mockConfig.clear();
    mockFiles.clear();
    vi.clearAllMocks();
  });

  describe("initCheckpoint", () => {
    it("初始化检查点并保存会话", async () => {
      const session = createTestSession("s1");
      const ok = await initCheckpoint(session, "测试输入");
      expect(ok).toBe(true);
      expect(session.checkpoint).toBeDefined();
      expect(session.checkpoint!.sessionId).toBe("s1");
      expect(session.checkpoint!.status).toBe("running");
      expect(session.checkpoint!.userInput).toBe("测试输入");
      expect(session.checkpoint!.iteration).toBe(0);
      expect(session.checkpoint!.toolCallsCompleted).toBe(0);
      expect(session.checkpoint!.toolCallsTotal).toBe(0);
      expect(session.checkpoint!.startedAt).toBeGreaterThan(0);
      expect(session.checkpoint!.updatedAt).toBeGreaterThan(0);
    });

    it("检查点被写入索引", async () => {
      const session = createTestSession("s2");
      await initCheckpoint(session, "输入");
      const running = await listRunningSessions();
      expect(running).toHaveLength(1);
      expect(running[0]!.sessionId).toBe("s2");
      expect(running[0]!.status).toBe("running");
    });
  });

  describe("saveCheckpoint", () => {
    it("增量更新 iteration", async () => {
      const session = createTestSession("s3");
      await initCheckpoint(session, "输入");
      const ok = await saveCheckpoint(session, { iteration: 1 });
      expect(ok).toBe(true);
      expect(session.checkpoint!.iteration).toBe(1);
    });

    it("增量更新 toolCallsCompleted 和 toolCallsTotal", async () => {
      const session = createTestSession("s4");
      await initCheckpoint(session, "输入");
      await saveCheckpoint(session, { toolCallsTotal: 3 });
      await saveCheckpoint(session, { toolCallsCompleted: 2 });
      expect(session.checkpoint!.toolCallsTotal).toBe(3);
      expect(session.checkpoint!.toolCallsCompleted).toBe(2);
    });

    it("无 checkpoint 时返回 false", async () => {
      const session = createTestSession("s5");
      const ok = await saveCheckpoint(session, { iteration: 1 });
      expect(ok).toBe(false);
    });

    it("更新 updatedAt 时间戳", async () => {
      const session = createTestSession("s6");
      await initCheckpoint(session, "输入");
      const oldUpdatedAt = session.checkpoint!.updatedAt;
      // 等待一下确保时间戳不同
      await new Promise((r) => setTimeout(r, 10));
      await saveCheckpoint(session, { iteration: 1 });
      expect(session.checkpoint!.updatedAt).toBeGreaterThan(oldUpdatedAt);
    });
  });

  describe("clearCheckpoint", () => {
    it("从索引中移除检查点", async () => {
      const session = createTestSession("s7");
      await initCheckpoint(session, "输入");
      expect(await listRunningSessions()).toHaveLength(1);

      const ok = await clearCheckpoint("s7");
      expect(ok).toBe(true);
      expect(await listRunningSessions()).toHaveLength(0);
      expect(await listInterruptedSessions()).toHaveLength(0);
    });

    it("清除不存在的检查点也返回 true（幂等）", async () => {
      const ok = await clearCheckpoint("not-exists");
      expect(ok).toBe(true);
    });
  });

  describe("markInterrupted", () => {
    it("将 running 状态标记为 interrupted", async () => {
      const session = createTestSession("s8");
      await initCheckpoint(session, "输入");
      expect(await listRunningSessions()).toHaveLength(1);

      const ok = await markInterrupted("s8");
      expect(ok).toBe(true);
      expect(await listRunningSessions()).toHaveLength(0);
      expect(await listInterruptedSessions()).toHaveLength(1);
      expect((await listInterruptedSessions())[0]!.sessionId).toBe("s8");
    });

    it("标记不存在的会话返回 false", async () => {
      const ok = await markInterrupted("not-exists");
      expect(ok).toBe(false);
    });
  });

  describe("markRunningAsInterrupted", () => {
    it("批量将所有 running 标记为 interrupted", async () => {
      const s1 = createTestSession("batch1");
      const s2 = createTestSession("batch2");
      const s3 = createTestSession("batch3");
      await initCheckpoint(s1, "输入1");
      await initCheckpoint(s2, "输入2");
      await initCheckpoint(s3, "输入3");
      // 先把 s3 标记为 interrupted
      await markInterrupted("batch3");

      const count = await markRunningAsInterrupted();
      expect(count).toBe(2); // batch1 和 batch2

      expect(await listRunningSessions()).toHaveLength(0);
      expect(await listInterruptedSessions()).toHaveLength(3);
    });

    it("无运行中会话时返回 0", async () => {
      const count = await markRunningAsInterrupted();
      expect(count).toBe(0);
    });
  });

  describe("listInterruptedSessions", () => {
    it("按 updatedAt 倒序排列", async () => {
      const s1 = createTestSession("order1");
      const s2 = createTestSession("order2");
      await initCheckpoint(s1, "输入1");
      await initCheckpoint(s2, "输入2");
      await markInterrupted("order1");
      // 等待确保 order2 的 updatedAt 更大
      await new Promise((r) => setTimeout(r, 10));
      await markInterrupted("order2");

      const list = await listInterruptedSessions();
      expect(list).toHaveLength(2);
      expect(list[0]!.sessionId).toBe("order2");
      expect(list[1]!.sessionId).toBe("order1");
    });

    it("空索引时返回空数组", async () => {
      const list = await listInterruptedSessions();
      expect(list).toHaveLength(0);
    });
  });

  describe("listRunningSessions", () => {
    it("只返回 running 状态的会话", async () => {
      const s1 = createTestSession("run1");
      const s2 = createTestSession("run2");
      await initCheckpoint(s1, "输入");
      await initCheckpoint(s2, "输入");
      await markInterrupted("run2");

      const running = await listRunningSessions();
      expect(running).toHaveLength(1);
      expect(running[0]!.sessionId).toBe("run1");
    });
  });

  describe("getCheckpoint", () => {
    it("加载会话并返回 checkpoint", async () => {
      const session = createTestSession("get1");
      await initCheckpoint(session, "测试输入");

      const cp = await getCheckpoint("get1");
      expect(cp).toBeDefined();
      expect(cp!.sessionId).toBe("get1");
      expect(cp!.userInput).toBe("测试输入");
    });

    it("会话不存在时返回 null", async () => {
      const cp = await getCheckpoint("not-exists");
      expect(cp).toBeNull();
    });

    it("会话无 checkpoint 时返回 null", async () => {
      const session = createTestSession("no-cp");
      // 直接写文件但不通过 initCheckpoint
      const { saveSession } = await import("../session-storage");
      await saveSession(session);

      const cp = await getCheckpoint("no-cp");
      expect(cp).toBeNull();
    });
  });

  describe("loadInterruptedSession", () => {
    it("加载会话并修正过期的 running 状态", async () => {
      const session = createTestSession("load1");
      await initCheckpoint(session, "输入");
      // 模拟崩溃：checkpoint.status 仍为 running

      const loaded = await loadInterruptedSession("load1");
      expect(loaded).toBeDefined();
      expect(loaded!.checkpoint).toBeDefined();
      expect(loaded!.checkpoint!.status).toBe("interrupted");
    });

    it("会话不存在时返回 null", async () => {
      const loaded = await loadInterruptedSession("not-exists");
      expect(loaded).toBeNull();
    });

    it("已经是 interrupted 状态的会话保持不变", async () => {
      const session = createTestSession("load2");
      await initCheckpoint(session, "输入");
      await markInterrupted("load2");

      const loaded = await loadInterruptedSession("load2");
      expect(loaded!.checkpoint!.status).toBe("interrupted");
    });

    it("无 checkpoint 的会话正常加载", async () => {
      const session = createTestSession("load3");
      const { saveSession } = await import("../session-storage");
      await saveSession(session);

      const loaded = await loadInterruptedSession("load3");
      expect(loaded).toBeDefined();
      expect(loaded!.checkpoint).toBeUndefined();
    });
  });

  describe("_resetCheckpointIndex", () => {
    it("清空索引", async () => {
      const session = createTestSession("reset1");
      await initCheckpoint(session, "输入");
      expect(await listRunningSessions()).toHaveLength(1);

      await _resetCheckpointIndex();
      expect(await listRunningSessions()).toHaveLength(0);
      expect(await listInterruptedSessions()).toHaveLength(0);
    });
  });

  describe("索引清理策略", () => {
    it("保留最近 100 条", async () => {
      // 创建 105 个检查点
      for (let i = 0; i < 105; i++) {
        const s = createTestSession(`cleanup${i}`);
        await initCheckpoint(s, `输入${i}`);
      }

      const allRunning = await listRunningSessions();
      expect(allRunning.length).toBeLessThanOrEqual(100);
    });

    it("completed 状态超 7 天被清理", async () => {
      const session = createTestSession("old-completed");
      await initCheckpoint(session, "输入");
      // 手动设置索引条目为 8 天前的 completed
      const { setConfig } = await import("@/shared/file-http");
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      await setConfig("agent.checkpoints.index", [
        {
          sessionId: "old-completed",
          status: "completed",
          startedAt: eightDaysAgo,
          updatedAt: eightDaysAgo,
        },
      ]);

      // 触发一次索引写入（会触发清理）
      const newSession = createTestSession("new-one");
      await initCheckpoint(newSession, "输入");

      // 旧的 completed 应该被清理
      const interrupted = await listInterruptedSessions();
      expect(interrupted.find((e) => e.sessionId === "old-completed")).toBeUndefined();
    });
  });

  describe("端到端流程", () => {
    it("完整的中断恢复流程", async () => {
      // 1. 初始化检查点
      const session = createTestSession("e2e1");
      await initCheckpoint(session, "用户输入");
      expect(session.checkpoint!.status).toBe("running");

      // 2. 更新检查点（模拟 AgentLoop 运行）
      await saveCheckpoint(session, { iteration: 1, toolCallsTotal: 2 });
      await saveCheckpoint(session, { toolCallsCompleted: 1 });

      // 3. 模拟崩溃：应用重启，markRunningAsInterrupted
      await markRunningAsInterrupted();
      const interrupted = await listInterruptedSessions();
      expect(interrupted).toHaveLength(1);
      expect(interrupted[0]!.sessionId).toBe("e2e1");

      // 4. 用户选择恢复，加载中断会话
      const loaded = await loadInterruptedSession("e2e1");
      expect(loaded).toBeDefined();
      expect(loaded!.checkpoint!.status).toBe("interrupted");
      expect(loaded!.checkpoint!.iteration).toBe(1);
      expect(loaded!.checkpoint!.toolCallsTotal).toBe(2);
      expect(loaded!.checkpoint!.toolCallsCompleted).toBe(1);

      // 5. 用户重新发送消息，新 checkpoint 覆盖旧的
      await initCheckpoint(loaded!, "重新发送");
      expect(loaded!.checkpoint!.status).toBe("running");
      expect(loaded!.checkpoint!.userInput).toBe("重新发送");

      // 6. 正常完成，清除检查点
      await clearCheckpoint(loaded!.id);
      expect(await listInterruptedSessions()).toHaveLength(0);
      expect(await listRunningSessions()).toHaveLength(0);
    });
  });
});
