/**
 * cost-engine/types.ts — 定价引擎类型（cost-tracking P1）
 *
 * 设计来源：docs/DESIGN-COST-TRACKING.md §2（单价表 Schema / 估算公式）
 * 纯类型 + 常量，零外部依赖（shared-logic 规则）。
 */

/** 计费方式：按秒 / 按次 / 按张 / 按 token */
export type BillingType = "per_second" | "per_call" | "per_image" | "per_token";

/** 价格置信度：官方公布价 / 估算值 / 推测（UI 徽标用） */
export type Confidence = "high" | "medium" | "low";

/** 单个模型的定价条目；rate=null 表示"待定价"（不参与合计） */
export interface PriceEntry {
  billing: BillingType;
  /** 单价（本表 currency 单位）；null = 待定价 */
  rate: number | null;
  /** 生效日期（YYYY-MM-DD），历史价格可追溯 */
  effectiveFrom?: string;
  confidence?: Confidence;
}

/** 单价表：provider → model → 定价条目 */
export interface PriceTable {
  version: number;
  currency: string;
  providers: Record<string, { models: Record<string, PriceEntry> }>;
}

/** 计算输入：计费参数（按 billing 分派取舍） */
export interface CostCalcInput {
  providerId: string;
  modelId: string;
  /** per_second 用 */
  durationSeconds?: number;
  /** per_image 用 */
  imageCount?: number;
  /** per_token 用 */
  tokens?: number;
}

/** 估算结果：cost=null 表示待定价（不参与合计） */
export interface CostEstimate {
  cost: number | null;
  currency: string;
  source: "estimate";
  confidence: Confidence;
  /** 供 UI 展示的计算过程，如 "5秒 × ¥0.35/秒 = ¥1.75" */
  formula: string;
}
