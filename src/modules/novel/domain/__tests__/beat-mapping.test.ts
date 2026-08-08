/**
 * beat-mapping.test.ts — buildBeatsFromShots 映射单测（方案 A 共享映射）
 */
import { describe, it, expect } from "vitest";
import { buildBeatsFromShots } from "../beat-mapping";
import type { ShotBreakdown, ExtractedCharacter } from "../types";

function makeShot(overrides: Partial<ShotBreakdown> = {}): ShotBreakdown {
  return {
    id: "shot-1",
    description: "主角走进房间",
    shotType: "medium",
    cameraAngle: "eye",
    cameraMovement: "static",
    action: "走进",
    characters: ["角色A"],
    sceneId: "scene-1",
    estimatedDuration: 5,
    status: "edited",
    sourceText: "他走进房间。",
    sourceSegmentId: "seg-1",
    sourceStartChar: 0,
    sourceEndChar: 6,
    chapterIndex: 0,
    chapterTitle: "第一章",
    prompt: "",
    ...overrides,
  } as ShotBreakdown;
}

function makeCharacter(overrides: Partial<ExtractedCharacter> = {}): ExtractedCharacter {
  return {
    id: "char-1",
    name: "角色A",
    role: "主角",
    confirmed: true,
    matchedCharacterId: "db-char-1",
    ...overrides,
  } as ExtractedCharacter;
}

describe("buildBeatsFromShots", () => {
  it("每个 shot 映射为 sequence 递增的 StoryBeat（描述/时长/场景）", () => {
    const beats = buildBeatsFromShots(
      [makeShot({ id: "a" }), makeShot({ id: "b", description: "离开" })],
      [makeCharacter()],
    );
    expect(beats).toHaveLength(2);
    expect(beats[0]!.sequence).toBe(1);
    expect(beats[1]!.sequence).toBe(2);
    expect(beats[0]!.description).toBe("主角走进房间");
    expect(beats[0]!.sceneId).toBe("scene-1");
    expect(beats[0]!.duration).toBe(5);
  });

  it("角色名映射到 matchedCharacterId（未匹配角色忽略）", () => {
    const beats = buildBeatsFromShots(
      [makeShot({ characters: ["角色A", "不存在角色"] })],
      [makeCharacter()],
    );
    expect(beats[0]!.characterIds).toEqual(["db-char-1"]);
  });

  it("Q2-1 原文回溯字段原样携带", () => {
    const beats = buildBeatsFromShots([makeShot()], [makeCharacter()]);
    expect(beats[0]!.sourceText).toBe("他走进房间。");
    expect(beats[0]!.sourceSegmentId).toBe("seg-1");
    expect(beats[0]!.chapterTitle).toBe("第一章");
    expect(beats[0]!.chapterIndex).toBe(0);
  });

  it("空 shots 返回空数组", () => {
    expect(buildBeatsFromShots([], [])).toEqual([]);
  });
});
