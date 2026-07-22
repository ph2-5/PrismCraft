/**
 * Q3-6 / Task 4.6.4 — TimelineBinding 注入层测试
 *
 * 测试覆盖：
 *   - normalizeBinding 规范化（最小形状 → 完整形状）
 *   - estimateTokenCount token 估算（中英文混合）
 *   - injectBindings 核心注入流程
 *     - 10 种绑定类型注入
 *     - importance 排序（critical > important > optional）
 *     - token 预算控制（critical 始终注入，important/optional 超预算跳过）
 *     - 过滤逻辑（target_mismatch / auto_inject_disabled / not_confirmed / empty_injection_text / duplicate）
 *     - 注入块构造（"【前情提要 - 自动注入】"格式）
 *     - cascadeEffect 级联影响节点计算
 *   - buildInjectionBlock 块构造
 *   - computeCascadeAffectedNodeIds 级联节点
 *   - 查询辅助：getInjectableBindings / getNodeBindings / getDownstreamNodeIds / extractBindingsFromTimeline
 */

import { describe, it, expect } from "vitest";
import {
  normalizeBinding,
  estimateTokenCount,
  injectBindings,
  buildInjectionBlock,
  computeCascadeAffectedNodeIds,
  getInjectableBindings,
  getNodeBindings,
  getDownstreamNodeIds,
  extractBindingsFromTimeline,
} from "../binding-injector";
import type {
  BindingForInjection,
  InjectedBindingInfo,
  TimelineBindingLike,
} from "../binding-injector";
import type { StoryTimelineLike, PlotNodeLike } from "../snapshot-types";

// ─────────────────────────────────────────────────────────────
// 测试工厂函数
// ─────────────────────────────────────────────────────────────

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
  return {
    id: "tl-test",
    nodes,
    bindings,
  };
}

// ─────────────────────────────────────────────────────────────
// normalizeBinding 测试
// ─────────────────────────────────────────────────────────────

