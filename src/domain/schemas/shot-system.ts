import { z } from "zod";

export const shotInstructionSchema = z.object({
  shotSize: z.enum([
    "extreme_close",
    "close",
    "medium",
    "wide",
    "extreme_wide",
  ]),
  cameraMovement: z.enum([
    "static",
    "push",
    "pull",
    "pan",
    "orbit",
    "crane_up",
    "crane_down",
    "tracking",
  ]),
  cameraAngle: z.enum([
    "eye_level",
    "low",
    "high",
    "birds_eye",
    "worms_eye",
    "dutch",
  ]),
});

export const featureAnchorItemSchema = z.object({
  elementId: z.string(),
  referenceImageUrl: z.string(),
  featureTags: z.array(z.string()),
  weight: z.number().min(0).max(1).default(0.8),
});

export const featureAnchoringSchema = z.object({
  enabled: z.boolean(),
  characterAnchors: z.array(featureAnchorItemSchema),
  propAnchors: z.array(featureAnchorItemSchema).optional(),
  previewImageUrl: z.string().optional(),
  disableFrameBinding: z.boolean().default(true),
  featureConsistencyStrength: z.number().min(0).max(1).default(0.8),
  blend: z.object({
    mode: z.enum(["anchor_only", "chain_only", "blend"]).default("anchor_only"),
    chainWeight: z.number().min(0).max(1).default(0.5),
    anchorWeight: z.number().min(0).max(1).default(0.5),
    autoFallback: z.boolean().default(true),
  }).optional(),
});

export const consistencyCheckResultSchema = z.object({
  passed: z.boolean(),
  characterScores: z.array(
    z.object({
      elementId: z.string(),
      elementName: z.string(),
      score: z.number(),
      issues: z.array(z.string()),
    }),
  ),
  overallScore: z.number(),
  recommendation: z.enum(["accept", "regenerate", "adjust"]),
});

export const shotReferenceSchema = z.object({
  direction: z.enum(["none", "previous", "next", "custom"]),
  targetShotId: z.string().optional(),
  contentType: z.enum([
    "full_video",
    "last_frame",
    "first_frame",
    "video_segment",
  ]),
  segmentDuration: z.number().optional(),
  segmentPosition: z.enum(["start", "end"]).optional(),
});

export const shotGenerationStatusSchema = z.enum([
  "idle",
  "pending",
  "generating",
  "completed",
  "failed",
]);

export const shotGenerationResultSchema = z.object({
  videoUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  firstFrameUrl: z.string().optional(),
  duration: z.number(),
  generatedAt: z.string(),
  prompt: z.string(),
  taskId: z.string().optional(),
  error: z.string().optional(),
});

export const fixedImageSchema = z.object({
  enabled: z.boolean(),
  lockType: z.enum(["character", "scene"]),
  imageUrl: z.string().optional(),
  name: z.string().optional(),
  characters: z
    .array(
      z.object({
        characterId: z.string(),
        characterName: z.string(),
        imageUrl: z.string(),
      }),
    )
    .optional(),
});

export const referenceVideoSchema = z.object({
  enabled: z.boolean(),
  videoUrl: z.string().optional(),
  mimicryLevel: z.enum(["light", "medium", "deep"]),
  name: z.string().optional(),
  duration: z.number().optional(),
});

export const templateConfigSchema = z.object({
  enabled: z.boolean(),
  templateId: z.string().optional(),
  template: z.unknown().optional(),
  autoMatchStory: z.boolean().optional(),
  name: z.string().optional(),
  matchCamera: z.boolean().optional(),
  matchTransition: z.boolean().optional(),
  matchTiming: z.boolean().optional(),
});

/**
 * 镜头属性容器（`storyBeatSchema.camera` 字段使用）。
 *
 * PR 7：已删除与 shotInstruction 重合的 `angle`/`movement` 字段。
 * 当前只保留 shotInstruction 中无对应字段的独有字段：
 * - `distance` / `speed`：镜头距离/速度，专业模式编辑独有
 * - `relationType` / `transitionType` / `transitionDuration`：镜头间关系/转场，camera-consistency-validator 使用
 */
export const beatCameraSchema = z.object({
  distance: z.string().optional(),
  speed: z.string().optional(),
  relationType: z.enum(["continuous", "contrast", "parallel", "fade"]).optional(),
  transitionType: z.enum(["cut", "dissolve", "wipe", "fade"]).optional(),
  transitionDuration: z.number().optional(),
});

/**
 * 元素类型枚举。
 *
 * 历史背景：原本只有 `["character", "prop", "effect"]` 三种，UI 通过 `as unknown as`
 * cast 绕过将 "scene" 视作第四种类型。已正式纳入枚举，避免类型不一致的隐患。
 *
 * - `character`：角色，绑定到 StoryBeat.elementBindings，由 characterAnchors 处理一致性
 * - `prop`：道具，由 propAnchors 处理一致性
 * - `effect`：特效，与 prop 处理方式相同（无专属字段，未来可扩展）
 * - `scene`：场景，绑定到 StoryBeat.sceneId 单值字段；不在 featureAnchoring 中处理
 *   （场景一致性由 shotReference + visualConsistency 负责）
 */
export const elementTypeSchema = z.enum(["character", "prop", "effect", "scene"]);
export const assetTypeSchema = z.enum(["image", "video", "text"]);

