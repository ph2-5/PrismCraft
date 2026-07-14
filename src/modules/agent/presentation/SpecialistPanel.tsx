/**
 * P4 多 Agent 编排 - 专家 Agent 管理面板
 *
 * 让用户可视化查看和管理 Specialist Agent：
 * - 列出所有内置专家（含名称/描述/工具数/温度/迭代次数）
 * - 展开查看专家详情（可用工具列表 + system prompt 摘要）
 * - 手动委派任务（点击"委派任务"打开任务输入区）
 *
 * 委派方式：
 * 用户点击"委派任务"后输入任务描述，面板将格式化的委派指令
 * 通过 onDelegate 回调传给 AgentPage，由 sendMessage 发送给主 Agent。
 * 主 Agent 收到后会调用 delegate_to_specialist 工具执行委派。
 */

"use client";

import { useState, useEffect } from "react";
import { specialistRegistry } from "@/modules/agent-specialist";
import { t } from "@/shared/constants";
import {
  X,
  Users,
  ChevronDown,
  ChevronUp,
  Send,
  Wrench,
  Bot,
} from "lucide-react";

interface SpecialistPanelProps {
  onClose: () => void;
  /** 委派任务回调（将委派指令注入输入框或直接发送） */
  onDelegate: (specialistId: string, task: string, context: string) => void;
}

export function SpecialistPanel({ onClose, onDelegate }: SpecialistPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [delegateId, setDelegateId] = useState<string | null>(null);
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");

  const specialists = specialistRegistry.list();

  // a11y：Escape 关闭面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  /** 展开/收起详情 */
  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  /** 打开委派任务区 */
  const handleDelegateClick = (id: string) => {
    setDelegateId(id);
    setTask("");
    setContext("");
  };

  /** 执行委派 */
  const handleRunDelegate = () => {
    if (!delegateId || !task.trim()) return;
    onDelegate(delegateId, task.trim(), context.trim());
    // 关闭面板
    setDelegateId(null);
    setTask("");
    setContext("");
    onClose();
  };

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-96 rounded-lg border border-border bg-popover p-3 shadow-md">
      {/* 头部 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            {t("agent.specialist.management")}
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {t("agent.specialist.count", { count: specialists.length })}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("aria.close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 自动委派提示 */}
      <div className="mb-3 rounded bg-primary/5 px-2 py-1.5 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1 font-medium text-primary">
          <Bot className="h-3 w-3" />
          {t("agent.specialist.autoDelegate")}
        </div>
        <div className="mt-0.5">
          {t("agent.specialist.autoDelegateHint")}
        </div>
      </div>

      {/* 专家列表 */}
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {specialists.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <div className="text-xs text-muted-foreground">
              {t("agent.specialist.empty")}
            </div>
          </div>
        ) : (
          specialists.map((specialist) => (
            <div key={specialist.id}>
              {/* 专家卡片 */}
              <div className="rounded border border-border bg-background/50 p-2">
                {/* 标题行 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium">
                        {specialist.name}
                      </span>
                      <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] text-primary">
                        {t("agent.specialist.builtin")}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {specialist.id}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {/* 委派任务按钮 */}
                    <button
                      onClick={() => handleDelegateClick(specialist.id)}
                      className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90"
                      title={t("agent.specialist.delegate")}
                    >
                      <Send className="h-2.5 w-2.5" />
                      {t("agent.specialist.delegate")}
                    </button>
                    {/* 展开/收起 */}
                    <button
                      onClick={() => toggleExpand(specialist.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={expandedId === specialist.id ? t("agent.specialist.hideDetail") : t("agent.specialist.viewDetail")}
                    >
                      {expandedId === specialist.id ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* 描述 */}
                <div className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                  {specialist.description}
                </div>

                {/* 元信息 */}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span>
                    {t("agent.specialist.tools", {
                      count: specialist.enabledTools?.length ?? 0,
                    })}
                  </span>
                  {specialist.temperature !== undefined && (
                    <span>· {t("agent.specialist.temperature")}: {specialist.temperature}</span>
                  )}
                  {specialist.maxIterations !== undefined && (
                    <span>
                      · {t("agent.specialist.maxIterations", { count: specialist.maxIterations })}
                    </span>
                  )}
                </div>

                {/* 展开后的详情 */}
                {expandedId === specialist.id && (
                  <div className="mt-2 space-y-2 border-t border-border pt-2">
                    {/* 可用工具 */}
                    {specialist.enabledTools && specialist.enabledTools.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                          <Wrench className="h-2.5 w-2.5" />
                          {t("agent.specialist.enabledTools")}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {specialist.enabledTools.map((tool) => (
                            <span
                              key={tool}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 委派任务输入区（在对应专家下方展开） */}
              {delegateId === specialist.id && (
                <div className="mt-1 rounded border border-primary/40 bg-primary/5 p-2">
                  <div className="mb-1.5 text-xs font-medium">
                    {t("agent.specialist.delegateTitle", { name: specialist.name })}
                  </div>
                  <div className="mb-1.5 text-[10px] text-muted-foreground">
                    {t("agent.specialist.delegateHint")}
                  </div>
                  <textarea
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    placeholder={t("agent.specialist.taskPlaceholder")}
                    className="mb-1.5 h-16 w-full resize-none rounded border border-border bg-background p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    autoFocus
                  />
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder={t("agent.specialist.contextPlaceholder")}
                    className="mb-1.5 h-12 w-full resize-none rounded border border-border bg-background p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => {
                        setDelegateId(null);
                        setTask("");
                        setContext("");
                      }}
                      className="rounded border border-border px-2 py-1 text-[10px] hover:bg-muted"
                    >
                      {t("agent.specialist.cancel")}
                    </button>
                    <button
                      onClick={handleRunDelegate}
                      disabled={!task.trim()}
                      className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-2.5 w-2.5" />
                      {t("agent.specialist.run")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
