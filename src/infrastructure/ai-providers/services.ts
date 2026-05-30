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
