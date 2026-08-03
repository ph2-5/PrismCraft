import type { Connection, Edge, XYPosition } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import type { BlockoutScene } from "@/domain/schemas/blockout-scene";
import { getBeatCharacterIds } from "@/domain/utils";
import {
  beatNodeId,
  blockoutNodeId,
  BLOCKOUT_ROW_Y,
  characterNodeId,
  sceneNodeId,
  parseBeatNodeId,
  parseResourceNodeId,
} from "../layout/auto-layout";
import type {
  BeatNodeData,
  BindingEdgeData,
  BlockoutNodeData,
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  ResourceKind,
  ResourceNodeData,
} from "../types";

/** 首尾帧衔接专用手柄：BeatNode 的"尾帧"source handle 与"首帧"target handle id */
export const FRAME_SOURCE_HANDLE = "frame-source";
export const FRAME_TARGET_HANDLE = "frame-target";

/* ────────────────────────────────────────────────────────────────
 * 连线派生（视图层，单一事实源 = StoryBeat 字段）
 * ──────────────────────────────────────────────────────────────── */

/**
 * 从 beats 派生全部画布连线：
 * - 序列连线：beat i → beat i+1（镜头顺序）
 * - 角色绑定：character → beat（characterIds）
 * - 场景绑定：scene → beat（sceneId）
 * - 帧衔接：next.keyframe.referencedPrevKeyframe === beat.id 时，
 *   beat 尾帧手柄 → next 首帧手柄（独立虚线，可断开）
 */
export function deriveEdges(beats: StoryBeat[]): CanvasEdge[] {
  const edges: CanvasEdge[] = [];

  beats.forEach((beat, index) => {
    const next = beats[index + 1];
    if (!next) return;

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
        color: "var(--border)",
      },
      style: { stroke: "var(--border)", strokeWidth: 1.5 },
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

  // 帧衔接连线：keyframe 链引用
  beats.forEach((beat, index) => {
    if (index === 0) return;
    const prev = beats[index - 1];
    if (!prev || beat.keyframe?.referencedPrevKeyframe !== prev.id) return;
    edges.push({
      id: `frame-${prev.id}-${beat.id}`,
      source: beatNodeId(prev.id),
      sourceHandle: FRAME_SOURCE_HANDLE,
      target: beatNodeId(beat.id),
      targetHandle: FRAME_TARGET_HANDLE,
      type: "smoothstep",
      data: { kind: "frame", resourceId: prev.id, beatId: beat.id },
      style: {
        stroke: "var(--warning)",
        strokeWidth: 1.5,
        strokeDasharray: "6 4",
      },
    });
  });

  // 3D 导演台参考边：beat → blockout 节点（虚线，不可断开）
  beats.forEach((beat) => {
    if (!beat.blockout3D) return;
    edges.push({
      id: `b3d-${beat.id}`,
      source: beatNodeId(beat.id),
      target: blockoutNodeId(beat.id),
      type: "smoothstep",
      deletable: false,
      selectable: false,
      focusable: false,
      style: { stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "4 4" },
    });
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

/** 某资源是否已被至少一个分镜引用（绑定） */
export function isResourceBound(
  beats: StoryBeat[],
  kind: ResourceKind,
  resourceId: string,
): boolean {
  return resolveResourceReferences(beats, kind, resourceId).length > 0;
}

/**
 * 计算所有未绑定任何分镜的角色/场景 id。
 * 策略依据：默认画布只显示已绑定资源，未绑定资源通过"添加角色/场景"面板按需加入。
 */
export function computeUnboundResourceIds(
  beats: StoryBeat[],
  characters: Character[],
  scenes: Scene[],
): string[] {
  return [
    ...characters
      .filter((c) => !isResourceBound(beats, "character", c.id))
      .map((c) => c.id),
    ...scenes
      .filter((s) => !isResourceBound(beats, "scene", s.id))
      .map((s) => s.id),
  ];
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

function buildBlockoutNodeData(
  beat: StoryBeat,
  input: CanvasNodeBuildInput,
): BlockoutNodeData {
  return {
    kind: "blockout",
    beatId: beat.id,
    title: beat.title || "",
    scene: beat.blockout3D as BlockoutScene,
    isSelected: input.selectedBeatId === beat.id,
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
      deletable: false,
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
      deletable: false,
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
      deletable: false,
      data: buildResourceNodeData("scene", scene, input),
    });
  });

  input.beats.forEach((beat) => {
    if (!beat.blockout3D) return;
    const id = blockoutNodeId(beat.id);
    nodes.push({
      id,
      type: "blockout",
      position: input.positions.get(id) ?? { x: 0, y: BLOCKOUT_ROW_Y },
      deletable: false,
      data: buildBlockoutNodeData(beat, input),
    });
  });

  return nodes;
}

/** 节点 data 是否等价（浅比较 + 数组内容比较）。等价时复用旧节点引用，避免 React Flow 全量重渲染。 */
function sameNodeData(a: CanvasNodeData, b: CanvasNodeData): boolean {
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
  if (a.kind === "blockout") {
    const ab = a as BlockoutNodeData;
    const bb = b as BlockoutNodeData;
    return (
      ab.beatId === bb.beatId &&
      ab.title === bb.title &&
      ab.scene === bb.scene &&
      ab.isSelected === bb.isSelected
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
      deletable: false,
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
      deletable: false,
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
      deletable: false,
      data: buildResourceNodeData("scene", scene, input),
    });
  });

  input.beats.forEach((beat) => {
    if (!beat.blockout3D) return;
    const id = blockoutNodeId(beat.id);
    const prev = byId.get(id);
    pushNode(result, prev, {
      id,
      type: "blockout",
      position: prev?.position ?? input.positions.get(id) ?? { x: 0, y: BLOCKOUT_ROW_Y },
      deletable: false,
      data: buildBlockoutNodeData(beat, input),
    });
  });

  return result;
}

