import type { Connection, Edge, XYPosition } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { getBeatCharacterIds } from "@/domain/utils";
import {
  beatNodeId,
  characterNodeId,
  sceneNodeId,
  parseBeatNodeId,
  parseResourceNodeId,
} from "../layout/auto-layout";
import type {
  BeatNodeData,
  BindingEdgeData,
  CanvasEdge,
  CanvasNode,
  ResourceKind,
  ResourceNodeData,
} from "../types";

/* ────────────────────────────────────────────────────────────────
 * 连线派生（视图层，单一事实源 = StoryBeat 字段）
 * ──────────────────────────────────────────────────────────────── */

/**
 * 从 beats 派生全部画布连线：
 * - 序列连线：beat i → beat i+1（镜头顺序）
 * - 角色绑定：character → beat（characterIds）
 * - 场景绑定：scene → beat（sceneId）
 * - 帧衔接：相邻 beat 存在 keyframe 链 / 首尾帧 derivedFrom 引用时，
 *   序列连线以警告色虚线表达（避免两条平行边重叠）
 */
export function deriveEdges(beats: StoryBeat[]): CanvasEdge[] {
  const edges: CanvasEdge[] = [];

  beats.forEach((beat, index) => {
    const next = beats[index + 1];
    if (!next) return;

    const chained =
      next.keyframe?.referencedPrevKeyframe === beat.id ||
      (beat.framePair?.lastFrame &&
        next.framePair?.firstFrame?.derivedFrom === beat.framePair.lastFrame.imageUrl);

    edges.push({
      id: `seq-${beat.id}-${next.id}`,
      source: beatNodeId(beat.id),
      target: beatNodeId(next.id),
      type: "smoothstep",
      deletable: false,
      selectable: false,
      focusable: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: chained ? "var(--warning)" : "var(--border)",
      },
      style: chained
        ? { stroke: "var(--warning)", strokeWidth: 1.5, strokeDasharray: "6 4" }
        : { stroke: "var(--border)", strokeWidth: 1.5 },
    });
  });

  beats.forEach((beat) => {
    for (const characterId of getBeatCharacterIds(beat)) {
      edges.push({
        id: `char-${characterId}-${beat.id}`,
        source: characterNodeId(characterId),
        target: beatNodeId(beat.id),
        type: "smoothstep",
        data: { kind: "character", resourceId: characterId, beatId: beat.id },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: "var(--info)",
        },
        style: { stroke: "var(--info)", strokeWidth: 1.5 },
      });
    }

    if (beat.sceneId) {
      edges.push({
        id: `scene-${beat.sceneId}-${beat.id}`,
        source: sceneNodeId(beat.sceneId),
        target: beatNodeId(beat.id),
        type: "smoothstep",
        data: { kind: "scene", resourceId: beat.sceneId, beatId: beat.id },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: "var(--success)",
        },
        style: { stroke: "var(--success)", strokeWidth: 1.5 },
      });
    }
  });

  return edges;
}

/** 引用反查：某资源被哪些 beat 引用（从所有 beat 派生） */
export function resolveResourceReferences(
  beats: StoryBeat[],
  kind: ResourceKind,
  resourceId: string,
): string[] {
  return beats
    .filter((beat) =>
      kind === "character"
        ? getBeatCharacterIds(beat).includes(resourceId)
        : beat.sceneId === resourceId,
    )
    .map((beat) => beat.id);
}

/* ────────────────────────────────────────────────────────────────
 * 节点构建 / 调和（纯函数）
 * ──────────────────────────────────────────────────────────────── */

export interface CanvasNodeBuildInput {
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  positions: Map<string, XYPosition>;
  selectedBeatId: string | null;
  /** 当前选中的资源节点 id（完整节点 id，如 character-xxx） */
  selectedResourceId: string | null;
  /** 已在画布上隐藏的资源 id（来自"添加角色/场景"面板），这些资源不生成节点 */
  hiddenResourceIds?: Set<string>;
}

function isResourceHidden(
  input: CanvasNodeBuildInput,
  id: string,
): boolean {
  return Boolean(input.hiddenResourceIds?.has(id));
}

