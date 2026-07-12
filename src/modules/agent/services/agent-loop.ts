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
import {
  initCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
  markInterrupted,
} from "./session-checkpoint";
import { recordFewShot, buildFewShotPrompt } from "./tool-fewshot-cache";
import { recordAudit } from "./audit-storage";
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
  /** 当前用户输入（用于 few-shot 缓存记录用户意图） */
  private currentInput: string = "";
  /** P1-D：循环开始时间（用于总执行时间限制） */
  private loopStartTime: number = 0;
  /** P1-D：工具调用时间戳记录（用于频率限制，滑动窗口） */
  private toolCallTimestamps: number[] = [];

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

  /** 中止循环（P1-1 修复：同时中断 LLM 流式推理；P5 断点恢复：标记为中断） */
  abort(): void {
    this.aborted = true;
    if (this.llmAbortController) {
      this.llmAbortController.abort();
      this.llmAbortController = null;
    }
    // P5 断点恢复：标记检查点为中断状态（异步，不阻断）
    void markInterrupted(this.session.id).catch(() => {});
  }

  /** 运行 Agent Loop */
  async run(userInput: string): Promise<void> {
    // 1. 追加用户消息
    this.currentInput = userInput;
    this.deps.conversationManager.appendUserMessage(this.session, userInput);

    // P5 断点恢复：初始化检查点（异步，不阻断主流程）
    void initCheckpoint(this.session, userInput).catch(() => {});

    // 2. 构建初始 system prompt（动态注入项目状态 + RAG + 摘要）
    const systemPrompt = await this.buildSystemPrompt(userInput);

    // P2 深化：异步检测并触发对话摘要压缩（不阻断主流程）
    void this.maybeSummarizeConversation();

    // P1-D：记录循环开始时间（用于总执行时间限制）
    this.loopStartTime = Date.now();

    // 3. Agent Loop
    for (let i = 0; i < this.config.maxIterations; i++) {
      if (this.aborted) {
        this.handleAbort();
        return;
      }

      // P1-D：总执行时间检查
      if (this.isTotalDurationExceeded()) {
        const timeoutMsg = this.deps.conversationManager.startStreamingAssistant(this.session);
        const maxMinutes = Math.floor((this.config.maxTotalDurationMs ?? 0) / 60000);
        timeoutMsg.content = t("agent.totalDurationExceeded", { minutes: maxMinutes });
        this.deps.conversationManager.finishStreaming(this.session);
        void markInterrupted(this.session.id).catch(() => {});
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
          // P5 断点恢复：LLM 失败时标记为中断
          void markInterrupted(this.session.id).catch(() => {});
          this.callbacks.onError?.(new Error(errMsg));
          return;
        }

        // 结束流式
        this.deps.conversationManager.finishStreaming(this.session, finishReason);

        // P5 断点恢复：每轮 LLM 完成后保存检查点（异步，不阻断）
        void saveCheckpoint(this.session, { iteration: i + 1 }).catch(() => {});

        // 处理工具调用
        const toolCalls = Array.from(accumulatedToolCalls.values());
        if (toolCalls.length > 0) {
          this.deps.conversationManager.setToolCalls(this.session, toolCalls);
          // 更新工具调用总数
          void saveCheckpoint(this.session, { toolCallsTotal: toolCalls.length }).catch(() => {});

          // 执行工具
          const ctx: ToolContext = {
            sessionId: this.session.id,
            signal: this.callbacks.signal,
            onProgress: (_msg) => {
              // 通知 UI（可选）
            },
            // 注入确认回调，使 delegate_to_specialist 工具能向上传播子 Agent 的危险操作确认
            _confirmDangerous: this.callbacks.onConfirmationRequired,
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

          // P1-D：工具调用频率限制（等待至下一分钟窗口，支持中断）
          if (this.aborted) {
            this.handleAbort();
            return;
          }
          await this.enforceRateLimit(approvedToolCalls.length);
          if (this.aborted) {
            this.handleAbort();
            return;
          }

          // Phase 3：并行执行已批准的工具
          const maxResultTokens = this.config.maxToolResultTokens ?? 2000;
          const executedResults = approvedToolCalls.length > 0
            ? await this.deps.toolExecutor.executeAll(approvedToolCalls, ctx)
            : [];

          // P1-D：记录工具调用时间戳（用于频率限制统计）
          this.recordToolCallTimestamps(approvedToolCalls.length);

          // Phase 4：按原始 toolCalls 顺序回灌结果（保持 LLM 可读性）
          // 合并已执行结果和被拒绝结果，按原始顺序输出
          const resultMap = new Map<string, ToolResult>();
          for (const { toolCall, result } of executedResults) {
            resultMap.set(toolCall.id, result);
          }
          for (const { toolCall, result } of rejectedResults) {
            resultMap.set(toolCall.id, result);
          }

          // 构建被拒绝工具 ID 集合（用于审计日志状态判定）
          const rejectedIds = new Set(rejectedResults.map((r) => r.toolCall.id));

          for (const tc of toolCalls) {
            const result = resultMap.get(tc.id);
            if (!result) continue;
            // 截断过大的工具结果（仅影响传给 LLM 的内容，UI 收到完整结果）
            const llmResult = this.truncateToolResult(result, maxResultTokens);
            this.deps.conversationManager.appendToolResult(this.session, tc.id, tc.function.name, llmResult);
            this.callbacks.onToolResult(tc.id, result);

            // 预训练数据-2：记录成功的工具调用为 few-shot（异步，不阻断循环）
            if (result.success) {
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
              } catch {
                // 参数解析失败时记录空对象
              }
              void recordFewShot(tc.function.name, parsedArgs, result, this.currentInput).catch(() => {});
            }

            // P1-A：记录审计日志（异步，不阻断循环，整体 try-catch 确保审计失败不影响主循环）
            try {
              const isRejected = rejectedIds.has(tc.id);
              const needsConfirm = this.deps.toolExecutor.requiresConfirmation(tc);
              const dangerLevel = this.deps.toolExecutor.getDangerLevel(tc.function.name);
              let resultPreview: string | undefined;
              if (result.success && result.data != null) {
                try {
                  resultPreview = JSON.stringify(result.data).slice(0, 500);
                } catch {
                  // 序列化失败时无 preview
                }
              }
              void recordAudit({
                sessionId: this.session.id,
                toolCallId: tc.id,
                toolName: tc.function.name,
                iteration: i,
                argsJson: tc.function.arguments ?? "{}",
                status: isRejected ? "rejected" : (result.success ? "done" : "error"),
                success: !isRejected && result.success,
                error: result.error,
                resultPreview,
                durationMs: result.duration,
                dangerLevel,
                confirmedByUser: needsConfirm ? !isRejected : undefined,
                // P1-B：specialist 字段填充（主 Agent=undefined，子 Agent=specialist.name）
                specialist: this.config.specialistName,
              }).catch(() => {});
            } catch {
              // 审计日志记录失败时静默，不影响主循环
            }
          }

          // P5 断点恢复：工具执行完成后保存检查点（异步，不阻断）
          void saveCheckpoint(this.session, {
            toolCallsCompleted: (this.session.checkpoint?.toolCallsCompleted ?? 0) + toolCalls.length,
          }).catch(() => {});

          // 继续下一轮循环
          continue;
        }

        // 无工具调用，结束循环
        // P5 断点恢复：正常完成，清除检查点
        void clearCheckpoint(this.session.id).catch(() => {});
        return;
      } catch (e) {
        this.llmAbortController = null;
        this.deps.conversationManager.finishStreaming(this.session);
        const err = e instanceof Error ? e : new Error(String(e));
        assistantMsg.content = assistantMsg.content || `发生错误：${err.message}`;
        // P5 断点恢复：异常时标记为中断
        void markInterrupted(this.session.id).catch(() => {});
        this.callbacks.onError?.(err);
        return;
      }
    }

    // 达到最大循环次数
    const limitMsg = this.deps.conversationManager.startStreamingAssistant(this.session);
    limitMsg.content = t("agent.maxIterationsReached", { count: this.config.maxIterations });
    this.deps.conversationManager.finishStreaming(this.session);
    // P5 断点恢复：达到最大循环次数，标记为中断（未正常完成）
    void markInterrupted(this.session.id).catch(() => {});
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

  /** 构建 system prompt（动态注入项目状态 + 核心记忆 + RAG 检索 + 对话摘要 + few-shot） */
  private async buildSystemPrompt(userMessage?: string): Promise<string> {
    const template = this.config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
    const toolDescs = this.deps.toolRegistry.getToolDescriptions(this.config.enabledTools);
    const projectState = await buildDynamicProjectState();
    const coreMemory = await this.deps.memoryService.buildCoreMemoryPrompt();
    // P1 深化：RAG 自动注入 — 根据用户消息检索归档记忆
    const relevantMemory = userMessage
      ? await this.deps.memoryService.searchRelevant(userMessage, 3)
      : "";
    // P2 深化：对话历史摘要注入
    const conversationSummary = this.session.conversationSummary || "";
    let prompt = template
      .replace("{PROJECT_STATE}", projectState)
      .replace("{CORE_MEMORY}", coreMemory || "（暂无记忆）")
      .replace("{RELEVANT_MEMORY}", relevantMemory || "（无相关记忆）")
      .replace("{CONVERSATION_SUMMARY}", conversationSummary || "（暂无摘要）")
      .replace("{AVAILABLE_TOOLS}", buildAvailableToolsSummary(toolDescs));

    // 预训练数据-2：注入历史成功调用的 few-shot 示例（如有）
    if (userMessage) {
      try {
        const fewShotPrompt = await buildFewShotPrompt(userMessage, 5);
        if (fewShotPrompt) {
          prompt += "\n\n" + fewShotPrompt;
        }
      } catch {
        // few-shot 加载失败静默，不阻断主流程
      }
    }

    return prompt;
  }

  /**
   * 检测并触发对话摘要压缩（P2 深化）
   *
   * 策略：
   * - 计算当前消息历史的 token 总量
   * - 超过阈值（maxHistoryTokens * 0.8）时触发摘要
   * - 只摘要未被已摘要覆盖的旧消息（增量摘要）
   * - 摘要结果缓存在 session.conversationSummary
   * - 异步执行，不阻断 Agent Loop
   */
  private async maybeSummarizeConversation(): Promise<void> {
    const maxHistoryTokens = this.config.contextBudget?.maxHistoryTokens
      ?? DEFAULT_AGENT_CONFIG.contextBudget!.maxHistoryTokens;
    const summarizeThreshold = Math.floor(maxHistoryTokens * 0.8);

    // 估算当前消息 token 总量
    const { estimateMessagesTokens } = await import("@/shared-logic/agent");
    const totalTokens = estimateMessagesTokens(
      this.session.messages.map((m) => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
      })),
      false,
    );

    if (totalTokens < summarizeThreshold) {
      return; // 未达阈值，不需要摘要
    }

    // 找到需要摘要的旧消息范围（未被 summaryCoveredUpTo 覆盖的）
    const coveredId = this.session.summaryCoveredUpTo;
    let toSummarize: typeof this.session.messages;
    if (coveredId) {
      const coveredIdx = this.session.messages.findIndex((m) => m.id === coveredId);
      if (coveredIdx >= 0) {
        // 摘要从 coveredIdx+1 开始到最近 N 条之前的消息（保留最近 10 条不摘要）
        const recentKeep = 10;
        const summarizeEnd = Math.max(coveredIdx + 1, this.session.messages.length - recentKeep);
        toSummarize = this.session.messages.slice(coveredIdx + 1, summarizeEnd);
      } else {
        toSummarize = this.session.messages.slice(0, -10);
      }
    } else {
      // 首次摘要：保留最近 10 条，摘要之前的
      toSummarize = this.session.messages.slice(0, -10);
    }

    if (toSummarize.length < 3) {
      return; // 可摘要的消息太少
    }

    // 异步触发摘要（不等待，不阻断）
    void this.deps.memoryService
      .summarizeConversation(toSummarize, this.session.conversationSummary)
      .then((summary) => {
        if (summary) {
          this.session.conversationSummary = summary;
          // 标记摘要覆盖到最后一条被摘要的消息
          const lastSummarized = toSummarize[toSummarize.length - 1];
          if (lastSummarized) {
            this.session.summaryCoveredUpTo = lastSummarized.id;
          }
        }
      })
      .catch(() => {
        // 摘要失败静默，不阻断
      });
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

  /**
   * P1-D：检查总执行时间是否超限
   * @returns true 表示已超限，应停止循环
   */
  private isTotalDurationExceeded(): boolean {
    const maxDuration = this.config.maxTotalDurationMs ?? 0;
    if (maxDuration <= 0 || this.loopStartTime === 0) return false;
    return Date.now() - this.loopStartTime > maxDuration;
  }

  /**
   * P1-D：工具调用频率限制（滑动窗口）
   *
   * 如果最近 60 秒内的工具调用次数已达上限，则异步等待至窗口外。
   *
   * @param pendingCount 本轮即将执行的工具调用数量
   */
  private async enforceRateLimit(pendingCount: number): Promise<void> {
    const maxPerMinute = this.config.maxToolCallsPerMinute ?? 0;
    if (maxPerMinute <= 0 || pendingCount === 0) return;

    const now = Date.now();
    const windowMs = 60_000;
    // 清理 60 秒前的时间戳
    this.toolCallTimestamps = this.toolCallTimestamps.filter((ts) => now - ts < windowMs);

    if (this.toolCallTimestamps.length + pendingCount > maxPerMinute) {
      // 需要等待：计算最早时间戳 + 60s 的时间点
      const oldestInWindow = this.toolCallTimestamps[0] ?? now;
      const waitUntil = oldestInWindow + windowMs;
      const waitMs = waitUntil - now;
      if (waitMs > 0) {
        // 通知 UI 正在等待（可选）
        this.deps.conversationManager.appendDelta(
          this.session,
          t("agent.rateLimitWaiting", { seconds: Math.ceil(waitMs / 1000) }),
        );
        // 等待（支持中断）
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(() => {
            if (this.callbacks.signal) {
              this.callbacks.signal.removeEventListener("abort", onAbort);
            }
            resolve();
          }, waitMs);
          if (this.callbacks.signal) {
            this.callbacks.signal.addEventListener("abort", onAbort, { once: true });
          }
        });
      }
      // 等待后重新清理时间戳
      const nowAfter = Date.now();
      this.toolCallTimestamps = this.toolCallTimestamps.filter((ts) => nowAfter - ts < windowMs);
    }
  }

  /**
   * P1-D：记录工具调用时间戳（用于频率限制统计）
   *
   * @param count 本轮执行的工具调用数量
   */
  private recordToolCallTimestamps(count: number): void {
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      this.toolCallTimestamps.push(now);
    }
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
