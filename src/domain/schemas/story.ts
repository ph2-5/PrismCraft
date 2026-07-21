import { z } from "zod";
import type { SceneElement } from "./scene";
import type { BlockoutScene } from "./blockout-scene";
import {
  fixedImageSchema,
  referenceVideoSchema,
  templateConfigSchema,
  shotReferenceSchema,
  shotInstructionSchema,
  featureAnchoringSchema,
  consistencyCheckResultSchema,
  shotGenerationStatusSchema,
  shotGenerationResultSchema,
  beatCameraSchema,
  qcReportSchema,
} from "./shot-system";
export { beatCameraSchema };

function nullToUndef<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v ?? undefined), schema.optional());
}

function nullToEmpty(schema: z.ZodString) {
  return z.preprocess((v) => (v ?? ""), schema);
}

function nullToPositiveNumberOptional() {
  return z.preprocess(
    (v) => (v == null ? undefined : Number(v)),
    z.number().positive().optional(),
  );
}

export const storyStyleGuideSchema = z.object({
  styleImageUrl: z.string().optional(),
  stylePrompt: z.string().optional(),
  colorPalette: z.array(z.string()).optional(),
  artStyle: z.string().optional(),
  moodAtmosphere: z.string().optional(),
  generatedAt: z.string().optional(),
  source: z.enum(["ai", "upload", "manual"]).optional(),
});

export const chainModeSchema = z.enum(["auto", "isolated", "custom", "asset"]).default("auto");

export const beatInputSchema = z.enum(["ai", "upload", "asset", "isolated"]).default("ai");
export const frameInputSchema = z.enum(["ai", "upload", "keyframe", "isolated"]).default("ai");
export const videoInputSchema = z.enum(["ai", "upload", "framepair", "isolated"]).default("ai");

export const referenceImageWeightSchema = z.object({
  url: z.string(),
  weight: z.number().min(0).max(1),
  type: z.enum(["portrait", "scene", "style", "prev_frame"]),
  // Reserved for future per-image caption support. Currently not read by any
  // prompt-engine/prompt-service/api-gateway code path; image content is conveyed
  // via character/scene description fields in the prompt text itself.
  description: z.string().optional(),
});

export const promptLabSchema = z.object({
  coreElements: z.string(),
  cameraAction: z.string(),
  styleAtmosphere: z.string(),
  negativePrompt: z.string().optional(),
  referenceWeights: z.array(referenceImageWeightSchema).optional(),
  targetModel: z.string().optional(),
  targetProvider: z.string().optional(),
  estimatedCost: z.number().optional(),
  estimatedTokens: z.number().optional(),
  firstFramePrompt: z.string().optional(),
  videoPrompt: z.string().optional(),
});

export const storyBeatKeyframeSchema = z.object({
  imageUrl: z.string().optional(),
  prompt: z.string().optional(),
  generatedAt: z.string().optional(),
  source: z.enum(["ai", "upload"]).optional(),
  referencedPrevKeyframe: z.string().optional(),
});

export const storyBeatFramePairSchema = z.object({
  firstFrameUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  firstFramePrompt: z.string().optional(),
  lastFramePrompt: z.string().optional(),
  generatedAt: z.string().optional(),
  source: z.enum(["ai", "upload"]).optional(),
  firstFrame: z.object({
    imageUrl: z.string(),
    prompt: z.string(),
    derivedFrom: z.string(),
  }).optional(),
  lastFrame: z.object({
    imageUrl: z.string(),
    prompt: z.string(),
    derivedFrom: z.string(),
  }).optional(),
});

export const storyBeatVideoSchema = z.object({
  videoUrl: z.string().optional(),
  taskId: z.string().optional(),
  status: shotGenerationStatusSchema.optional(),
  generatedAt: z.string().optional(),
  source: z.enum(["ai", "upload"]).optional(),
  prompt: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string().optional(),
});

export const elementBindingSchema = z.object({
  role: z.string().optional(),
  position: z.string().optional(),
  action: z.string().optional(),
  emotion: z.string().optional(),
  description: z.string().optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
});

/**
 * 场景转换项。表达"主场景（StoryBeat.sceneId）→ 目标场景"的过渡。
 *
 * 设计说明：
 * - `sceneId` 指向目标场景（必须存在于 scenes 表中，删除场景时由调用方校验）
 * - `transitionType` 复用 beatCameraSchema 中的转场枚举（cut/dissolve/wipe/fade）
 * - `description` 可选，让用户标注"为什么转场"（如"开门进入新房间"）
 * - prompt-engine 在 `single-beat-prompt.ts` 中解析此字段，拼入【场景转换】标签
 */
