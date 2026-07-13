/**
 * P3 工具插件编辑器
 *
 * 提供 JSON 编辑器界面，让用户创建或编辑声明式工具插件配置：
 * - 左侧：JSON 文本编辑区（textarea，支持校验）
 * - 右侧/顶部：操作按钮（使用模板、校验、保存、取消）
 * - 底部：校验结果反馈
 *
 * 模板：点击"使用模板"插入一个完整的 http-call 示例插件配置。
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import type { ToolPluginConfig } from "../domain/tool-plugin-types";
import { t } from "@/shared/constants";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { X, FileJson, Check, AlertCircle, FileText } from "lucide-react";

interface ToolPluginEditorProps {
  initialConfig: ToolPluginConfig | null;
  onSave: (config: ToolPluginConfig) => void;
  onCancel: () => void;
}

/** 默认模板：一个 http-call 示例插件 */
const PLUGIN_TEMPLATE: ToolPluginConfig = {
  id: "my-plugin",
  version: "1.0.0",
  displayName: "我的插件",
  description: "示例插件：调用外部 API 获取数据",
  author: "",
  prefix: "my_",
  tools: [
    {
      name: "search",
      description: "搜索知识库",
      domain: "plugin",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
        },
        required: ["query"],
      },
      action: {
        type: "http-call",
        url: "https://api.example.com/search?q={{query}}",
        method: "GET",
        responsePath: "results",
        responseTransform: "json",
      },
      timeoutMs: 30000,
    },
  ],
};

export function ToolPluginEditor({
  initialConfig,
  onSave,
  onCancel,
}: ToolPluginEditorProps) {
  const [text, setText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);
  const toast = useToastHelpers();

  // 初始化文本
  useEffect(() => {
    const config = initialConfig ?? PLUGIN_TEMPLATE;
    setText(JSON.stringify(config, null, 2));
  }, [initialConfig]);

  /** 实时校验 JSON 格式 */
  const parsedConfig = useMemo<{ ok: boolean; config?: ToolPluginConfig; error?: string }>(() => {
    if (!text.trim()) {
      return { ok: false, error: t("agent.plugin.validateEmpty") };
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      // 基本字段校验
      if (!parsed || typeof parsed !== "object") {
        return { ok: false, error: t("agent.plugin.validateNotObject") };
      }
      const c = parsed as Record<string, unknown>;
      if (typeof c.id !== "string" || !c.id) {
        return { ok: false, error: t("agent.plugin.validateIdRequired") };
      }
      if (typeof c.version !== "string" || !c.version) {
        return { ok: false, error: t("agent.plugin.validateVersionRequired") };
      }
      if (typeof c.displayName !== "string" || !c.displayName) {
        return { ok: false, error: t("agent.plugin.validateDisplayNameRequired") };
      }
      if (!Array.isArray(c.tools) || c.tools.length === 0) {
        return { ok: false, error: t("agent.plugin.validateToolsRequired") };
      }
      return { ok: true, config: c as unknown as ToolPluginConfig };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [text]);

  // 更新校验状态
  useEffect(() => {
    setIsValid(parsedConfig.ok);
    setValidationError(parsedConfig.ok ? null : parsedConfig.error ?? null);
  }, [parsedConfig]);

  /** 使用模板 */
  const handleUseTemplate = () => {
    setText(JSON.stringify(PLUGIN_TEMPLATE, null, 2));
    toast.info(t("agent.plugin.template"));
  };

  /** 校验按钮（手动触发 toast 反馈） */
  const handleValidate = () => {
    if (parsedConfig.ok) {
      toast.success(t("agent.plugin.validateOk"));
    } else {
      toast.error(
        t("agent.plugin.validateFail", { error: parsedConfig.error ?? "" }),
      );
    }
  };

  /** 保存 */
  const handleSave = () => {
    if (!parsedConfig.ok || !parsedConfig.config) {
      toast.error(
        t("agent.plugin.invalidJson", { error: parsedConfig.error ?? "" }),
      );
      return;
    }
    onSave(parsedConfig.config);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-[700px] max-w-[90vw] flex-col rounded-lg border border-border bg-popover shadow-lg">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <FileJson className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">
              {t("agent.plugin.editorTitle")}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleUseTemplate}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t("agent.plugin.template")}
            >
              <FileText className="h-3 w-3" />
              {t("agent.plugin.template")}
            </button>
            <button
              onClick={onCancel}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("agent.plugin.cancel")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 编辑区 */}
        <div className="flex-1 overflow-hidden p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-[400px] w-full resize-none rounded border border-border bg-background p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder={t("agent.plugin.editorPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            {t("agent.plugin.editorHint")}
          </div>
        </div>

        {/* 校验状态 */}
        {validationError && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="font-mono break-all">{validationError}</span>
          </div>
        )}
        {isValid && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded bg-green-500/10 px-3 py-2 text-xs text-green-600 dark:text-green-400">
            <Check className="h-3 w-3 shrink-0" />
            {t("agent.plugin.validateOk")}
          </div>
        )}

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={handleValidate}
            className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            {t("agent.plugin.validate")}
          </button>
          <button
            onClick={onCancel}
            className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            {t("agent.plugin.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            {t("agent.plugin.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
