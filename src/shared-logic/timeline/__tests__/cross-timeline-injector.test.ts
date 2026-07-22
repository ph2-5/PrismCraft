/**
 * Q3-9 / Task 4.6.7 — 跨时间线绑定注入测试
 *
 * 测试覆盖：
 *   - injectCrossTimelineBindings 核心流程
 *     - 无绑定时返回原 Prompt
 *     - 目标时间线不匹配时跳过
 *     - 目标节点不匹配时跳过
 *     - autoInject=false 跳过（critical 例外）
 *     - 未确认跳过（critical 例外）
 *     - 空注入文本跳过
 *     - 无效时间线引用跳过
 *     - 去重（同源保留最高 importance）
 *     - 排序（critical → important → optional）
 *     - 完整注入流程
 *   - normalizeCrossTimelineBinding
 *   - buildCrossTimelineInjectionBlock
 *   - findRelationship
 *   - getInboundCrossTimelineBindings
 *   - getOutboundCrossTimelineBindings
 *   - getBindingsBetweenTimelines
 *   - getTimelineRelationships
 *   - computeTimelineLayers
 */

import { describe, it, expect } from "vitest";
import {
  injectCrossTimelineBindings,
  normalizeCrossTimelineBinding,
  buildCrossTimelineInjectionBlock,
  findRelationship,
  getInboundCrossTimelineBindings,
  getOutboundCrossTimelineBindings,
  getBindingsBetweenTimelines,
  getTimelineRelationships,
  computeTimelineLayers,
  type CrossTimelineBindingLike,
  type MultiTimelineLike,
  type TimelineRelationshipLike,
} from "../cross-timeline-injector";

// ─────────────────────────────────────────────────────────────
// 测试工厂
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