function buildBeatNodeData(
  beat: StoryBeat,
  index: number,
  input: CanvasNodeBuildInput,
): BeatNodeData {
  const selectedResource = parseResourceNodeId(input.selectedResourceId ?? "");
  const referenced =
    selectedResource &&
    resolveResourceReferences(
      input.beats,
      selectedResource.kind,
      selectedResource.resourceId,
    ).includes(beat.id);
  return {
    kind: "beat",
    beat,
    index,
    isSelected: input.selectedBeatId === beat.id,
    isHighlighted: Boolean(input.selectedResourceId && referenced),
    isDimmed: Boolean(input.selectedResourceId && !referenced),
    characters: input.characters,
    scenes: input.scenes,
  };
}

function buildResourceNodeData(
  kind: ResourceKind,
  resource: Character | Scene,
  input: CanvasNodeBuildInput,
): ResourceNodeData {
  const referencedBeatIds = resolveResourceReferences(
    input.beats,
    kind,
    resource.id,
  );
  const nodeId = kind === "character" ? characterNodeId(resource.id) : sceneNodeId(resource.id);
  return {
    kind,
    resource,
    referencedBeatIds,
    isSelected: input.selectedResourceId === nodeId,
    isDimmed: Boolean(
      input.selectedResourceId && input.selectedResourceId !== nodeId,
    ),
  };
}

/** 构建全部节点（初始渲染 / 自动布局后使用） */
export function buildInitialNodes(input: CanvasNodeBuildInput): CanvasNode[] {
  const nodes: CanvasNode[] = [];

  input.beats.forEach((beat, index) => {
    const id = beatNodeId(beat.id);
    nodes.push({
      id,
      type: "beat",
      position: input.positions.get(id) ?? { x: 0, y: 0 },
      data: buildBeatNodeData(beat, index, input),
    });
  });

  input.characters.forEach((character) => {
    if (isResourceHidden(input, character.id)) return;
    const id = characterNodeId(character.id);
    nodes.push({
      id,
      type: "character",
      position: input.positions.get(id) ?? { x: 0, y: 200 },
      data: buildResourceNodeData("character", character, input),
    });
  });

  input.scenes.forEach((scene) => {
    if (isResourceHidden(input, scene.id)) return;
    const id = sceneNodeId(scene.id);
    nodes.push({
      id,
      type: "scene",
      position: input.positions.get(id) ?? { x: 0, y: 360 },
      data: buildResourceNodeData("scene", scene, input),
    });
  });

  return nodes;
}

/** 节点 data 是否等价（浅比较 + 数组内容比较）。等价时复用旧节点引用，避免 React Flow 全量重渲染。 */
function sameNodeData(a: BeatNodeData | ResourceNodeData, b: BeatNodeData | ResourceNodeData): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "beat") {
    const ab = a as BeatNodeData;
    const bb = b as BeatNodeData;
    return (
      ab.beat === bb.beat &&
      ab.index === bb.index &&
      ab.isSelected === bb.isSelected &&
      ab.isHighlighted === bb.isHighlighted &&
      ab.isDimmed === bb.isDimmed &&
      ab.characters === bb.characters &&
      ab.scenes === bb.scenes
    );
  }
  const ar = a as ResourceNodeData;
  const br = b as ResourceNodeData;
  if (ar.resource !== br.resource || ar.isSelected !== br.isSelected || ar.isDimmed !== br.isDimmed) {
    return false;
  }
  if (ar.referencedBeatIds.length !== br.referencedBeatIds.length) return false;
  return ar.referencedBeatIds.every((id, i) => id === br.referencedBeatIds[i]);
}

/** 构建节点；若与既有节点 data 等价则复用旧引用（保留位置 + 避免重渲染） */
function pushNode(
  result: CanvasNode[],
  prev: CanvasNode | undefined,
  next: CanvasNode,
): void {
  if (prev && sameNodeData(prev.data, next.data)) {
    result.push(prev);
  } else {
    result.push(next);
  }
}

/**
 * 调和节点：保留用户拖拽后的位置（existing.position），
 * 为新增 beat/资源补齐节点，移除已删除 beat 的节点，并刷新 data。
 */
