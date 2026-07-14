/**
 * Agent 设置面板
 *
 * 支持：
 * - 人格切换（default / creative / technical）
 * - 最大循环次数调整
 * - 温度调整
 * - ffmpeg 路径配置（自定义 ffmpeg 可执行文件路径）
 *
 * 设置通过 usePreference 持久化到 localStorage
 * ffmpeg 路径通过 getConfig/setConfig 持久化到主进程配置（与 ffmpeg-service 读取一致）
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { AgentSettings } from "../hooks/use-agent";
import type { AgentPersona } from "../domain/prompts";
import { AGENT_PERSONAS } from "../domain/prompts";
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
import { ModelSelector } from "@/modules/prompt";
import { X, Check, Loader2, Search } from "lucide-react";

interface AgentSettingsPanelProps {
  settings: AgentSettings;
  onUpdate: (partial: Partial<AgentSettings>) => void;
  onClose: () => void;
}

const PERSONAS: Array<{ key: AgentPersona; labelKey: string; descKey: string }> = [
  { key: "default", labelKey: "agent.persona.default", descKey: "agent.persona.defaultDesc" },
  { key: "creative", labelKey: "agent.persona.creative", descKey: "agent.persona.creativeDesc" },
  { key: "technical", labelKey: "agent.persona.technical", descKey: "agent.persona.technicalDesc" },
];

export function AgentSettingsPanel({ settings, onUpdate, onClose }: AgentSettingsPanelProps) {
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

  return (
    <div className="absolute right-0 top-full z-50 mt-1 max-h-[80vh] w-[calc(100vw-2rem)] max-w-96 overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("agent.settings")}</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("aria.close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 人格切换 */}
      <div className="mb-3">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t("agent.persona")}
        </div>
        <div className="space-y-1">
          {PERSONAS.map((p) => (
            <button
              key={p.key}
              onClick={() => onUpdate({ persona: p.key })}
              className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                settings.persona === p.key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted"
              }`}
            >
              <div>
                <div className="font-medium">{t(p.labelKey)}</div>
                <div className="text-[10px] text-muted-foreground">{t(p.descKey)}</div>
              </div>
              {settings.persona === p.key && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>
      </div>

      {/* AI 模型选择 */}
      <div className="mb-3">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t("agent.model")}
        </div>
        <ModelSelector
          capability="text"
          value={settings.textModel ?? null}
          onChange={(selection) => onUpdate({ textModel: selection })}
          compact
        />
        <div className="mt-1 text-[10px] text-muted-foreground">
          {t("agent.modelHint")}
        </div>
      </div>

      {/* 最大循环次数 */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t("agent.maxIterations")}
          </span>
          <span className="font-mono text-xs">{settings.maxIterations}</span>
        </div>
        <input
          type="range"
          min={1}
          max={30}
          step={1}
          value={settings.maxIterations}
          onChange={(e) => onUpdate({ maxIterations: Number(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* 温度 */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t("agent.temperature")}
          </span>
          <span className="font-mono text-xs">{settings.temperature.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={settings.temperature}
          onChange={(e) => onUpdate({ temperature: Number(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* ffmpeg 配置 */}
      <FfmpegConfigSection />

      {/* 搜索配置 */}
      <SearchConfigSection />

      {/* 搜索配置测试（RAG 检索） */}
      <SearchTestSection />
    </div>
  );
}

/** ffmpeg 配置区块（独立管理状态，用 getConfig/setConfig 持久化） */
function FfmpegConfigSection() {
  const [path, setPath] = useState("");
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "detecting" }
    | { state: "available"; version?: string; resolvedPath?: string }
    | { state: "unavailable" }
  >({ state: "idle" });

  // 加载已保存的 ffmpegPath
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
    // 先保存当前输入的路径，再重置缓存，让 probe 使用新路径
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

        {/* 状态显示 */}
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

        {/* 检测按钮 */}
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
function SearchConfigSection() {
  const [apiKey, setApiKey] = useState("");
  const [engine, setEngine] = useState<string>("bing");
  const [engineId, setEngineId] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载已保存的搜索配置
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

  // 清理定时器
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
        // 2 秒后恢复 idle
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
        statusTimerRef.current = setTimeout(() => setStatus("idle"), 2000);
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

  // 各引擎的提示信息
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
        {/* 搜索引擎选择 */}
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

        {/* API Key 输入 */}
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

        {/* 搜索引擎 ID（仅 Google 时显示） */}
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

        {/* 引擎专属提示 */}
        {hintKey && (
          <div className="text-[10px] text-muted-foreground">{t(hintKey)}</div>
        )}

        {/* 状态显示 */}
        {status === "saved" && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" />
            {t("agent.search.saved")}
          </div>
        )}
        {status === "failed" && (
          <div className="text-[10px] text-destructive">{t("agent.search.saveFailed")}</div>
        )}

        {/* 操作按钮 */}
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
function SearchTestSection() {
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

        {/* 错误信息（不阻断 UI） */}
        {error && (
          <div className="rounded-md bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
            {t("agent.settings.searchTest.error", { message: error })}
          </div>
        )}

        {/* 搜索结果 */}
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

/** 获取当前人格的 system prompt（供外部使用） */
export function getPersonaPrompt(persona: AgentPersona): string | undefined {
  if (persona === "default") return undefined;
  return AGENT_PERSONAS[persona];
}
