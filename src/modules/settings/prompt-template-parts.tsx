import { useMemo } from "react";
import {
  Pencil,
  Play,
  Trash2,
  RotateCcw,
  X,
  Copy,
} from "lucide-react";
import { t } from "@/shared/constants";
import {
  CATEGORY_LABELS,
  TARGET_LABELS,
  type PromptTemplate,
  type PromptTemplateCategory,
  type PromptTemplateTarget,
  type CreatePromptTemplateInput,
} from "@/modules/prompt";

// ============= 类型定义 =============

export interface EditorState {
  open: boolean;
  mode: "create" | "edit";
  template: Partial<CreatePromptTemplateInput> & { id?: string };
}

export interface ApplierState {
  open: boolean;
  template: PromptTemplate | null;
  variables: Record<string, string>;
  result: { prompt: string; negativePrompt?: string; missingVariables: string[] } | null;
}

// ============= 模板卡片 =============

export function TemplateCard({
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

export function TemplateEditor({
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

export function TemplateApplier({
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
