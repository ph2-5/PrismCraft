/**
 * Q3-5 / Task 4.6.3 — useCascadeUpdate React Hook 测试
 *
 * 测试覆盖：
 *   - 初始状态（默认 mode / 自定义 mode / 空 dirtyMap）
 *   - markDirty：cascade_all 模式 + current_only 模式 + 受 updateMode 影响
 *   - setUpdateMode：切换模式后影响 markDirty 行为
 *   - isDirty / getDirtyNodeIds / getDirectDirtyNodeIds 查询
 *   - clearDirty / clearAllDirty 清理
 *   - dirtyCount 同步
 *   - incrementalUpdate 与 dirtyMap 联动
 *   - stableActions 模式：action 引用稳定性
 *
 * 注意：hooks 内部调用 shared-logic/timeline 的纯函数，不需要 mock 这些纯函数。
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCascadeUpdate } from "../use-cascade-update";
import { propagateStates } from "@/shared-logic/timeline";
import type {
  StoryTimelineLike,
  PlotNodeLike,
  PlotEventType,
  PlotEventParameters,
  CharacterInitialState,
  SceneInitialState,
} from "@/shared-logic/timeline";

// ─────────────────────────────────────────────────────────────
// 测试工厂函数
// ─────────────────────────────────────────────────────────────

function makeCharInitial(
  overrides: Partial<CharacterInitialState> = {},
): CharacterInitialState {
  return {
    characterId: "char-1",
    variantId: "v-default",
    ...overrides,
  };
}

function makeSceneInitial(
  overrides: Partial<SceneInitialState> = {},
): SceneInitialState {
  return {
    sceneId: "scene-1",
    variantId: "v-day",
    ...overrides,
  };
}

function makeNode(
  id: string,
  order: number,
  eventType: PlotEventType = "narration",
  params: PlotEventParameters = {},
  overrides: Partial<PlotNodeLike> = {},
): PlotNodeLike {
  return {
    id,
    order,
    plotEventType: eventType,
    plotEventDescription: `${eventType} @ ${id}`,
    plotEventParameters: params,
    ...overrides,
  };
}

function makeTimeline(
  nodes: PlotNodeLike[],
  bindings: StoryTimelineLike["bindings"] = [],
): StoryTimelineLike {
  return { id: "tl-test", nodes, bindings };
}

/** 构造一个 5 节点时间线：narration → character_transform → scene_destruction → narration → character_injury */
function makeSampleTimeline(): StoryTimelineLike {
  return makeTimeline([
    makeNode("node-1", 1, "narration", {}, {
      characterInitialStates: [makeCharInitial({ variantId: "v-casual" })],
      sceneInitialStates: [makeSceneInitial()],
    }),
    makeNode("node-2", 2, "character_transform", {
      characterId: "char-1",
      previousVariantId: "v-casual",
      newVariantId: "v-battle",
    }),
    makeNode("node-3", 3, "scene_destruction", { sceneId: "scene-1" }),
    makeNode("node-4", 4, "narration"),
    makeNode("node-5", 5, "character_injury", {
      characterId: "char-1",
      injuryType: "cut",
      injuryLocation: "arm",
      severity: "severe",
    }),
  ]);
}

// ─────────────────────────────────────────────────────────────
// 初始状态测试
// ─────────────────────────────────────────────────────────────