export const sceneTransitionSchema = z.object({
  sceneId: z.string(),
  transitionType: z.enum(["cut", "dissolve", "wipe", "fade"]).optional(),
  description: z.string().optional(),
});

export const VALID_SHOT_TYPES = new Set([
  "wide",
  "medium",
  "close",
  "extreme_close",
  "extreme_wide",
  "low",
  "high",
  "birdseye",
  "wormseye",
]);

export const storyBeatSchema = z.object({
  // ── Core identity ──
  id: z.string(),
  sequence: z.number(),
  order: z.number().optional(),
  description: nullToEmpty(z.string()),
  duration: nullToPositiveNumberOptional(),
  type: z
    .enum(["action", "dialogue", "scene", "transition", "effect"])
    .optional(),
  title: nullToUndef(z.string()),
  content: nullToUndef(z.string()),
  transition: nullToUndef(z.string()),

  // ── Character & scene bindings ──
  characterIds: z.array(z.string()),
  characterOutfits: z.record(z.string(), z.string()).optional(),
  sceneId: nullToUndef(z.string()),
  /**
   * 场景转换列表。当单张分镜需要进行一系列场景转换时使用（例如"开门进入新房间 → 走过走廊 → 抵达客厅"）。
   *
   * 与 `sceneId` 关系：`sceneId` 是分镜的"起始主场景"，`sceneTransitions` 描述从主场景过渡到其他场景的序列。
   * 一张分镜可以只绑定一个场景（`sceneId` only），也可以是"主场景 + 转场序列"（`sceneId` + `sceneTransitions`）。
   */
  sceneTransitions: z.array(sceneTransitionSchema).optional(),
  sceneElements: z.array(z.custom<SceneElement>()).optional(),
  elementIds: z.array(z.string()),
  elementBindings: z.record(z.string(), elementBindingSchema).optional(),

  // ── Shot system ──
  /**
   * 镜头属性容器：仅保留 shotInstruction 中无对应字段的独有字段
   * （`distance`/`speed`/`relationType`/`transitionType`/`transitionDuration`）。
   *
   * PR 7：已删除 `angle`/`movement` 子字段（与 shotInstruction 重合）；
   * 已删除顶层 `shotType` 字段（与 `shotInstruction.shotSize` 重合）。
   * 旧数据中残留的 angle/movement/shotType 由 migration v8 迁移到 shotInstruction。
   */
  camera: beatCameraSchema.optional(),
  shotInstruction: shotInstructionSchema.optional(),
  reference: shotReferenceSchema.optional(),
  featureAnchoring: featureAnchoringSchema.optional(),
  consistencyCheck: consistencyCheckResultSchema.optional(),
  /**
   * Task 2A.23: 一致性 QC 报告。
   *
   * 视频生成完成后自动触发 QC，生成 QCReport 存于此字段。
   * 结构等价于 modules/video/consistency-qc/domain/qc-schema.ts 的 QCReport interface。
   * QCDashboardPanel 读取此字段展示帧级相似度曲线和漂移告警。
   */
  qcReport: qcReportSchema.optional(),

  // ── Generation config ──
  fixedImage: fixedImageSchema.optional(),
  referenceVideo: referenceVideoSchema.optional(),
  template: templateConfigSchema.optional(),
  generationStatus: shotGenerationStatusSchema.optional(),
  generationResult: shotGenerationResultSchema.optional(),
  enhancedGeneration: z.preprocess(
    (v) => (v == null ? undefined : Boolean(v)),
    z.boolean().optional(),
  ),
  /** LLM-generated initial keyframe prompt text. Used in storyboard generation pipeline as prompt source. */
  imageGenerationPrompt: nullToUndef(z.string()),
  firstFramePrompt: nullToUndef(z.string()),
  lastFramePrompt: nullToUndef(z.string()),
  promptLayers: z.object({
    coreElements: z.string(),
    cameraAction: z.string(),
    styleAtmosphere: z.string().optional(),
  }).optional(),

  // ── Keyframe / FramePair / Video generation ──
  keyframe: storyBeatKeyframeSchema.optional(),
  framePair: storyBeatFramePairSchema.optional(),
  videoGen: storyBeatVideoSchema.optional(),
  imageUrl: nullToUndef(z.string()),
  videoReferenceUrl: nullToUndef(z.string()),

  // ── Input mode & chain ──
  keyframeInput: beatInputSchema.optional(),
  framePairInput: frameInputSchema.optional(),
  videoInput: videoInputSchema.optional(),
  uploadedKeyframe: nullToUndef(z.string()),
  uploadedFramePair: z.object({
    firstFrame: z.string(),
    lastFrame: z.string(),
    firstFramePrompt: z.string().optional(),
    lastFramePrompt: z.string().optional(),
  }).optional(),
  uploadedVideo: nullToUndef(z.string()),
  chainMode: chainModeSchema.optional(),
  customChainTarget: nullToUndef(z.string()),

  // ── Local cache paths ──
  localVideoPath: nullToUndef(z.string()),
  localKeyframePath: nullToUndef(z.string()),
  localFirstFramePath: nullToUndef(z.string()),
  localLastFramePath: nullToUndef(z.string()),

  // ── 3D 白盒预览（Task 2A.21）──
  /**
   * 3D 白盒场景图 — provider-agnostic，可序列化为 JSON 持久化。
   *
   * 用于在视频生成前预演镜头与构图：
   * - Seedance 2.5 原生支持 3D 白模输入（GLB + animatic MP4 + JSON 元数据）
   * - 其他模型走 fallback 适配器（5 张关键帧 PNG）
   *
   * 通过 `@/modules/blockout-3d` 的 Blockout3DPanel 编辑，
   * 通过 `validateBlockoutScene`（scene-io.ts）校验导入数据。
   *
   * 使用 `z.custom()` 因为 BlockoutScene 是复杂嵌套结构，
   * 内部一致性由 `validateBlockoutScene` 在导入时保证。
   */
  blockout3D: z.custom<BlockoutScene>().optional(),
});

