import type { ModelCapabilities } from "./model-capabilities-types";
import type { ApiFormat, ApiCapability } from "./api-config/types";
import { errorLogger } from "@/shared/error-logger";
import { validateProviderJson, validateStandaloneCapabilities } from "./api-config/providers/provider-schema";

import volcengineJson from "./api-config/providers/volcengine.json";
import kuaishouJson from "./api-config/providers/kuaishou.json";
import zhipuJson from "./api-config/providers/zhipu.json";
import googleJson from "./api-config/providers/google.json";
import minimaxJson from "./api-config/providers/minimax.json";
import openaiJson from "./api-config/providers/openai.json";
import anthropicJson from "./api-config/providers/anthropic.json";
import pixverseJson from "./api-config/providers/pixverse.json";
import seedanceJson from "./api-config/providers/seedance.json";
import moonshotJson from "./api-config/providers/moonshot.json";
import deepseekJson from "./api-config/providers/deepseek.json";
import openrouterJson from "./api-config/providers/openrouter.json";
import qwenJson from "./api-config/providers/qwen.json";
import ollamaJson from "./api-config/providers/ollama.json";
import pollinationsJson from "./api-config/providers/pollinations.json";
import byteplusJson from "./api-config/providers/byteplus.json";
import bedrockJson from "./api-config/providers/bedrock.json";
import fireworksJson from "./api-config/providers/fireworks.json";
import customJson from "./api-config/providers/custom.json";
import pikaJson from "./api-config/providers/pika.json";
import lumaJson from "./api-config/providers/luma.json";
import runwayJson from "./api-config/providers/runway.json";
import standaloneCapabilitiesJson from "./api-config/providers/standalone-model-capabilities.json";

export interface ModelRegistryEntry {
  id: string;
  name: string;
  capabilities: ApiCapability[];
  defaultParams?: {
    maxTokens?: number;
    temperature?: number;
    size?: string;
    duration?: number;
    quality?: string;
    maxKeyframes?: number;
    [key: string]: unknown;
  };
  modelCapabilities?: ModelCapabilities;
}

export interface DetectionRule {
  pattern: string;
  confidence: "high" | "medium" | "low";
  check?: (key: string) => boolean;
}

export interface ProviderDefinition {
  name: string;
  format: ApiFormat;
  baseUrl: string;
  models: ModelRegistryEntry[];
  detection?: DetectionRule[];
  deprecated?: boolean;
  deprecatedReason?: string;
}

const VOLCENGINE_PRO_VIDEO_CAPS = {
  maxReferences: 4,
  maxSizeMB: 10,
  referenceMode: "separate" as const,
  providerId: "volcengine",
  urlTtl: 86400,
  supportsCharacterRef: true,
  supportsSceneRef: true,
  nativeCharacterRef: false,
  nativeSceneRef: false,
  characterRefMode: "bake_into_first" as const,
  sceneRefMode: "bake_into_first" as const,
  imageUploadMode: "base64" as const,
  maxCharacterRefs: 4,
};

const VOLCENGINE_LITE_I2V_CAPS = {
  maxReferences: 4,
  maxSizeMB: 10,
  referenceMode: "separate" as const,
  providerId: "volcengine",
  urlTtl: 86400,
  supportsCharacterRef: true,
  supportsSceneRef: true,
  nativeCharacterRef: true,
  nativeSceneRef: true,
  characterRefMode: "ref_field" as const,
  sceneRefMode: "ref_field" as const,
  imageUploadMode: "base64" as const,
  maxCharacterRefs: 4,
};

const KUAISHOU_V1_VIDEO_CAPS = {
  maxReferences: 4,
  maxSizeMB: 10,
  referenceMode: "separate" as const,
  providerId: "kuaishou",
  urlTtl: 86400,
  supportsCharacterRef: true,
  supportsSceneRef: true,
  nativeCharacterRef: false,
  nativeSceneRef: false,
  characterRefMode: "bake_into_first" as const,
  sceneRefMode: "bake_into_first" as const,
  imageUploadMode: "upload" as const,
  maxCharacterRefs: 1,
};

const KUAISHOU_V2_VIDEO_CAPS = {
  maxReferences: 4,
  maxSizeMB: 10,
  referenceMode: "separate" as const,
  providerId: "kuaishou",
  urlTtl: 86400,
  supportsCharacterRef: true,
  supportsSceneRef: true,
  nativeCharacterRef: true,
  nativeSceneRef: false,
  characterRefMode: "native_field" as const,
  sceneRefMode: "text_append" as const,
  imageUploadMode: "upload" as const,
  maxCharacterRefs: 1,
};

