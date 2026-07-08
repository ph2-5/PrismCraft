/**
 * Agent 消息渲染 - 支持 user/assistant/tool 三种角色
 *
 * - assistant 消息用 Markdown 渲染（代码块、粗体、列表等）
 * - assistant 消息支持复制
 * - 流式输出时显示光标
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentMessage, ToolExecution } from "../domain/types";
import { ToolCallCard } from "./ToolCallCard";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { User, Bot, Copy, Check } from "lucide-react";
import { t } from "@/shared/constants";

interface AgentMessageViewProps {
  message: AgentMessage;
  toolExecutions: ToolExecution[];
}

export function AgentMessageView({ message, toolExecutions }: AgentMessageViewProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时静默失败
    }
  }, [message.content]);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[80%] items-start gap-2">
          <div className="whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            {message.content}
          </div>
          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (message.role === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[80%] items-start gap-2">
          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Bot className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            {message.content && (
              <div className="group relative rounded-lg bg-muted px-3 py-2">
                <MarkdownRenderer content={message.content} className="space-y-1" />
                {message.streaming && (
                  <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-foreground/60" />
                )}
                {/* 复制按钮（hover 显示） */}
                {!message.streaming && message.content.length > 0 && (
                  <button
                    onClick={handleCopy}
                    className="absolute -bottom-2 right-2 flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    title={t("agent.copyMessage")}
                  >
                    {copied ? (
                      <>
                        <Check className="h-2.5 w-2.5" />
                        {t("agent.copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="h-2.5 w-2.5" />
                        {t("agent.copyMessage")}
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-1 space-y-1">
                {message.toolCalls.map((tc) => {
                  const exec = toolExecutions.find((e) => e.id === tc.id);
                  if (exec) {
                    return <ToolCallCard key={tc.id} execution={exec} />;
                  }
                  return (
                    <ToolCallCard
                      key={tc.id}
                      execution={{
                        id: tc.id,
                        toolCall: tc,
                        status: "pending",
                        startedAt: Date.now(),
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // tool 消息（通常不直接显示，已通过 ToolCallCard 展示结果）
  // 仅在有 error 时显示错误提示
  if (message.role === "tool" && message.error) {
    return (
      <div className="ml-9 rounded bg-destructive/10 px-3 py-1 text-xs text-destructive">
        {message.error}
      </div>
    );
  }

  return null;
}
