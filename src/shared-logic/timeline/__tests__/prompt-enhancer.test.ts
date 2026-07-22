/**
 * Q3-8 / Task 4.6.6 — 增强 Prompt 合成测试
 *
 * 测试覆盖：
 *   - enhancePrompt 核心流程
 *     - 节点不存在时返回空增强
 *     - 完整增强流程（时间线位置 + 绑定注入 + 角色状态 + 场景状态 + 剧情事件）
 *     - 预计算 propagationResult 复用
 *   - formatTimelinePosition 时间线位置格式
 *   - formatCharacterStates 角色状态格式
 *   - formatSceneStates 场景状态格式
 *   - formatPlotEvent 剧情事件格式
 *   - assembleFinalPrompt 最终拼接
 *   - batchEnhancePrompts 批量增强
 */

import { describe, it, expect } from "vitest";
import {
  enhancePrompt,
  formatTimelinePosition,
  formatCharacterStates,
  formatSceneStates,
  formatPlotEvent,
  assembleFinalPrompt,
  batchEnhancePrompts,
} from "../prompt-enhancer";
import type {
  StoryTimelineLike,
  PlotNodeLike,
  CharacterStateSnapshot,
  SceneStateSnapshot,
  TimelineBindingLike,
} from "../snapshot-types";

// ─────────────────────────────────────────────────────────────
// 测试工厂
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

function makeSceneSnapshot(
  overrides: Partial<SceneStateSnapshot> = {},
): SceneStateSnapshot {
  return {
    nodeId: "node-1",
    sceneId: "scene-1",
    environment: {
      variantId: "v-day",
      timeOfDay: "day",
      weather: "clear",
      lighting: "natural",
      mood: "neutral",
      destructionLevel: 0,
      crowdLevel: "normal",
      atmosphereChanges: [],
    },
    entities: {
      charactersPresent: [],
      itemsPresent: [],
      environmentalObjects: [],
    },
    persistentChanges: {
      addedObjects: [],
      removedObjects: [],
      modifiedObjects: [],
    },
    ...overrides,
  };
}

function makeTimeline(
  nodes: PlotNodeLike[],
  bindings: TimelineBindingLike[] = [],
): StoryTimelineLike {
  return { id: "tl-test", nodes, bindings };
}

// ─────────────────────────────────────────────────────────────
// enhancePrompt 测试
// ─────────────────────────────────────────────────────────────

