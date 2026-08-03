import { describe, it, expect, vi } from "vitest";

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  extractErrorMessage: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

vi.mock("@/shared/constants", () => ({
  t: (key: string) => key,
}));

vi.mock("@/infrastructure/di", () => ({
  container: {},
}));

vi.mock("@/shared/model-capabilities", () => ({
  getModelCapabilities: () => ({ promptLanguage: "zh" }),
}));

import { applyVisualContinuityPlanning } from "../story-generation-pipeline-parts";
import type { StoryBeat } from "@/domain/schemas";

function makeBeat(id: string, overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id,
    sequence: 0,
    description: "",
    characterIds: [],
    elementIds: [],
    ...overrides,
  };
}

describe("applyVisualContinuityPlanning", () => {
  it("为相邻 beat 写入屏幕侧与动作方向", () => {
    const beats: StoryBeat[] = [
      makeBeat("a", {
        sceneId: "s1",
        content: "主角向右奔跑穿过广场",
        shotInstruction: { shotSize: "wide", cameraAngle: "eye_level", cameraMovement: "tracking" },
      }),
      makeBeat("b", {
        sceneId: "s1",
        content: "主角继续奔跑",
        shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "tracking" },
      }),
    ];
    applyVisualContinuityPlanning(beats);
    // "向右" → 角色位置右侧 + 动作方向从左到右
    expect(beats[0]!.shotInstruction).toMatchObject({
      subjectScreenSide: "right",
      actionDirection: "left_to_right",
    });
    // 无声明时延续
    expect(beats[1]!.shotInstruction).toMatchObject({
      subjectScreenSide: "right",
      actionDirection: "left_to_right",
    });
  });

  it("无 shotInstruction 的 beat 不回写", () => {
    const beats: StoryBeat[] = [
      makeBeat("a", { sceneId: "s1", content: "主角向右走", shotInstruction: undefined }),
      makeBeat("b", {
        sceneId: "s1",
        content: "主角停下",
        shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
      }),
    ];
    applyVisualContinuityPlanning(beats);
    expect(beats[0]!.shotInstruction).toBeUndefined();
    expect(beats[1]!.shotInstruction!.subjectScreenSide).toBe("right");
  });

  it("场景切换时重置轴线", () => {
    const beats: StoryBeat[] = [
      makeBeat("a", {
        sceneId: "s1",
        content: "主角在森林右侧",
        shotInstruction: { shotSize: "wide", cameraAngle: "eye_level", cameraMovement: "static" },
      }),
      makeBeat("b", {
        sceneId: "s2",
        content: "主角进入城堡",
        shotInstruction: { shotSize: "wide", cameraAngle: "eye_level", cameraMovement: "static" },
      }),
    ];
    applyVisualContinuityPlanning(beats);
    expect(beats[0]!.shotInstruction!.subjectScreenSide).toBe("right");
    // 新场景重置后默认 left
    expect(beats[1]!.shotInstruction!.subjectScreenSide).toBe("left");
  });

  it("少于两个 beat 时跳过", () => {
    const beats: StoryBeat[] = [
      makeBeat("a", {
        content: "孤立的镜头",
        shotInstruction: { shotSize: "medium", cameraAngle: "eye_level", cameraMovement: "static" },
      }),
    ];
    applyVisualContinuityPlanning(beats);
    expect(beats[0]!.shotInstruction!.subjectScreenSide).toBeUndefined();
  });
});
