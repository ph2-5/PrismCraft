// AI: All API request schemas are defined here. Use z.infer<typeof XSchema> for types.
// AI: Do NOT create new schemas without checking this file first.
import { z } from "zod";

export const uploadSchema = z.object({
  file: z.unknown(),
  category: z.string().optional(),
});
export type UploadRequest = z.infer<typeof uploadSchema>;

export const analyzeImageSchema = z.object({
  image: z.unknown(),
  prompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type AnalyzeImageRequest = z.infer<typeof analyzeImageSchema>;

export const generateImageSchema = z.object({
  prompt: z.string(),
  category: z.string().optional(),
  size: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateImageRequest = z.infer<typeof generateImageSchema>;

export const generateKeyframeSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  characterRef: z.string().optional(),
  characterRefs: z.array(z.string()).optional(),
  sceneRef: z.string().optional(),
  prevKeyframe: z.string().optional(),
  shotRequirement: z.record(z.string(), z.unknown()).optional(),
  content: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateKeyframeRequest = z.infer<typeof generateKeyframeSchema>;

export const generateFramePairSchema = z.object({
  firstFrame: z.unknown().optional(),
  lastFrame: z.unknown().optional(),
  keyframeUrl: z.string().optional(),
  keyframePrompt: z.string().optional(),
  characterRef: z.string().optional(),
  characterRefs: z.array(z.string()).optional(),
  sceneRef: z.string().optional(),
  prevLastFrameUrl: z.string().optional(),
  actionDescription: z.string().optional(),
  duration: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateFramePairRequest = z.infer<typeof generateFramePairSchema>;

export const generateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  firstFrameUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  characterRef: z.string().optional(),
  characterRefs: z.array(z.string()).optional(),
  sceneRef: z.string().optional(),
  referenceVideo: z.union([z.string(), z.object({ videoUrl: z.string(), mimicryLevel: z.string().optional() })]).optional(),
  duration: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  format: z.string().optional(),
});
export type GenerateVideoRequest = z.infer<typeof generateVideoSchema>;

export const videoStatusSchema = z.object({
  taskId: z.string(),
  apiUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  format: z.string().optional(),
});
export type VideoStatusRequest = z.infer<typeof videoStatusSchema>;

export const generateTextSchema = z.object({
  prompt: z.string(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateTextRequest = z.infer<typeof generateTextSchema>;

// Task 1.0: 流式文本生成 schema（在 generateTextSchema 基础上增加 tools 字段）
export const generateTextStreamSchema = z.object({
  prompt: z.string(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  tools: z
    .array(
      z.object({
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          description: z.string(),
          parameters: z.record(z.string(), z.unknown()),
        }),
      }),
    )
    .optional(),
});
export type GenerateTextStreamRequest = z.infer<typeof generateTextStreamSchema>;

// 原生对话补全 schema（非流式，messages 数组）
export const generateChatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
      tool_calls: z.unknown().optional(),
      tool_call_id: z.string().optional(),
      name: z.string().optional(),
    }),
  ),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateChatRequest = z.infer<typeof generateChatSchema>;

// 原生对话补全流式 schema（在 generateChatSchema 基础上增加 tools 和 stream 字段）
export const generateChatStreamSchema = z.object({
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
      tool_calls: z.unknown().optional(),
      tool_call_id: z.string().optional(),
      name: z.string().optional(),
    }),
  ),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  tools: z
    .array(
      z.object({
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          description: z.string(),
          parameters: z.record(z.string(), z.unknown()),
        }),
      }),
    )
    .optional(),
  stream: z.boolean().optional(),
});
export type GenerateChatStreamRequest = z.infer<typeof generateChatStreamSchema>;

// Embedding 生成 schema
export const generateEmbeddingSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateEmbeddingRequest = z.infer<typeof generateEmbeddingSchema>;

