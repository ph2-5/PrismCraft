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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 提示信息 */}
      <div
        style={{
          padding: 12,
          background: "rgba(var(--primary-rgb), 0.08)",
          border: "1px solid rgba(var(--primary-rgb), 0.2)",
          borderRadius: 8,
          fontSize: 11,
          color: "var(--muted-fg)",
        }}
      >
        <FileText className="inline-block" size={12} /> {t("settings.promptTemplatesHint")}
      </div>

      {/* 统计 + 操作按钮 */}
      <div
        className="card"
        style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}
      >
        <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {stats ? t("settings.promptTemplatesTotal", stats) : "..."}
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn btn-sm btn-ghost" onClick={() => void handleExportAll()}>
            <Download className="inline-block" size={12} /> {t("settings.promptTemplatesExportAll")}
          </button>
          <label className="btn btn-sm btn-ghost" style={{ cursor: "pointer" }}>
            <Upload className="inline-block" size={12} /> {t("settings.promptTemplatesImportFile")}
            <input
              type="file"
              accept=".json"
              style={{ display: "none" }}
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
      <div
        className="card"
        style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search
            size={12}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted-fg)" }}
          />
          <input
            className="input"
            style={{ paddingLeft: 28, fontSize: 12, width: "100%" }}
            placeholder={t("settings.promptTemplatesSearch")}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ fontSize: 12 }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as PromptTemplateCategory | "")}
        >
          <option value="">{t("settings.promptTemplatesCategory")} · {t("settings.promptTemplatesAll")}</option>
          {categoryOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          className="select"
          style={{ fontSize: 12 }}
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
        <div style={{ textAlign: "center", padding: 24, color: "var(--muted-fg)" }}>
          <Loader2 className="inline-block animate-spin" size={16} /> ...
        </div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: "var(--muted-fg)", fontSize: 12 }}>
          {keyword || categoryFilter || targetFilter
            ? t("settings.promptTemplatesNoResults")
            : t("settings.promptTemplatesEmpty")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{template.name}</span>
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                background: template.builtin ? "rgba(var(--primary-rgb), 0.15)" : "var(--card2)",
                color: template.builtin ? "var(--primary)" : "var(--muted-fg)",
              }}
            >
              {template.builtin ? t("settings.promptTemplatesBuiltin") : t("settings.promptTemplatesUser")}
            </span>
            <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>
              {CATEGORY_LABELS[template.category]} · {TARGET_LABELS[template.target]}
            </span>
          </div>
          {template.description && (
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
              {template.description}
            </div>
          )}
          {template.styleTags && template.styleTags.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
              {template.styleTags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "var(--card2)",
                    color: "var(--muted-fg)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div
            style={{
              fontSize: 10,
              color: "var(--muted-fg)",
              marginTop: 6,
              padding: 8,
              background: "var(--card2)",
              borderRadius: 6,
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 80,
              overflow: "hidden",
            }}
          >
            {template.content.slice(0, 300)}
            {template.content.length > 300 ? "…" : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
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
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ padding: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {state.mode === "create" ? t("settings.promptTemplatesCreate") : t("settings.promptTemplatesEdit")}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
              {t("settings.promptTemplateName")}
            </label>
            <input
              className="input"
              style={{ width: "100%", fontSize: 12 }}
              value={tpl.name ?? ""}
              onChange={(e) => onChange({ ...tpl, name: e.target.value })}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
              {t("settings.promptTemplatesDesc")}
            </label>
            <input
              className="input"
              style={{ width: "100%", fontSize: 12 }}
              value={tpl.description ?? ""}
              onChange={(e) => onChange({ ...tpl, description: e.target.value })}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
                {t("settings.promptTemplatesCategory")}
              </label>
              <select
                className="select"
                style={{ width: "100%", fontSize: 12 }}
                value={tpl.category ?? "custom"}
                onChange={(e) => onChange({ ...tpl, category: e.target.value as PromptTemplateCategory })}
              >
                {categoryOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
                {t("settings.promptTemplatesTarget")}
              </label>
              <select
                className="select"
                style={{ width: "100%", fontSize: 12 }}
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
            <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
              {t("settings.promptTemplatesStyleTags")}
            </label>
            <input
              className="input"
              style={{ width: "100%", fontSize: 12 }}
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
            <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
              {t("settings.promptTemplatesContent")}
            </label>
            <textarea
              className="input"
              style={{ width: "100%", fontSize: 11, fontFamily: "monospace", minHeight: 120, resize: "vertical" }}
              value={tpl.content ?? ""}
              onChange={(e) => onChange({ ...tpl, content: e.target.value })}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
              {t("settings.promptTemplatesNegative")}
            </label>
            <textarea
              className="input"
              style={{ width: "100%", fontSize: 11, fontFamily: "monospace", minHeight: 60, resize: "vertical" }}
              value={tpl.negativePrompt ?? ""}
              onChange={(e) => onChange({ ...tpl, negativePrompt: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
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
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ padding: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {t("settings.promptTemplatesApplyTitle", { name: template.name })}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {usedVariables.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 6 }}>
              {t("settings.promptTemplatesApplyHint")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {usedVariables.map((varName) => (
                <div key={varName} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code style={{ fontSize: 11, minWidth: 140, color: "var(--primary)" }}>{varName}</code>
                  <input
                    className="input"
                    style={{ flex: 1, fontSize: 12 }}
                    placeholder={varName}
                    value={variables[varName] ?? ""}
                    onChange={(e) => onChange({ ...variables, [varName]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-sm btn-primary" style={{ marginBottom: 12 }} onClick={onApply}>
          <Play className="inline-block" size={12} /> {t("settings.promptTemplatesApply")}
        </button>

        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.missingVariables.length > 0 && (
              <div
                style={{
                  padding: 8,
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "#f59e0b",
                }}
              >
                {t("settings.promptTemplatesMissingVars", { vars: result.missingVariables.join(", ") })}
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 4 }}>
                {t("settings.promptTemplatesApplyResult")}
              </div>
              <div
                style={{
                  padding: 10,
                  background: "var(--card2)",
                  borderRadius: 6,
                  fontFamily: "monospace",
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                {result.prompt}
              </div>
            </div>
            {result.negativePrompt && (
              <div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 4 }}>
                  {t("settings.promptTemplatesApplyNegative")}
                </div>
                <div
                  style={{
                    padding: 10,
                    background: "var(--card2)",
                    borderRadius: 6,
                    fontFamily: "monospace",
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
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
