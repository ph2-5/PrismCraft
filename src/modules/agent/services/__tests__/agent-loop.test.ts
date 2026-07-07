/**
 * Agent Loop 集成测试
 *
 * 测试核心循环逻辑：
 * - 正常文本响应
 * - 工具调用流程
 * - LLM 失败处理
 * - 流式 delta 累积
 * - 工具调用增量合并
 * - 达到最大循环次数
 * - 取消
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { StreamChunk, ToolCall, ApiResponse } from "@/domain/ports/ai-provider-port";
import type { ToolResult } from "../../domain/types";
import { createEmptySession } from "../../domain/types";

// ── 用 vi.hoisted 声明 mock 变量（vi.mock 工厂会在文件顶部执行） ──
const { mockGenerateTextStream, mockExecute, mockVideoTaskStorage } = vi.hoisted(() => ({
  mockGenerateTextStream: vi.fn(),
  mockExecute: vi.fn(),
  mockVideoTaskStorage: {
    getVideoTasks: vi.fn().mockResolvedValue([]),
  },
}));

// ── Mock container ──
vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: {
      generateTextStream: mockGenerateTextStream,
    },
    videoTaskStorage: mockVideoTaskStorage,
  },
}));

// ── Mock 动态 import（buildDynamicProjectState 用） ──
vi.mock("@/modules/character", () => ({
  characterService: { getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
}));
vi.mock("@/modules/scene", () => ({
  sceneService: { getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
}));
vi.mock("@/modules/story", () => ({
  storyService: { getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
}));
vi.mock("@/shared/api-config", () => ({
  loadConfig: vi.fn().mockResolvedValue(null),
}));

// ── Mock toolExecutor ──
vi.mock("../tool-executor", () => ({
  toolExecutor: { execute: mockExecute },
}));

// ── Mock toolRegistry ──
vi.mock("../tool-registry", () => ({
  toolRegistry: {
    getToolDefs: vi.fn().mockReturnValue([]),
    getToolDescriptions: vi.fn().mockReturnValue([]),
  },
}));

// 导入被测模块（在 mock 之后）
import { AgentLoop } from "../agent-loop";
import type { AgentSession, AgentLoopCallbacks } from "../../domain/types";

/** 创建 mock 回调 */
function createMockCallbacks(): AgentLoopCallbacks & { signal: AbortSignal } {
  const controller = new AbortController();
  return {
    onChunk: vi.fn(),
    onToolCall: vi.fn(),
    onToolResult: vi.fn(),
    onError: vi.fn(),
    signal: controller.signal,
  };
}

/** 创建会话 */
function createSession(): AgentSession {
  return createEmptySession();
}

/** 模拟 LLM 返回成功响应 */
function mockStreamSuccess(text: string): ApiResponse<{ text: string }> {
  return { success: true, data: { text } };
}

