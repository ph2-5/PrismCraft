/**
 * Task 2A.3 — Pipeline 状态机测试
 *
 * 覆盖：
 * - STAGE_ORDER 完整性
 * - VALID_TRANSITIONS 所有合法转换 + 非法转换抛错
 * - canTransition / transition
 * - getAutoGates（auto vs semi）
 * - shouldPauseAtStage（四档 gates）
 * - getStagesForMode（quick/standard/professional 三档）
 * - retryStage（合法重试 + 非法向前重试抛错 + stepData 清空）
 * - getRetryableStages（排除 done）
 */

import { describe, it, expect } from "vitest";
import {
  STAGE_ORDER,
  VALID_TRANSITIONS,
  canTransition,
  transition,
  getAutoGates,
  shouldPauseAtStage,
  getStagesForMode,
  retryStage,
  getRetryableStages,
  FALLBACK_STRATEGIES,
} from "../pipeline-machine";
import type { PipelineState, PipelineConfig, PipelineStage } from "../../../domain/types";

// ============================================================================
// 辅助：构造测试用 PipelineState / PipelineConfig
// ============================================================================

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    mode: "semi",
    aiAssistLevel: "professional",
    projectName: "test-project",
    style: "modern",
    format: "novel",
    aiModel: "test-model",
    autoCreateEntities: false,
    ...overrides,
    // gates 单独覆盖（避免浅合并丢失内层字段）
    gates: {
      confirmSegments: true,
      confirmEntities: true,
      confirmShots: true,
      confirmPrompts: true,
      ...(overrides.gates ?? {}),
    },
  };
}

function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    stage: "project_init",
    step: 1,
    config: makeConfig(),
    rawText: "",
    segments: [],
    currentSegmentIndex: 0,
    characters: [],
    scenes: [],
    characterImportance: {},
    prompts: [],
    generationResults: [],
    ...overrides,
  };
}

// ============================================================================
// 1. STAGE_ORDER
// ============================================================================

describe("STAGE_ORDER", () => {
  it("包含 10 个阶段，顺序正确", () => {
    expect(STAGE_ORDER).toEqual([
      "project_init",
      "content_import",
      "structure_analysis",
      "pacing_planning",
      "character_manage",
      "scene_manage",
      "review",
      "storyboard",
      "generation",
      "done",
    ]);
  });

  it("以 project_init 开头，以 done 结尾", () => {
    expect(STAGE_ORDER[0]).toBe("project_init");
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe("done");
  });

  it("无重复阶段", () => {
    expect(new Set(STAGE_ORDER).size).toBe(STAGE_ORDER.length);
  });
});

// ============================================================================
// 2. VALID_TRANSITIONS
// ============================================================================

