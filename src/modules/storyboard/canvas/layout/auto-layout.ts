import type { XYPosition } from "@xyflow/react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { getBeatCharacterIds } from "@/domain/utils";

/**
 * 分镜画布自动布局（纯函数）。
 *
 * 布局策略：分镜节点水平排成一行（镜头顺序），角色节点在下方一行、场景节点再下一行，
 * 资源节点尽量靠近第一个引用它的分镜，减少连线交叉。
 */

export const BEAT_NODE_WIDTH = 232;
export const BEAT_NODE_GAP_X = 48;
export const RESOURCE_ROW_GAP_Y = 148;
export const RESOURCE_ROW_GAP_2_Y = 296;

export const beatNodeId = (beatId: string) => `beat-${beatId}`;
export const characterNodeId = (characterId: string) => `character-${characterId}`;
export const sceneNodeId = (sceneId: string) => `scene-${sceneId}`;

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
      y: 0,
    });
  });

  characters.forEach((character) => {
    const firstIndex = beats.findIndex((b) =>
      getBeatCharacterIds(b).includes(character.id),
    );
    positions.set(characterNodeId(character.id), {
      x: Math.max(firstIndex, 0) * (BEAT_NODE_WIDTH + BEAT_NODE_GAP_X),
      y: RESOURCE_ROW_GAP_Y,
    });
  });

  scenes.forEach((scene) => {
    const firstIndex = beats.findIndex((b) => b.sceneId === scene.id);
    positions.set(sceneNodeId(scene.id), {
      x: Math.max(firstIndex, 0) * (BEAT_NODE_WIDTH + BEAT_NODE_GAP_X),
      y: RESOURCE_ROW_GAP_2_Y,
    });
  });

  return positions;
}
