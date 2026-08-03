/**
 * Agent 页面头部组件
 *
 * 从 AgentPage.tsx 抽离，包含：
 * - 历史侧边栏切换按钮
 * - 标题 + 会话名
 * - 面板切换按钮组（记忆/插件/专家/审计）
 * - 设置入口（跳转独立页）/ 清空 / 导出
 * - 4 个下拉面板（MemoryPanel / ToolPluginManager / SpecialistPanel / AuditLogPanel）
 *
 * 内部子组件：PanelToggleButton、ExportMenu
 */

"use client";

import {
  Bot,
  Brain,
  Settings as SettingsIcon,
  PanelLeft,
  PanelLeftClose,
  Trash2,
  Package,
  Users,
  ScrollText,
  Download,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { t } from "@/shared/constants";
import type { ExportFormat } from "@/modules/agent-session";
import type { AgentSession } from "../domain/types";
import { MemoryPanel } from "./MemoryPanel";
import { ToolPluginManager } from "./ToolPluginManager";
import { SpecialistPanel } from "./SpecialistPanel";
import { AuditLogPanel } from "./AuditLogPanel";

interface PanelToggleButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}

/** 头部面板切换按钮（统一图标按钮样式） */
function PanelToggleButton({ icon: Icon, label, onClick }: PanelToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

interface ExportMenuProps {
  show: boolean;
  disabled: boolean;
  onToggle: () => void;
  onExport: (format: ExportFormat) => void;
}

/** 导出会话下拉菜单 */
function ExportMenu({ show, disabled, onToggle, onExport }: ExportMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        disabled={disabled}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        title={t("agent.history.exportSession")}
        aria-label={t("agent.history.exportSession")}
        aria-expanded={show}
      >
        <Download className="h-3.5 w-3.5" />
        {t("agent.history.export")}
        <ChevronDown className="h-3 w-3" />
      </button>
      {show && (
        <>
          {/* 点击外部关闭 */}
          <div
            className="fixed inset-0 z-40"
            onClick={onToggle}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-md border border-border bg-popover shadow-md">
            <button
              onClick={() => onExport("json")}
              className="block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
            >
              {t("agent.history.exportAsJson")}
            </button>
            <button
              onClick={() => onExport("markdown")}
              className="block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
            >
              {t("agent.history.exportAsMarkdown")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export interface AgentHeaderProps {
  session: AgentSession;
  isStreaming: boolean;
  showHistory: boolean;
  onToggleHistory: () => void;
  showMemory: boolean;
  showPlugins: boolean;
  showSpecialists: boolean;
  showAudit: boolean;
  showExportMenu: boolean;
  onToggleMemory: () => void;
  onTogglePlugins: () => void;
  onToggleSpecialists: () => void;
  onToggleAudit: () => void;
  onOpenSettings: () => void;
  onClear: () => void;
  onToggleExportMenu: () => void;
  onExport: (format: ExportFormat) => void;
  onDelegate: (specialistId: string, task: string, context: string) => void;
}

/** Agent 页面头部 */
export function AgentHeader({
  session,
  isStreaming,
  showHistory,
  onToggleHistory,
  showMemory,
  showPlugins,
  showSpecialists,
  showAudit,
  showExportMenu,
  onToggleMemory,
  onTogglePlugins,
  onToggleSpecialists,
  onToggleAudit,
  onOpenSettings,
  onClear,
  onToggleExportMenu,
  onExport,
  onDelegate,
}: AgentHeaderProps) {
  return (
    <div className="relative flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleHistory}
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
        <PanelToggleButton
          icon={Brain}
          label={t("agent.memory.management")}
          onClick={onToggleMemory}
        />
        <PanelToggleButton
          icon={Package}
          label={t("agent.plugin.management")}
          onClick={onTogglePlugins}
        />
        <PanelToggleButton
          icon={Users}
          label={t("agent.specialist.management")}
          onClick={onToggleSpecialists}
        />
        <PanelToggleButton
          icon={ScrollText}
          label={t("agent.audit.management")}
          onClick={onToggleAudit}
        />
        {/* P1-4：设置已迁移到独立页面 /agent/settings */}
        <button
          onClick={onOpenSettings}
          className="relative rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={t("agent.openSettingsPage")}
          aria-label={t("agent.openSettingsPage")}
        >
          <SettingsIcon className="h-4 w-4" />
          <ExternalLink className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 text-muted-foreground/70" />
        </button>
        <button
          onClick={onClear}
          disabled={isStreaming}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          title={t("agent.clearSession")}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("agent.clear")}
        </button>
        <ExportMenu
          show={showExportMenu}
          disabled={isStreaming || session.messages.length === 0}
          onToggle={onToggleExportMenu}
          onExport={onExport}
        />
      </div>

      {/* 记忆管理面板（下拉） */}
      {showMemory && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={onToggleMemory}
            aria-hidden="true"
          />
          <MemoryPanel onClose={onToggleMemory} />
        </>
      )}

      {/* 工具插件管理面板（下拉） */}
      {showPlugins && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={onTogglePlugins}
            aria-hidden="true"
          />
          <ToolPluginManager onClose={onTogglePlugins} />
        </>
      )}

      {/* 专家 Agent 管理面板（下拉） */}
      {showSpecialists && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={onToggleSpecialists}
            aria-hidden="true"
          />
          <SpecialistPanel
            onClose={onToggleSpecialists}
            onDelegate={onDelegate}
          />
        </>
      )}

      {/* 审计日志面板（下拉） */}
      {showAudit && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={onToggleAudit}
            aria-hidden="true"
          />
          <AuditLogPanel onClose={onToggleAudit} />
        </>
      )}
    </div>
  );
}
