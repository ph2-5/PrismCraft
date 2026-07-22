/**
 * useAgent - Agent 助手主 Hook
 *
 * 职责：
 * - 管理会话状态（session）
 * - 管理流式输出状态（isStreaming）
 * - 管理工具执行状态（toolExecutions）
 * - 提供 sendMessage / cancel / clearSession 方法
 * - 会话持久化（自动保存到本地，加载历史会话）
 * - 配置持久化（persona / maxIterations / temperature）
 *
 * 设计要点：
 * - session 使用 ref + forceUpdate 模式（避免深层嵌套 setState）
 * - 工具执行状态用 useState（UI 需要响应式更新）
 * - 流式输出通过 onChunk 回调实时更新
 * - 取消通过 AbortController
 * - 配置用 usePreference 持久化到 localStorage
 * - 会话用 file-http 持久化到缓存目录
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type {
  AgentSession,
  ToolExecution,
  AgentLoopConfig,
} from "../domain/types";
import { createEmptySession } from "../domain/types";
import type { AgentLoop } from "../services/agent-loop";
import { registerAllTools, loadToolPlugins } from "../tools";
import { AGENT_PERSONAS } from "../domain/prompts";
// session-storage 和 session-checkpoint 已拆分至 @/modules/agent-session（阶段2-b）
import {
  persistSession,
  loadSession,
  listSessions,
  deleteSession,
  loadInterruptedSession,
  listInterruptedSessions,
  type SessionListItem,
  type CheckpointIndexEntry,
} from "@/modules/agent-session";
import { usePreference } from "@/shared/utils/preferences";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { eventBus } from "@/shared/event-bus";
import { DomainEvents } from "@/shared/event-types";

// 从 use-agent-helpers 导入纯函数和常量
import {
  type AgentSettings,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  buildVideoTaskCompletedHint,
} from "./use-agent-helpers";

// 从 use-agent-operations 导入操作函数
import {
  executeSendMessage,
  executeClearSession,
  performCancel,
  setupAutoSaveHandlers,
  initializeAgentSession,
  replaceCurrentSession,
} from "./use-agent-operations";

// 向后兼容：barrel 和 AgentSettingsForm 仍从此处导入 AgentSettings 类型
export type { AgentSettings } from "./use-agent-helpers";

export interface UseAgentReturn {
  /** 当前会话 */
  session: AgentSession;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 工具执行记录 */
  toolExecutions: ToolExecution[];
  /** 错误信息 */
  error: string | null;
  /**
   * P1-3 修复：递增的渲染版本号
   *
   * 每次 session 被原地修改（push、content +=）后递增，
   * 供消费者作为 useEffect 依赖以触发响应式副作用（如自动滚动）。
   */
  renderVersion: number;
  /** 发送消息 */
  sendMessage: (text: string) => Promise<void>;
  /** 取消当前生成 */
  cancel: () => void;
  /** 清空会话（保存当前到历史，创建新会话） */
  clearSession: () => void;
  /** 更新会话标题 */
  setSessionTitle: (title: string) => void;
  /** 历史会话列表 */
  historySessions: SessionListItem[];
  /** 加载历史会话 */
  loadHistorySession: (sessionId: string) => Promise<void>;
  /** 删除历史会话 */
  deleteHistorySession: (sessionId: string) => Promise<void>;
  /** 刷新历史会话列表 */
  refreshHistory: () => Promise<void>;
  /** 中断的会话列表（P5 断点恢复） */
  interruptedSessions: CheckpointIndexEntry[];
  /** 刷新中断会话列表 */
  refreshInterruptedSessions: () => Promise<void>;
  /** 恢复中断的会话（加载并展示历史，用户可重新发送消息继续） */
  resumeInterruptedSession: (sessionId: string) => Promise<void>;
  /** 忽略中断会话（清除检查点标记，保留会话历史） */
  dismissInterruptedSession: (sessionId: string) => Promise<void>;
  /** 当前设置 */
  settings: AgentSettings;
  /** 更新设置 */
  updateSettings: (partial: Partial<AgentSettings>) => void;
  /**
   * P1-4 修复：关闭错误提示
   *
   * 原问题：错误提示无关闭按钮，必须重新触发新消息才能清除。
   */
  dismissError: () => void;
}

