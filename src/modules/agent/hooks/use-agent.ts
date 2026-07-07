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
  ToolResult,
  AgentLoopConfig,
} from "../domain/types";
import { createEmptySession } from "../domain/types";
import type { StreamChunk, ToolCall } from "@/domain/ports/ai-provider-port";
import { AgentLoop } from "../services/agent-loop";
import { registerAllTools } from "../tools";
import { AGENT_PERSONAS, type AgentPersona } from "../domain/prompts";
import {
  persistSession,
  loadSession,
  listSessions,
  deleteSession,
  type SessionListItem,
} from "../services/session-storage";
import {
  shouldExtract,
  extractFromConversation,
  applyExtractedMemory,
} from "../services/memory-service";
import { usePreference } from "@/shared/utils/preferences";
import { t } from "@/shared/constants";

/** 创建新会话（带 i18n 默认标题） */
function createNewSession(): AgentSession {
  const session = createEmptySession();
  session.title = t("agent.newSession");
  return session;
}

/** Agent 设置（持久化到 localStorage） */
export interface AgentSettings {
  persona: AgentPersona;
  maxIterations: number;
  temperature: number;
}

const DEFAULT_SETTINGS: AgentSettings = {
  persona: "default",
  maxIterations: 10,
  temperature: 0.7,
};

const SETTINGS_KEY = "agent-settings";

/** 会话标题最大长度 */
const MAX_TITLE_LENGTH = 30;

/**
 * 根据第一条用户消息生成会话标题
 * - 截断到 30 字符
 * - 去除首尾空白和换行
 */
function generateSessionTitle(session: AgentSession): string {
  const firstUserMsg = session.messages.find((m) => m.role === "user");
  if (!firstUserMsg || !firstUserMsg.content) {
    return t("agent.newSession");
  }
  const title = firstUserMsg.content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
  return title || t("agent.newSession");
}

/**
 * 异步触发记忆抽取（不阻断 UI，失败静默）
 *
 * 触发条件：用户消息数达到阈值
 * 流程：LLM 抽取 → 合并到核心记忆 + 追加摘要到归档记忆
 */
async function triggerMemoryExtraction(session: AgentSession): Promise<void> {
  try {
    if (!shouldExtract(session.messages)) return;
    const extracted = await extractFromConversation(session.messages, session.id);
    if (!extracted) return;
    await applyExtractedMemory(extracted, session.id);
  } catch {
    // 记忆抽取失败不影响主流程
  }
}

export interface UseAgentReturn {
  /** 当前会话 */
  session: AgentSession;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 工具执行记录 */
  toolExecutions: ToolExecution[];
  /** 错误信息 */
  error: string | null;
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
  /** 当前设置 */
  settings: AgentSettings;
  /** 更新设置 */
  updateSettings: (partial: Partial<AgentSettings>) => void;
}

export function useAgent(): UseAgentReturn {
  // 首次调用时注册工具
  useEffect(() => {
    registerAllTools();
  }, []);

  // 持久化设置
  const [settings, setSettings] = usePreference<AgentSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);

  const sessionRef = useRef<AgentSession>(createEmptySession());
  const loopRef = useRef<AgentLoop | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [, forceUpdate] = useState({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historySessions, setHistorySessions] = useState<SessionListItem[]>([]);

  const triggerRender = useCallback(() => {
    forceUpdate({});
  }, []);

  /** 刷新历史会话列表 */
  const refreshHistory = useCallback(async () => {
    try {
      const items = await listSessions();
      setHistorySessions(items);
    } catch {
      // 静默失败，历史列表不影响主流程
    }
  }, []);

  // 初始化：加载最近的会话 + 历史列表
  useEffect(() => {
    void (async () => {
      await refreshHistory();
      // 如果有历史会话，加载最近的一个
      const items = await listSessions();
      if (items.length > 0 && items[0]) {
        const latest = await loadSession(items[0].id);
        if (latest && latest.messages.length > 0) {
          sessionRef.current = latest;
          triggerRender();
        }
      }
    })();
     
  }, []);

  /** 根据设置构建 AgentLoopConfig */
  const buildConfig = useCallback((): Partial<AgentLoopConfig> => {
    const persona = AGENT_PERSONAS[settings.persona] ?? DEFAULT_SYSTEM_PROMPT_FALLBACK;
    return {
      maxIterations: settings.maxIterations,
      temperature: settings.temperature,
      systemPromptOverride: settings.persona === "default" ? undefined : persona,
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
    } catch {
      // 保存失败不阻断主流程
    }
  }, [refreshHistory]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      // 创建取消控制器
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const session = sessionRef.current;

      const loop = new AgentLoop(
        session,
        {
          onChunk: (_chunk: StreamChunk) => {
            // session 已被 loop 直接修改，触发渲染
            triggerRender();
          },
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
          onError: (err: Error) => {
            setError(err.message);
          },
          signal: abortController.signal,
        },
        buildConfig(),
      );

      loopRef.current = loop;

      try {
        await loop.run(text);
        // 自动生成会话标题（首次发送时）
        if (sessionRef.current.title === t("agent.newSession")) {
          sessionRef.current.title = generateSessionTitle(sessionRef.current);
        }
        // 发送完成后自动保存会话
        await saveCurrentSession();
        // 异步触发记忆抽取（不阻断 UI，失败静默）
        void triggerMemoryExtraction(sessionRef.current);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err.message);
      } finally {
        setIsStreaming(false);
        loopRef.current = null;
        abortControllerRef.current = null;
        triggerRender();
      }
    },
    [isStreaming, buildConfig, triggerRender, saveCurrentSession],
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (loopRef.current) {
      loopRef.current.abort();
    }
    setIsStreaming(false);
  }, []);

  const clearSession = useCallback(() => {
    if (isStreaming) {
      cancel();
    }
    // 保存当前会话前，先异步触发记忆抽取（不阻断清空操作）
    const currentSession = sessionRef.current;
    if (currentSession.messages.length > 0) {
      void triggerMemoryExtraction(currentSession).then(() => {
        void persistSession(currentSession).then(() => refreshHistory());
      });
    }
    // 创建新会话
    sessionRef.current = createNewSession();
    setToolExecutions([]);
    setError(null);
    triggerRender();
  }, [isStreaming, cancel, refreshHistory, triggerRender]);

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
      // 保存当前会话
      await saveCurrentSession();
      // 加载目标会话
      const loaded = await loadSession(sessionId);
      if (loaded) {
        sessionRef.current = loaded;
        setToolExecutions([]);
        setError(null);
        triggerRender();
      }
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

  /** 更新设置 */
  const updateSettings = useCallback(
    (partial: Partial<AgentSettings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
    },
    [setSettings],
  );

  return {
    session: sessionRef.current,
    isStreaming,
    toolExecutions,
    error,
    sendMessage,
    cancel,
    clearSession,
    setSessionTitle,
    historySessions,
    loadHistorySession,
    deleteHistorySession,
    refreshHistory,
    settings,
    updateSettings,
  };
}

/** 默认 system prompt 回退（AGENT_PERSONAS.default 已是 DEFAULT_SYSTEM_PROMPT） */
const DEFAULT_SYSTEM_PROMPT_FALLBACK = AGENT_PERSONAS.default;