describe("useCascadeUpdate — 初始状态", () => {
  it("默认 updateMode 应为 cascade_all", () => {
    const { result } = renderHook(() => useCascadeUpdate());

    expect(result.current.updateMode).toBe("cascade_all");
  });

  it("应支持自定义初始 updateMode", () => {
    const { result } = renderHook(() => useCascadeUpdate("current_only"));

    expect(result.current.updateMode).toBe("current_only");
  });

  it("初始 dirtyMap 应为空，dirtyCount 应为 0", () => {
    const { result } = renderHook(() => useCascadeUpdate());

    expect(result.current.dirtyMap.size).toBe(0);
    expect(result.current.dirtyCount).toBe(0);
  });

  it("初始 isDirty 应返回 false", () => {
    const { result } = renderHook(() => useCascadeUpdate());

    expect(result.current.isDirty("any-node")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// markDirty 测试
// ─────────────────────────────────────────────────────────────

describe("useCascadeUpdate — markDirty", () => {
  it("cascade_all 模式应标记直接节点 + 所有下游节点", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate());

    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });

    // node-2 是 direct，node-3/4/5 是 propagated
    expect(result.current.dirtyCount).toBe(4);
    expect(result.current.isDirty("node-2")).toBe(true);
    expect(result.current.isDirty("node-3")).toBe(true);
    expect(result.current.isDirty("node-4")).toBe(true);
    expect(result.current.isDirty("node-5")).toBe(true);
    // node-1 不应被标记
    expect(result.current.isDirty("node-1")).toBe(false);
  });

  it("current_only 模式应仅标记直接节点", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate("current_only"));

    act(() => {
      result.current.markDirty(["node-3"], timeline);
    });

    expect(result.current.dirtyCount).toBe(1);
    expect(result.current.isDirty("node-3")).toBe(true);
    expect(result.current.isDirty("node-4")).toBe(false);
    expect(result.current.isDirty("node-5")).toBe(false);
  });

  it("setUpdateMode 应切换模式并影响后续 markDirty 行为", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate());

    // 初始为 cascade_all
    expect(result.current.updateMode).toBe("cascade_all");

    // 切换到 current_only
    act(() => {
      result.current.setUpdateMode("current_only");
    });

    expect(result.current.updateMode).toBe("current_only");

    // 现在 markDirty 应只标记直接节点
    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });

    expect(result.current.dirtyCount).toBe(1);
    expect(result.current.isDirty("node-2")).toBe(true);
    expect(result.current.isDirty("node-3")).toBe(false);
  });

  it("多次 markDirty 应追加合并", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate("current_only"));

    // 第一次：标记 node-2
    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });
    expect(result.current.dirtyCount).toBe(1);

    // 第二次：标记 node-4
    act(() => {
      result.current.markDirty(["node-4"], timeline);
    });
    expect(result.current.dirtyCount).toBe(2);
    expect(result.current.isDirty("node-2")).toBe(true);
    expect(result.current.isDirty("node-4")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 查询辅助测试
// ─────────────────────────────────────────────────────────────

describe("useCascadeUpdate — 查询辅助", () => {
  it("getDirtyNodeIds 应按 order 排序返回所有脏节点", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate());

    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });

    const ids = result.current.getDirtyNodeIds(timeline);
    expect(ids).toEqual(["node-2", "node-3", "node-4", "node-5"]);
  });

  it("getDirectDirtyNodeIds 应仅返回 direct 级别节点", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate());

    act(() => {
      result.current.markDirty(["node-2", "node-4"], timeline);
    });

    const directIds = result.current.getDirectDirtyNodeIds();
    expect(directIds.sort()).toEqual(["node-2", "node-4"]);
  });

  it("isDirty 应正确查询已知节点", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate("current_only"));

    act(() => {
      result.current.markDirty(["node-3"], timeline);
    });

    expect(result.current.isDirty("node-3")).toBe(true);
    expect(result.current.isDirty("node-1")).toBe(false);
    expect(result.current.isDirty("not-exist")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 清理操作测试
// ─────────────────────────────────────────────────────────────

describe("useCascadeUpdate — 清理操作", () => {
  it("clearDirty 应移除指定节点的脏标记", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate());

    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });
    expect(result.current.dirtyCount).toBe(4);

    act(() => {
      result.current.clearDirty("node-3");
    });

    expect(result.current.isDirty("node-3")).toBe(false);
    expect(result.current.isDirty("node-2")).toBe(true);
    expect(result.current.dirtyCount).toBe(3);
  });

  it("clearAllDirty 应清除所有脏标记", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate());

    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });
    expect(result.current.dirtyCount).toBe(4);

    act(() => {
      result.current.clearAllDirty();
    });

    expect(result.current.dirtyCount).toBe(0);
    expect(result.current.dirtyMap.size).toBe(0);
    expect(result.current.isDirty("node-2")).toBe(false);
  });

  it("clearDirty 清除不存在的节点应为 no-op", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate("current_only"));

    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });
    const beforeCount = result.current.dirtyCount;

    act(() => {
      result.current.clearDirty("not-dirty");
    });

    expect(result.current.dirtyCount).toBe(beforeCount);
  });
});

