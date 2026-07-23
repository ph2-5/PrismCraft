/**
 * Agent 设置区块组件（从 AgentSettingsPanel 抽取）
 *
 * 包含：
 * - FfmpegConfigSection：ffmpeg 路径配置
 * - SearchConfigSection：搜索引擎配置
 * - SearchTestSection：RAG 检索测试
 *
 * 这些区块独立管理自身状态，通过 getConfig/setConfig 持久化到主进程配置。
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { t } from "@/shared/constants";
import { getConfig, setConfig } from "@/shared/file-http";
import { errorLogger } from "@/shared/error-logger";
import {
  checkFfmpegAvailable,
  resetFfmpegCache,
} from "@/modules/ffmpeg-runner";
import { searchArchivalMemory } from "@/modules/agent-memory";
import type { ArchivalMemoryEntry } from "@/modules/agent-memory";
import { formatRelativeTime } from "@/shared/utils/format";
import { X, Check, Loader2, Search } from "lucide-react";

const STATUS_DISPLAY_DURATION_MS = 2000;

/** ffmpeg 配置区块（独立管理状态，用 getConfig/setConfig 持久化） */
export function FfmpegConfigSection() {
  const [path, setPath] = useState("");
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "detecting" }
    | { state: "available"; version?: string; resolvedPath?: string }
    | { state: "unavailable" }
  >({ state: "idle" });

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const saved = (await getConfig("ffmpegPath")) as string | null;
      if (mounted && typeof saved === "string") {
        setPath(saved);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleDetect = useCallback(async () => {
    setStatus({ state: "detecting" });
    const trimmed = path.trim();
    const saved = await setConfig("ffmpegPath", trimmed || null);
    if (!saved) {
      setStatus({ state: "unavailable" });
      return;
    }
    resetFfmpegCache();
    const result = await checkFfmpegAvailable();
    if (result.available) {
      setStatus({
        state: "available",
        version: result.version,
        resolvedPath: result.path,
      });
    } else {
      setStatus({ state: "unavailable" });
    }
  }, [path]);

  const handleClear = useCallback(() => {
    setPath("");
    void setConfig("ffmpegPath", null).catch((e) => {
      errorLogger.warn("[Agent] 清除 ffmpegPath 失败", e instanceof Error ? e : undefined);
    });
    resetFfmpegCache();
    setStatus({ state: "idle" });
  }, []);

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        {t("agent.ffmpeg.config")}
      </div>
      <div className="space-y-1.5">
        <div className="flex gap-1">
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={t("agent.ffmpeg.pathPlaceholder")}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
          {path && (
            <button
              onClick={handleClear}
              className="rounded-md border border-border px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              title={t("agent.ffmpeg.clear")}
              aria-label={t("agent.ffmpeg.clear")}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {status.state === "available" && (
          <div className="rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-1 font-medium">
              <Check className="h-3 w-3" />
              {t("agent.ffmpeg.available")}
              {status.version && (
                <span className="text-muted-foreground">
                  · {t("agent.ffmpeg.version", { version: status.version })}
                </span>
              )}
            </div>
            {status.resolvedPath && (
              <div className="mt-0.5 truncate text-muted-foreground">
                {t("agent.ffmpeg.path", { path: status.resolvedPath })}
              </div>
            )}
          </div>
        )}
        {status.state === "unavailable" && (
          <div className="rounded-md bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
            <div>{t("agent.ffmpeg.detectedFail")}</div>
            <div className="mt-0.5 text-muted-foreground">
              {t("agent.ffmpeg.installHint")}
            </div>
          </div>
        )}

        <button
          onClick={handleDetect}
          disabled={status.state === "detecting"}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] hover:bg-muted disabled:opacity-50"
        >
          {status.state === "detecting" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("agent.ffmpeg.detecting")}
            </>
          ) : (
            t("agent.ffmpeg.detect")
          )}
        </button>
      </div>
    </div>
  );
}

