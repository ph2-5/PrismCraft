/**
 * Q3-10 / Task 4.6.8 — 重点快照标注管理测试
 */

import { describe, it, expect } from "vitest";
import {
  createPinnedSnapshotStore,
  pinNode,
  unpinNode,
  isPinned,
  getPinnedEntry,
  getPinnedNodeIds,
  getPinnedCount,
  shouldAutoPin,
  autoPinFromTimeline,
  getPinnedByReason,
  getPinnedBy,
  serializePinnedStore,
  deserializePinnedStore,
} from "../pinned-snapshot";
import type {
  PlotNodeLike,
  TimelineBindingLike,
  StoryTimelineLike,
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

function makeBinding(
  overrides: Partial<TimelineBindingLike> = {},
): TimelineBindingLike {
  return {
    id: "b-1",
    type: "foreshadow",
    sourceNodeId: "n-1",
    targetNodeId: "n-2",
    importance: "important",
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
// 存储管理测试
// ─────────────────────────────────────────────────────────────

describe("PinnedSnapshotStore 管理", () => {
  it("创建空存储", () => {
    const store = createPinnedSnapshotStore();
    expect(store.entries.size).toBe(0);
    expect(getPinnedCount(store)).toBe(0);
  });

  it("标注节点", () => {
    const store = createPinnedSnapshotStore();
    const updated = pinNode(store, "n-1", "manual", "user");

    expect(isPinned(updated, "n-1")).toBe(true);
    expect(isPinned(store, "n-1")).toBe(false); // 不可变
    expect(getPinnedCount(updated)).toBe(1);
  });

  it("取消标注", () => {
    const store = pinNode(createPinnedSnapshotStore(), "n-1", "manual", "user");
    const updated = unpinNode(store, "n-1");

    expect(isPinned(updated, "n-1")).toBe(false);
    expect(isPinned(store, "n-1")).toBe(true); // 不可变
  });

  it("获取标注记录", () => {
    const store = pinNode(
      createPinnedSnapshotStore(),
      "n-1",
      "auto_climax",
      "ai",
      12345,
    );
    const entry = getPinnedEntry(store, "n-1");

    expect(entry).toBeDefined();
    expect(entry!.nodeId).toBe("n-1");
    expect(entry!.reason).toBe("auto_climax");
    expect(entry!.pinnedBy).toBe("ai");
    expect(entry!.pinnedAt).toBe(12345);
  });

  it("获取所有标注节点 ID", () => {
    let store = createPinnedSnapshotStore();
    store = pinNode(store, "n-1", "manual", "user");
    store = pinNode(store, "n-2", "auto_twist", "ai");
    store = pinNode(store, "n-3", "manual", "user");

    const ids = getPinnedNodeIds(store);
    expect(ids).toHaveLength(3);
    expect(ids).toContain("n-1");
    expect(ids).toContain("n-2");
    expect(ids).toContain("n-3");
  });

  it("重复标注应更新记录", () => {
    let store = createPinnedSnapshotStore();
    store = pinNode(store, "n-1", "manual", "user", 100);
    store = pinNode(store, "n-1", "auto_climax", "ai", 200);

    expect(getPinnedCount(store)).toBe(1);
    const entry = getPinnedEntry(store, "n-1");
    expect(entry!.reason).toBe("auto_climax");
    expect(entry!.pinnedAt).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────
// 自动标注检测测试
// ─────────────────────────────────────────────────────────────

describe("shouldAutoPin", () => {
  it("climax 事件应自动标注", () => {
    const node = makeNode("n-1", 1, { plotEventType: "climax" });
    expect(shouldAutoPin(node, [])).toBe("auto_climax");
  });

  it("twist 事件应自动标注", () => {
    const node = makeNode("n-1", 1, { plotEventType: "twist" });
    expect(shouldAutoPin(node, [])).toBe("auto_twist");
  });

  it("foreshadow + critical 绑定应自动标注", () => {
    const node = makeNode("n-1", 1, { plotEventType: "foreshadow" });
    const binding = makeBinding({
      sourceNodeId: "n-1",
      importance: "critical",
    });
    expect(shouldAutoPin(node, [binding])).toBe("auto_critical_foreshadow");
  });

  it("foreshadow 但无 critical 绑定不应标注", () => {
    const node = makeNode("n-1", 1, { plotEventType: "foreshadow" });
    const binding = makeBinding({
      sourceNodeId: "n-1",
      importance: "important",
    });
    expect(shouldAutoPin(node, [binding])).toBeNull();
  });

  it("narration 事件不应标注", () => {
    const node = makeNode("n-1", 1, { plotEventType: "narration" });
    expect(shouldAutoPin(node, [])).toBeNull();
  });

  it("character_arc 中点应自动标注", () => {
    const nodes = [
      makeNode("n-1", 0),
      makeNode("n-2", 1),
      makeNode("n-3", 2), // 中点
      makeNode("n-4", 3),
      makeNode("n-5", 4),
    ];
    const binding = makeBinding({
      type: "character_arc",
      sourceNodeId: "n-1",
      targetNodeId: "n-5",
    });
    // 中点 idx = (0+4)/2 = 2 → n-3
    expect(shouldAutoPin(nodes[2]!, [binding], nodes)).toBe(
      "auto_character_arc_midpoint",
    );
  });

  it("非中点不应标注 character_arc", () => {
    const nodes = [
      makeNode("n-1", 0),
      makeNode("n-2", 1),
      makeNode("n-3", 2),
      makeNode("n-4", 3),
      makeNode("n-5", 4),
    ];
    const binding = makeBinding({
      type: "character_arc",
      sourceNodeId: "n-1",
      targetNodeId: "n-5",
    });
    expect(shouldAutoPin(nodes[1]!, [binding], nodes)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// autoPinFromTimeline 测试
// ─────────────────────────────────────────────────────────────

describe("autoPinFromTimeline", () => {
  it("应自动标注 climax 和 twist 节点", () => {
    const nodes = [
      makeNode("n-1", 0, { plotEventType: "narration" }),
      makeNode("n-2", 1, { plotEventType: "climax" }),
      makeNode("n-3", 2, { plotEventType: "narration" }),
      makeNode("n-4", 3, { plotEventType: "twist" }),
    ];
    const timeline = makeTimeline(nodes);
    const store = autoPinFromTimeline(createPinnedSnapshotStore(), timeline);

    expect(getPinnedCount(store)).toBe(2);
    expect(isPinned(store, "n-2")).toBe(true);
    expect(isPinned(store, "n-4")).toBe(true);
    expect(isPinned(store, "n-1")).toBe(false);
  });

  it("不应覆盖已有的人工标注", () => {
    const nodes = [
      makeNode("n-1", 0, { plotEventType: "climax" }),
    ];
    const timeline = makeTimeline(nodes);
    let store = pinNode(createPinnedSnapshotStore(), "n-1", "manual", "user");
    store = autoPinFromTimeline(store, timeline);

    const entry = getPinnedEntry(store, "n-1");
    expect(entry!.reason).toBe("manual");
    expect(entry!.pinnedBy).toBe("user");
  });

  it("应覆盖已有的 AI 标注", () => {
    const nodes = [
      makeNode("n-1", 0, { plotEventType: "climax" }),
    ];
    const timeline = makeTimeline(nodes);
    let store = pinNode(createPinnedSnapshotStore(), "n-1", "auto_twist", "ai");
    store = autoPinFromTimeline(store, timeline);

    const entry = getPinnedEntry(store, "n-1");
    expect(entry!.reason).toBe("auto_climax");
  });
});

// ─────────────────────────────────────────────────────────────
// 查询辅助测试
// ─────────────────────────────────────────────────────────────

describe("查询辅助", () => {
  it("按原因筛选", () => {
    let store = createPinnedSnapshotStore();
    store = pinNode(store, "n-1", "manual", "user");
    store = pinNode(store, "n-2", "auto_climax", "ai");
    store = pinNode(store, "n-3", "auto_climax", "ai");

    const climaxes = getPinnedByReason(store, "auto_climax");
    expect(climaxes).toHaveLength(2);
  });

  it("按标注者筛选", () => {
    let store = createPinnedSnapshotStore();
    store = pinNode(store, "n-1", "manual", "user");
    store = pinNode(store, "n-2", "auto_climax", "ai");

    const userPins = getPinnedBy(store, "user");
    const aiPins = getPinnedBy(store, "ai");
    expect(userPins).toHaveLength(1);
    expect(aiPins).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 序列化测试
// ─────────────────────────────────────────────────────────────

describe("序列化", () => {
  it("序列化与反序列化应保持数据一致", () => {
    let store = createPinnedSnapshotStore();
    store = pinNode(store, "n-1", "manual", "user", 100);
    store = pinNode(store, "n-2", "auto_climax", "ai", 200);

    const json = serializePinnedStore(store);
    const restored = deserializePinnedStore(json);

    expect(getPinnedCount(restored)).toBe(2);
    expect(isPinned(restored, "n-1")).toBe(true);
    expect(isPinned(restored, "n-2")).toBe(true);
    expect(getPinnedEntry(restored, "n-1")!.reason).toBe("manual");
  });

  it("无效 JSON 应返回空存储", () => {
    const restored = deserializePinnedStore("not json");
    expect(getPinnedCount(restored)).toBe(0);
  });
});
