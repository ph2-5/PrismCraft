import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const {
  mockGetAllTaskHistory,
  mockGetFailedTasks,
  mockRecoverVideoByTaskId,
  mockCleanExpiredTasks,
  mockStartBackgroundRecovery,
} = vi.hoisted(() => ({
  mockGetAllTaskHistory: vi.fn(),
  mockGetFailedTasks: vi.fn(),
  mockRecoverVideoByTaskId: vi.fn(),
  mockCleanExpiredTasks: vi.fn(),
  mockStartBackgroundRecovery: vi.fn(),
}));

vi.mock("@/modules/video/recovery", () => ({
  getAllTaskHistory: mockGetAllTaskHistory,
  getFailedTasks: mockGetFailedTasks,
  recoverVideoByTaskId: mockRecoverVideoByTaskId,
  cleanExpiredTasks: mockCleanExpiredTasks,
  startBackgroundRecovery: mockStartBackgroundRecovery,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: () => true,
}));

import {
  useVideoTasks,
  useFailedVideoTasks,
  useRecoverVideo,
  useCleanExpiredTasks,
  useStartBackgroundRecovery,
} from "../use-video-tasks";

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

describe("useVideoTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch all task history successfully", async () => {
    const tasks = [
      { taskId: "task-1", status: "completed" },
      { taskId: "task-2", status: "pending" },
    ];
    mockGetAllTaskHistory.mockResolvedValue({ ok: true, value: tasks });

    const { result } = renderHook(() => useVideoTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(tasks);
    expect(mockGetAllTaskHistory).toHaveBeenCalledTimes(1);
  });

  it("should throw error when getAllTaskHistory returns failure", async () => {
    const error = new Error("DB connection failed");
    mockGetAllTaskHistory.mockResolvedValue({ ok: false, error });

    const { result } = renderHook(() => useVideoTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
  });

  it("should throw error when getAllTaskHistory throws", async () => {
    mockGetAllTaskHistory.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useVideoTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Network error");
  });

  it("should return empty array when no tasks exist", async () => {
    mockGetAllTaskHistory.mockResolvedValue({ ok: true, value: [] });

    const { result } = renderHook(() => useVideoTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it("should be enabled when isElectron returns true", async () => {
    mockGetAllTaskHistory.mockResolvedValue({ ok: true, value: [] });

    const { result } = renderHook(() => useVideoTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.fetchStatus).not.toBe("idle"));
  });
});

describe("useFailedVideoTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch failed tasks successfully", async () => {
    const failedTasks = [
      { taskId: "task-fail-1", status: "failed" },
    ];
    mockGetFailedTasks.mockResolvedValue({ ok: true, value: failedTasks });

    const { result } = renderHook(() => useFailedVideoTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(failedTasks);
    expect(mockGetFailedTasks).toHaveBeenCalledTimes(1);
  });

  it("should throw error when getFailedTasks returns failure", async () => {
    const error = new Error("Failed to load");
    mockGetFailedTasks.mockResolvedValue({ ok: false, error });

    const { result } = renderHook(() => useFailedVideoTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
  });

  it("should return empty array when no failed tasks exist", async () => {
    mockGetFailedTasks.mockResolvedValue({ ok: true, value: [] });

    const { result } = renderHook(() => useFailedVideoTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});

describe("useRecoverVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should recover a video task successfully", async () => {
    mockRecoverVideoByTaskId.mockResolvedValue({ ok: true, value: undefined });

    const { result } = renderHook(() => useRecoverVideo(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("task-recover-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRecoverVideoByTaskId).toHaveBeenCalledWith("task-recover-1");
  });

  it("should throw error when recoverVideoByTaskId returns failure", async () => {
    const error = new Error("Recovery failed");
    mockRecoverVideoByTaskId.mockResolvedValue({ ok: false, error });

    const { result } = renderHook(() => useRecoverVideo(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("task-recover-2");

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
  });

  it("should invalidate video-tasks queries on success", async () => {
    mockRecoverVideoByTaskId.mockResolvedValue({ ok: true, value: undefined });

    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    };

    const { result } = renderHook(() => useRecoverVideo(), { wrapper });

    result.current.mutate("task-recover-3");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["video-tasks"],
    });
  });
});

describe("useCleanExpiredTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should clean expired tasks successfully", async () => {
    mockCleanExpiredTasks.mockResolvedValue({ ok: true, value: 5 });

    const { result } = renderHook(() => useCleanExpiredTasks(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(5);
    expect(mockCleanExpiredTasks).toHaveBeenCalledTimes(1);
  });

  it("should throw error when cleanExpiredTasks returns failure", async () => {
    const error = new Error("Cleanup failed");
    mockCleanExpiredTasks.mockResolvedValue({ ok: false, error });

    const { result } = renderHook(() => useCleanExpiredTasks(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
  });

  it("should invalidate video-tasks queries on success", async () => {
    mockCleanExpiredTasks.mockResolvedValue({ ok: true, value: 0 });

    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    };

    const { result } = renderHook(() => useCleanExpiredTasks(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["video-tasks"],
    });
  });
});

describe("useStartBackgroundRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should start background recovery successfully", async () => {
    mockStartBackgroundRecovery.mockResolvedValue({ ok: true, value: undefined });

    const { result } = renderHook(() => useStartBackgroundRecovery(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockStartBackgroundRecovery).toHaveBeenCalledTimes(1);
  });

  it("should throw error when startBackgroundRecovery returns failure", async () => {
    const error = new Error("Background recovery failed");
    mockStartBackgroundRecovery.mockResolvedValue({ ok: false, error });

    const { result } = renderHook(() => useStartBackgroundRecovery(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
  });

  it("should not invalidate queries on success (no onSuccess handler)", async () => {
    mockStartBackgroundRecovery.mockResolvedValue({ ok: true, value: undefined });

    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    };

    const { result } = renderHook(() => useStartBackgroundRecovery(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
