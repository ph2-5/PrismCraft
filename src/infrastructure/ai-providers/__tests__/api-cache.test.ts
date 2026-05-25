import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiCache, withCache, clearCacheByPrefix } from "../api-cache";

describe("ApiCache (via apiCache singleton)", () => {
  beforeEach(() => {
    apiCache.invalidateAll();
  });

  describe("set and get", () => {
    it("should store and retrieve data", () => {
      apiCache.set("test-endpoint", { value: 42 });
      const result = apiCache.get<{ value: number }>("test-endpoint");
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 42 });
      expect(result!.stale).toBe(false);
    });

    it("should return null for non-existent key", () => {
      expect(apiCache.get("non-existent")).toBeNull();
    });

    it("should differentiate entries by options (body)", () => {
      apiCache.set("endpoint", "result1", { body: "a" });
      apiCache.set("endpoint", "result2", { body: "b" });
      expect(apiCache.get<string>("endpoint", { body: "a" })!.data).toBe("result1");
      expect(apiCache.get<string>("endpoint", { body: "b" })!.data).toBe("result2");
    });

    it("should return same entry for same endpoint without options", () => {
      apiCache.set("endpoint", "data");
      expect(apiCache.get<string>("endpoint")!.data).toBe("data");
      expect(apiCache.get<string>("endpoint")!.data).toBe("data");
    });
  });

  describe("TTL and stale-while-revalidate", () => {
    it("should return fresh data within TTL", () => {
      apiCache.set("test", "fresh");
      const result = apiCache.get<string>("test");
      expect(result!.stale).toBe(false);
    });

    it("should return stale data within stale-while-revalidate window", () => {
      apiCache.set("test-connection/1", "stale-data");
      const internalCache = (apiCache as unknown as { cache: Map<string, { expiresAt: number }> }).cache;
      const key = Array.from(internalCache.keys()).find((k) => k.startsWith("test-connection/1"));
      if (key) {
        const entry = internalCache.get(key)!;
        entry.expiresAt = Date.now() - 1;
      }
      const result = apiCache.get<string>("test-connection/1");
      expect(result).not.toBeNull();
      expect(result!.stale).toBe(true);
      expect(result!.data).toBe("stale-data");
    });

    it("should return null after stale-while-revalidate window expires", () => {
      apiCache.set("test-connection/2", "expired");
      const internalCache = (apiCache as unknown as { cache: Map<string, { expiresAt: number }> }).cache;
      const key = Array.from(internalCache.keys()).find((k) => k.startsWith("test-connection/2"));
      if (key) {
        const entry = internalCache.get(key)!;
        entry.expiresAt = Date.now() - 100000;
      }
      expect(apiCache.get("test-connection/2")).toBeNull();
    });
  });

  describe("invalidate", () => {
    it("should remove entries matching endpoint prefix", () => {
      apiCache.set("config", "data1");
      apiCache.set("config/models", "data2");
      apiCache.set("other/endpoint", "data3");

      apiCache.invalidate("config");

      expect(apiCache.get("config")).toBeNull();
      expect(apiCache.get("config/models")).not.toBeNull();
      expect(apiCache.get<string>("other/endpoint")!.data).toBe("data3");
    });
  });

  describe("invalidateAll", () => {
    it("should clear all entries", () => {
      apiCache.set("a", 1);
      apiCache.set("b", 2);
      apiCache.invalidateAll();
      expect(apiCache.get("a")).toBeNull();
      expect(apiCache.get("b")).toBeNull();
    });
  });

  describe("getStats", () => {
    it("should return empty stats for empty cache", () => {
      const stats = apiCache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.entries).toEqual([]);
    });

    it("should return stats with entries", () => {
      apiCache.set("endpoint1", "data1");
      apiCache.set("endpoint2", "data2");

      apiCache.get<string>("endpoint1");
      apiCache.get<string>("endpoint1");

      const stats = apiCache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.entries.length).toBe(2);
    });
  });
});

describe("withCache", () => {
  beforeEach(() => {
    apiCache.invalidateAll();
  });

  it("should return cached data when available and fresh", async () => {
    const fetcher = vi.fn().mockResolvedValue("fetched");
    const endpoint = "withcache-test-fresh-" + Date.now();

    const result1 = await withCache(endpoint, fetcher);
    expect(result1).toBe("fetched");
    expect(fetcher).toHaveBeenCalledTimes(1);

    const result2 = await withCache(endpoint, fetcher);
    expect(result2).toBe("fetched");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should call fetcher when cache is empty", async () => {
    const fetcher = vi.fn().mockResolvedValue("new-data");
    const result = await withCache("withcache-test-miss-" + Date.now(), fetcher);
    expect(result).toBe("new-data");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("clearCacheByPrefix", () => {
  it("should clear entries matching prefix", () => {
    apiCache.invalidateAll();
    apiCache.set("prefix", 1);
    apiCache.set("prefix-b", 2);
    apiCache.set("other-c", 3);

    clearCacheByPrefix("prefix");

    expect(apiCache.get("prefix")).toBeNull();
    expect(apiCache.get("prefix-b")).not.toBeNull();
    expect(apiCache.get<number>("other-c")!.data).toBe(3);
  });
});
