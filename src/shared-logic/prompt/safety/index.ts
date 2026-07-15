/**
 * Safety 模块 barrel（Task 1.4 v5.3 增强 → Task 4.12 生产级升级）
 *
 * 包含：
 * - IP 安全改写（ip-rewriter）：IP/名人/品牌关键词安全改写
 * - 反空泛词汇过滤（antislop）：过滤 masterpiece/best quality 等空泛词
 * - 误报修复（filter-repair）：为医疗/教育/新闻等良性上下文添加注释（Task 4.12 新增）
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

export {
  rewriteIp,
  needsUserConfirmation,
  listKnownKeywords,
  getDatabaseStats,
} from "./ip-rewriter";
export type {
  IpCategory,
  ConfidenceLevel,
  IpRewriteChange,
  IpRewriteResult,
} from "./ip-rewriter";

export {
  filterAntislop,
  hasSlop,
  listSlopVocabulary,
} from "./antislop";
export type {
  AntislopReplacement,
  AntislopResult,
} from "./antislop";

// === Task 4.12 新增：误报修复 ===
export {
  repairFalsePositives,
  listBenignContextEntries,
  getBenignContextStats,
} from "./filter-repair";
export type {
  BenignContext,
  FilterRepairItem,
  FilterRepairResult,
} from "./filter-repair";
