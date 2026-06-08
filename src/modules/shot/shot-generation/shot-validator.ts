import Ajv from "ajv";
import {
  ShotParamsSchema,
  StoryBeatOutputSchema,
  StoryPlanOutputSchema,
  type ShotParamsType,
} from "./shot-params";
import { fixShotParams, fixStoryBeat } from "./shot-params-fixer";

const ajv = new Ajv({ allErrors: true, useDefaults: true });
ajv.addFormat("uri", /^https?:\/\/.+/);

const validateShotParamsFn = ajv.compile(ShotParamsSchema);
const validateStoryBeatFn = ajv.compile(StoryBeatOutputSchema);
const validateStoryPlanFn = ajv.compile(StoryPlanOutputSchema);

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

export function extractAjvErrors(
  validateFn: { errors?: unknown[] | null },
  prefix: string = "",
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!validateFn.errors) return errors;

  for (const rawErr of validateFn.errors) {
    const err = rawErr as Record<string, unknown>;
    const instancePath = (err.instancePath as string) || "";
    const field = prefix + instancePath.slice(1);
    const keyword = err.keyword as string;
    const message = (err.message as string) || "校验失败";
    const params = (err.params as Record<string, unknown>) || {};
    const missingProp = params.missingProperty as string | undefined;

    const fieldName = missingProp
      ? field
        ? `${field}.${missingProp}`
        : missingProp
      : field;
    const isRequired = keyword === "required";

    if (isRequired || keyword === "enum" || keyword === "minLength") {
      errors.push({
        field: fieldName,
        message: isRequired
          ? `缺少必填字段: ${missingProp || fieldName}`
          : message,
        severity: "error",
      });
    } else {
      errors.push({
        field: fieldName,
        message,
        severity: "warning",
      });
    }
  }

  return errors;
}

export function validateShotParams(
  params: Record<string, unknown>,
): ValidationResult<ShotParamsType> {
  const { fixed, autoFixed } = fixShotParams(params);

  const valid = validateShotParamsFn(fixed);
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!valid) {
    const ajvErrors = extractAjvErrors(validateShotParamsFn);
    for (const err of ajvErrors) {
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

  if (!fixed.cameraMovement && !fixed.cameraAngle) {
    warnings.push({
      field: "camera",
      message: "未指定镜头角度和运镜，将使用默认值",
      severity: "warning",
    });
  }

  return {
    valid: errors.length === 0,
    data: fixed as ShotParamsType,
    errors,
    warnings,
    autoFixed,
  };
}

export function validateStoryBeatOutput(
  beat: Record<string, unknown>,
): ValidationResult {
  const { fixed, autoFixed } = fixStoryBeat(beat);

  const valid = validateStoryBeatFn(fixed);
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!valid) {
    const ajvErrors = extractAjvErrors(validateStoryBeatFn);
    for (const err of ajvErrors) {
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

export function validateStoryPlanOutput(plan: unknown[]): ValidationResult {
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

  const planValid = validateStoryPlanFn(fixedPlan);
  if (!planValid) {
    const ajvErrors = extractAjvErrors(validateStoryPlanFn);
    allErrors.push(...ajvErrors);
  }

  return {
    valid: allErrors.length === 0,
    data: fixedPlan,
    errors: allErrors,
    warnings: allWarnings,
    autoFixed: allAutoFixed,
  };
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
