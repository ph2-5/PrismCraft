import { z } from "zod";
import type { SceneElement } from "./scene";
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

const shotTypeSchema = z.preprocess(
  (v): unknown => {
    if (typeof v === "string" && VALID_SHOT_TYPES.has(v)) return v;
    return undefined;
  },
  z.string().optional(),
);

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
   * @deprecated Use `shotInstruction.shotSize` instead.
   *
   * 该字段是景别（shot size）的旧载体，与 `shotInstruction.shotSize` 概念重合。
   * 保留是为了向后兼容：
   * - LLM 生成管线仍以 `st` 缩写输出（见 `story-plan-prompt.ts` 的 buildFieldLegend）
   * - `fixStoryBeat` / `fixShotParams` 将 `st` 归一化后写入此字段
   * - 数据库通过 `beat-transformer.ts` 持久化到 `camera` JSON 容器的 `shotType` 键
   * - UI 展示（SortableBeatList / TemplateCard / AssetCards / BeatDetailsTab）仍读取此字段
   * - prompt 生成（prompt-service.ts）将此字段渲染为【景别】
   * - 视频生成参数（video-task-params.ts）将此字段透传
   *
   * 迁移路径（TODO，分多 PR 推进）：
   * 1. 修改 `story-plan-prompt.ts` 的 buildFieldLegend，将 `st=shotType` 改为 `ss=shotSize`
   *    （或直接让 LLM 输出 `shotInstruction` 子对象）
   * 2. 修改 `story-service.ts` 的 `fixStoryBeat` / `fixShotParams` 解析新缩写并写入 `shotInstruction.shotSize`
   * 3. 修改 `story-generation-pipeline.ts` 把校验结果写回 `shotInstruction.shotSize` 而非 `beat.shotType`
   * 4. 修改消费者（prompt-service.ts / video-task-params.ts / storyboard-template.ts / UI 组件）
   *    优先读取 `shotInstruction.shotSize`，fallback `beat.shotType`
   * 5. 修改 `beat-transformer.ts` / `relations.ts` 持久化 `shotInstruction`
   * 6. 编写数据迁移脚本：把现有 `shotType` / `camera.shotType` 复制到 `shotInstruction.shotSize`
   * 7. 兼容期保留此字段（至少 2 个版本），之后删除
   *
   * 当前使用点：61 个文件（远超 20 处阈值），迁移风险高，故仅做注释改进 + TODO 标记。
   */
  shotType: shotTypeSchema,
  /**
   * @deprecated Use `shotInstruction` instead. `angle`/`movement` 与 `shotInstruction.cameraAngle`/`cameraMovement` 重合。
   *
   * 该字段是镜头属性的旧载体。`beatCameraSchema` 的字段按替代关系分为两类：
   * - **可替代**（与 shotInstruction 重合）：
   *   - `angle` → `shotInstruction.cameraAngle`
   *   - `movement` → `shotInstruction.cameraMovement`
   * - **独有**（shotInstruction 中无对应字段，需保留）：
   *   - `distance`、`speed`：镜头距离/速度（专业模式编辑使用）
   *   - `relationType`、`transitionType`、`transitionDuration`：镜头间关系/转场类型（camera-consistency-validator 使用）
   *
   * LLM 生成管线仍以 `ca`/`cm` 缩写输出 `angle`/`movement`（见 `story-plan-prompt.ts`），
   * `fixStoryBeat` 解析后由 `story-generation-pipeline.ts` 写回 `beat.camera.angle`/`movement`。
   *
   * 迁移路径（TODO，与 shotType 迁移同步推进）：
   * 1. 修改 LLM prompt（buildFieldLegend）将 `ca=cameraAngle, cm=cameraMovement` 直接对应到 shotInstruction
   * 2. 修改 `fixStoryBeat` / `fixShotParams` 把校验结果写入 `shotInstruction.cameraAngle`/`cameraMovement`
   * 3. 修改消费者（prompt-service.ts / video-task-params.ts / storyboard-template.ts / BeatDetailsTab.tsx）
   *    优先读取 `shotInstruction.*`，fallback `beat.camera.*`
   * 4. `beat.transformer.ts` / `relations.ts` 把 shotInstruction 持久化为独立 JSON 容器
   *    （`distance`/`speed`/`relationType`/`transitionType`/`transitionDuration` 仍需保留在 camera 容器中）
   * 5. 数据迁移脚本：把 `camera.angle`/`movement` 复制到 `shotInstruction.cameraAngle`/`cameraMovement`
   * 6. 兼容期保留此字段（至少 2 个版本），之后只保留 shotInstruction + camera 中的独有字段
   *
   * 当前使用点：30+ 文件，迁移风险高，故仅做注释改进 + TODO 标记。
   */
  camera: beatCameraSchema.optional(),
  shotInstruction: shotInstructionSchema.optional(),
  reference: shotReferenceSchema.optional(),
  featureAnchoring: featureAnchoringSchema.optional(),
  consistencyCheck: consistencyCheckResultSchema.optional(),

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
