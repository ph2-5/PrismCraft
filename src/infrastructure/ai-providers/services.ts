import { apiCallWithRetry } from "./core";
import type { ApiResponse } from "@/domain/schemas";

export async function secureConfig(
  operation: "save" | "load" | "clear",
  config?: Record<string, unknown>,
): Promise<ApiResponse<{ config?: Record<string, unknown> }>> {
  return apiCallWithRetry("secure-config", {
    method: "POST",
    body: JSON.stringify({ operation, config }),
  });
}

export async function exportData(
  data: unknown,
  format: string = "json",
): Promise<ApiResponse<{ path: string }>> {
  return apiCallWithRetry("export", {
    method: "POST",
    body: JSON.stringify({ data, format }),
  });
}

export async function buildPrompt(params: {
  type: string;
  params: Record<string, unknown>;
}): Promise<ApiResponse<{ prompt: string; type: string }>> {
  return apiCallWithRetry("prompt/build", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function normalizeImageBackend(params: {
  imageUrl: string;
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    maxSizeMB?: number;
    quality?: number;
    format?: "jpeg" | "png" | "webp";
  };
}): Promise<
  ApiResponse<{
    url: string;
    originalSize: number;
    normalizedSize: number;
    width: number;
    height: number;
    format: string;
  }>
> {
  return apiCallWithRetry("image/normalize", {
    method: "POST",
    body: JSON.stringify(params),
    timeout: 60000,
  });
}

export async function validateBusiness(params: {
  type: string;
  params: Record<string, unknown>;
}): Promise<ApiResponse<unknown>> {
  return apiCallWithRetry("validate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function replacePlaceholdersBackend(params: {
  text: string;
  bindings?: Array<{
    placeholder: string;
    type: "character" | "scene";
    targetId: string;
  }>;
  characters?: Array<{ id: string; name: string }>;
  scenes?: Array<{ id: string; name: string }>;
}): Promise<
  ApiResponse<{
    result: string;
    placeholders: Array<{ placeholder: string; type: "character" | "scene" }>;
  }>
> {
  return apiCallWithRetry("story/replace-placeholders", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
