import { describe, it, expect } from "vitest";
import {
  planVisualContinuity,
  type ContinuityBeatInput,
} from "../visual-continuity-planner";

function beat(id: string, overrides: Partial<ContinuityBeatInput> = {}): ContinuityBeatInput {
  return { id, ...overrides };
}

describe("planVisualContinuity", () => {
  it("同一场景首镜头默认左侧，后续镜头延续", () => {
    const plans = planVisualContinuity([
      beat("a", { sceneId: "s1", content: "主角走进房间" }),
      beat("b", { sceneId: "s1", content: "主角看向窗外" }),
      beat("c", { sceneId: "s1", content: "主角转身" }),
    ]);
    expect(plans[0]!.subjectScreenSide).toBe("left");
    expect(plans[1]!.subjectScreenSide).toBe("left");
    expect(plans[2]!.subjectScreenSide).toBe("left");
  });

  it("内容声明右侧时轴线以右侧为起点", () => {
    const plans = planVisualContinuity([
      beat("a", { sceneId: "s1", content: "主角从右侧走进房间" }),
      beat("b", { sceneId: "s1", content: "主角坐下" }),
    ]);
    expect(plans[0]!.subjectScreenSide).toBe("right");
    expect(plans[1]!.subjectScreenSide).toBe("right");
  });

  it("场景切换时重置轴线", () => {
    const plans = planVisualContinuity([
      beat("a", { sceneId: "s1", content: "主角在森林中" }),
      beat("b", { sceneId: "s1", content: "主角奔跑" }),
      beat("c", { sceneId: "s2", content: "主角进入城堡" }),
      beat("d", { sceneId: "s2", content: "主角环顾" }),
    ]);
    // s1 段默认 left；s2 段重置后也默认 left（断言 s2 段独立于 s1 的声明）
    expect(plans[0]!.subjectScreenSide).toBe("left");
    expect(plans[1]!.subjectScreenSide).toBe("left");
    expect(plans[2]!.subjectScreenSide).toBe("left");
    expect(plans[3]!.subjectScreenSide).toBe("left");
  });

  it("场景切换后内容声明的新轴线不影响上一段", () => {
    const plans = planVisualContinuity([
      beat("a", { sceneId: "s1", content: "主角在森林" }),
      beat("b", { sceneId: "s1", content: "主角向右奔跑" }),
      beat("c", { sceneId: "s2", content: "主角在城堡左侧" }),
    ]);
    expect(plans[0]!.subjectScreenSide).toBe("left");
    expect(plans[1]!.subjectScreenSide).toBe("right");
    expect(plans[2]!.subjectScreenSide).toBe("left");
  });

  it("动作方向：向右 → left_to_right，向左 → right_to_left", () => {
    const plans = planVisualContinuity([
      beat("a", { sceneId: "s1", content: "主角向右跑去" }),
      beat("b", { sceneId: "s1", content: "主角继续追赶" }),
      beat("c", { sceneId: "s1", content: "主角向左转身" }),
    ]);
    expect(plans[0]!.actionDirection).toBe("left_to_right");
    // 无声明时延续上一镜头方向
    expect(plans[1]!.actionDirection).toBe("left_to_right");
    expect(plans[2]!.actionDirection).toBe("right_to_left");
  });

  it("无方向信息时不输出 actionDirection", () => {
    const plans = planVisualContinuity([
      beat("a", { sceneId: "s1", content: "主角站在原地" }),
      beat("b", { sceneId: "s1", content: "两人对视" }),
    ]);
    expect(plans[0]!.actionDirection).toBeUndefined();
    expect(plans[1]!.actionDirection).toBeUndefined();
  });

  it("场景切换重置动作方向", () => {
    const plans = planVisualContinuity([
      beat("a", { sceneId: "s1", content: "主角向右跑" }),
      beat("b", { sceneId: "s2", content: "主角走进新场景" }),
    ]);
    expect(plans[0]!.actionDirection).toBe("left_to_right");
    expect(plans[1]!.actionDirection).toBeUndefined();
  });

  it("空输入返回空数组", () => {
    expect(planVisualContinuity([])).toEqual([]);
  });
});