/* ────────────────────────────────────────────────────────────────
 * 写操作（连线增删 → 回写 StoryBeat 字段，双向联动的"画布→表单"方向）
 * ──────────────────────────────────────────────────────────────── */

/**
 * 处理画布连线创建：
 * - 帧衔接（尾帧手柄 → 首帧手柄）：写入 next.keyframe.referencedPrevKeyframe
 * - 资源节点 → 分镜：写回 beat.characterIds / beat.sceneId
 * - 分镜 → 分镜（普通手柄）：重排镜头顺序（moveBeatBefore）
 * @returns 若发生了分镜重排，返回新数组；否则 null
 */
export function applyConnection(
  connection: Connection,
  beats: StoryBeat[],
  onUpdateBeat: (id: string, updates: Partial<StoryBeat>) => void,
): StoryBeat[] | null {
  const { source, target, sourceHandle, targetHandle } = connection;
  if (!source || !target) return null;

  // 帧衔接：A 尾帧手柄 → B 首帧手柄
  if (sourceHandle === FRAME_SOURCE_HANDLE && targetHandle === FRAME_TARGET_HANDLE) {
    const sourceBeatId = parseBeatNodeId(source);
    const targetBeatId = parseBeatNodeId(target);
    if (sourceBeatId && targetBeatId && sourceBeatId !== targetBeatId) {
      const targetBeat = beats.find((b) => b.id === targetBeatId);
      if (targetBeat) {
        onUpdateBeat(targetBeatId, {
          keyframe: {
            ...targetBeat.keyframe,
            imageUrl: targetBeat.keyframe?.imageUrl,
            prompt: targetBeat.keyframe?.prompt,
            generatedAt: targetBeat.keyframe?.generatedAt,
            source: targetBeat.keyframe?.source,
            referencedPrevKeyframe: sourceBeatId,
          },
        });
      }
    }
    return null;
  }

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

/** 断开绑定连线 → 从 beat 字段移除对应引用（角色/场景/帧衔接） */
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
    } else if (data.kind === "scene") {
      if (beat.sceneId === data.resourceId) {
        onUpdateBeat(data.beatId, { sceneId: undefined });
      }
    } else if (data.kind === "frame") {
      if (beat.keyframe?.referencedPrevKeyframe === data.resourceId) {
        onUpdateBeat(data.beatId, {
          keyframe: {
            ...beat.keyframe,
            imageUrl: beat.keyframe?.imageUrl,
            prompt: beat.keyframe?.prompt,
            generatedAt: beat.keyframe?.generatedAt,
            source: beat.keyframe?.source,
            referencedPrevKeyframe: undefined,
          },
        });
      }
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
