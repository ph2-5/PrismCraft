/**
 * Q3-10 / Task 4.6.8 — useSnapshotWindow React Hook 测试
 *
 * 测试覆盖：
 *   - 初始状态（默认 windowSize / 自定义 windowSize / 空状态）
 *   - PinnedSnapshot 管理：pinNode / unpinNode / isPinned / getPinnedNodeIds / getPinnedCount
 *   - autoPinFromTimeline：自动标注关键节点
 *   - shouldAutoPin：检测节点是否应自动标注
 *   - 窗口管理：initWindow / slideWindow / getCenterNode / getWindowNodes
 *   - 快照获取：getSnapshot / getSnapshotStrategy / getCachedCount
 *   - getPinnedInWindow：窗口内 pinned 节点查询
 *   - stableActions：action 引用稳定性
 *
 * 注意：hooks 内部调用 shared-logic/timeline 的纯函数，不需要 mock 这些纯函数。
 * 该 hook 管理两个独立的 state（pinnedStore 和 store），pinNode 会同步更新两者。
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSnapshotWindow } from "../use-snapshot-window";
import type {
  PlotNodeLike,
  StoryTimelineLike,
} from "@/shared-logic/timeline";

// ─────────────────────────────────────────────────────────────
// 测试工厂函数
// ─────────────────────────────────────────────────────────────

function makeNodes(count: number): PlotNodeLike[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n-${i + 1}`,
    order: i,
    plotEventType: "narration" as const,
    plotEventDescription: `节点 ${i + 1}`,
    plotEventParameters: {},
    characterInitialStates: [
      { characterId: "char-1", variantId: "v-default" },
    ],
  }));
}

function makeTimeline(nodes: PlotNodeLike[]): StoryTimelineLike {
  return { id: "tl-test", nodes, bindings: [] };
}

// ─────────────────────────────────────────────────────────────
// 初始状态测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — 初始状态", () => {
  it("初始 getPinnedCount 应为 0", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    expect(result.current.getPinnedCount()).toBe(0);
  });

  it("初始 isPinned 应返回 false", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    expect(result.current.isPinned("any-node")).toBe(false);
  });

  it("初始 getCenterNode 应返回 null", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    expect(result.current.getCenterNode()).toBeNull();
  });

  it("初始 getWindowNodes 应返回空数组", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    expect(result.current.getWindowNodes()).toEqual([]);
  });

  it("应支持自定义 windowSize", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() =>
      useSnapshotWindow({ windowSize: 5 }),
    );

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    // windowSize=5 时，n-5（idx=4）窗口应为 n-1 到 n-9（9 个节点，但 n-1 在边界内）
    // 实际窗口大小为 2*5+1=11，但只有 10 个节点
    const windowNodes = result.current.getWindowNodes();
    expect(windowNodes.length).toBeGreaterThan(0);
    expect(windowNodes).toContain("n-5");
  });
});

// ─────────────────────────────────────────────────────────────
// PinnedSnapshot 管理测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — pinNode / unpinNode", () => {
  it("pinNode 应标注节点", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.pinNode("n-1", "manual", "user");
    });

    expect(result.current.isPinned("n-1")).toBe(true);
    expect(result.current.getPinnedCount()).toBe(1);
  });

  it("pinNode 默认 reason 和 pinnedBy", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.pinNode("n-1"); // 不传 reason/pinnedBy
    });

    expect(result.current.isPinned("n-1")).toBe(true);
    expect(result.current.getPinnedNodeIds()).toContain("n-1");
  });

  it("unpinNode 应取消标注", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.pinNode("n-1", "manual", "user");
    });
    expect(result.current.isPinned("n-1")).toBe(true);

    act(() => {
      result.current.unpinNode("n-1");
    });

    expect(result.current.isPinned("n-1")).toBe(false);
    expect(result.current.getPinnedCount()).toBe(0);
  });

  it("getPinnedNodeIds 应返回所有标注节点", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.pinNode("n-1", "manual", "user");
      result.current.pinNode("n-2", "auto_climax", "ai");
      result.current.pinNode("n-3", "manual", "user");
    });

    const ids = result.current.getPinnedNodeIds();
    expect(ids).toHaveLength(3);
    expect(ids).toContain("n-1");
    expect(ids).toContain("n-2");
    expect(ids).toContain("n-3");
  });

  it("重复 pinNode 同一节点应更新而非追加", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.pinNode("n-1", "manual", "user");
    });
    expect(result.current.getPinnedCount()).toBe(1);

    act(() => {
      result.current.pinNode("n-1", "auto_climax", "ai");
    });

    // 仍是 1 个（更新而非追加）
    expect(result.current.getPinnedCount()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// autoPinFromTimeline 测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — autoPinFromTimeline", () => {
  it("应自动标注 climax 和 twist 节点", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    const timeline = makeTimeline([
      {
        id: "n-1",
        order: 0,
        plotEventType: "narration",
        plotEventDescription: "n-1",
        plotEventParameters: {},
      },
      {
        id: "n-2",
        order: 1,
        plotEventType: "climax",
        plotEventDescription: "n-2",
        plotEventParameters: {},
      },
      {
        id: "n-3",
        order: 2,
        plotEventType: "narration",
        plotEventDescription: "n-3",
        plotEventParameters: {},
      },
      {
        id: "n-4",
        order: 3,
        plotEventType: "twist",
        plotEventDescription: "n-4",
        plotEventParameters: {},
      },
    ]);

    act(() => {
      result.current.autoPinFromTimeline(timeline);
    });

    expect(result.current.getPinnedCount()).toBe(2);
    expect(result.current.isPinned("n-2")).toBe(true);
    expect(result.current.isPinned("n-4")).toBe(true);
    expect(result.current.isPinned("n-1")).toBe(false);
  });

  it("不应覆盖已有的人工标注", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    const timeline = makeTimeline([
      {
        id: "n-1",
        order: 0,
        plotEventType: "climax",
        plotEventDescription: "n-1",
        plotEventParameters: {},
      },
    ]);

    // 先手动标注
    act(() => {
      result.current.pinNode("n-1", "manual", "user");
    });

    // 再自动标注
    act(() => {
      result.current.autoPinFromTimeline(timeline);
    });

    // 人工标注不应被覆盖
    expect(result.current.isPinned("n-1")).toBe(true);
    expect(result.current.getPinnedCount()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// shouldAutoPin 测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — shouldAutoPin", () => {
  it("climax 事件应返回 auto_climax", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    const node: PlotNodeLike = {
      id: "n-1",
      order: 1,
      plotEventType: "climax",
      plotEventDescription: "高潮",
      plotEventParameters: {},
    };

    expect(result.current.shouldAutoPin(node, [])).toBe("auto_climax");
  });

  it("twist 事件应返回 auto_twist", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    const node: PlotNodeLike = {
      id: "n-1",
      order: 1,
      plotEventType: "twist",
      plotEventDescription: "转折",
      plotEventParameters: {},
    };

    expect(result.current.shouldAutoPin(node, [])).toBe("auto_twist");
  });

  it("narration 事件不应标注", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    const node: PlotNodeLike = {
      id: "n-1",
      order: 1,
      plotEventType: "narration",
      plotEventDescription: "旁白",
      plotEventParameters: {},
    };

    expect(result.current.shouldAutoPin(node, [])).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// 窗口管理测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — initWindow", () => {
  it("应设置中心节点和活动节点", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    expect(result.current.getCenterNode()).toBe("n-5");
    // 默认 windowSize=3，n-5 是第 5 个节点（idx=4），窗口应为 n-2 到 n-8（7 个节点）
    const windowNodes = result.current.getWindowNodes();
    expect(windowNodes).toHaveLength(7);
    expect(windowNodes).toContain("n-2");
    expect(windowNodes).toContain("n-8");
    expect(windowNodes).not.toContain("n-1");
    expect(windowNodes).not.toContain("n-9");
  });

  it("边界处理（中心在开头）", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-1", timeline);
    });

    expect(result.current.getCenterNode()).toBe("n-1");
    // n-1 是第一个节点，窗口应为 n-1 到 n-4（4 个节点）
    const windowNodes = result.current.getWindowNodes();
    expect(windowNodes).toHaveLength(4);
    expect(windowNodes).toContain("n-1");
    expect(windowNodes).toContain("n-4");
  });

  it("边界处理（中心在末尾）", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-10", timeline);
    });

    expect(result.current.getCenterNode()).toBe("n-10");
    // n-10 是最后一个节点，窗口应为 n-7 到 n-10（4 个节点）
    const windowNodes = result.current.getWindowNodes();
    expect(windowNodes).toHaveLength(4);
    expect(windowNodes).toContain("n-7");
    expect(windowNodes).toContain("n-10");
  });
});

describe("useSnapshotWindow — slideWindow", () => {
  it("应更新中心节点", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    act(() => {
      result.current.slideWindow("n-6", timeline);
    });

    expect(result.current.getCenterNode()).toBe("n-6");
  });

  it("应更新 activeNodeIds", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    act(() => {
      result.current.slideWindow("n-7", timeline);
    });

    // 新窗口：n-4 到 n-10
    const windowNodes = result.current.getWindowNodes();
    expect(windowNodes).toContain("n-4");
    expect(windowNodes).toContain("n-10");
    // n-2 应已移出窗口
    expect(windowNodes).not.toContain("n-2");
  });

  it("滑动到不存在的节点应保持原中心", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    act(() => {
      result.current.slideWindow("n-nonexistent", timeline);
    });

    // 中心节点应保持不变
    expect(result.current.getCenterNode()).toBe("n-5");
  });
});

// ─────────────────────────────────────────────────────────────
// 快照获取测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — getSnapshot", () => {
  it("命中缓存应直接返回快照", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    const snap = result.current.getSnapshot("n-5", timeline);
    expect(snap).toBeDefined();
    expect(snap!.nodeId).toBe("n-5");
  });

  it("不存在的节点应返回 undefined", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    const snap = result.current.getSnapshot("n-nonexistent", timeline);
    expect(snap).toBeUndefined();
  });

  it("diff_only 节点应增量重算返回快照", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    // n-1 在窗口外，是 diff_only
    const snap = result.current.getSnapshot("n-1", timeline);
    expect(snap).toBeDefined();
    expect(snap!.nodeId).toBe("n-1");
  });
});

// ─────────────────────────────────────────────────────────────
// getSnapshotStrategy 测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — getSnapshotStrategy", () => {
  it("pinned 节点应返回 pinned", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.pinNode("n-1", "manual", "user");
    });

    expect(result.current.getSnapshotStrategy("n-1")).toBe("pinned");
  });

  it("active 节点应返回 active", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    expect(result.current.getSnapshotStrategy("n-5")).toBe("active");
    expect(result.current.getSnapshotStrategy("n-2")).toBe("active");
  });

  it("窗口外非 pinned 节点应返回 diff_only", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    expect(result.current.getSnapshotStrategy("n-1")).toBe("diff_only");
    expect(result.current.getSnapshotStrategy("n-10")).toBe("diff_only");
  });

  it("pinned 优先于 active", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.pinNode("n-5", "manual", "user");
      result.current.initWindow("n-5", timeline);
    });

    expect(result.current.getSnapshotStrategy("n-5")).toBe("pinned");
  });
});

// ─────────────────────────────────────────────────────────────
// getCachedCount / getPinnedInWindow 测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — getCachedCount / getPinnedInWindow", () => {
  it("initWindow 后 getCachedCount 应至少为窗口节点数", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    // 默认窗口 7 个节点都应被缓存
    expect(result.current.getCachedCount()).toBeGreaterThanOrEqual(7);
  });

  it("getPinnedInWindow 应返回窗口内的 pinned 节点", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.pinNode("n-3", "manual", "user");
      result.current.pinNode("n-9", "manual", "user");
      result.current.initWindow("n-5", timeline);
    });

    // 窗口是 n-2 到 n-8，只有 n-3 在窗口内
    const pinnedInWindow = result.current.getPinnedInWindow();
    expect(pinnedInWindow).toEqual(["n-3"]);
  });

  it("100 节点项目应只缓存窗口内的节点", () => {
    const timeline = makeTimeline(makeNodes(100));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.initWindow("n-50", timeline);
    });

    // 窗口大小 3，应缓存 7 个节点
    expect(result.current.getCachedCount()).toBe(7);
    expect(result.current.getCachedCount()).toBeLessThan(100);
  });

  it("有 pinned 节点时应额外缓存 pinned", () => {
    const timeline = makeTimeline(makeNodes(100));
    const { result } = renderHook(() => useSnapshotWindow());

    act(() => {
      result.current.pinNode("n-10", "manual", "user");
      result.current.pinNode("n-90", "manual", "user");
      result.current.initWindow("n-50", timeline);
    });

    // 7 个 active + 2 个 pinned（不在窗口内）
    expect(result.current.getCachedCount()).toBe(9);
  });
});

// ─────────────────────────────────────────────────────────────
// stableActions 引用稳定性测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — stableActions 引用稳定性", () => {
  it("pinNode / unpinNode / initWindow / slideWindow 引用应跨渲染稳定", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    const pinNodeBefore = result.current.pinNode;
    const unpinNodeBefore = result.current.unpinNode;
    const initWindowBefore = result.current.initWindow;
    const slideWindowBefore = result.current.slideWindow;
    const shouldAutoPinBefore = result.current.shouldAutoPin;

    // 触发一次重渲染（通过 initWindow，会改变 store 但不改变这些 action 的依赖）
    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    // 依赖为 [] 的 action 引用应保持稳定
    expect(result.current.pinNode).toBe(pinNodeBefore);
    expect(result.current.unpinNode).toBe(unpinNodeBefore);
    expect(result.current.initWindow).toBe(initWindowBefore);
    expect(result.current.slideWindow).toBe(slideWindowBefore);
    expect(result.current.shouldAutoPin).toBe(shouldAutoPinBefore);
  });

  it("查询函数引用应在 store 变化时更新", () => {
    const timeline = makeTimeline(makeNodes(10));
    const { result } = renderHook(() => useSnapshotWindow());

    const getCenterNodeBefore = result.current.getCenterNode;
    const getWindowNodesBefore = result.current.getWindowNodes;
    const getCachedCountBefore = result.current.getCachedCount;

    act(() => {
      result.current.initWindow("n-5", timeline);
    });

    // 依赖 store 的查询函数引用应变化
    expect(result.current.getCenterNode).not.toBe(getCenterNodeBefore);
    expect(result.current.getWindowNodes).not.toBe(getWindowNodesBefore);
    expect(result.current.getCachedCount).not.toBe(getCachedCountBefore);
  });

  it("isPinned / getPinnedNodeIds / getPinnedCount 引用应在 pinnedStore 变化时更新", () => {
    const { result } = renderHook(() => useSnapshotWindow());

    const isPinnedBefore = result.current.isPinned;
    const getPinnedNodeIdsBefore = result.current.getPinnedNodeIds;
    const getPinnedCountBefore = result.current.getPinnedCount;

    act(() => {
      result.current.pinNode("n-1", "manual", "user");
    });

    // 依赖 pinnedStore 的查询函数引用应变化
    expect(result.current.isPinned).not.toBe(isPinnedBefore);
    expect(result.current.getPinnedNodeIds).not.toBe(getPinnedNodeIdsBefore);
    expect(result.current.getPinnedCount).not.toBe(getPinnedCountBefore);
  });
});

// ─────────────────────────────────────────────────────────────
// 集成测试
// ─────────────────────────────────────────────────────────────

describe("useSnapshotWindow — 集成测试", () => {
  it("完整流程：initWindow + pinNode + slideWindow + getSnapshot", () => {
    const timeline = makeTimeline(makeNodes(20));
    const { result } = renderHook(() => useSnapshotWindow({ windowSize: 3 }));

    // 初始化窗口
    act(() => {
      result.current.initWindow("n-10", timeline);
    });
    expect(result.current.getCenterNode()).toBe("n-10");
    expect(result.current.getWindowNodes()).toHaveLength(7);

    // 手动标注窗口外节点
    act(() => {
      result.current.pinNode("n-1", "manual", "user");
    });
    expect(result.current.isPinned("n-1")).toBe(true);
    expect(result.current.getSnapshotStrategy("n-1")).toBe("pinned");

    // 滑动窗口到 n-15
    act(() => {
      result.current.slideWindow("n-15", timeline);
    });
    expect(result.current.getCenterNode()).toBe("n-15");

    // pinned 节点应仍可获取快照（即使不在窗口内）
    const snap = result.current.getSnapshot("n-1", timeline);
    expect(snap).toBeDefined();
    expect(snap!.nodeId).toBe("n-1");
  });

  it("autoPinFromTimeline + initWindow + getPinnedInWindow", () => {
    const timeline = makeTimeline([
      {
        id: "n-1",
        order: 0,
        plotEventType: "narration",
        plotEventDescription: "n-1",
        plotEventParameters: {},
        characterInitialStates: [{ characterId: "char-1", variantId: "v-1" }],
      },
      {
        id: "n-2",
        order: 1,
        plotEventType: "climax",
        plotEventDescription: "n-2",
        plotEventParameters: {},
      },
      {
        id: "n-3",
        order: 2,
        plotEventType: "narration",
        plotEventDescription: "n-3",
        plotEventParameters: {},
      },
      {
        id: "n-4",
        order: 3,
        plotEventType: "twist",
        plotEventDescription: "n-4",
        plotEventParameters: {},
      },
      {
        id: "n-5",
        order: 4,
        plotEventType: "narration",
        plotEventDescription: "n-5",
        plotEventParameters: {},
      },
    ]);

    const { result } = renderHook(() => useSnapshotWindow());

    // 自动标注
    act(() => {
      result.current.autoPinFromTimeline(timeline);
    });
    expect(result.current.getPinnedCount()).toBe(2); // climax + twist

    // 初始化窗口
    act(() => {
      result.current.initWindow("n-3", timeline);
    });

    // 窗口应为 n-1 到 n-5（全部 5 个节点，因为 windowSize=3）
    const windowNodes = result.current.getWindowNodes();
    expect(windowNodes).toContain("n-3");

    // pinned 节点 n-2 和 n-4 都在窗口内
    const pinnedInWindow = result.current.getPinnedInWindow();
    expect(pinnedInWindow).toEqual(expect.arrayContaining(["n-2", "n-4"]));
  });
});