// ─────────────────────────────────────────────────────────────
// incrementalUpdate 测试
// ─────────────────────────────────────────────────────────────

describe("useCascadeUpdate — incrementalUpdate", () => {
  it("空 dirtyMap 时所有节点应被 skip", () => {
    const timeline = makeSampleTimeline();
    const prevResult = propagateStates(timeline);
    const { result } = renderHook(() => useCascadeUpdate());

    const updateResult = result.current.incrementalUpdate(timeline, prevResult);

    expect(updateResult.recomputedNodeIds).toEqual([]);
    expect(updateResult.skippedNodeIds).toHaveLength(5);
  });

  it("标记 node-2 后 incrementalUpdate 应仅重算脏节点（current_only）", () => {
    const timeline = makeSampleTimeline();
    const prevResult = propagateStates(timeline);
    const { result } = renderHook(() => useCascadeUpdate("current_only"));

    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });

    const updateResult = result.current.incrementalUpdate(timeline, prevResult);

    expect(updateResult.recomputedNodeIds).toContain("node-2");
    // current_only 模式下 node-3/4/5 不应被重算
    expect(updateResult.skippedNodeIds).toContain("node-3");
    expect(updateResult.skippedNodeIds).toContain("node-4");
  });

  it("cascade_all 模式下应重算所有下游脏节点", () => {
    const timeline = makeSampleTimeline();
    const prevResult = propagateStates(timeline);
    const { result } = renderHook(() => useCascadeUpdate("cascade_all"));

    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });

    const updateResult = result.current.incrementalUpdate(timeline, prevResult);

    expect(updateResult.recomputedNodeIds).toEqual([
      "node-2",
      "node-3",
      "node-4",
      "node-5",
    ]);
    expect(updateResult.skippedNodeIds).toEqual(["node-1"]);
  });
});

// ─────────────────────────────────────────────────────────────
// stableActions 引用稳定性测试
// ─────────────────────────────────────────────────────────────

describe("useCascadeUpdate — stableActions 引用稳定性", () => {
  it("clearDirty / clearAllDirty 引用应跨渲染保持稳定", () => {
    const { result } = renderHook(() => useCascadeUpdate());

    const clearDirtyBefore = result.current.clearDirty;
    const clearAllDirtyBefore = result.current.clearAllDirty;

    // 触发一次重渲染（通过 setUpdateMode）
    act(() => {
      result.current.setUpdateMode("current_only");
    });

    // 引用应保持稳定
    expect(result.current.clearDirty).toBe(clearDirtyBefore);
    expect(result.current.clearAllDirty).toBe(clearAllDirtyBefore);
  });

  it("markDirty 引用应在 updateMode 变化时更新", () => {
    const { result } = renderHook(() => useCascadeUpdate());

    const markDirtyBefore = result.current.markDirty;

    act(() => {
      result.current.setUpdateMode("current_only");
    });

    // markDirty 依赖 updateMode，所以引用应变化
    expect(result.current.markDirty).not.toBe(markDirtyBefore);
  });

  it("查询函数引用应在 dirtyMap 变化时更新", () => {
    const timeline = makeSampleTimeline();
    const { result } = renderHook(() => useCascadeUpdate("current_only"));

    const isDirtyBefore = result.current.isDirty;
    const getDirtyNodeIdsBefore = result.current.getDirtyNodeIds;

    act(() => {
      result.current.markDirty(["node-2"], timeline);
    });

    // 依赖 dirtyMap 的查询函数引用应变化
    expect(result.current.isDirty).not.toBe(isDirtyBefore);
    expect(result.current.getDirtyNodeIds).not.toBe(getDirtyNodeIdsBefore);
  });
});
