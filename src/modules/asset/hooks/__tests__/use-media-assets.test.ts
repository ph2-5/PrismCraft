import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { type ReactNode } from "react";
import type { MediaAsset } from "@/domain/schemas";

const { mockGetAll, mockIsElectron } = vi.hoisted(() => ({
  mockGetAll: vi.fn<() => Promise<MediaAsset[]>>(),
  mockIsElectron: vi.fn<() => boolean>(),
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

vi.mock("@/modules/asset/media-assets", () => ({
  mediaAssetService: { getAll: mockGetAll },
}));

import { useMediaAssets } from "@/modules/asset";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const mockAsset: MediaAsset = {
  id: "asset-1",
  name: "Test Asset",
  description: "",
  type: "image",
  url: "https://example.com/image.png",
  tags: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("useMediaAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsElectron.mockReturnValue(false);
    mockGetAll.mockResolvedValue([]);
  });

  it("isElectron() 为 true 时应发起查询", async () => {
    mockIsElectron.mockReturnValue(true);
    mockGetAll.mockResolvedValue([mockAsset]);

    const { result } = renderHook(() => useMediaAssets(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetAll).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual([mockAsset]);
  });

  it("isElectron() 为 false 时不应发起查询（enabled: false）", async () => {
    mockIsElectron.mockReturnValue(false);

    const { result } = renderHook(() => useMediaAssets(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });

    expect(mockGetAll).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("查询成功时应返回数据", async () => {
    mockIsElectron.mockReturnValue(true);
    const assets: MediaAsset[] = [
      mockAsset,
      {
        id: "asset-2",
        name: "Another Asset",
        description: "视频资产",
        type: "video",
        url: "https://example.com/video.mp4",
        tags: ["动画"],
        createdAt: "2024-02-01T00:00:00Z",
        updatedAt: "2024-02-01T00:00:00Z",
      },
    ];
    mockGetAll.mockResolvedValue(assets);

    const { result } = renderHook(() => useMediaAssets(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0]!.id).toBe("asset-1");
    expect(result.current.data![1]!.id).toBe("asset-2");
  });

  it("查询失败时应返回错误状态", async () => {
    mockIsElectron.mockReturnValue(true);
    mockGetAll.mockRejectedValue(new Error("数据库查询失败"));

    const { result } = renderHook(() => useMediaAssets(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe("数据库查询失败");
    expect(result.current.data).toBeUndefined();
  });
});
