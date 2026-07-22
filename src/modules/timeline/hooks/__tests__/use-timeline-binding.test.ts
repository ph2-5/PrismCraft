/**
 * Q3-6 / Task 4.6.4 — useTimelineBinding React Hook 测试
 *
 * 测试覆盖：
 *   - 初始状态（默认 tokenBudget / 自定义 tokenBudget / setTokenBudget）
 *   - injectBindings：使用当前 tokenBudget 注入绑定
 *   - injectBindings：downstreamNodeIds 透传
 *   - getInjectableBindings：查询可注入绑定
 *   - getNodeBindings：inbound/outbound 查询
 *   - getDownstreamNodeIds：下游节点计算
 *   - normalizeBinding：规范化绑定
 *   - extractBindingsFromTimeline：从时间线提取绑定
 *   - stableActions：action 引用稳定性
 *
 * 注意：hooks 内部调用 shared-logic/timeline 的纯函数，不需要 mock 这些纯函数。
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimelineBinding } from "../use-timeline-binding";
import type {
  StoryTimelineLike,
  PlotNodeLike,
  TimelineBindingLike,
} from "@/shared-logic/timeline";
import type {
  BindingForInjection,
} from "@/shared-logic/timeline";

// ─────────────────────────────────────────────────────────────
// 测试工厂函数
// ─────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  order: number,
  overrides: Partial<PlotNodeLike> = {},
): PlotNodeLike {
  return {
    id,
    order,
    plotEventType: "narration",
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

function makeFullBinding(
  overrides: Partial<BindingForInjection> = {},
): BindingForInjection {
  return {
    id: "binding-1",
    type: "foreshadow",
    sourceNodeId: "node-1",
    targetNodeId: "node-3",
    injectionText: "【前情提要】第一章埋下的伏笔",
    importance: "important",
    propagation: {
      autoInject: true,
      injectToNodes: [],
      cascadeEffect: false,
    },
    aiDetected: true,
    userConfirmed: true,
    ...overrides,
  };
}

function makeMinimalBinding(
  overrides: Partial<TimelineBindingLike> = {},
): TimelineBindingLike {
  return {
    id: "binding-min",
    type: "callback",
    sourceNodeId: "node-1",
    targetNodeId: "node-2",
    injectionText: "【前情提要】回调早期事件",
    importance: "optional",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// 初始状态测试
// ─────────────────────────────────────────────────────────────

describe("useTimelineBinding — 初始状态", () => {
  it("默认 tokenBudget 应为 1500", () => {
    const { result } = renderHook(() => useTimelineBinding());

    expect(result.current.tokenBudget).toBe(1500);
  });

  it("应支持自定义初始 tokenBudget", () => {
    const { result } = renderHook(() =>
      useTimelineBinding({ tokenBudget: 2500 }),
    );

    expect(result.current.tokenBudget).toBe(2500);
  });

  it("options 为 undefined 时应使用默认 tokenBudget", () => {
    const { result } = renderHook(() => useTimelineBinding(undefined));

    expect(result.current.tokenBudget).toBe(1500);
  });

  it("setTokenBudget 应更新 tokenBudget", () => {
    const { result } = renderHook(() => useTimelineBinding());

    act(() => {
      result.current.setTokenBudget(3000);
    });

    expect(result.current.tokenBudget).toBe(3000);
  });
});

// ─────────────────────────────────────────────────────────────
// injectBindings 测试
// ─────────────────────────────────────────────────────────────

describe("useTimelineBinding — injectBindings", () => {
  it("空 bindings 应返回原始 Prompt", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const injectResult = result.current.injectBindings(
      "node-1",
      [],
      "原始 Prompt",
    );

    expect(injectResult.injectedPrompt).toBe("原始 Prompt");
    expect(injectResult.injectedBindings).toEqual([]);
  });

  it("应使用当前 tokenBudget 注入绑定", () => {
    const { result } = renderHook(() =>
      useTimelineBinding({ tokenBudget: 1000 }),
    );

    const binding = makeFullBinding({
      importance: "critical",
      injectionText: "重要伏笔",
    });

    const injectResult = result.current.injectBindings(
      "node-3",
      [binding],
      "Prompt",
    );

    expect(injectResult.injectedBindings).toHaveLength(1);
    expect(injectResult.tokenBudget.total).toBe(1000);
  });

  it("setTokenBudget 后注入应使用新预算", () => {
    const { result } = renderHook(() => useTimelineBinding());

    // 默认 1500
    let injectResult = result.current.injectBindings("node-1", [], "P");
    expect(injectResult.tokenBudget.total).toBe(1500);

    // 切换到 200
    act(() => {
      result.current.setTokenBudget(200);
    });

    injectResult = result.current.injectBindings("node-1", [], "P");
    expect(injectResult.tokenBudget.total).toBe(200);
  });

  it("应正确透传 downstreamNodeIds 选项", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const binding = makeFullBinding({
      targetNodeId: "node-3",
      importance: "critical",
      injectionText: "悬念揭示",
      propagation: { autoInject: true, injectToNodes: [], cascadeEffect: true },
    });

    const injectResult = result.current.injectBindings(
      "node-3",
      [binding],
      "Prompt",
      { downstreamNodeIds: ["node-4", "node-5"] },
    );

    expect(injectResult.hasCascadeEffect).toBe(true);
    expect(injectResult.cascadeAffectedNodeIds).toContain("node-4");
    expect(injectResult.cascadeAffectedNodeIds).toContain("node-5");
  });
});

// ─────────────────────────────────────────────────────────────
// 查询辅助测试
// ─────────────────────────────────────────────────────────────

describe("useTimelineBinding — getInjectableBindings", () => {
  it("应返回所有可注入的绑定（过滤后）", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const bindings: BindingForInjection[] = [
      makeFullBinding({ id: "b-1", targetNodeId: "node-target" }),
      makeFullBinding({ id: "b-2", targetNodeId: "node-other" }),
      makeFullBinding({
        id: "b-3",
        targetNodeId: "node-target",
        propagation: { autoInject: false, injectToNodes: [], cascadeEffect: false },
      }),
    ];

    const injectable = result.current.getInjectableBindings(
      "node-target",
      bindings,
    );

    expect(injectable).toHaveLength(1);
    expect(injectable[0]!.id).toBe("b-1");
  });
});

describe("useTimelineBinding — getNodeBindings", () => {
  it("应分别返回 inbound 和 outbound 绑定", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-in",
        sourceNodeId: "node-1",
        targetNodeId: "node-2",
      }),
      makeFullBinding({
        id: "b-out",
        sourceNodeId: "node-2",
        targetNodeId: "node-3",
      }),
    ];

    const { inbound, outbound } = result.current.getNodeBindings(
      "node-2",
      bindings,
    );

    expect(inbound).toHaveLength(1);
    expect(inbound[0]!.id).toBe("b-in");
    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.id).toBe("b-out");
  });
});

describe("useTimelineBinding — getDownstreamNodeIds", () => {
  it("应返回指定节点之后的所有节点 ID", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const timeline = makeTimeline([
      makeNode("node-1", 1),
      makeNode("node-2", 2),
      makeNode("node-3", 3),
      makeNode("node-4", 4),
    ]);

    const downstream = result.current.getDownstreamNodeIds("node-2", timeline);
    expect(downstream).toEqual(["node-3", "node-4"]);
  });

  it("末节点应返回空数组", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const timeline = makeTimeline([
      makeNode("node-1", 1),
      makeNode("node-2", 2),
    ]);

    const downstream = result.current.getDownstreamNodeIds("node-2", timeline);
    expect(downstream).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// normalizeBinding / extractBindingsFromTimeline 测试
// ─────────────────────────────────────────────────────────────

describe("useTimelineBinding — normalizeBinding", () => {
  it("最小形状应填充默认值", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const minimal = makeMinimalBinding();
    const normalized = result.current.normalizeBinding(minimal);

    expect(normalized.id).toBe("binding-min");
    expect(normalized.propagation.autoInject).toBe(true);
    expect(normalized.propagation.injectToNodes).toEqual([]);
    expect(normalized.propagation.cascadeEffect).toBe(false);
    expect(normalized.aiDetected).toBe(false);
    expect(normalized.userConfirmed).toBe(true);
  });

  it("完整形状应深拷贝 propagation", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const full = makeFullBinding({
      propagation: { autoInject: false, injectToNodes: ["x"], cascadeEffect: true },
    });
    const normalized = result.current.normalizeBinding(full);

    // 修改 normalized 不应影响原对象
    normalized.propagation.autoInject = true;
    expect(full.propagation.autoInject).toBe(false);
  });
});

describe("useTimelineBinding — extractBindingsFromTimeline", () => {
  it("应从时间线提取并规范化所有绑定", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const timeline = makeTimeline(
      [makeNode("node-1", 1)],
      [
        makeMinimalBinding({ id: "b-1" }),
        makeMinimalBinding({ id: "b-2", importance: "critical" }),
      ],
    );

    const extracted = result.current.extractBindingsFromTimeline(timeline);

    expect(extracted).toHaveLength(2);
    expect(extracted[0]!.id).toBe("b-1");
    expect(extracted[0]!.propagation.autoInject).toBe(true);
    expect(extracted[1]!.importance).toBe("critical");
  });

  it("空 bindings 应返回空数组", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const timeline = makeTimeline([makeNode("node-1", 1)], []);
    const extracted = result.current.extractBindingsFromTimeline(timeline);
    expect(extracted).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// stableActions 引用稳定性测试
// ─────────────────────────────────────────────────────────────

describe("useTimelineBinding — stableActions 引用稳定性", () => {
  it("无依赖的 action 引用应跨渲染保持稳定", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const getInjectableBefore = result.current.getInjectableBindings;
    const getNodeBindingsBefore = result.current.getNodeBindings;
    const getDownstreamBefore = result.current.getDownstreamNodeIds;
    const normalizeBefore = result.current.normalizeBinding;
    const extractBefore = result.current.extractBindingsFromTimeline;

    // 触发重渲染（通过 setTokenBudget）
    act(() => {
      result.current.setTokenBudget(2000);
    });

    // 无依赖的 action 引用应保持稳定
    expect(result.current.getInjectableBindings).toBe(getInjectableBefore);
    expect(result.current.getNodeBindings).toBe(getNodeBindingsBefore);
    expect(result.current.getDownstreamNodeIds).toBe(getDownstreamBefore);
    expect(result.current.normalizeBinding).toBe(normalizeBefore);
    expect(result.current.extractBindingsFromTimeline).toBe(extractBefore);
  });

  it("injectBindings 引用应在 tokenBudget 变化时更新", () => {
    const { result } = renderHook(() => useTimelineBinding());

    const injectBefore = result.current.injectBindings;

    act(() => {
      result.current.setTokenBudget(999);
    });

    // injectBindings 依赖 tokenBudget，所以引用应变化
    expect(result.current.injectBindings).not.toBe(injectBefore);
  });
});

// ─────────────────────────────────────────────────────────────
// 集成测试
// ─────────────────────────────────────────────────────────────

describe("useTimelineBinding — 集成测试", () => {
  it("完整流程：getDownstream + injectBindings", () => {
    const { result } = renderHook(() => useTimelineBinding({ tokenBudget: 500 }));

    const timeline = makeTimeline(
      [
        makeNode("node-1", 1),
        makeNode("node-2", 2),
        makeNode("node-3", 3),
        makeNode("node-4", 4),
      ],
      [
        makeMinimalBinding({
          id: "b-1",
          type: "foreshadow",
          sourceNodeId: "node-1",
          targetNodeId: "node-3",
          injectionText: "第1章伏笔",
          importance: "critical",
        }),
      ],
    );

    // 计算下游
    const downstream = result.current.getDownstreamNodeIds("node-3", timeline);
    expect(downstream).toEqual(["node-4"]);

    // 提取绑定
    const bindings = result.current.extractBindingsFromTimeline(timeline);
    expect(bindings).toHaveLength(1);

    // 注入
    const injectResult = result.current.injectBindings(
      "node-3",
      bindings,
      "生成图片",
      { downstreamNodeIds: downstream },
    );

    expect(injectResult.injectedBindings).toHaveLength(1);
    expect(injectResult.injectedPrompt).toContain("第1章伏笔");
    expect(injectResult.injectedPrompt).toContain("生成图片");
  });
});
