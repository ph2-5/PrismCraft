/**
 * use-agent-operations - 从 useAgent 抽取的带状态副作用的操作函数
 *
 * 职责：提供 Agent 会话相关的操作函数（发送消息、清空会话、自动保存、
 * 初始化、取消等）及其 context 类型定义。
 *
 * 这些函数通过显式 context 参数接收 React state/ref，保持纯函数调用关系，
 * 便于单测与复用。
 */

"use client";

import type {
  AgentSession,
  ToolExecution,
  ToolResult,
  AgentLoopConfig,
  AgentLoopCallbacks,
} from "../domain/types";
import type { ToolCall } from "@/domain/ports/ai-provider-port";
import { AgentLoop } from "../services/agent-loop";
import {
  persistSession,
  loadSession,
  listSessions,
  markRunningAsInterrupted,
  markInterrupted,
} from "@/modules/agent-session";
import { ensureSeedMemory } from "@/modules/agent-memory";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { eventBus } from "@/shared/event-bus";
import { DomainEvents } from "@/shared/event-types";
import type { ModelSelection } from "@/domain/schemas";
import {
  type AgentSettings,
  createNewSession,
  generateSessionTitle,
  triggerMemoryExtraction,
  buildToolConfirmationDescription,
} from "./use-agent-helpers";

/** executeSendMessage 等函数共用的 ref 上下文类型 */
export interface AgentHookRefs {
  sessionRef: React.MutableRefObject<AgentSession>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  loopRef: React.MutableRefObject<AgentLoop | null>;
  systemHintRef: React.MutableRefObject<string | undefined>;
}

