/**
 * beat-mapping.ts — novel 管线产物（ShotBreakdown）→ StoryBeat 的映射
 *
 * 方案 A（2026-08-08）：画布为分镜真相源。管线分镜阶段提供「在画布中编辑」入口，
 * 无 storyId 时先据此函数构建初始 beats 创建草稿 Story；finalize 新建时复用同一映射。
 * 仅一处实现，避免 finalize / 画布入口两处维护不一致。
 */
import type { StoryBeat } from "@/domain/schemas";
import type { ShotBreakdown, ExtractedCharacter } from "./types";

/**
 * 将管线分镜列表映射为 StoryBeat[]（Q2-1 保留原文回溯字段）。
 * @param shots 管线分镜（由 breakdownShotsForSegments 生成）
 * @param characters 管线角色（用于 name → matchedCharacterId）
 */
export function buildBeatsFromShots(
  shots: ShotBreakdown[],
  characters: ExtractedCharacter[],
): StoryBeat[] {
  return shots.map((shot, index) => {
    const beatCharacterIds = shot.characters
      .map((name) => characters.find((c) => c.name === name)?.matchedCharacterId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    return {
      id: `beat_${crypto.randomUUID()}`,
      sequence: index + 1,
      description: shot.description,
      duration: shot.estimatedDuration,
      characterIds: beatCharacterIds,
      sceneId: shot.sceneId,
      elementIds: [],
      // Q2-1: 原文回溯字段
      sourceText: shot.sourceText,
      sourceSegmentId: shot.sourceSegmentId,
      sourceStartChar: shot.sourceStartChar,
      sourceEndChar: shot.sourceEndChar,
      chapterIndex: shot.chapterIndex,
      chapterTitle: shot.chapterTitle,
    } as StoryBeat;
  });
}