describe("enhancePrompt", () => {
  it("节点不存在时应返回仅含 basePrompt 的空增强", () => {
    const timeline = makeTimeline([makeNode("node-1", 1)]);
    const result = enhancePrompt("not-exist", timeline, "基础 Prompt");

    expect(result.nodeId).toBe("not-exist");
    expect(result.basePrompt).toBe("基础 Prompt");
    expect(result.finalPrompt).toBe("基础 Prompt");
    expect(result.characterSnapshots).toEqual([]);
    expect(result.sceneSnapshots).toEqual([]);
    expect(result.injectionResult.injectedBindings).toEqual([]);
  });

  it("应完整增强 Prompt（含时间线位置 + 角色状态 + 场景状态 + 剧情事件）", () => {
    const node = makeNode("node-1", 1, {
      plotEventType: "character_transform",
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

    const result = enhancePrompt("node-1", timeline, "生成图片");

    expect(result.nodeId).toBe("node-1");
    expect(result.basePrompt).toBe("生成图片");
    // 应包含所有部分
    expect(result.finalPrompt).toContain("【时间线位置】");
    expect(result.finalPrompt).toContain("【角色状态】");
    expect(result.finalPrompt).toContain("【场景状态】");
    expect(result.finalPrompt).toContain("【剧情事件】");
    expect(result.finalPrompt).toContain("【合成 Prompt】");
    expect(result.finalPrompt).toContain("生成图片");
    // 应有角色和场景快照（来自 propagateStates）
    expect(result.characterSnapshots.length).toBeGreaterThan(0);
    expect(result.sceneSnapshots.length).toBeGreaterThan(0);
  });

  it("应支持预计算 propagationResult 复用", () => {
    const node = makeNode("node-1", 1, {
      characterInitialStates: [{ characterId: "char-1", variantId: "v-1" }],
    });
    const timeline = makeTimeline([node]);

    // 手动构造 propagationResult
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

    const result = enhancePrompt("node-1", timeline, "Prompt", {
      propagationResult,
    });

    // 应使用预计算的快照
    expect(result.characterSnapshots).toHaveLength(1);
    expect(result.characterSnapshots[0]!.characterId).toBe("custom-char");
  });

  it("应包含绑定注入块", () => {
    const node = makeNode("node-2", 2, {
      plotEventType: "callback",
      plotEventDescription: "回收伏笔",
    });
    const binding: TimelineBindingLike = {
      id: "b-1",
      type: "foreshadow",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      injectionText: "第1章埋下的伏笔",
      importance: "critical",
    };
    const timeline = makeTimeline(
      [makeNode("node-1", 1), node],
      [binding],
    );

    const result = enhancePrompt("node-2", timeline, "Prompt");

    expect(result.injectionResult.injectedBindings).toHaveLength(1);
    expect(result.finalPrompt).toContain("【前情提要 - 自动注入】");
    expect(result.finalPrompt).toContain("第1章埋下的伏笔");
  });

  it("无快照时仍应返回增强 Prompt（仅时间线位置 + 剧情事件）", () => {
    const node = makeNode("node-1", 1, {
      plotEventDescription: "旁白描述",
    });
    const timeline = makeTimeline([node]);

    const result = enhancePrompt("node-1", timeline, "Prompt");

    expect(result.finalPrompt).toContain("【时间线位置】");
    expect(result.finalPrompt).toContain("【剧情事件】");
    // 无角色/场景快照
    expect(result.characterSnapshots).toEqual([]);
    expect(result.sceneSnapshots).toEqual([]);
  });

  it("estimatedTokens 应为正数", () => {
    const node = makeNode("node-1", 1);
    const timeline = makeTimeline([node]);

    const result = enhancePrompt("node-1", timeline, "测试 Prompt");

    expect(result.estimatedTokens).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// formatTimelinePosition 测试
// ─────────────────────────────────────────────────────────────

describe("formatTimelinePosition", () => {
  it("应包含章节和段落信息", () => {
    const node = makeNode("node-1", 3, {
      chapterIndex: 2,
      chapterTitle: "对决",
    });
    const result = formatTimelinePosition(node);
    expect(result).toContain("【时间线位置】");
    expect(result).toContain("第2章");
    expect(result).toContain("对决");
    expect(result).toContain("第4段"); // order=3 → 第4段
  });

  it("无章节信息时应显示未知章节", () => {
    const node = makeNode("node-1", 0);
    const result = formatTimelinePosition(node);
    expect(result).toContain("未知章节");
    expect(result).toContain("第1段");
  });
});

// ─────────────────────────────────────────────────────────────
// formatCharacterStates 测试
// ─────────────────────────────────────────────────────────────

describe("formatCharacterStates", () => {
  it("空快照应返回空字符串", () => {
    expect(formatCharacterStates([])).toBe("");
  });

  it("应包含角色 ID 和基本状态", () => {
    const snap = makeCharacterSnapshot({ characterId: "char-zero" });
    const result = formatCharacterStates([snap]);
    expect(result).toContain("【角色状态】");
    expect(result).toContain("char-zero");
    expect(result).toContain("v-default");
    expect(result).toContain("casual");
    expect(result).toContain("neutral");
  });

  it("应包含伤势信息", () => {
    const snap = makeCharacterSnapshot({
      appearance: {
        variantId: "v-battle",
        outfit: "战斗服",
        expression: "angry",
        pose: "fighting",
        injuries: [
          { type: "机械损伤", location: "右臂", severity: "severe", causeEventId: "evt-1" },
        ],
        accessories: [],
      },
    });
    const result = formatCharacterStates([snap]);
    expect(result).toContain("机械损伤");
    expect(result).toContain("右臂");
    expect(result).toContain("severe");
  });

  it("应包含秘密和关系信息", () => {
    const snap = makeCharacterSnapshot({
      innerState: {
        emotion: "释然",
        motivation: "保护同伴",
        secretRevealed: ["改造人身份"],
        relationshipStatus: { "char-shadow": "理解" },
      },
    });
    const result = formatCharacterStates([snap]);
    expect(result).toContain("改造人身份");
    expect(result).toContain("char-shadow=理解");
    expect(result).toContain("保护同伴");
  });
});

// ─────────────────────────────────────────────────────────────
// formatSceneStates 测试
// ─────────────────────────────────────────────────────────────

describe("formatSceneStates", () => {
  it("空快照应返回空字符串", () => {
    expect(formatSceneStates([])).toBe("");
  });

  it("应包含场景 ID 和环境信息", () => {
    const snap = makeSceneSnapshot({ sceneId: "scene-subway" });
    const result = formatSceneStates([snap]);
    expect(result).toContain("【场景状态】");
    expect(result).toContain("scene-subway");
    expect(result).toContain("day");
    expect(result).toContain("clear");
  });

  it("应包含破坏程度和物品", () => {
    const snap = makeSceneSnapshot({
      sceneId: "scene-battle",
      environment: {
        variantId: "v-destroyed",
        timeOfDay: "night",
        weather: "rain",
        lighting: "dim",
        mood: "tense",
        destructionLevel: 40,
        crowdLevel: "sparse",
        atmosphereChanges: [],
      },
      entities: {
        charactersPresent: ["char-1"],
        itemsPresent: ["sword-1", "dagger-1"],
        environmentalObjects: [],
      },
    });
    const result = formatSceneStates([snap]);
    expect(result).toContain("40%");
    expect(result).toContain("sword-1");
    expect(result).toContain("dagger-1");
    expect(result).toContain("char-1");
  });
});

// ─────────────────────────────────────────────────────────────
// formatPlotEvent 测试
// ─────────────────────────────────────────────────────────────

describe("formatPlotEvent", () => {
  it("应包含事件类型和描述", () => {
    const node = makeNode("node-1", 1, {
      plotEventType: "character_transform",
      plotEventDescription: "零变身战斗形态",
    });
    const result = formatPlotEvent(node);
    expect(result).toContain("【剧情事件】");
    expect(result).toContain("character_transform");
    expect(result).toContain("零变身战斗形态");
  });

  it("空描述应返回空字符串", () => {
    const node = makeNode("node-1", 1, { plotEventDescription: "" });
    expect(formatPlotEvent(node)).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────
// assembleFinalPrompt 测试
// ─────────────────────────────────────────────────────────────

describe("assembleFinalPrompt", () => {
  it("应按顺序拼接所有部分", () => {
    const sections = {
      timelinePosition: "【时间线位置】第1章",
      bindingInjection: "【前情提要 - 自动注入】伏笔",
      characterStates: "【角色状态】角色1",
      sceneStates: "【场景状态】场景1",
      plotEvent: "【剧情事件】事件1",
    };
    const result = assembleFinalPrompt(sections, "基础 Prompt");
    const parts = result.split("\n\n");
    expect(parts[0]).toContain("【时间线位置】");
    expect(parts[1]).toContain("【前情提要");
    expect(parts[2]).toContain("【角色状态】");
    expect(parts[3]).toContain("【场景状态】");
    expect(parts[4]).toContain("【剧情事件】");
    expect(parts[5]).toContain("【合成 Prompt】");
    expect(parts[5]).toContain("基础 Prompt");
  });

  it("空部分应被跳过", () => {
    const sections = {
      timelinePosition: "【时间线位置】第1章",
      bindingInjection: "",
      characterStates: "",
      sceneStates: "",
      plotEvent: "",
    };
    const result = assembleFinalPrompt(sections, "Prompt");
    expect(result).toContain("【时间线位置】");
    expect(result).not.toContain("【角色状态】");
    expect(result).toContain("【合成 Prompt】");
  });

  it("空 basePrompt 应跳过合成 Prompt 部分", () => {
    const sections = {
      timelinePosition: "【时间线位置】",
      bindingInjection: "",
      characterStates: "",
      sceneStates: "",
      plotEvent: "",
    };
    const result = assembleFinalPrompt(sections, "");
    expect(result).not.toContain("【合成 Prompt】");
  });
});

// ─────────────────────────────────────────────────────────────
// batchEnhancePrompts 测试
// ─────────────────────────────────────────────────────────────

describe("batchEnhancePrompts", () => {
  it("应批量增强多个节点", () => {
    const nodes = [
      makeNode("node-1", 1, { plotEventDescription: "事件1" }),
      makeNode("node-2", 2, { plotEventDescription: "事件2" }),
    ];
    const timeline = makeTimeline(nodes);
    const basePrompts = new Map([
      ["node-1", "Prompt 1"],
      ["node-2", "Prompt 2"],
    ]);

    const results = batchEnhancePrompts(["node-1", "node-2"], timeline, basePrompts);

    expect(results.size).toBe(2);
    expect(results.get("node-1")!.basePrompt).toBe("Prompt 1");
    expect(results.get("node-2")!.basePrompt).toBe("Prompt 2");
    expect(results.get("node-1")!.finalPrompt).toContain("事件1");
    expect(results.get("node-2")!.finalPrompt).toContain("事件2");
  });

  it("节点不存在时应返回空增强", () => {
    const timeline = makeTimeline([makeNode("node-1", 1)]);
    const basePrompts = new Map([["not-exist", "Prompt"]]);

    const results = batchEnhancePrompts(["not-exist"], timeline, basePrompts);

    expect(results.size).toBe(1);
    expect(results.get("not-exist")!.finalPrompt).toBe("Prompt");
  });
});
