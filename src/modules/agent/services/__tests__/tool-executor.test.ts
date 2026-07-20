import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ToolImpl, ToolContext } from "../../domain/types";
import type { ToolCall } from "@/domain/ports/ai-provider-port";
import { toolRegistry } from "../tool-registry";
import { toolExecutor, TOOL_TIMEOUTS } from "../tool-executor";

function makeTool(
  name: string,
  opts?: {
    execute?: ToolImpl["execute"];
    timeoutMs?: number;
    requiresConfirmation?: boolean;
  },
): ToolImpl {
  return {
    def: {
      type: "function",
      function: {
        name,
        description: `Test tool ${name}`,
        parameters: { type: "object", properties: {} },
      },
    },
    domain: "system",
    timeoutMs: opts?.timeoutMs ?? TOOL_TIMEOUTS.query,
    requiresConfirmation: opts?.requiresConfirmation,
    execute:
      opts?.execute ?? (async () => ({ success: true, data: { name } })),
  };
}

function makeToolCall(name: string, args?: Record<string, unknown>): ToolCall {
  return {
    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    function: {
      name,
      arguments: args ? JSON.stringify(args) : "{}",
    },
  };
}

function makeCtx(): ToolContext {
  return { sessionId: "test-session" };
}

describe("ToolExecutor", () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("execute", () => {
    it("正常执行应返回 success=true、正确 data 及数字 duration", async () => {
      const tool = makeTool("normal_tool", {
        execute: async () => ({ success: true, data: { value: 42 } }),
      });
      toolRegistry.register(tool);

      const result = await toolExecutor.execute(
        makeToolCall("normal_tool"),
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 42 });
      expect(typeof result.duration).toBe("number");
      expect(result.duration!).toBeGreaterThanOrEqual(0);
    });

    it("未知工具应返回 success=false 且 error 包含'未知工具'", async () => {
      const result = await toolExecutor.execute(
        makeToolCall("nonexistent_tool"),
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("未知工具");
      expect(result.error).toContain("nonexistent_tool");
    });

    it("参数解析失败应返回 success=false 且 error 包含'参数解析失败'", async () => {
      const tool = makeTool("parse_tool");
      toolRegistry.register(tool);

      const toolCall: ToolCall = {
        id: "call_invalid_args",
        function: {
          name: "parse_tool",
          arguments: "{invalid json}",
        },
      };

      const result = await toolExecutor.execute(toolCall, makeCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain("参数解析失败");
    });

    it("工具抛异常应返回 success=false 且 error 包含错误消息", async () => {
      const tool = makeTool("throwing_tool", {
        execute: async () => {
          throw new Error("tool execution failed");
        },
      });
      toolRegistry.register(tool);

      const result = await toolExecutor.execute(
        makeToolCall("throwing_tool"),
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("tool execution failed");
    });

    it("超时应返回 success=false 且 error 包含'超时'或'取消'", async () => {
      vi.useFakeTimers();

      const slowTool = makeTool("slow_tool", {
        timeoutMs: 50,
        execute: async (_args, ctx) => {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve({ success: true, data: "completed" });
            }, 200);
            ctx.signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new Error("aborted by signal"));
              },
              { once: true },
            );
          });
        },
      });
      toolRegistry.register(slowTool);

      const promise = toolExecutor.execute(makeToolCall("slow_tool"), makeCtx());
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/超时|取消/);
      expect(typeof result.duration).toBe("number");
    });

    it("已 aborted 的 signal 应立即返回 success=false 且 error 包含'取消'", async () => {
      const executeFn = vi.fn(async () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: "done" }), 500);
        });
      });
      const tool = makeTool("abortable_tool", { execute: executeFn as never });
      toolRegistry.register(tool);

      const controller = new AbortController();
      controller.abort();
      const ctx: ToolContext = { ...makeCtx(), signal: controller.signal };

      const result = await toolExecutor.execute(
        makeToolCall("abortable_tool"),
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("取消");
      expect(executeFn).not.toHaveBeenCalled();
    });
  });

  describe("executeAll", () => {
    it("批量执行应返回与输入顺序一致的结果列表", async () => {
      toolRegistry.register(
        makeTool("tool_a", {
          execute: async () => ({ success: true, data: "A" }),
        }),
      );
      toolRegistry.register(
        makeTool("tool_b", {
          execute: async () => ({ success: true, data: "B" }),
        }),
      );
      toolRegistry.register(
        makeTool("tool_c", {
          execute: async () => ({ success: true, data: "C" }),
        }),
      );

      const calls = [
        makeToolCall("tool_a"),
        makeToolCall("tool_b"),
        makeToolCall("tool_c"),
      ];

      const results = await toolExecutor.executeAll(calls, makeCtx());

      expect(results).toHaveLength(3);
      expect(results[0].result.data).toBe("A");
      expect(results[1].result.data).toBe("B");
      expect(results[2].result.data).toBe("C");
      expect(results[0].toolCall).toBe(calls[0]);
      expect(results[1].toolCall).toBe(calls[1]);
      expect(results[2].toolCall).toBe(calls[2]);
    });
  });

  describe("requiresConfirmation", () => {
    it("requiresConfirmation=true 的工具应返回 true", () => {
      toolRegistry.register(
        makeTool("dangerous_tool", { requiresConfirmation: true }),
      );

      expect(
        toolExecutor.requiresConfirmation(makeToolCall("dangerous_tool")),
      ).toBe(true);
    });

    it("未设置 requiresConfirmation 的工具应返回 false", () => {
      toolRegistry.register(makeTool("safe_tool"));

      expect(
        toolExecutor.requiresConfirmation(makeToolCall("safe_tool")),
      ).toBe(false);
    });
  });
});
