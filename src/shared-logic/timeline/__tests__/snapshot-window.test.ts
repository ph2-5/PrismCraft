/**
 * Q3-10 / Task 4.6.8 — 滑动窗口管理测试
 */

import { describe, it, expect } from "vitest";
import {
  createSnapshotStore,
  initWindow,
  getSnapshotStrategy,
  slideWindow,
  getSnapshot,
  getWindowNodes,
  getPinnedInWindow,
  getCachedCount,
  getCenterNode,
  DEFAULT_WINDOW_SIZE,
} from "../snapshot-window";
import {
  createPinnedSnapshotStore,
  pinNode,
} from "../pinned-snapshot";
import type {
  PlotNodeLike,
  StoryTimelineLike,
} from "../snapshot-types";

// ─────────────────────────────────────────────────────────────
// 测试工厂
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
// 创建与初始化测试
// ─────────────────────────────────────────────────────────────

describe("SnapshotStore 创建与初始化", () => {
  it("创建空存储", () => {
    const pinned = createPinnedSnapshotStore();
    const store = createSnapshotStore(pinned);

    expect(store.window.centerNodeId).toBeNull();
    expect(store.window.windowSize).toBe(DEFAULT_WINDOW_SIZE);
    expect(store.window.activeNodeIds.size).toBe(0);
    expect(store.cachedSnapshots.size).toBe(0);
  });

  it("自定义窗口大小", () => {
    const pinned = createPinnedSnapshotStore();
    const store = createSnapshotStore(pinned, { windowSize: 5 });

    expect(store.window.windowSize).toBe(5);
  });

  it("initWindow 应设置中心节点和活动节点", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = createSnapshotStore(pinned);

    const initialized = initWindow(store, "n-5", timeline);

    expect(initialized.window.centerNodeId).toBe("n-5");
    // 窗口大小 3，n-5 是第 5 个节点（idx=4），窗口应为 n-2 到 n-8
    expect(initialized.window.activeNodeIds.size).toBe(7);
    expect(initialized.window.activeNodeIds.has("n-2")).toBe(true);
    expect(initialized.window.activeNodeIds.has("n-8")).toBe(true);
    expect(initialized.window.activeNodeIds.has("n-1")).toBe(false);
    expect(initialized.window.activeNodeIds.has("n-9")).toBe(false);
  });

  it("initWindow 应预填充缓存", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = createSnapshotStore(pinned);

    const initialized = initWindow(store, "n-5", timeline);

    // 7 个 active 节点都应被缓存
    expect(getCachedCount(initialized)).toBeGreaterThanOrEqual(7);
  });

  it("initWindow 边界处理（中心在开头）", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = createSnapshotStore(pinned);

    const initialized = initWindow(store, "n-1", timeline);

    // n-1 是第一个节点，窗口应为 n-1 到 n-4（4 个节点）
    expect(initialized.window.activeNodeIds.size).toBe(4);
    expect(initialized.window.activeNodeIds.has("n-1")).toBe(true);
    expect(initialized.window.activeNodeIds.has("n-4")).toBe(true);
  });

  it("initWindow 边界处理（中心在末尾）", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = createSnapshotStore(pinned);

    const initialized = initWindow(store, "n-10", timeline);

    // n-10 是最后一个节点，窗口应为 n-7 到 n-10（4 个节点）
    expect(initialized.window.activeNodeIds.size).toBe(4);
    expect(initialized.window.activeNodeIds.has("n-7")).toBe(true);
    expect(initialized.window.activeNodeIds.has("n-10")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 策略计算测试
// ─────────────────────────────────────────────────────────────

describe("getSnapshotStrategy", () => {
  it("pinned 节点应返回 pinned", () => {
    let pinned = createPinnedSnapshotStore();
    pinned = pinNode(pinned, "n-1", "manual", "user");
    const store = createSnapshotStore(pinned);

    expect(getSnapshotStrategy(store, "n-1")).toBe("pinned");
  });

  it("active 节点应返回 active", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    expect(getSnapshotStrategy(store, "n-5")).toBe("active");
    expect(getSnapshotStrategy(store, "n-2")).toBe("active");
  });

  it("窗口外非 pinned 节点应返回 diff_only", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    expect(getSnapshotStrategy(store, "n-1")).toBe("diff_only");
    expect(getSnapshotStrategy(store, "n-10")).toBe("diff_only");
  });

  it("pinned 优先于 active", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    let pinned = createPinnedSnapshotStore();
    pinned = pinNode(pinned, "n-5", "manual", "user");
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    expect(getSnapshotStrategy(store, "n-5")).toBe("pinned");
  });
});

// ─────────────────────────────────────────────────────────────
// 窗口滑动测试
// ─────────────────────────────────────────────────────────────

