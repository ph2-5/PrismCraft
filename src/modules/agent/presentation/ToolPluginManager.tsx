/**
 * P3 工具插件管理面板
 *
 * 让用户可视化查看和管理声明式 JSON 工具插件：
 * - 列出已保存的插件（含加载状态、工具数、版本、作者等）
 * - 启用/禁用插件（控制是否加载到 Agent）
 * - 删除插件
 * - 重新加载插件
 * - 新建/编辑插件（打开 ToolPluginEditor）
 *
 * 独立组件，通过 tool-plugin-loader 直接读写，不经过 Agent Loop。
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listToolPluginFiles,
  listLoadedPlugins,
  saveToolPluginFile,
  deleteToolPluginFile,
  loadToolPlugin,
  unloadPlugin,
} from "../services/tool-plugin-loader";
import type { ToolPluginConfig, ToolPluginsConfig } from "../domain/tool-plugin-types";
import { t } from "@/shared/constants";
import { confirm } from "@/shared/utils/confirm";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { getConfig, setConfig } from "@/shared/file-http";
import {
  X,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Power,
  Package,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { ToolPluginEditor } from "./ToolPluginEditor";

/** 插件启用/禁用配置键（与 tool-plugin-loader.ts 保持一致） */
const TOOL_PLUGINS_CONFIG_KEY = "agent.toolPlugins";

interface ToolPluginManagerProps {
  onClose: () => void;
}

interface PluginState {
  config: ToolPluginConfig;
  loaded: boolean;
  disabled: boolean;
}

