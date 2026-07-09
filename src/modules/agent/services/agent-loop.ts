/**
 * Agent Loop 核心
 *
 * 算法：
 * 1. 构建初始消息序列（system prompt + 历史 + 用户消息）
 * 2. 调用 generateTextStream（流式）
 * 3. onChunk：delta → 实时输出；toolCalls → 累积；finishReason → 判断结束
 * 4. finishReason="tool_calls" → 执行工具 → 结果回灌 → 重复
 * 5. finishReason="stop" → 结束
 * 6. maxIterations 限制防死循环
 *
 * 关键点：
 * - toolCalls 增量累积：OpenAI 流式返回 tool_calls 时可能只含部分字段，需按 id 合并
 * - 取消支持：通过 AbortSignal
 * - 错误恢复：LLM 失败重试一次，工具失败不中断循环
 */

import { container } from "@/infrastructure/di";
import type { ToolCall, StreamChunk } from "@/domain/ports/ai-provider-port";
import type {
  AgentSession,
  AgentLoopConfig,
  AgentLoopCallbacks,
  ToolContext,
  ToolResult,
} from "../domain/types";
import { DEFAULT_AGENT_CONFIG } from "../domain/types";
import {
  DEFAULT_SYSTEM_PROMPT,
  buildProjectStateSummary,
  buildAvailableToolsSummary,
} from "../domain/prompts";
import { conversationManager } from "./conversation-manager";
import { toolExecutor } from "./tool-executor";
import { toolRegistry } from "./tool-registry";
import { buildCoreMemoryPrompt } from "./memory-service";
import { t } from "@/shared/constants";

/** 动态查询项目状态，构建状态摘要注入 system prompt */
async function buildDynamicProjectState(): Promise<string> {
  try {
    const [characterResult, sceneResult, storyResult, allTasks, configResult] = await Promise.all([
      import("@/modules/character").then((m) => m.characterService.getAll()),
      import("@/modules/scene").then((m) => m.sceneService.getAll()),
      import("@/modules/story").then((m) => m.storyService.getAll()),
      container.videoTaskStorage.getVideoTasks(),
      import("@/shared/api-config").then((m) => m.loadConfig()),
    ]);

    const characterCount = characterResult.ok ? characterResult.value.length : 0;
    const sceneCount = sceneResult.ok ? sceneResult.value.length : 0;
    const storyCount = storyResult.ok ? storyResult.value.length : 0;
    const activeVideoTasks = allTasks.filter(
      (t) => t.status === "pending" || t.status === "generating" || t.status === "retrying",
    ).length;
    const failedVideoTasks = allTasks.filter(
      (t) => t.status === "failed" || t.status === "timeout",
    ).length;

    // 已配置的能力
    const configuredCapabilities: string[] = [];
    if (configResult) {
      const mapping = configResult.mapping ?? {};
      const caps = ["text", "image", "vision", "video"] as const;
      for (const cap of caps) {
        if (mapping[cap]) {
          configuredCapabilities.push(cap);
        }
      }
    }

    return buildProjectStateSummary({
      characterCount,
      sceneCount,
      storyCount,
      activeVideoTasks,
      failedVideoTasks,
      configuredCapabilities,
    });
  } catch {
    // 查询失败时返回最小状态，不阻断 Agent Loop
    return buildProjectStateSummary({
      characterCount: 0,
      sceneCount: 0,
      storyCount: 0,
      activeVideoTasks: 0,
      failedVideoTasks: 0,
      configuredCapabilities: [],
    });
  }
}

export class AgentLoop {
  private config: AgentLoopConfig;
  private session: AgentSession;
  private callbacks: AgentLoopCallbacks;
  private aborted = false;
  /** P1-1 修复：LLM 流式推理的 AbortController，使 abort() 能中断正在进行的流式调用 */
  private llmAbortController: AbortController | null = null;

