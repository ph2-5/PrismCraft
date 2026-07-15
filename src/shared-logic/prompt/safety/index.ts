/**
 * Safety 模块 barrel（Task 1.4 v5.3 增强）
 *
 * 包含 IP 安全改写 + 反空泛词汇过滤。
 * 本文件属于 shared-logic 层，零外部依赖。
 */

export {
  rewriteIp,
  needsUserConfirmation,
  listKnownKeywords,
} from "./ip-rewriter";
export type {
  IpCategory,
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
