import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Story, CreateStoryInput } from "@/domain/schemas";

const { mockStoryService, mockIsElectron } = vi.hoisted(() => ({
  mockStoryService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  mockIsElectron: vi.fn().mockReturnValue(true),
}));

vi.mock("@/modules/storyboard/planning/services/story-service", () => ({
  storyService: mockStoryService,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

import {
  useStories,
  useStory,
  useStoryCount,
  useCreateStory,
  useUpdateStory,
  useDeleteStory,
} from "../use-stories";

const mockStory: Story = {
  id: "story-1",
  title: "测试故事",
  description: "描述",
  characters: [],
  scenes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  beats: [],
  elementIds: [],
  status: "in_progress",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("use-stories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsElectron.mockReturnValue(true);
  });

  describe("useStories", () => {
    it("应成功获取故事列表", async () => {
      mockStoryService.getAll.mockResolvedValue({
        ok: true,
        value: [mockStory],
      });

      const { result } = renderHook(() => useStories(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([mockStory]);
    });

    it("服务返回错误时应设置 isError", async () => {
      mockStoryService.getAll.mockResolvedValue({
        ok: false,
        error: new Error("获取失败"),
      });

      const { result } = renderHook(() => useStories(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it("非 Electron 环境时 query 不应启用", () => {
      mockIsElectron.mockReturnValue(false);

      const { result } = renderHook(() => useStories(), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
    });
  });

  describe("useStory", () => {
    it("应成功获取单个故事", async () => {
      mockStoryService.getById.mockResolvedValue({
        ok: true,
        value: mockStory,
      });

      const { result } = renderHook(() => useStory("story-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockStory);
    });

    it("id 为空时 query 不应启用", () => {
      const { result } = renderHook(() => useStory(""), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
    });

    it("服务返回错误时应设置 isError", async () => {
      mockStoryService.getById.mockResolvedValue({
        ok: false,
        error: new Error("未找到"),
      });

      const { result } = renderHook(() => useStory("nonexistent"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useStoryCount", () => {
    it("应成功获取故事数量", async () => {
      mockStoryService.count.mockResolvedValue({
        ok: true,
        value: 5,
      });

      const { result } = renderHook(() => useStoryCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(5);
    });

    it("服务返回错误时应设置 isError", async () => {
      mockStoryService.count.mockResolvedValue({
        ok: false,
        error: new Error("计数失败"),
      });

      const { result } = renderHook(() => useStoryCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useCreateStory", () => {
    it("应成功创建故事", async () => {
      const input: CreateStoryInput = { title: "新故事", description: "", characters: [], scenes: [], elementIds: [], beats: [] };
      mockStoryService.create.mockResolvedValue({
        ok: true,
        value: mockStory,
      });

      const { result } = renderHook(() => useCreateStory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(input);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockStoryService.create).toHaveBeenCalledWith(input);
    });

    it("创建失败时应设置 isError", async () => {
      const input: CreateStoryInput = { title: "新故事", description: "", characters: [], scenes: [], elementIds: [], beats: [] };
      mockStoryService.create.mockResolvedValue({
        ok: false,
        error: new Error("创建失败"),
      });

      const { result } = renderHook(() => useCreateStory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(input);

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useUpdateStory", () => {
    it("应成功更新故事", async () => {
      const input = { id: "story-1", title: "更新标题" };
      mockStoryService.update.mockResolvedValue({
        ok: true,
        value: undefined,
      });

      const { result } = renderHook(() => useUpdateStory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(input);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockStoryService.update).toHaveBeenCalledWith("story-1", input);
    });

    it("更新失败时应设置 isError", async () => {
      const input = { id: "story-1", title: "更新标题" };
      mockStoryService.update.mockResolvedValue({
        ok: false,
        error: new Error("更新失败"),
      });

      const { result } = renderHook(() => useUpdateStory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(input);

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useDeleteStory", () => {
    it("应成功删除故事", async () => {
      mockStoryService.delete.mockResolvedValue({
        ok: true,
        value: undefined,
      });

      const { result } = renderHook(() => useDeleteStory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("story-1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockStoryService.delete).toHaveBeenCalledWith("story-1");
    });

    it("删除失败时应设置 isError", async () => {
      mockStoryService.delete.mockResolvedValue({
        ok: false,
        error: new Error("删除失败"),
      });

      const { result } = renderHook(() => useDeleteStory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("story-1");

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
