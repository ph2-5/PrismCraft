import type { XYPosition } from "@xyflow/react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { getBeatCharacterIds } from "@/domain/utils";

/**
 * 分镜画布自动布局（纯函数）。
 *
 * 策略：
 * - 分镜节点水平排成一行（镜头顺序），y=0
 * - 角色一行、场景一行，每个资源锚定到第一个引用它的分镜列；
 *   同一列最多纵向堆叠 MAX_RESOURCE_STACK 个（超出后向右延伸），避免大量资源堆叠重叠
 * - 未绑定任何分镜的资源锚定到"最后一个分镜之后"（beats.length 列）
 */

export const BEAT_NODE_WIDTH = 232;
export const BEAT_NODE_GAP_X = 48;
export const BEAT_ROW_Y = 0;

export const RESOURCE_NODE_WIDTH = 190;
export const RESOURCE_NODE_HEIGHT = 72;
export const RESOURCE_GAP_X = 24;
export const RESOURCE_GAP_Y = 16;
/** 每个锚点列最多纵向堆叠的资源数，超出后向右延伸 */
export const MAX_RESOURCE_STACK = 2;
/** 资源行 y（须避开分镜节点高度） */
export const CHARACTER_ROW_Y = 224;
export const SCENE_ROW_Y = 416;
/** 3D 导演台节点行 y（位于资源行下方） */
export const BLOCKOUT_ROW_Y = 608;

export const beatNodeId = (beatId: string) => `beat-${beatId}`;
export const characterNodeId = (characterId: string) => `character-${characterId}`;
export const sceneNodeId = (sceneId: string) => `scene-${sceneId}`;
export const blockoutNodeId = (beatId: string) => `blockout-${beatId}`;

/** 解析资源节点 id → 资源类型与 id；非资源节点返回 null */
export function parseResourceNodeId(
  id: string,
): { kind: "character" | "scene"; resourceId: string } | null {
  if (id.startsWith("character-")) {
    return { kind: "character", resourceId: id.slice("character-".length) };
  }
  if (id.startsWith("scene-")) {
    return { kind: "scene", resourceId: id.slice("scene-".length) };
  }
  return null;
}

/** 解析分镜节点 id → beat id；非分镜节点返回 null */
export function parseBeatNodeId(id: string): string | null {
  if (id.startsWith("beat-")) return id.slice("beat-".length);
  return null;
}

/** 资源锚点列：第一个引用它的分镜序号；未绑定 → 最后一个分镜之后 */
function anchorColumn(beats: StoryBeat[], predicate: (beat: StoryBeat) => boolean): number {
  const index = beats.findIndex(predicate);
  return index < 0 ? beats.length : index;
}

/**
 * 布局一行资源：按锚点列排序，同一列最多堆叠 MAX_RESOURCE_STACK 个，
 * 超出后向右寻找空列，保证节点永不重叠。
 */
function layoutResourceRow(
  entries: { id: string; anchor: number }[],
  rowY: number,
): Map<string, XYPosition> {
  const positions = new Map<string, XYPosition>();
  const columnCount = new Map<number, number>();
  const sorted = [...entries].sort(
    (a, b) => a.anchor - b.anchor || a.id.localeCompare(b.id),
  );

  for (const entry of sorted) {
    let col = Math.max(entry.anchor, 0);
    while ((columnCount.get(col) ?? 0) >= MAX_RESOURCE_STACK) {
      col += 1;
    }
    const row = columnCount.get(col) ?? 0;
    columnCount.set(col, row + 1);
    positions.set(entry.id, {
      x: col * (RESOURCE_NODE_WIDTH + RESOURCE_GAP_X),
      y: rowY + row * (RESOURCE_NODE_HEIGHT + RESOURCE_GAP_Y),
    });
  }
  return positions;
}

/**
 * 计算全部节点（分镜 + 角色 + 场景）的初始位置。
 * @returns nodeId → position 的映射
 */
export function computeAutoLayout(
  beats: StoryBeat[],
  characters: Character[],
  scenes: Scene[],
): Map<string, XYPosition> {
  const positions = new Map<string, XYPosition>();

  beats.forEach((beat, index) => {
    positions.set(beatNodeId(beat.id), {
      x: index * (BEAT_NODE_WIDTH + BEAT_NODE_GAP_X),
      y: BEAT_ROW_Y,
    });
  });

  const characterEntries = characters.map((character) => ({
    id: characterNodeId(character.id),
    anchor: anchorColumn(beats, (beat) =>
      getBeatCharacterIds(beat).includes(character.id),
    ),
  }));
  for (const [id, position] of layoutResourceRow(characterEntries, CHARACTER_ROW_Y)) {
    positions.set(id, position);
  }

  const sceneEntries = scenes.map((scene) => ({
    id: sceneNodeId(scene.id),
    anchor: anchorColumn(beats, (beat) => beat.sceneId === scene.id),
  }));
  for (const [id, position] of layoutResourceRow(sceneEntries, SCENE_ROW_Y)) {
    positions.set(id, position);
  }

  // 3D 导演台节点：每 beat 至多一个，锚定到对应分镜列
  beats.forEach((beat, index) => {
    if (!beat.blockout3D) return;
    positions.set(blockoutNodeId(beat.id), {
      x: index * (BEAT_NODE_WIDTH + BEAT_NODE_GAP_X),
      y: BLOCKOUT_ROW_Y,
    });
  });

  return positions;
}