describe("normalizeBinding", () => {
  it("完整形状应原样规范化（深拷贝 propagation）", () => {
    const original = makeFullBinding({
      propagation: { autoInject: false, injectToNodes: ["node-x"], cascadeEffect: true },
    });
    const normalized = normalizeBinding(original);

    expect(normalized.id).toBe("binding-1");
    expect(normalized.type).toBe("foreshadow");
    expect(normalized.importance).toBe("important");
    expect(normalized.propagation.autoInject).toBe(false);
    expect(normalized.propagation.injectToNodes).toEqual(["node-x"]);
    expect(normalized.propagation.cascadeEffect).toBe(true);
    expect(normalized.aiDetected).toBe(true);
    expect(normalized.userConfirmed).toBe(true);

    // 深拷贝：修改 normalized 不应影响原对象
    normalized.propagation.autoInject = true;
    expect(original.propagation.autoInject).toBe(false);
  });

  it("最小形状应填充默认值", () => {
    const minimal = makeMinimalBinding();
    const normalized = normalizeBinding(minimal);

    expect(normalized.id).toBe("binding-min");
    expect(normalized.type).toBe("callback");
    expect(normalized.injectionText).toBe("【前情提要】回调早期事件");
    expect(normalized.importance).toBe("optional");
    // 默认 propagation
    expect(normalized.propagation.autoInject).toBe(true);
    expect(normalized.propagation.injectToNodes).toEqual([]);
    expect(normalized.propagation.cascadeEffect).toBe(false);
    // 默认元数据
    expect(normalized.aiDetected).toBe(false);
    expect(normalized.userConfirmed).toBe(true);
  });

  it("缺失 injectionText 应填充空字符串", () => {
    const minimal = makeMinimalBinding({ injectionText: undefined });
    const normalized = normalizeBinding(minimal);
    expect(normalized.injectionText).toBe("");
  });

  it("缺失 importance 应填充 important", () => {
    const minimal = makeMinimalBinding({ importance: undefined });
    const normalized = normalizeBinding(minimal);
    expect(normalized.importance).toBe("important");
  });

  it("完整形状缺失可选字段应填充默认值", () => {
    const partial: BindingForInjection = {
      id: "b-partial",
      type: "irony",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      injectionText: "test",
      importance: "important",
      propagation: {
        autoInject: true,
        injectToNodes: [],
        cascadeEffect: false,
      },
      // aiDetected / userConfirmed 缺失
    };
    const normalized = normalizeBinding(partial);
    expect(normalized.aiDetected).toBe(false);
    expect(normalized.userConfirmed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// estimateTokenCount 测试
// ─────────────────────────────────────────────────────────────

describe("estimateTokenCount", () => {
  it("空字符串应返回 0", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("纯中文应按字数估算（1 字 ≈ 1 token）", () => {
    const text = "前情提要"; // 4 个中文字符
    expect(estimateTokenCount(text)).toBe(4);
  });

  it("纯英文应按字符估算（约 4 char = 1 token）", () => {
    const text = "hello world"; // 10 个字母 + 1 空格
    // 10 * 0.25 = 2.5 → ceil(2.5) = 3
    expect(estimateTokenCount(text)).toBe(3);
  });

  it("中英文混合应分别估算", () => {
    const text = "伏笔 foreshadow"; // 2 中文 + 11 英文 + 1 空格
    // 2 * 1 + 11 * 0.25 = 2 + 2.75 = 4.75 → ceil = 5
    expect(estimateTokenCount(text)).toBe(5);
  });

  it("标点应按 0.3 token 估算", () => {
    const text = "【】"; // 2 个标点
    // 2 * 0.3 = 0.6 → ceil = 1
    expect(estimateTokenCount(text)).toBe(1);
  });

  it("空白应被忽略", () => {
    expect(estimateTokenCount("   ")).toBe(0);
    expect(estimateTokenCount("\t\n")).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// injectBindings 核心测试
// ─────────────────────────────────────────────────────────────

describe("injectBindings — 核心注入流程", () => {
  it("空 bindings 应返回原始 Prompt，无注入块", () => {
    const result = injectBindings("node-1", [], "原始 Prompt");

    expect(result.nodeId).toBe("node-1");
    expect(result.basePrompt).toBe("原始 Prompt");
    expect(result.injectedPrompt).toBe("原始 Prompt");
    expect(result.injectedBindings).toEqual([]);
    expect(result.skippedBindings).toEqual([]);
    expect(result.injectionBlock).toBe("");
    expect(result.hasCascadeEffect).toBe(false);
    expect(result.cascadeAffectedNodeIds).toEqual(["node-1"]);
  });

  it("10 种绑定类型都应正确注入", () => {
    const bindingTypes = [
      "foreshadow",
      "cause_effect",
      "character_arc",
      "scene_continuity",
      "emotional_buildup",
      "mystery_reveal",
      "parallel",
      "callback",
      "irony",
      "user_manual",
    ] as const;

    const bindings: BindingForInjection[] = bindingTypes.map((type, i) =>
      makeFullBinding({
        id: `b-${type}`,
        type,
        sourceNodeId: `node-src-${i}`,
        targetNodeId: "node-target",
        injectionText: `【${type}】绑定 ${i}`,
        importance: "important",
      }),
    );

    const result = injectBindings("node-target", bindings, "基础 Prompt");

    expect(result.injectedBindings).toHaveLength(10);
    expect(result.skippedBindings).toEqual([]);
    // 每种类型都应出现
    const injectedTypes = result.injectedBindings.map((b) => b.type);
    for (const t of bindingTypes) {
      expect(injectedTypes).toContain(t);
    }
  });

  it("importance 排序：critical > important > optional", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-optional",
        type: "parallel",
        sourceNodeId: "node-src-opt",
        targetNodeId: "node-target",
        injectionText: "optional 绑定",
        importance: "optional",
      }),
      makeFullBinding({
        id: "b-critical",
        type: "mystery_reveal",
        sourceNodeId: "node-src-crit",
        targetNodeId: "node-target",
        injectionText: "critical 绑定",
        importance: "critical",
      }),
      makeFullBinding({
        id: "b-important",
        type: "character_arc",
        sourceNodeId: "node-src-imp",
        targetNodeId: "node-target",
        injectionText: "important 绑定",
        importance: "important",
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt");

    // 注入顺序应为 critical → important → optional
    expect(result.injectedBindings).toHaveLength(3);
    expect(result.injectedBindings[0]!.importance).toBe("critical");
    expect(result.injectedBindings[1]!.importance).toBe("important");
    expect(result.injectedBindings[2]!.importance).toBe("optional");
  });

  it("注入块应包含【前情提要 - 自动注入】标题和 importance 标签", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        type: "foreshadow",
        sourceNodeId: "node-src-1",
        targetNodeId: "node-target",
        injectionText: "伏笔揭示内容",
        importance: "critical",
      }),
    ];

    const result = injectBindings("node-target", bindings, "基础");

    expect(result.injectionBlock).toContain("【前情提要 - 自动注入】");
    expect(result.injectionBlock).toContain("[critical]");
    expect(result.injectionBlock).toContain("伏笔揭示内容");
  });

  it("injectedPrompt 应为 basePrompt + 注入块", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        type: "foreshadow",
        sourceNodeId: "node-src",
        targetNodeId: "node-target",
        injectionText: "测试注入",
        importance: "critical",
      }),
    ];

    const result = injectBindings("node-target", bindings, "基础 Prompt");

    expect(result.injectedPrompt).toBe(`${result.basePrompt}\n\n${result.injectionBlock}`);
    expect(result.injectedPrompt).toContain("基础 Prompt");
    expect(result.injectedPrompt).toContain("测试注入");
  });
});

// ─────────────────────────────────────────────────────────────
// injectBindings 过滤逻辑测试
// ─────────────────────────────────────────────────────────────

describe("injectBindings — 过滤逻辑", () => {
  it("target_mismatch：targetNodeId 不匹配且不在 injectToNodes 中应跳过", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        targetNodeId: "node-other", // 不匹配
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: false },
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt");

    expect(result.injectedBindings).toEqual([]);
    expect(result.skippedBindings).toHaveLength(1);
    expect(result.skippedBindings[0]!.reason).toBe("target_mismatch");
  });

  it("injectToNodes 包含 nodeId 时应注入", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        targetNodeId: "node-other", // 主 target 不匹配
        propagation: {
          autoInject: true,
          injectToNodes: ["node-target"], // 但 injectToNodes 包含
          cascadeEffect: false,
        },
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt");

    expect(result.injectedBindings).toHaveLength(1);
    expect(result.skippedBindings).toEqual([]);
  });

  it("auto_inject_disabled：autoInject=false 应跳过", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        targetNodeId: "node-target",
        propagation: { autoInject: false, injectToNodes: [], cascadeEffect: false },
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt");

    expect(result.injectedBindings).toEqual([]);
    expect(result.skippedBindings).toHaveLength(1);
    expect(result.skippedBindings[0]!.reason).toBe("auto_inject_disabled");
  });

  it("not_confirmed：userConfirmed=false 应跳过", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        targetNodeId: "node-target",
        userConfirmed: false,
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt");

    expect(result.injectedBindings).toEqual([]);
    expect(result.skippedBindings).toHaveLength(1);
    expect(result.skippedBindings[0]!.reason).toBe("not_confirmed");
  });

  it("empty_injection_text：空文本应跳过", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        targetNodeId: "node-target",
        injectionText: "",
      }),
      makeFullBinding({
        id: "b-2",
        targetNodeId: "node-target",
        injectionText: "   ", // 仅空白
        sourceNodeId: "node-src-2",
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt");

    expect(result.injectedBindings).toEqual([]);
    expect(result.skippedBindings).toHaveLength(2);
    expect(result.skippedBindings[0]!.reason).toBe("empty_injection_text");
    expect(result.skippedBindings[1]!.reason).toBe("empty_injection_text");
  });

  it("duplicate：同一 sourceNodeId 仅保留最高 importance", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-optional",
        sourceNodeId: "node-src-same",
        targetNodeId: "node-target",
        importance: "optional",
        injectionText: "optional 版本",
      }),
      makeFullBinding({
        id: "b-critical",
        sourceNodeId: "node-src-same", // 相同 source
        targetNodeId: "node-target",
        importance: "critical",
        injectionText: "critical 版本",
      }),
      makeFullBinding({
        id: "b-important",
        sourceNodeId: "node-src-same", // 相同 source
        targetNodeId: "node-target",
        importance: "important",
        injectionText: "important 版本",
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt");

    // 仅保留 critical（最高优先级）
    expect(result.injectedBindings).toHaveLength(1);
    expect(result.injectedBindings[0]!.bindingId).toBe("b-critical");
    // 另外两个被标记为 duplicate
    const duplicates = result.skippedBindings.filter((s) => s.reason === "duplicate");
    expect(duplicates).toHaveLength(2);
    // 被跳过的两个不应是 critical
    const duplicateIds = duplicates.map((d) => d.bindingId);
    expect(duplicateIds).toContain("b-optional");
    expect(duplicateIds).toContain("b-important");
  });
});

