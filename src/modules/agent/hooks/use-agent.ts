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
import { registerAllTools, loadToolPlugins } from "../tools";
import { AGENT_PERSONAS, type AgentPersona } from "../domain/prompts";
// session-storage 和 session-checkpoint 已拆分至 @/modules/agent-session（阶段2-b）
import {
  persistSession,
  loadSession,
  listSessions,
  deleteSession,
  type SessionListItem,
} from "@/modules/agent-session";
import {
  markRunningAsInterrupted,
  markInterrupted,
  listInterruptedSessions,
  loadInterruptedSession,
  type CheckpointIndexEntry,
} from "@/modules/agent-session";
import {
  shouldExtract,
  extractFromConversation,
  applyExtractedMemory,
  ensureSeedMemory,
} from "@/modules/agent-memory";
import { usePreference } from "@/shared/utils/preferences";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { eventBus } from "@/shared/event-bus";
import { DomainEvents } from "@/shared/event-types";
import { toolRegistry } from "../services/tool-registry";
import type { ModelSelection } from "@/domain/schemas";

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
  /** Agent 主 LLM 使用的文本模型（null=使用全局 mapping 的 text capability） */
  textModel?: ModelSelection | null;
}

const DEFAULT_SETTINGS: AgentSettings = {
  persona: "default",
  maxIterations: 10,
  temperature: 0.7,
  textModel: null,
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
async function triggerMemoryExtraction(
  session: AgentSession,
  options?: { providerId?: string; modelId?: string },
): Promise<void> {
  try {
    if (!shouldExtract(session.messages)) return;
    const extracted = await extractFromConversation(session.messages, session.id, options);
    if (!extracted) return;
    await applyExtractedMemory(extracted, session.id);
  } catch (e) {
    // 记忆抽取失败不影响主流程，但记录日志便于排查
    errorLogger.warn("[Agent] 记忆抽取失败", e);
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
        try {
          const { taskId, videoUrl } = payload as { taskId: string; videoUrl?: string };
          const urlHint = videoUrl ? `，videoUrl=${videoUrl}` : "";
          systemHintRef.current = [
            "## 系统事件通知",
            "",
            `视频任务刚刚完成：taskId=\`${taskId}\`${urlHint}。`,
            "系统已自动执行一致性 QC 并将 QCReport 写入 StoryBeat.qcReport。",
            "",
            "响应建议：",
            "- 若用户询问视频质量或一致性，优先调用 `check_video_consistency(taskId=\"" + taskId + "\")` 获取 cached QCReport",
            "- 若 verdict=drift_critical，告知用户并询问是否触发 `dispatch_video_fallback`",
            "- 不要主动调用 QC 工具，除非用户明确询问",
          ].join("\n");
        } catch (e) {
          errorLogger.warn("[useAgent] VIDEO_TASK_COMPLETED 订阅处理失败", e);
        }
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
    void (async () => {
      // P5 断点恢复：启动时将所有 running 状态的检查点标记为 interrupted
      await markRunningAsInterrupted();
      // 预训练数据-3：首次启动时注入种子记忆（通用动画创作知识 + 项目最佳实践）
      // 幂等：已注入标记存在则跳过，不阻断主流程
      await ensureSeedMemory();
      await refreshInterruptedSessions();
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
    const triggerAutoSave = () => {
      const session = sessionRef.current;
      // 只有有消息的会话才保存
      if (session.messages.length === 0) return;

      // 流式输出中：先 abort + 标记中断（便于下次启动时 listInterruptedSessions 展示）
      if (isStreamingRef.current) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        if (loopRef.current) {
          loopRef.current.abort();
        }
        // fire-and-forget 标记中断（不 await，避免阻塞 unload）
        void markInterrupted(session.id).catch((e) => {
          errorLogger.warn("[Agent] beforeunload markInterrupted 失败", e);
        });
      }

      // fire-and-forget 保存会话（IPC 异步，但请求已发出主进程会处理）
      void persistSession(session).catch((e) => {
        errorLogger.warn("[Agent] beforeunload persistSession 失败", e);
      });
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const session = sessionRef.current;
      // 空会话不触发对话框
      if (session.messages.length === 0) return;

      triggerAutoSave();

      // Chromium / Electron：returnValue 非空触发"确认离开"对话框，争取 IPC 写入时间
      // 注意：部分浏览器忽略自定义文案，只显示通用提示
      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    const handleVisibilityChange = () => {
      // 页面隐藏（标签切换/最小化）时触发，比 beforeunload 更可靠
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
  }, []); // 空依赖：只在 mount 时注册一次，通过 ref 同步最新状态

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      setError(null);
      setIsStreaming(true);
      // Task 4.9 子项 8：通知侧边栏 AI 状态指示器
      eventBus.emit(DomainEvents.AGENT_THINKING, { sessionId: sessionRef.current.id });

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
          // 危险工具确认回调：弹出确认对话框，用户确认后执行
          onConfirmationRequired: async (toolCall: ToolCall) => {
            const toolName = toolCall.function.name;

            // P1-C：从 toolRegistry 获取工具描述和危险等级
            const toolImpl = toolRegistry.get(toolName);
            const toolDesc = toolImpl?.def.function.description ?? "";
            const dangerLevel = toolImpl?.dangerLevel ?? (toolImpl?.requiresConfirmation ? "destructive" : "safe");

            // 解析参数为 key-value 格式（字段化展示）
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = toolCall.function.arguments
                ? JSON.parse(toolCall.function.arguments)
                : {};
            } catch {
              // 解析失败时用原始字符串
            }

            // 构建参数列表文本（key-value 格式）
            const argEntries = Object.entries(parsedArgs);
            let argsText: string;
            if (argEntries.length > 0) {
              argsText = argEntries.map(([key, val]) => {
                const valStr = typeof val === "string" ? val : JSON.stringify(val);
                const truncated = valStr.length > 100 ? valStr.slice(0, 100) + "…" : valStr;
                return `  ${key}: ${truncated}`;
              }).join("\n");
            } else {
              argsText = `  ${toolCall.function.arguments?.slice(0, 500) ?? "(无参数)"}`;
            }

            // 构建风险等级标签
            const dangerLabel = dangerLevel === "destructive"
              ? t("agent.dangerLevelDestructive")
              : dangerLevel === "limited"
                ? t("agent.dangerLevelLimited")
                : t("agent.dangerLevelSafe");

            // 构建描述：工具描述 + 风险等级 + 参数
            const descParts: string[] = [
              t("agent.confirmToolDescription"),
              "",
              `${t("agent.confirmToolName")}: ${toolName}`,
            ];
            if (toolDesc) {
              // 工具描述截断到 200 字符
              const descTrunc = toolDesc.length > 200 ? toolDesc.slice(0, 200) + "…" : toolDesc;
              descParts.push(`${t("agent.confirmToolDescLabel")}: ${descTrunc}`);
            }
            descParts.push(`${t("agent.confirmDangerLevel")}: ${dangerLabel}`);
            descParts.push(`${t("agent.confirmToolArgs")}:`);
            descParts.push(argsText);

            return confirm({
              title: t("agent.confirmToolTitle"),
              description: descParts.join("\n"),
              confirmText: t("agent.confirmToolDanger"),
              variant: "danger",
            });
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
          triggerRender(); // 立即更新 UI，避免依赖 finally 中的 triggerRender 延迟刷新标题
        }
        // 发送完成后自动保存会话
        await saveCurrentSession();
        // 异步触发记忆抽取（不阻断 UI，失败静默）
        void triggerMemoryExtraction(sessionRef.current, {
          providerId: settings.textModel?.providerId,
          modelId: settings.textModel?.modelId,
        });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err.message);
        // Task 4.9 子项 8：通知侧边栏 AI 状态指示器
        eventBus.emit(DomainEvents.AGENT_ERROR, { sessionId: sessionRef.current.id, error: err.message });
      } finally {
        setIsStreaming(false);
        loopRef.current = null;
        abortControllerRef.current = null;
        // P2 集成：清空 systemHint（一次性消费，避免污染后续无关对话）
        systemHintRef.current = undefined;
        triggerRender();
        // Task 4.9 子项 8：通知侧边栏 AI 状态指示器
        eventBus.emit(DomainEvents.AGENT_COMPLETED, { sessionId: sessionRef.current.id });
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
    // Task 4.9 子项 8：通知侧边栏 AI 状态指示器
    eventBus.emit(DomainEvents.AGENT_COMPLETED, { sessionId: sessionRef.current.id });
  }, []);

  const clearSession = useCallback(() => {
    if (isStreaming) {
      cancel();
    }
    // 保存当前会话前，先异步触发记忆抽取（不阻断清空操作）
    const currentSession = sessionRef.current;
    if (currentSession.messages.length > 0) {
      void triggerMemoryExtraction(currentSession, {
        providerId: settings.textModel?.providerId,
        modelId: settings.textModel?.modelId,
      })
        .then(() =>
          persistSession(currentSession)
            .then(() => refreshHistory())
            .catch((e) => {
              // P1-4 修复：保存失败时通过 toast 提示用户
              errorLogger.warn("[Agent] 会话保存失败", e);
              emitToast("error", t("agent.saveFailedTitle"), t("agent.saveFailedMessage"));
            }),
        )
        .catch((e) => {
          errorLogger.warn("[Agent] 记忆抽取或会话保存失败", e);
          emitToast("error", t("agent.saveFailedTitle"), t("agent.saveFailedMessage"));
        });
    }
    // 创建新会话
    sessionRef.current = createNewSession();
    setToolExecutions([]);
    setError(null);
    triggerRender();
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

  /** 恢复中断的会话（P5 断点恢复） */
  const resumeInterruptedSession = useCallback(
    async (sessionId: string) => {
      if (isStreaming) return;
      // 保存当前会话
      await saveCurrentSession();
      // 加载中断会话（会自动修正过期的 running 状态）
      const loaded = await loadInterruptedSession(sessionId);
      if (loaded) {
        sessionRef.current = loaded;
        setToolExecutions([]);
        setError(null);
        triggerRender();
      }
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