export function useAgent(): UseAgentReturn {
  // 首次调用时注册工具 + 加载用户插件
  useEffect(() => {
    registerAllTools();
    // P3 工具插件化：异步加载用户工具插件（不阻塞 UI）
    // 失败时记录警告，不阻塞 UI 主流程
    void loadToolPlugins().catch((err) => {
      errorLogger.warn("[useAgent] loadToolPlugins 失败", err instanceof Error ? err : undefined);
    });
  }, []);

  // 持久化设置
  const [settings, setSettings] = usePreference<AgentSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);

  const sessionRef = useRef<AgentSession>(createEmptySession());
  const loopRef = useRef<AgentLoop | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [, forceUpdate] = useState({});
  /**
   * P1-3 修复：递增的渲染版本号
   *
   * 原问题：session.messages 被 conversation-manager 原地修改（push、content +=），
   * 引用始终不变，导致 AgentPage 的 useEffect([session.messages, ...]) 不触发自动滚动。
   *
   * 修复：每次 triggerRender 时递增 renderVersion，作为 AgentPage useEffect 的依赖。
   * 这样流式 delta、消息追加、工具结果回灌都能触发自动滚动。
   */
  const [renderVersion, setRenderVersion] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  /**
   * P1-2 修复：isStreaming 的 ref 镜像。
   *
   * beforeunload / visibilitychange 监听器在 mount 时注册一次，
   * 闭包只能捕获当时的 isStreaming 值（始终为 false）。
   * 通过 ref 同步最新值，让监听器能感知流式输出状态。
   */
  const isStreamingRef = useRef(false);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  /**
   * P2 集成：systemHint ref — 接收 VIDEO_TASK_COMPLETED 事件并注入下次 buildSystemPrompt。
   *
   * 工作流程：
   * 1. VIDEO_TASK_COMPLETED 事件触发 → 回调写入 systemHintRef.current
   * 2. 用户下次 sendMessage → buildConfig() 读取 ref → 传入 AgentLoop
   * 3. AgentLoop.buildSystemPrompt 注入 systemHint 到 prompt 末尾
   * 4. sendMessage 完成后清空 ref（一次性消费，避免污染后续无关对话）
   *
   * 注意：若多个 VIDEO_TASK_COMPLETED 事件在用户 sendMessage 前连续触发，
   * 后到的会覆盖先到的（保留最新）。这样 Agent 总是感知最近完成的视频任务。
   */
  const systemHintRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const subscription = eventBus.on(
      DomainEvents.VIDEO_TASK_COMPLETED,
      (payload: unknown) => {
        const hint = buildVideoTaskCompletedHint(payload);
        if (hint) systemHintRef.current = hint;
      },
    );
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historySessions, setHistorySessions] = useState<SessionListItem[]>([]);
  const [interruptedSessions, setInterruptedSessions] = useState<CheckpointIndexEntry[]>([]);

  const triggerRender = useCallback(() => {
    forceUpdate({});
    setRenderVersion((v) => v + 1);
  }, []);

  /** 刷新历史会话列表 */
  const refreshHistory = useCallback(async () => {
    try {
      const items = await listSessions();
      setHistorySessions(items);
    } catch (err) {
      errorLogger.warn("[useAgent] 刷新历史会话列表失败", err instanceof Error ? err : undefined);
    }
  }, []);

  /** 刷新中断会话列表（P5 断点恢复） */
  const refreshInterruptedSessions = useCallback(async () => {
    try {
      const items = await listInterruptedSessions();
      setInterruptedSessions(items);
    } catch (err) {
      errorLogger.warn("[useAgent] 刷新中断会话列表失败", err instanceof Error ? err : undefined);
    }
  }, []);

  // 初始化：标记中断会话 + 加载最近的会话 + 历史列表
  useEffect(() => {
    void initializeAgentSession({
      sessionRef,
      triggerRender,
      refreshInterruptedSessions,
      refreshHistory,
    });
  }, []);

  /** 根据设置构建 AgentLoopConfig */
  const buildConfig = useCallback((): Partial<AgentLoopConfig> => {
    const persona = AGENT_PERSONAS[settings.persona] ?? DEFAULT_SYSTEM_PROMPT_FALLBACK;
    return {
      maxIterations: settings.maxIterations,
      temperature: settings.temperature,
      systemPromptOverride: settings.persona === "default" ? undefined : persona,
      // P2 集成：注入 systemHint（VIDEO_TASK_COMPLETED 事件累积的提示）
      systemHint: systemHintRef.current,
      providerId: settings.textModel?.providerId,
      modelId: settings.textModel?.modelId,
    };
  }, [settings]);

  /** 保存当前会话到本地 */
  const saveCurrentSession = useCallback(async () => {
    const session = sessionRef.current;
    // 只有有消息的会话才保存
    if (session.messages.length === 0) return;
    try {
      await persistSession(session);
      await refreshHistory();
    } catch (e) {
      // P1-4 修复：保存失败时通过 toast 提示用户，避免静默丢失
      errorLogger.warn("[Agent] 会话保存失败", e);
      emitToast("error", t("agent.saveFailedTitle"), t("agent.saveFailedMessage"));
    }
  }, [refreshHistory]);

  /**
   * P1-2 修复：窗口关闭/刷新/标签隐藏时自动保存当前会话。
   *
   * 原问题：用户在 Agent 对话进行中关闭窗口，最新消息（ sendMessage 完成但未触发
   * 下一次保存的情况）会丢失。流式输出中的内容也完全丢失。
   *
   * 策略：
   * - beforeunload：触发原生"确认离开"对话框，争取保存时间 + fire-and-forget 保存
   * - visibilitychange：标签隐藏/最小化时触发（移动端/Electron 更可靠），fire-and-forget 保存
   * - 流式输出中：先 abort 当前流 + markInterrupted（标记为中断，便于下次恢复）
   * - 通过 ref（sessionRef / isStreamingRef / abortControllerRef / loopRef）同步最新状态
   *   避免监听器闭包捕获旧值
   *
   * 限制：beforeunload 中无法可靠 await 异步操作（IPC 是异步的），采用 fire-and-forget。
   * Electron 中 IPC 请求已发出，主进程会处理完写入再退出（除非强制 kill）。
   */
  useEffect(() => {
    return setupAutoSaveHandlers({ sessionRef, isStreamingRef, abortControllerRef, loopRef });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      return executeSendMessage(text, {
        isStreaming,
        refs: { sessionRef, abortControllerRef, loopRef, systemHintRef },
        setters: { setToolExecutions, setError, setIsStreaming, triggerRender },
        settings,
        buildConfig,
        saveCurrentSession,
      });
    },
    [isStreaming, buildConfig, triggerRender, saveCurrentSession, settings],
  );

  const cancel = useCallback(() => {
    performCancel({ abortControllerRef, loopRef, setIsStreaming, sessionRef });
  }, []);

  const clearSession = useCallback(() => {
    executeClearSession({
      isStreaming,
      cancel,
      refs: { sessionRef },
      setters: { setToolExecutions, setError, triggerRender },
      refreshHistory,
      textModel: settings.textModel,
    });
  }, [isStreaming, cancel, refreshHistory, triggerRender, settings.textModel]);

  const setSessionTitle = useCallback(
    (title: string) => {
      sessionRef.current.title = title;
      triggerRender();
    },
    [triggerRender],
  );

  /** 加载历史会话 */
  const loadHistorySession = useCallback(
    async (sessionId: string) => {
      if (isStreaming) return;
      await saveCurrentSession();
      await replaceCurrentSession(
        loadSession,
        sessionId,
        { setToolExecutions, setError, triggerRender },
        sessionRef,
      );
    },
    [isStreaming, saveCurrentSession, triggerRender],
  );

  /** 删除历史会话 */
  const deleteHistorySession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      await refreshHistory();
    },
    [refreshHistory],
  );

  /** 恢复中断的会话（P5 断点恢复） */
  const resumeInterruptedSession = useCallback(
    async (sessionId: string) => {
      if (isStreaming) return;
      await saveCurrentSession();
      await replaceCurrentSession(
        loadInterruptedSession,
        sessionId,
        { setToolExecutions, setError, triggerRender },
        sessionRef,
      );
      // 刷新中断列表（恢复的会话不再标记为中断）
      await refreshInterruptedSessions();
    },
    [isStreaming, saveCurrentSession, triggerRender, refreshInterruptedSessions],
  );

  /** 忽略中断会话（清除检查点标记，保留会话历史） */
  const dismissInterruptedSession = useCallback(
    async (sessionId: string) => {
      const { clearCheckpoint } = await import("@/modules/agent-session");
      await clearCheckpoint(sessionId);
      await refreshInterruptedSessions();
    },
    [refreshInterruptedSessions],
  );

  /** 更新设置 */
  const updateSettings = useCallback(
    (partial: Partial<AgentSettings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
    },
    [setSettings],
  );

  /** P1-4 修复：关闭错误提示 */
  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  return {
    session: sessionRef.current,
    isStreaming,
    toolExecutions,
    error,
    renderVersion,
    sendMessage,
    cancel,
    clearSession,
    setSessionTitle,
    historySessions,
    loadHistorySession,
    deleteHistorySession,
    refreshHistory,
    interruptedSessions,
    refreshInterruptedSessions,
    resumeInterruptedSession,
    dismissInterruptedSession,
    settings,
    updateSettings,
    dismissError,
  };
}

/** 默认 system prompt 回退（AGENT_PERSONAS.default 已是 DEFAULT_SYSTEM_PROMPT） */
const DEFAULT_SYSTEM_PROMPT_FALLBACK = AGENT_PERSONAS.default;
