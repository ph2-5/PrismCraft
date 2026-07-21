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
  Download,
  Upload,
  Search,
  Loader2,
  FileText,
} from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
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
import {
  TemplateCard,
  TemplateEditor,
  TemplateApplier,
  type EditorState,
  type ApplierState,
} from "./prompt-template-parts";

// ============= 主组件 =============

export function PromptTemplatePanel() {
  const {
    templates,
    loading,
    stats,
    keyword,
    setKeyword,
    categoryFilter,
    setCategoryFilter,
    targetFilter,
    setTargetFilter,
    editor,
    applier,
    updateEditorTemplate,
    updateApplierVariables,
    openCreateEditor,
    openEditEditor,
    closeEditor,
    handleSaveTemplate,
    handleDelete,
    handleResetBuiltin,
    openApplier,
    closeApplier,
    handleApply,
    handleCopyResult,
    handleExportAll,
    handleImportFile,
  } = usePromptTemplatePanelState();

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
          onChange={updateEditorTemplate}
          onClose={closeEditor}
          onSave={() => void handleSaveTemplate()}
        />
      )}

      {/* 应用器弹窗 */}
      {applier.open && applier.template && (
        <TemplateApplier
          state={applier}
          onChange={updateApplierVariables}
          onClose={closeApplier}
          onApply={() => void handleApply()}
          onCopy={() => void handleCopyResult()}
        />
      )}
    </div>
  );
}

// ============= 状态组合 Hook =============

function usePromptTemplatePanelState() {
  const toast = useToastHelpers();
  const listState = useTemplateListState();
  const editorState = useTemplateEditorState(listState.refreshTemplates, toast);
  const lifecycle = useTemplateLifecycleActions(listState.refreshTemplates, toast);
  const applierState = useTemplateApplierState(toast);
  const bulk = useTemplateBulkActions(listState.refreshTemplates, toast);

  return {
    ...listState,
    ...editorState,
    ...lifecycle,
    ...applierState,
    ...bulk,
  };
}

// ============= 列表 + 筛选 Hook =============

function useTemplateListState() {
  const toast = useToastHelpers();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number; builtin: number; user: number } | null>(null);
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<PromptTemplateCategory | "">("");
  const [targetFilter, setTargetFilter] = useState<PromptTemplateTarget | "">("");

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

  return {
    templates,
    loading,
    stats,
    keyword,
    setKeyword,
    categoryFilter,
    setCategoryFilter,
    targetFilter,
    setTargetFilter,
    refreshTemplates,
  };
}

// ============= 编辑器 Hook =============

function useTemplateEditorState(
  refreshTemplates: () => Promise<void>,
  toast: ReturnType<typeof useToastHelpers>,
) {
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    mode: "create",
    template: {},
  });

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

  const updateEditorTemplate = useCallback((template: EditorState["template"]) => {
    setEditor((prev) => ({ ...prev, template }));
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

  return {
    editor,
    updateEditorTemplate,
    openCreateEditor,
    openEditEditor,
    closeEditor,
    handleSaveTemplate,
  };
}

// ============= 删除 / 重置 Hook =============

function useTemplateLifecycleActions(
  refreshTemplates: () => Promise<void>,
  toast: ReturnType<typeof useToastHelpers>,
) {
  const handleDelete = useCallback(async (template: PromptTemplate) => {
    if (!await confirm({
      description: t("settings.promptTemplatesDeleteConfirm"),
      variant: "danger",
    })) return;
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
    if (!await confirm({
      description: t("settings.promptTemplatesResetConfirm"),
      variant: "warning",
    })) return;
    try {
      // 通过 delete 触发内置模板的重置逻辑
      await deletePromptTemplate(template.id);
      toast.success(t("settings.promptTemplatesResetSuccess"), "");
      void refreshTemplates();
    } catch (e) {
      errorLogger.warn("[PromptTemplatePanel] 重置模板失败", e);
    }
  }, [toast, refreshTemplates]);

  return { handleDelete, handleResetBuiltin };
}

// ============= 应用器 Hook =============

function useTemplateApplierState(toast: ReturnType<typeof useToastHelpers>) {
  const [applier, setApplier] = useState<ApplierState>({
    open: false,
    template: null,
    variables: {},
    result: null,
  });

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

  const updateApplierVariables = useCallback((variables: Record<string, string>) => {
    setApplier((prev) => ({ ...prev, variables }));
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

  return {
    applier,
    updateApplierVariables,
    openApplier,
    closeApplier,
    handleApply,
    handleCopyResult,
  };
}

// ============= 导入 / 导出 Hook =============

function useTemplateBulkActions(
  refreshTemplates: () => Promise<void>,
  toast: ReturnType<typeof useToastHelpers>,
) {
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

  return { handleExportAll, handleImportFile };
}
