interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  etag?: string;
  hitCount: number;
}

interface CacheConfig {
  ttlMs: number;
  maxEntries: number;
  staleWhileRevalidateMs: number;
}

const DEFAULT_CONFIGS: Record<string, CacheConfig> = {
  "config": { ttlMs: 5 * 60 * 1000, maxEntries: 5, staleWhileRevalidateMs: 60 * 1000 },
  "test-connection": { ttlMs: 30 * 1000, maxEntries: 20, staleWhileRevalidateMs: 10 * 1000 },
  "models": { ttlMs: 10 * 60 * 1000, maxEntries: 10, staleWhileRevalidateMs: 2 * 60 * 1000 },
  "default": { ttlMs: 60 * 1000, maxEntries: 50, staleWhileRevalidateMs: 30 * 1000 },
} as Record<string, CacheConfig>;

class ApiCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private configs: Record<string, CacheConfig>;

  constructor(configs?: Partial<Record<string, CacheConfig>>) {
    this.configs = { ...DEFAULT_CONFIGS, ...configs } as Record<string, CacheConfig>;
  }

  private getConfig(endpoint: string): CacheConfig {
    for (const key of Object.keys(this.configs)) {
      if (key !== "default" && endpoint.startsWith(key)) {
        return this.configs[key]!;
      }
    }
    return this.configs["default"]!;
  }

  private getCacheKey(endpoint: string, options?: Record<string, unknown>): string {
    const bodyHash = options?.body ? this.hashString(String(options.body)) : "";
    return `${endpoint}:${bodyHash}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  get<T>(endpoint: string, options?: Record<string, unknown>): { data: T; stale: boolean } | null {
    const key = this.getCacheKey(endpoint, options);
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const config = this.getConfig(endpoint);

    if (now < entry.expiresAt) {
      entry.hitCount++;
      return { data: entry.data as T, stale: false };
    }

    if (now < entry.expiresAt + config.staleWhileRevalidateMs) {
      entry.hitCount++;
      return { data: entry.data as T, stale: true };
    }

    this.cache.delete(key);
    return null;
  }

  set<T>(endpoint: string, data: T, options?: Record<string, unknown>, etag?: string): void {
    const key = this.getCacheKey(endpoint, options);
    const config = this.getConfig(endpoint);

    if (this.cache.size >= config.maxEntries) {
      this.evict(config.maxEntries);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + config.ttlMs,
      etag,
      hitCount: 0,
    });
  }

  invalidate(endpoint: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(endpoint + ":")) {
        this.cache.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  private evict(_maxEntries: number): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => {
        if (a[1].hitCount !== b[1].hitCount) return a[1].hitCount - b[1].hitCount;
        return a[1].timestamp - b[1].timestamp;
      });
    const toDelete = entries.slice(0, Math.ceil(entries.length * 0.2));
    for (const [key] of toDelete) {
      this.cache.delete(key);
    }
  }

  getStats(): { size: number; hitRate: number; entries: Array<{ key: string; hitCount: number; age: number; stale: boolean }> } {
    let totalHits = 0;
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => {
      totalHits += entry.hitCount;
      return { key, hitCount: entry.hitCount, age: now - entry.timestamp, stale: now > entry.expiresAt };
    });
    return { size: this.cache.size, hitRate: entries.length > 0 ? totalHits / entries.length : 0, entries };
  }
}

export const apiCache = new ApiCache();
export type { CacheEntry, CacheConfig };

export function withCache<T>(
  endpoint: string,
  fetcher: () => Promise<T>,
  _ttlMs?: number,
): Promise<T> {
  const cached = apiCache.get<T>(endpoint);
  if (cached && !cached.stale) return Promise.resolve(cached.data);
  return fetcher().then((data) => {
    apiCache.set(endpoint, data);
    return data;
  });
}

export function clearCacheByPrefix(prefix: string): void {
  apiCache.invalidate(prefix);
}