// 音频合成（TTS）schema
export const generateAudioSchema = z.object({
  text: z.string(),
  voice: z.string().optional(),
  format: z.string().optional(),
  speed: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateAudioRequest = z.infer<typeof generateAudioSchema>;

// 音频转写（STT）schema
export const transcribeAudioSchema = z.object({
  audioUrl: z.string(),
  language: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type TranscribeAudioRequest = z.infer<typeof transcribeAudioSchema>;

export const testConnectionSchema = z.object({
  apiUrl: z.string(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  providerId: z.string().optional(),
});
export type TestConnectionRequest = z.infer<typeof testConnectionSchema>;

export const exportSchema = z.object({
  data: z.unknown().optional(),
  format: z.string().optional(),
});
export type ExportRequest = z.infer<typeof exportSchema>;

// ── shared-logic mirror schemas (Electron cannot import @/domain/*) ────
// These mirror the types exported from @shared-logic/shot/reference-engine.
// Declared here (before the story* schemas) so they are initialized before use.

// Mirror of Beat from @shared-logic/video/video-task-params (cannot be imported
// into the Electron schema layer). Replaces the previous z.unknown() which
// performed no runtime validation. passthrough() preserves provider-specific
// extra keys so downstream shared-logic consumers are unaffected.
const slVideoBeatSchema = z.object({
  id: z.string(),
  storyId: z.string().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
  duration: z.number().optional(),
  imageGenerationPrompt: z.string().optional(),
  firstFramePrompt: z.string().optional(),
  lastFramePrompt: z.string().optional(),
  shotType: z.string().optional(),
  camera: z.object({ angle: z.string().optional(), movement: z.string().optional() }).optional(),
  framePair: z.object({
    firstFrame: z.object({ imageUrl: z.string().optional() }).optional(),
    lastFrame: z.object({ imageUrl: z.string().optional() }).optional(),
  }).optional(),
  firstFrameUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  keyframe: z.object({ imageUrl: z.string().optional(), prompt: z.string().optional() }).optional(),
}).passthrough();

// Mirror of CharacterInput from @shared-logic/prompt/prompt-service.
const slCharacterInputSchema = z.object({
  name: z.string().optional(),
  gender: z.string().optional(),
  age: z.union([z.number(), z.string()]).optional(),
  style: z.string().optional(),
  appearance: z.object({
    hairColor: z.string().optional(),
    hairStyle: z.string().optional(),
    eyeColor: z.string().optional(),
    build: z.string().optional(),
    clothing: z.string().optional(),
    accessories: z.string().optional(),
  }).optional(),
  description: z.string().optional(),
  personality: z.union([z.string(), z.array(z.string())]).optional(),
  generatedImage: z.string().optional(),
}).passthrough();

// Mirror of SceneInput from @shared-logic/prompt/prompt-service.
const slSceneInputSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  timeOfDay: z.string().optional(),
  weather: z.string().optional(),
  mood: z.string().optional(),
  lighting: z.string().optional(),
  atmosphere: z.string().optional(),
  description: z.string().optional(),
  elements: z.union([z.string(), z.array(z.string())]).optional(),
  generatedImage: z.string().optional(),
  colors: z.union([z.string(), z.array(z.string())]).optional(),
}).passthrough();

// Mirror of ElementInput from @shared-logic/prompt/prompt-service.
const slElementInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  featureAnchor: z.object({ featureTags: z.array(z.string()).optional() }).optional(),
}).passthrough();

export const storyPlanSchema = z.object({
  story: z.record(z.string(), z.unknown()),
  characters: z.array(z.unknown()),
  scenes: z.array(z.unknown()),
  options: z.record(z.string(), z.unknown()),
  planPrompt: z.string().optional(),
});
export type StoryPlanRequest = z.infer<typeof storyPlanSchema>;

export const storyGenerateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  storyId: z.string().optional(),
  beatId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  // Fields used by buildVideoGenerationParams. Mirror schemas validate the
  // object structure (replacing the previous z.unknown() which had no runtime
  // validation) while passthrough() preserves extra keys for shared-logic.
  beat: slVideoBeatSchema.optional(),
  characters: z.array(slCharacterInputSchema).optional(),
  scenes: z.array(slSceneInputSchema).optional(),
  elements: z.array(slElementInputSchema).optional(),
  shotInstruction: z.string().optional(),
  firstFrameUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  duration: z.number().optional(),
  videoPrompt: z.string().optional(),
});
export type StoryGenerateVideoRequest = z.infer<typeof storyGenerateVideoSchema>;

