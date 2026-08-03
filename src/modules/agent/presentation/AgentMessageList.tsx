/**
 * Agent 消息列表组件
 *
 * 从 AgentPage.tsx 抽离，包含：
 * - 断点恢复横幅（CheckpointRecovery）
 * - 空状态引导（EmptyState + 建议卡片）
 * - 消息虚拟化列表（useVirtualizer + 动态测量）
 * - 自动滚动到最新消息（依赖 renderVersion 触发）
 *
 * 拆离原因：AgentPage 主函数超过 lint 上限 300 行，消息列表逻辑独立性强。
 */

"use client";

import { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bot, Search, Settings as SettingsIcon, BarChart3, Video } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { AgentSession, ToolExecution } from "../domain/types";
import type { CheckpointIndexEntry } from "@/modules/agent-session";
import { AgentMessageView } from "./AgentMessage";
import { CheckpointRecovery } from "./CheckpointRecovery";

export interface AgentMessageListProps {
  session: AgentSession;
  toolExecutions: ToolExecution[];
  renderVersion: number;
  interruptedSessions: CheckpointIndexEntry[];
  onResume: (sessionId: string) => Promise<void>;
  onDismiss: (sessionId: string) => Promise<void>;
  onDismissAll: () => Promise<void>;
}

/** 空状态建议卡片配置（静态） */
const EMPTY_STATE_SUGGESTIONS = [
  { icon: Search, text: t("agent.suggestion.queryCharacters") },
  { icon: SettingsIcon, text: t("agent.suggestion.configureApi") },
  { icon: BarChart3, text: t("agent.suggestion.projectStatus") },
  { icon: Video, text: t("agent.suggestion.failedTasks") },
] as const;

/** Agent 消息列表（含虚拟化和自动滚动） */
export function AgentMessageList({
  session,
  toolExecutions,
  renderVersion,
  interruptedSessions,
  onResume,
  onDismiss,
  onDismissAll,
}: AgentMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const messages = session.messages;

  // 性能优化：消息列表虚拟化，仅渲染可见区域的消息项
  // - 消息内容高度差异大，用动态测量（measureElement）而非固定 estimateSize
  // - overscan=8 保证流式输出时上下文连续可见，减少滚动抖动
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 160,
    overscan: 8,
  });

  // P1-3 修复：自动滚动到最新消息
  // 原问题：session.messages 被 conversation-manager 原地修改（push、content +=），引用不变，
  // useEffect 依赖 [session.messages, toolExecutions] 不触发自动滚动。
  // 修复：改用递增的 renderVersion 作为依赖，每次 session 变更（包括 delta）都触发滚动。
  // 使用 "auto" 而非 "smooth" 避免流式输出时频繁 smooth 滚动卡顿。
  // 虚拟化后改用 scrollToIndex 直接定位到底部消息，而非依赖 messagesEndRef.scrollIntoView。
  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [renderVersion, toolExecutions, messages.length]);

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {/* P5 断点恢复：中断会话恢复横幅 */}
      <CheckpointRecovery
        interruptedSessions={interruptedSessions}
        onResume={onResume}
        onDismiss={onDismiss}
        onDismissAll={onDismissAll}
      />

      {session.messages.length === 0 ? (
        <EmptyState
          icon={Bot}
          title={t("agent.ready")}
          description={t("agent.intro")}
        >
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EMPTY_STATE_SUGGESTIONS.map((s) => (
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
        <div
          className="mx-auto max-w-3xl"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const msg = messages[virtualItem.index];
            if (!msg) return null;
            return (
              <div
                key={msg.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="py-2">
                  <AgentMessageView
                    message={msg}
                    toolExecutions={toolExecutions}
                  />
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}
