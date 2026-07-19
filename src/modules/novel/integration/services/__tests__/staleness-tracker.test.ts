/**
 * Task 2A.17 — StalenessTracker 单元测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { eventBus } from "@/shared/event-bus";
import { StalenessTracker } from "../staleness-tracker";
import type { StalenessTarget } from "../../domain/staleness-types";

describe("StalenessTracker", () => {
  let tracker: StalenessTracker;

  beforeEach(() => {
    tracker = new StalenessTracker();
    // 清除 eventBus 所有监听器，避免测试间污染
    eventBus.removeAllListeners();
  });

  describe("markStale", () => {
    it("structure 变化应标记 4 个 targets（pacing/importance/prompt/overview）", () => {
      tracker.markStale("structure", "用户调整了故事结构 beats");

      expect(tracker.isStale("pacing")).toBe(true);
      expect(tracker.isStale("importance")).toBe(true);
      expect(tracker.isStale("prompt")).toBe(true);
      expect(tracker.isStale("overview")).toBe(true);
      // structure 不影响 beats
      expect(tracker.isStale("beats")).toBe(false);
    });

    it("pacing 变化应标记 3 个 targets（prompt/beats/overview）", () => {
      tracker.markStale("pacing", "用户调整了节奏配置");

      expect(tracker.isStale("prompt")).toBe(true);
      expect(tracker.isStale("beats")).toBe(true);
      expect(tracker.isStale("overview")).toBe(true);
      // pacing 不影响 pacing 自身
      expect(tracker.isStale("pacing")).toBe(false);
    });

    it("mode 变化不应标记任何 target（STALENESS_PROPAGATION.mode 为空）", () => {
      tracker.markStale("mode", "用户切换了模式");

      const staleTargets = tracker.getStaleTargets();
      expect(staleTargets).toEqual([]);
    });

    it("segment 变化应标记 5 个 targets（含 structure 自身）", () => {
      tracker.markStale("segment", "用户重新分割了段落");

      expect(tracker.isStale("structure")).toBe(true);
      expect(tracker.isStale("pacing")).toBe(true);
      expect(tracker.isStale("importance")).toBe(true);
      expect(tracker.isStale("prompt")).toBe(true);
      expect(tracker.isStale("overview")).toBe(true);
    });

    it("应触发 novel:stale-changed 事件", () => {
      const handler = vi.fn();
      eventBus.on("novel:stale-changed", handler);

      tracker.markStale("structure", "测试原因");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "structure",
          reason: "测试原因",
        }),
      );
    });

    it("triggerType=auto_recompute 时应额外触发 novel:auto-recompute 事件", () => {
      const autoRecomputeHandler = vi.fn();
      eventBus.on("novel:auto-recompute", autoRecomputeHandler);

      // sceneVariant 的 triggerType 是 auto_recompute
      tracker.markStale("sceneVariant", "场景变体变化");

      expect(autoRecomputeHandler).toHaveBeenCalledTimes(1);
    });

    it("triggerType=stale_marker 时不应触发 novel:auto-recompute 事件", () => {
      const autoRecomputeHandler = vi.fn();
      eventBus.on("novel:auto-recompute", autoRecomputeHandler);

      // structure 的 triggerType 是 stale_marker
      tracker.markStale("structure", "结构变化");

      expect(autoRecomputeHandler).not.toHaveBeenCalled();
    });

    it("同一 source 多次 markStale 应去重（替换旧条目）", () => {
      tracker.markStale("structure", "第一次修改");
      tracker.markStale("structure", "第二次修改");

      const entries = tracker.getStaleEntries("pacing");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.reason).toBe("第二次修改");
    });

    it("不同 source 标记同一 target 应保留所有条目", () => {
      tracker.markStale("structure", "结构变化");
      tracker.markStale("character", "角色变化");

      // prompt 同时被 structure 和 character 标记
      const entries = tracker.getStaleEntries("prompt");
      expect(entries).toHaveLength(2);
      const sources = entries.map((e) => e.source).sort();
      expect(sources).toEqual(["character", "structure"]);
    });

    it("affectedSegmentIds 应被正确存储", () => {
      tracker.markStale("structure", "部分段落修改", ["seg-1", "seg-2"]);

      const entries = tracker.getStaleEntries("pacing");
      expect(entries[0]!.affectedSegmentIds).toEqual(["seg-1", "seg-2"]);
    });
  });

  describe("isStale / getStaleEntries / getStaleTargets", () => {
    it("未标记的 target isStale 返回 false", () => {
      expect(tracker.isStale("pacing")).toBe(false);
    });

    it("未标记的 target getStaleEntries 返回空数组", () => {
      expect(tracker.getStaleEntries("pacing")).toEqual([]);
    });

    it("getStaleTargets 应返回所有过期的 targets", () => {
      tracker.markStale("structure", "结构变化");

      const targets = tracker.getStaleTargets().sort() as StalenessTarget[];
      expect(targets).toEqual(
        ["importance", "overview", "pacing", "prompt"].sort(),
      );
    });
  });

  describe("clearStale", () => {
    it("应清除指定 target 的所有 stale 标记", () => {
      tracker.markStale("structure", "结构变化");
      expect(tracker.isStale("pacing")).toBe(true);

      tracker.clearStale("pacing");

      expect(tracker.isStale("pacing")).toBe(false);
      // 其他 target 不受影响
      expect(tracker.isStale("importance")).toBe(true);
    });

    it("应触发 novel:stale-cleared 事件", () => {
      const handler = vi.fn();
      eventBus.on("novel:stale-cleared", handler);

      tracker.clearStale("pacing");

      expect(handler).toHaveBeenCalledWith({ target: "pacing" });
    });
  });

  describe("clearSource", () => {
    it("应清除指定 source 在所有 targets 上的标记", () => {
      tracker.markStale("structure", "结构变化");
      tracker.markStale("character", "角色变化");

      // structure 标记了 4 个 targets，character 标记了 3 个 targets
      // prompt 同时被两者标记，应剩 1 个 character 条目
      tracker.clearSource("structure");

      expect(tracker.isStale("pacing")).toBe(false); // pacing 只被 structure 标记
      expect(tracker.isStale("importance")).toBe(true); // importance 也被 character 标记
      const promptEntries = tracker.getStaleEntries("prompt");
      expect(promptEntries).toHaveLength(1);
      expect(promptEntries[0]!.source).toBe("character");
    });
  });

  describe("clearAll", () => {
    it("应清除所有 stale 标记", () => {
      tracker.markStale("structure", "结构变化");
      tracker.markStale("pacing", "节奏变化");

      tracker.clearAll();

      expect(tracker.getStaleTargets()).toEqual([]);
    });

    it("应触发 novel:stale-cleared 事件，target 为 'all'", () => {
      const handler = vi.fn();
      eventBus.on("novel:stale-cleared", handler);

      tracker.clearAll();

      expect(handler).toHaveBeenCalledWith({ target: "all" });
    });
  });

  describe("serialize / restore", () => {
    it("serialize 应返回可序列化的对象", () => {
      tracker.markStale("structure", "测试");

      const serialized = tracker.serialize();

      expect(typeof serialized).toBe("object");
      expect(serialized).toHaveProperty("pacing");
      expect(Array.isArray(serialized.pacing)).toBe(true);
    });

    it("restore 应从序列化数据恢复状态", () => {
      const original = new StalenessTracker();
      original.markStale("structure", "测试原因");

      const serialized = original.serialize();

      const restored = new StalenessTracker();
      restored.restore(serialized);

      expect(restored.isStale("pacing")).toBe(true);
      expect(restored.getStaleEntries("pacing")[0]!.reason).toBe("测试原因");
    });

    it("restore 应防御性处理无效数据（跳过非数组条目）", () => {
      const restored = new StalenessTracker();
      // 模拟 DB 中损坏的数据
      restored.restore({
        pacing: "invalid" as unknown as never,
        prompt: [],
      });

      // pacing 被跳过（无效），prompt 为空数组（有效但无 entry）
      expect(restored.isStale("pacing")).toBe(false);
      expect(restored.isStale("prompt")).toBe(false);
    });

    it("restore 应先清空现有状态", () => {
      const tracker2 = new StalenessTracker();
      tracker2.markStale("character", "已有标记");

      tracker2.restore({ pacing: [] });

      // character 已被清空
      expect(tracker2.isStale("prompt")).toBe(false);
    });
  });
});
