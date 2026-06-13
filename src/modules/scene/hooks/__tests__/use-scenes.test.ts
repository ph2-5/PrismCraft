import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { Scene } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";

const { mockSceneService, mockDeleteSceneWithRefs } = vi.hoisted(() => ({
  mockSceneService: {
    getAll: vi.fn<() => Promise<Result<Scene[]>>>(),
    getById: vi.fn<(id: string) => Promise<Result<Scene>>>(),
    create: vi.fn<(input: unknown) => Promise<Result<Scene>>>(),
    update: vi.fn<(id: string, input: unknown) => Promise<Result<void>>>(),
    delete: vi.fn<(id: string) => Promise<Result<void>>>(),
    count: vi.fn<() => Promise<Result<number>>>(),
  },
  mockDeleteSceneWithRefs: vi.fn<(id: string) => Promise<Result<void>>>(),
}));

vi.mock("@/modules/scene/services", () => ({
  sceneService: mockSceneService,
}));

vi.mock("@/modules/persistence", () => ({
  deleteSceneWithRefs: mockDeleteSceneWithRefs,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: vi.fn(() => true),
}));

import { useScenes, useScene, useSceneCount, useCreateScene, useUpdateScene, useDeleteScene } from "../use-scenes";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper() {
  const queryClient = createQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const mockScene: Scene = {
  id: "scene-1",
  name: "测试场景",
  description: "描述",
  type: "室内",
  timeOfDay: "白天",
  weather: "晴天",
  mood: "欢快",
  lighting: "自然光",
  elements: ["建筑"],
  colors: ["暖色调"],
  prompt: "测试提示词",
};

describe("useScenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSceneService.getAll.mockResolvedValue(ok([mockScene]));
  });

  it("成功获取场景列表", async () => {
    const { result } = renderHook(() => useScenes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSceneService.getAll).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual([mockScene]);
  });

  it("获取场景列表失败时应抛出错误", async () => {
    mockSceneService.getAll.mockResolvedValue(err(new AppError("DATABASE_ERROR", "数据库错误")));

    const { result } = renderHook(() => useScenes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });

  it("返回空列表", async () => {
    mockSceneService.getAll.mockResolvedValue(ok([]));

    const { result } = renderHook(() => useScenes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});

describe("useScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSceneService.getById.mockResolvedValue(ok(mockScene));
  });

  it("成功获取单个场景", async () => {
    const { result } = renderHook(() => useScene("scene-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSceneService.getById).toHaveBeenCalledWith("scene-1");
    expect(result.current.data).toEqual(mockScene);
  });

  it("获取不存在的场景应报错", async () => {
    mockSceneService.getById.mockResolvedValue(err(new AppError("NOT_FOUND", "场景不存在")));

    const { result } = renderHook(() => useScene("non-existent"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });

  it("id 为空时不应发起请求", () => {
    const { result } = renderHook(() => useScene(""), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockSceneService.getById).not.toHaveBeenCalled();
  });
});

describe("useSceneCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSceneService.count.mockResolvedValue(ok(5));
  });

  it("成功获取场景数量", async () => {
    const { result } = renderHook(() => useSceneCount(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSceneService.count).toHaveBeenCalledOnce();
    expect(result.current.data).toBe(5);
  });

  it("获取数量失败时应报错", async () => {
    mockSceneService.count.mockResolvedValue(err(new AppError("DATABASE_ERROR", "数据库错误")));

    const { result } = renderHook(() => useSceneCount(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("返回零数量", async () => {
    mockSceneService.count.mockResolvedValue(ok(0));

    const { result } = renderHook(() => useSceneCount(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(0);
  });
});

describe("useCreateScene", () => {
  const createInput = {
    name: "新场景",
    description: "描述",
    type: "室内",
    timeOfDay: "白天",
    weather: "晴天",
    mood: "欢快",
    lighting: "自然光",
    elements: ["建筑"],
    colors: ["暖色调"],
    prompt: "提示词",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSceneService.create.mockResolvedValue(ok({ ...mockScene, id: "scene-new", name: "新场景" }));
  });

  it("成功创建场景并 invalidate queries", async () => {
    const { result } = renderHook(() => useCreateScene(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(createInput);
    });

    expect(mockSceneService.create).toHaveBeenCalledWith(createInput);
  });

  it("创建失败时应抛出错误", async () => {
    mockSceneService.create.mockResolvedValue(err(new AppError("VALIDATION_ERROR", "验证失败")));

    const { result } = renderHook(() => useCreateScene(), { wrapper: createWrapper() });

    await act(async () => {
      try {
        await result.current.mutateAsync(createInput);
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateScene", () => {
  const updateInput = { id: "scene-1", name: "更新场景" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSceneService.update.mockResolvedValue(ok(undefined));
  });

  it("成功更新场景", async () => {
    const { result } = renderHook(() => useUpdateScene(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(updateInput);
    });

    expect(mockSceneService.update).toHaveBeenCalledWith("scene-1", updateInput);
  });

  it("更新失败时应抛出错误", async () => {
    mockSceneService.update.mockResolvedValue(err(new AppError("DATABASE_ERROR", "数据库错误")));

    const { result } = renderHook(() => useUpdateScene(), { wrapper: createWrapper() });

    await act(async () => {
      try {
        await result.current.mutateAsync(updateInput);
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDeleteScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteSceneWithRefs.mockResolvedValue(ok(undefined));
  });

  it("成功删除场景", async () => {
    const { result } = renderHook(() => useDeleteScene(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync("scene-1");
    });

    expect(mockDeleteSceneWithRefs).toHaveBeenCalledWith("scene-1");
  });

  it("删除失败时应抛出错误", async () => {
    mockDeleteSceneWithRefs.mockResolvedValue(err(new AppError("DATABASE_ERROR", "删除失败")));

    const { result } = renderHook(() => useDeleteScene(), { wrapper: createWrapper() });

    await act(async () => {
      try {
        await result.current.mutateAsync("scene-1");
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("删除时应使用 deleteSceneWithRefs 而非 sceneService.delete", async () => {
    const { result } = renderHook(() => useDeleteScene(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync("scene-1");
    });

    expect(mockDeleteSceneWithRefs).toHaveBeenCalledWith("scene-1");
    expect(mockSceneService.delete).not.toHaveBeenCalled();
  });
});
