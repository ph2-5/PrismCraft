import { describe, it, expect } from "vitest";
import {
  applyDirectorRules,
  type DirectorShotContract,
} from "../director-rules";

/**
 * 导演规则引擎测试（P1.1）。
 * 覆盖：高潮强化、抒情远景、180 度规则、动作匹配、快速节奏、skipRules、自定义规则。
 */
function makeShot(overrides: Partial<DirectorShotContract> = {}): DirectorShotContract {
  return {
    shotSize: "medium",
    movement: "static",
    lighting: "natural",
    duration: 5,
    blocking: "",
    ...overrides,
  };
}

describe("applyDirectorRules", () => {
  it("高潮 beat 强化：景别收为 close_up、静态机位改 tracking、时长压缩到 ≤4s", () => {
    const shots = [makeShot()];
    applyDirectorRules(shots, {
      beatType: "climax",
      emotionIntensity: 0.8,
      pacing: "normal",
    });
    expect(shots[0]!.shotSize).toBe("close_up");
    expect(shots[0]!.movement).toBe("tracking");
    expect(shots[0]!.duration).toBeLessThanOrEqual(4);
  });

  it("极高情绪（>0.85）改用 handheld 增强动感", () => {
    const shots = [makeShot()];
    applyDirectorRules(shots, {
      beatType: "climax",
      emotionIntensity: 0.9,
      pacing: "normal",
    });
    expect(shots[0]!.movement).toBe("handheld");
  });

  it("低情绪（<0.3）抒情远景：close_up 收为 extreme_wide、固定机位、时长 ≥5s", () => {
    const shots = [makeShot({ shotSize: "close_up", duration: 3 })];
    applyDirectorRules(shots, {
      beatType: "rising_action",
      emotionIntensity: 0.2,
      pacing: "normal",
    });
    expect(shots[0]!.shotSize).toBe("extreme_wide");
    expect(shots[0]!.movement).toBe("static");
    expect(shots[0]!.duration).toBeGreaterThanOrEqual(5);
  });

  it("180 度规则：延续上一镜头屏幕侧，避免越轴", () => {
    const shots = [
      makeShot({ subjectScreenSide: "left" }),
      makeShot(),
    ];
    applyDirectorRules(shots, {
      beatType: "rising_action",
      emotionIntensity: 0.5,
      pacing: "normal",
    });
    expect(shots[1]!.subjectScreenSide).toBe("left");
  });

  it("动作匹配：相邻动作镜头方向保持一致", () => {
    const shots = [
      makeShot({ actionDirection: "left_to_right" }),
      makeShot(),
    ];
    applyDirectorRules(shots, {
      beatType: "rising_action",
      emotionIntensity: 0.5,
      pacing: "normal",
    });
    expect(shots[1]!.actionDirection).toBe("left_to_right");
  });

  it("快速节奏：时长压缩约 15%、静态改 tracking", () => {
    const shots = [makeShot({ duration: 6 })];
    applyDirectorRules(shots, {
      beatType: "rising_action",
      emotionIntensity: 0.6,
      pacing: "fast",
    });
    expect(shots[0]!.duration).toBe(5); // round(6 * 0.85) = 5
    expect(shots[0]!.movement).toBe("tracking");
  });

  it("skipRules 跳过指定规则", () => {
    const shots = [makeShot()];
    applyDirectorRules(
      shots,
      { beatType: "climax", emotionIntensity: 0.8, pacing: "normal" },
      { skipRules: ["climax_intensify"] },
    );
    expect(shots[0]!.shotSize).toBe("medium"); // 未被高潮规则修改
  });

  it("自定义规则覆盖默认规则", () => {
    const custom = {
      name: "custom",
      description: "",
      condition: () => true,
      action: (shot: DirectorShotContract) => {
        shot.duration = 99;
        return shot;
      },
    };
    const shots = [makeShot()];
    applyDirectorRules(
      shots,
      { beatType: "setup", emotionIntensity: 0.5, pacing: "normal" },
      { rules: [custom] },
    );
    expect(shots[0]!.duration).toBe(99);
  });
});