// ─────────────────────────────────────────────────────────────
// injectBindings token 预算测试
// ─────────────────────────────────────────────────────────────

describe("injectBindings — token 预算控制", () => {
  it("critical 即使超预算也应注入", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-critical",
        sourceNodeId: "node-src",
        targetNodeId: "node-target",
        importance: "critical",
        injectionText: "这是一个非常长的 critical 绑定文本".repeat(50),
      }),
    ];

    // 预算仅 10 token
    const result = injectBindings("node-target", bindings, "Prompt", {
      tokenBudget: 10,
    });

    expect(result.injectedBindings).toHaveLength(1);
    expect(result.injectedBindings[0]!.importance).toBe("critical");
    // used 可能超过 total（critical 不受预算限制）
    expect(result.tokenBudget.used).toBeGreaterThan(result.tokenBudget.total);
  });

  it("important 超预算应跳过", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-important",
        sourceNodeId: "node-src",
        targetNodeId: "node-target",
        importance: "important",
        injectionText: "重要绑定内容".repeat(20),
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt", {
      tokenBudget: 10,
    });

    expect(result.injectedBindings).toEqual([]);
    expect(result.skippedBindings).toHaveLength(1);
    expect(result.skippedBindings[0]!.reason).toBe("token_budget_exceeded");
  });

  it("optional 超预算应跳过", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-optional",
        sourceNodeId: "node-src",
        targetNodeId: "node-target",
        importance: "optional",
        injectionText: "可选绑定内容".repeat(20),
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt", {
      tokenBudget: 10,
    });

    expect(result.injectedBindings).toEqual([]);
    expect(result.skippedBindings).toHaveLength(1);
    expect(result.skippedBindings[0]!.reason).toBe("token_budget_exceeded");
  });

  it("混合优先级：critical 注入，important/optional 超预算跳过", () => {
    const longText = "绑定文本".repeat(30);
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-crit",
        sourceNodeId: "src-1",
        targetNodeId: "node-target",
        importance: "critical",
        injectionText: longText,
      }),
      makeFullBinding({
        id: "b-imp",
        sourceNodeId: "src-2",
        targetNodeId: "node-target",
        importance: "important",
        injectionText: longText,
      }),
      makeFullBinding({
        id: "b-opt",
        sourceNodeId: "src-3",
        targetNodeId: "node-target",
        importance: "optional",
        injectionText: longText,
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt", {
      tokenBudget: 50,
    });

    // 仅 critical 注入
    expect(result.injectedBindings).toHaveLength(1);
    expect(result.injectedBindings[0]!.bindingId).toBe("b-crit");
    // important 和 optional 被跳过
    const budgetSkipped = result.skippedBindings.filter(
      (s) => s.reason === "token_budget_exceeded",
    );
    expect(budgetSkipped).toHaveLength(2);
  });

  it("tokenBudget.used 应包含 header token", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        sourceNodeId: "src-1",
        targetNodeId: "node-target",
        importance: "critical",
        injectionText: "测试",
      }),
    ];

    const result = injectBindings("node-target", bindings, "Prompt", {
      tokenBudget: 1000,
    });

    // used = bindingTokens(2) + headerTokens(【前情提要 - 自动注入】≈ 13)
    expect(result.tokenBudget.used).toBeGreaterThan(2);
    expect(result.tokenBudget.remaining).toBe(
      1000 - result.tokenBudget.used,
    );
  });

  it("默认 token 预算应为 1500", () => {
    const result = injectBindings("node-1", [], "Prompt");
    expect(result.tokenBudget.total).toBe(1500);
  });
});

