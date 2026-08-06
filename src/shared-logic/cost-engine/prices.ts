/**
 * cost-engine/prices.ts — 默认单价表（cost-tracking P1）
 *
 * 设计来源：docs/DESIGN-COST-TRACKING.md §2.1/§2.3
 * - 结构完整（13 家占位），数值为公开定价近似值（confidence: medium），
 *   正式运营前应核对各平台最新价目表（更新机制：可插拔远端 fetchPriceTable）
 * - rate=null → "待定价"（未覆盖的模型不参与合计）
 * - 币种 CNY，按秒/按次/按张/按 token 分派
 */
import type { PriceTable } from "./types";

export const DEFAULT_PRICE_TABLE: PriceTable = {
  version: 1,
  currency: "CNY",
  providers: {
    // 可灵（快手）— 视频按秒
    kuaishou: {
      models: {
        "kling-v1": { billing: "per_second", rate: 0.35, effectiveFrom: "2026-01-01", confidence: "medium" },
        "kling-v2": { billing: "per_second", rate: 0.45, effectiveFrom: "2026-01-01", confidence: "medium" },
      },
    },
    // 可灵（旧 provider id 别名）
    kling: {
      models: {
        "kling-v1": { billing: "per_second", rate: 0.35, effectiveFrom: "2026-01-01", confidence: "medium" },
      },
    },
    // 火山引擎 Seedance — 视频按秒
    volcengine: {
      models: {
        "seedance-v1": { billing: "per_second", rate: 0.4, effectiveFrom: "2026-01-01", confidence: "medium" },
        "seedance-v2": { billing: "per_second", rate: 0.5, effectiveFrom: "2026-01-01", confidence: "medium" },
      },
    },
    // MiniMax — 视频按次/秒（取按秒口径）
    minimax: {
      models: {
        "video-01": { billing: "per_second", rate: 0.3, effectiveFrom: "2026-01-01", confidence: "medium" },
        "abab6.5s": { billing: "per_token", rate: 0.0001, effectiveFrom: "2026-01-01", confidence: "low" },
      },
    },
    // Pika — 视频按次（按生成次数计费）
    pika: {
      models: {
        "pika-v1": { billing: "per_call", rate: 1.2, effectiveFrom: "2026-01-01", confidence: "medium" },
        "pika-v2": { billing: "per_call", rate: 1.5, effectiveFrom: "2026-01-01", confidence: "medium" },
      },
    },
    // Runway — 视频按秒
    runway: {
      models: {
        "gen-3": { billing: "per_second", rate: 0.5, effectiveFrom: "2026-01-01", confidence: "medium" },
        "gen-4": { billing: "per_second", rate: 0.6, effectiveFrom: "2026-01-01", confidence: "medium" },
      },
    },
    // Luma Dream Machine — 视频按秒
    luma: {
      models: {
        "dream-machine-v1": { billing: "per_second", rate: 0.45, effectiveFrom: "2026-01-01", confidence: "medium" },
        "ray-v1": { billing: "per_second", rate: 0.55, effectiveFrom: "2026-01-01", confidence: "medium" },
      },
    },
    // OpenAI — 图像按张 / 文本按 token
    openai: {
      models: {
        "dall-e-3": { billing: "per_image", rate: 0.32, effectiveFrom: "2026-01-01", confidence: "high" },
        "gpt-4o-mini": { billing: "per_token", rate: 0.00002, effectiveFrom: "2026-01-01", confidence: "high" },
        "gpt-4o": { billing: "per_token", rate: 0.0002, effectiveFrom: "2026-01-01", confidence: "high" },
      },
    },
    // 即梦/其他视频模型占位（待定价）
    jimeng: {
      models: {
        "seedance-pro": { billing: "per_second", rate: null, confidence: "low" },
      },
    },
    // 兜底：未覆盖的 provider 自动 "待定价"（无需在此列出）
  },
};

/** 版本号：供远端价格表协商（fetchPriceTable 增强，P2） */
export const PRICE_TABLE_VERSION = DEFAULT_PRICE_TABLE.version;
