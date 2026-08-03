import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { t } from "@/shared/constants";
import { confirm } from "@/shared/utils/confirm";
import { BeatNode } from "./nodes/BeatNode";
import { ResourceNode } from "./nodes/ResourceNode";
import { Blockout3DNode } from "./nodes/Blockout3DNode";
import {
  CanvasEmptyState,
  CanvasOverlayPanel,
  CanvasToolbar,
  ResourcePickerOverlay,
} from "./CanvasPanels";
import { parseResourceNodeId, beatNodeId } from "./layout/auto-layout";
import {
  applyConnection,
  computeUnboundResourceIds,
  deriveEdges,
  moveBeatBefore,
  removeBindingEdges,
  resolveResourceReferences,
} from "./hooks/use-canvas-bindings";
import { useCanvasNodes } from "./hooks/use-canvas-nodes";
import { useResourceVisibility } from "./hooks/use-resource-visibility";
import type {
  BindingEdgeData,
  BlockoutNodeData,
  CanvasEdge,
  CanvasNode,
  ResourceKind,
} from "./types";

/** 节点类型注册表必须在组件外部定义（稳定引用，避免 React Flow 告警） */
const nodeTypes = {
  beat: BeatNode,
  character: ResourceNode,
  scene: ResourceNode,
  blockout: Blockout3DNode,
};

/** 构造断开连线的确认文案：帧衔接边用帧衔接文案，资源绑定边用绑定文案；无绑定数据返回 null */
function describePendingEdgeDeletes(
  deleted: Edge[],
  beats: StoryBeat[],
  characters: Character[],
  scenes: Scene[],
): { title: string; message: string; count: number } | null {
  const binding = deleted.filter((e) => e.data);
  if (binding.length === 0) return null;
  const data = binding[0]?.data as BindingEdgeData | undefined;
  if (data?.kind === "frame") {
    const beat = beats.find((b) => b.id === data.beatId);
    return {
      title: t("storyboard.canvas.deleteFrameLinkTitle"),
      message: t("storyboard.canvas.deleteFrameLinkConfirm", {
        label: beat?.title || "",
      }),
      count: binding.length,
    };
  }
  if (data?.kind === "character" || data?.kind === "scene") {
    const resource =
      data.kind === "character"
        ? characters.find((c) => c.id === data.resourceId)
        : scenes.find((s) => s.id === data.resourceId);
    return {
      title: t("storyboard.canvas.deleteEdgeTitle"),
      message: t("storyboard.canvas.deleteEdgeConfirm", {
        label: resource?.name || data.resourceId,
      }),
      count: binding.length,
    };
  }
  return null;
}

/** 资源节点选中时：高亮其绑定边、变暗其他边 */
function applyResourceSelectionStyles(
  edges: CanvasEdge[],
  selectedResourceId: string | null,
): CanvasEdge[] {
  const selected = parseResourceNodeId(selectedResourceId ?? "");
  if (!selected) return edges;
  return edges.map((edge) => {
    const data = edge.data;
    if (!data) return edge;
    const isSelectedEdge =
      data.kind === selected.kind && data.resourceId === selected.resourceId;
    return {
      ...edge,
      style: {
        ...edge.style,
        opacity: isSelectedEdge ? 1 : 0.15,
        strokeWidth: isSelectedEdge ? 2.5 : undefined,
      },
    };
  });
}

/** 时间线 → 画布定位请求：点击时间线分镜时由外部传入 */
export interface CanvasFocusRequest {
  /** 目标分镜 id */
  beatId: string;
  /** 请求序号：重复点击同一分镜也触发重新定位 */
  requestId: number;
}

interface StoryboardCanvasProps {
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  selectedBeatId: string | null;
  onBeatSelect: (beatId: string) => void;
  onAddBeat: () => void;
  onReorderBeats?: (beats: StoryBeat[]) => void;
  onUpdateBeat: (id: string, updates: Partial<StoryBeat>) => void;
  /** 时间线联动：定位并高亮对应分镜节点 */
  focusRequest?: CanvasFocusRequest | null;
}

