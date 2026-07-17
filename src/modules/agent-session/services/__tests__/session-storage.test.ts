/**
 * session-storage 单元测试
 *
 * 重点验证 P0-1 修复：safetyLog 字段不应被持久化。
 * safetyLog 是 AgentLoop 运行时暂存的 safety 改写日志（IP/名人/品牌改写 + antislop 过滤），
 * 仅用于 UI 展示，不应写入磁盘（避免调试数据泄漏）。
 * 详见 agent/domain/types.ts 中 safetyLog 字段注释。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentSession } from "@/modules/agent";
import { createEmptySession } from "@/modules/agent";

// 捕获 writeFile 写入的真实 JSON 内容
const writeCapture = new Map<string, string>();

vi.mock("@/shared/file-http", () => ({
  writeFile: vi.fn().mockImplementation(async (filePath: string, content: string) => {
    writeCapture.set(filePath, content);
    return { success: true };
  }),
  readFile: vi.fn().mockResolvedValue({ success: false, data: null }),
  getCacheDirectory: vi.fn().mockResolvedValue({
    success: true,
    path: "/mock-cache",
  }),
  deleteFile: vi.fn().mockResolvedValue({ success: true }),
}));

// 导入被测模块（在 mock 之后）
import { saveSession, loadSession } from "../session-storage";

function createTestSession(): AgentSession {
  const session = createEmptySession();
  session.id = "test-session-id";
  session.title = "测试会话";
  session.messages = [
    { id: "msg1", role: "user", content: "你好", timestamp: Date.now() },
  ];
  return session;
}

describe("SessionStorage.saveSession", () => {
  beforeEach(() => {
    writeCapture.clear();
    vi.clearAllMocks();
  });

  it("P0-1: safetyLog 字段不应被持久化到磁盘", async () => {
    const session = createTestSession();
    // 模拟 AgentLoop.run 中暂存的 safety 改写日志
    session.safetyLog = [
      {
        timestamp: Date.now(),
        originalInput: "原输入",
        ipChanges: [{ from: "OpenAI", to: "某AI公司" }],
        antislopReplacements: [],
        finalInput: "改写后输入",
      },
    ];

    const result = await saveSession(session);
    expect(result).toBe(true);

    // 验证写入磁盘的 JSON 不包含 safetyLog 字段
    const writtenJson = writeCapture.get("/mock-cache/agent/sessions/test-session-id.json");
    expect(writtenJson).toBeDefined();
    const parsed = JSON.parse(writtenJson!);
    expect(parsed).not.toHaveProperty("safetyLog");
  });

  it("P0-1: saveSession 不应修改原 session 对象的 safetyLog（运行时字段保留）", async () => {
    const session = createTestSession();
    const originalSafetyLog = [
      { timestamp: 1, originalInput: "test", ipChanges: [], antislopReplacements: [], finalInput: "test" },
    ];
    session.safetyLog = originalSafetyLog;

    await saveSession(session);

    // 原对象的 safetyLog 应保留（运行时 UI 仍需展示）
    expect(session.safetyLog).toBe(originalSafetyLog);
    expect(session.safetyLog).toHaveLength(1);
  });

  it("无 safetyLog 的会话保存时应正常写入", async () => {
    const session = createTestSession();
    // 不设置 safetyLog

    const result = await saveSession(session);
    expect(result).toBe(true);

    const writtenJson = writeCapture.get("/mock-cache/agent/sessions/test-session-id.json");
    expect(writtenJson).toBeDefined();
    const parsed = JSON.parse(writtenJson!);
    expect(parsed).not.toHaveProperty("safetyLog");
    expect(parsed.id).toBe("test-session-id");
    expect(parsed.messages).toHaveLength(1);
  });

  it("streaming 状态应在持久化时被重置为 false", async () => {
    const session = createTestSession();
    // 模拟运行中流式状态
    session.messages.push({
      id: "msg2",
      role: "assistant",
      content: "正在生成",
      streaming: true,
      timestamp: Date.now(),
    });

    await saveSession(session);

    const writtenJson = writeCapture.get("/mock-cache/agent/sessions/test-session-id.json");
    const parsed = JSON.parse(writtenJson!);
    expect(parsed.messages.every((m: { streaming: boolean }) => m.streaming === false)).toBe(true);
  });

  it("P1-10: 加载损坏的 JSON（结构不完整）应返回 null 而非抛错", async () => {
    // 模拟文件写入中途崩溃导致的截断 JSON
    const { readFile } = await import("@/shared/file-http");
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: new TextEncoder().encode('{"id":"broken","title":"坏文件"').buffer,
    });

    const result = await loadSession("broken-session");
    expect(result).toBeNull();
  });

  it("P1-10: 加载缺少 messages 字段的会话应返回 null", async () => {
    const { readFile } = await import("@/shared/file-http");
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: new TextEncoder().encode(
        JSON.stringify({ id: "no-msgs", title: "无消息", createdAt: 1, updatedAt: 1 }),
      ).buffer,
    });

    const result = await loadSession("no-msgs-session");
    expect(result).toBeNull();
  });

  it("P1-10: 加载消息缺少 role/content 字段的会话应返回 null", async () => {
    const { readFile } = await import("@/shared/file-http");
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: new TextEncoder().encode(
        JSON.stringify({
          id: "bad-msg",
          title: "消息字段不全",
          createdAt: 1,
          updatedAt: 1,
          messages: [{ id: "m1", content: "缺少 role" }],
        }),
      ).buffer,
    });

    const result = await loadSession("bad-msg-session");
    expect(result).toBeNull();
  });
});
