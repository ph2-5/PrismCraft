/**
 * Phase 7 节点化工作流 — 节点类型定义
 *
 * 三种节点类型（输入 / 处理 / 输出），每个节点对应一个 Agent 工具或业务服务。
 * 纯类型 + 常量，无外部依赖（domain 层规则）。
 */

/** 输入节点子类型 */
export type InputSubtype = "text" | "novel" | "script" | "prompt";

/** 处理节点子类型 */
export type ProcessSubtype =
  | "character-extract"
  | "scene-extract"
  | "shot-breakdown"
  | "prompt-generate"
  | "consistency-check"
  | "style-transfer";

/** 输出节点子类型 */
export type OutputSubtype = "video-generate" | "image-generate" | "export" | "render";

export type WorkflowNodeKind = "input" | "process" | "output";

export type WorkflowSubtype = InputSubtype | ProcessSubtype | OutputSubtype;

/** React Flow 节点 data 负载 */
export type WorkflowNodeData = {
  kind: WorkflowNodeKind;
  subtype: WorkflowSubtype;
  label: string;
  config: Record<string, unknown>;
};

export const INPUT_SUBTYPES: readonly InputSubtype[] = ["text", "novel", "script", "prompt"];

export const PROCESS_SUBTYPES: readonly ProcessSubtype[] = [
  "character-extract",
  "scene-extract",
  "shot-breakdown",
  "prompt-generate",
  "consistency-check",
  "style-transfer",
];

export const OUTPUT_SUBTYPES: readonly OutputSubtype[] = [
  "video-generate",
  "image-generate",
  "export",
  "render",
];

export const NODE_KIND_LABELS: Record<WorkflowNodeKind, string> = {
  input: "workflow.kind.input",
  process: "workflow.kind.process",
  output: "workflow.kind.output",
};

/** 子类型 → i18n key 映射（写入 messages.ts） */
export const SUBTYPE_LABELS: Record<WorkflowSubtype, string> = {
  text: "workflow.subtype.text",
  novel: "workflow.subtype.novel",
  script: "workflow.subtype.script",
  prompt: "workflow.subtype.prompt",
  "character-extract": "workflow.subtype.characterExtract",
  "scene-extract": "workflow.subtype.sceneExtract",
  "shot-breakdown": "workflow.subtype.shotBreakdown",
  "prompt-generate": "workflow.subtype.promptGenerate",
  "consistency-check": "workflow.subtype.consistencyCheck",
  "style-transfer": "workflow.subtype.styleTransfer",
  "video-generate": "workflow.subtype.videoGenerate",
  "image-generate": "workflow.subtype.imageGenerate",
  export: "workflow.subtype.export",
  render: "workflow.subtype.render",
};

/** 子类型 → 默认配置 */
export const DEFAULT_SUBTYPE_CONFIG: Record<WorkflowSubtype, Record<string, unknown>> = {
  text: { text: "" },
  novel: { text: "" },
  script: { text: "" },
  prompt: { text: "" },
  "character-extract": {},
  "scene-extract": {},
  "shot-breakdown": {},
  "prompt-generate": { prompt: "", modelId: "" },
  "consistency-check": {},
  "style-transfer": { style: "" },
  "video-generate": { modelId: "" },
  "image-generate": { modelId: "" },
  export: { format: "mp4" },
  render: { format: "mp4" },
};

/** 节点配色（对应品牌 CSS 变量语义） */
export const NODE_KIND_COLOR: Record<WorkflowNodeKind, string> = {
  input: "var(--primary)",
  process: "var(--warning)",
  output: "var(--success)",
};
