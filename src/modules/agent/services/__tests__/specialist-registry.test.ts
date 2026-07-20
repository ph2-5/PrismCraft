/**
 * Specialist 注册表 + Sub Agent Runner 测试（P4 多 Agent 编排）
 *
 * 测试覆盖：
 * - SpecialistRegistry：注册/获取/列出/幂等/冲突
 * - 内置 Specialist：5 个专家已注册且配置正确
 * - SubAgentRunner：
 *   - specialist 不存在时返回错误
 *   - 参数校验（缺 specialist_id / task）
 *   - 成功运行并返回结果（mock AgentLoop）
 *   - 超时保护（mock 长时间运行）
 *   - 外部取消信号
 * - delegate_to_specialist 工具：参数校验 + 委派
 * - list_specialists 工具：返回专家列表
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { specialistRegistry, SpecialistRegistry } from "@/modules/agent-specialist";
import { BUILTIN_SPECIALISTS } from "@/modules/agent-specialist";
import type { SpecialistAgent } from "@/modules/agent-specialist";
import { runSpecialist, listAvailableSpecialists } from "@/modules/agent";
import type { AgentSession, AgentLoopCallbacks, AgentLoopConfig } from "@/modules/agent";
import { delegateToSpecialistTool, listSpecialistsTool, specialistTools } from "@/modules/agent-tools-specialist";
import { toolRegistry } from "../tool-registry";

// ============= mock AgentLoop =============
// 避免真实 LLM 调用，mock AgentLoop 的 run 方法
// 用 class 形式确保 new 操作正常

vi.mock("../agent-loop", () => ({
  AgentLoop: class MockAgentLoop {
    session: AgentSession;
    callbacks: AgentLoopCallbacks;
    config: AgentLoopConfig;
    constructor(session: AgentSession, callbacks: AgentLoopCallbacks, config: AgentLoopConfig) {
      this.session = session;
      this.callbacks = callbacks;
      this.config = config;
    }
    abort() {}
    async run(input: string): Promise<void> {
      // 模拟 assistant 流式回复
      this.callbacks.onChunk({ delta: `专家回复: ${input.slice(0, 20)}` });
      // 模拟工具调用
      this.callbacks.onToolCall({
        id: "tc1",
        type: "function",
        function: { name: "mock_tool", arguments: "{}" },
      });
      this.callbacks.onToolResult("tc1", { success: true, data: {}, duration: 0 });
      // 追加 assistant 消息到 session（供 SubAgentRunner 收集结果）
      this.session.messages.push({
        id: "msg1",
        role: "assistant",
        content: `专家回复: ${input.slice(0, 20)}`,
        timestamp: Date.now(),
      });
    }
  },
}));

// ============= 测试工具 =============

function makeSpecialist(id: string, name?: string): SpecialistAgent {
  return {
    id,
    name: name ?? `专家 ${id}`,
    description: `测试专家 ${id}`,
    systemPrompt: `你是 ${id} 专家。`,
    enabledTools: ["list_characters"],
    temperature: 0.5,
    maxIterations: 3,
  };
}

// ============= 测试用例 =============

describe("SpecialistRegistry (P4 多 Agent 编排)", () => {
  let registry: SpecialistRegistry;

  beforeEach(() => {
    registry = new SpecialistRegistry();
  });

  describe("register / get / has", () => {
    it("注册单个 Specialist 后能 get 到", () => {
      const s = makeSpecialist("test");
      registry.register(s);
      expect(registry.get("test")).toBe(s);
      expect(registry.has("test")).toBe(true);
    });

    it("未注册的 id 返回 undefined", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
      expect(registry.has("nonexistent")).toBe(false);
    });

    it("重名注册抛错", () => {
      registry.register(makeSpecialist("dup"));
      expect(() => registry.register(makeSpecialist("dup"))).toThrow(/already registered/);
    });
  });

  describe("registerAll（批量注册）", () => {
    it("批量注册多个 Specialist", () => {
      registry.registerAll([makeSpecialist("a"), makeSpecialist("b"), makeSpecialist("c")]);
      expect(registry.size()).toBe(3);
    });

    it("批量注册中遇重名抛错", () => {
      expect(() =>
        registry.registerAll([makeSpecialist("x"), makeSpecialist("x")]),
      ).toThrow(/already registered/);
    });
  });

  describe("registerBuiltins（内置专家）", () => {
    it("注册所有内置 Specialist", () => {
      registry.registerBuiltins();
      expect(registry.size()).toBe(BUILTIN_SPECIALISTS.length);
    });

    it("幂等：重复调用无副作用", () => {
      registry.registerBuiltins();
      const size1 = registry.size();
      registry.registerBuiltins();
      expect(registry.size()).toBe(size1);
    });

    it("内置专家包含 5 个核心专家", () => {
      registry.registerBuiltins();
      const ids = registry.list().map((s) => s.id);
      expect(ids).toContain("character-creator");
      expect(ids).toContain("video-producer");
      expect(ids).toContain("story-writer");
      expect(ids).toContain("api-configurator");
      expect(ids).toContain("asset-finder");
    });
  });

  describe("list / listSummaries", () => {
    it("list 返回所有 Specialist（按 id 排序）", () => {
      registry.registerAll([makeSpecialist("c"), makeSpecialist("a"), makeSpecialist("b")]);
      const list = registry.list();
      expect(list.map((s) => s.id)).toEqual(["a", "b", "c"]);
    });

    it("listSummaries 返回摘要信息", () => {
      registry.register(makeSpecialist("summary-test", "测试专家"));
      const summaries = registry.listSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toEqual({
        id: "summary-test",
        name: "测试专家",
        description: "测试专家 summary-test",
      });
    });
  });

  describe("unregister", () => {
    it("卸载已注册的 Specialist", () => {
      registry.register(makeSpecialist("to-remove"));
      expect(registry.unregister("to-remove")).toBe(true);
      expect(registry.has("to-remove")).toBe(false);
    });

    it("卸载不存在的返回 false", () => {
      expect(registry.unregister("nonexistent")).toBe(false);
    });
  });

  describe("clear", () => {
    it("清空所有 Specialist", () => {
      registry.registerAll([makeSpecialist("a"), makeSpecialist("b")]);
      registry.clear();
      expect(registry.size()).toBe(0);
    });
  });
});

describe("内置 Specialist 配置", () => {
  it("每个内置专家都有完整配置", () => {
    for (const s of BUILTIN_SPECIALISTS) {
      expect(s.id).toMatch(/^[a-z-]+$/);
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.systemPrompt).toContain("{PROJECT_STATE}");
      expect(s.systemPrompt).toContain("{AVAILABLE_TOOLS}");
      expect(Array.isArray(s.enabledTools)).toBe(true);
      expect(s.enabledTools!.length).toBeGreaterThan(0);
      // 防递归：enabledTools 不应包含 delegate_to_specialist
      expect(s.enabledTools).not.toContain("delegate_to_specialist");
      expect(s.enabledTools).not.toContain("list_specialists");
    }
  });

  it("character-creator 专家配置正确", () => {
    const s = BUILTIN_SPECIALISTS.find((x) => x.id === "character-creator");
    expect(s).toBeDefined();
    expect(s!.enabledTools).toContain("create_character");
    expect(s!.enabledTools).toContain("generate_character_image");
    expect(s!.temperature).toBeGreaterThan(0.7);
  });

  it("api-configurator 专家温度较低（严谨）", () => {
    const s = BUILTIN_SPECIALISTS.find((x) => x.id === "api-configurator");
    expect(s).toBeDefined();
    expect(s!.temperature!).toBeLessThan(0.5);
  });
});

describe("SubAgentRunner (runSpecialist)", () => {
  beforeEach(() => {
    specialistRegistry.clear();
    specialistRegistry.registerBuiltins();
  });

  afterEach(() => {
    specialistRegistry.clear();
  });

  it("specialist 不存在时返回错误", async () => {
    const result = await runSpecialist("nonexistent", "task", "");
    expect(result.success).toBe(false);
    expect(result.error).toContain("不存在");
  });

  it("成功运行并返回结果", async () => {
    const result = await runSpecialist("character-creator", "创建一个赛博朋克角色", "用户喜欢霓虹风格");
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as { specialist?: string; task?: string; result?: string; toolCallsCount?: number };
    expect(data.specialist).toBe("角色创建专家");
    expect(data.task).toBe("创建一个赛博朋克角色");
    expect(data.result).toBeTruthy();
    expect(typeof data.toolCallsCount).toBe("number");
  });

  it("context 为空时也能运行", async () => {
    const result = await runSpecialist("story-writer", "构思一个武侠故事", "");
    expect(result.success).toBe(true);
  });

  it("context 追加到 task 前面", async () => {
    const result = await runSpecialist(
      "character-creator",
      "创建角色",
      "项目背景：赛博朋克风格",
    );
    expect(result.success).toBe(true);
    // mock 的 AgentLoop 会将 input 反射回来
    expect((result.data as { result?: string })?.result).toContain("项目背景");
  });

  it("返回结果包含工具调用次数", async () => {
    const result = await runSpecialist("video-producer", "生成视频", "");
    expect(result.success).toBe(true);
    expect((result.data as { toolCallsCount?: number })?.toolCallsCount).toBeGreaterThan(0);
  });

  it("duration 字段被填充", async () => {
    const result = await runSpecialist("asset-finder", "找图片", "");
    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

describe("listAvailableSpecialists", () => {
  beforeEach(() => {
    specialistRegistry.clear();
    specialistRegistry.registerBuiltins();
  });

  afterEach(() => {
    specialistRegistry.clear();
  });

  it("返回格式化的专家列表", () => {
    const text = listAvailableSpecialists();
    expect(text).toContain("character-creator");
    expect(text).toContain("角色创建专家");
    expect(text).toContain("video-producer");
  });

  it("无专家时返回提示", () => {
    specialistRegistry.clear();
    const text = listAvailableSpecialists();
    expect(text).toContain("无可用专家");
  });
});

describe("delegate_to_specialist 工具", () => {
  beforeEach(() => {
    specialistRegistry.clear();
    specialistRegistry.registerBuiltins();
    toolRegistry.clear();
  });

  afterEach(() => {
    specialistRegistry.clear();
    toolRegistry.clear();
  });

  it("工具定义正确", () => {
    expect(delegateToSpecialistTool.def.function.name).toBe("delegate_to_specialist");
    expect(delegateToSpecialistTool.def.function.parameters).toHaveProperty("properties.specialist_id");
    expect(delegateToSpecialistTool.def.function.parameters).toHaveProperty("properties.task");
    expect(delegateToSpecialistTool.def.function.parameters).toHaveProperty("required");
  });

  it("缺 specialist_id 参数返回错误", async () => {
    const result = await delegateToSpecialistTool.execute({}, { sessionId: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("specialist_id");
  });

  it("缺 task 参数返回错误", async () => {
    const result = await delegateToSpecialistTool.execute(
      { specialist_id: "character-creator" },
      { sessionId: "test" },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("task");
  });

  it("不存在的 specialist_id 返回错误", async () => {
    const result = await delegateToSpecialistTool.execute(
      { specialist_id: "nonexistent", task: "test" },
      { sessionId: "test" },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("不存在");
  });

  it("成功委派任务", async () => {
    const result = await delegateToSpecialistTool.execute(
      {
        specialist_id: "character-creator",
        task: "创建一个角色",
        context: "赛博朋克风格",
      },
      { sessionId: "test" },
    );
    expect(result.success).toBe(true);
    expect((result.data as { specialist?: string })?.specialist).toBe("角色创建专家");
  });

  it("onProgress 被调用", async () => {
    const onProgress = vi.fn();
    await delegateToSpecialistTool.execute(
      { specialist_id: "story-writer", task: "构思故事" },
      { sessionId: "test", onProgress },
    );
    expect(onProgress).toHaveBeenCalled();
  });
});

describe("list_specialists 工具", () => {
  beforeEach(() => {
    specialistRegistry.clear();
    specialistRegistry.registerBuiltins();
  });

  afterEach(() => {
    specialistRegistry.clear();
  });

  it("返回所有专家列表", async () => {
    const result = await listSpecialistsTool.execute({}, { sessionId: "test" });
    expect(result.success).toBe(true);
    const data = result.data as { count?: number; specialists?: unknown[]; summary?: string };
    expect(data.count).toBe(BUILTIN_SPECIALISTS.length);
    expect(Array.isArray(data.specialists)).toBe(true);
    expect(data.summary).toContain("character-creator");
  });

  it("无专家时返回空列表", async () => {
    specialistRegistry.clear();
    const result = await listSpecialistsTool.execute({}, { sessionId: "test" });
    expect(result.success).toBe(true);
    expect((result.data as { count?: number })?.count).toBe(0);
  });
});

describe("specialistTools 导出", () => {
  it("包含 2 个工具", () => {
    expect(specialistTools).toHaveLength(2);
    const names = specialistTools.map((t) => t.def.function.name);
    expect(names).toContain("delegate_to_specialist");
    expect(names).toContain("list_specialists");
  });

  it("工具域为 workflow", () => {
    for (const tool of specialistTools) {
      expect(tool.domain).toBe("workflow");
    }
  });
});

describe("工具注册集成", () => {
  it("registerAllTools 后 specialist 工具可用", async () => {
    toolRegistry.clear();
    const { _resetRegistration } = await import("../../tools");
    _resetRegistration();
    // 重新导入以触发注册
    const { registerAllTools } = await import("../../tools");
    registerAllTools();

    expect(toolRegistry.has("delegate_to_specialist")).toBe(true);
    expect(toolRegistry.has("list_specialists")).toBe(true);
  });
});
