/**
 * 历史会话侧边栏
 *
 * 显示已保存的会话列表，支持：
 * - 加载历史会话
 * - 删除历史会话
 * - 新建会话
 * - Task 4.9 子项 2：按标题搜索过滤历史会话
 */

"use client";

import { useMemo, useState } from "react";
import type { SessionListItem } from "@/modules/agent-session";
import { searchSessionList } from "@/modules/agent-session";
import { t } from "@/shared/constants";
import { confirm } from "@/shared/utils/confirm";
import { formatRelativeTime } from "@/shared/utils/format";
import { MessageSquare, Plus, Trash2, Clock, Search, X } from "lucide-react";

interface SessionHistoryProps {
  sessions: SessionListItem[];
  currentSessionId: string;
  onLoad: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onNew: () => void;
}

export function SessionHistory({
  sessions,
  currentSessionId,
  onLoad,
  onDelete,
  onNew,
}: SessionHistoryProps) {
  // Task 4.9 子项 2：搜索框状态
  const [searchQuery, setSearchQuery] = useState("");

  // 按标题过滤（纯前端过滤，避免加载每个会话文件）
  const filteredSessions = useMemo(
    () => searchSessionList(sessions, searchQuery),
    [sessions, searchQuery],
  );

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* 新建会话按钮 */}
      <div className="border-b border-border p-2">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("agent.newSession")}
        </button>
      </div>

      {/* Task 4.9 子项 2：搜索框 */}
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("agent.history.searchPlaceholder")}
            aria-label={t("agent.history.searchPlaceholder")}
            className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-7 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
          {hasQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t("agent.history.clearSearch")}
              aria-label={t("agent.history.clearSearch")}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {hasQuery && (
          <div className="mt-1 px-1 text-[10px] text-muted-foreground">
            {t("agent.history.searchResultCount", { count: filteredSessions.length })}
          </div>
        )}
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
            <Clock className="mb-2 h-8 w-8 opacity-30" />
            {t("agent.noHistory")}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
            <Search className="mb-2 h-8 w-8 opacity-30" />
            {t("agent.history.noSearchResult")}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredSessions.map((session) => {
              const isActive = session.id === currentSessionId;
              return (
                <div
                  key={session.id}
                  className={`group flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors ${
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted"
                  }`}
                  onClick={() => !isActive && onLoad(session.id)}
                  role="button"
                  tabIndex={isActive ? -1 : 0}
                  aria-label={session.title}
                  onKeyDown={(e) => {
                    if (!isActive && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onLoad(session.id);
                    }
                  }}
                >
                  <MessageSquare
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">
                      {session.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                      <span>·</span>
                      <span>{t("agent.messageCount", { count: session.messageCount })}</span>
                    </div>
                  </div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirm({
                        description: t("agent.deleteSessionConfirm"),
                        variant: "danger",
                      });
                      if (ok) {
                        onDelete(session.id);
                      }
                    }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    title={t("agent.deleteSession")}
                    aria-label={t("agent.deleteSession")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