const ZHIPU_VIDEO_CAPS = {
  maxReferences: 4,
  maxSizeMB: 10,
  referenceMode: "separate" as const,
  providerId: "zhipu",
  urlTtl: 86400,
  supportsCharacterRef: false,
  supportsSceneRef: false,
  characterRefMode: "none" as const,
  sceneRefMode: "none" as const,
  imageUploadMode: "base64" as const,
};

const MINIMAX_VIDEO_CAPS = {
  maxReferences: 4,
  maxSizeMB: 10,
  referenceMode: "separate" as const,
  providerId: "minimax",
  urlTtl: 86400,
  supportsCharacterRef: true,
  supportsSceneRef: true,
  nativeCharacterRef: true,
  nativeSceneRef: false,
  characterRefMode: "native_field" as const,
  sceneRefMode: "text_append" as const,
  imageUploadMode: "base64" as const,
  maxCharacterRefs: 1,
};

const GOOGLE_VIDEO_CAPS = {
  maxReferences: 2,
  maxSizeMB: 10,
  referenceMode: "merged" as const,
  providerId: "google",
  urlTtl: 86400,
  supportsCharacterRef: true,
  supportsSceneRef: true,
  nativeCharacterRef: false,
  nativeSceneRef: false,
  characterRefMode: "bake_into_first" as const,
  sceneRefMode: "bake_into_first" as const,
  imageUploadMode: "base64" as const,
  maxCharacterRefs: 2,
};

const VOLCENGINE_IMAGE_CAPS = {
  maxReferences: 4,
  maxResolution: 2048,
  maxSizeMB: 10,
  supportsLastFrame: false,
  referenceMode: "separate" as const,
  providerId: "volcengine",
  supportsCharacterRef: false,
  supportsSceneRef: false,
};

const CAPABILITY_PRESETS: Record<string, Partial<ModelCapabilities>> = {
  volcengine_pro_video: VOLCENGINE_PRO_VIDEO_CAPS,
  volcengine_lite_i2v: VOLCENGINE_LITE_I2V_CAPS,
  volcengine_image: VOLCENGINE_IMAGE_CAPS,
  kuaishou_v1_video: KUAISHOU_V1_VIDEO_CAPS,
  kuaishou_v2_video: KUAISHOU_V2_VIDEO_CAPS,
  zhipu_video: ZHIPU_VIDEO_CAPS,
  minimax_video: MINIMAX_VIDEO_CAPS,
  google_video: GOOGLE_VIDEO_CAPS,
};

const DETECTION_CHECKS: Record<string, (key: string) => boolean> = {
  openai_exclude_or_proj_ant: (key) =>
    !key.startsWith("sk-or-") && !key.startsWith("sk-proj-") && !key.startsWith("sk-ant-"),
  deepseek_exclude_or_proj_ant: (key) =>
    !key.startsWith("sk-or-") && !key.startsWith("sk-proj-") && !key.startsWith("sk-ant-"),
  qwen_exclude_known_prefixes: (key) =>
    !key.startsWith("sk-or-") &&
    !key.startsWith("sk-proj-") &&
    !key.startsWith("sk-ant-") &&
    !/^sk-[a-zA-Z0-9]{48}$/.test(key) &&
    !/^sk-[a-zA-Z0-9]{32}$/.test(key),
};

interface JsonModelEntry {
  id: string;
  name: string;
  capabilities: string[];
  defaultParams?: Record<string, unknown>;
  modelCapabilitiesPreset?: string;
  modelCapabilitiesOverrides?: Record<string, unknown>;
  modelCapabilities?: Record<string, unknown>;
}

interface JsonDetectionRule {
  pattern: string;
  confidence: string;
  checkId?: string;
}

interface JsonDetection {
  rules: JsonDetectionRule[];
  suggestedName: string;
  baseUrl: string;
}

interface ProviderJsonData {
  id: string;
  name: string;
  format: string;
  baseUrl: string;
  detection?: JsonDetection;
  deprecated?: boolean;
  deprecatedReason?: string;
  models: JsonModelEntry[];
}

function resolveModelCapabilities(entry: JsonModelEntry): ModelCapabilities | undefined {
  if (entry.modelCapabilities) {
    return sanitizeModelCapabilities(entry.modelCapabilities);
  }

  if (entry.modelCapabilitiesPreset) {
    const preset = CAPABILITY_PRESETS[entry.modelCapabilitiesPreset];
    if (!preset) {
      errorLogger.error({ code: "UNKNOWN_PRESET", message: `Unknown capability preset: ${entry.modelCapabilitiesPreset}` });
      return undefined;
    }
    if (entry.modelCapabilitiesOverrides) {
      return { ...preset, ...entry.modelCapabilitiesOverrides } as ModelCapabilities;
    }
    return { ...preset } as ModelCapabilities;
  }

  return undefined;
}

