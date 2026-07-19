import { z } from "zod";

export const apiConfigSchema = z.object({
  apiUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  size: z.string().optional(),
});

export const apiErrorCodeSchema = z.enum([
  "INVALID_API_KEY",
  "RATE_LIMITED",
  "ENDPOINT_NOT_FOUND",
  "API_SERVER_ERROR",
  "TIMEOUT",
  "CONNECTION_FAILED",
  "INVALID_RESPONSE",
  "POLLINATIONS_FAILED",
  "INTERNAL_ERROR",
  "UNKNOWN_ERROR",
]);

export const apiResponseSchema = z.union([
  z.object({ success: z.literal(true), data: z.unknown(), source: z.string().optional(), error: z.string().optional(), message: z.string().optional() }),
  z.object({ success: z.literal(false), error: z.string(), message: z.string().optional(), data: z.unknown().optional() }),
]);

export const imageGenerationResultSchema = z.object({
  imageUrl: z.string(),
  source: z.string().optional(),
  prompt: z.string().optional(),
});

export const videoGenerationResultSchema = z.object({
  videoUrl: z.string().optional(),
  taskId: z.string().optional(),
  status: z.string().optional(),
  promptWasTruncated: z.boolean().optional(),
  originalPromptLength: z.number().optional(),
  providerId: z.string().optional(),
  providerModelId: z.string().optional(),
  providerFormat: z.string().optional(),
  urlTtl: z.number().optional(),
});

export const videoTaskStatusSchema = z.enum(["pending", "generating", "completed", "failed", "cancelled", "retrying", "timeout", "paused"]);

/**
 * Task 2A.22: VideoTask 子类型。
 * - normal: 普通视频生成（默认）
 * - partial_redraw: 局部重绘（基于已生成视频 + mask 做局部编辑）
 */
export const videoTaskSubtypeSchema = z.enum(["normal", "partial_redraw"]);

/**
 * Task 2A.22: Mask 边界框（用于持久化时快速查询 mask 范围）
 */
export const maskBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const videoTaskSchema = z.object({
  taskId: z.string(),
  status: videoTaskStatusSchema,
  progress: z.number().min(0).max(100),
  videoUrl: z.string().optional(),
  localVideoPath: z.string().optional(),
  message: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  apiUrl: z.string().optional(),
  apiEndpoint: z.string().optional(),
  providerId: z.string().optional(),
  providerModelId: z.string().optional(),
  providerFormat: z.string().optional(),
  fixedImageUrl: z.string().optional(),
  fixedImageLockType: z.enum(["character", "scene"]).optional(),
  referenceVideoUrl: z.string().optional(),
  referenceVideoMimicryLevel: z.enum(["light", "medium", "deep"]).optional(),
  templateId: z.string().optional(),
  templateShots: z.string().optional(),
  beatId: z.string().optional(),
  storyId: z.string().optional(),
  storyTitle: z.string().optional(),
  beatTitle: z.string().optional(),
  cacheFailed: z.boolean().optional(),
  promptWasTruncated: z.boolean().optional(),
  pollFailureCount: z.number().nonnegative().optional(),
  pollCount: z.number().nonnegative().optional(),
  recoveryAttempts: z.number().nonnegative().optional(),
  lastPolledAt: z.string().optional(),
  vectorClock: z.string().optional(),
  syncStatus: z.enum(["pending", "synced", "conflict"]).optional(),
  urlObtainedAt: z.number().optional(),
  urlTtl: z.number().optional(),
  priority: z.number().nonnegative().optional(),
  // Task 2A.22: 局部重绘扩展字段（向后兼容，全部 optional）
  taskSubtype: videoTaskSubtypeSchema.optional(),
  sourceVideoAssetId: z.string().optional(),
  maskData: z.string().optional(), // base64 PNG
  maskBounds: maskBoundsSchema.optional(),
  editPrompt: z.string().optional(),
});

export const healthStatusSchema = z.object({
  text: z.object({ configured: z.boolean(), provider: z.string(), available: z.boolean() }),
  image: z.object({ configured: z.boolean(), provider: z.string(), available: z.boolean() }),
  video: z.object({ configured: z.boolean(), provider: z.string(), available: z.boolean() }),
  vision: z.object({ configured: z.boolean(), provider: z.string(), available: z.boolean() }),
});

export const userApiConfigSchema = z.object({
  imageApiUrl: z.string(),
  imageApiKey: z.string(),
  imageModel: z.string(),
  videoApiUrl: z.string(),
  videoApiKey: z.string(),
  videoModel: z.string(),
  textApiUrl: z.string(),
  textApiKey: z.string(),
  textModel: z.string(),
  visionApiUrl: z.string(),
  visionApiKey: z.string(),
  visionModel: z.string(),
  useCustomImageApi: z.boolean(),
  useCustomVideoApi: z.boolean(),
  useCustomVisionApi: z.boolean(),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiResponse<T = unknown> = 
  | { success: true; data: T; source?: string; error?: string; message?: string }
  | { success: false; error: string; message?: string; data?: T };
export type ImageGenerationResult = z.infer<typeof imageGenerationResultSchema>;
export type VideoGenerationResult = z.infer<typeof videoGenerationResultSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type UserApiConfig = z.infer<typeof userApiConfigSchema>;

export type VideoTaskStatus = z.infer<typeof videoTaskStatusSchema>;
export type VideoTaskSubtype = z.infer<typeof videoTaskSubtypeSchema>;
export type MaskBounds = z.infer<typeof maskBoundsSchema>;

export type VideoTask = z.infer<typeof videoTaskSchema>;

export interface ModelSelection {
  providerId: string;
  modelId: string;
  providerName: string;
  modelName: string;
  format?: string;
}
