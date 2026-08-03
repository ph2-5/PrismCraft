import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNodesState, useReactFlow } from "@xyflow/react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { computeAutoLayout } from "../layout/auto-layout";
import { buildInitialNodes, reconcileNodes } from "./use-canvas-bindings";
import type { CanvasNode } from "../types";

export interface UseCanvasNodesOptions {
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  selectedBeatId: string | null;
  /** 当前选中的资源节点 id（完整节点 id） */
  selectedResourceId: string | null;
  /** 已在画布上隐藏的资源 id（不生成节点） */
  hiddenResourceIds?: Set<string>;
}

/**
 * 画布节点状态管理：
 * - 用 useNodesState 持有节点（保留用户拖拽位置）
 * - beats/characters/scenes/选中态变化时调和节点（补齐新增、移除已删、刷新 data）
 * - 首次有节点时自动 fitView
 */
export function useCanvasNodes({
  beats,
  characters,
  scenes,
  selectedBeatId,
  selectedResourceId,
  hiddenResourceIds,
}: UseCanvasNodesOptions) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const didFitRef = useRef(false);

  const positions = useMemo(
    () => computeAutoLayout(beats, characters, scenes),
    [beats, characters, scenes],
  );

  useEffect(() => {
    const input = {
      beats,
      characters,
      scenes,
      positions,
      selectedBeatId,
      selectedResourceId,
      hiddenResourceIds,
    };
    setNodes((current) =>
      current.length === 0
        ? buildInitialNodes(input)
        : reconcileNodes(current, input),
    );
  }, [beats, characters, scenes, positions, selectedBeatId, selectedResourceId, hiddenResourceIds, setNodes]);

  useEffect(() => {
    if (!didFitRef.current && nodes.length > 0) {
      didFitRef.current = true;
      requestAnimationFrame(() => fitView({ padding: 0.15 }));
    }
  }, [nodes.length, fitView]);

  /** 自动布局：重置全部节点为派生位置 */
  const resetPositions = useCallback(() => {
    setNodes((current) =>
      current.map((n) => ({
        ...n,
        position: positions.get(n.id) ?? n.position,
      })),
    );
  }, [positions, setNodes]);

  return { nodes, setNodes, onNodesChange, resetPositions, fitView };
}