export function sanitizeModelCapabilities(raw: Record<string, unknown>): ModelCapabilities {
  return {
    maxReferences: typeof raw.maxReferences === "number" ? raw.maxReferences : 4,
    maxResolution: typeof raw.maxResolution === "number" ? raw.maxResolution : 2048,
    maxSizeMB: typeof raw.maxSizeMB === "number" ? raw.maxSizeMB : 10,
    supportsLastFrame: typeof raw.supportsLastFrame === "boolean" ? raw.supportsLastFrame : false,
    referenceMode: raw.referenceMode === "merged" ? "merged" : "separate",
    ...(raw.supportedFormats ? { supportedFormats: raw.supportedFormats as string[] } : {}),
    ...(raw.supportedImageSizes ? { supportedImageSizes: raw.supportedImageSizes as ModelCapabilities["supportedImageSizes"] } : {}),
    ...(raw.defaultImageSize ? { defaultImageSize: raw.defaultImageSize as string } : {}),
    ...(raw.providerId ? { providerId: raw.providerId as string } : {}),
    ...(raw.urlTtl ? { urlTtl: raw.urlTtl as number } : {}),
    ...(raw.supportsCharacterRef !== undefined ? { supportsCharacterRef: raw.supportsCharacterRef as boolean } : {}),
    ...(raw.supportsSceneRef !== undefined ? { supportsSceneRef: raw.supportsSceneRef as boolean } : {}),
    ...(raw.nativeCharacterRef !== undefined ? { nativeCharacterRef: raw.nativeCharacterRef as boolean } : {}),
    ...(raw.nativeSceneRef !== undefined ? { nativeSceneRef: raw.nativeSceneRef as boolean } : {}),
    ...(raw.characterRefMode ? { characterRefMode: raw.characterRefMode as ModelCapabilities["characterRefMode"] } : {}),
    ...(raw.sceneRefMode ? { sceneRefMode: raw.sceneRefMode as ModelCapabilities["sceneRefMode"] } : {}),
    ...(raw.imageUploadMode ? { imageUploadMode: raw.imageUploadMode as ModelCapabilities["imageUploadMode"] } : {}),
    ...(raw.maxCharacterRefs !== undefined ? { maxCharacterRefs: raw.maxCharacterRefs as number } : {}),
    ...(raw.promptLanguage ? { promptLanguage: raw.promptLanguage as ModelCapabilities["promptLanguage"] } : {}),
    ...(raw.supportsReferenceVideo !== undefined ? { supportsReferenceVideo: raw.supportsReferenceVideo as boolean } : {}),
  };
}

function resolveDetectionRules(detection?: JsonDetection): DetectionRule[] | undefined {
  if (!detection || detection.rules.length === 0) return undefined;

  return detection.rules.map((rule) => {
    const resolved: DetectionRule = {
      pattern: rule.pattern,
      confidence: rule.confidence as "high" | "medium" | "low",
    };
    if (rule.checkId && DETECTION_CHECKS[rule.checkId]) {
      resolved.check = DETECTION_CHECKS[rule.checkId];
    }
    return resolved;
  });
}

function buildProviderDefinition(json: ProviderJsonData): ProviderDefinition {
  const result = validateProviderJson(json);
  if (!result.success && result.errors) {
    errorLogger.error({ code: "PROVIDER_JSON_INVALID", message: `Provider JSON validation failed for ${json.id}: ${result.errors.message}` });
  }

  return {
    name: json.name,
    format: json.format as ApiFormat,
    baseUrl: json.baseUrl,
    detection: resolveDetectionRules(json.detection),
    deprecated: json.deprecated,
    deprecatedReason: json.deprecatedReason,
    models: json.models.map((m) => ({
      id: m.id,
      name: m.name,
      capabilities: m.capabilities as ApiCapability[],
      defaultParams: m.defaultParams,
      modelCapabilities: resolveModelCapabilities(m),
    })),
  };
}

const PROVIDER_JSON_FILES: ProviderJsonData[] = [
  volcengineJson,
  kuaishouJson,
  zhipuJson,
  googleJson,
  minimaxJson,
  openaiJson,
  anthropicJson,
  pixverseJson,
  seedanceJson,
  moonshotJson,
  deepseekJson,
  openrouterJson,
  qwenJson,
  ollamaJson,
  pollinationsJson,
  byteplusJson,
  bedrockJson,
  fireworksJson,
  customJson,
  pikaJson,
  lumaJson,
  runwayJson,
];

