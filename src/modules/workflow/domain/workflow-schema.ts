/**
 * Phase 7 节点化工作流 — Zod 数据模型
 *
 * 工作流 = 节点 + 连线。节点携带位置信息（画布布局），连线携带数据流关系。
 * domain 层规则：纯 schema，无外部依赖（zod 允许）。
 */
import { z } from "zod";

export const workflowNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["input", "process", "output"]),
  subtype: z.string(),
  label: z.string(),
  config: z.record(z.string(), z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }),
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

export type Workflow = z.infer<typeof workflowSchema>;

/** 从 React Flow 节点/边转换为领域工作流（忽略运行时字段） */
export function toWorkflowNode(
  n: { id: string; position: { x: number; y: number }; data: { kind: string; subtype: string; label: string; config?: Record<string, unknown> } },
): WorkflowNode {
  return {
    id: n.id,
    kind: n.data.kind as WorkflowNode["kind"],
    subtype: n.data.subtype,
    label: n.data.label,
    config: n.data.config ?? {},
    position: n.position,
  };
}

export function toWorkflowEdge(
  e: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null },
): WorkflowEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  };
}

/** 生成稳定节点 id（node-{timestamp}-{seq}） */
export function createNodeId(seq: number): string {
  return `wf-node-${Date.now().toString(36)}-${seq}`;
}
