/**
 * beat-mapping.ts — novel 管线产物（ShotBreakdown）→ StoryBeat 的映射
 *
 * 方案 A（2026-08-08）：画布为分镜真相源。管线分镜阶段提供「在画布中编辑」入口，
 * 无 storyId 时先据此函数构建初始 beats 创建草稿 Story；finalize 新建时复用同一映射。
 * 仅一处实现，避免 finalize / 画布入口两处维护不一致。
 */
import type { StoryBeat } from "@/domain/schemas";
import type { ShotBreakdown, ExtractedCharacter, Segment } from "./types";

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

/** 按 chapterIndex/chapterTitle 将 beats 聚合为管线段落（已有故事回填用） */
export function buildSegmentsFromBeats(beats: StoryBeat[]): Segment[] {
  const byChapter = new Map<string, { idx: number; title: string; beats: StoryBeat[] }>();
  for (const b of beats) {
    const idx = b.chapterIndex ?? 0;
    const title = b.chapterTitle ?? `第 ${idx + 1} 章`;
    const key = `${idx}:${title}`;
    if (!byChapter.has(key)) byChapter.set(key, { idx, title, beats: [] });
    byChapter.get(key)!.beats.push(b);
  }
  return [...byChapter.values()]
    .sort((a, b) => a.idx - b.idx)
    .map(({ idx, title, beats: chapterBeats }) => ({
      id: `seg_${idx}`,
      title,
      summary: title,
      startChar: 0,
      endChar: 0,
      estimatedDuration: chapterBeats.reduce((sum, b) => sum + (b.duration ?? 5), 0),
      keyEvents: [],
      text: chapterBeats.map((b) => b.description).join("\n"),
    }));
}

/** 将画布 StoryBeat 逆向映射为管线分镜（已有故事回填用；画布未存 shotType 等用默认值） */
export function buildShotsFromBeats(beats: StoryBeat[]): ShotBreakdown[] {
  return beats.map((beat, index) => {
    return {
      id: beat.id,
      sequence: index + 1,
      description: beat.description,
      shotType: "medium",
      cameraAngle: "eye",
      cameraMovement: "static",
      action: "",
      characters: [],
      sceneId: beat.sceneId,
      estimatedDuration: beat.duration ?? 5,
      status: beat.keyframe ? "final" : "edited",
      // Q2-1: 原文回溯字段
      sourceText: beat.sourceText,
      sourceSegmentId: beat.sourceSegmentId,
      sourceStartChar: beat.sourceStartChar,
      sourceEndChar: beat.sourceEndChar,
      chapterIndex: beat.chapterIndex,
      chapterTitle: beat.chapterTitle,
    } as ShotBreakdown;
  });
}