export const storyGenerateKeyframeSchema = z.object({
  beat: slVideoBeatSchema.optional(),
  storyId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type StoryGenerateKeyframeRequest = z.infer<typeof storyGenerateKeyframeSchema>;

export const storyGenerateFramePairSchema = z.object({
  beat: slVideoBeatSchema.optional(),
  storyId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type StoryGenerateFramePairRequest = z.infer<typeof storyGenerateFramePairSchema>;

export const quickGenerateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type QuickGenerateVideoRequest = z.infer<typeof quickGenerateVideoSchema>;

export const characterGenerateImageSchema = z.object({
  character: z.record(z.string(), z.unknown()),
  useDetailedPrompt: z.boolean().optional(),
  imageSize: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  imagePrompt: z.string().optional(),
  detailedPromptInstruction: z.string().optional(),
});
export type CharacterGenerateImageRequest = z.infer<typeof characterGenerateImageSchema>;

export const sceneGenerateImageSchema = z.object({
  scene: z.record(z.string(), z.unknown()),
  useDetailedPrompt: z.boolean().optional(),
  imageSize: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  imagePrompt: z.string().optional(),
  detailedPromptInstruction: z.string().optional(),
});
export type SceneGenerateImageRequest = z.infer<typeof sceneGenerateImageSchema>;

export const characterAnalyzeImageSchema = z.object({
  image: z.unknown(),
  analysisPrompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type CharacterAnalyzeImageRequest = z.infer<typeof characterAnalyzeImageSchema>;

export const sceneAnalyzeImageSchema = z.object({
  image: z.unknown(),
  analysisPrompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type SceneAnalyzeImageRequest = z.infer<typeof sceneAnalyzeImageSchema>;

export const videoSelectStrategySchema = z.object({
  apiUrl: z.string(),
  model: z.string(),
});
export type VideoSelectStrategyRequest = z.infer<typeof videoSelectStrategySchema>;

export const videoDetectFormatSchema = z.object({
  apiUrl: z.string(),
  modelId: z.string().optional(),
});
export type VideoDetectFormatRequest = z.infer<typeof videoDetectFormatSchema>;

export const pluginAddSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});
export type PluginAddRequest = z.infer<typeof pluginAddSchema>;

export const pluginDeleteSchema = z.object({
  pluginId: z.string(),
});
export type PluginDeleteRequest = z.infer<typeof pluginDeleteSchema>;

export const pluginValidateSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});
export type PluginValidateRequest = z.infer<typeof pluginValidateSchema>;

export const videoTrackingInfoSchema = z.object({
  taskId: z.string(),
  apiUrl: z.string(),
  apiKeyPreview: z.string(),
  model: z.string(),
});
export type VideoTrackingInfoRequest = z.infer<typeof videoTrackingInfoSchema>;

export const videoProviderInfoSchema = z.object({
  apiUrl: z.string().optional(),
});
export type VideoProviderInfoRequest = z.infer<typeof videoProviderInfoSchema>;

const slShotSchema = z.object({
  id: z.string(),
  sequence: z.number().optional(),
  duration: z.number().optional(),
  videoGen: z.object({ videoUrl: z.string().optional() }).optional(),
  generationResult: z.object({
    videoUrl: z.string().optional(),
    lastFrameUrl: z.string().optional(),
    firstFrameUrl: z.string().optional(),
  }).optional(),
}).passthrough();

const slReferenceSchema = z.object({
  direction: z.enum(["none", "previous", "next", "custom"]),
  contentType: z.enum(["full_video", "last_frame", "first_frame", "video_segment"]).optional(),
  targetShotId: z.string().optional(),
  segmentDuration: z.number().optional(),
}).passthrough();

export const shotValidateReferenceSchema = z.object({
  shot: slShotSchema,
  allShots: z.array(slShotSchema),
  reference: slReferenceSchema,
});
export type ShotValidateReferenceRequest = z.infer<typeof shotValidateReferenceSchema>;

export const shotGetReferenceVideoUrlSchema = z.object({
  shot: slShotSchema,
  allShots: z.array(slShotSchema),
  reference: slReferenceSchema,
});
export type ShotGetReferenceVideoUrlRequest = z.infer<typeof shotGetReferenceVideoUrlSchema>;

export const shotBuildReferenceDescriptionSchema = z.object({
  shot: slShotSchema,
  allShots: z.array(slShotSchema),
  reference: slReferenceSchema,
});
export type ShotBuildReferenceDescriptionRequest = z.infer<typeof shotBuildReferenceDescriptionSchema>;

// Mirror types from @shared-logic/shot/consistency-check.
const slFeatureAnchoringConfigSchema = z.object({
  enabled: z.boolean(),
  characterAnchors: z.array(z.object({
    elementId: z.string(),
    referenceImageUrl: z.string().optional(),
    featureTags: z.array(z.string()).optional(),
    weight: z.number(),
  }).passthrough()),
  disableFrameBinding: z.boolean().optional(),
  featureConsistencyStrength: z.number().optional(),
}).passthrough();

const slConsistencyElementSchema = z.object({
  id: z.string(),
  name: z.string(),
}).passthrough();

export const validateConsistencySchema = z.object({
  featureAnchoring: slFeatureAnchoringConfigSchema,
  elements: z.array(slConsistencyElementSchema),
}).passthrough();
export type ValidateConsistencyRequest = z.infer<typeof validateConsistencySchema>;

export const validateFeatureAnchoringSchema = z.object({
  config: slFeatureAnchoringConfigSchema,
});
export type ValidateFeatureAnchoringRequest = z.infer<typeof validateFeatureAnchoringSchema>;

export const validateNoFrameBindingSchema = z.object({}).passthrough();
export type ValidateNoFrameBindingRequest = z.infer<typeof validateNoFrameBindingSchema>;

// Mirror types from @shared-logic/shot/reference-check.
const slRefStorySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  characters: z.array(z.string()).optional(),
  scenes: z.array(z.string()).optional(),
  beats: z.array(z.object({
    characters: z.array(z.string()).optional(),
    character: z.string().optional(),
    sceneId: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

export const referenceCheckCharacterSchema = z.object({
  characterId: z.string(),
  stories: z.array(slRefStorySchema),
});
export type ReferenceCheckCharacterRequest = z.infer<typeof referenceCheckCharacterSchema>;

export const referenceCheckSceneSchema = z.object({
  sceneId: z.string(),
  stories: z.array(slRefStorySchema),
});
export type ReferenceCheckSceneRequest = z.infer<typeof referenceCheckSceneSchema>;

// Mirror types from @shared-logic/shot/visual-consistency-check.
const slVisualElementSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  featureAnchor: z.object({ featureTags: z.array(z.string()).optional() }).optional(),
  characterConfig: z.object({
    appearance: z.object({
      hairColor: z.string().optional(),
      hairStyle: z.string().optional(),
      eyeColor: z.string().optional(),
      clothing: z.string().optional(),
    }).optional(),
  }).optional(),
  bindings: z.array(z.object({ type: z.string(), url: z.string() }).passthrough()).optional(),
}).passthrough();

const slVisualBeatSchema = z.object({
  id: z.string(),
  elementIds: z.array(z.string()).optional(),
}).passthrough();

export const visualConsistencyCheckSchema = z.object({
  generatedImageUrl: z.string().optional(),
  referenceImageUrl: z.string().optional(),
  element: slVisualElementSchema,
});
export type VisualConsistencyCheckRequest = z.infer<typeof visualConsistencyCheckSchema>;

export const visualConsistencyCheckBeatSchema = z.object({
  beat: slVisualBeatSchema,
  elements: z.array(slVisualElementSchema),
  generatedImageMap: z.record(z.string(), z.string()).optional(),
});
export type VisualConsistencyCheckBeatRequest = z.infer<typeof visualConsistencyCheckBeatSchema>;

// Mirror types from @shared-logic/story/storyboard-generation.
const slStoryboardBeatSchema = z.object({
  id: z.string(),
  content: z.string().optional(),
  description: z.string().optional(),
  duration: z.number().optional(),
  shotType: z.string().optional(),
  camera: z.object({
    angle: z.string().optional(),
    movement: z.string().optional(),
  }).optional(),
  enhancedGeneration: z.boolean().optional(),
  imageGenerationPrompt: z.string().optional(),
  firstFramePrompt: z.string().optional(),
  lastFramePrompt: z.string().optional(),
  keyframe: z.object({
    imageUrl: z.string().optional(),
    prompt: z.string().optional(),
  }).optional(),
  framePair: z.object({
    firstFrame: z.object({ imageUrl: z.string().optional() }).optional(),
    lastFrame: z.object({ imageUrl: z.string().optional() }).optional(),
  }).optional(),
  // 场景转换：元信息字段，prompt-engine 当前不解析，passthrough 透传
  sceneId: z.string().optional(),
  sceneTransitions: z.array(z.object({
    sceneId: z.string(),
    transitionType: z.enum(["cut", "dissolve", "wipe", "fade"]).optional(),
    description: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

export const storyboardGenerateKeyframeSchema = z.object({
  beat: slStoryboardBeatSchema,
  prevBeat: slStoryboardBeatSchema.optional(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateKeyframeRequest = z.infer<typeof storyboardGenerateKeyframeSchema>;

export const storyboardGenerateFramePairSchema = z.object({
  beat: slStoryboardBeatSchema,
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateFramePairRequest = z.infer<typeof storyboardGenerateFramePairSchema>;

export const storyboardGenerateVideoSchema = z.object({
  beat: slStoryboardBeatSchema,
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateVideoRequest = z.infer<typeof storyboardGenerateVideoSchema>;

export const storyboardGenerateFullWorkflowSchema = z.object({
  beat: slStoryboardBeatSchema,
  prevBeat: slStoryboardBeatSchema.optional(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateFullWorkflowRequest = z.infer<typeof storyboardGenerateFullWorkflowSchema>;

// Chain options include non-serializable function callbacks (getCharacterRef,
// getSceneRef, onFailure) that cannot be validated by Zod over HTTP. Only the
// serializable fields are validated; passthrough preserves extra keys.
const slStoryboardChainOptionsSchema = z.object({
  providerId: z.string().optional(),
  modelId: z.string().optional(),
}).passthrough();

export const storyboardGenerateKeyframeChainSchema = z.object({
  beats: z.array(slStoryboardBeatSchema),
  options: slStoryboardChainOptionsSchema,
});
export type StoryboardGenerateKeyframeChainRequest = z.infer<typeof storyboardGenerateKeyframeChainSchema>;

export const videoRecoverSchema = z.object({
  taskId: z.string(),
  taskRecord: z.record(z.string(), z.unknown()).optional(),
});
export type VideoRecoverRequest = z.infer<typeof videoRecoverSchema>;

export const videoTasksBulkSaveSchema = z.object({
  tasks: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type VideoTasksBulkSaveRequest = z.infer<typeof videoTasksBulkSaveSchema>;

// ── DB 操作 Schema（IPC/HTTP 统一通信层） ──────────────────────────────
export const dbQuerySchema = z.object({
  sql: z.string().min(1),
  params: z.array(z.unknown()).default([]),
});
export type DbQueryRequest = z.infer<typeof dbQuerySchema>;

export const dbRunSchema = z.object({
  sql: z.string().min(1),
  params: z.array(z.unknown()).default([]),
});
export type DbRunRequest = z.infer<typeof dbRunSchema>;

export const dbTransactionSchema = z.object({
  statements: z.array(
    z.object({
      sql: z.string().min(1),
      params: z.array(z.unknown()).default([]),
    }),
  ).min(1),
});
export type DbTransactionRequest = z.infer<typeof dbTransactionSchema>;

// ── 文件存储 Schema（IFileStorage HTTP API） ──────────────────────────
export const fileCategorySchema = z.enum([
  "character",
  "scene",
  "storyboard",
  "video-cache",
  "image-cache",
  "upload",
  "plugin",
]);

export const fileSaveSchema = z.object({
  category: fileCategorySchema,
  key: z.string().min(1),
  data: z.union([z.string(), z.instanceof(Buffer)]),
  mimeType: z.string().optional(),
});
export type FileSaveRequest = z.infer<typeof fileSaveSchema>;

export const fileReadSchema = z.object({
  key: z.string().min(1),
});
export type FileReadRequest = z.infer<typeof fileReadSchema>;

export const fileDeleteSchema = z.object({
  key: z.string().min(1),
});
export type FileDeleteRequest = z.infer<typeof fileDeleteSchema>;

export const fileExistsSchema = z.object({
  key: z.string().min(1),
});
export type FileExistsRequest = z.infer<typeof fileExistsSchema>;

export const fileCopySchema = z.object({
  sourceKey: z.string().min(1),
  targetCategory: fileCategorySchema,
  targetKey: z.string().min(1),
});
export type FileCopyRequest = z.infer<typeof fileCopySchema>;

export const fileListSchema = z.object({
  category: fileCategorySchema,
  limit: z.number().optional(),
  offset: z.number().optional(),
});
export type FileListRequest = z.infer<typeof fileListSchema>;

export const fileInfoSchema = z.object({
  key: z.string().min(1),
});
export type FileInfoRequest = z.infer<typeof fileInfoSchema>;

export const fileWriteAtomicSchema = z.object({
  category: fileCategorySchema,
  key: z.string().min(1),
  data: z.union([z.string(), z.instanceof(Buffer)]),
});
export type FileWriteAtomicRequest = z.infer<typeof fileWriteAtomicSchema>;

// 通用 key-value 配置存储（与 IPC config:get/config:set 对齐）
export const configGetSchema = z.object({
  key: z.string().min(1).max(256),
});
export type ConfigGetRequest = z.infer<typeof configGetSchema>;

export const configSetSchema = z.object({
  key: z.string().min(1).max(256),
  // R182/L3: 限制 value 为基础类型或简单 record，避免任意 unknown 注入
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
  ]),
});
export type ConfigSetRequest = z.infer<typeof configSetSchema>;

// 通用 config/secure-config/sync-config 路由 Schema（兼容多 action 形态）
export const configRouteSchema = z.object({
  key: z.string().optional(),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
  ]).optional(),
  action: z.enum(["get", "set", "delete", "list"]).optional(),
}).passthrough();
export type ConfigRouteRequest = z.infer<typeof configRouteSchema>;

export const secureConfigRouteSchema = z.object({
  operation: z.enum(["save", "load", "clear"]),
  config: z.record(z.string(), z.unknown()).optional(),
  providerId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
export type SecureConfigRouteRequest = z.infer<typeof secureConfigRouteSchema>;

export const syncConfigRouteSchema = z.object({
  action: z.enum(["get", "set", "test"]).optional(),
  url: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
}).passthrough();
export type SyncConfigRouteRequest = z.infer<typeof syncConfigRouteSchema>;

// 文件写入（按绝对路径，受 ALLOWED_ROOTS 限制）
export const fileWriteSchema = z.object({
  filePath: z.string().min(1),
  data: z.union([z.string(), z.instanceof(Buffer)]),
  // 可选编码标记：当为 "base64" 时，data 字段为 base64 编码的二进制数据
  encoding: z.enum(["utf-8", "base64"]).optional(),
});
export type FileWriteRequest = z.infer<typeof fileWriteSchema>;

// 磁盘空间查询
export const fileDiskSpaceSchema = z.object({
  dirPath: z.string().min(1),
});
export type FileDiskSpaceRequest = z.infer<typeof fileDiskSpaceSchema>;

// 缓存目录查询（无入参，schema 用于统一校验入口）
export const fileCacheDirectorySchema = z.object({});
export type FileCacheDirectoryRequest = z.infer<typeof fileCacheDirectorySchema>;

// 同步测试连接
export const syncTestSchema = z.object({
  url: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});
export type SyncTestRequest = z.infer<typeof syncTestSchema>;

// 同步代理（push/pull）
export const syncProxySchema = z.object({
  action: z.enum(["push", "pull"]),
  deviceId: z.string().optional(),
  changes: z.array(z.unknown()).optional(),
  since: z.union([z.number(), z.string()]).optional(),
  page: z.number().optional(),
  config: z.unknown().optional(),
});
export type SyncProxyRequest = z.infer<typeof syncProxySchema>;
