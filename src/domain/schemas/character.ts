import { z } from "zod";

export const characterOutfitSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  clothing: z.string(),
  accessories: z.array(z.string()).optional().default([]),
  imageUrl: z.string().url().optional(),
  localImagePath: z.string().optional(),
  thumbnailPath: z.string().optional(),
  isDefault: z.preprocess((v) => Boolean(v), z.boolean()).default(false),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export const characterAppearanceSchema = z.object({
  hairColor: z.string().default(""),
  hairStyle: z.string().default(""),
  eyeColor: z.string().default(""),
  height: z.string().default(""),
  build: z.string().default(""),
  clothing: z.string().default(""),
});

export const characterSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "角色名称不能为空"),
  description: z.string(),
  gender: z.string(),
  age: z.number().positive().optional(),
  style: z.string(),
  personality: z.array(z.string()),
  appearance: characterAppearanceSchema,
  outfits: z.array(characterOutfitSchema).optional(),
  prompt: z.string(),
  imageGenerationPrompt: z.string().optional(),
  generatedImage: z.string().optional(),
  refImagePath: z.string().optional(),
  generatedVideo: z.string().optional(),
  videoGenerationStatus: z
    .enum(["pending", "generating", "completed", "failed"])
    .optional(),
  videoGenerationTaskId: z.string().optional(),
  updatedAt: z.string().optional(),
  traits: z.array(z.string()).optional(),
  avatarPath: z.string().optional(),
  thumbnailPath: z.string().optional(),
  previewPath: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  generationPrompt: z.string().optional(),
  generationParams: z.record(z.string(), z.unknown()).optional(),
  useCount: z.number().nonnegative().optional(),
  lastUsedAt: z.string().optional(),
  createdAt: z.string().optional(),
  version: z.number().optional(),
});

export type Character = z.output<typeof characterSchema>;
export type CharacterOutfit = z.output<typeof characterOutfitSchema>;
export type CharacterAppearance = z.output<typeof characterAppearanceSchema>;

export const createCharacterInputSchema = characterSchema.pick({
  name: true,
  description: true,
  gender: true,
  age: true,
  style: true,
  personality: true,
  appearance: true,
  outfits: true,
  traits: true,
  prompt: true,
  tags: true,
  generatedImage: true,
  refImagePath: true,
  imageGenerationPrompt: true,
  thumbnailPath: true,
  previewPath: true,
  avatarPath: true,
});

export type CreateCharacterInput = z.infer<typeof createCharacterInputSchema>;

export const updateCharacterInputSchema = characterSchema.partial().required({ id: true });

export type UpdateCharacterInput = z.infer<typeof updateCharacterInputSchema>;
