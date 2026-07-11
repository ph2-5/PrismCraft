/**
 * Agent Loop 核心
 *
 * 算法：
 * 1. 构建初始消息序列（system prompt + 历史 + 用户消息）
 * 2. 能力自适应调用 LLM：
 *    a. 优先 generateChat（原生 function calling，messages 数组）
 *    b. 降级 generateTextStream + serializeMessages（prompt 工程）
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
import type { AgentLoopDeps } from "../domain/ports";
import { DEFAULT_AGENT_CONFIG } from "../domain/types";
import { estimateTokens } from "@/shared-logic/agent";
import {
  DEFAULT_SYSTEM_PROMPT,
  buildProjectStateSummary,
  buildAvailableToolsSummary,
} from "../domain/prompts";
import { conversationManager } from "./conversation-manager";
import { toolExecutor } from "./tool-executor";
import { toolRegistry } from "./tool-registry";
import { memoryService } from "./memory-service";
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
  /** 协作者依赖（DI 注入，不传则用模块单例 + container 作为默认） */
  private deps: AgentLoopDeps;

  constructor(
    session: AgentSession,
    callbacks: AgentLoopCallbacks,
    config?: Partial<AgentLoopConfig>,
    deps?: Partial<AgentLoopDeps>,
  ) {
    this.session = session;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    // 协作者注入：不传的字段用模块单例/container 作为默认（向后兼容）
    this.deps = {
      conversationManager: deps?.conversationManager ?? conversationManager,
      toolRegistry: deps?.toolRegistry ?? toolRegistry,
      toolExecutor: deps?.toolExecutor ?? toolExecutor,
      memoryService: deps?.memoryService ?? memoryService,
      textProvider: deps?.textProvider ?? container.textProvider,
    };
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
    this.deps.conversationManager.appendUserMessage(this.session, userInput);

    // 2. 构建初始 system prompt（动态注入项目状态）
    const systemPrompt = await this.buildSystemPrompt();

    // 3. Agent Loop
    for (let i = 0; i < this.config.maxIterations; i++) {
      if (this.aborted) {
        this.handleAbort();
        return;
      }

      // 构建 LLM 消息序列
      const llmMessages = this.deps.conversationManager.buildLLMMessages(this.session, systemPrompt);

      // 调用 LLM（流式）
      const assistantMsg = this.deps.conversationManager.startStreamingAssistant(this.session);
      // 累积工具调用（流式可能分多块返回）
      const accumulatedToolCalls: Map<string, ToolCall> = new Map();
      let finishReason: StreamChunk["finishReason"] | undefined;
      let receivedAnyChunk = false;

      try {
        // P1-1 修复：为每次 LLM 流式调用创建独立 AbortController，
        // 使 abort() 能中断正在进行的流式推理（之前取消按钮在 LLM 推理期间无效）
        this.llmAbortController = new AbortController();

        // 共享的 onChunk 处理器（generateChat 和 generateTextStream 通用）
        const handleChunk = (chunk: StreamChunk) => {
          receivedAnyChunk = true;
          // delta → 实时输出
          if (chunk.delta) {
            this.deps.conversationManager.appendDelta(this.session, chunk.delta);
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
        };

        const streamOpts = {
          onChunk: handleChunk,
          maxTokens: this.config.maxTokensPerTurn,
          temperature: this.config.temperature,
          providerId: this.config.providerId,
          modelId: this.config.modelId,
          tools: this.deps.toolRegistry.getToolDefs(this.config.enabledTools),
          signal: this.llmAbortController.signal,
        };

        // 能力自适应：优先使用原生对话补全（messages 数组 + 原生 function calling）
        // 失败时降级到 generateTextStream + serializeMessages（prompt 工程）
        let result;
        try {
          result = await this.deps.textProvider.generateChat(llmMessages, streamOpts);
        } catch (e) {
          if (!receivedAnyChunk) {
            // 未收到任何 chunk，安全降级到 serializeMessages
            const prompt = this.serializeMessages(llmMessages);
            result = await this.deps.textProvider.generateTextStream(prompt, streamOpts);
          } else {
            throw e;
          }
        }
        if (!result.success && !receivedAnyChunk) {
          // generateChat 返回失败且未收到 chunk → 降级
          const prompt = this.serializeMessages(llmMessages);
          result = await this.deps.textProvider.generateTextStream(prompt, streamOpts);
        }
        this.llmAbortController = null;

        if (!result.success) {
          // LLM 调用失败
          this.deps.conversationManager.finishStreaming(this.session);
          const errMsg = result.error || "LLM 调用失败";
          assistantMsg.content = assistantMsg.content || `调用失败：${errMsg}`;
          this.callbacks.onError?.(new Error(errMsg));
          return;
        }

        // 结束流式
        this.deps.conversationManager.finishStreaming(this.session, finishReason);

        // 处理工具调用
        const toolCalls = Array.from(accumulatedToolCalls.values());
        if (toolCalls.length > 0) {
          this.deps.conversationManager.setToolCalls(this.session, toolCalls);

          // 执行工具
          const ctx: ToolContext = {
            sessionId: this.session.id,
            signal: this.callbacks.signal,
            onProgress: (_msg) => {
              // 通知 UI（可选）
            },
          };

          // P0 深化：工具并行执行
          // 策略：
          // 1. 先统一处理危险工具确认（串行询问，拒绝则标记跳过）
          // 2. 确认通过的工具并行执行（executeAll）
          // 3. 结果按 toolCalls 原始顺序回灌（保持 LLM 可读性）
          if (this.aborted) {
            this.handleAbort();
            return;
          }

          // Phase 1：危险工具确认（串行，避免并发弹窗冲突）
          const approvedToolCalls: ToolCall[] = [];
          const rejectedResults: Array<{ toolCall: ToolCall; result: ToolResult }> = [];

          for (const tc of toolCalls) {
            if (this.deps.toolExecutor.requiresConfirmation(tc)) {
              const approved = this.callbacks.onConfirmationRequired
                ? await this.callbacks.onConfirmationRequired(tc)
                : false;
              if (!approved) {
                rejectedResults.push({
                  toolCall: tc,
                  result: {
                    success: false,
                    error: "用户拒绝执行此操作（需要确认）",
                    duration: 0,
                  },
                });
                continue;
              }
            }
            approvedToolCalls.push(tc);
          }

          // Phase 2：通知 UI 工具调用开始（所有已批准工具）
          for (const tc of approvedToolCalls) {
            this.callbacks.onToolCall(tc);
          }

          // Phase 3：并行执行已批准的工具
          const maxResultTokens = this.config.maxToolResultTokens ?? 2000;
          const executedResults = approvedToolCalls.length > 0
            ? await this.deps.toolExecutor.executeAll(approvedToolCalls, ctx)
            : [];

          // Phase 4：按原始 toolCalls 顺序回灌结果（保持 LLM 可读性）
          // 合并已执行结果和被拒绝结果，按原始顺序输出
          const resultMap = new Map<string, ToolResult>();
          for (const { toolCall, result } of executedResults) {
            resultMap.set(toolCall.id, result);
          }
          for (const { toolCall, result } of rejectedResults) {
            resultMap.set(toolCall.id, result);
          }

          for (const tc of toolCalls) {
            const result = resultMap.get(tc.id);
            if (!result) continue;
            // 截断过大的工具结果（仅影响传给 LLM 的内容，UI 收到完整结果）
            const llmResult = this.truncateToolResult(result, maxResultTokens);
            this.deps.conversationManager.appendToolResult(this.session, tc.id, tc.function.name, llmResult);
            this.callbacks.onToolResult(tc.id, result);
          }

          // 继续下一轮循环
          continue;
        }

        // 无工具调用，结束循环
        return;
      } catch (e) {
        this.llmAbortController = null;
        this.deps.conversationManager.finishStreaming(this.session);
        const err = e instanceof Error ? e : new Error(String(e));
        assistantMsg.content = assistantMsg.content || `发生错误：${err.message}`;
        this.callbacks.onError?.(err);
        return;
      }
    }

    // 达到最大循环次数
    const limitMsg = this.deps.conversationManager.startStreamingAssistant(this.session);
    limitMsg.content = t("agent.maxIterationsReached", { count: this.config.maxIterations });
    this.deps.conversationManager.finishStreaming(this.session);
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
    const toolDescs = this.deps.toolRegistry.getToolDescriptions(this.config.enabledTools);
    const projectState = await buildDynamicProjectState();
    const coreMemory = await this.deps.memoryService.buildCoreMemoryPrompt();
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

  /**
   * 截断过大的工具结果（防止消耗过多上下文 token）
   *
   * 策略：
   * - 成功结果：将 data 序列化为 JSON，超限时保留头部 + 尾部，中间用省略号标记
   * - 错误结果：error 字符串超限时截断尾部
   * - 截断阈值由 config.maxToolResultTokens 控制（默认 2000）
   *
   * 注意：此方法仅影响传给 LLM 的内容，UI 回调收到的是完整结果。
   */
  private truncateToolResult(result: ToolResult, maxTokens: number): ToolResult {
    if (!result.success) {
      // 错误结果：截断 error 字符串
      if (result.error) {
        const errorTokens = estimateTokens(result.error);
        if (errorTokens > maxTokens) {
          // 按比例截断（ASCII 4 字符 ≈ 1 token，中文 1 字 ≈ 1.5 token，取保守 3 字符/token）
          const keepChars = Math.floor(maxTokens * 3 * 0.8);
          return {
            ...result,
            error: result.error.slice(0, keepChars) + "\n...[错误信息已截断]",
          };
        }
      }
      return result;
    }

    // 成功结果：序列化 data
    const dataStr = JSON.stringify(result.data ?? null);
    const dataTokens = estimateTokens(dataStr);
    if (dataTokens <= maxTokens) {
      return result;
    }

    // 超限截断：保留头部 60% + 尾部 40%，中间用省略号标记
    const keepChars = Math.floor(maxTokens * 3 * 0.8); // token 转 char 近似（保守）
    const headChars = Math.floor(keepChars * 0.6);
    const tailChars = keepChars - headChars;
    const truncated =
      dataStr.slice(0, headChars) +
      "\n...[内容已截断，原始约 " + dataTokens + " token]...\n" +
      dataStr.slice(-tailChars);

    return {
      ...result,
      data: { _truncated: true, preview: truncated, originalTokens: dataTokens },
    };
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
