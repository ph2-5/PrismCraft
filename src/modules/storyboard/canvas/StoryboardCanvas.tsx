import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { BeatNode } from "./nodes/BeatNode";
import { ResourceNode } from "./nodes/ResourceNode";
import {
  CanvasEmptyState,
  CanvasOverlayPanel,
  CanvasToolbar,
  ResourcePickerOverlay,
} from "./CanvasPanels";
import { parseResourceNodeId } from "./layout/auto-layout";
import {
  applyConnection,
  deriveEdges,
  moveBeatBefore,
  removeBindingEdges,
  resolveResourceReferences,
} from "./hooks/use-canvas-bindings";
import { useCanvasNodes } from "./hooks/use-canvas-nodes";
import { useResourceVisibility } from "./hooks/use-resource-visibility";
import type { CanvasEdge, CanvasNode } from "./types";

/** 节点类型注册表必须在组件外部定义（稳定引用，避免 React Flow 告警） */
const nodeTypes = { beat: BeatNode, character: ResourceNode, scene: ResourceNode };

interface StoryboardCanvasProps {
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  selectedBeatId: string | null;
  onBeatSelect: (beatId: string) => void;
  onAddBeat: () => void;
  onReorderBeats?: (beats: StoryBeat[]) => void;
  onUpdateBeat: (id: string, updates: Partial<StoryBeat>) => void;
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
}: StoryboardCanvasProps) {
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const {
    hiddenResourceIds,
    showResourcePicker,
    setShowResourcePicker,
    toggleResourceVisibility,
  } = useResourceVisibility();
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
  const edges: CanvasEdge[] = useMemo(() => {
    const base = deriveEdges(beats);
    const selectedResource = parseResourceNodeId(selectedResourceId ?? "");
    if (!selectedResource) return base;
    return base.map((edge) => {
      const data = edge.data;
      if (!data) return edge;
      const isSelectedEdge =
        data.kind === selectedResource.kind &&
        data.resourceId === selectedResource.resourceId;
      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: isSelectedEdge ? 1 : 0.15,
          strokeWidth: isSelectedEdge ? 2.5 : undefined,
        },
      };
    });
  }, [beats, selectedResourceId]);

  // 画布 → 表单：连线创建（资源→分镜=绑定；分镜→分镜=重排）
  const onConnect = useCallback(
    (connection: Connection) => {
      const reordered = applyConnection(connection, beats, onUpdateBeat);
      if (reordered) onReorderBeats?.(reordered);
    },
    [beats, onUpdateBeat, onReorderBeats],
  );

  // 画布 → 表单：断开绑定连线
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      removeBindingEdges(deleted, beats, onUpdateBeat);
    },
    [beats, onUpdateBeat],
  );

  // 节点点击：分镜 → 打开详细编辑；资源 → 引用反查
  const onNodeClick = useCallback<NodeMouseHandler<CanvasNode>>(
    (_event, node) => {
      if (node.type === "beat") {
        setSelectedResourceId(null);
        onBeatSelect(node.id.slice("beat-".length));
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

  const minimapNodeColor = useCallback((node: CanvasNode) => {
    if (node.type === "beat") return "var(--primary)";
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
          setShowResourcePicker(false);
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
          resourcePickerActive={showResourcePicker}
          onToggleResourcePicker={() => setShowResourcePicker((v) => !v)}
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

      {/* 资源节点选择面板（浮动在工具栏下方） */}
      {showResourcePicker && (
        <ResourcePickerOverlay
          characters={characters}
          scenes={scenes}
          hiddenResourceIds={hiddenResourceIds}
          onToggle={toggleResourceVisibility}
          onClose={() => setShowResourcePicker(false)}
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