// ─────────────────────────────────────────────────────────────
// injectBindings 级联效应测试
// ─────────────────────────────────────────────────────────────

describe("injectBindings — 级联效应", () => {
  it("无 cascadeEffect 时 hasCascadeEffect=false，仅含自身节点", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-3",
        importance: "critical",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: false },
      }),
    ];

    const result = injectBindings("node-3", bindings, "Prompt", {
      downstreamNodeIds: ["node-4", "node-5"],
    });

    expect(result.hasCascadeEffect).toBe(false);
    expect(result.cascadeAffectedNodeIds).toEqual(["node-3"]);
  });

  it("cascadeEffect=true 且 target 是当前节点时，下游都受影响", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-3", // = 当前 nodeId
        importance: "critical",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: true },
      }),
    ];

    const result = injectBindings("node-3", bindings, "Prompt", {
      downstreamNodeIds: ["node-4", "node-5", "node-6"],
    });

    expect(result.hasCascadeEffect).toBe(true);
    expect(result.cascadeAffectedNodeIds).toContain("node-3");
    expect(result.cascadeAffectedNodeIds).toContain("node-4");
    expect(result.cascadeAffectedNodeIds).toContain("node-5");
    expect(result.cascadeAffectedNodeIds).toContain("node-6");
    expect(result.cascadeAffectedNodeIds).toHaveLength(4);
  });

  it("cascadeEffect=true 但 target 是下游节点时，该 target 及其之后节点受影响", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-4", // 下游节点
        importance: "critical",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: true },
      }),
    ];

    // 当前节点是 node-3，但 binding 的 target 是 node-4
    // 注：此 binding 不会注入到 node-3（target 不匹配）
    // 需用 injectToNodes 让它注入到 node-3
    bindings[0]!.propagation.injectToNodes = ["node-3"];

    const result = injectBindings("node-3", bindings, "Prompt", {
      downstreamNodeIds: ["node-4", "node-5", "node-6"],
    });

    expect(result.injectedBindings).toHaveLength(1);
    expect(result.hasCascadeEffect).toBe(true);
    expect(result.cascadeAffectedNodeIds).toContain("node-3");
    expect(result.cascadeAffectedNodeIds).toContain("node-4");
    expect(result.cascadeAffectedNodeIds).toContain("node-5");
    expect(result.cascadeAffectedNodeIds).toContain("node-6");
  });

  it("无 downstreamNodeIds 时仅返回自身节点", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-3",
        importance: "critical",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: true },
      }),
    ];

    const result = injectBindings("node-3", bindings, "Prompt");

    expect(result.hasCascadeEffect).toBe(false);
    expect(result.cascadeAffectedNodeIds).toEqual(["node-3"]);
  });
});

