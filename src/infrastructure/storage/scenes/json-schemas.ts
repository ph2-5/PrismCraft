import { errorLogger } from "@/shared/error-logger";

export interface SceneAppearanceContainer {
  avatarPath?: string;
  thumbnailPath?: string;
  previewPath?: string;
  generatedImage?: string;
  generatedVideo?: string;
  videoGenerationStatus?: string;
  videoGenerationTaskId?: string;
  imageGenerationPrompt?: string;
  scenePath?: string;
  imageUrl?: string;
}

export interface SceneAtmosphereContainer {
  mood?: string;
  timeOfDay?: string;
  weather?: string;
  setting?: string;
  location?: string;
  style?: string;
  elements?: unknown[];
  colors?: unknown[];
  lighting?: string;
}

export interface SceneGenerationContainer {
  prompt?: string;
  generationPrompt?: string;
  generationParams?: Record<string, unknown>;
}

export interface SceneConfigContainer {
  atmosphere?: string;
  camera?: Record<string, unknown>;
  props?: unknown[];
  tags?: unknown[];
  relatedCharacters?: unknown[];
}

function safeParse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw === "undefined") return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { errorLogger.warn("[json-schemas] Failed to parse scene JSON"); return {}; }
  }
  return {};
}

export function parseAppearanceContainer(raw: unknown): SceneAppearanceContainer {
  return safeParse(raw) as SceneAppearanceContainer;
}

export function parseAtmosphereContainer(raw: unknown): SceneAtmosphereContainer {
  return safeParse(raw) as SceneAtmosphereContainer;
}

export function parseGenerationContainer(raw: unknown): SceneGenerationContainer {
  return safeParse(raw) as SceneGenerationContainer;
}

export function parseConfigContainer(raw: unknown): SceneConfigContainer {
  return safeParse(raw) as SceneConfigContainer;
}