describe("VALID_TRANSITIONS", () => {
  it("done 阶段无合法后继（终态）", () => {
    expect(VALID_TRANSITIONS.done).toEqual([]);
  });

  it("project_init 只能转向 content_import", () => {
    expect(VALID_TRANSITIONS.project_init).toEqual(["content_import"]);
  });

  it("content_import 可跳过 structure_analysis（quick/standard 模式）", () => {
    expect(VALID_TRANSITIONS.content_import).toContain("character_manage");
    expect(VALID_TRANSITIONS.content_import).toContain("structure_analysis");
  });

  it("structure_analysis 可跳过 pacing_planning（standard 模式）", () => {
    expect(VALID_TRANSITIONS.structure_analysis).toContain("pacing_planning");
    expect(VALID_TRANSITIONS.structure_analysis).toContain("character_manage");
  });

  it("每个非终态阶段至少有一个合法后继", () => {
    for (const stage of STAGE_ORDER) {
      if (stage === "done") continue;
      expect(VALID_TRANSITIONS[stage].length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// 3. canTransition
// ============================================================================

describe("canTransition", () => {
  it.each([
    ["project_init", "content_import", true],
    ["content_import", "structure_analysis", true],
    ["content_import", "character_manage", true],
    ["structure_analysis", "pacing_planning", true],
    ["structure_analysis", "character_manage", true],
    ["pacing_planning", "character_manage", true],
    ["character_manage", "scene_manage", true],
    ["scene_manage", "review", true],
    ["review", "storyboard", true],
    ["storyboard", "generation", true],
    ["generation", "done", true],
  ] as [PipelineStage, PipelineStage, boolean][])(
    "canTransition(%s, %s) => %s",
    (from, to, expected) => {
      expect(canTransition(from, to)).toBe(expected);
    },
  );

  it.each([
    ["project_init", "character_manage", false],  // 不能跳过 content_import
    ["project_init", "done", false],              // 不能直接跳到终态
    ["content_import", "review", false],          // 不能跨多阶段
    ["character_manage", "generation", false],    // 不能跳过 scene_manage/review/storyboard
    ["generation", "project_init", false],        // 不能回退
    ["done", "project_init", false],              // 终态不能转换
    ["done", "content_import", false],            // 终态不能转换
  ] as [PipelineStage, PipelineStage, boolean][])(
    "canTransition(%s, %s) => false（非法转换）",
    (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    },
  );
});

// ============================================================================
// 4. transition
// ============================================================================

describe("transition", () => {
  it("合法转换：返回新 state，stage 更新，step 重置为 1", () => {
    const state = makeState({ stage: "project_init", step: 5 });
    const next = transition(state, "content_import");
    expect(next.stage).toBe("content_import");
    expect(next.step).toBe(1);
  });

  it("不修改原 state（不可变性）", () => {
    const state = makeState({ stage: "project_init", step: 3 });
    transition(state, "content_import");
    expect(state.stage).toBe("project_init");
    expect(state.step).toBe(3);
  });

  it("保留原 state 的其他字段", () => {
    const state = makeState({
      stage: "content_import",
      rawText: "小说内容",
      segments: [{ index: 0, text: "段落1", title: "段落1" }] as unknown as PipelineState["segments"],
    });
    const next = transition(state, "character_manage");
    expect(next.rawText).toBe("小说内容");
    expect(next.segments).toHaveLength(1);
  });

  it("非法转换：抛出 Error", () => {
    const state = makeState({ stage: "project_init" });
    expect(() => transition(state, "done")).toThrow(/无效状态转换/);
  });

  it("非法转换：错误消息包含 from 和 to", () => {
    const state = makeState({ stage: "project_init" });
    expect(() => transition(state, "done")).toThrow(/project_init.*done/);
  });

  it("从 done 转换：抛出 Error（终态）", () => {
    const state = makeState({ stage: "done" });
    expect(() => transition(state, "project_init")).toThrow(/无效状态转换/);
  });
});

// ============================================================================
// 5. getAutoGates
// ============================================================================

describe("getAutoGates", () => {
  it("auto 模式：confirmSegments 跟随用户配置，其余 gates 关闭", () => {
    const config = makeConfig({
      mode: "auto",
      gates: { confirmSegments: true, confirmEntities: true, confirmShots: false, confirmPrompts: false },
    });
    const gates = getAutoGates(config);
    expect(gates.confirmSegments).toBe(true);  // 跟随用户配置
    expect(gates.confirmEntities).toBe(true);  // 始终开启
    expect(gates.confirmShots).toBe(false);    // auto 模式关闭
    expect(gates.confirmPrompts).toBe(false);  // auto 模式关闭
  });

  it("auto 模式：用户关闭 confirmSegments 时，最终也关闭", () => {
    const config = makeConfig({
      mode: "auto",
      gates: { confirmSegments: false, confirmEntities: true, confirmShots: false, confirmPrompts: false },
    });
    expect(getAutoGates(config).confirmSegments).toBe(false);
  });

  it("semi 模式：所有 gates 默认开启", () => {
    const config = makeConfig({
      mode: "semi",
      gates: { confirmSegments: true, confirmEntities: true, confirmShots: true, confirmPrompts: true },
    });
    const gates = getAutoGates(config);
    expect(gates.confirmSegments).toBe(true);
    expect(gates.confirmEntities).toBe(true);
    expect(gates.confirmShots).toBe(true);
    expect(gates.confirmPrompts).toBe(true);
  });

  it("confirmEntities 始终开启（无论模式）", () => {
    const auto = getAutoGates(makeConfig({ mode: "auto" }));
    const semi = getAutoGates(makeConfig({ mode: "semi" }));
    expect(auto.confirmEntities).toBe(true);
    expect(semi.confirmEntities).toBe(true);
  });
});

// ============================================================================
// 6. shouldPauseAtStage
// ============================================================================

describe("shouldPauseAtStage", () => {
  const allTrue = { confirmSegments: true, confirmEntities: true, confirmShots: true, confirmPrompts: true };
  const allFalse = { confirmSegments: false, confirmEntities: false, confirmShots: false, confirmPrompts: false };

  it("content_import 阶段：跟随 confirmSegments", () => {
    expect(shouldPauseAtStage("content_import", allTrue)).toBe(true);
    expect(shouldPauseAtStage("content_import", allFalse)).toBe(false);
  });

  it("character_manage 阶段：跟随 confirmEntities", () => {
    expect(shouldPauseAtStage("character_manage", allTrue)).toBe(true);
    expect(shouldPauseAtStage("character_manage", allFalse)).toBe(false);
  });

  it("review 阶段：跟随 confirmShots", () => {
    expect(shouldPauseAtStage("review", allTrue)).toBe(true);
    expect(shouldPauseAtStage("review", allFalse)).toBe(false);
  });

  it("storyboard 阶段：跟随 confirmPrompts", () => {
    expect(shouldPauseAtStage("storyboard", allTrue)).toBe(true);
    expect(shouldPauseAtStage("storyboard", allFalse)).toBe(false);
  });

  it.each([
    "project_init",
    "structure_analysis",
    "pacing_planning",
    "scene_manage",
    "generation",
    "done",
  ] as PipelineStage[])(
    "非 gating 阶段 %s 始终不暂停",
    (stage) => {
      expect(shouldPauseAtStage(stage, allTrue)).toBe(false);
      expect(shouldPauseAtStage(stage, allFalse)).toBe(false);
    },
  );
});

// ============================================================================
// 7. getStagesForMode
// ============================================================================

describe("getStagesForMode", () => {
  it("quick 模式：5 阶段（导入 → 角色 → 生成）", () => {
    const stages = getStagesForMode("quick");
    expect(stages).toEqual([
      "project_init",
      "content_import",
      "character_manage",
      "generation",
      "done",
    ]);
  });

  it("standard 模式：8 阶段（跳过 structure_analysis + pacing_planning）", () => {
    const stages = getStagesForMode("standard");
    expect(stages).toEqual([
      "project_init",
      "content_import",
      "character_manage",
      "scene_manage",
      "review",
      "storyboard",
      "generation",
      "done",
    ]);
    expect(stages).not.toContain("structure_analysis");
    expect(stages).not.toContain("pacing_planning");
  });

  it("professional 模式：完整 10 阶段", () => {
    const stages = getStagesForMode("professional");
    expect(stages).toEqual(STAGE_ORDER);
    expect(stages).toHaveLength(10);
  });

  it("三档模式均以 project_init 开头、done 结尾", () => {
    for (const mode of ["quick", "standard", "professional"] as const) {
      const stages = getStagesForMode(mode);
      expect(stages[0]).toBe("project_init");
      expect(stages[stages.length - 1]).toBe("done");
    }
  });

  it("三档模式返回的阶段子集大小：quick < standard < professional", () => {
    const q = getStagesForMode("quick").length;
    const s = getStagesForMode("standard").length;
    const p = getStagesForMode("professional").length;
    expect(q).toBeLessThan(s);
    expect(s).toBeLessThan(p);
  });
});

// ============================================================================
// 8. retryStage
// ============================================================================

describe("retryStage", () => {
  it("重试当前阶段：合法，step 重置为 1", () => {
    const state = makeState({ stage: "character_manage", step: 5 });
    const next = retryStage(state, "character_manage");
    expect(next.stage).toBe("character_manage");
    expect(next.step).toBe(1);
  });

  it("重试之前的阶段：合法，stage 回退", () => {
    const state = makeState({ stage: "review" });
    const next = retryStage(state, "content_import");
    expect(next.stage).toBe("content_import");
    expect(next.step).toBe(1);
  });

  it("重试时清空该阶段的 stepData", () => {
    const state = makeState({
      stage: "character_manage",
      stepData: {
        content_import: { foo: "bar" },
        character_manage: { baz: "qux" },
      },
    });
    const next = retryStage(state, "content_import");
    expect(next.stepData?.content_import).toBeUndefined();
    // 其他阶段的 stepData 保留
    expect(next.stepData?.character_manage).toEqual({ baz: "qux" });
  });

  it("重试当前阶段时也清空对应 stepData", () => {
    const state = makeState({
      stage: "character_manage",
      stepData: { character_manage: { data: "test" } },
    });
    const next = retryStage(state, "character_manage");
    expect(next.stepData?.character_manage).toBeUndefined();
  });

  it("重试之后的阶段：抛出 Error（不能向前重试）", () => {
    const state = makeState({ stage: "content_import" });
    expect(() => retryStage(state, "character_manage")).toThrow(/不能向前重试/);
  });

  it("重试之后的阶段：错误消息包含当前阶段和目标阶段", () => {
    const state = makeState({ stage: "content_import" });
    expect(() => retryStage(state, "done")).toThrow(/content_import.*done|done.*content_import/);
  });

  it("保留原 state 的其他字段（不可变性）", () => {
    const state = makeState({
      stage: "character_manage",
      rawText: "原文本",
      characters: [],
    });
    const next = retryStage(state, "content_import");
    expect(next.rawText).toBe("原文本");
    expect(state.stage).toBe("character_manage");  // 原 state 未被修改
  });

  it("从 done 阶段可重试之前的阶段（允许重做已完成管道）", () => {
    const state = makeState({ stage: "done" });
    const next = retryStage(state, "generation");
    expect(next.stage).toBe("generation");
  });
});

// ============================================================================
// 9. getRetryableStages
// ============================================================================

describe("getRetryableStages", () => {
  it("project_init 阶段：只能重试 project_init", () => {
    expect(getRetryableStages("project_init")).toEqual(["project_init"]);
  });

  it("character_manage 阶段：包含 project_init 到 character_manage", () => {
    const stages = getRetryableStages("character_manage");
    expect(stages).toEqual([
      "project_init",
      "content_import",
      "structure_analysis",
      "pacing_planning",
      "character_manage",
    ]);
  });

  it("done 阶段：包含除 done 之外的所有阶段", () => {
    const stages = getRetryableStages("done");
    expect(stages).toHaveLength(9);  // 10 - 1（排除 done）
    expect(stages).not.toContain("done");
  });

  it("任何阶段都不包含 done（已完成不需要重试）", () => {
    for (const stage of STAGE_ORDER) {
      const stages = getRetryableStages(stage);
      expect(stages).not.toContain("done");
    }
  });

  it("返回的阶段顺序与 STAGE_ORDER 一致", () => {
    const stages = getRetryableStages("generation");
    const expected = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf("generation") + 1).filter((s) => s !== "done");
    expect(stages).toEqual(expected);
  });

  it("getRetryableStages(currentStage) 包含 currentStage", () => {
    for (const stage of STAGE_ORDER) {
      if (stage === "done") continue;
      expect(getRetryableStages(stage)).toContain(stage);
    }
  });
});

// ============================================================================
// 10. FALLBACK_STRATEGIES
// ============================================================================

describe("FALLBACK_STRATEGIES", () => {
  it("包含 extracting / segmenting / breaking 三个 key", () => {
    expect(FALLBACK_STRATEGIES.extracting).toBeDefined();
    expect(FALLBACK_STRATEGIES.segmenting).toBeDefined();
    expect(FALLBACK_STRATEGIES.breaking).toBeDefined();
  });

  it("每个 value 是非空字符串", () => {
    for (const value of Object.values(FALLBACK_STRATEGIES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