// ─────────────────────────────────────────────────────────────
// buildInjectionBlock 测试
// ─────────────────────────────────────────────────────────────

describe("buildInjectionBlock", () => {
  it("空列表应返回空字符串", () => {
    expect(buildInjectionBlock([])).toBe("");
  });

  it("单个绑定应正确构造块", () => {
    const bindings: InjectedBindingInfo[] = [
      {
        bindingId: "b-1",
        type: "foreshadow",
        sourceNodeId: "node-1",
        importance: "critical",
        injectionText: "伏笔揭示",
        tokenCost: 4,
      },
    ];

    const block = buildInjectionBlock(bindings);
    expect(block).toContain("【前情提要 - 自动注入】");
    expect(block).toContain("- [critical] 伏笔揭示");
  });

  it("多个绑定应每行一个", () => {
    const bindings: InjectedBindingInfo[] = [
      {
        bindingId: "b-1",
        type: "foreshadow",
        sourceNodeId: "node-1",
        importance: "critical",
        injectionText: "伏笔",
        tokenCost: 2,
      },
      {
        bindingId: "b-2",
        type: "callback",
        sourceNodeId: "node-2",
        importance: "optional",
        injectionText: "回调",
        tokenCost: 2,
      },
    ];

    const block = buildInjectionBlock(bindings);
    const lines = block.split("\n");
    expect(lines).toHaveLength(3); // header + 2 bindings
    expect(lines[0]).toBe("【前情提要 - 自动注入】");
    expect(lines[1]).toBe("- [critical] 伏笔");
    expect(lines[2]).toBe("- [optional] 回调");
  });
});

