/**
 * Task 2A.23: 漂移策略
 *
 * 定义 QC 闭环的阈值和降级路径：
 * - warningThreshold：漂移预警阈值（默认 0.75）
 * - criticalThreshold：漂移严重阈值（默认 0.6）
 * - maxRegenerateAttempts：最大重生成次数（默认 2）
 * - fallbackToFaceSwap：超过重试次数后是否调 face-swap（默认 true）
 * - autoMarkManualReview：face-swap 后仍不达标是否标记人工审核（默认 true）
 *
 * 纯类型 + 默认值 + 解析函数 — 无外部依赖，可单元测试。
 */

/** 漂移策略 */
export interface DriftPolicy {
  /** 漂移预警阈值（cosine 相似度，低于此值触发 warning） */
  warningThreshold: number;
  /** 漂移严重阈值（cosine 相似度，低于此值触发 critical） */
  criticalThreshold: number;
  /** 最大重生成次数（超过后走 face-swap） */
  maxRegenerateAttempts: number;
  /** 超过重试次数后是否调 face-swap */
  fallbackToFaceSwap: boolean;
  /** face-swap 后仍不达标是否标记人工审核 */
  autoMarkManualReview: boolean;
  /** 抽帧频率（帧/秒，默认 8） */
  sampleFrameRate: number;
  /** 是否禁用 face 检测（动漫风格适用） */
  disableFaceDetection: boolean;
}

/** 默认漂移策略 */
export const DEFAULT_DRIFT_POLICY: DriftPolicy = {
  warningThreshold: 0.75,
  criticalThreshold: 0.6,
  maxRegenerateAttempts: 2,
  fallbackToFaceSwap: true,
  autoMarkManualReview: true,
  sampleFrameRate: 8,
  disableFaceDetection: false,
};

/**
 * 解析策略覆盖，合并默认值。
 *
 * 仅接受有效范围内的覆盖值，无效值回退到默认。
 */
export function resolvePolicy(overrides?: Partial<DriftPolicy>): DriftPolicy {
  if (!overrides) return { ...DEFAULT_DRIFT_POLICY };

  return {
    warningThreshold: clamp(overrides.warningThreshold ?? DEFAULT_DRIFT_POLICY.warningThreshold, 0, 1),
    criticalThreshold: clamp(overrides.criticalThreshold ?? DEFAULT_DRIFT_POLICY.criticalThreshold, 0, 1),
    maxRegenerateAttempts: Math.max(0, overrides.maxRegenerateAttempts ?? DEFAULT_DRIFT_POLICY.maxRegenerateAttempts),
    fallbackToFaceSwap: overrides.fallbackToFaceSwap ?? DEFAULT_DRIFT_POLICY.fallbackToFaceSwap,
    autoMarkManualReview: overrides.autoMarkManualReview ?? DEFAULT_DRIFT_POLICY.autoMarkManualReview,
    sampleFrameRate: Math.max(1, overrides.sampleFrameRate ?? DEFAULT_DRIFT_POLICY.sampleFrameRate),
    disableFaceDetection: overrides.disableFaceDetection ?? DEFAULT_DRIFT_POLICY.disableFaceDetection,
  };
}

/**
 * 校验策略内部一致性。
 *
 * - warningThreshold 必须 > criticalThreshold（否则 warning 永远不触发）
 * - 两者均在 [0, 1] 范围内
 */
export function validatePolicy(policy: DriftPolicy): string[] {
  const errors: string[] = [];
  if (policy.warningThreshold <= policy.criticalThreshold) {
    errors.push(
      `warningThreshold (${policy.warningThreshold}) 必须大于 criticalThreshold (${policy.criticalThreshold})`,
    );
  }
  if (policy.warningThreshold < 0 || policy.warningThreshold > 1) {
    errors.push(`warningThreshold (${policy.warningThreshold}) 必须在 [0, 1] 范围内`);
  }
  if (policy.criticalThreshold < 0 || policy.criticalThreshold > 1) {
    errors.push(`criticalThreshold (${policy.criticalThreshold}) 必须在 [0, 1] 范围内`);
  }
  if (policy.maxRegenerateAttempts < 0) {
    errors.push(`maxRegenerateAttempts (${policy.maxRegenerateAttempts}) 不能为负数`);
  }
  if (policy.sampleFrameRate < 1) {
    errors.push(`sampleFrameRate (${policy.sampleFrameRate}) 必须 >= 1`);
  }
  return errors;
}

/**
 * 判断是否应该走 face-swap fallback（首次进入 face-swap 阶段）。
 *
 * 条件：
 * 1. policy.fallbackToFaceSwap = true
 * 2. retryCount === maxRegenerateAttempts（刚好达到重试上限，进入首次 face-swap）
 *
 * 注意：retryCount > maxRegenerateAttempts 表示 face-swap 已尝试过，
 * 此时由 shouldMarkManualReview 接管，进入 manual_review 终点。
 */
export function shouldFallbackToFaceSwap(policy: DriftPolicy, retryCount: number): boolean {
  return policy.fallbackToFaceSwap && retryCount === policy.maxRegenerateAttempts;
}

/**
 * 判断是否应该标记人工审核。
 *
 * 条件：
 * 1. policy.autoMarkManualReview = true
 * 2. face-swap 已尝试（retryCount > maxRegenerateAttempts）
 */
export function shouldMarkManualReview(policy: DriftPolicy, retryCount: number): boolean {
  return policy.autoMarkManualReview && retryCount > policy.maxRegenerateAttempts;
}

/** 工具函数：限制数值在 [min, max] 范围内 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
