/**
 * Phase 7 节点化工作流 — 自定义节点
 *
 * input：仅右侧 source handle（数据流出）
 * process：左侧 target + 右侧 source
 * output：仅左侧 target（终点）
 * 执行状态通过 zustand 细粒度订阅（run.nodeStates[id]）。
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, ListFilter, Wand2, Clapperboard, Image as ImageIcon, Download, Trash2, type LucideIcon } from "lucide-react";
import { t } from "@/shared/constants";
import type { WorkflowNodeData, WorkflowSubtype } from "../domain/node-types";
import { NODE_KIND_COLOR } from "../domain/node-types";
import { useWorkflowStore } from "../hooks/use-workflow";

const SUBTYPE_ICONS: Partial<Record<WorkflowSubtype, LucideIcon>> = {
  text: FileText,
  novel: FileText,
  script: FileText,
  prompt: FileText,
  "character-extract": ListFilter,
  "scene-extract": ListFilter,
  "shot-breakdown": ListFilter,
  "prompt-generate": Wand2,
  "consistency-check": Wand2,
  "style-transfer": Wand2,
  "video-generate": Clapperboard,
  "image-generate": ImageIcon,
  export: Download,
  render: Download,
};

const KIND_LABELS: Record<string, string> = {
  input: "workflow.kind.input",
  process: "workflow.kind.process",
  output: "workflow.kind.output",
};

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 智能摘要节点输出：优先展示业务字段（text/beats/characters/scenes/tasks/images） */
function summarizeOutput(output: unknown): string {
  if (output === null || output === undefined) return "";
  if (typeof output === "string") return truncate(output, 40);
  if (Array.isArray(output)) return `array[${output.length}]`;
  if (typeof output === "object") {
    const record = output as Record<string, unknown>;
    for (const key of ["text", "beats", "characters", "scenes", "tasks", "images", "consistency"] as const) {
      if (key in record) {
        const v = record[key];
        if (typeof v === "string") return truncate(v, 40);
        if (Array.isArray(v)) return `${key}[${v.length}]`;
        if (v && typeof v === "object") return key;
      }
    }
    return truncate(JSON.stringify(record), 40);
  }
  return truncate(String(output), 40);
}

export const WorkflowNode = memo(function WorkflowNode(props: NodeProps) {
  const data = props.data as WorkflowNodeData;
  const runState = useWorkflowStore((s) => s.run?.nodeStates[props.id]);
  const status = runState?.status ?? "pending";
  const selected = useWorkflowStore((s) => s.selectedNodeId === props.id);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const selectNode = useWorkflowStore((s) => s.selectNode);

  const Icon = SUBTYPE_ICONS[data.subtype] ?? FileText;
  const accent = NODE_KIND_COLOR[data.kind];

  const statusColor =
    status === "running" ? "var(--warning)" : status === "completed" ? "var(--success)" : status === "failed" ? "var(--destructive)" : "var(--muted-fg)";

  const output = runState?.output;
  const hasOutput = output !== null && output !== undefined;
  const error = runState?.error;

  return (
    <div
      className="card"
      onClick={(e) => {
        e.stopPropagation();
        selectNode(props.id);
      }}
      style={{
        width: 200,
        padding: 10,
        borderColor: selected ? "var(--primary)" : "var(--border)",
        cursor: "grab",
        boxShadow: selected ? "0 0 0 2px var(--primary)" : undefined,
      }}
    >
      {data.kind !== "input" && (
        <Handle type="target" position={Position.Left} style={{ background: "var(--muted-fg)", width: 8, height: 8 }} />
      )}
      {data.kind !== "output" && (
        <Handle type="source" position={Position.Right} style={{ background: "var(--muted-fg)", width: 8, height: 8 }} />
      )}

      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color: accent }} />
        <span className="text-xs font-semibold truncate flex-1">{data.label}</span>
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
          style={{ color: "var(--muted-fg)" }}
          title={t("workflow.removeNode")}
          onClick={(e) => {
            e.stopPropagation();
            removeNode(props.id);
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
        >
          {t(KIND_LABELS[data.kind] ?? "workflow.kind.process")}
        </span>
        <span className="text-[10px] text-muted-foreground truncate">{data.subtype}</span>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5" style={{ color: statusColor }}>
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: statusColor, animation: status === "running" ? "pulse 1s infinite" : undefined }}
        />
        <span className="text-[10px]">{t(`workflow.nodeStatus.${status}`)}</span>
      </div>

      {/* 输出摘要 / 错误提示 */}
      {status === "failed" && error && (
        <div className="mt-1.5 pt-1 border-t border-border text-[10px] break-all leading-[1.5]" style={{ color: "var(--destructive)" }}>
          <span className="opacity-70">{t("workflow.nodeError")}: </span>
          {truncate(error, 60)}
        </div>
      )}
      {status === "completed" && hasOutput && (
        <div className="mt-1.5 pt-1 border-t border-border text-[10px] break-all leading-[1.5] text-muted-foreground">
          <span className="opacity-70">{t("workflow.nodeOutput")}: </span>
          {summarizeOutput(output)}
        </div>
      )}
    </div>
  );
});