// ─────────────────────────────────────────────────────────────
// computeCascadeAffectedNodeIds 测试
// ─────────────────────────────────────────────────────────────

describe("computeCascadeAffectedNodeIds", () => {
  it("无级联绑定时仅返回自身节点", () => {
    const allBindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: false },
      }),
    ];

    const result = computeCascadeAffectedNodeIds(
      "node-3",
      ["b-1"],
      allBindings,
      ["node-4", "node-5"],
    );

    expect(result).toEqual(["node-3"]);
  });

  it("级联绑定 target=当前节点时应包含所有下游", () => {
    const allBindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        targetNodeId: "node-3",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: true },
      }),
    ];

    const result = computeCascadeAffectedNodeIds(
      "node-3",
      ["b-1"],
      allBindings,
      ["node-4", "node-5"],
    );

    expect(result).toContain("node-3");
    expect(result).toContain("node-4");
    expect(result).toContain("node-5");
    expect(result).toHaveLength(3);
  });

  it("多个级联绑定应合并影响节点", () => {
    const allBindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        targetNodeId: "node-3",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: true },
      }),
      makeFullBinding({
        id: "b-2",
        targetNodeId: "node-4",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: true },
      }),
    ];

    const result = computeCascadeAffectedNodeIds(
      "node-3",
      ["b-1", "b-2"],
      allBindings,
      ["node-4", "node-5"],
    );

    expect(result).toContain("node-3");
    expect(result).toContain("node-4");
    expect(result).toContain("node-5");
    // 去重后应为 3 个
    expect(new Set(result).size).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// 查询辅助函数测试
// ─────────────────────────────────────────────────────────────

describe("getInjectableBindings", () => {
  it("应返回所有可注入的绑定（过滤后）", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-1",
        targetNodeId: "node-target",
        importance: "critical",
      }),
      makeFullBinding({
        id: "b-2",
        targetNodeId: "node-other", // 不匹配
      }),
      makeFullBinding({
        id: "b-3",
        targetNodeId: "node-target",
        propagation: { autoInject: false, injectToNodes: [], cascadeEffect: false },
      }),
      makeFullBinding({
        id: "b-4",
        targetNodeId: "node-target",
        injectionText: "",
      }),
      makeFullBinding({
        id: "b-5",
        targetNodeId: "node-target",
        userConfirmed: false,
      }),
    ];

    const result = getInjectableBindings("node-target", bindings);

    // 仅 b-1 满足所有条件
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b-1");
  });
});

