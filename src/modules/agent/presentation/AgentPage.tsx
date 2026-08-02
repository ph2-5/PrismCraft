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
 *
 * 组件拆分（P2.2）：
 * - AgentHeader：头部面板切换 + 4 个下拉面板
 * - AgentMessageList：消息虚拟化列表 + 自动滚动 + 断点恢复横幅
 * - AgentInputArea / QuickActions：底部输入区（保留在本文件）
 */

"use client";

import { useState } from "react";
import { useAgent } from "../hooks/use-agent";
import { AgentHeader } from "./AgentHeader";
import { AgentMessageList } from "./AgentMessageList";
import { SessionHistory } from "./SessionHistory";
import { t } from "@/shared/constants";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
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
  Wrench,
  BookOpen,
  Search,
  Stethoscope,
  X,
} from "lucide-react";

interface QuickActionsProps {
  disabled: boolean;
  onPick: (text: string) => void;
}

/** 输入框上方的意图快捷按钮 */
function QuickActions({ disabled, onPick }: QuickActionsProps) {
  const actions: Array<{ icon: React.ComponentType<{ className?: string }>; text: string; label: string }> = [
    { icon: Wrench, text: t("agent.quickActionApiConfigPrompt"), label: t("agent.quickActionApiConfig") },
    { icon: BookOpen, text: t("agent.quickActionImportNovelPrompt"), label: t("agent.quickActionImportNovel") },
    { icon: Search, text: t("agent.quickActionSearchAssetsPrompt"), label: t("agent.quickActionSearchAssets") },
    { icon: Stethoscope, text: t("agent.quickActionDiagnosePrompt"), label: t("agent.quickActionDiagnose") },
  ];
  return (
    <div className="mx-auto mb-2 flex max-w-3xl gap-2">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => onPick(a.text)}
          disabled={disabled}
          className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
          title={a.label}
        >
          <a.icon className="h-3 w-3" />
          {a.label}
        </button>
      ))}
    </div>
  );
}

interface AgentInputAreaProps {
  input: string;
  setInput: (v: string) => void;
  isStreaming: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

/** 输入区：快捷按钮 + textarea + 发送/停止按钮 */
function AgentInputArea({
  input,
  setInput,
  isStreaming,
  onSubmit,
  onCancel,
  onKeyDown,
}: AgentInputAreaProps) {
  return (
    <div className="border-t border-border bg-background p-4">
      <QuickActions disabled={isStreaming} onPick={setInput} />
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("agent.inputPlaceholder")}
          aria-label={t("agent.inputPlaceholder")}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          style={{ minHeight: "40px", maxHeight: "200px" }}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button
            onClick={onCancel}
            className="flex h-10 items-center gap-1 rounded-lg bg-destructive px-4 text-sm text-destructive-foreground hover:bg-destructive/90"
          >
            <Square className="h-4 w-4" />
            {t("agent.stop")}
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!input.trim()}
            className="flex h-10 items-center gap-1 rounded-lg bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {t("agent.send")}
          </button>
        )}
      </div>
    </div>
  );
}

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
    interruptedSessions,
    resumeInterruptedSession,
    dismissInterruptedSession,
    dismissError,
  } = useAgent();

  const [input, setInput] = useState("");
  const [showMemory, setShowMemory] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const [showSpecialists, setShowSpecialists] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  // Task 4.9 子项 2：导出下拉菜单
  const [showExportMenu, setShowExportMenu] = useState(false);

  // P1-4：跳转到独立设置页（替代原下拉面板）
  const { guardedPush } = useNavigationGuard();
  const handleOpenSettingsPage = () => {
    void guardedPush("/agent/settings");
  };

  /** 关闭其他面板，仅保留目标面板（设置已迁移到独立页面，不再列入） */
  const showOnly = (target: "audit" | "memory" | "plugins" | "specialists") => {
    setShowAudit(target === "audit");
    setShowMemory(target === "memory");
    setShowPlugins(target === "plugins");
    setShowSpecialists(target === "specialists");
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
        <AgentHeader
          session={session}
          isStreaming={isStreaming}
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory(!showHistory)}
          showMemory={showMemory}
          showPlugins={showPlugins}
          showSpecialists={showSpecialists}
          showAudit={showAudit}
          showExportMenu={showExportMenu}
          onToggleMemory={() => (showMemory ? setShowMemory(false) : showOnly("memory"))}
          onTogglePlugins={() => (showPlugins ? setShowPlugins(false) : showOnly("plugins"))}
          onToggleSpecialists={() => (showSpecialists ? setShowSpecialists(false) : showOnly("specialists"))}
          onToggleAudit={() => (showAudit ? setShowAudit(false) : showOnly("audit"))}
          onOpenSettings={handleOpenSettingsPage}
          onClear={handleClear}
          onToggleExportMenu={() => setShowExportMenu(!showExportMenu)}
          onExport={handleExport}
          onDelegate={handleDelegate}
        />

        {/* 消息列表（含虚拟化和自动滚动） */}
        <AgentMessageList
          session={session}
          toolExecutions={toolExecutions}
          renderVersion={renderVersion}
          interruptedSessions={interruptedSessions}
          onResume={resumeInterruptedSession}
          onDismiss={dismissInterruptedSession}
          onDismissAll={handleDismissAll}
        />

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
        <AgentInputArea
          input={input}
          setInput={setInput}
          isStreaming={isStreaming}
          onSubmit={handleSubmit}
          onCancel={cancel}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}
