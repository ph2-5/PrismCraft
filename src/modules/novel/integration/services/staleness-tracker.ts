/**
 * Task 2A.17 — 过期标记追踪器
 *
 * 不使用 Zustand，而是简单的 Map<StalenessTarget, StaleEntry[]>。
 * 通过 eventBus 通知 UI 层（React 组件订阅事件刷新）。
 *
 * 持久化：随 PipelineState 一起保存到 DB（Task 2A.3 的 pipeline state）。
 *
 * 依赖方向：依赖 @/shared/event-bus（基础设施）+ 同模块 domain/staleness-types
 */

import { eventBus } from "@/shared/event-bus";
import type {
  StaleEntry,
  StalenessSource,
  StalenessTarget,
} from "../domain/staleness-types";
import {
  STALENESS_PROPAGATION,
  TRIGGER_TYPE,
} from "../domain/staleness-types";

/**
 * 过期标记追踪器。
 *
 * 数据结构：Map<StalenessTarget, StaleEntry[]>
 * - 一个 target 可能被多个 source 标记（如 prompt 被 pacing+importance 同时标记）
 * - 同一 source 的新条目替换旧条目（去重）
 *
 * 事件：
 * - markStale 时 emit "novel:stale-changed"
 * - triggerType=auto_recompute 时额外 emit "novel:auto-recompute"
 * - clearStale / clearAll 时 emit "novel:stale-cleared"
 */
export class StalenessTracker {
  private staleMap = new Map<StalenessTarget, StaleEntry[]>();

  /**
   * 标记某个源变化，自动传播到所有下游目标。
   *
   * @param source 过期源（如 "structure"）
   * @param reason 人类可读的原因（如"用户调整了故事结构 beats"）
   * @param affectedSegmentIds 影响范围（可选，未指定则全部）
   */
  markStale(
    source: StalenessSource,
    reason: string,
    affectedSegmentIds?: string[],
  ): void {
    const targets = STALENESS_PROPAGATION[source] ?? [];
    const triggerType = TRIGGER_TYPE[source];
    const entry: StaleEntry = {
      source,
      targets,
      triggerType,
      timestamp: Date.now(),
      reason,
      affectedSegmentIds,
    };

    // 为每个 target 添加/更新 entry
    for (const target of targets) {
      const existing = this.staleMap.get(target) ?? [];
      // 去重：同一 source 的旧条目替换为新条目
      const filtered = existing.filter((e) => e.source !== source);
      filtered.push(entry);
      this.staleMap.set(target, filtered);
    }

    // 通知 UI 层（订阅 novel:stale-changed 的组件刷新）
    eventBus.emit("novel:stale-changed", {
      source,
      targets,
      triggerType,
      reason,
    });

    // 自动重算类型立即触发（订阅 novel:auto-recompute 的服务立即响应）
    if (triggerType === "auto_recompute") {
      eventBus.emit("novel:auto-recompute", { source, targets });
    }
  }

  /**
   * 查询某个目标是否过期。
   *
   * @returns true 表示至少有一个 source 标记该 target 为 stale
   */
  isStale(target: StalenessTarget): boolean {
    return (this.staleMap.get(target)?.length ?? 0) > 0;
  }

  /**
   * 获取某个目标的过期详情（所有标记该 target 的 StaleEntry）。
   *
   * @returns StaleEntry 数组（可能为空）
   */
  getStaleEntries(target: StalenessTarget): StaleEntry[] {
    return this.staleMap.get(target) ?? [];
  }

  /**
   * 获取所有过期的 targets。
   *
   * 用于 UI 显示"哪些 Task 需要刷新"。
   */
  getStaleTargets(): StalenessTarget[] {
    return Array.from(this.staleMap.keys()).filter((target) => {
      const entries = this.staleMap.get(target);
      return entries !== undefined && entries.length > 0;
    });
  }

  /**
   * 清除某个目标的过期标记。
   *
   * 用户重新计算某个 target 后调用（如重新生成 prompt 后清除 prompt 的 stale 标记）。
   */
  clearStale(target: StalenessTarget): void {
    this.staleMap.delete(target);
    eventBus.emit("novel:stale-cleared", { target });
  }

  /**
   * 清除某个 source 在所有 targets 上的标记。
   *
   * 用于：source 完全重新生成后，清除它在所有 target 上的 stale 标记。
   * 如：用户重新分析 story structure 后，清除 structure 在 pacing/importance/prompt/overview 上的标记。
   */
  clearSource(source: StalenessSource): void {
    const clearedTargets: StalenessTarget[] = [];
    for (const [target, entries] of this.staleMap.entries()) {
      const filtered = entries.filter((e) => e.source !== source);
      if (filtered.length !== entries.length) {
        if (filtered.length === 0) {
          this.staleMap.delete(target);
        } else {
          this.staleMap.set(target, filtered);
        }
        clearedTargets.push(target);
      }
    }
    // 通知 UI 层（每个被清除的 target 单独 emit，便于细粒度刷新）
    for (const target of clearedTargets) {
      eventBus.emit("novel:stale-cleared", { target });
    }
  }

  /**
   * 清除所有过期标记（模式切换后调用）。
   */
  clearAll(): void {
    this.staleMap.clear();
    eventBus.emit("novel:stale-cleared", { target: "all" });
  }

  /**
   * 序列化（用于持久化到 DB）。
   *
   * @returns Record<target, StaleEntry[]> 结构
   */
  serialize(): Record<string, StaleEntry[]> {
    return Object.fromEntries(this.staleMap);
  }

  /**
   * 反序列化（从 DB 恢复）。
   *
   * @param data 从 DB 加载的 Record<target, StaleEntry[]> 结构
   */
  restore(data: Record<string, StaleEntry[]>): void {
    this.staleMap.clear();
    for (const [target, entries] of Object.entries(data)) {
      // 防御性：跳过无效条目
      if (!Array.isArray(entries)) continue;
      this.staleMap.set(target as StalenessTarget, entries);
    }
  }
}

/**
 * 单例实例。
 *
 * 通过 DI 容器注册（Category B：有状态服务，需 test replacement）。
 * 测试时可使用 new StalenessTracker() 创建独立实例避免污染。
 */
export const stalenessTracker = new StalenessTracker();
