/**
 * E2E 端到端测试 - MockToolRegistry + MockToolExecutor
 *
 * 模拟工具注册表和执行器，让 AgentLoop 能调用预设的 mock 工具。
 *
 * 设计要点：
 * - MockToolRegistry 实现 IToolRegistry 接口，返回预设的 ToolImpl
 * - MockToolExecutor 实现 IToolExecutor 接口，返回预设的 ToolResult
 * - 工具执行结果按工具名匹配，支持自定义结果
 * - 记录所有工具调用（用于断言 P0 并行执行、P4 委派等）
 */

import type { ToolCall, ToolDef, ToolResult, ToolContext } from "../../domain/types";
import type { IToolRegistry, IToolExecutor } from "../../domain/ports";
import type { ToolImpl } from "../../domain/types";

/** Mock 工具注册表 */
export class MockToolRegistry implements IToolRegistry {
  private tools = new Map<string, ToolImpl>();

  register(name: string, tool: ToolImpl): void {
    this.tools.set(name, tool);
  }

  registerSimple(name: string, domain: ToolImpl["domain"] = "asset"): void {
    this.tools.set(name, {
      def: {
        type: "function",
        function: {
          name,
          description: `Mock tool: ${name}`,
          parameters: { type: "object", properties: {} },
        },
      },
      domain,
      async execute() {
        return { success: true, data: { mocked: true, name }, duration: 0 };
      },
    });
  }

  get(name: string): ToolImpl | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  getToolDefs(_enabledTools?: string[]): ToolDef[] {
    return Array.from(this.tools.values()).map((t) => t.def);
  }

  getByDomain(_domain: ToolImpl["domain"]): ToolImpl[] {
    return Array.from(this.tools.values());
  }

  getAllNames(): string[] {
    return Array.from(this.tools.keys());
  }

  size(): number {
    return this.tools.size;
  }

  clear(): void {
    this.tools.clear();
  }

  getToolDescriptions(_enabledTools?: string[]): Array<{ name: string; description: string; domain: ToolImpl["domain"] }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.def.function.name,
      description: t.def.function.description,
      domain: t.domain,
    }));
  }
}

/** Mock 工具执行器 */
export class MockToolExecutor implements IToolExecutor {
  /** 工具名 → 预设结果 */
  private results = new Map<string, ToolResult>();
  /** 记录所有执行调用（用于断言） */
  public executeCalls: Array<{ toolCall: ToolCall; ctx: ToolContext }> = [];
  /** 记录所有 executeAll 调用的批次（用于断言 P0 并行） */
  public executeAllBatches: ToolCall[][] = [];

  /** 设置工具的预设结果 */
  setResult(toolName: string, result: Partial<ToolResult>): void {
    this.results.set(toolName, {
      success: true,
      data: {},
      duration: 10,
      ...result,
    });
  }

  async execute(toolCall: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    this.executeCalls.push({ toolCall, ctx });
    const result = this.results.get(toolCall.function.name);
    if (result) return { ...result };
    // 默认结果
    return {
      success: true,
      data: { mocked: true, tool: toolCall.function.name },
      duration: 5,
    };
  }

  async executeAll(toolCalls: ToolCall[], ctx: ToolContext): Promise<Array<{ toolCall: ToolCall; result: ToolResult }>> {
    this.executeAllBatches.push(toolCalls);
    return Promise.all(
      toolCalls.map(async (tc) => ({
        toolCall: tc,
        result: await this.execute(tc, ctx),
      })),
    );
  }

  requiresConfirmation(_toolCall: ToolCall): boolean {
    return false;
  }

  /** 重置（每个测试用例前调用） */
  reset(): void {
    this.results.clear();
    this.executeCalls = [];
    this.executeAllBatches = [];
  }
}

/**
 * 注册 E2E 测试需要的 mock 工具
 *
 * 覆盖场景中用到的所有工具名：
 * - create_character / generate_character_image / list_scenes
 * - list_characters
 * - configure_api_provider
 * - delegate_to_specialist / list_specialists
 */
export function setupMockTools(
  registry: MockToolRegistry,
  executor: MockToolExecutor,
): void {
  const toolNames = [
    "create_character",
    "generate_character_image",
    "list_scenes",
    "list_characters",
    "configure_api_provider",
    "delegate_to_specialist",
    "list_specialists",
  ];

  for (const name of toolNames) {
    registry.registerSimple(name);
  }

  // 预设工具结果
  executor.setResult("create_character", {
    success: true,
    data: { id: "char-1", name: "赛博战士" },
    duration: 100,
  });
  executor.setResult("generate_character_image", {
    success: true,
    data: { imageUrl: "https://example.com/char-1.png" },
    duration: 5000,
  });
  executor.setResult("list_scenes", {
    success: true,
    data: { scenes: ["scene-1", "scene-2", "scene-3"] },
    duration: 50,
  });
  executor.setResult("list_characters", {
    success: true,
    data: { characters: ["char-1", "char-2", "char-3", "char-4", "char-5"] },
    duration: 50,
  });
  executor.setResult("configure_api_provider", {
    success: true,
    data: { configured: true, vendor: "openai" },
    duration: 1000,
  });
  executor.setResult("delegate_to_specialist", {
    success: true,
    data: {
      specialist: "角色创建专家",
      specialistId: "character-creator",
      task: "创建一个赛博朋克风格的女战士角色",
      result: "角色「赛博女战士」已创建，图片已生成。",
      toolCallsCount: 2,
      duration: 30000,
    },
    duration: 30000,
  });
}
