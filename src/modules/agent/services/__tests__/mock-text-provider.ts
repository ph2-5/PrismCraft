/**
 * E2E 端到端测试 - MockTextProvider
 *
 * 智能模拟 LLM 的流式响应，根据用户输入匹配预设场景。
 *
 * 工作方式：
 * 1. 预设多个"场景"（scenario），每个场景包含匹配关键词和响应剧本
 * 2. 响应剧本是一个 StreamChunk 数组，模拟真实 LLM 的流式输出
 *    （delta 文本 + tool_calls + finishReason）
 * 3. generateChat 被调用时，根据 messages 中最后一条 user 消息匹配场景
 * 4. 逐块通过 onChunk 回调返回，模拟流式推理
 *
 * 场景设计覆盖 P0-P5：
 * - "创建角色"：触发 create_character + generate_character_image（P0 并行）
 * - "配置 API"：触发 configure_api_provider（P4 委派 api-configurator）
 * - "搜索素材"：触发 search_web_images（P3 插件工具）
 * - "列表查询"：触发 list_characters（简单查询，无工具调用）
 * - "委派专家"：触发 delegate_to_specialist（P4 多 Agent 编排）
 */

import type { ITextProvider, StreamChunk, ToolDef } from "@/domain/ports/ai-provider-port";
import type { LLMMessage } from "@/domain/schemas/llm-message";
import type { ApiResponse } from "@/domain/schemas/api";

/** 场景定义 */
export interface Scenario {
  /** 场景名称 */
  name: string;
  /** 匹配关键词（用户消息包含任一关键词即匹配） */
  keywords: string[];
  /**
   * 响应剧本：StreamChunk 数组
   *
   * 模拟 LLM 的流式输出序列：
   * - { delta: "文本" } → 文本输出
   * - { toolCalls: [...] } → 工具调用
   * - { finishReason: "tool_calls" | "stop" } → 结束
   *
   * 多轮场景可设置 turn 字段，第 N 次调用返回第 N 轮的剧本。
   */
  turns: StreamChunk[][];
}

/** 默认场景库 */
export const DEFAULT_SCENARIOS: Scenario[] = [
  {
    name: "create-character",
    keywords: ["创建角色", "新建角色", "生成角色"],
    turns: [
      // 第 1 轮：调用 create_character
      [
        { delta: "好的，我来帮你创建一个角色。" },
        {
          delta: "",
          toolCalls: [
            {
              id: "tc-create-1",
              function: {
                name: "create_character",
                arguments: JSON.stringify({
                  name: "赛博战士",
                  description: "赛博朋克风格的战士角色",
                  style: "cyberpunk",
                }),
              },
            },
          ],
        },
        { delta: "", finishReason: "tool_calls" },
      ],
      // 第 2 轮：调用 generate_character_image + list_scenes（P0 并行）
      [
        { delta: "角色创建成功，现在为你生成图片。" },
        {
          delta: "",
          toolCalls: [
            {
              id: "tc-gen-img",
              function: {
                name: "generate_character_image",
                arguments: JSON.stringify({
                  characterId: "char-1",
                  style: "cyberpunk",
                }),
              },
            },
            {
              id: "tc-list-scenes",
              function: {
                name: "list_scenes",
                arguments: JSON.stringify({}),
              },
            },
          ],
        },
        { delta: "", finishReason: "tool_calls" },
      ],
      // 第 3 轮：总结
      [
        { delta: "角色「赛博战士」已创建完成，图片也已生成。共找到 3 个可用场景。" },
        { delta: "", finishReason: "stop" },
      ],
    ],
  },
  {
    name: "list-query",
    keywords: ["列表", "列出", "查询所有", "有哪些"],
    turns: [
      [
        { delta: "好的，我来查询。" },
        {
          delta: "",
          toolCalls: [
            {
              id: "tc-list-1",
              function: {
                name: "list_characters",
                arguments: JSON.stringify({ limit: 20 }),
              },
            },
          ],
        },
        { delta: "", finishReason: "tool_calls" },
      ],
      [
        { delta: "查询完成，共找到 5 个角色。" },
        { delta: "", finishReason: "stop" },
      ],
    ],
  },
  {
    name: "delegate-specialist",
    keywords: ["委派", "专家", "delegate"],
    turns: [
      [
        { delta: "这个任务比较复杂，我委派给专家处理。" },
        {
          delta: "",
          toolCalls: [
            {
              id: "tc-delegate-1",
              function: {
                name: "delegate_to_specialist",
                arguments: JSON.stringify({
                  specialist_id: "character-creator",
                  task: "创建一个赛博朋克风格的女战士角色",
                  context: "用户偏好赛博朋克风格",
                }),
              },
            },
          ],
        },
        { delta: "", finishReason: "tool_calls" },
      ],
      [
        { delta: "专家已完成任务，角色创建成功。" },
        { delta: "", finishReason: "stop" },
      ],
    ],
  },
  {
    name: "simple-chat",
    keywords: ["你好", "hello", "hi"],
    turns: [
      [
        { delta: "你好！我是 AI 动画工作室的助手，有什么可以帮你的？" },
        { delta: "", finishReason: "stop" },
      ],
    ],
  },
  {
    name: "configure-api",
    keywords: ["配置", "api", "key", "provider"],
    turns: [
      [
        { delta: "好的，我来帮你配置 API provider。" },
        {
          delta: "",
          toolCalls: [
            {
              id: "tc-config-1",
              function: {
                name: "configure_api_provider",
                arguments: JSON.stringify({
                  apiKey: "sk-test-key",
                  vendor: "openai",
                }),
              },
            },
          ],
        },
        { delta: "", finishReason: "tool_calls" },
      ],
      [
        { delta: "API 配置完成，已验证连接成功。" },
        { delta: "", finishReason: "stop" },
      ],
    ],
  },
];