export function reconcileNodes(
  existing: CanvasNode[],
  input: CanvasNodeBuildInput,
): CanvasNode[] {
  const byId = new Map(existing.map((node) => [node.id, node]));
  const result: CanvasNode[] = [];

  input.beats.forEach((beat, index) => {
    const id = beatNodeId(beat.id);
    const prev = byId.get(id);
    pushNode(result, prev, {
      id,
      type: "beat",
      position: prev?.position ?? input.positions.get(id) ?? { x: 0, y: 0 },
      data: buildBeatNodeData(beat, index, input),
    });
  });

  input.characters.forEach((character) => {
    if (isResourceHidden(input, character.id)) return;
    const id = characterNodeId(character.id);
    const prev = byId.get(id);
    pushNode(result, prev, {
      id,
      type: "character",
      position: prev?.position ?? input.positions.get(id) ?? { x: 0, y: 200 },
      data: buildResourceNodeData("character", character, input),
    });
  });

  input.scenes.forEach((scene) => {
    if (isResourceHidden(input, scene.id)) return;
    const id = sceneNodeId(scene.id);
    const prev = byId.get(id);
    pushNode(result, prev, {
      id,
      type: "scene",
      position: prev?.position ?? input.positions.get(id) ?? { x: 0, y: 360 },
      data: buildResourceNodeData("scene", scene, input),
    });
  });

  return result;
}

/* ────────────────────────────────────────────────────────────────
 * 写操作（连线增删 → 回写 StoryBeat 字段，双向联动的"画布→表单"方向）
 * ──────────────────────────────────────────────────────────────── */

/**
 * 处理画布连线创建：
 * - 资源节点 → 分镜：写回 beat.characterIds / beat.sceneId
 * - 分镜 → 分镜：重排镜头顺序（moveBeatBefore）
 * @returns 若发生了分镜重排，返回新数组；否则 null
 */
export function applyConnection(
  connection: Connection,
  beats: StoryBeat[],
  onUpdateBeat: (id: string, updates: Partial<StoryBeat>) => void,
): StoryBeat[] | null {
  const { source, target } = connection;
  if (!source || !target) return null;

  const sourceBeatId = parseBeatNodeId(source);
  const targetBeatId = parseBeatNodeId(target);
  if (sourceBeatId && targetBeatId) {
    const reordered = moveBeatBefore(beats, sourceBeatId, targetBeatId);
    return reordered;
  }

  const resource = parseResourceNodeId(source);
  const beatId = parseBeatNodeId(target);
  if (!resource || !beatId) return null;

  const beat = beats.find((b) => b.id === beatId);
  if (!beat) return null;

  if (resource.kind === "character") {
    const current = getBeatCharacterIds(beat);
    if (!current.includes(resource.resourceId)) {
      onUpdateBeat(beatId, {
        characterIds: [...current, resource.resourceId],
      });
    }
  } else {
    onUpdateBeat(beatId, { sceneId: resource.resourceId });
  }
  return null;
}

/** 断开绑定连线 → 从 beat 字段移除对应引用 */
export function removeBindingEdges(
  edges: Edge[],
  beats: StoryBeat[],
  onUpdateBeat: (id: string, updates: Partial<StoryBeat>) => void,
): void {
  for (const edge of edges) {
    const data = edge.data as BindingEdgeData | undefined;
    if (!data) continue;
    const beat = beats.find((b) => b.id === data.beatId);
    if (!beat) continue;

    if (data.kind === "character") {
      const next = getBeatCharacterIds(beat).filter(
        (id) => id !== data.resourceId,
      );
      if (next.length !== getBeatCharacterIds(beat).length) {
        onUpdateBeat(data.beatId, { characterIds: next });
      }
    } else if (beat.sceneId === data.resourceId) {
      onUpdateBeat(data.beatId, { sceneId: undefined });
    }
  }
}

/**
 * 将 draggedBeat 移动到 targetBeat 之前（镜头重排）。
 * @returns 重排后的 beats（order/sequence 已刷新），无需重排时返回 null
 */
export function moveBeatBefore(
  beats: StoryBeat[],
  draggedBeatId: string,
  targetBeatId: string,
): StoryBeat[] | null {
  if (draggedBeatId === targetBeatId) return null;
  const from = beats.findIndex((b) => b.id === draggedBeatId);
  const to = beats.findIndex((b) => b.id === targetBeatId);
  if (from < 0 || to < 0 || from === to) return null;

  const next = [...beats];
  const [moved] = next.splice(from, 1);
  const toIndex = next.findIndex((b) => b.id === targetBeatId);
  next.splice(toIndex, 0, moved!);
  return next.map((b, index) => ({ ...b, order: index, sequence: index }));
}
