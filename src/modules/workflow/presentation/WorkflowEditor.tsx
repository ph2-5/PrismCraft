/**
 * Phase 7 节点化工作流 — 主编辑器
 *
 * 布局：节点面板 | React Flow 画布 | 配置面板
 * 顶栏：模板选择 + 验证 + 运行控制
 * 底部：执行日志
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, useReactFlow, type Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, Pause, RotateCcw, Square, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { t } from "@/shared/constants";
import { WorkflowNode } from "./WorkflowNode";
import { WorkflowSidebar, PALETTE_DRAG_MIME, type PaletteNodeSpec } from "./WorkflowSidebar";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { useWorkflowStore } from "../hooks/use-workflow";
import { WORKFLOW_TEMPLATES } from "../templates";
import { validateWorkflow } from "../services/workflow-validator";
import { toWorkflowNode, toWorkflowEdge } from "../domain/workflow-schema";

const nodeTypes = { workflow: WorkflowNode };

function CanvasInner() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const running = useWorkflowStore((s) => s.running);
  const run = useWorkflowStore((s) => s.run);
  const addNodeFromPalette = useWorkflowStore((s) => s.addNodeFromPalette);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const runWorkflow = useWorkflowStore((s) => s.runWorkflow);
  const pauseWorkflow = useWorkflowStore((s) => s.pauseWorkflow);
  const resumeWorkflow = useWorkflowStore((s) => s.resumeWorkflow);
  const stopWorkflow = useWorkflowStore((s) => s.stopWorkflow);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);

  const { screenToFlowPosition } = useReactFlow();
  const dropRef = useRef(false);

  // 面板点击添加（画布中心附近）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PaletteNodeSpec>).detail;
      if (!detail) return;
      addNodeFromPalette(detail.kind, detail.subtype, { x: 120 + Math.random() * 200, y: 80 + Math.random() * 120 });
    };
    window.addEventListener("workflow:palette-add", handler);
    return () => window.removeEventListener("workflow:palette-add", handler);
  }, [addNodeFromPalette]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData(PALETTE_DRAG_MIME);
      if (!raw) return;
      dropRef.current = true;
      try {
        const spec = JSON.parse(raw) as PaletteNodeSpec;
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNodeFromPalette(spec.kind, spec.subtype, position);
      } catch {
        // 忽略非法拖拽数据
      }
    },
    [addNodeFromPalette, screenToFlowPosition],
  );

  const onConnectCb = useCallback((conn: Connection) => onConnect(conn), [onConnect]);
  const onNodesChangeCb = useWorkflowStore((s) => s.onNodesChange);

  // 校验结果
  const validation = useMemo(
    () => validateWorkflow(nodes.map((n) => toWorkflowNode(n)), edges.map((e) => toWorkflowEdge(e))),
    [nodes, edges],
  );

  const isPaused = run?.status === "paused";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 顶栏 */}
      <div className="top-tabs justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{t("workflow.title")}</span>
          <select
            className="input input-sm w-auto text-xs"
            value=""
            onChange={(e) => {
              const tpl = WORKFLOW_TEMPLATES.find((x) => x.id === e.target.value);
              if (tpl) loadWorkflow(tpl.create());
            }}
          >
            <option value="" disabled>
              {t("workflow.templatePlaceholder")}
            </option>
            {WORKFLOW_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
          {validation.valid ? (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--success)" }}>
              <CheckCircle2 size={13} /> {t("workflow.validationOk")}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--destructive)" }}>
              <AlertTriangle size={13} />
              {validation.issues.filter((i) => i.severity === "error").length} {t("workflow.validationErrors")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!running ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={!validation.valid} onClick={() => void runWorkflow()}>
              <Play size={14} /> {t("workflow.run")}
            </button>
          ) : isPaused ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={resumeWorkflow}>
              <Play size={14} /> {t("workflow.resume")}
            </button>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" onClick={pauseWorkflow}>
              <Pause size={14} /> {t("workflow.pause")}
            </button>
          )}
          {running && (
            <button type="button" className="btn btn-outline btn-sm" onClick={stopWorkflow}>
              <Square size={13} /> {t("workflow.stop")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => loadWorkflow(WORKFLOW_TEMPLATES[0]!.create())}
            title={t("workflow.reset")}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* 主体：面板 + 画布 + 配置 */}
      <div className="flex flex-1 min-h-0">
        <WorkflowSidebar />
        <div className="flex-1 min-w-0 relative" onDragOver={onDragOver} onDrop={onDrop} onClick={() => selectNode(null)}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onConnect={onConnectCb}
            onNodeClick={(_, node) => selectNode(node.id)}
            onPaneClick={() => selectNode(null)}
            onNodesChange={onNodesChangeCb}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {/* 进度浮层 */}
          {running && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 card px-3 py-2 text-xs flex items-center gap-2 z-10">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--warning)", animation: "pulse 1s infinite" }} />
              {t("workflow.running")}: {run?.progress ?? 0}%
            </div>
          )}
        </div>
        <NodeConfigPanel />
      </div>

      {/* 执行日志 */}
      <RunLogPanel />
    </div>
  );
}

export function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function RunLogPanel() {
  const run = useWorkflowStore((s) => s.run);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [run?.log.length]);

  return (
    <div className="border-t border-border bg-card2/40 h-32 flex flex-col">
      <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
        <ChevronDown size={12} /> {t("workflow.logTitle")}
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto px-3 pb-2 font-mono text-[11px] leading-[1.7]">
        {run?.log.length === 0 && <div className="text-muted-foreground">{t("workflow.logEmpty")}</div>}
        {run?.log.map((entry, i) => (
          <div key={i} style={{ color: entry.level === "error" ? "var(--destructive)" : entry.level === "warn" ? "var(--warning)" : "var(--muted-fg)" }}>
            [{new Date(entry.time).toLocaleTimeString()}] {entry.nodeId ? `[${entry.nodeId}] ` : ""}
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}
