import { apiCallWithRetry } from "./core";
import { withCache, clearCacheByPrefix } from "@/infrastructure/ai-providers/api-cache";
import type { ApiResponse } from "@/domain/schemas";
import type { ConfigStatus } from "@/infrastructure/ai-providers/api-config/init";

export async function getConfigStatus(): Promise<
  ApiResponse<{
    status: ConfigStatus;
  }>
> {
  return withCache(
    "config",
    () => apiCallWithRetry("config", { method: "GET" }),
    60000,
  );
}

export function clearConfigStatusCache(): void {
  clearCacheByPrefix("config");
}
