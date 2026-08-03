/**
 * Phase 7 节点化工作流 — 节点面板
 *
 * 三类节点（输入/处理/输出）按子类型列出，支持拖拽到画布或点击添加。
 */
import { memo } from "react";
import { t } from "@/shared/constants";
import type { WorkflowNodeKind, WorkflowSubtype } from "../domain/node-types";
import { INPUT_SUBTYPES, PROCESS_SUBTYPES, OUTPUT_SUBTYPES, SUBTYPE_LABELS, NODE_KIND_COLOR } from "../domain/node-types";

export const PALETTE_DRAG_MIME = "application/x-prismcraft-workflow-node";

export type PaletteNodeSpec = {
  kind: WorkflowNodeKind;
  subtype: WorkflowSubtype;
};

function PaletteGroup({
  kind,
  labelKey,
  subtypes,
}: {
  kind: WorkflowNodeKind;
  labelKey: string;
  subtypes: readonly WorkflowSubtype[];
}) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5" style={{ color: NODE_KIND_COLOR[kind] }}>
        {t(labelKey)}
      </div>
      <div className="flex flex-col gap-1">
        {subtypes.map((subtype) => (
          <button
            key={subtype}
            type="button"
            draggable
            className="btn btn-outline btn-sm justify-start text-left"
            onDragStart={(e) => {
              e.dataTransfer.setData(PALETTE_DRAG_MIME, JSON.stringify({ kind, subtype } satisfies PaletteNodeSpec));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => {
              // 点击添加：通过自定义事件通知画布在中心位置插入
              window.dispatchEvent(
                new CustomEvent<PaletteNodeSpec>("workflow:palette-add", { detail: { kind, subtype } }),
              );
            }}
            title={t("workflow.dragHint")}
          >
            {t(SUBTYPE_LABELS[subtype])}
          </button>
        ))}
      </div>
    </div>
  );
}

export const WorkflowSidebar = memo(function WorkflowSidebar() {
  return (
    <div className="w-48 shrink-0 border-r border-border p-3 overflow-y-auto bg-card2/40">
      <div className="text-xs font-semibold mb-3">{t("workflow.paletteTitle")}</div>
      <PaletteGroup kind="input" labelKey="workflow.kind.input" subtypes={INPUT_SUBTYPES} />
      <PaletteGroup kind="process" labelKey="workflow.kind.process" subtypes={PROCESS_SUBTYPES} />
      <PaletteGroup kind="output" labelKey="workflow.kind.output" subtypes={OUTPUT_SUBTYPES} />
    </div>
  );
});
