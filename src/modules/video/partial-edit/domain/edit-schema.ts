/**
 * Task 2A.22: 局部重绘编辑任务 Schema
 *
 * PartialEditRequest 是局部重绘的输入参数（provider-agnostic）：
 * - sourceVideoAssetId：原视频 Asset ID
 * - mask：标记区域（参考 mask-types.ts）
 * - editPrompt：用户重绘指令（如"把背景的树换成霓虹灯广告牌"）
 * - preserveUnmasked：保持 mask 外不变（默认 true，与 Seedance 2.5 行为一致）
 *
 * partial-edit-service.ts 负责把 PartialEditRequest 编排为：
 *   1. mask → base64 PNG（mask-encoder.ts）
 *   2. editPrompt + preserveUnmasked → 完整 prompt（prompt-builder.ts）
 *   3. 调用 provider.generatePartialEdit（taskSubtype='partial_redraw'）
 *   4. 轮询完成后存为新 Asset（type='partial_edit_video', sourceAssetId=sourceVideoAssetId）
 *
 * 纯类型 + 工厂函数 + 校验函数 — 无外部依赖，可单元测试。
 */

import type { MaskConfig } from "./mask-types";

/** 局部重绘请求 */
export interface PartialEditRequest {
  /** 原视频 GenerationAsset ID */
  sourceVideoAssetId: string;
  /** 标记区域 */
  mask: MaskConfig;
  /** 用户重绘指令（自然语言，如"把背景的树换成霓虹灯广告牌"） */
  editPrompt: string;
  /** 保持 mask 外不变（默认 true，与 Seedance 2.5 行为一致） */
  preserveUnmasked: true;
  /** 可选：指定 providerId（默认走 Seedance 2.5） */
  providerId?: string;
  /** 可选：指定 modelId */
  modelId?: string;
  /** 可选：视频时长（秒） */
  duration?: number;
  /** 可选：关联 storyId（用于历史记录归类） */
  storyId?: string;
  /** 可选：关联 beatId */
  beatId?: string;
}

/** 局部重绘任务创建结果 */
export interface PartialEditResult {
  /** 新 VideoTask 的 taskId */
  taskId: string;
  /** 新生成的 partial_edit_video Asset ID（任务完成后才有） */
  assetId?: string;
  /** 原 Asset ID（用于历史追溯） */
  sourceVideoAssetId: string;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
}

/** 局部重绘校验错误 */
export interface PartialEditValidationError {
  field: string;
  reason: string;
}

/** 创建默认 PartialEditRequest */
export function createPartialEditRequest(input: {
  sourceVideoAssetId: string;
  mask: MaskConfig;
  editPrompt: string;
  providerId?: string;
  modelId?: string;
  duration?: number;
  storyId?: string;
  beatId?: string;
}): PartialEditRequest {
  return {
    sourceVideoAssetId: input.sourceVideoAssetId,
    mask: input.mask,
    editPrompt: input.editPrompt,
    preserveUnmasked: true,
    providerId: input.providerId,
    modelId: input.modelId,
    duration: input.duration,
    storyId: input.storyId,
    beatId: input.beatId,
  };
}

/** 校验 PartialEditRequest 是否合法 */
export function validatePartialEditRequest(req: PartialEditRequest): PartialEditValidationError[] {
  const errors: PartialEditValidationError[] = [];
  if (!req) {
    errors.push({ field: "request", reason: "请求对象不能为空" });
    return errors;
  }
  if (!req.sourceVideoAssetId || typeof req.sourceVideoAssetId !== "string" || req.sourceVideoAssetId.trim().length === 0) {
    errors.push({ field: "sourceVideoAssetId", reason: "必须提供原视频 Asset ID" });
  }
  if (!req.mask || !Array.isArray(req.mask.shapes) || req.mask.shapes.length === 0) {
    errors.push({ field: "mask.shapes", reason: "必须标记至少一个重绘区域" });
  }
  if (typeof req.mask?.videoTimestamp !== "number" || req.mask.videoTimestamp < 0) {
    errors.push({ field: "mask.videoTimestamp", reason: "videoTimestamp 必须为非负数（秒）" });
  }
  if (!req.editPrompt || typeof req.editPrompt !== "string" || req.editPrompt.trim().length === 0) {
    errors.push({ field: "editPrompt", reason: "重绘指令不能为空" });
  }
  if (req.editPrompt && req.editPrompt.length > 2000) {
    errors.push({ field: "editPrompt", reason: "重绘指令过长（超过 2000 字符）" });
  }
  if (req.preserveUnmasked !== true) {
    errors.push({ field: "preserveUnmasked", reason: "当前仅支持 preserveUnmasked=true" });
  }
  return errors;
}

/** 检查请求是否合法（快捷方式） */
export function isValidPartialEditRequest(req: PartialEditRequest): boolean {
  return validatePartialEditRequest(req).length === 0;
}