/** Mock 文本生成 Provider */
export class MockTextProvider implements ITextProvider {
  private scenarios: Scenario[];
  private turnIndex = new Map<string, number>();
  /** 记录所有 generateChat 调用的 messages（用于断言） */
  public chatCalls: LLMMessage[][] = [];
  /** 记录所有传入的 tools 参数 */
  public toolDefsPassed: ToolDef[][] = [];

  constructor(scenarios: Scenario[] = DEFAULT_SCENARIOS) {
    this.scenarios = scenarios;
  }

  /** 匹配场景 */
  private matchScenario(userMessage: string): Scenario | null {
    for (const scenario of this.scenarios) {
      if (scenario.keywords.some((kw) => userMessage.toLowerCase().includes(kw.toLowerCase()))) {
        return scenario;
      }
    }
    return null;
  }

  /** 从 messages 中提取最后一条 user 消息 */
  private getLastUserMessage(messages: LLMMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === "user") {
        return messages[i]!.content ?? "";
      }
    }
    return "";
  }

  /** generateText（非流式，E2E 不使用，返回简单文本） */
  async generateText(
    prompt: string,
    _options?: {
      maxTokens?: number;
      temperature?: number;
      providerId?: string;
      modelId?: string;
    },
  ): Promise<ApiResponse<{ text: string }>> {
    return {
      success: true,
      data: { text: `[Mock] ${prompt.slice(0, 100)}` },
    };
  }

  /** generateTextStream（降级路径，简单返回） */
  async generateTextStream(
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      providerId?: string;
      modelId?: string;
      tools?: ToolDef[];
      onChunk: (chunk: StreamChunk) => void;
      signal?: AbortSignal;
    },
  ): Promise<ApiResponse<{ text: string }>> {
    const chunks: string[] = [];
    // 简单返回文本
    const response = `[Mock Stream] ${prompt.slice(0, 100)}`;
    options?.onChunk({ delta: response });
    chunks.push(response);
    options?.onChunk({ delta: "", finishReason: "stop" });
    return { success: true, data: { text: chunks.join("") } };
  }

  /** generateChat（主要被测方法） */
  async generateChat(
    messages: LLMMessage[],
    options?: {
      maxTokens?: number;
      temperature?: number;
      providerId?: string;
      modelId?: string;
      tools?: ToolDef[];
      onChunk?: (chunk: StreamChunk) => void;
      signal?: AbortSignal;
    },
  ): Promise<ApiResponse<{ text: string }>> {
    // 记录调用
    this.chatCalls.push(messages);
    if (options?.tools) {
      this.toolDefsPassed.push(options.tools);
    }

    // 检查取消
    if (options?.signal?.aborted) {
      return { success: false, error: "已取消" };
    }

    const userMessage = this.getLastUserMessage(messages);
    const scenario = this.matchScenario(userMessage);

    if (!scenario) {
      // 无匹配场景，返回默认文本
      const defaultResponse = `我理解了你的需求：「${userMessage.slice(0, 50)}」`;
      options?.onChunk?.({ delta: defaultResponse });
      options?.onChunk?.({ delta: "", finishReason: "stop" });
      return { success: true, data: { text: defaultResponse } };
    }

    // 获取当前轮次
    const currentTurn = this.turnIndex.get(scenario.name) ?? 0;
    const turn = scenario.turns[currentTurn] ?? scenario.turns[scenario.turns.length - 1];
    this.turnIndex.set(scenario.name, currentTurn + 1);

    // 逐块返回（模拟流式）
    let fullText = "";
    for (const chunk of turn) {
      if (options?.signal?.aborted) break;
      if (chunk.delta) {
        fullText += chunk.delta;
      }
      options?.onChunk?.(chunk);
    }

    return { success: true, data: { text: fullText } };
  }

  /** 重置场景轮次（每个测试用例前调用） */
  reset(): void {
    this.turnIndex.clear();
    this.chatCalls = [];
    this.toolDefsPassed = [];
  }
}
