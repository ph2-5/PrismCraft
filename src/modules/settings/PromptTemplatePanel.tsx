/**
 * 提示词模板库管理面板
 *
 * 功能：
 * - 浏览所有模板（内置 + 自定义），支持按分类/目标/关键词筛选
 * - 新建/编辑/删除自定义模板
 * - 应用模板（填写变量插槽 → 生成最终提示词 → 复制到剪贴板）
 * - 导出全部模板到剪贴板 / 从文件导入模板
 * - 重置内置模板为原始版本
 *
 * 设计要点：
 * - UI 样式遵循 EmbeddingModelPanel 的卡片+表格风格
 * - 通过 @/modules/prompt 的 barrel API 调用服务
 * - 所有用户可见文案使用 t() 国际化
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Pencil,
  Play,
  Trash2,
  Download,
  Upload,
  RotateCcw,
  Search,
  Copy,
  X,
  Loader2,
  FileText,
} from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import {
  listPromptTemplates,
  searchPromptTemplates,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  applyPromptTemplate,
  exportPromptTemplates,
  importPromptTemplates,
  getPromptTemplateStats,
  CATEGORY_LABELS,
  TARGET_LABELS,
  type PromptTemplate,
  type PromptTemplateCategory,
  type PromptTemplateTarget,
  type CreatePromptTemplateInput,
} from "@/modules/prompt";

// ============= 类型定义 =============

interface EditorState {
  open: boolean;
  mode: "create" | "edit";
  template: Partial<CreatePromptTemplateInput> & { id?: string };
}

interface ApplierState {
  open: boolean;
  template: PromptTemplate | null;
  variables: Record<string, string>;
  result: { prompt: string; negativePrompt?: string; missingVariables: string[] } | null;
}

// ============= 主组件 =============

export function PromptTemplatePanel() {
  const toast = useToastHelpers();

  // 列表状态
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number; builtin: number; user: number } | null>(null);

  // 筛选状态
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<PromptTemplateCategory | "">("");
  const [targetFilter, setTargetFilter] = useState<PromptTemplateTarget | "">("");

  // 编辑器状态
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    mode: "create",
    template: {},
  });

  // 应用器状态
  const [applier, setApplier] = useState<ApplierState>({
    open: false,
    template: null,
    variables: {},
    result: null,
  });

  // ============= 数据加载 =============

  const refreshTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const filter: Parameters<typeof searchPromptTemplates>[0] = {};
      if (categoryFilter) filter.category = categoryFilter;
      if (targetFilter) filter.target = targetFilter;
      if (keyword.trim()) filter.keyword = keyword.trim();

      const list = Object.keys(filter).length > 0
        ? await searchPromptTemplates(filter)
        : await listPromptTemplates();

      setTemplates(list);

      const s = await getPromptTemplateStats();
      setStats({ total: s.total, builtin: s.builtin, user: s.user });
    } catch (e) {
      errorLogger.warn("[PromptTemplatePanel] 加载模板失败", e);
      toast.error(t("settings.promptTemplatesLoadFailed"), e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, targetFilter, keyword, toast]);

  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  // ============= 编辑器操作 =============

  const openCreateEditor = useCallback(() => {
    setEditor({
      open: true,
      mode: "create",
      template: {
        name: "",
        description: "",
        category: "custom",
        target: "both",
        content: "",
        styleTags: [],
      },
    });
  }, []);

  const openEditEditor = useCallback((template: PromptTemplate) => {
    setEditor({
      open: true,
      mode: "edit",
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        target: template.target,
        content: template.content,
        negativePrompt: template.negativePrompt,
        styleTags: template.styleTags ?? [],
        variables: template.variables,
      },
    });
  }, []);

  const closeEditor = useCallback(() => {
    setEditor((prev) => ({ ...prev, open: false }));
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    const input = editor.template;
    if (!input.name?.trim() || !input.content?.trim()) {
      toast.error(t("settings.promptTemplatesSave"), "名称和内容不能为空");
      return;
    }

    try {
      const payload: CreatePromptTemplateInput = {
        name: input.name!.trim(),
        description: input.description?.trim() ?? "",
        category: (input.category as PromptTemplateCategory) ?? "custom",
        target: (input.target as PromptTemplateTarget) ?? "both",
        content: input.content!,
        negativePrompt: input.negativePrompt?.trim() || undefined,
        styleTags: Array.isArray(input.styleTags) ? input.styleTags : [],
        variables: input.variables,
      };

      if (editor.mode === "create") {
        await createPromptTemplate(payload);
      } else if (editor.template.id) {
        await updatePromptTemplate(editor.template.id, payload);
      }

      toast.success(t("settings.promptTemplatesSaveSuccess"), "");
      closeEditor();
      void refreshTemplates();
    } catch (e) {
      errorLogger.warn("[PromptTemplatePanel] 保存模板失败", e);
      toast.error(t("settings.promptTemplatesSave"), e instanceof Error ? e.message : String(e));
    }
  }, [editor, toast, closeEditor, refreshTemplates]);

  // ============= 删除/重置 =============

  const handleDelete = useCallback(async (template: PromptTemplate) => {
    if (!window.confirm(t("settings.promptTemplatesDeleteConfirm"))) return;
    try {
      await deletePromptTemplate(template.id);
      toast.success(t("settings.promptTemplatesDeleteSuccess"), "");
      void refreshTemplates();
    } catch (e) {
      errorLogger.warn("[PromptTemplatePanel] 删除模板失败", e);
      toast.error(t("settings.promptTemplatesDelete"), e instanceof Error ? e.message : String(e));
    }
  }, [toast, refreshTemplates]);

  const handleResetBuiltin = useCallback(async (template: PromptTemplate) => {
    if (!template.builtin) return;
    if (!window.confirm(t("settings.promptTemplatesResetConfirm"))) return;
    try {
      // 通过 delete 触发内置模板的重置逻辑
      await deletePromptTemplate(template.id);
      toast.success(t("settings.promptTemplatesResetSuccess"), "");
      void refreshTemplates();
    } catch (e) {
      errorLogger.warn("[PromptTemplatePanel] 重置模板失败", e);
    }
  }, [toast, refreshTemplates]);

  // ============= 应用模板 =============

  const openApplier = useCallback((template: PromptTemplate) => {
    setApplier({
      open: true,
      template,
      variables: {},
      result: null,
    });
  }, []);

  const closeApplier = useCallback(() => {
    setApplier({ open: false, template: null, variables: {}, result: null });
  }, []);

  const handleApply = useCallback(async () => {
    if (!applier.template) return;
    try {
      const result = await applyPromptTemplate(applier.template.id, applier.variables);
      if (result) {
        setApplier((prev) => ({ ...prev, result }));
      }
    } catch (e) {
      errorLogger.warn("[PromptTemplatePanel] 应用模板失败", e);
      toast.error(t("settings.promptTemplatesApply"), e instanceof Error ? e.message : String(e));
    }
  }, [applier, toast]);

  const handleCopyResult = useCallback(async () => {
    if (!applier.result) return;
    try {
      await navigator.clipboard.writeText(applier.result.prompt);
      toast.success(t("settings.promptTemplatesCopySuccess"), "");
    } catch {
      // 忽略剪贴板错误
    }
  }, [applier.result, toast]);

  // ============= 导入/导出 =============

  const handleExportAll = useCallback(async () => {
    try {
      const json = await exportPromptTemplates();
      await navigator.clipboard.writeText(json);
      const count = JSON.parse(json).templates?.length ?? 0;
      toast.success(t("settings.promptTemplatesExportSuccess", { count }), "");
    } catch (e) {
      errorLogger.warn("[PromptTemplatePanel] 导出失败", e);
      toast.error(t("settings.promptTemplatesExport"), e instanceof Error ? e.message : String(e));
    }
  }, [toast]);

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const result = await importPromptTemplates(text, { overwrite: false });
      toast.success(
        t("settings.promptTemplatesImported", { imported: result.imported, skipped: result.skipped }),
        "",
      );
      void refreshTemplates();
    } catch (e) {
      errorLogger.warn("[PromptTemplatePanel] 导入失败", e);
      toast.error(t("settings.promptTemplatesImport"), e instanceof Error ? e.message : String(e));
    }
  }, [toast, refreshTemplates]);

  // ============= 渲染 =============

  const categoryOptions = useMemo(
    () => Object.entries(CATEGORY_LABELS) as Array<[PromptTemplateCategory, string]>,
    [],
  );
  const targetOptions = useMemo(
    () => Object.entries(TARGET_LABELS) as Array<[PromptTemplateTarget, string]>,
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* 提示信息 */}
      <div className="tip-box">
        <FileText className="inline-block" size={12} /> {t("settings.promptTemplatesHint")}
      </div>

      {/* 统计 + 操作按钮 */}
      <div className="card flex justify-between items-center flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">
          {stats ? t("settings.promptTemplatesTotal", stats) : "..."}
        </span>
        <div className="flex gap-1.5 flex-wrap">
          <button className="btn btn-sm btn-ghost" onClick={() => void handleExportAll()}>
            <Download className="inline-block" size={12} /> {t("settings.promptTemplatesExportAll")}
          </button>
          <label className="btn btn-sm btn-ghost cursor-pointer">
            <Upload className="inline-block" size={12} /> {t("settings.promptTemplatesImportFile")}
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
                e.target.value = "";
              }}
            />
          </label>
          <button className="btn btn-sm btn-primary" onClick={openCreateEditor}>
            <Plus className="inline-block" size={12} /> {t("settings.promptTemplatesCreate")}
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="card flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="input pl-7 text-xs w-full"
            placeholder={t("settings.promptTemplatesSearch")}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <select
          className="select text-xs"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as PromptTemplateCategory | "")}
        >
          <option value="">{t("settings.promptTemplatesCategory")} · {t("settings.promptTemplatesAll")}</option>
          {categoryOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          className="select text-xs"
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value as PromptTemplateTarget | "")}
        >
          <option value="">{t("settings.promptTemplatesTarget")} · {t("settings.promptTemplatesAll")}</option>
          {targetOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* 模板列表 */}
      {loading ? (
        <div className="text-center py-6 text-muted-foreground">
          <Loader2 className="inline-block animate-spin" size={16} /> ...
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          compact
          icon={FileText}
          title={
            keyword || categoryFilter || targetFilter
              ? t("settings.promptTemplatesNoResults")
              : t("settings.promptTemplatesEmpty")
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => openEditEditor(template)}
              onApply={() => openApplier(template)}
              onDelete={() => void handleDelete(template)}
              onReset={() => void handleResetBuiltin(template)}
            />
          ))}
        </div>
      )}

      {/* 编辑器弹窗 */}
      {editor.open && (
        <TemplateEditor
          state={editor}
          onChange={(template) => setEditor((prev) => ({ ...prev, template }))}
          onClose={closeEditor}
          onSave={() => void handleSaveTemplate()}
        />
      )}

      {/* 应用器弹窗 */}
      {applier.open && applier.template && (
        <TemplateApplier
          state={applier}
          onChange={(variables) => setApplier((prev) => ({ ...prev, variables }))}
          onClose={closeApplier}
          onApply={() => void handleApply()}
          onCopy={() => void handleCopyResult()}
        />
      )}
    </div>
  );
}

