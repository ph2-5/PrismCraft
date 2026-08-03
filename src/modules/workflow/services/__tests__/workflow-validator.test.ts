/**
 * Phase 7 — workflow-validator 单元测试
 */
import { describe, it, expect } from "vitest";
import { validateEdge, validateWorkflow, topologicalSort } from "../workflow-validator";
import type { WorkflowEdge, WorkflowNode } from "../../domain/workflow-schema";

function node(id: string, kind: WorkflowNode["kind"]): WorkflowNode {
  return { id, kind, subtype: "text", label: id, config: {}, position: { x: 0, y: 0 } };
}

function edge(source: string, target: string): WorkflowEdge {
  return { id: `e-${source}-${target}`, source, target };
}

describe("validateEdge", () => {
  it("input → process 合法", () => {
    const map = new Map([
      ["a", node("a", "input")],
      ["b", node("b", "process")],
    ]);
    expect(validateEdge({ source: "a", target: "b" }, map)).toBeNull();
  });

  it("process → process 合法", () => {
    const map = new Map([
      ["a", node("a", "process")],
      ["b", node("b", "process")],
    ]);
    expect(validateEdge({ source: "a", target: "b" }, map)).toBeNull();
  });

  it("output 不允许作为连线起点", () => {
    const map = new Map([
      ["a", node("a", "output")],
      ["b", node("b", "process")],
    ]);
    const issue = validateEdge({ source: "a", target: "b" }, map);
    expect(issue?.code).toBe("output-as-source");
  });

  it("input 不允许作为连线终点", () => {
    const map = new Map([
      ["a", node("a", "process")],
      ["b", node("b", "input")],
    ]);
    const issue = validateEdge({ source: "a", target: "b" }, map);
    expect(issue?.code).toBe("input-as-target");
  });

  it("自环被拒绝", () => {
    const map = new Map([["a", node("a", "process")]]);
    const issue = validateEdge({ source: "a", target: "a" }, map);
    expect(issue?.code).toBe("self-loop");
  });
});

describe("validateWorkflow", () => {
  it("合法工作流 valid = true", () => {
    const nodes = [node("a", "input"), node("b", "process"), node("c", "output")];
    const edges = [edge("a", "b"), edge("b", "c")];
    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("存在非法连线时 valid = false", () => {
    const nodes = [node("a", "output"), node("b", "process")];
    const edges = [edge("a", "b")];
    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "output-as-source")).toBe(true);
  });

  it("孤立节点产生 warning（不导致 invalid）", () => {
    const nodes = [node("a", "input"), node("b", "process")];
    const edges = [edge("a", "b")];
    const result = validateWorkflow([...nodes, node("orphan", "output")], edges);
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.code === "orphan-node")).toBe(true);
  });
});

describe("topologicalSort", () => {
  it("按依赖顺序返回节点 id", () => {
    const nodes = [node("a", "input"), node("b", "process"), node("c", "output")];
    const edges = [edge("a", "b"), edge("b", "c")];
    const order = topologicalSort(nodes, edges);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("存在环时返回 null", () => {
    const nodes = [node("a", "process"), node("b", "process")];
    const edges = [edge("a", "b"), edge("b", "a")];
    expect(topologicalSort(nodes, edges)).toBeNull();
  });
});
