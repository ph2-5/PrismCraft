import type { z } from "zod";
import {
  ShotParamsZod,
  StoryBeatZod,
  StoryPlanZod,
  type ShotParamsType,
} from "./shot-params";
import { fixShotParams, fixStoryBeat } from "./shot-params-fixer";
import { errorLogger } from "@/shared/error-logger";

// 说明：早期实现用 AJV（ajv.compile）运行时编译 JSON Schema —— AJV 依赖
// new Function 生成验证代码，会被 CSP（script-src 不含 'unsafe-eval'）拦截，
// 导致 storyboard 懒加载页面在受限环境中崩溃（EvalError）。已迁移为 zod
// 运行时校验（纯模式匹配，零代码生成），语义与 JSON Schema 版本保持一致。

class ValidationCache<T> {
  private readonly cache = new Map<string, { result: T; timestamp: number }>();
  private readonly maxSize: number;
  private order: string[] = [];

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      const idx = this.order.indexOf(key);
      if (idx !== -1) {
        this.order.splice(idx, 1);
        this.order.push(key);
      }
      return entry.result;
    }
    return undefined;
  }

  set(key: string, result: T): void {
    if (this.cache.has(key)) {
      const idx = this.order.indexOf(key);
      if (idx !== -1) {
        this.order.splice(idx, 1);
        this.order.push(key);
      }
      this.cache.set(key, { result, timestamp: Date.now() });
      return;
    }

    if (this.cache.size >= this.maxSize) {
      const oldest = this.order.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, { result, timestamp: Date.now() });
    this.order.push(key);
  }

  clear(): void {
    this.cache.clear();
    this.order = [];
  }
}

const shotParamsCache = new ValidationCache<ValidationResult<ShotParamsType>>();
const storyPlanCache = new ValidationCache<ValidationResult>();

export function clearValidationCache(): void {
  shotParamsCache.clear();
  storyPlanCache.clear();
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
  severity: "error" | "warning";
}

export interface ValidationResult<T = unknown> {
  valid: boolean;
  data: T;
  errors: ValidationError[];
  warnings: ValidationError[];
  autoFixed: string[];
}

export function extractZodErrors(result: z.ZodSafeParseResult<unknown>): ValidationError[] {
  if (result.success) return [];
  const errors: ValidationError[] = [];

  for (const issue of result.error.issues) {
    const field = issue.path
      .map((p) => (typeof p === "number" ? `[${p}]` : p))
      .join(".");
    const code = issue.code;
    // 与原 AJV 映射语义对齐：缺失必填字段 / enum / 字符串过短 → error，其余 → warning
    const isMissing = code === "invalid_type" && (issue as { received?: unknown }).received === "undefined";
    const isEnum = code === "invalid_value"; // zod 4：enum/literal 失败
    const isTooShort = code === "too_small" && (issue as { type?: string }).type === "string";

    if (isMissing || isEnum || isTooShort) {
      errors.push({
        field,
        message: isMissing ? `缺少必填字段: ${field || "字段"}` : issue.message,
        severity: "error",
      });
    } else {
      errors.push({
        field,
        message: issue.message,
        severity: "warning",
      });
    }
  }

  return errors;
}

export interface ValidateShotParamsOptions {
  useCache?: boolean;
}

export function validateShotParams(
  params: Record<string, unknown>,
  options?: ValidateShotParamsOptions,
): ValidationResult<ShotParamsType> {
  const useCache = options?.useCache !== false;

  if (useCache) {
    try {
      const cacheKey = JSON.stringify(params);
      const cached = shotParamsCache.get(cacheKey);
      if (cached) return cached;
    } catch (err) {
      errorLogger.warn("Validation cache key generation failed", err);
    }
  }

  const { fixed, autoFixed } = fixShotParams(params);

  const parsed = ShotParamsZod.safeParse(fixed);
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!parsed.success) {
    const zodErrors = extractZodErrors(parsed);
    for (const err of zodErrors) {
      if (err.severity === "error") errors.push(err);
      else warnings.push(err);
    }
  }

  if (!fixed.prompt || (fixed.prompt as string).length < 20) {
    warnings.push({
      field: "prompt",
      message: "提示词过短，可能影响生成质量",
      value: fixed.prompt,
      severity: "warning",
    });
  }

  // PR 2d Step 4g：检查 shotInstruction 中的 camera 字段（替代旧顶层字段）
  const shotInstruction = fixed.shotInstruction as
    | { cameraAngle?: string; cameraMovement?: string }
    | undefined;
  if (!shotInstruction?.cameraMovement && !shotInstruction?.cameraAngle) {
    warnings.push({
      field: "camera",
      message: "未指定镜头角度和运镜，将使用默认值",
      severity: "warning",
    });
  }

  const result: ValidationResult<ShotParamsType> = {
    valid: errors.length === 0,
    data: fixed as ShotParamsType,
    errors,
    warnings,
    autoFixed,
  };

  if (useCache) {
    try {
      const cacheKey = JSON.stringify(params);
      shotParamsCache.set(cacheKey, result);
    } catch (err) {
      errorLogger.warn("Validation cache store failed", err);
    }
  }

  return result;
}

