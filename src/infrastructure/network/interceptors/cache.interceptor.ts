import type { Interceptor } from "../types";

interface CacheEntry {
  response: Response;
  expiry: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 100;
const DEFAULT_TTL = 60000;

function buildCacheKey(request: RequestInit & { url?: string; endpoint?: string }): string {
  const method = request.method ?? "GET";
  const url = request.url ?? request.endpoint ?? "";
  const body = typeof request.body === "string" ? request.body : "";
  return `${method}:${url}:${body}`;
}

function cleanExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now >= entry.expiry) {
      cache.delete(key);
    }
  }
}

function evictIfNeeded(): void {
  if (cache.size < MAX_CACHE_SIZE) return;

  cleanExpired();

  if (cache.size >= MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].expiry - b[1].expiry);
    const toRemove = entries.slice(0, Math.ceil(cache.size * 0.2));
    for (const [key] of toRemove) {
      cache.delete(key);
    }
  }
}

export const cacheInterceptor: Interceptor = async (request, next) => {
  const method = request.method ?? "GET";
  if (method !== "GET") {
    return next(request);
  }

  const key = buildCacheKey(request);
  const cached = cache.get(key);

  if (cached && Date.now() < cached.expiry) {
    return cached.response.clone();
  }

  const response = await next(request);

  if (response.ok) {
    const contentType = response.headers.get("Content-Type");
    if (contentType?.includes("application/json")) {
      evictIfNeeded();
      cache.set(key, {
        response: response.clone(),
        expiry: Date.now() + DEFAULT_TTL,
      });
    }
  }

  return response;
};