export const assetBindingSchema = z.object({
  type: assetTypeSchema,
  url: z.string(),
  name: z.string(),
  uploadedAt: z.string(),
  isPrimary: z.boolean().optional(),
});

export const referenceImageQualitySchema = z.object({
  isValid: z.boolean(),
  resolution: z.object({ width: z.number(), height: z.number() }),
  minResolution: z.number(),
  clarityScore: z.number(),
  issues: z.array(z.string()),
});

export const elementFeatureAnchorSchema = z.object({
  elementId: z.string(),
  elementType: elementTypeSchema,
  referenceImageUrl: z.string(),
  featureTags: z.array(z.string()),
  characterFeatures: z.object({
    faceShape: z.string().optional(),
    hairColor: z.string().optional(),
    hairStyle: z.string().optional(),
    eyeColor: z.string().optional(),
    build: z.string().optional(),
    clothing: z.string().optional(),
    colorPalette: z.array(z.string()).optional(),
    distinctiveMarks: z.array(z.string()).optional(),
  }).optional(),
  sceneFeatures: z.object({
    sceneType: z.string().optional(),
    colorTone: z.string().optional(),
    lightingType: z.string().optional(),
    keyElements: z.array(z.string()).optional(),
    structureDesc: z.string().optional(),
  }).optional(),
  extractedAt: z.string(),
  confidence: z.number(),
});

export const storyElementSchema = z.object({
  id: z.string(),
  type: elementTypeSchema,
  name: z.string(),
  description: z.string(),
  bindings: z.array(assetBindingSchema),
  characterConfig: z.object({
    gender: z.string().optional(),
    age: z.number().optional(),
    style: z.string().optional(),
    personality: z.array(z.string()).optional(),
    appearance: z.object({
      hairColor: z.string().optional(),
      hairStyle: z.string().optional(),
      eyeColor: z.string().optional(),
      height: z.string().optional(),
      build: z.string().optional(),
      clothing: z.string().optional(),
    }).optional(),
  }).optional(),
  sceneConfig: z.object({
    timeOfDay: z.string().optional(),
    weather: z.string().optional(),
    mood: z.string().optional(),
    lighting: z.string().optional(),
    style: z.string().optional(),
  }).optional(),
  featureAnchor: elementFeatureAnchorSchema.optional(),
  referenceImageQuality: referenceImageQualitySchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const elementLibrarySchema = z.object({
  elements: z.array(storyElementSchema),
  nextCode: z.record(elementTypeSchema, z.number()),
});

// ── Task 2A.23: QC Report（一致性 QC 闭环）─────────────────────────────────
//
// 结构等价于 src/modules/video/consistency-qc/domain/qc-schema.ts 的 QCReport interface。
// 此处独立定义 zod schema 用于 StoryBeat.qcReport 字段持久化校验；
// modules 层通过结构子类型兼容（TS structural typing），无需相互导入。
export const frameScoreSchema = z.object({
  frameIndex: z.number(),
  timestamp: z.number(),
  /** 余弦相似度 [0, 1]，1 = 完全一致 */
  cosineSimilarity: z.number(),
  faceDetected: z.boolean(),
});

export const qcVerdictSchema = z.enum(["pass", "drift_warning", "drift_critical"]);
export const qcActionTakenSchema = z.enum(["none", "regenerated", "face_swapped", "manual_review"]);

export const qcReportSchema = z.object({
  videoTaskId: z.string(),
  characterId: z.string().optional(),
  totalFrames: z.number(),
  sampledFrames: z.number(),
  frameScores: z.array(frameScoreSchema),
  averageScore: z.number(),
  minScore: z.number(),
  verdict: qcVerdictSchema,
  actionTaken: qcActionTakenSchema,
  createdAt: z.string(),
  strategy: z.string().optional(),
  retryCount: z.number().optional(),
  error: z.string().optional(),
});

export type ElementType = z.infer<typeof elementTypeSchema>;
export type AssetType = z.infer<typeof assetTypeSchema>;
export type AssetBinding = z.infer<typeof assetBindingSchema>;
export type ReferenceImageQuality = z.infer<typeof referenceImageQualitySchema>;
export type ElementFeatureAnchor = z.infer<typeof elementFeatureAnchorSchema>;
export type StoryElement = z.infer<typeof storyElementSchema>;
export type ShotInstructionTemplate = ShotInstruction;
export type ShotInstruction = z.infer<typeof shotInstructionSchema>;
export type FeatureAnchoringConfig = z.infer<typeof featureAnchoringSchema>;
export type ConsistencyCheckResult = z.infer<typeof consistencyCheckResultSchema>;
export type ShotReference = z.infer<typeof shotReferenceSchema>;
export type ShotGenerationStatus = z.infer<typeof shotGenerationStatusSchema>;
export type ShotGenerationResult = z.infer<typeof shotGenerationResultSchema>;
export type FixedImageConfig = z.infer<typeof fixedImageSchema>;
export type ReferenceVideoConfig = z.infer<typeof referenceVideoSchema>;
export type TemplateConfig = z.infer<typeof templateConfigSchema>;
export type BeatCamera = z.infer<typeof beatCameraSchema>;
export type ElementLibrary = z.infer<typeof elementLibrarySchema>;
export type FrameScoreData = z.infer<typeof frameScoreSchema>;
export type QCVerdictData = z.infer<typeof qcVerdictSchema>;
export type QCActionTakenData = z.infer<typeof qcActionTakenSchema>;
export type QCReportData = z.infer<typeof qcReportSchema>;
