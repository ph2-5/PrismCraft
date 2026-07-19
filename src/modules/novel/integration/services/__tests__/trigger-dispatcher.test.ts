/**
 * Task 2A.17 — TriggerDispatcher 单元测试
 *
 * 测试 TriggerDispatcher 对 StalenessTracker 的封装行为：
 * - notifyChange：上游调用入口，应正确委托给 tracker.markStale
 * - onRecompute：下游订阅 auto_recompute 事件，应过滤匹配 target
 * - onStaleChanged：UI 订阅 stale 变化
 * - onStaleCleared：UI 订阅 stale 清除
 * - onModeSwitched / emitModeSwitched：模式切换事件
 *
 * 使用独立的 StalenessTracker + TriggerDispatcher 实例（避免污染单例）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { eventBus } from "@/shared/event-bus";
import { StalenessTracker } from "../staleness-tracker";
import { TriggerDispatcher } from "../trigger-dispatcher";

describe("TriggerDispatcher", () => {
  let tracker: StalenessTracker;
  let dispatcher: TriggerDispatcher;

  beforeEach(() => {
    // 每个测试使用独立的 tracker + dispatcher 实例，避免单例污染
    tracker = new StalenessTracker();
    dispatcher = new TriggerDispatcher(tracker);
    // 清除 eventBus 所有监听器
    eventBus.removeAllListeners();
  });

  describe("notifyChange", () => {
    it("应委托给 tracker.markStale 标记下游 targets", () => {
      dispatcher.notifyChange("structure", "用户调整了故事结构 beats");

      // structure 影响 pacing/importance/prompt/overview
      expect(tracker.isStale("pacing")).toBe(true);
      expect(tracker.isStale("importance")).toBe(true);
      expect(tracker.isStale("prompt")).toBe(true);
      expect(tracker.isStale("overview")).toBe(true);
    });

    it("应正确传递 reason 参数", () => {
      dispatcher.notifyChange("structure", "特定原因描述");

      const entries = tracker.getStaleEntries("pacing");
      expect(entries[0]!.reason).toBe("特定原因描述");
    });

    it("应正确传递 affectedSegmentIds 参数", () => {
      dispatcher.notifyChange("character", "角色变化", ["seg-1", "seg-3"]);

      const entries = tracker.getStaleEntries("importance");
      expect(entries[0]!.affectedSegmentIds).toEqual(["seg-1", "seg-3"]);
    });

    it("affectedSegmentIds 未传时应为 undefined", () => {
      dispatcher.notifyChange("structure", "结构变化");

      const entries = tracker.getStaleEntries("pacing");
      expect(entries[0]!.affectedSegmentIds).toBeUndefined();
    });

    it("应触发 novel:stale-changed 事件（通过 markStale 内部）", () => {
      const handler = vi.fn();
      eventBus.on("novel:stale-changed", handler);

      dispatcher.notifyChange("structure", "测试原因");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "structure",
          reason: "测试原因",
        }),
      );
    });

    it("mode 源不应标记任何 target（mode 的 STALENESS_PROPAGATION 为空数组）", () => {
      dispatcher.notifyChange("mode", "用户切换模式");

      expect(tracker.getStaleTargets()).toEqual([]);
    });
  });

  describe("onRecompute", () => {
    it("triggerType=auto_recompute 时应触发回调", () => {
      const callback = vi.fn();
      dispatcher.onRecompute("shotRecommend", callback);

      // sceneVariant 的 triggerType 是 auto_recompute，影响 shotRecommend/prompt/overview
      dispatcher.notifyChange("sceneVariant", "场景变体变化");

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("应传递该 target 当前的所有 StaleEntry", () => {
      const callback = vi.fn();
      dispatcher.onRecompute("prompt", callback);

      // sceneVariant 影响 prompt，会触发回调
      dispatcher.notifyChange("sceneVariant", "场景变体变化");

      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            source: "sceneVariant",
            targets: expect.arrayContaining(["prompt"]),
          }),
        ]),
      );
    });

    it("triggerType=stale_marker 时不应触发回调（structure 类型）", () => {
      const callback = vi.fn();
      dispatcher.onRecompute("pacing", callback);

      // structure 的 triggerType 是 stale_marker，不影响 pacing 的 onRecompute
      // 虽然 structure 标记了 pacing 为 stale，但不会触发 auto-recompute 事件
      dispatcher.notifyChange("structure", "结构变化");

      expect(callback).not.toHaveBeenCalled();
    });

    it("triggerType=manual_confirm 时不应触发回调（pacing 类型）", () => {
      const callback = vi.fn();
      dispatcher.onRecompute("prompt", callback);

      // pacing 的 triggerType 是 manual_confirm
      dispatcher.notifyChange("pacing", "节奏变化");

      expect(callback).not.toHaveBeenCalled();
    });

    it("应只响应订阅的 target（不响应无关 target）", () => {
      const promptCallback = vi.fn();
      const beatsCallback = vi.fn();
      dispatcher.onRecompute("prompt", promptCallback);
      dispatcher.onRecompute("beats", beatsCallback);

      // sceneVariant 影响 prompt 但不影响 beats
      dispatcher.notifyChange("sceneVariant", "场景变体变化");

      expect(promptCallback).toHaveBeenCalledTimes(1);
      expect(beatsCallback).not.toHaveBeenCalled();
    });

    it("应返回可调用的 unsubscribe 函数", () => {
      const callback = vi.fn();
      const unsubscribe = dispatcher.onRecompute("shotRecommend", callback);

      expect(typeof unsubscribe).toBe("function");

      unsubscribe();

      // 取消订阅后不再触发
      dispatcher.notifyChange("sceneVariant", "场景变体变化");
      expect(callback).not.toHaveBeenCalled();
    });

    it("多个 target 订阅同一 source 时应各自独立触发", () => {
      const promptCb = vi.fn();
      const overviewCb = vi.fn();
      const shotRecommendCb = vi.fn();
      dispatcher.onRecompute("prompt", promptCb);
      dispatcher.onRecompute("overview", overviewCb);
      dispatcher.onRecompute("shotRecommend", shotRecommendCb);

      // sceneVariant 影响所有 3 个 targets（triggerType=auto_recompute）
      dispatcher.notifyChange("sceneVariant", "场景变体变化");

      expect(promptCb).toHaveBeenCalledTimes(1);
      expect(overviewCb).toHaveBeenCalledTimes(1);
      expect(shotRecommendCb).toHaveBeenCalledTimes(1);
    });
  });

  describe("onStaleChanged", () => {
    it("应在 markStale 时触发回调", () => {
      const callback = vi.fn();
      dispatcher.onStaleChanged(callback);

      dispatcher.notifyChange("structure", "结构变化");

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("应传递 source/targets/triggerType/reason 参数", () => {
      const callback = vi.fn();
      dispatcher.onStaleChanged(callback);

      dispatcher.notifyChange("pacing", "节奏调整原因");

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "pacing",
          triggerType: "manual_confirm",
          reason: "节奏调整原因",
          targets: expect.arrayContaining(["prompt", "beats", "overview"]),
        }),
      );
    });

    it("应响应所有 triggerType（包括 stale_marker 和 manual_confirm）", () => {
      const callback = vi.fn();
      dispatcher.onStaleChanged(callback);

      // structure: stale_marker
      dispatcher.notifyChange("structure", "结构变化");
      // pacing: manual_confirm
      dispatcher.notifyChange("pacing", "节奏变化");

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("应返回可调用的 unsubscribe 函数", () => {
      const callback = vi.fn();
      const unsubscribe = dispatcher.onStaleChanged(callback);

      unsubscribe();

      dispatcher.notifyChange("structure", "结构变化");
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("onStaleCleared", () => {
    it("应在 clearStale 时触发回调", () => {
      const callback = vi.fn();
      dispatcher.onStaleCleared(callback);

      dispatcher.notifyChange("structure", "结构变化");
      tracker.clearStale("pacing");

      expect(callback).toHaveBeenCalledWith({ target: "pacing" });
    });

    it("应在 clearAll 时触发回调（target 为 'all'）", () => {
      const callback = vi.fn();
      dispatcher.onStaleCleared(callback);

      tracker.clearAll();

      expect(callback).toHaveBeenCalledWith({ target: "all" });
    });

    it("应在 clearSource 时为每个被清除的 target 触发回调", () => {
      const callback = vi.fn();
      dispatcher.onStaleCleared(callback);

      // structure 影响 pacing/importance/prompt/overview，共 4 个 targets
      dispatcher.notifyChange("structure", "结构变化");
      tracker.clearSource("structure");

      expect(callback).toHaveBeenCalledTimes(4);
    });

    it("应返回可调用的 unsubscribe 函数", () => {
      const callback = vi.fn();
      const unsubscribe = dispatcher.onStaleCleared(callback);

      unsubscribe();

      tracker.clearStale("pacing");
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("onModeSwitched / emitModeSwitched", () => {
    it("emitModeSwitched 应触发 novel:mode-switched 事件", () => {
      const callback = vi.fn();
      dispatcher.onModeSwitched(callback);

      dispatcher.emitModeSwitched("standard", "professional");

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        from: "standard",
        to: "professional",
      });
    });

    it("应支持所有模式组合", () => {
      const callback = vi.fn();
      dispatcher.onModeSwitched(callback);

      dispatcher.emitModeSwitched("quick", "standard");
      dispatcher.emitModeSwitched("standard", "professional");
      dispatcher.emitModeSwitched("professional", "quick");

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, { from: "quick", to: "standard" });
      expect(callback).toHaveBeenNthCalledWith(2, { from: "standard", to: "professional" });
      expect(callback).toHaveBeenNthCalledWith(3, { from: "professional", to: "quick" });
    });

    it("应返回可调用的 unsubscribe 函数", () => {
      const callback = vi.fn();
      const unsubscribe = dispatcher.onModeSwitched(callback);

      unsubscribe();

      dispatcher.emitModeSwitched("quick", "standard");
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("多订阅者隔离", () => {
    it("多个订阅者应同时收到事件", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();
      dispatcher.onStaleChanged(cb1);
      dispatcher.onStaleChanged(cb2);
      dispatcher.onStaleChanged(cb3);

      dispatcher.notifyChange("structure", "结构变化");

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).toHaveBeenCalledTimes(1);
    });

    it("一个订阅者取消不应影响其他订阅者", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const unsub1 = dispatcher.onStaleChanged(cb1);
      dispatcher.onStaleChanged(cb2);

      unsub1();
      dispatcher.notifyChange("structure", "结构变化");

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  describe("构造函数注入", () => {
    it("应使用注入的 tracker 实例（而非单例）", () => {
      // 通过验证 tracker 和 dispatcher 的行为一致性来确认
      const independentTracker = new StalenessTracker();
      const independentDispatcher = new TriggerDispatcher(independentTracker);

      independentDispatcher.notifyChange("structure", "测试");

      // 注入的 tracker 应被标记
      expect(independentTracker.isStale("pacing")).toBe(true);

      // 单例 tracker 不应被影响（因为使用了独立实例）
      // 注：这里不直接测试单例，只验证独立 tracker 被正确使用
    });
  });
});
