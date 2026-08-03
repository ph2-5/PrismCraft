/**
 * Phase 7 节点化工作流 — 状态管理（Zustand）
 *
 * 职责：
 * - 画布节点/连线状态（React Flow 类型）
 * - 节点配置编辑（点击节点 → 配置面板）
 * - 模板加载 / 执行控制（run / pause / resume / stop）
 * 不包含副作用业务逻辑（执行引擎在 services/）。
 */
import { create } from "zustand";
import { applyNodeChanges, type Connection, type Edge, type Node, type NodeChange } from "@xyflow/react";
import type { RunState } from "../services/workflow-executor";
import { workflowRunner, registerBuiltinExecutors } from "../services/workflow-executor";
import type { Workflow, WorkflowNode, CustomWorkflowTemplate } from "../domain/workflow-schema";
import { toWorkflowNode, toWorkflowEdge, createNodeId } from "../domain/workflow-schema";
import type { WorkflowNodeData, WorkflowNodeKind, WorkflowSubtype } from "../domain/node-types";
import { DEFAULT_SUBTYPE_CONFIG, SUBTYPE_LABELS } from "../domain/node-types";
import { validateEdge } from "../services/workflow-validator";
import { WORKFLOW_TEMPLATES } from "../templates";
import { preferencesStorage } from "@/shared/utils/preferences";
import { t } from "@/shared/constants";

const CUSTOM_TEMPLATES_KEY = "workflow.customTemplates";

function loadCustomTemplates(): CustomWorkflowTemplate[] {
  return preferencesStorage.get<CustomWorkflowTemplate[]>(CUSTOM_TEMPLATES_KEY, []) ?? [];
}

function persistCustomTemplates(list: CustomWorkflowTemplate[]): void {
  preferencesStorage.set(CUSTOM_TEMPLATES_KEY, list);
}

// 内置 executor 只注册一次
let builtinRegistered = false;
function ensureBuiltinExecutors(): void {
  if (!builtinRegistered) {
    registerBuiltinExecutors();
    builtinRegistered = true;
  }
}

export const WORKFLOW_NODE_TYPE = "workflow";

export interface WorkflowStoreState {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  run: RunState | null;
  running: boolean;
  customTemplates: CustomWorkflowTemplate[];

  loadWorkflow: (wf: Workflow) => void;
  addNodeFromPalette: (kind: WorkflowNodeKind, subtype: WorkflowSubtype, position: { x: number; y: number }) => string;
  onNodesChange: (changes: NodeChange[]) => void;
  updateNodeConfig: (id: string, patch: Record<string, unknown>) => void;
  updateNodeLabel: (id: string, label: string) => void;
  removeNode: (id: string) => void;
  onConnect: (conn: Connection) => void;
  selectNode: (id: string | null) => void;
  runWorkflow: () => Promise<void>;
  pauseWorkflow: () => void;
  resumeWorkflow: () => void;
  stopWorkflow: () => void;
  saveAsTemplate: (name: string, description?: string) => string | null;
  deleteCustomTemplate: (id: string) => void;
}

let nodeSeq = 0;

function createRfNode(kind: WorkflowNodeKind, subtype: WorkflowSubtype, position: { x: number; y: number }): Node<WorkflowNodeData> {
  nodeSeq += 1;
  const id = createNodeId(nodeSeq);
  const label = t(SUBTYPE_LABELS[subtype]);
  return {
    id,
    type: WORKFLOW_NODE_TYPE,
    position,
    data: {
      kind,
      subtype,
      label,
      config: { ...DEFAULT_SUBTYPE_CONFIG[subtype] },
    },
  };
}

function toRfNodes(wf: Workflow): Node<WorkflowNodeData>[] {
  return wf.nodes.map((n: WorkflowNode) => ({
    id: n.id,
    type: WORKFLOW_NODE_TYPE,
    position: n.position,
    data: {
      kind: n.kind,
      subtype: n.subtype as WorkflowSubtype,
      label: n.label,
      config: { ...n.config },
    },
  }));
}

function toRfEdges(wf: Workflow): Edge[] {
  return wf.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }));
}

export const useWorkflowStore = create<WorkflowStoreState>()((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  run: null,
  running: false,
  customTemplates: loadCustomTemplates(),

  loadWorkflow: (wf) => {
    ensureBuiltinExecutors();
    set({ nodes: toRfNodes(wf), edges: toRfEdges(wf), selectedNodeId: null });
  },

  addNodeFromPalette: (kind, subtype, position) => {
    const node = createRfNode(kind, subtype, position);
    set({ nodes: [...get().nodes, node], selectedNodeId: node.id });
    return node.id;
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<WorkflowNodeData>[] });
  },

  updateNodeConfig: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n,
      ),
    });
  },

  updateNodeLabel: (id, label) => {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
    });
  },

  removeNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
  },

  onConnect: (conn) => {
    const nodeMap = new Map(get().nodes.map((n) => [n.id, toWorkflowNode(n)]));
    const issue = validateEdge(
      { source: conn.source ?? "", target: conn.target ?? "" },
      nodeMap,
    );
    if (issue) return; // 非法连线直接拒绝
    const edge: Edge = {
      id: `wf-edge-${conn.source}-${conn.target}-${Date.now().toString(36)}`,
      source: conn.source ?? "",
      target: conn.target ?? "",
      sourceHandle: conn.sourceHandle ?? undefined,
      targetHandle: conn.targetHandle ?? undefined,
    };
    set({ edges: [...get().edges, edge] });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  runWorkflow: async () => {
    ensureBuiltinExecutors();
    const { nodes, edges } = get();
    const workflow: Workflow = {
      id: "custom",
      name: "custom workflow",
      nodes: nodes.map((n) => toWorkflowNode(n)),
      edges: edges.map((e) => toWorkflowEdge(e)),
    };
    set({ running: true });
    try {
      await workflowRunner.execute(workflow, {
        onStateChange: (run) => set({ run, running: run.status === "running" || run.status === "paused" }),
      });
    } finally {
      set({ running: false });
    }
  },

  pauseWorkflow: () => workflowRunner.pause(),
  resumeWorkflow: () => workflowRunner.resume(),
  stopWorkflow: () => workflowRunner.stop(),

  saveAsTemplate: (name, description) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { nodes, edges, customTemplates } = get();
    if (nodes.length === 0) return null; // 空画布不可保存
    const nameTaken =
      WORKFLOW_TEMPLATES.some((tp) => tp.name === trimmed) ||
      customTemplates.some((ct) => ct.name === trimmed);
    if (nameTaken) return null;
    const id = `tpl-custom-${Date.now().toString(36)}`;
    const template: CustomWorkflowTemplate = {
      id,
      name: trimmed,
      description: description?.trim() || undefined,
      createdAt: Date.now(),
      workflow: {
        id,
        name: trimmed,
        description: description?.trim() || undefined,
        nodes: nodes.map((n) => toWorkflowNode(n)),
        edges: edges.map((e) => toWorkflowEdge(e)),
      },
    };
    const next = [...customTemplates, template];
    persistCustomTemplates(next);
    set({ customTemplates: next });
    return id;
  },

  deleteCustomTemplate: (id) => {
    const next = get().customTemplates.filter((ct) => ct.id !== id);
    persistCustomTemplates(next);
    set({ customTemplates: next });
  },
}));
