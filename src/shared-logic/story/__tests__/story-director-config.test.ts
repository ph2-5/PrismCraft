import { describe, it, expect } from "vitest";
import {
  buildDirectorConfig,
  inferPacing,
  recommendEmotionRules,
  CONTINUITY_RULES,
} from "../story-director-config";
import type { DirectorConfigBeatInput } from "../story-director-config";

function beat(overrides: Partial<DirectorConfigBeatInput> = {}): DirectorConfigBeatInput {
  return {
    type: "rising_action",
    emotionIntensity: 0.5,
    position: 0.5,
    ...overrides,
  };
}

describe("inferPacing", () => {
  it("平均强度 <0.4 → slow", () => {
    expect(inferPacing([beat({ emotionIntensity: 0.3 }), beat({ emotionIntensity: 0.35 })])).toBe("slow");
  });
  it("平均强度 >0.6 → fast", () => {
    expect(inferPacing([beat({ emotionIntensity: 0.7 }), beat({ emotionIntensity: 0.65 })])).toBe("fast");
  });
  it("其他 → normal", () => {
    expect(inferPacing([beat({ emotionIntensity: 0.5 }), beat({ emotionIntensity: 0.55 })])).toBe("normal");
  });
  it("空数组 → normal", () => {
    expect(inferPacing([])).toBe("normal");
  });
});

describe("recommendEmotionRules", () => {
  it("高潮 beat 启用 climax_intensify", () => {
    const rules = recommendEmotionRules(beat({ type: "climax", emotionIntensity: 0.8 }), "normal");
    expect(rules).toContain("climax_intensify");
  });
  it("高情绪强度（>0.75）启用 climax_intensify", () => {
    const rules = recommendEmotionRules(beat({ type: "rising_action", emotionIntensity: 0.9 }), "normal");
    expect(rules).toContain("climax_intensify");
  });
  it("低情绪且非 setup 启用 lyrical_wide", () => {
    const rules = recommendEmotionRules(beat({ type: "falling_action", emotionIntensity: 0.2 }), "normal");
    expect(rules).toContain("lyrical_wide");
  });
  it("setup 低情绪不启用 lyrical_wide", () => {
    const rules = recommendEmotionRules(beat({ type: "setup", emotionIntensity: 0.2 }), "normal");
    expect(rules).not.toContain("lyrical_wide");
  });
  it("fast 节奏 + 情绪 >0.5 启用 fast_pacing", () => {
    const rules = recommendEmotionRules(beat({ emotionIntensity: 0.6 }), "fast");
    expect(rules).toContain("fast_pacing");
  });
  it("normal 节奏不启用 fast_pacing", () => {
    const rules = recommendEmotionRules(beat({ emotionIntensity: 0.6 }), "normal");
    expect(rules).not.toContain("fast_pacing");
  });
});

describe("buildDirectorConfig", () => {
  it("输出包含全局连续性规则与每 beat 的导演上下文", () => {
    const config = buildDirectorConfig([
      beat({ type: "setup", emotionIntensity: 0.2, position: 0.05 }),
      beat({ type: "climax", emotionIntensity: 0.9, position: 0.75 }),
      beat({ type: "resolution", emotionIntensity: 0.3, position: 0.95 }),
    ]);

    expect(config.globalEnabledRules).toEqual([...CONTINUITY_RULES]);
    expect(config.beats).toHaveLength(3);

    const setup = config.beats[0]!;
    expect(setup.context).toMatchObject({ beatType: "setup", emotionIntensity: 0.2 });
    expect(setup.enabledRules).toEqual([]);
    // 未启用的情绪类规则进入 skipRules
    expect(setup.skipRules).toContain("climax_intensify");
    expect(setup.skipRules).toContain("fast_pacing");

    const climax = config.beats[1]!;
    expect(climax.enabledRules).toContain("climax_intensify");
    expect(climax.skipRules).not.toContain("climax_intensify");
  });

  it("保持输入顺序与位置信息", () => {
    const config = buildDirectorConfig([
      beat({ position: 0.2 }),
      beat({ position: 0.8 }),
    ]);
    expect(config.beats.map((b) => b.position)).toEqual([0.2, 0.8]);
  });

  it("空 beats 输出空配置", () => {
    const config = buildDirectorConfig([]);
    expect(config.beats).toEqual([]);
    expect(config.pacing).toBe("normal");
  });
});
