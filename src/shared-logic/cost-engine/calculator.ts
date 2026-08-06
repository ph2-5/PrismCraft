/**
 * cost-engine/calculator.ts — 成本估算公式（cost-tracking P1）
 *
 * 设计来源：docs/DESIGN-COST-TRACKING.md §2.2
 * 纯函数：按 billing 分派计费公式，返回 { cost, formula, confidence }。
 * 规则：
 * - per_second → durationSeconds × rate
 * - per_image  → imageCount × rate
 * - per_token  → tokens × rate
 * - per_call   → rate（一次调用）
 * - 未知 provider/model 或 rate=null → cost=null（"待定价"，不参与合计）
 * - 金额保留 2 位小数（¥ 分位）
 */
import type { CostCalcInput, CostEstimate, PriceTable } from "./types";
import { DEFAULT_PRICE_TABLE } from "./prices";

/** 金额四舍五入到分（EPSILON 修正浮点表示误差，如 1.005 → 1.01） */
export function roundToCent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCost(
  input: CostCalcInput,
  table: PriceTable = DEFAULT_PRICE_TABLE,
): CostEstimate {
  const entry = table.providers[input.providerId]?.models[input.modelId];

  // 未知 provider/model 或待定价（rate=null）
  if (!entry || entry.rate == null) {
    return {
      cost: null,
      currency: table.currency,
      source: "estimate",
      confidence: "low",
      formula: "待定价",
    };
  }

  const rate = entry.rate;
  const currencySymbol = table.currency === "CNY" ? "¥" : table.currency;

  switch (entry.billing) {
    case "per_second": {
      const qty = input.durationSeconds ?? 0;
      const cost = roundToCent(qty * rate);
      return {
        cost,
        currency: table.currency,
        source: "estimate",
        confidence: entry.confidence ?? "low",
        formula: `${qty}秒 × ${currencySymbol}${rate}/秒 = ${currencySymbol}${cost.toFixed(2)}`,
      };
    }
    case "per_image": {
      const qty = input.imageCount ?? 0;
      const cost = roundToCent(qty * rate);
      return {
        cost,
        currency: table.currency,
        source: "estimate",
        confidence: entry.confidence ?? "low",
        formula: `${qty}张 × ${currencySymbol}${rate}/张 = ${currencySymbol}${cost.toFixed(2)}`,
      };
    }
    case "per_token": {
      const qty = input.tokens ?? 0;
      const cost = roundToCent(qty * rate);
      return {
        cost,
        currency: table.currency,
        source: "estimate",
        confidence: entry.confidence ?? "low",
        formula: `${qty}token × ${currencySymbol}${rate}/token = ${currencySymbol}${cost.toFixed(2)}`,
      };
    }
    case "per_call":
      return {
        cost: roundToCent(rate),
        currency: table.currency,
        source: "estimate",
        confidence: entry.confidence ?? "low",
        formula: `1次 × ${currencySymbol}${rate}/次 = ${currencySymbol}${roundToCent(rate).toFixed(2)}`,
      };
  }
}

/** 批量合计：忽略待定价（cost=null）条目，返回有效合计 */
export function sumEstimates(estimates: CostEstimate[]): { total: number | null; pendingCount: number } {
  let total = 0;
  let pendingCount = 0;
  for (const est of estimates) {
    if (est.cost == null) {
      pendingCount += 1;
    } else {
      total += est.cost;
    }
  }
  return { total: pendingCount === estimates.length ? null : roundToCent(total), pendingCount };
}