/** 搜索配置区块（独立管理状态，用 getConfig/setConfig 持久化） */
export function SearchConfigSection() {
  const [apiKey, setApiKey] = useState("");
  const [engine, setEngine] = useState<string>("bing");
  const [engineId, setEngineId] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [savedKey, savedEngine, savedEngineId] = await Promise.all([
        getConfig("searchApiKey"),
        getConfig("searchEngine"),
        getConfig("searchEngineId"),
      ]);
      if (!mounted) return;
      if (typeof savedKey === "string") setApiKey(savedKey);
      if (typeof savedEngine === "string" && savedEngine) setEngine(savedEngine);
      if (typeof savedEngineId === "string") setEngineId(savedEngineId);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    setStatus("saving");
    const trimmedKey = apiKey.trim();
    const trimmedEngineId = engineId.trim();
    try {
      const ok1 = await setConfig("searchApiKey", trimmedKey || null);
      const ok2 = await setConfig("searchEngine", engine);
      const ok3 = await setConfig("searchEngineId", trimmedEngineId || null);
      if (ok1 && ok2 && ok3) {
        setStatus("saved");
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
        statusTimerRef.current = setTimeout(() => setStatus("idle"), STATUS_DISPLAY_DURATION_MS);
      } else {
        setStatus("failed");
      }
    } catch (e) {
      errorLogger.warn("[Agent] 保存搜索配置失败", e instanceof Error ? e : undefined);
      setStatus("failed");
    }
  }, [apiKey, engine, engineId]);

  const handleClear = useCallback(async () => {
    setApiKey("");
    setEngineId("");
    setEngine("bing");
    try {
      await setConfig("searchApiKey", null);
      await setConfig("searchEngineId", null);
    } catch (e) {
      errorLogger.warn("[Agent] 清除搜索配置失败", e instanceof Error ? e : undefined);
    }
    setStatus("idle");
  }, []);

  const hintKey =
    engine === "bing"
      ? "agent.search.hintBing"
      : engine === "unsplash"
        ? "agent.search.hintUnsplash"
        : engine === "pexels"
          ? "agent.search.hintPexels"
          : engine === "google"
            ? "agent.search.hintGoogle"
            : null;

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        {t("agent.search.config")}
      </div>
      <div className="space-y-1.5">
        <div>
          <label className="mb-1 block text-[10px] text-muted-foreground">
            {t("agent.search.engine")}
          </label>
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <option value="bing">{t("agent.search.engine.bing")}</option>
            <option value="unsplash">{t("agent.search.engine.unsplash")}</option>
            <option value="pexels">{t("agent.search.engine.pexels")}</option>
            <option value="google">{t("agent.search.engine.google")}</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[10px] text-muted-foreground">
            {t("agent.search.apiKey")}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("agent.search.apiKeyPlaceholder")}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>

        {engine === "google" && (
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">
              {t("agent.search.engineId")}
            </label>
            <input
              type="text"
              value={engineId}
              onChange={(e) => setEngineId(e.target.value)}
              placeholder={t("agent.search.engineIdPlaceholder")}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {t("agent.search.engineIdHint")}
            </div>
          </div>
        )}

        {hintKey && (
          <div className="text-[10px] text-muted-foreground">{t(hintKey)}</div>
        )}

        {status === "saved" && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" />
            {t("agent.search.saved")}
          </div>
        )}
        {status === "failed" && (
          <div className="text-[10px] text-destructive">{t("agent.search.saveFailed")}</div>
        )}

        <div className="flex gap-1">
          <button
            onClick={handleSave}
            disabled={status === "saving"}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] hover:bg-muted disabled:opacity-50"
          >
            {status === "saving" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("agent.search.saving")}
              </>
            ) : (
              t("agent.search.save")
            )}
          </button>
          {(apiKey || engineId || engine !== "bing") && (
            <button
              onClick={handleClear}
              className="rounded-md border border-border px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              title={t("agent.search.clear")}
              aria-label={t("agent.search.clear")}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 搜索配置测试区块 — 测试 RAG 检索是否正常工作 */
export function SearchTestSection() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArchivalMemoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const entries = await searchArchivalMemory(trimmed, 3);
      setResults(entries);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [query, loading]);

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        {t("agent.settings.searchTest.title")}
      </div>
      <div className="space-y-1.5">
        <div className="flex gap-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleTest();
              }
            }}
            placeholder={t("agent.settings.searchTest.placeholder")}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
          <button
            onClick={handleTest}
            disabled={loading || !query.trim()}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] hover:bg-muted disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("agent.settings.searchTest.loading")}
              </>
            ) : (
              <>
                <Search className="h-3 w-3" />
                {t("agent.settings.searchTest.button")}
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
            {t("agent.settings.searchTest.error", { message: error })}
          </div>
        )}

        {results && (
          <div className="space-y-1">
            {results.length === 0 ? (
              <div className="px-2 py-1.5 text-center text-[10px] text-muted-foreground italic">
                {t("agent.settings.searchTest.noResults")}
              </div>
            ) : (
              results.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded border border-border bg-background/50 px-2 py-1 text-[10px]"
                >
                  <div className="break-all text-muted-foreground">
                    {entry.content.slice(0, 100)}
                    {entry.content.length > 100 ? "..." : ""}
                  </div>
                  <div className="mt-0.5 text-muted-foreground/70">
                    {formatRelativeTime(entry.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
