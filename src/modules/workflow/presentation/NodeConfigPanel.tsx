/**
 * Phase 7 节点化工作流 — 节点配置面板
 *
 * 选中节点时显示：名称编辑 + 子类型相关配置表单。
 * 配置项按 subtype 渲染（text/prompt 文本域、modelId 输入等）。
 */
import { memo, useEffect, useState } from "react";
import { t } from "@/shared/constants";
import type { WorkflowNodeData } from "../domain/node-types";
import { NODE_KIND_COLOR } from "../domain/node-types";
import { useWorkflowStore } from "../hooks/use-workflow";

function TextConfigField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <textarea
        className="input min-h-[80px] text-xs"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export const NodeConfigPanel = memo(function NodeConfigPanel() {
  const selectedId = useWorkflowStore((s) => s.selectedNodeId);
  const node = useWorkflowStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId));
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const updateNodeLabel = useWorkflowStore((s) => s.updateNodeLabel);

  // 本地 label 草稿（避免每次输入触发 store 写入）
  const [labelDraft, setLabelDraft] = useState(node?.data.label ?? "");
  useEffect(() => {
    setLabelDraft(node?.data.label ?? "");
  }, [node?.data.label, selectedId]);

  if (!node || !selectedId) {
    return (
      <div className="w-64 shrink-0 border-l border-border p-3 text-xs text-muted-foreground">
        {t("workflow.configEmptyHint")}
      </div>
    );
  }

  const data = node.data as WorkflowNodeData;
  const setConfig = (patch: Record<string, unknown>) => updateNodeConfig(selectedId, patch);
  const textValue = typeof data.config.text === "string" ? data.config.text : "";
  const promptValue = typeof data.config.prompt === "string" ? data.config.prompt : "";
  const modelIdValue = typeof data.config.modelId === "string" ? data.config.modelId : "";

  return (
    <div className="w-64 shrink-0 border-l border-border p-3 overflow-y-auto bg-card2/40 flex flex-col gap-3">
      <div className="text-xs font-semibold" style={{ color: NODE_KIND_COLOR[data.kind] }}>
        {t("workflow.nodeConfigTitle")}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">{t("workflow.nodeName")}</span>
        <input
          className="input text-xs"
          value={labelDraft}
          onChange={(e) => {
            setLabelDraft(e.target.value);
            updateNodeLabel(selectedId, e.target.value);
          }}
        />
      </label>

      {(data.subtype === "text" || data.subtype === "novel" || data.subtype === "script" || data.subtype === "prompt") && (
        <TextConfigField
          label={t("workflow.configText")}
          value={textValue}
          placeholder={t("workflow.configTextPlaceholder")}
          onChange={(v) => setConfig({ text: v })}
        />
      )}

      {data.subtype === "prompt-generate" && (
        <>
          <TextConfigField
            label={t("workflow.configPrompt")}
            value={promptValue}
            placeholder={t("workflow.configPromptPlaceholder")}
            onChange={(v) => setConfig({ prompt: v })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("workflow.configModelId")}</span>
            <input
              className="input text-xs"
              value={modelIdValue}
              placeholder="doubao-seedance-1-0-pro-250528"
              onChange={(e) => setConfig({ modelId: e.target.value })}
            />
          </label>
        </>
      )}

      {(data.subtype === "video-generate" || data.subtype === "image-generate") && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">{t("workflow.configModelId")}</span>
          <input
            className="input text-xs"
            value={modelIdValue}
            placeholder={t("workflow.configModelIdPlaceholder")}
            onChange={(e) => setConfig({ modelId: e.target.value })}
          />
        </label>
      )}

      <div className="text-[10px] text-muted-foreground mt-1">
        {t("workflow.nodeIdHint")}: <code className="font-mono">{node.id}</code>
      </div>
    </div>
  );
});