/** executeSendMessage 等函数共用的 state setter 上下文类型 */
export interface AgentHookSetters {
  setToolExecutions: React.Dispatch<React.SetStateAction<ToolExecution[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRender: () => void;
}

/**
 * 创建 AgentLoop 的回调对象（onChunk/onToolCall/onToolResult/onError/onConfirmationRequired/signal）。
 *
 * 提取自 useAgent.sendMessage 内联对象字面量，便于复用与单测。
 */
export function createAgentLoopCallbacks(
  setters: AgentHookSetters,
  signal: AbortSignal,
): AgentLoopCallbacks {
  const { triggerRender, setToolExecutions, setError } = setters;
  return {
    onChunk: () => triggerRender(),
    onToolCall: (toolCall: ToolCall) => {
      const exec: ToolExecution = {
        id: toolCall.id,
        toolCall,
        status: "running",
        startedAt: Date.now(),
      };
      setToolExecutions((prev) => [...prev, exec]);
    },
    onToolResult: (toolCallId: string, result: ToolResult) => {
      setToolExecutions((prev) =>
        prev.map((item) =>
          item.id === toolCallId
            ? {
                ...item,
                status: result.success ? "done" : "error",
                result,
                endedAt: Date.now(),
              }
            : item,
        ),
      );
      triggerRender();
    },
    onError: (err: Error) => setError(err.message),
    onConfirmationRequired: async (toolCall: ToolCall) => {
      return confirm({
        title: t("agent.confirmToolTitle"),
        description: buildToolConfirmationDescription(toolCall),
        confirmText: t("agent.confirmToolDanger"),
        variant: "danger",
      });
    },
    signal,
  };
}

/** executeSendMessage 的上下文 */
export interface SendMessageContext {
  isStreaming: boolean;
  refs: AgentHookRefs;
  setters: AgentHookSetters;
  settings: AgentSettings;
  buildConfig: () => Partial<AgentLoopConfig>;
  saveCurrentSession: () => Promise<void>;
}

/**
 * 执行发送消息（提取自 useAgent.sendMessage 的 useCallback 主体）。
 *
 * 包含：状态切换 → 构造 AgentLoop → 运行 → 标题更新 → 保存 → 记忆抽取 → 事件通知。
 */
export async function executeSendMessage(text: string, ctx: SendMessageContext): Promise<void> {
  if (!text.trim() || ctx.isStreaming) return;

  ctx.setters.setError(null);
  ctx.setters.setIsStreaming(true);
  eventBus.emit(DomainEvents.AGENT_THINKING, { sessionId: ctx.refs.sessionRef.current.id });

  const abortController = new AbortController();
  ctx.refs.abortControllerRef.current = abortController;

  const loop = new AgentLoop(
    ctx.refs.sessionRef.current,
    createAgentLoopCallbacks(ctx.setters, abortController.signal),
    ctx.buildConfig(),
  );
  ctx.refs.loopRef.current = loop;

  try {
    await loop.run(text);
    // 自动生成会话标题（首次发送时）
    if (ctx.refs.sessionRef.current.title === t("agent.newSession")) {
      ctx.refs.sessionRef.current.title = generateSessionTitle(ctx.refs.sessionRef.current);
      ctx.setters.triggerRender();
    }
    await ctx.saveCurrentSession();
    void triggerMemoryExtraction(ctx.refs.sessionRef.current, {
      providerId: ctx.settings.textModel?.providerId,
      modelId: ctx.settings.textModel?.modelId,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    ctx.setters.setError(err.message);
    eventBus.emit(DomainEvents.AGENT_ERROR, {
      sessionId: ctx.refs.sessionRef.current.id,
      error: err.message,
    });
  } finally {
    ctx.setters.setIsStreaming(false);
    ctx.refs.loopRef.current = null;
    ctx.refs.abortControllerRef.current = null;
    // P2 集成：清空 systemHint（一次性消费，避免污染后续无关对话）
    ctx.refs.systemHintRef.current = undefined;
    ctx.setters.triggerRender();
    eventBus.emit(DomainEvents.AGENT_COMPLETED, { sessionId: ctx.refs.sessionRef.current.id });
  }
}

/** executeClearSession 的上下文 */
export interface ClearSessionContext {
  isStreaming: boolean;
  cancel: () => void;
  refs: Pick<AgentHookRefs, "sessionRef">;
  setters: Pick<AgentHookSetters, "setToolExecutions" | "setError" | "triggerRender">;
  refreshHistory: () => Promise<void>;
  textModel?: ModelSelection | null;
}

/**
 * 清空当前会话（提取自 useAgent.clearSession 的 useCallback 主体）。
 *
 * 流程：取消进行中的流式 → 异步触发记忆抽取并保存当前会话 → 创建新会话。
 */
export function executeClearSession(ctx: ClearSessionContext): void {
  if (ctx.isStreaming) {
    ctx.cancel();
  }
  const currentSession = ctx.refs.sessionRef.current;
  if (currentSession.messages.length > 0) {
    void triggerMemoryExtraction(currentSession, {
      providerId: ctx.textModel?.providerId,
      modelId: ctx.textModel?.modelId,
    })
      .then(() =>
        persistSession(currentSession)
          .then(() => ctx.refreshHistory())
          .catch((e) => {
            errorLogger.warn("[Agent] 会话保存失败", e);
            emitToast("error", t("agent.saveFailedTitle"), t("agent.saveFailedMessage"));
          }),
      )
      .catch((e) => {
        errorLogger.warn("[Agent] 记忆抽取或会话保存失败", e);
        emitToast("error", t("agent.saveFailedTitle"), t("agent.saveFailedMessage"));
      });
  }
  ctx.refs.sessionRef.current = createNewSession();
  ctx.setters.setToolExecutions([]);
  ctx.setters.setError(null);
  ctx.setters.triggerRender();
}

/** 自动保存的依赖 */
export interface AutoSaveDeps {
  session: AgentSession;
  isStreaming: boolean;
  abortController: AbortController | null;
  loop: AgentLoop | null;
}

/**
 * 窗口关闭/隐藏时自动保存当前会话（提取自 useAgent beforeunload useEffect）。
 *
 * - 流式输出中：先 abort + 标记中断
 * - fire-and-forget 持久化会话
 */
export function performAutoSave(deps: AutoSaveDeps): void {
  const { session, isStreaming, abortController, loop } = deps;
  if (session.messages.length === 0) return;

  if (isStreaming) {
    if (abortController) abortController.abort();
    if (loop) loop.abort();
    void markInterrupted(session.id).catch((e) => {
      errorLogger.warn("[Agent] beforeunload markInterrupted 失败", e);
    });
  }

  void persistSession(session).catch((e) => {
    errorLogger.warn("[Agent] beforeunload persistSession 失败", e);
  });
}

/** 初始化会话的依赖 */
export interface InitSessionDeps {
  sessionRef: React.MutableRefObject<AgentSession>;
  triggerRender: () => void;
  refreshInterruptedSessions: () => Promise<void>;
  refreshHistory: () => Promise<void>;
}

/**
 * 启动时初始化（提取自 useAgent 内的 init useEffect）。
 *
 * 流程：标记中断会话 → 注入种子记忆 → 刷新列表 → 加载最近的会话。
 */
export async function initializeAgentSession(deps: InitSessionDeps): Promise<void> {
  await markRunningAsInterrupted();
  await ensureSeedMemory();
  await deps.refreshInterruptedSessions();
  await deps.refreshHistory();
  const items = await listSessions();
  if (items.length > 0 && items[0]) {
    const latest = await loadSession(items[0].id);
    if (latest && latest.messages.length > 0) {
      deps.sessionRef.current = latest;
      deps.triggerRender();
    }
  }
}

/**
 * 加载会话到当前 state（共享逻辑，loadHistorySession 和 resumeInterruptedSession 复用）。
 */
export async function replaceCurrentSession(
  loadFn: (sessionId: string) => Promise<AgentSession | null>,
  sessionId: string,
  setters: Pick<AgentHookSetters, "setToolExecutions" | "setError" | "triggerRender">,
  sessionRef: React.MutableRefObject<AgentSession>,
): Promise<boolean> {
  const loaded = await loadFn(sessionId);
  if (!loaded) return false;
  sessionRef.current = loaded;
  setters.setToolExecutions([]);
  setters.setError(null);
  setters.triggerRender();
  return true;
}

/** performCancel 的依赖 */
export interface CancelDeps {
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  loopRef: React.MutableRefObject<AgentLoop | null>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  sessionRef: React.MutableRefObject<AgentSession>;
}

/** 取消当前生成（提取自 useAgent.cancel 的 useCallback 主体）。 */
export function performCancel(deps: CancelDeps): void {
  if (deps.abortControllerRef.current) {
    deps.abortControllerRef.current.abort();
  }
  if (deps.loopRef.current) {
    deps.loopRef.current.abort();
  }
  deps.setIsStreaming(false);
  eventBus.emit(DomainEvents.AGENT_COMPLETED, { sessionId: deps.sessionRef.current.id });
}

/** setupAutoSaveHandlers 的依赖 */
export interface AutoSaveHandlersDeps {
  sessionRef: React.MutableRefObject<AgentSession>;
  isStreamingRef: React.MutableRefObject<boolean>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  loopRef: React.MutableRefObject<AgentLoop | null>;
}

/**
 * 注册 beforeunload / visibilitychange 自动保存监听器，返回清理函数。
 *
 * 提取自 useAgent 内的 beforeunload useEffect，通过 ref 同步最新状态，
 * 避免监听器闭包捕获旧值。
 */
export function setupAutoSaveHandlers(deps: AutoSaveHandlersDeps): () => void {
  const triggerAutoSave = () => {
    performAutoSave({
      session: deps.sessionRef.current,
      isStreaming: deps.isStreamingRef.current,
      abortController: deps.abortControllerRef.current,
      loop: deps.loopRef.current,
    });
  };

  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    const session = deps.sessionRef.current;
    if (session.messages.length === 0) return;
    triggerAutoSave();
    event.preventDefault();
    event.returnValue = "";
    return "";
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      triggerAutoSave();
    }
  };

  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