export const MODEL_REGISTRY: Record<string, ProviderDefinition> = Object.fromEntries(
  PROVIDER_JSON_FILES.map((json) => [json.id, buildProviderDefinition(json)]),
);

function buildStandaloneCapabilities(): Record<string, ModelCapabilities> {
  const result = validateStandaloneCapabilities(standaloneCapabilitiesJson);
  if (!result.success && result.errors) {
    errorLogger.error({ code: "STANDALONE_CAPS_INVALID", message: `Standalone model capabilities JSON validation failed: ${result.errors.message}` });
  }

  const capabilities: Record<string, ModelCapabilities> = {};
  for (const entry of standaloneCapabilitiesJson as Array<{ id: string; capabilities: ModelCapabilities }>) {
    capabilities[entry.id] = entry.capabilities;
  }
  return capabilities;
}

const STANDALONE_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = buildStandaloneCapabilities();

function buildCapabilitiesFromRegistry(): Record<string, ModelCapabilities> {
  const result: Record<string, ModelCapabilities> = {};

  for (const [, provider] of Object.entries(MODEL_REGISTRY)) {
    for (const model of provider.models) {
      if (model.modelCapabilities) {
        result[model.id] = model.modelCapabilities;
      }
    }
  }

  Object.assign(result, STANDALONE_MODEL_CAPABILITIES);

  return result;
}

export const BUILTIN_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = buildCapabilitiesFromRegistry();

function buildProviderTemplates(): Record<string, Omit<import("./api-config/types").ProviderConfig, "id" | "apiKey">> {
  const result: Record<string, Omit<import("./api-config/types").ProviderConfig, "id" | "apiKey">> = {};

  for (const [providerId, provider] of Object.entries(MODEL_REGISTRY)) {
    if (provider.deprecated) continue;

    result[providerId] = {
      name: provider.name,
      format: provider.format,
      baseUrl: provider.baseUrl,
      models: provider.models.map((m) => ({
        id: m.id,
        name: m.name,
        capabilities: m.capabilities,
        defaultParams: m.defaultParams,
      })),
    };
  }

  return result;
}

export const PROVIDER_TEMPLATES: Record<string, Omit<import("./api-config/types").ProviderConfig, "id" | "apiKey">> = buildProviderTemplates();

export type ProviderTemplate = Omit<import("./api-config/types").ProviderConfig, "id" | "apiKey">;

function buildDetectionRules(): Array<{
  pattern: RegExp;
  templateId: string;
  confidence: "high" | "medium" | "low";
  check?: (key: string) => boolean;
}> {
  const rules: Array<{
    pattern: RegExp;
    templateId: string;
    confidence: "high" | "medium" | "low";
    check?: (key: string) => boolean;
  }> = [];

  for (const [providerId, provider] of Object.entries(MODEL_REGISTRY)) {
    if (!provider.detection) continue;
    for (const rule of provider.detection) {
      rules.push({
        pattern: new RegExp(rule.pattern),
        templateId: providerId,
        confidence: rule.confidence,
        check: rule.check,
      });
    }
  }

  return rules;
}

export const BUILTIN_DETECTION_RULES: Array<{
  pattern: RegExp;
  templateId: string;
  confidence: "high" | "medium" | "low";
  check?: (key: string) => boolean;
}> = buildDetectionRules();

function buildTemplateNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const [providerId, provider] of Object.entries(MODEL_REGISTRY)) {
    names[providerId] = provider.name;
  }
  return names;
}

export const TEMPLATE_NAMES: Record<string, string> = buildTemplateNames();

export function getProviderDefinition(providerId: string): ProviderDefinition | undefined {
  return MODEL_REGISTRY[providerId];
}

export function getAllModels(): Array<{ providerId: string; model: ModelRegistryEntry }> {
  const result: Array<{ providerId: string; model: ModelRegistryEntry }> = [];
  for (const [providerId, provider] of Object.entries(MODEL_REGISTRY)) {
    for (const model of provider.models) {
      result.push({ providerId, model });
    }
  }
  return result;
}

export function getModelEntry(modelId: string): { providerId: string; model: ModelRegistryEntry } | undefined {
  for (const [providerId, provider] of Object.entries(MODEL_REGISTRY)) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) {
      return { providerId, model };
    }
  }
  return undefined;
}

export function loadProviderFromJson(json: unknown): { success: boolean; provider?: ProviderDefinition; errors?: string } {
  const result = validateProviderJson(json);
  if (!result.success) {
    return { success: false, errors: result.errors?.message };
  }
  const provider = buildProviderDefinition(json as ProviderJsonData);
  return { success: true, provider };
}