  constructor(
    session: AgentSession,
    callbacks: AgentLoopCallbacks,
    config?: Partial<AgentLoopConfig>,
  ) {
    this.session = session;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  /** 中止循环（P1-1 修复：同时中断 LLM 流式推理） */
  abort(): void {
    this.aborted = true;
    if (this.llmAbortController) {
      this.llmAbortController.abort();
      this.llmAbortController = null;
    }
  }

  /** 运行 Agent Loop */
  async run(userInput: string): Promise<void> {
    // 1. 追加用户消息
    conversationManager.appendUserMessage(this.session, userInput);

    // 2. 构建初始 system prompt（动态注入项目状态）
    const systemPrompt = await this.buildSystemPrompt();

    // 3. Agent Loop
    for (let i = 0; i < this.config.maxIterations; i++) {
      if (this.aborted) {
        this.handleAbort();
        return;
      }

      // 构建 LLM 消息序列
      const llmMessages = conversationManager.buildLLMMessages(this.session, systemPrompt);

      // 调用 LLM（流式）
      const assistantMsg = conversationManager.startStreamingAssistant(this.session);
      const prompt = this.serializeMessages(llmMessages);
      // 累积工具调用（流式可能分多块返回）
      const accumulatedToolCalls: Map<string, ToolCall> = new Map();
      let finishReason: StreamChunk["finishReason"] | undefined;

      try {
        // P1-1 修复：为每次 LLM 流式调用创建独立 AbortController，
        // 使 abort() 能中断正在进行的流式推理（之前取消按钮在 LLM 推理期间无效）
        this.llmAbortController = new AbortController();
        const result = await container.textProvider.generateTextStream(prompt, {
          onChunk: (chunk) => {
            // delta → 实时输出
            if (chunk.delta) {
              conversationManager.appendDelta(this.session, chunk.delta);
              this.callbacks.onChunk({ delta: chunk.delta });
            }
            // toolCalls → 累积（按 id 合并增量）
            if (chunk.toolCalls) {
              for (const tc of chunk.toolCalls) {
                this.mergeToolCall(accumulatedToolCalls, tc);
              }
            }
            // finishReason
            if (chunk.finishReason) {
              finishReason = chunk.finishReason;
            }
          },
          maxTokens: this.config.maxTokensPerTurn,
          temperature: this.config.temperature,
          providerId: this.config.providerId,
          modelId: this.config.modelId,
          tools: toolRegistry.getToolDefs(this.config.enabledTools),
          signal: this.llmAbortController.signal,
        });
        this.llmAbortController = null;

        if (!result.success) {
          // LLM 调用失败
          conversationManager.finishStreaming(this.session);
          const errMsg = result.error || "LLM 调用失败";
          assistantMsg.content = assistantMsg.content || `调用失败：${errMsg}`;
          this.callbacks.onError?.(new Error(errMsg));
          return;
        }

        // 结束流式
        conversationManager.finishStreaming(this.session, finishReason);

        // 处理工具调用
        const toolCalls = Array.from(accumulatedToolCalls.values());
        if (toolCalls.length > 0) {
          conversationManager.setToolCalls(this.session, toolCalls);

          // 执行工具
          const ctx: ToolContext = {
            sessionId: this.session.id,
            signal: this.callbacks.signal,
            onProgress: (_msg) => {
              // 通知 UI（可选）
            },
          };

          for (const tc of toolCalls) {
            if (this.aborted) {
              this.handleAbort();
              return;
            }

            // 危险工具确认检查（R-P0-1 修复）：
            // requiresConfirmation=true 的工具（如 delete_file/move_file）必须经用户确认。
            // 未提供 onConfirmationRequired 回调时，安全默认拒绝执行。
            if (toolExecutor.requiresConfirmation(tc)) {
              const approved = this.callbacks.onConfirmationRequired
                ? await this.callbacks.onConfirmationRequired(tc)
                : false;
              if (!approved) {
                const cancelledResult: ToolResult = {
                  success: false,
                  error: "用户拒绝执行此操作（需要确认）",
                  duration: 0,
                };
                conversationManager.appendToolResult(this.session, tc.id, tc.function.name, cancelledResult);
                this.callbacks.onToolResult(tc.id, cancelledResult);
                continue;
              }
            }

            this.callbacks.onToolCall(tc);
            const result = await toolExecutor.execute(tc, ctx);
            conversationManager.appendToolResult(this.session, tc.id, tc.function.name, result);
            this.callbacks.onToolResult(tc.id, result);
          }

          // 继续下一轮循环
          continue;
        }

        // 无工具调用，结束循环
        return;
      } catch (e) {
        this.llmAbortController = null;
        conversationManager.finishStreaming(this.session);
        const err = e instanceof Error ? e : new Error(String(e));
        assistantMsg.content = assistantMsg.content || `发生错误：${err.message}`;
        this.callbacks.onError?.(err);
        return;
      }
    }

    // 达到最大循环次数
    const limitMsg = conversationManager.startStreamingAssistant(this.session);
    limitMsg.content = t("agent.maxIterationsReached", { count: this.config.maxIterations });
    conversationManager.finishStreaming(this.session);
    void limitMsg;
  }

  /** 合并增量工具调用（OpenAI 流式返回可能分块） */
  private mergeToolCall(acc: Map<string, ToolCall>, partial: ToolCall): void {
    const existing = acc.get(partial.id);
    if (!existing) {
      // 新的工具调用
      acc.set(partial.id, {
        id: partial.id,
        function: {
          name: partial.function.name,
          arguments: partial.function.arguments,
        },
      });
    } else {
      // 合并增量
      if (partial.function.name && !existing.function.name) {
        existing.function.name = partial.function.name;
      }
      if (partial.function.arguments) {
        existing.function.arguments += partial.function.arguments;
      }
    }
  }

  /** 构建 system prompt（动态注入项目状态 + 核心记忆） */
  private async buildSystemPrompt(): Promise<string> {
    const template = this.config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
    const toolDescs = toolRegistry.getToolDescriptions(this.config.enabledTools);
    const projectState = await buildDynamicProjectState();
    const coreMemory = await buildCoreMemoryPrompt();
    return template
      .replace("{PROJECT_STATE}", projectState)
      .replace("{CORE_MEMORY}", coreMemory || "（暂无记忆）")
      .replace("{AVAILABLE_TOOLS}", buildAvailableToolsSummary(toolDescs));
  }

  /** 序列化消息为 LLM 输入（textProvider 接收单字符串 prompt） */
  private serializeMessages(messages: Array<{ role: string; content: string; tool_calls?: unknown; tool_call_id?: string; name?: string }>): string {
    // 将消息序列化为 LLM 可理解的格式
    // 注意：当前 textProvider.generateTextStream 接收单字符串 prompt
    // 这里将历史消息序列化为结构化文本
    return messages
      .map((m) => {
        if (m.role === "system") {
          return `[系统]\n${m.content}`;
        }
        if (m.role === "user") {
          return `[用户]\n${m.content}`;
        }
        if (m.role === "assistant") {
          let text = `[助手]\n${m.content}`;
          if (m.tool_calls) {
            text += `\n[工具调用]\n${JSON.stringify(m.tool_calls)}`;
          }
          return text;
        }
        if (m.role === "tool") {
          return `[工具结果 ${m.name || ""}]\n${m.content}`;
        }
        return m.content;
      })
      .join("\n\n---\n\n");
  }

  /** 处理取消 */
  private handleAbort(): void {
    const last = this.session.messages[this.session.messages.length - 1];
    if (last && last.role === "assistant" && last.streaming) {
      last.streaming = false;
      last.content += `\n\n${t("agent.cancelled")}`;
    }
    this.callbacks.onError?.(new Error(t("agent.userCancelled")));
  }
}

/**
 * 运行 Agent Loop 的便捷函数
 */
export async function runAgentLoop(
  session: AgentSession,
  userInput: string,
  callbacks: AgentLoopCallbacks,
  config?: Partial<AgentLoopConfig>,
): Promise<void> {
  const loop = new AgentLoop(session, callbacks, config);
  return loop.run(userInput);
}
