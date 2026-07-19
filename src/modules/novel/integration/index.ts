/**
 * Task 2A.17 — Novel 集成层公共 API
 *
 * 导出过期标记追踪器 + 触发分发器 + 类型定义。
 *
 * 使用方式：
 * ```typescript
 * import { triggerDispatcher, stalenessTracker } from "@/modules/novel/integration";
 *
 * // 上游 Task 通知变化
 * triggerDispatcher.notifyChange("structure", "用户调整了故事结构 beats");
 *
 * // 下游 Task 订阅重算
 * const unsubscribe = triggerDispatcher.onRecompute("pacing", (entries) => {
 *   // 重新计算 pacing
 * });
 *
 * // UI 订阅 stale 状态变化
 * triggerDispatcher.onStaleChanged((data) => {
 *   // 更新 UI 显示"已过期"标记
 * });
 * ```
 *
 * 依赖方向：仅依赖 @/shared/event-bus + 同模块 domain
 */

// Domain — 类型与常量
export type {
  StalenessSource,
  StalenessTarget,
  TriggerType,
  StaleEntry,
  NovelIntegrationEvents,
  NovelIntegrationEventName,
} from "./domain/staleness-types";
export {
  STALENESS_PROPAGATION,
  TRIGGER_TYPE,
  NOVEL_INTEGRATION_EVENTS,
} from "./domain/staleness-types";

// Services — 追踪器与分发器
export {
  StalenessTracker,
  stalenessTracker,
} from "./services/staleness-tracker";
export {
  TriggerDispatcher,
  triggerDispatcher,
} from "./services/trigger-dispatcher";
