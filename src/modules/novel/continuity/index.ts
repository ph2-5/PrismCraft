/**
 * Task 2A.18 — 连续性账本子域公共 API
 *
 * 导出所有类型、常量、类和单例。
 * 其他模块通过 `@/modules/novel/continuity` 导入。
 */

// domain
export type {
  ContinuityCategory,
  ContinuityEntry,
  ContinuityViolation,
  ContinuityLedger,
  ConflictValue,
  ViolationSeverity,
} from "./domain/continuity-ledger";
export { DEFAULT_SEVERITY } from "./domain/continuity-ledger";

// services
export {
  ContinuityTracker,
  continuityTracker,
  type ContinuityTrackerInput,
} from "./services/continuity-tracker";
export {
  ContinuityViolationFixer,
  continuityViolationFixer,
  type ViolationFixerOptions,
} from "./services/continuity-violation-fixer";

// presentation
export {
  ContinuityLedgerPanel,
  type ContinuityLedgerPanelProps,
} from "./presentation/ContinuityLedgerPanel";