describe("injectCrossTimelineBindings", () => {
  it("无绑定时应返回原 Prompt", () => {
    const multiView = makeMultiView();
    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "基础 Prompt",
    );

    expect(result.injectedBindings).toEqual([]);
    expect(result.skippedBindings).toEqual([]);
    expect(result.injectionBlock).toBe("");
    expect(result.injectedPrompt).toBe("基础 Prompt");
  });

  it("目标时间线不匹配应跳过", () => {
    const binding = makeBinding({ targetTimelineId: "tl-other" });
    const multiView = makeMultiView([binding]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(0);
    expect(result.skippedBindings).toHaveLength(1);
    expect(result.skippedBindings[0]!.reason).toBe("timeline_mismatch");
  });

  it("目标节点不匹配应跳过", () => {
    const binding = makeBinding({ targetNodeId: "other-node" });
    const multiView = makeMultiView([binding]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(0);
    expect(result.skippedBindings).toHaveLength(1);
    expect(result.skippedBindings[0]!.reason).toBe("node_mismatch");
  });

  it("autoInject=false 且非 critical 应跳过", () => {
    const binding = makeBinding({
      importance: "important",
      autoInject: false,
      userConfirmed: true,
    });
    const multiView = makeMultiView([binding]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(0);
    expect(result.skippedBindings[0]!.reason).toBe("auto_inject_disabled");
  });

  it("autoInject=false 但 critical 应注入", () => {
    const binding = makeBinding({
      importance: "critical",
      autoInject: false,
    });
    const multiView = makeMultiView([binding]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(1);
  });

  it("未确认且非 critical 应跳过", () => {
    const binding = makeBinding({
      importance: "important",
      userConfirmed: false,
    });
    const multiView = makeMultiView([binding]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(0);
    expect(result.skippedBindings[0]!.reason).toBe("not_confirmed");
  });

  it("未确认但 critical 应注入", () => {
    const binding = makeBinding({
      importance: "critical",
      userConfirmed: false,
    });
    const multiView = makeMultiView([binding]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(1);
  });

  it("空注入文本应跳过", () => {
    const binding = makeBinding({ injectionText: "   " });
    const multiView = makeMultiView([binding]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(0);
    expect(result.skippedBindings[0]!.reason).toBe("empty_injection_text");
  });

  it("无效时间线引用应跳过", () => {
    const binding = makeBinding({
      sourceTimelineId: "tl-nonexistent",
    });
    const multiView = makeMultiView([binding]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(0);
    expect(result.skippedBindings[0]!.reason).toBe("invalid_timeline_ref");
  });

  it("同源去重应保留最高 importance", () => {
    const bOptional = makeBinding({
      id: "b-opt",
      importance: "optional",
      userConfirmed: true,
    });
    const bCritical = makeBinding({
      id: "b-crit",
      importance: "critical",
    });
    const multiView = makeMultiView([bOptional, bCritical]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(1);
    expect(result.injectedBindings[0]!.id).toBe("b-crit");
    // b-opt 应被标记为 duplicate
    const duplicateSkip = result.skippedBindings.find(
      (s) => s.reason === "duplicate",
    );
    expect(duplicateSkip).toBeDefined();
    expect(duplicateSkip!.binding.id).toBe("b-opt");
  });

  it("应按 importance 排序（critical → important → optional）", () => {
    const bOptional = makeBinding({
      id: "b-opt",
      sourceNodeId: "fb-node-2",
      importance: "optional",
      userConfirmed: true,
    });
    const bImportant = makeBinding({
      id: "b-imp",
      sourceNodeId: "fb-node-3",
      importance: "important",
      userConfirmed: true,
    });
    const bCritical = makeBinding({
      id: "b-crit",
      sourceNodeId: "fb-node-1",
      importance: "critical",
    });
    const multiView = makeMultiView([bOptional, bImportant, bCritical]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "Prompt",
    );

    expect(result.injectedBindings).toHaveLength(3);
    expect(result.injectedBindings[0]!.id).toBe("b-crit");
    expect(result.injectedBindings[1]!.id).toBe("b-imp");
    expect(result.injectedBindings[2]!.id).toBe("b-opt");
  });

  it("完整注入流程应正确构造注入块", () => {
    const binding = makeBinding({
      type: "callback",
      importance: "critical",
      injectionText: "柯布回忆中的梅尔",
      relationshipDescription: "柯布的潜意识投射",
    });
    const rel = makeRelationship({
      type: "flashback",
      description: "柯布的回忆",
    });
    const multiView = makeMultiView([binding], [rel]);

    const result = injectCrossTimelineBindings(
      "main-node-1",
      "tl-main",
      multiView,
      "生成图片",
    );

    expect(result.injectedBindings).toHaveLength(1);
    expect(result.injectionBlock).toContain("【跨时间线前情提要 - 自动注入】");
    expect(result.injectionBlock).toContain("[呼应]");
    expect(result.injectionBlock).toContain("tl-flashback");
    expect(result.injectionBlock).toContain("回忆：柯布的回忆");
    expect(result.injectionBlock).toContain("柯布回忆中的梅尔");
    expect(result.injectedPrompt).toContain("生成图片");
    expect(result.injectedPrompt).toContain("【跨时间线前情提要");
  });
});

// ─────────────────────────────────────────────────────────────
// normalizeCrossTimelineBinding 测试
// ─────────────────────────────────────────────────────────────

describe("normalizeCrossTimelineBinding", () => {
  it("应填充默认值", () => {
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
    const result = normalizeCrossTimelineBinding(raw);
    expect(result.autoInject).toBe(true);
    expect(result.cascadeEffect).toBe(false);
    expect(result.aiDetected).toBe(false);
    expect(result.userConfirmed).toBe(false);
  });

  it("应保留已设置的值", () => {
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
    const result = normalizeCrossTimelineBinding(raw);
    expect(result.autoInject).toBe(false);
    expect(result.cascadeEffect).toBe(true);
    expect(result.aiDetected).toBe(true);
    expect(result.userConfirmed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// buildCrossTimelineInjectionBlock 测试
// ─────────────────────────────────────────────────────────────

describe("buildCrossTimelineInjectionBlock", () => {
  it("空绑定应返回空字符串", () => {
    expect(buildCrossTimelineInjectionBlock([], [])).toBe("");
  });

  it("应包含类型标签和时间线 ID", () => {
    const binding = makeBinding({ type: "parallel" });
    const result = buildCrossTimelineInjectionBlock([binding], []);
    expect(result).toContain("【跨时间线前情提要");
    expect(result).toContain("[并行对照]");
    expect(result).toContain("tl-flashback");
  });

  it("应包含关系描述（若存在）", () => {
    const binding = makeBinding({ relationshipDescription: "梦境入口" });
    const rel = makeRelationship({ type: "flashback", description: "第一层梦境" });
    const result = buildCrossTimelineInjectionBlock([binding], [rel]);
    expect(result).toContain("回忆：第一层梦境");
    expect(result).toContain("梦境入口");
  });

  it("无关系时应显示时间线 ID 箭头", () => {
    const binding = makeBinding();
    const result = buildCrossTimelineInjectionBlock([binding], []);
    expect(result).toContain("tl-flashback → tl-main");
  });
});

// ─────────────────────────────────────────────────────────────
// findRelationship 测试
// ─────────────────────────────────────────────────────────────

describe("findRelationship", () => {
  it("应找到匹配的关系", () => {
    const rel = makeRelationship();
    const result = findRelationship(
      [rel],
      "tl-flashback",
      "tl-main",
    );
    expect(result).toBe(rel);
  });

  it("未找到应返回 undefined", () => {
    const result = findRelationship([], "tl-a", "tl-b");
    expect(result).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// getInboundCrossTimelineBindings 测试
// ─────────────────────────────────────────────────────────────

describe("getInboundCrossTimelineBindings", () => {
  it("应返回目标为指定节点的绑定", () => {
    const b1 = makeBinding({ id: "b1", targetNodeId: "n1" });
    const b2 = makeBinding({ id: "b2", targetNodeId: "n2" });
    const multiView = makeMultiView([b1, b2]);

    const result = getInboundCrossTimelineBindings("n1", "tl-main", multiView);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b1");
  });
});

// ─────────────────────────────────────────────────────────────
// getOutboundCrossTimelineBindings 测试
// ─────────────────────────────────────────────────────────────

describe("getOutboundCrossTimelineBindings", () => {
  it("应返回源为指定节点的绑定", () => {
    const b1 = makeBinding({ id: "b1", sourceNodeId: "n1" });
    const b2 = makeBinding({ id: "b2", sourceNodeId: "n2" });
    const multiView = makeMultiView([b1, b2]);

    const result = getOutboundCrossTimelineBindings(
      "n1",
      "tl-flashback",
      multiView,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b1");
  });
});

// ─────────────────────────────────────────────────────────────
// getBindingsBetweenTimelines 测试
// ─────────────────────────────────────────────────────────────

describe("getBindingsBetweenTimelines", () => {
  it("应返回两个时间线之间的绑定", () => {
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
    const multiView = makeMultiView([b1, b2], [], [
      "tl-a",
      "tl-b",
      "tl-c",
    ]);

    const result = getBindingsBetweenTimelines("tl-a", "tl-b", multiView);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b1");
  });
});

// ─────────────────────────────────────────────────────────────
// getTimelineRelationships 测试
// ─────────────────────────────────────────────────────────────

describe("getTimelineRelationships", () => {
  it("应返回涉及指定时间线的所有关系", () => {
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

    const result = getTimelineRelationships("tl-a", multiView);
    expect(result).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────
// computeTimelineLayers 测试
// ─────────────────────────────────────────────────────────────

describe("computeTimelineLayers", () => {
  it("应正确计算主线深度为 0", () => {
    const timelines = [{ id: "tl-main" }];
    const result = computeTimelineLayers(timelines);
    expect(result.get("tl-main")?.depth).toBe(0);
    expect(result.get("tl-main")?.parentTimelineId).toBeUndefined();
  });

  it("应正确计算子时间线深度", () => {
    const timelines = [
      { id: "tl-main" },
      { id: "tl-dream1", parentTimelineId: "tl-main" },
      { id: "tl-dream2", parentTimelineId: "tl-dream1" },
    ];
    const result = computeTimelineLayers(timelines);
    expect(result.get("tl-main")?.depth).toBe(0);
    expect(result.get("tl-dream1")?.depth).toBe(1);
    expect(result.get("tl-dream2")?.depth).toBe(2);
  });

  it("应正确填充 childTimelineIds", () => {
    const timelines = [
      { id: "tl-main" },
      { id: "tl-a", parentTimelineId: "tl-main" },
      { id: "tl-b", parentTimelineId: "tl-main" },
    ];
    const result = computeTimelineLayers(timelines);
    const main = result.get("tl-main");
    expect(main?.childTimelineIds).toEqual(
      expect.arrayContaining(["tl-a", "tl-b"]),
    );
  });

  it("孤立时间线（parent 不在列表中）应深度为 0", () => {
    const timelines = [{ id: "tl-orphan", parentTimelineId: "tl-missing" }];
    const result = computeTimelineLayers(timelines);
    expect(result.get("tl-orphan")?.depth).toBe(0);
    expect(result.get("tl-orphan")?.parentTimelineId).toBe("tl-missing");
  });

  it("《盗梦空间》式多层嵌套应正确计算", () => {
    const timelines = [
      { id: "tl-reality" },
      { id: "tl-dream1", parentTimelineId: "tl-reality" },
      { id: "tl-dream2", parentTimelineId: "tl-dream1" },
      { id: "tl-dream3", parentTimelineId: "tl-dream2" },
      { id: "tl-flashback", parentTimelineId: "tl-reality" },
    ];
    const result = computeTimelineLayers(timelines);
    expect(result.get("tl-reality")?.depth).toBe(0);
    expect(result.get("tl-dream1")?.depth).toBe(1);
    expect(result.get("tl-dream2")?.depth).toBe(2);
    expect(result.get("tl-dream3")?.depth).toBe(3);
    expect(result.get("tl-flashback")?.depth).toBe(1);
    expect(result.get("tl-reality")?.childTimelineIds).toEqual(
      expect.arrayContaining(["tl-dream1", "tl-flashback"]),
    );
    expect(result.get("tl-dream1")?.childTimelineIds).toEqual(["tl-dream2"]);
  });
});
