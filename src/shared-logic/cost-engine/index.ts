/**
 * cost-engine — 成本估算引擎（cost-tracking P1）
 *
 * 零依赖纯函数：按计费方式（按秒/按次/按张/按 token）估算 AI 调用成本。
 * 与成本看板/生成前预估共用同一 calculateCost()，杜绝两套口径。
 */
export * from "./types";
export { DEFAULT_PRICE_TABLE, PRICE_TABLE_VERSION } from "./prices";
export { calculateCost, sumEstimates, roundToCent } from "./calculator";
