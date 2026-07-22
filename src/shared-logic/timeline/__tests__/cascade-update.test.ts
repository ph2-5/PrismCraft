/**
 * Q3-5 / Task 4.6.3 — 级联更新与脏标记测试
 *
 * 测试覆盖：
 *   - markDirty：direct/proagated 标记、两种模式、追加合并
 *   - incrementalUpdate：仅重算脏节点、非脏复用缓存、首节点脏、多脏节点链
 *   - DirtyMap 查询/操作辅助函数
 *   - serialize/deserialize 往返
 */

import { describe, it, expect } from "vitest";
import {
  markDirty,
  incrementalUpdate,
  isDirty,
  getDirtyEntry,
  getDirtyNodeIds,
  getDirectDirtyNodeIds,
  clearDirty,
  clearAllDirty,
  serializeDirtyMap,
  deserializeDirtyMap,
} from "../cascade-update";
import { propagateStates } from "../state-propagation-engine";
import type {
  StoryTimelineLike,
  PlotNodeLike,
  PlotEventType,
  PlotEventParameters,
  CharacterInitialState,
  SceneInitialState,
  DirtyMap,
} from "../snapshot-types";

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

/** 构造一个 5 节点时间线：narration 初始化 → character_transform → scene_destruction → narration → character_injury */
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
// markDirty 测试
// ─────────────────────────────────────────────────────────────

describe("cascade-update — markDirty", () => {
  it("cascade_all 模式应标记直接节点 + 所有下游节点", () => {
    const timeline = makeSampleTimeline();
    const dirtyMap = markDirty(["node-2"], timeline, "cascade_all");

    // node-2 是 direct
    expect(dirtyMap.size).toBe(4); // node-2,3,4,5
    expect(getDirtyEntry(dirtyMap, "node-2")!.level).toBe("direct");
    expect(getDirtyEntry(dirtyMap, "node-3")!.level).toBe("propagated");
    expect(getDirtyEntry(dirtyMap, "node-4")!.level).toBe("propagated");
    expect(getDirtyEntry(dirtyMap, "node-5")!.level).toBe("propagated");
    // node-1 不应被标记
    expect(isDirty(dirtyMap, "node-1")).toBe(false);
  });

  it("current_only 模式应仅标记直接节点", () => {
    const timeline = makeSampleTimeline();
    const dirtyMap = markDirty(["node-3"], timeline, "current_only");

    expect(dirtyMap.size).toBe(1);
    expect(isDirty(dirtyMap, "node-3")).toBe(true);
    expect(isDirty(dirtyMap, "node-4")).toBe(false);
    expect(isDirty(dirtyMap, "node-5")).toBe(false);
  });

  it("默认模式应为 cascade_all", () => {
    const timeline = makeSampleTimeline();
    const dirtyMap = markDirty(["node-1"], timeline);

    expect(dirtyMap.size).toBe(5); // 全部节点
    expect(getDirtyEntry(dirtyMap, "node-1")!.level).toBe("direct");
    expect(getDirtyEntry(dirtyMap, "node-2")!.level).toBe("propagated");
  });

  it("多个 affected 节点应都标记为 direct", () => {
    const timeline = makeSampleTimeline();
    const dirtyMap = markDirty(["node-2", "node-4"], timeline, "cascade_all");

    expect(getDirtyEntry(dirtyMap, "node-2")!.level).toBe("direct");
    expect(getDirtyEntry(dirtyMap, "node-4")!.level).toBe("direct");
    // node-3 是 node-2 的下游，应为 propagated
    expect(getDirtyEntry(dirtyMap, "node-3")!.level).toBe("propagated");
    // node-5 是 node-4 的下游，应为 propagated
    expect(getDirtyEntry(dirtyMap, "node-5")!.level).toBe("propagated");
  });

  it("空 affectedNodeIds 应返回空 DirtyMap（或 prevDirtyMap）", () => {
    const timeline = makeSampleTimeline();
    const dirtyMap = markDirty([], timeline, "cascade_all");
    expect(dirtyMap.size).toBe(0);
  });

  it("应与 prevDirtyMap 追加合并", () => {
    const timeline = makeSampleTimeline();
    // 第一次标记 node-2
    const dirty1 = markDirty(["node-2"], timeline, "cascade_all");
    // 第二次标记 node-4（current_only），应保留 node-2/3/4/5 的旧标记
    const dirty2 = markDirty(["node-4"], timeline, "current_only", dirty1);

    // node-2 仍是 direct（来自第一次）
    expect(getDirtyEntry(dirty2, "node-2")!.level).toBe("direct");
    // node-3 仍是 propagated（来自第一次）
    expect(getDirtyEntry(dirty2, "node-3")!.level).toBe("propagated");
    // node-4 应被更新为 direct（第二次覆盖第一次的 propagated）
    expect(getDirtyEntry(dirty2, "node-4")!.level).toBe("direct");
    // node-5 仍是 propagated（来自第一次）
    expect(getDirtyEntry(dirty2, "node-5")!.level).toBe("propagated");
  });

  it("propagated 节点的 sourceNodeId 应指向最近的 direct 上游", () => {
    const timeline = makeSampleTimeline();
    const dirtyMap = markDirty(["node-3"], timeline, "cascade_all");

    expect(getDirtyEntry(dirtyMap, "node-4")!.sourceNodeId).toBe("node-3");
    expect(getDirtyEntry(dirtyMap, "node-5")!.sourceNodeId).toBe("node-3");
  });
});

