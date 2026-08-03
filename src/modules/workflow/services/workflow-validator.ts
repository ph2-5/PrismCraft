/**
 * Phase 7 节点化工作流 — 连线/工作流验证
 *
 * 数据流规则：
 * - input → process / output 合法（输入节点是起点）
 * - process → process / output 合法（处理节点可链式连接）
 * - output 是终点（不允许有出边）
 * - process 不允许 → input（反向数据流非法）
 * - 不允许自环
 * 纯函数，无外部依赖。
 */
import type { WorkflowEdge, WorkflowNode } from "../domain/workflow-schema";

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type WorkflowValidation = {
  valid: boolean;
  issues: ValidationIssue[];
};

export function validateEdge(
  edge: Pick<WorkflowEdge, "source" | "target"> & { id?: string },
  nodeMap: Map<string, WorkflowNode>,
): ValidationIssue | null {
  const edgeId = edge.id ?? "";
  const source = nodeMap.get(edge.source);
  const target = nodeMap.get(edge.target);
  if (!source || !target) {
    return { severity: "error", code: "missing-node", message: "Edge references a missing node", edgeId };
  }
  if (edge.source === edge.target) {
    return { severity: "error", code: "self-loop", message: "Self-loops are not allowed", edgeId };
  }
  if (source.kind === "output") {
    return { severity: "error", code: "output-as-source", message: "Output nodes cannot have outgoing edges", edgeId };
  }
  if (target.kind === "input") {
    return { severity: "error", code: "input-as-target", message: "Input nodes cannot be targets", edgeId };
  }
  return null;
}

export function validateWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowValidation {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const issues: ValidationIssue[] = [];

  for (const edge of edges) {
    const issue = validateEdge(edge, nodeMap);
    if (issue) issues.push(issue);
  }

  // 孤立节点警告（无入边也无出边）
  const edgeNodeIds = new Set<string>();
  for (const e of edges) {
    edgeNodeIds.add(e.source);
    edgeNodeIds.add(e.target);
  }
  for (const n of nodes) {
    if (!edgeNodeIds.has(n.id)) {
      issues.push({
        severity: "warning",
        code: "orphan-node",
        message: `Node "${n.label}" is not connected`,
        nodeId: n.id,
      });
    }
  }

  return { valid: issues.every((i) => i.severity !== "error"), issues };
}

/** 拓扑排序（Kahn 算法）：返回按依赖顺序的节点 id 数组；存在环时返回 null */
export function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] | null {
  const nodeIds = nodes.map((n) => n.id);
  const idSet = new Set(nodeIds);
  const indegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));

  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    adj.get(e.source)?.push(e.target);
  }

  const queue: string[] = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return order.length === nodeIds.length ? order : null;
}