describe("AgentLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVideoTaskStorage.getVideoTasks.mockResolvedValue([]);
  });

  describe("正常文本响应", () => {
    it("LLM 返回 delta + finishReason=stop 时应结束循环", async () => {
      const session = createSession();
      const callbacks = createMockCallbacks();

      mockGenerateTextStream.mockImplementation(async (_prompt, options) => {
        options?.onChunk({ delta: "你好" });
        options?.onChunk({ delta: "！", finishReason: "stop" });
        return mockStreamSuccess("你好！");
      });

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 });
      await loop.run("hi");

      expect(session.messages.length).toBeGreaterThanOrEqual(2);
      expect(session.messages[0]?.role).toBe("user");
      expect(session.messages[1]?.role).toBe("assistant");
      expect(session.messages[1]?.content).toContain("你好");
      expect(callbacks.onChunk).toHaveBeenCalled();
    });

    it("流式 delta 应累积到 assistant 消息内容", async () => {
      const session = createSession();
      const callbacks = createMockCallbacks();

      mockGenerateTextStream.mockImplementation(async (_prompt, options) => {
        for (const delta of ["Hello", " ", "World", "!"]) {
          options?.onChunk({ delta });
        }
        options?.onChunk({ finishReason: "stop" });
        return mockStreamSuccess("Hello World!");
      });

      const loop = new AgentLoop(session, callbacks, { maxIterations: 1 });
      await loop.run("test");

      const assistantMsg = session.messages.find((m) => m.role === "assistant");
      expect(assistantMsg?.content).toBe("Hello World!");
    });
  });

  describe("工具调用流程", () => {
    it("LLM 返回 tool_calls 后应执行工具并继续循环", async () => {
      const session = createSession();
      const callbacks = createMockCallbacks();

      const toolCall: ToolCall = {
        id: "tc_1",
        function: { name: "list_characters", arguments: "{}" },
      };

      let callCount = 0;
      mockGenerateTextStream.mockImplementation(async (_prompt, options) => {
        callCount++;
        if (callCount === 1) {
          options?.onChunk({ delta: "正在查询...", toolCalls: [toolCall], finishReason: "tool_calls" });
          return mockStreamSuccess("正在查询...");
        }
        options?.onChunk({ delta: "查询完成", finishReason: "stop" });
        return mockStreamSuccess("查询完成");
      });

      mockExecute.mockResolvedValue({
        success: true,
        data: { characters: [] },
        duration: 10,
      });

      const loop = new AgentLoop(session, callbacks, { maxIterations: 5 });
      await loop.run("查询所有角色");

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ id: "tc_1" }),
        expect.any(Object),
      );
      expect(callbacks.onToolCall).toHaveBeenCalledWith(toolCall);
      expect(callbacks.onToolResult).toHaveBeenCalledWith("tc_1", expect.objectContaining({ success: true }));
    });

    it("工具执行失败不应中断循环", async () => {
      const session = createSession();
      const callbacks = createMockCallbacks();

      const toolCall: ToolCall = {
        id: "tc_fail",
        function: { name: "bad_tool", arguments: "{}" },
      };

      let callCount = 0;
      mockGenerateTextStream.mockImplementation(async (_prompt, options) => {
        callCount++;
        if (callCount === 1) {
          options?.onChunk({ toolCalls: [toolCall], finishReason: "tool_calls" });
          return mockStreamSuccess("");
        }
        options?.onChunk({ delta: "抱歉，工具失败了", finishReason: "stop" });
        return mockStreamSuccess("抱歉");
      });

      mockExecute.mockResolvedValue({
        success: false,
        error: "工具不存在",
        duration: 5,
      });

      const loop = new AgentLoop(session, callbacks, { maxIterations: 5 });
      await loop.run("test");

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(callbacks.onToolResult).toHaveBeenCalledWith(
        "tc_fail",
        expect.objectContaining({ success: false }),
      );
    });
  });

  describe("LLM 失败处理", () => {
    it("generateTextStream 返回 success=false 时应调用 onError", async () => {
      const session = createSession();
      const callbacks = createMockCallbacks();

      mockGenerateTextStream.mockResolvedValue({
        success: false,
        error: "API timeout",
      });

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 });
      await loop.run("test");

      expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("generateTextStream 抛异常时应调用 onError", async () => {
      const session = createSession();
      const callbacks = createMockCallbacks();

      mockGenerateTextStream.mockRejectedValue(new Error("Network error"));

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 });
      await loop.run("test");

      expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("最大循环次数", () => {
    it("达到 maxIterations 时应自动停止", async () => {
      const session = createSession();
      const callbacks = createMockCallbacks();

      // 每次都返回 tool_calls，永不 stop
      mockGenerateTextStream.mockImplementation(async (_prompt, options) => {
        options?.onChunk({
          toolCalls: [{ id: `tc_${Date.now()}`, function: { name: "loop", arguments: "{}" } }],
          finishReason: "tool_calls",
        });
        return mockStreamSuccess("");
      });

      mockExecute.mockResolvedValue({ success: true, data: {}, duration: 1 });

      const loop = new AgentLoop(session, callbacks, { maxIterations: 2 });
      await loop.run("test");

      // 应该调用 2 次 LLM（maxIterations=2）
      expect(mockGenerateTextStream).toHaveBeenCalledTimes(2);
    });
  });

  describe("增量工具调用合并", () => {
    it("流式分块返回的 toolCalls 应按 id 合并", async () => {
      const session = createSession();
      const callbacks = createMockCallbacks();

      let callCount = 0;
      mockGenerateTextStream.mockImplementation(async (_prompt, options) => {
        callCount++;
        if (callCount === 1) {
          // 第一块：只有 id 和 name
          options?.onChunk({
            delta: "",
            toolCalls: [{ id: "tc_1", function: { name: "search", arguments: "" } }],
          });
          // 第二块：arguments 增量
          options?.onChunk({
            delta: "",
            toolCalls: [{ id: "tc_1", function: { name: "", arguments: '{"q":"test"}' } }],
          });
          options?.onChunk({ finishReason: "tool_calls" });
          return mockStreamSuccess("");
        }
        // 第二轮：返回 stop 结束循环
        options?.onChunk({ delta: "done", finishReason: "stop" });
        return mockStreamSuccess("done");
      });

      mockExecute.mockResolvedValue({ success: true, data: {}, duration: 1 });

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 });
      await loop.run("test");

      // 验证工具被调用，且参数合并正确
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const executedCall = mockExecute.mock.calls[0]?.[0] as ToolCall;
      expect(executedCall.function.name).toBe("search");
      expect(executedCall.function.arguments).toBe('{"q":"test"}');
    });
  });

  describe("abort", () => {
    it("abort() 后应停止循环", async () => {
      const session = createSession();
      const callbacks = createMockCallbacks();

      mockGenerateTextStream.mockImplementation(async (_prompt, options) => {
        options?.onChunk({ delta: "thinking...", finishReason: "stop" });
        return mockStreamSuccess("thinking...");
      });

      const loop = new AgentLoop(session, callbacks, { maxIterations: 3 });
      loop.abort();
      await loop.run("test");

      // abort 后应立即返回，不调用 LLM
      expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