// ============= 模板卡片 =============

function TemplateCard({
  template,
  onEdit,
  onApply,
  onDelete,
  onReset,
}: {
  template: PromptTemplate;
  onEdit: () => void;
  onApply: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  return (
    <div className="card">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold">{template.name}</span>
            <span
              className="text-[10px] px-1.5 py-px rounded bg-card2 text-muted-foreground"
              style={template.builtin ? { background: "rgba(var(--primary-rgb), 0.15)", color: "var(--primary)" } : undefined}
            >
              {template.builtin ? t("settings.promptTemplatesBuiltin") : t("settings.promptTemplatesUser")}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {CATEGORY_LABELS[template.category]} · {TARGET_LABELS[template.target]}
            </span>
          </div>
          {template.description && (
            <div className="text-[11px] text-muted-foreground mt-1">
              {template.description}
            </div>
          )}
          {template.styleTags && template.styleTags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {template.styleTags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-px rounded bg-card2 text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1.5 p-2 bg-card2 rounded-md font-mono whitespace-pre-wrap break-words max-h-20 overflow-hidden">
            {template.content.slice(0, 300)}
            {template.content.length > 300 ? "…" : ""}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button className="btn btn-sm btn-primary" onClick={onApply} title={t("settings.promptTemplatesApply")}>
            <Play size={12} />
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onEdit} title={t("settings.promptTemplatesEdit")}>
            <Pencil size={12} />
          </button>
          {template.builtin ? (
            <button className="btn btn-sm btn-ghost" onClick={onReset} title={t("settings.promptTemplatesReset")}>
              <RotateCcw size={12} />
            </button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={onDelete} title={t("settings.promptTemplatesDelete")}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============= 编辑器弹窗 =============

function TemplateEditor({
  state,
  onChange,
  onClose,
  onSave,
}: {
  state: EditorState;
  onChange: (template: EditorState["template"]) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const tpl = state.template;
  const categoryOptions = Object.entries(CATEGORY_LABELS) as Array<[PromptTemplateCategory, string]>;
  const targetOptions = Object.entries(TARGET_LABELS) as Array<[PromptTemplateTarget, string]>;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-[600px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold">
            {state.mode === "create" ? t("settings.promptTemplatesCreate") : t("settings.promptTemplatesEdit")}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">
              {t("settings.promptTemplateName")}
            </label>
            <input
              className="input w-full text-xs"
              value={tpl.name ?? ""}
              onChange={(e) => onChange({ ...tpl, name: e.target.value })}
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">
              {t("settings.promptTemplatesDesc")}
            </label>
            <input
              className="input w-full text-xs"
              value={tpl.description ?? ""}
              onChange={(e) => onChange({ ...tpl, description: e.target.value })}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground block mb-1">
                {t("settings.promptTemplatesCategory")}
              </label>
              <select
                className="select w-full text-xs"
                value={tpl.category ?? "custom"}
                onChange={(e) => onChange({ ...tpl, category: e.target.value as PromptTemplateCategory })}
              >
                {categoryOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground block mb-1">
                {t("settings.promptTemplatesTarget")}
              </label>
              <select
                className="select w-full text-xs"
                value={tpl.target ?? "both"}
                onChange={(e) => onChange({ ...tpl, target: e.target.value as PromptTemplateTarget })}
              >
                {targetOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">
              {t("settings.promptTemplatesStyleTags")}
            </label>
            <input
              className="input w-full text-xs"
              placeholder="anime, cyberpunk, wuxia"
              value={(tpl.styleTags ?? []).join(", ")}
              onChange={(e) =>
                onChange({
                  ...tpl,
                  styleTags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">
              {t("settings.promptTemplatesContent")}
            </label>
            <textarea
              className="input w-full text-[11px] font-mono min-h-[120px] resize-y"
              value={tpl.content ?? ""}
              onChange={(e) => onChange({ ...tpl, content: e.target.value })}
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">
              {t("settings.promptTemplatesNegative")}
            </label>
            <textarea
              className="input w-full text-[11px] font-mono min-h-[60px] resize-y"
              value={tpl.negativePrompt ?? ""}
              onChange={(e) => onChange({ ...tpl, negativePrompt: e.target.value })}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            {t("settings.promptTemplatesCancel")}
          </button>
          <button className="btn btn-sm btn-primary" onClick={onSave}>
            {t("settings.promptTemplatesSave")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============= 应用器弹窗 =============

function TemplateApplier({
  state,
  onChange,
  onClose,
  onApply,
  onCopy,
}: {
  state: ApplierState;
  onChange: (variables: Record<string, string>) => void;
  onClose: () => void;
  onApply: () => void;
  onCopy: () => void;
}) {
  const { template, variables, result } = state;

  // 提取模板中使用的变量名
  const usedVariables = useMemo(() => {
    if (!template) return [];
    const set = new Set<string>();
    const re = /\{\{\s*([\w.]+)\s*\}\}/g;
    let match;
    while ((match = re.exec(template.content)) !== null) {
      set.add(match[1]!);
    }
    if (template.negativePrompt) {
      while ((match = re.exec(template.negativePrompt)) !== null) {
        set.add(match[1]!);
      }
    }
    return Array.from(set);
  }, [template]);

  if (!template) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-[600px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold">
            {t("settings.promptTemplatesApplyTitle", { name: template.name })}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {usedVariables.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] text-muted-foreground mb-1.5">
              {t("settings.promptTemplatesApplyHint")}
            </div>
            <div className="flex flex-col gap-1.5">
              {usedVariables.map((varName) => (
                <div key={varName} className="flex items-center gap-2">
                  <code className="text-[11px] min-w-[140px] text-primary">{varName}</code>
                  <input
                    className="input flex-1 text-xs"
                    placeholder={varName}
                    value={variables[varName] ?? ""}
                    onChange={(e) => onChange({ ...variables, [varName]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-sm btn-primary mb-3" onClick={onApply}>
          <Play className="inline-block" size={12} /> {t("settings.promptTemplatesApply")}
        </button>

        {result && (
          <div className="flex flex-col gap-2">
            {result.missingVariables.length > 0 && (
              <div className="warn-box">
                {t("settings.promptTemplatesMissingVars", { vars: result.missingVariables.join(", ") })}
              </div>
            )}
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">
                {t("settings.promptTemplatesApplyResult")}
              </div>
              <div className="p-2.5 bg-card2 rounded-md font-mono text-[11px] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
                {result.prompt}
              </div>
            </div>
            {result.negativePrompt && (
              <div>
                <div className="text-[11px] text-muted-foreground mb-1">
                  {t("settings.promptTemplatesApplyNegative")}
                </div>
                <div className="p-2.5 bg-card2 rounded-md font-mono text-[11px] whitespace-pre-wrap break-words">
                  {result.negativePrompt}
                </div>
              </div>
            )}
            <button className="btn btn-sm btn-ghost" onClick={onCopy}>
              <Copy className="inline-block" size={12} /> {t("settings.promptTemplatesApplyCopy")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
