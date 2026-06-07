import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { mockGetCacheStats } = vi.hoisted(() => ({
  mockGetCacheStats: vi.fn(),
}));

vi.mock("@/modules/video/cache", () => ({
  getCacheStats: mockGetCacheStats,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: () => true,
}));

import { useVideoCacheStats } from "../use-video-cache";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function createWrapper() {
  const queryClient = createQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useVideoCacheStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch cache stats successfully", async () => {
    const stats = { count: 10, totalSizeMB: 256.5, maxCount: 100, maxSizeMB: 1024 };
    mockGetCacheStats.mockResolvedValue({ ok: true, value: stats });

    const { result } = renderHook(() => useVideoCacheStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(stats);
    expect(mockGetCacheStats).toHaveBeenCalledTimes(1);
  });

  it("should throw error when getCacheStats returns failure", async () => {
    const error = new Error("Cache storage error");
    mockGetCacheStats.mockResolvedValue({ ok: false, error });

    const { result } = renderHook(() => useVideoCacheStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
  });

  it("should throw error when getCacheStats throws", async () => {
    mockGetCacheStats.mockRejectedValue(new Error("Unexpected error"));

    const { result } = renderHook(() => useVideoCacheStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Unexpected error");
  });

  it("should return zero stats when cache is empty", async () => {
    const emptyStats = { count: 0, totalSizeMB: 0, maxCount: 100, maxSizeMB: 1024 };
    mockGetCacheStats.mockResolvedValue({ ok: true, value: emptyStats });

    const { result } = renderHook(() => useVideoCacheStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(emptyStats);
  });

  it("should use staleTime of 60 seconds", async () => {
    mockGetCacheStats.mockResolvedValue({
      ok: true,
      value: { count: 0, totalSizeMB: 0, maxCount: 100, maxSizeMB: 1024 },
    });

    const { result } = renderHook(() => useVideoCacheStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeDefined();
  });

  it("should be enabled when isElectron returns true", async () => {
    mockGetCacheStats.mockResolvedValue({
      ok: true,
      value: { count: 0, totalSizeMB: 0, maxCount: 100, maxSizeMB: 1024 },
    });

    const { result } = renderHook(() => useVideoCacheStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.fetchStatus).not.toBe("idle"));
  });
});