export function validateStoryBeatOutput(
  beat: Record<string, unknown>,
): ValidationResult {
  const { fixed, autoFixed } = fixStoryBeat(beat);

  const parsed = StoryBeatZod.safeParse(fixed);
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!parsed.success) {
    const zodErrors = extractZodErrors(parsed);
    for (const err of zodErrors) {
      if (err.severity === "error") errors.push(err);
      else warnings.push(err);
    }
  }

  return {
    valid: errors.length === 0,
    data: fixed,
    errors,
    warnings,
    autoFixed,
  };
}

export interface ValidateStoryPlanOptions {
  useCache?: boolean;
}

export function validateStoryPlanOutput(
  plan: unknown[],
  options?: ValidateStoryPlanOptions,
): ValidationResult {
  const useCache = options?.useCache !== false;

  if (useCache) {
    try {
      const cacheKey = JSON.stringify(plan);
      const cached = storyPlanCache.get(cacheKey);
      if (cached) return cached;
    } catch (err) {
      errorLogger.warn("Validation cache key generation failed", err);
    }
  }

  const fixedPlan: Record<string, unknown>[] = [];
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];
  const allAutoFixed: string[] = [];

  for (let i = 0; i < plan.length; i++) {
    const result = validateStoryBeatOutput(plan[i] as Record<string, unknown>);
    fixedPlan.push(result.data as Record<string, unknown>);
    allErrors.push(
      ...result.errors.map((e) => ({ ...e, field: `[${i}].${e.field}` })),
    );
    allWarnings.push(
      ...result.warnings.map((w) => ({ ...w, field: `[${i}].${w.field}` })),
    );
    allAutoFixed.push(...result.autoFixed.map((f) => `[分镜${i + 1}] ${f}`));
  }

  // Only validate array-level constraints (minItems, maxItems), not per-item fields
  // which were already validated individually above
  const planParsed = StoryPlanZod.safeParse(fixedPlan);
  if (!planParsed.success) {
    // 只保留数组根级错误（minItems/maxItems，zod path 为空）；
    // 元素级错误已在 validateStoryBeatOutput 单独报告
    const arrayOnlyErrors = planParsed.error.issues
      .filter((issue) => issue.path.length === 0)
      .map((issue) => ({
        field: "",
        message: issue.message,
        severity: "error" as const,
      }));
    allErrors.push(...arrayOnlyErrors);
  }

  const result: ValidationResult = {
    valid: allErrors.length === 0,
    data: fixedPlan,
    errors: allErrors,
    warnings: allWarnings,
    autoFixed: allAutoFixed,
  };

  if (useCache) {
    try {
      const cacheKey = JSON.stringify(plan);
      storyPlanCache.set(cacheKey, result);
    } catch (err) {
      errorLogger.warn("Validation cache store failed", err);
    }
  }

  return result;
}

export function formatValidationResult(result: ValidationResult): string {
  const parts: string[] = [];

  if (result.autoFixed.length > 0) {
    parts.push("自动修复:");
    result.autoFixed.forEach((f) => parts.push(`  ✓ ${f}`));
  }

  if (result.warnings.length > 0) {
    parts.push("警告:");
    result.warnings.forEach((w) => parts.push(`  ⚠ ${w.field}: ${w.message}`));
  }

  if (result.errors.length > 0) {
    parts.push("错误:");
    result.errors.forEach((e) => parts.push(`  ✗ ${e.field}: ${e.message}`));
  }

  if (parts.length === 0) {
    parts.push("校验通过，无需修复");
  }

  return parts.join("\n");
}