describe("getNodeBindings", () => {
  it("应分别返回 inbound 和 outbound 绑定", () => {
    const bindings: BindingForInjection[] = [
      makeFullBinding({
        id: "b-in-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-2", // inbound to node-2
      }),
      makeFullBinding({
        id: "b-out-1",
        sourceNodeId: "node-2", // outbound from node-2
        targetNodeId: "node-3",
      }),
      makeFullBinding({
        id: "b-in-2",
        sourceNodeId: "node-4",
        targetNodeId: "node-2", // inbound to node-2
      }),
    ];

    const { inbound, outbound } = getNodeBindings("node-2", bindings);

    expect(inbound).toHaveLength(2);
    expect(inbound.map((b) => b.id)).toContain("b-in-1");
    expect(inbound.map((b) => b.id)).toContain("b-in-2");

    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.id).toBe("b-out-1");
  });
});

describe("getDownstreamNodeIds", () => {
  it("应返回指定节点之后的所有节点 ID（按 order 升序）", () => {
    const timeline = makeTimeline([
      makeNode("node-1", 1),
      makeNode("node-2", 2),
      makeNode("node-3", 3),
      makeNode("node-4", 4),
    ]);

    const downstream = getDownstreamNodeIds("node-2", timeline);
    expect(downstream).toEqual(["node-3", "node-4"]);
  });

  it("首节点的下游应为所有后续节点", () => {
    const timeline = makeTimeline([
      makeNode("node-1", 1),
      makeNode("node-2", 2),
      makeNode("node-3", 3),
    ]);

    const downstream = getDownstreamNodeIds("node-1", timeline);
    expect(downstream).toEqual(["node-2", "node-3"]);
  });

  it("末节点应返回空数组", () => {
    const timeline = makeTimeline([
      makeNode("node-1", 1),
      makeNode("node-2", 2),
    ]);

    const downstream = getDownstreamNodeIds("node-2", timeline);
    expect(downstream).toEqual([]);
  });

  it("节点不存在时应返回空数组", () => {
    const timeline = makeTimeline([makeNode("node-1", 1)]);
    const downstream = getDownstreamNodeIds("not-exist", timeline);
    expect(downstream).toEqual([]);
  });

  it("节点乱序时应按 order 排序", () => {
    const timeline = makeTimeline([
      makeNode("node-3", 3),
      makeNode("node-1", 1),
      makeNode("node-2", 2),
    ]);

    const downstream = getDownstreamNodeIds("node-1", timeline);
    expect(downstream).toEqual(["node-2", "node-3"]);
  });
});

