import { errorLogger } from "@/shared/error-logger";

export interface CharacterAppearanceContainer {
  avatarPath?: string;
  thumbnailPath?: string;
  previewPath?: string;
  generatedImage?: string;
  generatedVideo?: string;
  videoGenerationStatus?: string;
  videoGenerationTaskId?: string;
  imageGenerationPrompt?: string;
}

export interface CharacterGenerationContainer {
  prompt?: string;
  generationPrompt?: string;
  generationParams?: Record<string, unknown>;
}

export interface CharacterConfigContainer {
  appearance?: Record<string, unknown>;
  personality?: unknown[];
  traits?: unknown[];
}

export interface CharacterMetaContainer {
  tags?: unknown[];
  outfits?: unknown;
}

function safeParse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw === "undefined") return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { errorLogger.warn("[json-schemas] Failed to parse character JSON"); return {}; }
  }
  return {};
}

export function parseAppearanceContainer(raw: unknown): CharacterAppearanceContainer {
  return safeParse(raw) as CharacterAppearanceContainer;
}

export function parseGenerationContainer(raw: unknown): CharacterGenerationContainer {
  return safeParse(raw) as CharacterGenerationContainer;
}

export function parseConfigContainer(raw: unknown): CharacterConfigContainer {
  return safeParse(raw) as CharacterConfigContainer;
}

export function parseMetaContainer(raw: unknown): CharacterMetaContainer {
  return safeParse(raw) as CharacterMetaContainer;
}
