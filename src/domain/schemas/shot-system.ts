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

export const beatCameraSchema = z.object({
  angle: z.string().optional(),
  movement: z.string().optional(),
  distance: z.string().optional(),
  speed: z.string().optional(),
  relationType: z.enum(["continuous", "contrast", "parallel", "fade"]).optional(),
  transitionType: z.enum(["cut", "dissolve", "wipe", "fade"]).optional(),
  transitionDuration: z.number().optional(),
});

export const elementTypeSchema = z.enum(["character", "prop", "effect"]);
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