describe("slideWindow", () => {
  it("滑动窗口应更新中心节点", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    const slid = slideWindow(store, "n-6", timeline);

    expect(getCenterNode(slid)).toBe("n-6");
  });

  it("滑动窗口应更新 activeNodeIds", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    const slid = slideWindow(store, "n-7", timeline);

    // 新窗口：n-4 到 n-10
    expect(slid.window.activeNodeIds.has("n-4")).toBe(true);
    expect(slid.window.activeNodeIds.has("n-10")).toBe(true);
    // n-2 应已移出窗口
    expect(slid.window.activeNodeIds.has("n-2")).toBe(false);
  });

  it("滑动窗口应降级旧窗口节点（非 pinned）", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    // 初始缓存包含 n-2
    expect(store.cachedSnapshots.has("n-2")).toBe(true);

    // 滑动到 n-8，n-2 移出窗口
    const slid = slideWindow(store, "n-8", timeline);

    // n-2 应已从缓存移除（非 pinned）
    expect(slid.cachedSnapshots.has("n-2")).toBe(false);
  });

  it("滑动窗口不应降级 pinned 节点", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    let pinned = createPinnedSnapshotStore();
    pinned = pinNode(pinned, "n-2", "manual", "user");
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    expect(store.cachedSnapshots.has("n-2")).toBe(true);

    // 滑动到 n-8，n-2 移出窗口但是 pinned
    const slid = slideWindow(store, "n-8", timeline);

    expect(slid.cachedSnapshots.has("n-2")).toBe(true);
  });

  it("滑动窗口应升级新窗口节点", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    // n-9 不在初始窗口
    expect(store.cachedSnapshots.has("n-9")).toBe(false);

    // 滑动到 n-8，n-9 进入窗口
    const slid = slideWindow(store, "n-8", timeline);

    expect(slid.cachedSnapshots.has("n-9")).toBe(true);
  });

  it("滑动到不存在的节点应返回原 store", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    const slid = slideWindow(store, "n-nonexistent", timeline);

    expect(slid).toBe(store);
  });
});

// ─────────────────────────────────────────────────────────────
// 快照获取测试
// ─────────────────────────────────────────────────────────────

describe("getSnapshot", () => {
  it("命中缓存应直接返回", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    const snap = getSnapshot(store, "n-5", timeline);
    expect(snap).toBeDefined();
    expect(snap!.nodeId).toBe("n-5");
  });

  it("diff_only 节点应增量重算", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    // n-1 是 diff_only
    const snap = getSnapshot(store, "n-1", timeline);
    expect(snap).toBeDefined();
    expect(snap!.nodeId).toBe("n-1");
  });

  it("不存在的节点应返回 undefined", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    const snap = getSnapshot(store, "n-nonexistent", timeline);
    expect(snap).toBeUndefined();
  });

  it("pinned 节点应始终有缓存", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    let pinned = createPinnedSnapshotStore();
    pinned = pinNode(pinned, "n-1", "manual", "user");
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    // n-1 是 pinned，但不在窗口内
    const snap = getSnapshot(store, "n-1", timeline);
    expect(snap).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// 查询辅助测试
// ─────────────────────────────────────────────────────────────

describe("查询辅助", () => {
  it("getWindowNodes 应返回窗口内节点", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    const windowNodes = getWindowNodes(store);
    expect(windowNodes).toHaveLength(7);
  });

  it("getPinnedInWindow 应返回窗口内的 pinned 节点", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    let pinned = createPinnedSnapshotStore();
    pinned = pinNode(pinned, "n-3", "manual", "user");
    pinned = pinNode(pinned, "n-9", "manual", "user");
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    // 窗口是 n-2 到 n-8，只有 n-3 在窗口内
    const pinnedInWindow = getPinnedInWindow(store);
    expect(pinnedInWindow).toEqual(["n-3"]);
  });

  it("getCachedCount 应返回缓存数量", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    // 7 个 active 节点都应缓存
    expect(getCachedCount(store)).toBeGreaterThanOrEqual(7);
  });

  it("getCenterNode 应返回中心节点", () => {
    const nodes = makeNodes(10);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-5", timeline);

    expect(getCenterNode(store)).toBe("n-5");
  });
});

// ─────────────────────────────────────────────────────────────
// 内存优化测试
// ─────────────────────────────────────────────────────────────

describe("内存优化", () => {
  it("100 节点项目应只缓存窗口内的节点", () => {
    const nodes = makeNodes(100);
    const timeline = makeTimeline(nodes);
    const pinned = createPinnedSnapshotStore();
    const store = initWindow(createSnapshotStore(pinned), "n-50", timeline);

    // 窗口大小 3，应缓存 7 个节点
    expect(getCachedCount(store)).toBe(7);
    expect(getCachedCount(store)).toBeLessThan(100);
  });

  it("有 pinned 节点时应额外缓存 pinned", () => {
    const nodes = makeNodes(100);
    const timeline = makeTimeline(nodes);
    let pinned = createPinnedSnapshotStore();
    pinned = pinNode(pinned, "n-10", "manual", "user");
    pinned = pinNode(pinned, "n-90", "manual", "user");
    const store = initWindow(createSnapshotStore(pinned), "n-50", timeline);

    // 7 个 active + 2 个 pinned（不在窗口内）
    expect(getCachedCount(store)).toBe(9);
  });
});