describe("extractBindingsFromTimeline", () => {
  it("应从时间线提取并规范化所有绑定", () => {
    const minimalBindings: TimelineBindingLike[] = [
      makeMinimalBinding({ id: "b-1" }),
      makeMinimalBinding({ id: "b-2", importance: "critical" }),
    ];
    const timeline = makeTimeline([makeNode("node-1", 1)], minimalBindings);

    const result = extractBindingsFromTimeline(timeline);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("b-1");
    expect(result[0]!.propagation.autoInject).toBe(true); // 默认值
    expect(result[1]!.importance).toBe("critical");
  });

  it("空 bindings 应返回空数组", () => {
    const timeline = makeTimeline([makeNode("node-1", 1)], []);
    const result = extractBindingsFromTimeline(timeline);
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// 集成测试
// ─────────────────────────────────────────────────────────────

describe("injectBindings — 集成测试", () => {
  it("完整流程：多绑定 + 过滤 + 排序 + 预算 + 级联", () => {
    const bindings: BindingForInjection[] = [
      // critical，cascadeEffect=true，应注入
      makeFullBinding({
        id: "b-crit-cascade",
        type: "mystery_reveal",
        sourceNodeId: "node-1",
        targetNodeId: "node-3",
        importance: "critical",
        injectionText: "悬念揭示：凶手是管家",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: true },
      }),
      // important，应注入
      makeFullBinding({
        id: "b-imp",
        type: "character_arc",
        sourceNodeId: "node-2",
        targetNodeId: "node-3",
        importance: "important",
        injectionText: "角色弧：主角成长",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: false },
      }),
      // optional，应注入（预算充足）
      makeFullBinding({
        id: "b-opt",
        type: "parallel",
        sourceNodeId: "node-6",
        targetNodeId: "node-3",
        importance: "optional",
        injectionText: "平行对照",
        propagation: { autoInject: true, injectToNodes: [], cascadeEffect: false },
      }),
      // target 不匹配，应跳过
      makeFullBinding({
        id: "b-mismatch",
        type: "callback",
        sourceNodeId: "node-1",
        targetNodeId: "node-other",
        importance: "critical",
      }),
      // autoInject=false，应跳过
      makeFullBinding({
        id: "b-disabled",
        type: "irony",
        sourceNodeId: "node-5",
        targetNodeId: "node-3",
        importance: "important",
        propagation: { autoInject: false, injectToNodes: [], cascadeEffect: false },
      }),
    ];

    const result = injectBindings("node-3", bindings, "生成图片 Prompt", {
      tokenBudget: 500,
      downstreamNodeIds: ["node-4", "node-5"],
    });

    // 应注入 3 个（critical + important + optional）
    expect(result.injectedBindings).toHaveLength(3);
    // 排序：critical → important → optional
    expect(result.injectedBindings[0]!.bindingId).toBe("b-crit-cascade");
    expect(result.injectedBindings[1]!.bindingId).toBe("b-imp");
    expect(result.injectedBindings[2]!.bindingId).toBe("b-opt");

    // 应跳过 2 个
    expect(result.skippedBindings).toHaveLength(2);
    const skipReasons = result.skippedBindings.map((s) => s.reason);
    expect(skipReasons).toContain("target_mismatch");
    expect(skipReasons).toContain("auto_inject_disabled");

    // 级联：critical 绑定 cascadeEffect=true，应影响下游
    expect(result.hasCascadeEffect).toBe(true);
    expect(result.cascadeAffectedNodeIds).toContain("node-3");
    expect(result.cascadeAffectedNodeIds).toContain("node-4");
    expect(result.cascadeAffectedNodeIds).toContain("node-5");

    // 注入块应包含 critical 绑定文本
    expect(result.injectionBlock).toContain("悬念揭示：凶手是管家");
    expect(result.injectionBlock).toContain("角色弧：主角成长");
    expect(result.injectionBlock).toContain("平行对照");

    // 最终 Prompt 应包含 basePrompt 和注入块
    expect(result.injectedPrompt).toContain("生成图片 Prompt");
    expect(result.injectedPrompt).toContain("【前情提要 - 自动注入】");
  });

  it("兼容最小形状绑定（TimelineBindingLike）", () => {
    const minimal: TimelineBindingLike = {
      id: "b-min",
      type: "foreshadow",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      injectionText: "最小形状绑定",
      importance: "critical",
    };

    const result = injectBindings("node-2", [minimal], "Prompt");

    expect(result.injectedBindings).toHaveLength(1);
    expect(result.injectedBindings[0]!.bindingId).toBe("b-min");
    expect(result.injectedBindings[0]!.injectionText).toBe("最小形状绑定");
    // 默认 cascadeEffect=false
    expect(result.hasCascadeEffect).toBe(false);
  });
});