export function ToolPluginManager({ onClose }: ToolPluginManagerProps) {
  const [plugins, setPlugins] = useState<PluginState[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ToolPluginConfig | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const toast = useToastHelpers();

  /** 加载插件列表 */
  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [saved, loaded] = await Promise.all([
        listToolPluginFiles(),
        listLoadedPlugins(),
      ]);
      const loadedIds = new Set(loaded.map((l) => l.pluginId));
      // 禁用列表从配置读取（通过 _testUtils 暴露的内部函数）
      const disabledIds = await getDisabledPluginIds();

      const states: PluginState[] = saved.map((config) => ({
        config,
        loaded: loadedIds.has(config.id),
        disabled: disabledIds.has(config.id),
      }));
      setPlugins(states);
    } catch (e) {
      errorLogger.warn("[Agent] 加载插件列表失败", e instanceof Error ? e : undefined);
      setError(t("agent.plugin.loadFailed", { error: String(e) }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

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

  /** 获取禁用的插件 ID 列表 */
  const getDisabledPluginIds = async (): Promise<Set<string>> => {
    try {
      const raw = await getConfig(TOOL_PLUGINS_CONFIG_KEY);
      if (!raw || typeof raw !== "object") return new Set();
      const c = raw as Record<string, unknown>;
      const disabled = Array.isArray(c.disabled)
        ? c.disabled.filter((x): x is string => typeof x === "string")
        : [];
      return new Set(disabled);
    } catch {
      return new Set();
    }
  };

  /** 读取插件配置 */
  const readPluginsConfig = async (): Promise<ToolPluginsConfig> => {
    try {
      const raw = await getConfig(TOOL_PLUGINS_CONFIG_KEY);
      if (!raw || typeof raw !== "object") {
        return { enabled: [], disabled: [] };
      }
      const c = raw as Record<string, unknown>;
      return {
        enabled: Array.isArray(c.enabled)
          ? c.enabled.filter((x): x is string => typeof x === "string")
          : [],
        disabled: Array.isArray(c.disabled)
          ? c.disabled.filter((x): x is string => typeof x === "string")
          : [],
      };
    } catch {
      return { enabled: [], disabled: [] };
    }
  };

  /** 写入插件配置 */
  const writePluginsConfig = async (config: ToolPluginsConfig): Promise<void> => {
    await setConfig(TOOL_PLUGINS_CONFIG_KEY, config);
  };

  /** 切换插件启用/禁用状态 */
  const handleToggleDisable = async (pluginId: string, currentlyDisabled: boolean) => {
    setActionLoading(true);
    try {
      const config = await readPluginsConfig();
      if (currentlyDisabled) {
        // 启用：从 disabled 移除
        config.disabled = config.disabled.filter((id) => id !== pluginId);
      } else {
        // 禁用：加入 disabled，并卸载已加载的工具
        config.disabled.push(pluginId);
        unloadPlugin(pluginId);
      }
      await writePluginsConfig(config);

      // 启用时立即加载插件
      if (currentlyDisabled) {
        const fileConfig = plugins.find((p) => p.config.id === pluginId)?.config;
        if (fileConfig) {
          const result = await loadToolPlugin(fileConfig);
          if (result.registeredCount > 0) {
            toast.success(
              t("agent.plugin.loadSuccess", { count: result.registeredCount }),
            );
          } else if (result.errors.length > 0) {
            toast.error(
              t("agent.plugin.loadFailed", { error: result.errors[0]!.error }),
            );
          }
        }
      }

      await loadPlugins();
    } catch (e) {
      errorLogger.warn("[Agent] 切换插件状态失败", e instanceof Error ? e : undefined);
      toast.error(t("agent.plugin.saveFailed", { error: String(e) }));
    } finally {
      setActionLoading(false);
    }
  };

  /** 重新加载插件 */
  const handleReload = async (pluginId: string) => {
    setActionLoading(true);
    try {
      const fileConfig = plugins.find((p) => p.config.id === pluginId)?.config;
      if (!fileConfig) return;

      const result = await loadToolPlugin(fileConfig);
      if (result.registeredCount > 0) {
        toast.success(
          t("agent.plugin.loadSuccess", { count: result.registeredCount }),
        );
      } else if (result.errors.length > 0) {
        toast.error(
          t("agent.plugin.loadFailed", { error: result.errors[0]!.error }),
        );
      } else if (result.skipped.length > 0) {
        toast.warning(
          t("agent.plugin.loadFailed", {
            error: result.skipped[0]!.reason,
          }),
        );
      }
      await loadPlugins();
    } catch (e) {
      errorLogger.warn("[Agent] 重新加载插件失败", e instanceof Error ? e : undefined);
      toast.error(t("agent.plugin.loadFailed", { error: String(e) }));
    } finally {
      setActionLoading(false);
    }
  };

  /** 删除插件 */
  const handleDelete = async (pluginId: string, displayName: string) => {
    const ok = await confirm({
      description: t("agent.plugin.deleteConfirm", { name: displayName }),
      variant: "danger",
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      // 先卸载
      unloadPlugin(pluginId);
      // 再删除文件
      const deleted = await deleteToolPluginFile(pluginId);
      if (deleted) {
        toast.success(t("agent.plugin.deleteSuccess"));
        await loadPlugins();
      } else {
        toast.error(t("agent.plugin.deleteFailed", { error: "删除文件失败" }));
      }
    } catch (e) {
      errorLogger.warn("[Agent] 删除插件失败", e instanceof Error ? e : undefined);
      toast.error(t("agent.plugin.deleteFailed", { error: String(e) }));
    } finally {
      setActionLoading(false);
    }
  };

  /** 打开编辑器（新建或编辑） */
  const handleOpenEditor = (config: ToolPluginConfig | null) => {
    setEditing(config);
    setEditorOpen(true);
  };

  /** 编辑器保存回调 */
  const handleEditorSave = async (config: ToolPluginConfig) => {
    setActionLoading(true);
    try {
      const saved = await saveToolPluginFile(config);
      if (!saved) {
        toast.error(t("agent.plugin.saveFailed", { error: t("agent.plugin.writeFileFailed") }));
        return;
      }

      // 立即加载插件
      const result = await loadToolPlugin(config);
      if (result.registeredCount > 0) {
        toast.success(
          t("agent.plugin.saveAndLoadSuccess", { count: result.registeredCount }),
        );
      } else if (result.errors.length > 0) {
        toast.warning(
          t("agent.plugin.saveAndLoadPartial", { error: result.errors[0]!.error }),
        );
      } else {
        toast.success(t("agent.plugin.saveSuccess"));
      }

      setEditorOpen(false);
      setEditing(null);
      await loadPlugins();
    } catch (e) {
      errorLogger.warn("[Agent] 保存插件失败", e instanceof Error ? e : undefined);
      toast.error(t("agent.plugin.saveFailed", { error: String(e) }));
    } finally {
      setActionLoading(false);
    }
  };

  /** 统计 */
  const loadedCount = plugins.filter((p) => p.loaded).length;
  const disabledCount = plugins.filter((p) => p.disabled).length;

  return (
    <div className="absolute right-0 top-full z-50 mt-1 max-h-[80vh] w-[calc(100vw-2rem)] max-w-96 overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-md">
      {/* 头部 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Package className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("agent.plugin.management")}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void loadPlugins()}
            disabled={loading}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title={t("agent.plugin.reload")}
            aria-label={t("agent.plugin.reload")}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => handleOpenEditor(null)}
            disabled={actionLoading}
            className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            title={t("agent.plugin.create")}
          >
            <Plus className="h-3 w-3" />
            {t("agent.plugin.create")}
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("aria.close")}
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
      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{t("agent.plugin.saved")}：{plugins.length}</span>
        <span className="text-green-600 dark:text-green-400">
          {t("agent.plugin.enabledCount", { count: loadedCount })}
        </span>
        {disabledCount > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {t("agent.plugin.disabledCount", { count: disabledCount })}
          </span>
        )}
      </div>

      {/* 插件列表 */}
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {plugins.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <div className="text-xs text-muted-foreground">
              {t("agent.plugin.empty")}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground/70">
              {t("agent.plugin.emptyHint")}
            </div>
          </div>
        ) : (
          plugins.map(({ config, loaded, disabled }) => (
            <div
              key={config.id}
              className={`rounded border bg-background/50 p-2 ${
                disabled
                  ? "border-amber-300/60 opacity-70"
                  : loaded
                    ? "border-green-300/60"
                    : "border-border"
              }`}
            >
              {/* 标题行 */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">
                      {config.displayName}
                    </span>
                    {loaded ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600 dark:text-green-400" />
                    ) : disabled ? (
                      <XCircle className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                    ) : null}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {config.id} · {t("agent.plugin.version", { version: config.version })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {/* 启用/禁用切换 */}
                  <button
                    onClick={() => void handleToggleDisable(config.id, disabled)}
                    disabled={actionLoading}
                    className={`rounded p-1 transition-colors disabled:opacity-50 ${
                      disabled
                        ? "text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
                        : "text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/40"
                    }`}
                    title={disabled ? t("agent.plugin.enable") : t("agent.plugin.disable")}
                    aria-label={disabled ? t("agent.plugin.enable") : t("agent.plugin.disable")}
                  >
                    <Power className="h-3 w-3" />
                  </button>
                  {/* 重新加载 */}
                  <button
                    onClick={() => void handleReload(config.id)}
                    disabled={actionLoading || disabled}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title={t("agent.plugin.reload")}
                    aria-label={t("agent.plugin.reload")}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                  {/* 编辑 */}
                  <button
                    onClick={() => handleOpenEditor(config)}
                    disabled={actionLoading}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title={t("agent.plugin.edit")}
                    aria-label={t("agent.plugin.edit")}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {/* 删除 */}
                  <button
                    onClick={() => void handleDelete(config.id, config.displayName)}
                    disabled={actionLoading}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    title={t("agent.plugin.delete")}
                    aria-label={t("agent.plugin.delete")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* 描述 */}
              {config.description && (
                <div className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                  {config.description}
                </div>
              )}

              {/* 元信息 */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span>{t("agent.plugin.tools", { count: config.tools.length })}</span>
                {config.author && (
                  <span>· {t("agent.plugin.author", { author: config.author })}</span>
                )}
                {config.prefix && (
                  <span>· {t("agent.plugin.prefix", { prefix: config.prefix })}</span>
                )}
                {disabled && (
                  <span className="text-amber-600 dark:text-amber-400">
                    · {t("agent.plugin.disabled")}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 编辑器弹窗 */}
      {editorOpen && (
        <ToolPluginEditor
          initialConfig={editing}
          onSave={handleEditorSave}
          onCancel={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
