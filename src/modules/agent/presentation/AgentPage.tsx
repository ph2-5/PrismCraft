/**
 * Agent 助手主页面
 *
 * 布局遵循用户偏好：
 * - 输入框固定在页面底部
 * - 消息从顶部开始，自然填充
 * - DOM 结构扁平化
 * - 流式输出实时显示
 * - 左侧历史会话侧边栏（可折叠）
 * - 头部设置面板（persona/参数）
 *
 * 全部文案使用 t() 国际化
 */

"use client";

import { useRef, useEffect, useState } from "react";
import { useAgent } from "../hooks/use-agent";
import { AgentMessageView } from "./AgentMessage";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import { CheckpointRecovery } from "./CheckpointRecovery";
import { MemoryPanel } from "./MemoryPanel";
import { SessionHistory } from "./SessionHistory";
import { ToolPluginManager } from "./ToolPluginManager";
import { SpecialistPanel } from "./SpecialistPanel";
import { AuditLogPanel } from "./AuditLogPanel";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { confirm } from "@/shared/utils/confirm";
import {
  buildExportFilename,
  serializeSessionAsJSON,
  serializeSessionAsMarkdown,
  type ExportFormat,
} from "@/modules/agent-session";
import { downloadJSONFile, downloadMarkdownFile } from "@/shared/utils/file-download";
import {
  Send,
  Square,
  Trash2,
  Bot,
  Brain,
  Settings as SettingsIcon,
  PanelLeft,
  PanelLeftClose,
  Search,
  BarChart3,
  Video,
  Package,
  Users,
  ScrollText,
  X,
  Download,
  ChevronDown,
} from "lucide-react";

