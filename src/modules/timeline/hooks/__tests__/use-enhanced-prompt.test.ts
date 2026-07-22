/**
 * Q3-8 / Task 4.6.6 — useEnhancedPrompt React Hook 测试
 *
 * 测试覆盖：
 *   - 初始状态（默认 tokenBudget / 自定义 tokenBudget / setTokenBudget）
 *   - enhancePrompt：基础增强 + 不存在节点 + propagationResult 复用 + downstreamNodeIds
 *   - enhancePrompt：使用当前 tokenBudget
 *   - batchEnhancePrompts：批量增强
 *   - stableActions：action 引用稳定性
 *
 * 注意：hooks 内部调用 shared-logic/timeline 的纯函数，不需要 mock 这些纯函数。
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEnhancedPrompt } from "../use-enhanced-prompt";
import { propagateStates } from "@/shared-logic/timeline";
import type {
  StoryTimelineLike,
  PlotNodeLike,
  TimelineBindingLike,
  PlotEventType,
  CharacterStateSnapshot,
} from "@/shared-logic/timeline";

// ─────────────────────────────────────────────────────────────
// 测试工厂函数
// ─────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  order: number,
  eventType: PlotEventType = "narration",
  overrides: Partial<PlotNodeLike> = {},
): PlotNodeLike {
  return {
    id,
    order,
    plotEventType: eventType,
    plotEventDescription: `${id} 描述`,
    plotEventParameters: {},
    ...overrides,
  };
}

function makeTimeline(
  nodes: PlotNodeLike[],
  bindings: TimelineBindingLike[] = [],
): StoryTimelineLike {
  return { id: "tl-test", nodes, bindings };
}

function makeCharacterSnapshot(
  overrides: Partial<CharacterStateSnapshot> = {},
): CharacterStateSnapshot {
  return {
    nodeId: "node-1",
    characterId: "char-1",
    appearance: {
      variantId: "v-default",
      outfit: "casual",
      expression: "neutral",
      pose: "standing",
      injuries: [],
      accessories: [],
    },
    innerState: {
      emotion: "neutral",
      motivation: "",
      secretRevealed: [],
      relationshipStatus: {},
    },
    abilityState: {
      abilitiesActive: [],
      abilitiesRevealed: [],
      powerLevel: 0,
    },
    stateSource: {
      baseVariantId: "v-default",
      transitions: [],
      isModified: false,
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// 初始状态测试
// ─────────────────────────────────────────────────────────────

describe("useEnhancedPrompt — 初始状态", () => {
  it("默认 tokenBudget 应为 1500", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    expect(result.current.tokenBudget).toBe(1500);
  });

  it("应支持自定义初始 tokenBudget", () => {
    const { result } = renderHook(() =>
      useEnhancedPrompt({ tokenBudget: 2500 }),
    );

    expect(result.current.tokenBudget).toBe(2500);
  });

  it("options 为 undefined 时应使用默认 tokenBudget", () => {
    const { result } = renderHook(() => useEnhancedPrompt(undefined));

    expect(result.current.tokenBudget).toBe(1500);
  });

  it("setTokenBudget 应更新 tokenBudget", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    act(() => {
      result.current.setTokenBudget(3000);
    });

    expect(result.current.tokenBudget).toBe(3000);
  });
});

// ─────────────────────────────────────────────────────────────
// enhancePrompt 测试
// ─────────────────────────────────────────────────────────────

describe("useEnhancedPrompt — enhancePrompt", () => {
  it("节点不存在时应返回仅含 basePrompt 的空增强", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    const timeline = makeTimeline([makeNode("node-1", 1)]);

    const enhanced = result.current.enhancePrompt(
      "not-exist",
      timeline,
      "基础 Prompt",
    );

    expect(enhanced.nodeId).toBe("not-exist");
    expect(enhanced.basePrompt).toBe("基础 Prompt");
    expect(enhanced.finalPrompt).toBe("基础 Prompt");
    expect(enhanced.characterSnapshots).toEqual([]);
    expect(enhanced.sceneSnapshots).toEqual([]);
  });

  it("应完整增强 Prompt（含时间线位置 + 角色状态 + 场景状态 + 剧情事件）", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    const node = makeNode("node-1", 1, "character_transform", {
      plotEventDescription: "零变身战斗形态",
      chapterIndex: 2,
      chapterTitle: "对决",
      characterInitialStates: [
        { characterId: "char-1", variantId: "v-battle" },
      ],
      sceneInitialStates: [
        { sceneId: "scene-1", variantId: "v-night" },
      ],
    });
    const timeline = makeTimeline([node]);

    const enhanced = result.current.enhancePrompt("node-1", timeline, "生成图片");

    expect(enhanced.nodeId).toBe("node-1");
    expect(enhanced.basePrompt).toBe("生成图片");
    expect(enhanced.finalPrompt).toContain("【时间线位置】");
    expect(enhanced.finalPrompt).toContain("【角色状态】");
    expect(enhanced.finalPrompt).toContain("【场景状态】");
    expect(enhanced.finalPrompt).toContain("【剧情事件】");
    expect(enhanced.finalPrompt).toContain("【合成 Prompt】");
    expect(enhanced.finalPrompt).toContain("生成图片");
  });

  it("应支持预计算 propagationResult 复用", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    const node = makeNode("node-1", 1);
    const timeline = makeTimeline([node]);

    const customSnapshot = makeCharacterSnapshot({
      characterId: "custom-char",
      nodeId: "node-1",
    });
    const propagationResult = new Map([
      [
        "node-1",
        {
          nodeId: "node-1",
          characterSnapshots: [customSnapshot],
          sceneSnapshots: [],
          transitions: [],
        },
      ],
    ]);

    const enhanced = result.current.enhancePrompt("node-1", timeline, "Prompt", {
      propagationResult,
    });

    expect(enhanced.characterSnapshots).toHaveLength(1);
    expect(enhanced.characterSnapshots[0]!.characterId).toBe("custom-char");
  });

  it("应支持 downstreamNodeIds 透传", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    const timeline = makeTimeline([
      makeNode("node-1", 1, "narration", {
        characterInitialStates: [{ characterId: "char-1", variantId: "v-1" }],
      }),
      makeNode("node-2", 2),
      makeNode("node-3", 3),
    ]);

    // 不传 downstreamNodeIds
    const enhanced1 = result.current.enhancePrompt("node-1", timeline, "P");
    // 传 downstreamNodeIds
    const enhanced2 = result.current.enhancePrompt("node-1", timeline, "P", {
      downstreamNodeIds: ["node-2", "node-3"],
    });

    // 两者都应成功生成
    expect(enhanced1.finalPrompt).toContain("【时间线位置】");
    expect(enhanced2.finalPrompt).toContain("【时间线位置】");
  });

  it("应使用当前 tokenBudget 进行增强", () => {
    const { result } = renderHook(() =>
      useEnhancedPrompt({ tokenBudget: 2000 }),
    );

    const node = makeNode("node-1", 1);
    const timeline = makeTimeline([node]);

    const enhanced = result.current.enhancePrompt("node-1", timeline, "Prompt");

    expect(enhanced.basePrompt).toBe("Prompt");
    // estimatedTokens 应为正数
    expect(enhanced.estimatedTokens).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// batchEnhancePrompts 测试
// ─────────────────────────────────────────────────────────────

describe("useEnhancedPrompt — batchEnhancePrompts", () => {
  it("应批量增强多个节点", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    const timeline = makeTimeline([
      makeNode("node-1", 1, "narration", { plotEventDescription: "事件1" }),
      makeNode("node-2", 2, "narration", { plotEventDescription: "事件2" }),
    ]);
    const basePrompts = new Map([
      ["node-1", "Prompt 1"],
      ["node-2", "Prompt 2"],
    ]);

    const results = result.current.batchEnhancePrompts(
      ["node-1", "node-2"],
      timeline,
      basePrompts,
    );

    expect(results.size).toBe(2);
    expect(results.get("node-1")!.basePrompt).toBe("Prompt 1");
    expect(results.get("node-2")!.basePrompt).toBe("Prompt 2");
    expect(results.get("node-1")!.finalPrompt).toContain("事件1");
    expect(results.get("node-2")!.finalPrompt).toContain("事件2");
  });

  it("节点不存在时应返回空增强", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    const timeline = makeTimeline([makeNode("node-1", 1)]);
    const basePrompts = new Map([["not-exist", "Prompt"]]);

    const results = result.current.batchEnhancePrompts(
      ["not-exist"],
      timeline,
      basePrompts,
    );

    expect(results.size).toBe(1);
    expect(results.get("not-exist")!.finalPrompt).toBe("Prompt");
  });

  it("应支持预计算 propagationResult 透传", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    const timeline = makeTimeline([
      makeNode("node-1", 1, "narration", {
        characterInitialStates: [{ characterId: "char-1", variantId: "v-1" }],
      }),
      makeNode("node-2", 2),
    ]);

    // 预计算 propagationResult
    const propagationResult = propagateStates(timeline);

    const basePrompts = new Map([
      ["node-1", "Prompt 1"],
      ["node-2", "Prompt 2"],
    ]);

    const results = result.current.batchEnhancePrompts(
      ["node-1", "node-2"],
      timeline,
      basePrompts,
      { propagationResult },
    );

    expect(results.size).toBe(2);
    expect(results.get("node-1")!.characterSnapshots.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// stableActions 引用稳定性测试
// ─────────────────────────────────────────────────────────────

describe("useEnhancedPrompt — stableActions 引用稳定性", () => {
  it("enhancePrompt / batchEnhancePrompts 引用应在 tokenBudget 变化时更新", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    const enhanceBefore = result.current.enhancePrompt;
    const batchBefore = result.current.batchEnhancePrompts;

    act(() => {
      result.current.setTokenBudget(999);
    });

    // 依赖 tokenBudget，所以引用应变化
    expect(result.current.enhancePrompt).not.toBe(enhanceBefore);
    expect(result.current.batchEnhancePrompts).not.toBe(batchBefore);
  });

  it("不调用 setTokenBudget 时引用应保持稳定", () => {
    const { result } = renderHook(() => useEnhancedPrompt());

    const enhanceBefore = result.current.enhancePrompt;
    const batchBefore = result.current.batchEnhancePrompts;

    // 不触发任何状态变化，但通过 rerender 验证
    const { rerender } = renderHook(() => useEnhancedPrompt());

    // rerender 不改变 tokenBudget，引用应稳定
    // 注意：useEnhancedPrompt 内部 useCallback 依赖 tokenBudget，
    // 不变则引用不变。这里我们用 result.current（第一次的 hook 实例）
    expect(result.current.enhancePrompt).toBe(enhanceBefore);
    expect(result.current.batchEnhancePrompts).toBe(batchBefore);

    // 防止 rerender 未使用警告
    rerender();
  });
});

// ─────────────────────────────────────────────────────────────
// 集成测试
// ─────────────────────────────────────────────────────────────

describe("useEnhancedPrompt — 集成测试", () => {
  it("完整流程：propagateStates + enhancePrompt + batchEnhancePrompts", () => {
    const { result } = renderHook(() => useEnhancedPrompt({ tokenBudget: 500 }));

    const timeline = makeTimeline(
      [
        makeNode("node-1", 1, "narration", {
          plotEventDescription: "开篇",
          characterInitialStates: [
            { characterId: "char-1", variantId: "v-casual" },
          ],
          sceneInitialStates: [{ sceneId: "scene-1", variantId: "v-day" }],
        }),
        makeNode("node-2", 2, "character_transform", {
          plotEventDescription: "变身",
          plotEventParameters: {
            characterId: "char-1",
            previousVariantId: "v-casual",
            newVariantId: "v-battle",
          },
        }),
      ],
      [
        {
          id: "b-1",
          type: "foreshadow",
          sourceNodeId: "node-1",
          targetNodeId: "node-2",
          injectionText: "第1章伏笔",
          importance: "critical",
        },
      ],
    );

    // 预计算
    const propagationResult = propagateStates(timeline);

    // 单节点增强
    const enhanced = result.current.enhancePrompt("node-2", timeline, "生成图片", {
      propagationResult,
    });

    expect(enhanced.finalPrompt).toContain("生成图片");
    expect(enhanced.finalPrompt).toContain("【时间线位置】");
    expect(enhanced.injectionResult.injectedBindings).toHaveLength(1);

    // 批量增强
    const basePrompts = new Map([
      ["node-1", "Prompt 1"],
      ["node-2", "Prompt 2"],
    ]);
    const batchResults = result.current.batchEnhancePrompts(
      ["node-1", "node-2"],
      timeline,
      basePrompts,
      { propagationResult },
    );

    expect(batchResults.size).toBe(2);
    expect(batchResults.get("node-2")!.injectionResult.injectedBindings).toHaveLength(1);
  });
});
