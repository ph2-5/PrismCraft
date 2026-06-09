import { errorLogger } from "@/shared/error-logger";
import type { AssetBinding, ElementFeatureAnchor, ReferenceImageQuality, StoryElement } from "@/domain/schemas";

export interface ElementCharacterConfig {
  gender?: string;
  age?: number;
  style?: string;
  personality?: string[];
  appearance?: {
    hairColor?: string;
    hairStyle?: string;
    eyeColor?: string;
    height?: string;
    build?: string;
    clothing?: string;
  };
}

export interface ElementSceneConfig {
  timeOfDay?: string;
  weather?: string;
  mood?: string;
  lighting?: string;
  style?: string;
}

function safeParse<T>(raw: unknown, fallback: T): T {
  if (!raw || typeof raw === "undefined") return fallback;
  if (typeof raw === "object") return raw as T;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { errorLogger.warn("[json-schemas] Failed to parse element JSON"); return fallback; }
  }
  return fallback;
}

export function parseCharacterConfig(raw: unknown): StoryElement["characterConfig"] | undefined {
  return safeParse<StoryElement["characterConfig"] | undefined>(raw, undefined);
}

export function parseSceneConfig(raw: unknown): StoryElement["sceneConfig"] | undefined {
  return safeParse<StoryElement["sceneConfig"] | undefined>(raw, undefined);
}

export function parseFeatureAnchor(raw: unknown): ElementFeatureAnchor | undefined {
  return safeParse<ElementFeatureAnchor | undefined>(raw, undefined);
}

export function parseReferenceImageQuality(raw: unknown): ReferenceImageQuality | undefined {
  return safeParse<ReferenceImageQuality | undefined>(raw, undefined);
}

export function parseBindings(raw: unknown): AssetBinding[] {
  return safeParse<AssetBinding[]>(raw, []);
}
