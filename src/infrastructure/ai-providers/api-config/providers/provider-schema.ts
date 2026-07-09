import { z } from "zod";

const ImageSizeOptionSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  label: z.string().min(1),
  aspectRatio: z.string().min(1),
});

const ModelCapabilitiesSchema = z.object({
  maxReferences: z.number().int().nonnegative(),
  maxResolution: z.number().int().positive().optional(),
  maxSizeMB: z.number().int().positive().optional(),
  supportsLastFrame: z.boolean().optional(),
  referenceMode: z.enum(["separate", "merged"]).optional(),
  supportedFormats: z.array(z.string()).optional(),
  supportedImageSizes: z.array(ImageSizeOptionSchema).optional(),
  defaultImageSize: z.string().optional(),
  providerId: z.string().optional(),
  urlTtl: z.number().int().positive().optional(),
  supportsCharacterRef: z.boolean().optional(),
  supportsSceneRef: z.boolean().optional(),
  nativeCharacterRef: z.boolean().optional(),
  nativeSceneRef: z.boolean().optional(),
  characterRefMode: z.enum(["native_field", "multimodal", "ref_field", "text_append", "bake_into_first", "none"]).optional(),
  sceneRefMode: z.enum(["native_field", "multimodal", "ref_field", "text_append", "bake_into_first", "none"]).optional(),
  imageUploadMode: z.enum(["base64", "url", "upload"]).optional(),
  maxCharacterRefs: z.number().int().nonnegative().optional(),
  promptLanguage: z.enum(["en", "zh", "auto"]).optional(),
  supportsReferenceVideo: z.boolean().optional(),
});

const DetectionRuleSchema = z.object({
  pattern: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  checkId: z.string().optional(),
});

const DetectionSchema = z.object({
  rules: z.array(DetectionRuleSchema),
  suggestedName: z.string(),
  baseUrl: z.string().min(1),
});

const DefaultParamsSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  size: z.string().optional(),
  duration: z.number().int().positive().optional(),
  quality: z.string().optional(),
  maxKeyframes: z.number().int().positive().optional(),
}).passthrough();

const ModelCapabilitiesOverridesSchema = ModelCapabilitiesSchema.partial().extend({
  supportedImageSizes: z.array(ImageSizeOptionSchema).optional(),
});

const ModelEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capabilities: z.array(z.enum(["text", "image", "vision", "video", "embedding", "audio"])),
  defaultParams: DefaultParamsSchema.optional(),
  modelCapabilitiesPreset: z.string().optional(),
  modelCapabilitiesOverrides: ModelCapabilitiesOverridesSchema.optional(),
  modelCapabilities: ModelCapabilitiesSchema.optional(),
}).refine(
  (data) => {
    const hasPreset = !!data.modelCapabilitiesPreset;
    const hasInline = !!data.modelCapabilities;
    return !(hasPreset && hasInline);
  },
  { message: "modelCapabilitiesPreset and modelCapabilities are mutually exclusive" },
);

export const ProviderJsonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  format: z.enum(["openai", "zhipu", "anthropic", "google", "seedance", "kuaishou", "pixverse"]),
  baseUrl: z.string().min(1),
  detection: DetectionSchema.optional(),
  deprecated: z.boolean().optional(),
  deprecatedReason: z.string().optional(),
  models: z.array(ModelEntrySchema).min(1),
});

export const StandaloneModelCapabilitySchema = z.object({
  id: z.string().min(1),
  capabilities: ModelCapabilitiesSchema,
});

export const StandaloneModelCapabilitiesSchema = z.array(StandaloneModelCapabilitySchema);

export function validateProviderJson(data: unknown): { success: boolean; errors?: z.ZodError } {
  const result = ProviderJsonSchema.safeParse(data);
  if (result.success) return { success: true };
  return { success: false, errors: result.error };
}

export function validateStandaloneCapabilities(data: unknown): { success: boolean; errors?: z.ZodError } {
  const result = StandaloneModelCapabilitiesSchema.safeParse(data);
  if (result.success) return { success: true };
  return { success: false, errors: result.error };
}