export const storyVersionSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  timestamp: z.number(),
  beats: z.array(storyBeatSchema),
  title: z.string(),
  description: z.string(),
  genre: z.string(),
  tone: z.string(),
  targetDuration: z.number(),
  characters: z.array(z.string()),
  scenes: z.array(z.string()),
  changeSummary: z.string(),
  autoSaved: z.preprocess((v) => Boolean(v), z.boolean()),
});

export const storySchema = z.object({
  id: z.string(),
  title: z.string().min(1, "故事标题不能为空"),
  description: nullToEmpty(z.string()),
  characters: z.array(z.string()),
  scenes: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  genre: nullToUndef(z.string()),
  tone: nullToUndef(z.string()),
  targetDuration: nullToPositiveNumberOptional(),
  keyframeChainValid: z.preprocess(
    (v) => v == null ? undefined : Boolean(v),
    z.boolean().optional(),
  ),
  beats: z.array(storyBeatSchema),
  elementIds: z.array(z.string()),
  elementBindings: z.record(z.string(), elementBindingSchema).optional(),
  styleGuide: storyStyleGuideSchema.optional(),
});

export type StoryVersion = z.infer<typeof storyVersionSchema>;
export type StoryBeat = z.infer<typeof storyBeatSchema>;
export type Story = z.infer<typeof storySchema>;
export type StoryStyleGuide = z.infer<typeof storyStyleGuideSchema>;
export type StoryBeatKeyframe = z.infer<typeof storyBeatKeyframeSchema>;
export type StoryBeatFramePair = z.infer<typeof storyBeatFramePairSchema>;
export type StoryBeatVideoGeneration = z.infer<typeof storyBeatVideoSchema>;
export type ElementBinding = z.infer<typeof elementBindingSchema>;
export type SceneTransition = z.infer<typeof sceneTransitionSchema>;
export type BeatCamera = z.infer<typeof beatCameraSchema>;
export type ChainMode = z.infer<typeof chainModeSchema>;
export type BeatInput = z.infer<typeof beatInputSchema>;
export type FrameInput = z.infer<typeof frameInputSchema>;
export type VideoInput = z.infer<typeof videoInputSchema>;
export type ReferenceImageWeight = z.infer<typeof referenceImageWeightSchema>;
export type PromptLab = z.infer<typeof promptLabSchema>;

export const createStoryInputSchema = storySchema.pick({
  title: true,
  description: true,
  genre: true,
  tone: true,
  targetDuration: true,
  characters: true,
  scenes: true,
  beats: true,
  elementIds: true,
  elementBindings: true,
});

export type CreateStoryInput = z.infer<typeof createStoryInputSchema>;

export const updateStoryInputSchema = storySchema.partial().required({ id: true });

export type UpdateStoryInput = z.infer<typeof updateStoryInputSchema>;
