/**
 * Q3-9 / Task 4.6.7 — useMultiTimeline React Hook 测试
 *
 * 测试覆盖：
 *   - injectCrossTimelineBindings：无绑定 / 完整注入 / 过滤
 *   - getInboundCrossTimelineBindings / getOutboundCrossTimelineBindings
 *   - getBindingsBetweenTimelines
 *   - getTimelineRelationships
 *   - computeTimelineLayers
 *   - findRelationship
 *   - normalizeCrossTimelineBinding
 *   - stableActions：所有 action 引用稳定性（无依赖）
 *
 * 注意：hooks 内部调用 shared-logic/timeline 的纯函数，不需要 mock 这些纯函数。
 * 该 hook 无 state，所有 action 都是 useCallback([])，引用应永久稳定。
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMultiTimeline } from "../use-multi-timeline";
import type {
  CrossTimelineBindingLike,
  MultiTimelineLike,
  TimelineRelationshipLike,
} from "@/shared-logic/timeline";

// ─────────────────────────────────────────────────────────────
// 测试工厂函数
// ─────────────────────────────────────────────────────────────

function makeBinding(
  overrides: Partial<CrossTimelineBindingLike> = {},
): CrossTimelineBindingLike {
  return {
    id: "b-1",
    type: "foreshadow",
    sourceTimelineId: "tl-flashback",
    sourceNodeId: "fb-node-1",
    targetTimelineId: "tl-main",
    targetNodeId: "main-node-1",
    injectionText: "回忆中的伏笔",
    importance: "critical",
    ...overrides,
  };
}

function makeRelationship(
  overrides: Partial<TimelineRelationshipLike> = {},
): TimelineRelationshipLike {
  return {
    fromTimelineId: "tl-flashback",
    toTimelineId: "tl-main",
    type: "flashback",
    description: "回忆线",
    ...overrides,
  };
}

function makeMultiView(
  bindings: CrossTimelineBindingLike[] = [],
  relationships: TimelineRelationshipLike[] = [],
  timelineIds: string[] = ["tl-main", "tl-flashback", "tl-branch"],
): MultiTimelineLike {
  return {
    timelineIds,
    relationships,
    crossTimelineBindings: bindings,
  };
}

// ─────────────────────────────────────────────────────────────
// injectCrossTimelineBindings 测试
// ─────────────────────────────────────────────────────────────

describe("useMultiTimeline — injectCrossTimelineBindings", () => {
  it("无绑定时应返回原 Prompt", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const multiView = makeMultiView();
    const injectResult = result.current.injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "基础 Prompt",
    );

    expect(injectResult.injectedBindings).toEqual([]);
    expect(injectResult.skippedBindings).toEqual([]);
    expect(injectResult.injectionBlock).toBe("");
    expect(injectResult.injectedPrompt).toBe("基础 Prompt");
  });

  it("应正确注入匹配的绑定", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const binding = makeBinding({
      importance: "critical",
      injectionText: "回忆中的伏笔",
    });
    const multiView = makeMultiView([binding]);

    const injectResult = result.current.injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "生成图片",
    );

    expect(injectResult.injectedBindings).toHaveLength(1);
    expect(injectResult.injectedPrompt).toContain("回忆中的伏笔");
    expect(injectResult.injectedPrompt).toContain("生成图片");
  });

  it("目标时间线不匹配应跳过", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const binding = makeBinding({ targetTimelineId: "tl-other" });
    const multiView = makeMultiView([binding]);

    const injectResult = result.current.injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(injectResult.injectedBindings).toHaveLength(0);
    expect(injectResult.skippedBindings).toHaveLength(1);
    expect(injectResult.skippedBindings[0]!.reason).toBe("timeline_mismatch");
  });

  it("目标节点不匹配应跳过", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const binding = makeBinding({ targetNodeId: "other-node" });
    const multiView = makeMultiView([binding]);

    const injectResult = result.current.injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(injectResult.injectedBindings).toHaveLength(0);
    expect(injectResult.skippedBindings[0]!.reason).toBe("node_mismatch");
  });
});

// ─────────────────────────────────────────────────────────────
// 查询辅助测试
// ─────────────────────────────────────────────────────────────

describe("useMultiTimeline — getInboundCrossTimelineBindings", () => {
  it("应返回目标为指定节点的绑定", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const b1 = makeBinding({ id: "b1", targetNodeId: "n1" });
    const b2 = makeBinding({ id: "b2", targetNodeId: "n2" });
    const multiView = makeMultiView([b1, b2]);

    const inbound = result.current.getInboundCrossTimelineBindings(
      "n1",
      "tl-main",
      multiView,
    );

    expect(inbound).toHaveLength(1);
    expect(inbound[0]!.id).toBe("b1");
  });
});

describe("useMultiTimeline — getOutboundCrossTimelineBindings", () => {
  it("应返回源为指定节点的绑定", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const b1 = makeBinding({ id: "b1", sourceNodeId: "n1" });
    const b2 = makeBinding({ id: "b2", sourceNodeId: "n2" });
    const multiView = makeMultiView([b1, b2]);

    const outbound = result.current.getOutboundCrossTimelineBindings(
      "n1",
      "tl-flashback",
      multiView,
    );

    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.id).toBe("b1");
  });
});

describe("useMultiTimeline — getBindingsBetweenTimelines", () => {
  it("应返回两个时间线之间的绑定", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const b1 = makeBinding({
      id: "b1",
      sourceTimelineId: "tl-a",
      targetTimelineId: "tl-b",
    });
    const b2 = makeBinding({
      id: "b2",
      sourceTimelineId: "tl-c",
      targetTimelineId: "tl-b",
    });
    const multiView = makeMultiView([b1, b2], [], ["tl-a", "tl-b", "tl-c"]);

    const bindings = result.current.getBindingsBetweenTimelines(
      "tl-a",
      "tl-b",
      multiView,
    );

    expect(bindings).toHaveLength(1);
    expect(bindings[0]!.id).toBe("b1");
  });
});

describe("useMultiTimeline — getTimelineRelationships", () => {
  it("应返回涉及指定时间线的所有关系", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const r1 = makeRelationship({
      fromTimelineId: "tl-a",
      toTimelineId: "tl-b",
    });
    const r2 = makeRelationship({
      fromTimelineId: "tl-c",
      toTimelineId: "tl-a",
    });
    const r3 = makeRelationship({
      fromTimelineId: "tl-x",
      toTimelineId: "tl-y",
    });
    const multiView = makeMultiView([], [r1, r2, r3]);

    const relationships = result.current.getTimelineRelationships(
      "tl-a",
      multiView,
    );

    expect(relationships).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────
// computeTimelineLayers 测试
// ─────────────────────────────────────────────────────────────

describe("useMultiTimeline — computeTimelineLayers", () => {
  it("应正确计算主线深度为 0", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const layers = result.current.computeTimelineLayers([{ id: "tl-main" }]);

    expect(layers.get("tl-main")?.depth).toBe(0);
    expect(layers.get("tl-main")?.parentTimelineId).toBeUndefined();
  });

  it("应正确计算子时间线深度", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const layers = result.current.computeTimelineLayers([
      { id: "tl-main" },
      { id: "tl-dream1", parentTimelineId: "tl-main" },
      { id: "tl-dream2", parentTimelineId: "tl-dream1" },
    ]);

    expect(layers.get("tl-main")?.depth).toBe(0);
    expect(layers.get("tl-dream1")?.depth).toBe(1);
    expect(layers.get("tl-dream2")?.depth).toBe(2);
  });

  it("应正确填充 childTimelineIds", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const layers = result.current.computeTimelineLayers([
      { id: "tl-main" },
      { id: "tl-a", parentTimelineId: "tl-main" },
      { id: "tl-b", parentTimelineId: "tl-main" },
    ]);

    expect(layers.get("tl-main")?.childTimelineIds).toEqual(
      expect.arrayContaining(["tl-a", "tl-b"]),
    );
  });
});

// ─────────────────────────────────────────────────────────────
// findRelationship / normalizeCrossTimelineBinding 测试
// ─────────────────────────────────────────────────────────────

describe("useMultiTimeline — findRelationship", () => {
  it("应找到匹配的关系", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const rel = makeRelationship();
    const found = result.current.findRelationship([rel], "tl-flashback", "tl-main");

    expect(found).toBe(rel);
  });

  it("未找到应返回 undefined", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const found = result.current.findRelationship([], "tl-a", "tl-b");
    expect(found).toBeUndefined();
  });
});

describe("useMultiTimeline — normalizeCrossTimelineBinding", () => {
  it("应填充默认值", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const raw: CrossTimelineBindingLike = {
      id: "b-1",
      type: "foreshadow",
      sourceTimelineId: "tl-a",
      sourceNodeId: "n-a",
      targetTimelineId: "tl-b",
      targetNodeId: "n-b",
      injectionText: "text",
      importance: "critical",
    };

    const normalized = result.current.normalizeCrossTimelineBinding(raw);

    expect(normalized.autoInject).toBe(true);
    expect(normalized.cascadeEffect).toBe(false);
    expect(normalized.aiDetected).toBe(false);
    expect(normalized.userConfirmed).toBe(false);
  });

  it("应保留已设置的值", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const raw: CrossTimelineBindingLike = {
      id: "b-1",
      type: "foreshadow",
      sourceTimelineId: "tl-a",
      sourceNodeId: "n-a",
      targetTimelineId: "tl-b",
      targetNodeId: "n-b",
      injectionText: "text",
      importance: "critical",
      autoInject: false,
      cascadeEffect: true,
      aiDetected: true,
      userConfirmed: true,
    };

    const normalized = result.current.normalizeCrossTimelineBinding(raw);

    expect(normalized.autoInject).toBe(false);
    expect(normalized.cascadeEffect).toBe(true);
    expect(normalized.aiDetected).toBe(true);
    expect(normalized.userConfirmed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// stableActions 引用稳定性测试
// ─────────────────────────────────────────────────────────────

describe("useMultiTimeline — stableActions 引用稳定性", () => {
  it("所有 action 引用应跨多次渲染保持稳定（无依赖）", () => {
    const { result, rerender } = renderHook(() => useMultiTimeline());

    const injectBefore = result.current.injectCrossTimelineBindings;
    const getInboundBefore = result.current.getInboundCrossTimelineBindings;
    const getOutboundBefore = result.current.getOutboundCrossTimelineBindings;
    const getBetweenBefore = result.current.getBindingsBetweenTimelines;
    const getRelationshipsBefore = result.current.getTimelineRelationships;
    const computeLayersBefore = result.current.computeTimelineLayers;
    const findRelBefore = result.current.findRelationship;
    const normalizeBefore = result.current.normalizeCrossTimelineBinding;

    // 多次重渲染
    rerender();
    rerender();
    rerender();

    // 该 hook 无 state，所有 useCallback 依赖为 []，引用应永久稳定
    expect(result.current.injectCrossTimelineBindings).toBe(injectBefore);
    expect(result.current.getInboundCrossTimelineBindings).toBe(getInboundBefore);
    expect(result.current.getOutboundCrossTimelineBindings).toBe(getOutboundBefore);
    expect(result.current.getBindingsBetweenTimelines).toBe(getBetweenBefore);
    expect(result.current.getTimelineRelationships).toBe(getRelationshipsBefore);
    expect(result.current.computeTimelineLayers).toBe(computeLayersBefore);
    expect(result.current.findRelationship).toBe(findRelBefore);
    expect(result.current.normalizeCrossTimelineBinding).toBe(normalizeBefore);
  });
});

// ─────────────────────────────────────────────────────────────
// 集成测试
// ─────────────────────────────────────────────────────────────

describe("useMultiTimeline — 集成测试", () => {
  it("完整流程：layers + relationships + inject", () => {
    const { result } = renderHook(() => useMultiTimeline());

    const timelines = [
      { id: "tl-reality" },
      { id: "tl-dream1", parentTimelineId: "tl-reality" },
      { id: "tl-dream2", parentTimelineId: "tl-dream1" },
    ];
    const relationships: TimelineRelationshipLike[] = [
      {
        fromTimelineId: "tl-dream1",
        toTimelineId: "tl-reality",
        type: "flashback",
        description: "第一层梦境",
      },
    ];
    const bindings: CrossTimelineBindingLike[] = [
      {
        id: "b-1",
        type: "foreshadow",
        sourceTimelineId: "tl-dream1",
        sourceNodeId: "d1-node-1",
        targetTimelineId: "tl-reality",
        targetNodeId: "real-node-1",
        injectionText: "梦境中的伏笔",
        importance: "critical",
        relationshipDescription: "梦境入口",
      },
    ];
    const multiView: MultiTimelineLike = {
      timelineIds: ["tl-reality", "tl-dream1", "tl-dream2"],
      relationships,
      crossTimelineBindings: bindings,
    };

    // 计算层级
    const layers = result.current.computeTimelineLayers(timelines);
    expect(layers.get("tl-reality")?.depth).toBe(0);
    expect(layers.get("tl-dream1")?.depth).toBe(1);

    // 查询关系
    const rels = result.current.getTimelineRelationships("tl-reality", multiView);
    expect(rels).toHaveLength(1);

    // 查询入站绑定
    const inbound = result.current.getInboundCrossTimelineBindings(
      "real-node-1",
      "tl-reality",
      multiView,
    );
    expect(inbound).toHaveLength(1);

    // 注入
    const injectResult = result.current.injectCrossTimelineBindings(
      "real-node-1",
      "tl-reality",
      multiView,
      "生成图片",
    );

    expect(injectResult.injectedBindings).toHaveLength(1);
    expect(injectResult.injectedPrompt).toContain("梦境中的伏笔");
    expect(injectResult.injectedPrompt).toContain("生成图片");
  });
});
