/**
 * Phase 7 节点化工作流 — 模块公共 API
 *
 * 可视化节点编辑器，让用户自定义生成管道（类似 ComfyUI，面向 AI 动画场景）。
 *
 * 公共 API：
 *   WorkflowEditor          — 主编辑器（节点面板 + 画布 + 配置面板 + 日志）
 *   WORKFLOW_TEMPLATES      — 预设模板（一键成片 / 分镜优先 / 质量优先）
 *   useWorkflowStore        — 工作流状态（节点/连线/执行控制）
 *   WorkflowRunner          — 执行引擎（拓扑排序 / 并行 / 暂停恢复 / 日志）
 *   validateWorkflow        — 连线规则验证
 *
 * 详见 MODULE.md
 */

export { WorkflowEditor } from "./presentation/WorkflowEditor";
export { WorkflowNode } from "./presentation/WorkflowNode";
export { WorkflowSidebar, PALETTE_DRAG_MIME } from "./presentation/WorkflowSidebar";
export { NodeConfigPanel } from "./presentation/NodeConfigPanel";

export { useWorkflowStore } from "./hooks/use-workflow";

export { WorkflowRunner, workflowRunner, registerNodeExecutor, registerBuiltinExecutors } from "./services/workflow-executor";
export type { NodeExecutor, NodeExecutionContext, RunState, LogEntry, NodeRunState, WorkflowRunStatus, NodeExecutionStatus } from "./services/workflow-executor";
export { validateWorkflow, validateEdge, topologicalSort } from "./services/workflow-validator";
export type { WorkflowValidation, ValidationIssue } from "./services/workflow-validator";

export { WORKFLOW_TEMPLATES, createOneClickFilmTemplate, createShotFirstTemplate, createQualityFirstTemplate } from "./templates";

export type {
  WorkflowNodeData,
  WorkflowNodeKind,
  WorkflowSubtype,
  InputSubtype,
  ProcessSubtype,
  OutputSubtype,
} from "./domain/node-types";
export { INPUT_SUBTYPES, PROCESS_SUBTYPES, OUTPUT_SUBTYPES, SUBTYPE_LABELS, DEFAULT_SUBTYPE_CONFIG, NODE_KIND_LABELS, NODE_KIND_COLOR } from "./domain/node-types";

export type { Workflow, WorkflowNode as WorkflowNodeModel, WorkflowEdge, CustomWorkflowTemplate } from "./domain/workflow-schema";
export { workflowNodeSchema, workflowEdgeSchema, workflowSchema, toWorkflowNode, toWorkflowEdge, createNodeId } from "./domain/workflow-schema";
