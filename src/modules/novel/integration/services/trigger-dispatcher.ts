/**
 * Task 2A.17 — 触发分发器
 *
 * 封装"上游变化 → 标记 stale → 通知下游"的完整流程。
 *
 * 使用模式：
 * - 上游 Task 调用 dispatcher.notifyChange()（如 StructureAnalysisPanel 编辑 beats 后调用）
 * - 下游 Task 订阅 dispatcher.onRecompute()（如 PacingPanel 监听 structure 变化重算）
 * - UI 组件订阅 dispatcher.onStaleChanged() 显示"已过期"标记
 *
 * 依赖方向：依赖 @/shared/event-bus + 同模块 staleness-tracker + domain/staleness-types
 */

import { eventBus } from "@/shared/event-bus";
import type {
  StaleEntry,
  StalenessSource,
  StalenessTarget,
} from "../domain/staleness-types";
import {
  stalenessTracker,
  type StalenessTracker,
} from "./staleness-tracker";

/**
 * 触发分发器。
 *
 * 设计为对 StalenessTracker 的高层封装，提供更友好的 API：
 * - notifyChange：上游调用的统一入口
 * - onRecompute：下游订阅重算事件
 * - onStaleChanged / onStaleCleared：UI 订阅状态变化
 *
 * 注：通过构造函数注入 StalenessTracker 实例，便于测试时替换为独立实例。
 */
export class TriggerDispatcher {
  /**
   * @param tracker 依赖的 StalenessTracker 实例（默认使用单例）
   */
  constructor(
    private readonly tracker: StalenessTracker = stalenessTracker,
  ) {}

  /**
   * 上游调用：通知某个源发生变化。
   *
   * 内部调用 stalenessTracker.markStale 完成标记和事件触发。
   *
   * @param source 过期源（如 "structure"）
   * @param reason 人类可读的原因（如"用户调整了故事结构 beats"）
   * @param affectedSegmentIds 影响范围（可选）
   */
  notifyChange(
    source: StalenessSource,
    reason: string,
    affectedSegmentIds?: string[],
  ): void {
    this.tracker.markStale(source, reason, affectedSegmentIds);
    // triggerType=auto_recompute 的事件已在 markStale 内部 emit，此处无需重复
  }

  /**
   * 下游订阅：监听某个 target 需要重算。
   *
   * 仅响应 triggerType=auto_recompute 的事件（即 novel:auto-recompute）。
   * 对于 stale_marker / manual_confirm 类型，下游应通过 onStaleChanged 自行决定何时刷新。
   *
   * @param target 监听的下游目标（如 "pacing"）
   * @param callback 重算回调，参数为该 target 当前的所有 StaleEntry
   * @returns 取消订阅函数
   */
  onRecompute(
    target: StalenessTarget,
    callback: (entries: StaleEntry[]) => void,
  ): () => void {
    const handler = (data: unknown) => {
      const typed = data as {
        source: StalenessSource;
        targets: StalenessTarget[];
      };
      if (typed.targets.includes(target)) {
        const entries = this.tracker.getStaleEntries(target);
        callback(entries);
      }
    };

    const { unsubscribe } = eventBus.on("novel:auto-recompute", handler);
    return unsubscribe;
  }

  /**
   * UI 订阅：监听 stale 状态变化（用于显示"已过期"标记）。
   *
   * @param callback 回调，参数为变更详情（source / targets / triggerType / reason）
   * @returns 取消订阅函数
   */
  onStaleChanged(
    callback: (data: {
      source: StalenessSource;
      targets: StalenessTarget[];
      triggerType: string;
      reason: string;
    }) => void,
  ): () => void {
    const handler = (data: unknown) => callback(data as {
      source: StalenessSource;
      targets: StalenessTarget[];
      triggerType: string;
      reason: string;
    });
    const { unsubscribe } = eventBus.on("novel:stale-changed", handler);
    return unsubscribe;
  }

  /**
   * UI 订阅：监听 stale 被清除（用于隐藏"已过期"标记）。
   *
   * @param callback 回调，参数为被清除的 target（或 "all"）
   * @returns 取消订阅函数
   */
  onStaleCleared(
    callback: (data: { target: StalenessTarget | "all" }) => void,
  ): () => void {
    const handler = (data: unknown) =>
      callback(data as { target: StalenessTarget | "all" });
    const { unsubscribe } = eventBus.on("novel:stale-cleared", handler);
    return unsubscribe;
  }

  /**
   * UI 订阅：监听模式切换事件。
   *
   * 由 Task 2A.16 的 handleSelectMode 触发。
   *
   * @param callback 回调，参数为 from / to 模式
   * @returns 取消订阅函数
   */
  onModeSwitched(
    callback: (data: {
      from: "quick" | "standard" | "professional";
      to: "quick" | "standard" | "professional";
    }) => void,
  ): () => void {
    const handler = (data: unknown) =>
      callback(data as {
        from: "quick" | "standard" | "professional";
        to: "quick" | "standard" | "professional";
      });
    const { unsubscribe } = eventBus.on("novel:mode-switched", handler);
    return unsubscribe;
  }

  /**
   * 触发模式切换事件（由 useNovelPipeline.handleSelectMode 调用）。
   *
   * @param from 原模式
   * @param to 新模式
   */
  emitModeSwitched(
    from: "quick" | "standard" | "professional",
    to: "quick" | "standard" | "professional",
  ): void {
    eventBus.emit("novel:mode-switched", { from, to });
  }
}

/**
 * 单例实例。
 *
 * 通过 DI 容器注册（Category B：有状态服务，需 test replacement）。
 * 测试时可使用 new TriggerDispatcher(new StalenessTracker()) 创建独立实例避免污染。
 */
export const triggerDispatcher = new TriggerDispatcher();
