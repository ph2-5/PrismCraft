/**
 * quality-gate/thresholds.ts — 阈值解析（v0.2）
 *
 * 零依赖纯函数：per-provider/per-model 覆盖默认阈值。
 */
import type { QualityGateConfig, QualityThresholds } from "./types";

/** 默认阈值（保守：warn 0.6 / fail 0.45） */
export const DEFAULT_THRESHOLDS: QualityThresholds = {
  warnThreshold: 0.6,
  failThreshold: 0.45,
};

/**
 * 解析某 provider/model 的生效阈值。
 * 优先级：perModel > perProvider > default。
 */
export function resolveThresholds(
  providerId: string,
  modelId: string,
  config: QualityGateConfig | undefined,
): QualityThresholds {
  if (!config) return DEFAULT_THRESHOLDS;
  const model = config.perModel?.[modelId];
  if (model) return model;
  const provider = config.perProvider?.[providerId];
  if (provider) return provider;
  return config.default;
}

/** 按阈值将 score 归类为 verdict */
export function classifyScore(
  score: number,
  thresholds: QualityThresholds,
): "pass" | "warn" | "fail" {
  if (score >= thresholds.warnThreshold) return "pass";
  if (score >= thresholds.failThreshold) return "warn";
  return "fail";
}
