/**
 * 记忆管理面板
 *
 * 让用户可视化查看和管理 Agent 的长期记忆：
 * - 用户偏好（preferences）
 * - 项目事实（facts）
 * - 归档记忆条数
 * - 清空所有核心记忆
 *
 * 独立组件，不污染 AgentSettingsPanel 的职责。
 * 通过 memory-service 直接读写，不经过 Agent Loop。
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getCoreMemory,
  clearCoreMemory,
  getArchivalMemoryCount,
  removeFact,
  removePreference,
  type CoreMemory,
} from "../services/memory-service";
import { t } from "@/shared/constants";
import { confirm } from "@/shared/utils/confirm";
import { errorLogger } from "@/shared/error-logger";
import { X, Brain, Trash2, RefreshCw } from "lucide-react";

interface MemoryPanelProps {
  onClose: () => void;
}

export function MemoryPanel({ onClose }: MemoryPanelProps) {
  const [memory, setMemory] = useState<CoreMemory | null>(null);
  const [archivalCount, setArchivalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMemory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mem, count] = await Promise.all([
        getCoreMemory(),
        getArchivalMemoryCount(),
      ]);
      setMemory(mem);
      setArchivalCount(count);
    } catch {
      setError(t("agent.memory.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  /** 删除单个偏好 */
  const handleRemovePreference = async (key: string) => {
    setActionLoading(true);
    try {
      const ok = await removePreference(key);
      if (ok) {
        await loadMemory();
      }
    } catch (e) {
      errorLogger.warn("[Agent] 删除偏好失败", e instanceof Error ? e : undefined);
    } finally {
      setActionLoading(false);
    }
  };

  /** 删除单个事实 */
  const handleRemoveFact = async (key: string) => {
    setActionLoading(true);
    try {
      const ok = await removeFact(key);
      if (ok) {
        await loadMemory();
      }
    } catch (e) {
      errorLogger.warn("[Agent] 删除事实失败", e instanceof Error ? e : undefined);
    } finally {
      setActionLoading(false);
    }
  };

  /** 清空所有核心记忆 */
  const handleClearAll = async () => {
    const confirmed = await confirm({
      description: t("agent.memory.confirmClear"),
      variant: "danger",
    });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      const ok = await clearCoreMemory();
      if (ok) {
        await loadMemory();
      } else {
        setError(t("agent.memory.clearFailed"));
      }
    } catch (e) {
      errorLogger.warn("[Agent] 清空核心记忆失败", e instanceof Error ? e : undefined);
      setError(t("agent.memory.clearFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const prefEntries = memory ? Object.entries(memory.preferences) : [];
  const facts = memory?.facts ?? [];

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-popover p-3 shadow-md">
      {/* 头部 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("agent.memory.management")}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void loadMemory()}
            disabled={loading}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title={t("agent.refreshMemory")}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* 统计 */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded border border-border bg-background/50 py-1.5">
          <div className="font-mono text-sm font-semibold">{prefEntries.length}</div>
          <div className="text-[10px] text-muted-foreground">{t("agent.memory.preferences")}</div>
        </div>
        <div className="rounded border border-border bg-background/50 py-1.5">
          <div className="font-mono text-sm font-semibold">{facts.length}</div>
          <div className="text-[10px] text-muted-foreground">{t("agent.memory.facts")}</div>
        </div>
        <div className="rounded border border-border bg-background/50 py-1.5">
          <div className="font-mono text-sm font-semibold">{archivalCount}</div>
          <div className="text-[10px] text-muted-foreground">{t("agent.memory.archivalCount")}</div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="max-h-72 space-y-3 overflow-y-auto">
        {/* 用户偏好 */}
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("agent.memory.preferences")}
          </div>
          {prefEntries.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground italic">
              {t("agent.memory.noPreferences")}
            </div>
          ) : (
            <div className="space-y-1">
              {prefEntries.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded border border-border bg-background/50 px-2 py-1 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{k}</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="font-mono">{String(v)}</span>
                  </div>
                  <button
                    onClick={() => void handleRemovePreference(k)}
                    disabled={actionLoading}
                    className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 项目事实 */}
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("agent.memory.facts")}
          </div>
          {facts.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground italic">
              {t("agent.memory.noFacts")}
            </div>
          ) : (
            <div className="space-y-1">
              {facts.map((f) => (
                <div
                  key={f.key}
                  className="flex items-center justify-between rounded border border-border bg-background/50 px-2 py-1 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{f.key}</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="font-mono">{f.value}</span>
                  </div>
                  <button
                    onClick={() => void handleRemoveFact(f.key)}
                    disabled={actionLoading}
                    className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部操作 */}
      <div className="mt-3 border-t border-border pt-2">
        <button
          onClick={() => void handleClearAll()}
          disabled={actionLoading || (prefEntries.length === 0 && facts.length === 0)}
          className="flex w-full items-center justify-center gap-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
          {t("agent.memory.clearAll")}
        </button>
      </div>
    </div>
  );
}
