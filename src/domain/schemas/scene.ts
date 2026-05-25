import { z } from "zod";

export const sceneCameraSchema = z.object({
  position: z.string().optional(),
  angle: z.string().optional(),
  zoom: z.number().optional(),
  distance: z.string().optional(),
  movement: z.string().optional(),
});

export const sceneSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "场景名称不能为空"),
  description: z.string(),
  type: z.string(),
  timeOfDay: z.string(),
  weather: z.string(),
  mood: z.string(),
  lighting: z.string(),
  elements: z.array(z.string()),
  colors: z.array(z.string()),
  prompt: z.string(),
  imageGenerationPrompt: z.string().optional(),
  generatedImage: z.string().optional(),
  generatedVideo: z.string().optional(),
  videoGenerationStatus: z
    .enum(["pending", "generating", "completed", "failed"])
    .optional(),
  videoGenerationTaskId: z.string().optional(),
  updatedAt: z.string().optional(),
  camera: sceneCameraSchema.optional(),
  imageUrl: z.string().optional(),
  scenePath: z.string().optional(),
  refImagePath: z.string().optional(),
  thumbnailPath: z.string().optional(),
  previewPath: z.string().optional(),
  atmosphere: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  generationPrompt: z.string().optional(),
  generationParams: z.record(z.string(), z.unknown()).optional(),
  useCount: z.number().nonnegative().optional(),
  lastUsedAt: z.number().optional(),
});

export type Scene = z.output<typeof sceneSchema>;
export type SceneCamera = z.output<typeof sceneCameraSchema>;

export const sceneElementTypeSchema = z.enum([
  "existing_character",
  "new_character",
  "prop",
  "environment",
]);

export const sceneElementSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: sceneElementTypeSchema,
  characterId: z.string().optional(),
  characterConfig: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  dialogue: z.string().optional(),
  action: z.string().optional(),
  emotion: z.string().optional(),
  position: z.string().optional(),
  pose: z.string().optional(),
  order: z.number().optional(),
  timelineGroup: z.number().optional(),
  timelineOrder: z.number().optional(),
});

export type SceneElementType = z.infer<typeof sceneElementTypeSchema>;
export type SceneElement = z.infer<typeof sceneElementSchema>;

export const createSceneInputSchema = sceneSchema.pick({
  name: true,
  description: true,
  type: true,
  timeOfDay: true,
  weather: true,
  mood: true,
  lighting: true,
  atmosphere: true,
  elements: true,
  colors: true,
  camera: true,
  prompt: true,
  imageGenerationPrompt: true,
  generatedImage: true,
  refImagePath: true,
  imageUrl: true,
  scenePath: true,
  thumbnailPath: true,
  previewPath: true,
  source: true,
  generationPrompt: true,
  generationParams: true,
  tags: true,
});

export type CreateSceneInput = z.infer<typeof createSceneInputSchema>;

export const updateSceneInputSchema = sceneSchema.partial().required({ id: true });

export type UpdateSceneInput = z.infer<typeof updateSceneInputSchema>;