// ─────────────────────────────────────────────────────────────
// incrementalUpdate 测试
// ─────────────────────────────────────────────────────────────

describe("cascade-update — incrementalUpdate", () => {
  it("仅重算脏节点，非脏节点复用缓存", () => {
    const timeline = makeSampleTimeline();
    const prevResult = propagateStates(timeline);

    // 修改 node-2 的事件参数（模拟用户编辑）
    const modifiedTimeline = makeTimeline([
      makeNode("node-1", 1, "narration", {}, {
        characterInitialStates: [makeCharInitial({ variantId: "v-casual" })],
        sceneInitialStates: [makeSceneInitial()],
      }),
      makeNode("node-2", 2, "character_transform", {
        characterId: "char-1",
        previousVariantId: "v-casual",
        newVariantId: "v-super-battle", // 改为新变体
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

    // 标记 node-2 为脏（current_only，不级联）
    const dirtyMap = markDirty(["node-2"], modifiedTimeline, "current_only");

    const result = incrementalUpdate(dirtyMap, modifiedTimeline, prevResult);

    // node-2 应被重算（variantId 变为 v-super-battle）
    expect(result.recomputedNodeIds).toContain("node-2");
    const node2Char = result.snapshots.get("node-2")!.characterSnapshots[0]!;
    expect(node2Char.appearance.variantId).toBe("v-super-battle");

    // node-1 应复用缓存（skipped）
    expect(result.skippedNodeIds).toContain("node-1");
    // node-1 的快照应与 prevResult 相同（引用相等）
    expect(result.snapshots.get("node-1")).toBe(prevResult.get("node-1"));

    // node-3/4/5 应复用缓存（current_only 模式不级联）
    expect(result.skippedNodeIds).toContain("node-3");
    expect(result.skippedNodeIds).toContain("node-4");
    expect(result.skippedNodeIds).toContain("node-5");
    // node-3 仍是旧的 destructionLevel=30（来自 prevResult）
    expect(result.snapshots.get("node-3")!.sceneSnapshots[0]!.environment.destructionLevel).toBe(30);
  });

  it("cascade_all 模式应重算所有下游脏节点", () => {
    const timeline = makeSampleTimeline();
    const prevResult = propagateStates(timeline);

    // 修改 node-2
    const modifiedTimeline = makeTimeline([
      makeNode("node-1", 1, "narration", {}, {
        characterInitialStates: [makeCharInitial({ variantId: "v-casual" })],
        sceneInitialStates: [makeSceneInitial()],
      }),
      makeNode("node-2", 2, "character_transform", {
        characterId: "char-1",
        previousVariantId: "v-casual",
        newVariantId: "v-super-battle",
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

    const dirtyMap = markDirty(["node-2"], modifiedTimeline, "cascade_all");
    const result = incrementalUpdate(dirtyMap, modifiedTimeline, prevResult);

    // node-2/3/4/5 都应被重算
    expect(result.recomputedNodeIds).toEqual(["node-2", "node-3", "node-4", "node-5"]);
    expect(result.skippedNodeIds).toEqual(["node-1"]);

    // node-4（narration 透传）应反映 node-2 的新变体
    const node4Char = result.snapshots.get("node-4")!.characterSnapshots[0]!;
    expect(node4Char.appearance.variantId).toBe("v-super-battle");

    // node-5（character_injury）应反映新变体 + 伤势
    const node5Char = result.snapshots.get("node-5")!.characterSnapshots[0]!;
    expect(node5Char.appearance.variantId).toBe("v-super-battle");
    expect(node5Char.appearance.injuries).toHaveLength(1);
  });

  it("空 DirtyMap 应全部复用缓存", () => {
    const timeline = makeSampleTimeline();
    const prevResult = propagateStates(timeline);
    const emptyDirtyMap: DirtyMap = new Map();

    const result = incrementalUpdate(emptyDirtyMap, timeline, prevResult);

    expect(result.recomputedNodeIds).toEqual([]);
    expect(result.skippedNodeIds).toEqual(["node-1", "node-2", "node-3", "node-4", "node-5"]);
  });

  it("首节点脏时应重新初始化", () => {
    const timeline = makeSampleTimeline();
    const prevResult = propagateStates(timeline);

    // 修改 node-1 的初始变体
    const modifiedTimeline = makeTimeline([
      makeNode("node-1", 1, "narration", {}, {
        characterInitialStates: [makeCharInitial({ variantId: "v-new-init" })],
        sceneInitialStates: [makeSceneInitial()],
      }),
      makeNode("node-2", 2, "character_transform", {
        characterId: "char-1",
        previousVariantId: "v-new-init",
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

    const dirtyMap = markDirty(["node-1"], modifiedTimeline, "cascade_all");
    const result = incrementalUpdate(dirtyMap, modifiedTimeline, prevResult);

    // 全部节点都应被重算
    expect(result.recomputedNodeIds).toHaveLength(5);

    // node-1 应使用新的初始变体
    const node1Char = result.snapshots.get("node-1")!.characterSnapshots[0]!;
    expect(node1Char.appearance.variantId).toBe("v-new-init");

    // node-2 应从 v-new-init 转换到 v-battle
    const node2Char = result.snapshots.get("node-2")!.characterSnapshots[0]!;
    expect(node2Char.appearance.variantId).toBe("v-battle");
  });

  it("增量结果应与全量重算一致（cascade_all 模式）", () => {
    const timeline = makeSampleTimeline();
    const prevResult = propagateStates(timeline);

    // 修改 node-3
    const modifiedTimeline = makeTimeline([
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
      // 修改 node-4 为 character_emotion_change
      makeNode("node-4", 4, "character_emotion_change", {
        characterId: "char-1",
        emotion: "furious",
      }),
      makeNode("node-5", 5, "character_injury", {
        characterId: "char-1",
        injuryType: "cut",
        injuryLocation: "arm",
        severity: "severe",
      }),
    ]);

    const dirtyMap = markDirty(["node-4"], modifiedTimeline, "cascade_all");
    const incrementalResult = incrementalUpdate(dirtyMap, modifiedTimeline, prevResult);

    // 全量重算作为对照
    const fullResult = propagateStates(modifiedTimeline);

    // node-4/5 的增量结果应与全量一致
    const incNode4 = incrementalResult.snapshots.get("node-4")!;
    const fullNode4 = fullResult.get("node-4")!;
    expect(incNode4.characterSnapshots[0]!.innerState.emotion).toBe(fullNode4.characterSnapshots[0]!.innerState.emotion);
    expect(incNode4.characterSnapshots[0]!.innerState.emotion).toBe("furious");

    const incNode5 = incrementalResult.snapshots.get("node-5")!;
    const fullNode5 = fullResult.get("node-5")!;
    expect(incNode5.characterSnapshots[0]!.appearance.injuries).toHaveLength(
      fullNode5.characterSnapshots[0]!.appearance.injuries.length,
    );

    // node-1/2/3 应复用缓存（与 prevResult 相同）
    expect(incrementalResult.snapshots.get("node-1")).toBe(prevResult.get("node-1"));
    expect(incrementalResult.snapshots.get("node-2")).toBe(prevResult.get("node-2"));
    expect(incrementalResult.snapshots.get("node-3")).toBe(prevResult.get("node-3"));
  });
});

// ─────────────────────────────────────────────────────────────
// DirtyMap 查询/操作辅助测试
// ─────────────────────────────────────────────────────────────

describe("cascade-update — DirtyMap 辅助函数", () => {
  const timeline = makeSampleTimeline();
  const dirtyMap = markDirty(["node-2", "node-4"], timeline, "cascade_all");

  it("isDirty 应正确查询", () => {
    expect(isDirty(dirtyMap, "node-2")).toBe(true);
    expect(isDirty(dirtyMap, "node-4")).toBe(true);
    expect(isDirty(dirtyMap, "node-1")).toBe(false);
  });

  it("getDirtyEntry 应返回条目", () => {
    const entry = getDirtyEntry(dirtyMap, "node-2");
    expect(entry).toBeDefined();
    expect(entry!.nodeId).toBe("node-2");
    expect(entry!.level).toBe("direct");
  });

  it("getDirtyNodeIds 应按 order 排序", () => {
    const ids = getDirtyNodeIds(dirtyMap, timeline);
    expect(ids).toEqual(["node-2", "node-3", "node-4", "node-5"]);
  });

  it("getDirectDirtyNodeIds 应仅返回 direct 节点", () => {
    const ids = getDirectDirtyNodeIds(dirtyMap);
    expect(ids.sort()).toEqual(["node-2", "node-4"]);
  });

  it("clearDirty 应移除指定节点", () => {
    const cleared = clearDirty(dirtyMap, "node-3");
    expect(isDirty(cleared, "node-3")).toBe(false);
    expect(isDirty(cleared, "node-2")).toBe(true); // 其他保留
  });

  it("clearAllDirty 应返回空 Map", () => {
    const cleared = clearAllDirty();
    expect(cleared.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// serialize/deserialize 测试
// ─────────────────────────────────────────────────────────────

describe("cascade-update — serialize/deserialize", () => {
  it("应正确往返序列化", () => {
    const timeline = makeSampleTimeline();
    const dirtyMap = markDirty(["node-2"], timeline, "cascade_all");

    const serialized = serializeDirtyMap(dirtyMap);
    expect(Object.keys(serialized).length).toBe(4);

    const deserialized = deserializeDirtyMap(serialized);
    expect(deserialized.size).toBe(4);
    expect(isDirty(deserialized, "node-2")).toBe(true);
    expect(isDirty(deserialized, "node-3")).toBe(true);

    // 内容一致
    const origEntry = getDirtyEntry(dirtyMap, "node-2")!;
    const deserEntry = getDirtyEntry(deserialized, "node-2")!;
    expect(deserEntry.level).toBe(origEntry.level);
    expect(deserEntry.sourceNodeId).toBe(origEntry.sourceNodeId);
    expect(deserEntry.reason).toBe(origEntry.reason);
  });

  it("空 DirtyMap 序列化应为空对象", () => {
    const empty: DirtyMap = new Map();
    const serialized = serializeDirtyMap(empty);
    expect(Object.keys(serialized).length).toBe(0);
  });
});