export function AgentPage() {
  const {
    session,
    isStreaming,
    toolExecutions,
    error,
    renderVersion,
    sendMessage,
    cancel,
    clearSession,
    historySessions,
    loadHistorySession,
    deleteHistorySession,
    refreshHistory,
    interruptedSessions,
    resumeInterruptedSession,
    dismissInterruptedSession,
    settings,
    updateSettings,
    dismissError,
  } = useAgent();

  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const [showSpecialists, setShowSpecialists] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  // Task 4.9 子项 2：导出下拉菜单
  const [showExportMenu, setShowExportMenu] = useState(false);

  /** 关闭其他面板，仅保留目标面板 */
  const showOnly = (target: "audit" | "memory" | "plugins" | "specialists" | "settings") => {
    setShowAudit(target === "audit");
    setShowMemory(target === "memory");
    setShowPlugins(target === "plugins");
    setShowSpecialists(target === "specialists");
    setShowSettings(target === "settings");
  };

  /** Task 4.9 子项 2：导出当前会话 */
  const handleExport = (format: ExportFormat) => {
    if (session.messages.length === 0) return;
    const filename = buildExportFilename(session, format);
    if (format === "json") {
      downloadJSONFile(JSON.parse(serializeSessionAsJSON(session)), filename);
    } else {
      downloadMarkdownFile(serializeSessionAsMarkdown(session), filename);
    }
    setShowExportMenu(false);
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // P1-3 修复：自动滚动到最新消息
  // 原问题：session.messages 被 conversation-manager 原地修改（push、content +=），引用不变，
  // useEffect 依赖 [session.messages, toolExecutions] 不触发自动滚动。
  // 修复：改用递增的 renderVersion 作为依赖，每次 session 变更（包括 delta）都触发滚动。
  // 使用 "auto" 而非 "smooth" 避免流式输出时频繁 smooth 滚动卡顿。
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [renderVersion, toolExecutions]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleClear = async () => {
    if (session.messages.length > 0) {
      const ok = await confirm({
        description: t("agent.confirmClear"),
        variant: "danger",
      });
      if (!ok) return;
    }
    clearSession();
  };

  /** 忽略全部中断会话 */
  const handleDismissAll = async () => {
    await Promise.all(
      interruptedSessions.map((entry) => dismissInterruptedSession(entry.sessionId)),
    );
  };

  /** 委派任务给专家（通过 sendMessage 发送格式化指令） */
  const handleDelegate = async (specialistId: string, task: string, context: string) => {
    const instruction = context
      ? `请委派任务给专家 \`${specialistId}\`：\n任务：${task}\n上下文：${context}`
      : `请委派任务给专家 \`${specialistId}\`：\n${task}`;
    await sendMessage(instruction);
  };

  return (
    <div className="flex h-full">
      {/* 左侧：历史会话侧边栏 */}
      {showHistory && (
        <div className="w-64 max-w-[80vw] shrink-0 border-r border-border bg-background/50">
          <SessionHistory
            sessions={historySessions}
            currentSessionId={session.id}
            onLoad={loadHistorySession}
            onDelete={deleteHistorySession}
            onNew={clearSession}
          />
        </div>
      )}

      {/* 右侧：主对话区 */}
      <div className="flex flex-1 flex-col">
        {/* 头部 */}
        <div className="relative flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={showHistory ? t("agent.hideHistory") : t("agent.showHistory")}
              aria-label={showHistory ? t("agent.hideHistory") : t("agent.showHistory")}
            >
              {showHistory ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </button>
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">{t("agent.title")}</h1>
            {session.title !== t("agent.newSession") && (
              <span className="text-xs text-muted-foreground">· {session.title}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (showMemory) setShowMemory(false);
                else showOnly("memory");
              }}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t("agent.memory.management")}
              aria-label={t("agent.memory.management")}
            >
              <Brain className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (showPlugins) setShowPlugins(false);
                else showOnly("plugins");
              }}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t("agent.plugin.management")}
              aria-label={t("agent.plugin.management")}
            >
              <Package className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (showSpecialists) setShowSpecialists(false);
                else showOnly("specialists");
              }}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t("agent.specialist.management")}
              aria-label={t("agent.specialist.management")}
            >
              <Users className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (showAudit) setShowAudit(false);
                else showOnly("audit");
              }}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t("agent.audit.management")}
              aria-label={t("agent.audit.management")}
            >
              <ScrollText className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (showSettings) setShowSettings(false);
                else {
                  showOnly("settings");
                  void refreshHistory();
                }
              }}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t("agent.settings")}
              aria-label={t("agent.settings")}
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleClear}
              disabled={isStreaming}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              title={t("agent.clearSession")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("agent.clear")}
            </button>
            {/* Task 4.9 子项 2：导出当前会话 */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={isStreaming || session.messages.length === 0}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                title={t("agent.history.exportSession")}
                aria-label={t("agent.history.exportSession")}
                aria-expanded={showExportMenu}
              >
                <Download className="h-3.5 w-3.5" />
                {t("agent.history.export")}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showExportMenu && (
                <>
                  {/* 点击外部关闭 */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowExportMenu(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-md border border-border bg-popover shadow-md">
                    <button
                      onClick={() => handleExport("json")}
                      className="block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                    >
                      {t("agent.history.exportAsJson")}
                    </button>
                    <button
                      onClick={() => handleExport("markdown")}
                      className="block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                    >
                      {t("agent.history.exportAsMarkdown")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 设置面板（下拉） */}
          {showSettings && (
            <AgentSettingsPanel
              settings={settings}
              onUpdate={updateSettings}
              onClose={() => setShowSettings(false)}
            />
          )}

          {/* 记忆管理面板（下拉） */}
          {showMemory && (
            <MemoryPanel onClose={() => setShowMemory(false)} />
          )}

          {/* 工具插件管理面板（下拉） */}
          {showPlugins && (
            <ToolPluginManager onClose={() => setShowPlugins(false)} />
          )}

          {/* 专家 Agent 管理面板（下拉） */}
          {showSpecialists && (
            <SpecialistPanel
              onClose={() => setShowSpecialists(false)}
              onDelegate={handleDelegate}
            />
          )}

          {/* 审计日志面板（下拉） */}
          {showAudit && (
            <AuditLogPanel onClose={() => setShowAudit(false)} />
          )}
        </div>

        {/* 消息列表 */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          {/* P5 断点恢复：中断会话恢复横幅 */}
          <CheckpointRecovery
            interruptedSessions={interruptedSessions}
            onResume={resumeInterruptedSession}
            onDismiss={dismissInterruptedSession}
            onDismissAll={handleDismissAll}
          />

          {session.messages.length === 0 ? (
            <EmptyState
              icon={Bot}
              title={t("agent.ready")}
              description={t("agent.intro")}
            >
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { icon: Search, text: t("agent.suggestion.queryCharacters") },
                  { icon: SettingsIcon, text: t("agent.suggestion.configureApi") },
                  { icon: BarChart3, text: t("agent.suggestion.projectStatus") },
                  { icon: Video, text: t("agent.suggestion.failedTasks") },
                ].map((s) => (
                  <div
                    key={s.text}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  >
                    <s.icon className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">{s.text}</span>
                  </div>
                ))}
              </div>
            </EmptyState>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {session.messages.map((msg) => (
                <AgentMessageView
                  key={msg.id}
                  message={msg}
                  toolExecutions={toolExecutions}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 错误提示（P1-4 修复：可关闭） */}
        {error && (
          <div className="flex items-center justify-between gap-2 border-t border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <span className="flex-1 break-words">{error}</span>
            <button
              onClick={dismissError}
              className="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/10"
              aria-label={t("agent.dismissError")}
              title={t("agent.dismissError")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* 输入区（固定底部） */}
        <div className="border-t border-border bg-background p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("agent.inputPlaceholder")}
              aria-label={t("agent.inputPlaceholder")}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              style={{ minHeight: "40px", maxHeight: "200px" }}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button
                onClick={cancel}
                className="flex h-10 items-center gap-1 rounded-lg bg-destructive px-4 text-sm text-destructive-foreground hover:bg-destructive/90"
              >
                <Square className="h-4 w-4" />
                {t("agent.stop")}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="flex h-10 items-center gap-1 rounded-lg bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {t("agent.send")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