function StoryboardCanvasInner({
  beats,
  characters,
  scenes,
  selectedBeatId,
  onBeatSelect,
  onAddBeat,
  onReorderBeats,
  onUpdateBeat,
  focusRequest,
}: StoryboardCanvasProps) {
  const { getNode } = useReactFlow();
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [resourcePickerKind, setResourcePickerKind] = useState<ResourceKind | null>(null);
  const {
    hiddenResourceIds,
    toggleResourceVisibility,
    showAllResources,
    showBoundOnly,
  } = useResourceVisibility(
    computeUnboundResourceIds(beats, characters, scenes),
    beats,
    characters,
    scenes,
  );
  const { nodes, onNodesChange, resetPositions, fitView } = useCanvasNodes({
    beats,
    characters,
    scenes,
    selectedBeatId,
    selectedResourceId,
    hiddenResourceIds,
  });
  const [showMinimap, setShowMinimap] = useState(true);

  // 连线：完全由 beats 派生；资源节点选中时高亮其绑定边、变暗其他绑定边
  const edges: CanvasEdge[] = useMemo(
    () => applyResourceSelectionStyles(deriveEdges(beats), selectedResourceId),
    [beats, selectedResourceId],
  );

  // 画布 → 表单：连线创建（资源→分镜=绑定；分镜→分镜=重排）
  const onConnect = useCallback(
    (connection: Connection) => {
      const reordered = applyConnection(connection, beats, onUpdateBeat);
      if (reordered) onReorderBeats?.(reordered);
    },
    [beats, onUpdateBeat, onReorderBeats],
  );

  // 画布 → 表单：断开绑定连线（先确认，区分资源绑定边与首尾帧衔接边）
  const onEdgesDelete = useCallback(
    async (deleted: Edge[]) => {
      const desc = describePendingEdgeDeletes(deleted, beats, characters, scenes);
      if (!desc) return;
      const ok = await confirm({
        title: desc.title,
        description:
          desc.count > 1 ? `${desc.message}（共 ${desc.count} 条）` : desc.message,
        confirmText: t("storyboard.canvas.confirmDisconnect"),
        variant: "warning",
      });
      if (!ok) return;
      removeBindingEdges(
        deleted.filter((e) => e.data),
        beats,
        onUpdateBeat,
      );
    },
    [beats, characters, scenes, onUpdateBeat],
  );

  // 节点点击：分镜/3D 导演台 → 打开详细编辑；资源 → 引用反查
  const onNodeClick = useCallback<NodeMouseHandler<CanvasNode>>(
    (_event, node) => {
      if (node.type === "beat") {
        setSelectedResourceId(null);
        onBeatSelect(node.id.slice("beat-".length));
      } else if (node.type === "blockout") {
        setSelectedResourceId(null);
        onBeatSelect((node.data as BlockoutNodeData).beatId);
      } else {
        setSelectedResourceId((prev) => (prev === node.id ? null : node.id));
      }
    },
    [onBeatSelect],
  );

  // 拖拽分镜节点到另一个分镜上 = 重排镜头顺序
  const onNodeDragStop = useCallback<OnNodeDrag<CanvasNode>>(
    (_event, node, allNodes) => {
      if (node.type !== "beat") return;
      const draggedBeatId = node.id.slice("beat-".length);
      let best: { id: string; dist: number } | null = null;
      for (const n of allNodes) {
        if (n.type !== "beat" || n.id === node.id) continue;
        const dist = Math.hypot(
          n.position.x - node.position.x,
          n.position.y - node.position.y,
        );
        if (!best || dist < best.dist) best = { id: n.id, dist };
      }
      if (!best || best.dist > 150) return;
      const targetBeatId = best.id.slice("beat-".length);
      const reordered = moveBeatBefore(beats, draggedBeatId, targetBeatId);
      if (reordered) onReorderBeats?.(reordered);
    },
    [beats, onReorderBeats],
  );

  const handleAutoLayout = useCallback(() => {
    resetPositions();
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
  }, [resetPositions, fitView]);

  useEffect(() => {
    const node = focusRequest && getNode(beatNodeId(focusRequest.beatId));
    if (node) requestAnimationFrame(() => fitView({ nodes: [node], duration: 300, padding: 0.35 }));
  }, [focusRequest, fitView, getNode]);

  const minimapNodeColor = useCallback((node: CanvasNode) => {
    if (node.type === "beat") return "var(--primary)";
    if (node.type === "blockout") return "var(--warning)";
    return node.type === "character" ? "var(--info)" : "var(--success)";
  }, []);

  // 引用反查面板数据
  const selectedResourceInfo = useMemo(() => {
    if (!selectedResourceId) return null;
    const parsed = parseResourceNodeId(selectedResourceId);
    if (!parsed) return null;
    const resource =
      parsed.kind === "character"
        ? characters.find((c) => c.id === parsed.resourceId)
        : scenes.find((s) => s.id === parsed.resourceId);
    if (!resource) return null;
    return {
      kind: parsed.kind,
      name: resource.name,
      referencedBeatIds: resolveResourceReferences(
        beats,
        parsed.kind,
        parsed.resourceId,
      ),
    };
  }, [selectedResourceId, characters, scenes, beats]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => {
          setSelectedResourceId(null);
          setResourcePickerKind(null);
        }}
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={26}
          size={1.5}
          color="var(--border)"
        />
        <Controls showInteractive={false} />
        {showMinimap && (
          <MiniMap pannable zoomable nodeColor={minimapNodeColor} />
        )}

        <CanvasToolbar
          onAddBeat={onAddBeat}
          onAutoLayout={handleAutoLayout}
          onFitView={() => fitView({ padding: 0.2, duration: 300 })}
          showMinimap={showMinimap}
          onToggleMinimap={() => setShowMinimap((v) => !v)}
          resourcePickerKind={resourcePickerKind}
          onOpenResourcePicker={(kind) =>
            setResourcePickerKind((prev) => (prev === kind ? null : kind))
          }
        />

        <CanvasOverlayPanel
          beats={beats}
          selectedResourceInfo={selectedResourceInfo}
          onSelectBeat={(beatId) => {
            setSelectedResourceId(null);
            onBeatSelect(beatId);
          }}
          onClose={() => setSelectedResourceId(null)}
        />
      </ReactFlow>

      {/* 资源节点选择面板（浮动在工具栏下方，按类型预筛） */}
      {resourcePickerKind !== null && (
        <ResourcePickerOverlay
          beats={beats}
          characters={characters}
          scenes={scenes}
          hiddenResourceIds={hiddenResourceIds}
          initialKind={resourcePickerKind}
          onToggle={toggleResourceVisibility}
          onShowAll={showAllResources}
          onShowBoundOnly={showBoundOnly}
          onClose={() => setResourcePickerKind(null)}
        />
      )}

      {/* 空态 */}
      {beats.length === 0 && <CanvasEmptyState />}
    </div>
  );
}

export function StoryboardCanvas(props: StoryboardCanvasProps) {
  return (
    <ReactFlowProvider>
      <StoryboardCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
