import { describe, it, expect } from "vitest";
import type { StoryBeat } from "@/domain/schemas";
import { toDirectorShot, buildDirectorGuidanceSection } from "../director-guidance";

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 0,
    description: "主角走进房间",
    content: "主角走进房间",
    duration: 5,
    type: "action",
    characterIds: [],
    elementIds: [],
    enhancedGeneration: false,
    ...overrides,
  };
}

describe("toDirectorShot", () => {
  it("无 shotInstruction 时返回 null", () => {
    expect(toDirectorShot(makeBeat())).toBeNull();
  });

  it("映射 shotSize / cameraMovement / duration / blocking", () => {
    const shot = toDirectorShot(
      makeBeat({
        shotInstruction: { shotSize: "close", cameraMovement: "push", cameraAngle: "eye_level" },
      }),
    );
    expect(shot).not.toBeNull();
    expect(shot).toMatchObject({
      shotSize: "close_up",
      movement: "tracking",
      duration: 5,
      blocking: "主角走进房间",
    });
  });

  it("未知的景别/运镜枚举回退到默认值", () => {
    const shot = toDirectorShot(
      makeBeat({
        shotInstruction: { shotSize: "wide", cameraMovement: "static", cameraAngle: "low" },
      }),
    );
    expect(shot).toMatchObject({ shotSize: "wide", movement: "static" });
  });
});

describe("buildDirectorGuidanceSection", () => {
  const beatWithShot = makeBeat({
    shotInstruction: { shotSize: "medium", cameraMovement: "static", cameraAngle: "eye_level" },
  });

  it("无 shotInstruction 时返回空字符串", () => {
    expect(buildDirectorGuidanceSection(makeBeat())).toBe("");
  });

  it("默认上下文 + 普通镜头（无规则命中）时返回空字符串", () => {
    // rising_action / 0.5 / normal：无高潮、无抒情、无快速节奏、无连续性
    expect(buildDirectorGuidanceSection(beatWithShot)).toBe("");
  });

  it("climax 上下文输出高潮强化指导与镜头参数建议", () => {
    const section = buildDirectorGuidanceSection(beatWithShot, {
      context: { beatType: "climax", emotionIntensity: 0.8 },
    });
    expect(section).toContain("高潮/高情绪段落");
    expect(section).toContain("压缩至 4 秒以内");
    // 0.8 ≤ 0.85：static → tracking，时长 5 → 4，景别 medium → close_up
    expect(section).toContain("景别：特写");
    expect(section).toContain("运镜：跟随");
    expect(section).toContain("时长：4 秒");
  });

  it("高情绪（>0.85）强化为手持运镜", () => {
    const section = buildDirectorGuidanceSection(beatWithShot, {
      context: { beatType: "climax", emotionIntensity: 0.95 },
    });
    expect(section).toContain("运镜：手持");
  });

  it("低情绪输出抒情远景指导", () => {
    const closeUpBeat = makeBeat({
      shotInstruction: { shotSize: "close", cameraMovement: "static", cameraAngle: "eye_level" },
    });
    const section = buildDirectorGuidanceSection(closeUpBeat, {
      context: { beatType: "falling_action", emotionIntensity: 0.2, pacing: "slow" },
    });
    expect(section).toContain("抒情氛围");
    expect(section).toContain("延长镜头时长");
    // lyrical_wide：close_up → extreme_wide、static、时长 5 → 5（max(5, 5)）
    expect(section).toContain("景别：大远景");
  });

  it("fast pacing + 高情绪输出快速节奏指导", () => {
    const section = buildDirectorGuidanceSection(beatWithShot, {
      context: { beatType: "rising_action", emotionIntensity: 0.7, pacing: "fast" },
    });
    expect(section).toContain("整体节奏快速");
    // fast_pacing：5 * 0.85 = 4.25 → round 4
    expect(section).toContain("时长：4 秒");
  });

  it("不修改传入的 beat（无副作用）", () => {
    const original = { ...beatWithShot, shotInstruction: { ...beatWithShot.shotInstruction! } };
    buildDirectorGuidanceSection(beatWithShot, {
      context: { beatType: "climax", emotionIntensity: 0.9 },
    });
    expect(beatWithShot).toEqual(original);
  });

  it("前后镜头参与上下文但不改变当前镜头输出结构", () => {
    const prev = makeBeat({
      id: "beat-0",
      shotInstruction: { shotSize: "medium", cameraMovement: "static", cameraAngle: "eye_level" },
    });
    const next = makeBeat({
      id: "beat-2",
      shotInstruction: { shotSize: "medium", cameraMovement: "tracking", cameraAngle: "eye_level" },
    });
    const section = buildDirectorGuidanceSection(beatWithShot, { prevBeat: prev, nextBeat: next });
    // prev/next 无 subjectScreenSide/actionDirection，连续性规则不触发；无上下文时不输出
    expect(section).toBe("");
  });
});
