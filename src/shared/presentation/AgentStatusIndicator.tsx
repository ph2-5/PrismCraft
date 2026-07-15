import { useEffect, useState } from "react";
import { eventBus } from "@/shared/event-bus";
import { DomainEvents } from "@/shared/event-types";
import { t } from "@/shared/constants";
import { cn } from "@/shared/utils/utils";

type AgentStatus = "idle" | "thinking" | "error";

interface AgentStatusIndicatorProps {
  collapsed: boolean;
}

/**
 * AgentStatusIndicator — 侧边栏 AI 状态指示器。
 *
 * 通过 eventBus 订阅 Agent 模块的 THINKING/COMPLETED/ERROR 事件，
 * 显示当前 AI 工作状态（空闲/思考中/出错）。
 * 折叠态仅显示彩色圆点，展开态显示圆点 + 文字。
 */
export function AgentStatusIndicator({ collapsed }: AgentStatusIndicatorProps) {
  const [status, setStatus] = useState<AgentStatus>("idle");

  useEffect(() => {
    const subs = [
      eventBus.on(DomainEvents.AGENT_THINKING, () => setStatus("thinking")),
      eventBus.on(DomainEvents.AGENT_COMPLETED, () => setStatus("idle")),
      eventBus.on(DomainEvents.AGENT_ERROR, () => setStatus("error")),
    ];
    return () => subs.forEach((s) => s.unsubscribe());
  }, []);

  const dotClass = cn(
    "ai-status-dot",
    status === "idle" && "ok",
    status === "thinking" && "thinking",
    status === "error" && "error",
  );

  const labelKey =
    status === "idle"
      ? "agent.statusIdle"
      : status === "thinking"
        ? "agent.statusThinking"
        : "agent.statusError";

  return (
    <div
      className={cn("ai-status-indicator", collapsed && "is-collapsed")}
      role="status"
      aria-live="polite"
      aria-label={t(labelKey)}
      title={collapsed ? t(labelKey) : undefined}
    >
      <span className={dotClass} />
      {!collapsed && <span className="ai-status-text">{t(labelKey)}</span>}
    </div>
  );
}
