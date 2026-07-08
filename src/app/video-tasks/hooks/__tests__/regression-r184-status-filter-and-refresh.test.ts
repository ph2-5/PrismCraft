/**
 * R184: VideoTasksPage statusFilter 必须实际过滤 tasks，刷新按钮必须有 onClick
 *
 * 回归规则目的：
 *   src/app/video-tasks/hooks/useVideoTasksPage.ts 必须返回有效的 statusFilter
 *   state、setStatusFilter、filteredTasks（按 status 过滤）以及 handleRefresh
 *   （实际调用 useVideoTaskStore.getState().initialize() 重新从 DB 加载任务，
 *   不再使用 window.location.reload 以避免丢失内存状态）。
 *
 * 历史问题：
 *   原 select 元素没有 value/onChange 绑定，刷新按钮没有 onClick，导致用户
 *   无法过滤任务列表，刷新按钮点击无反应。
 *
 * 变更历史：
 *   - 初版：handleRefresh 调用 window.location.reload()
 *   - 修订（Phase 0.5 P0-3）：改为 useVideoTaskStore.getState().initialize()，
 *     避免重载整个 renderer 进程导致内存状态、轮询引擎、未保存表单丢失。
 *
 * 被测代码：
 *   src/app/video-tasks/hooks/useVideoTasksPage.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { VideoTask } from "@/modules/video";

const {
  mockUseVideoTaskManager,
  mockUseVideoTaskStore,
  mockUseNavigationGuard,
  mockConfirm,
  mockToastHelpers,
  mockT,
  mockInitialize,
} = vi.hoisted(() => ({
  mockUseVideoTaskManager: vi.fn(),
  mockUseVideoTaskStore: vi.fn((selector: (s: { isInitialized: boolean }) => boolean) => selector({ isInitialized: true })),
  mockUseNavigationGuard: vi.fn(() => ({ guardedPush: vi.fn() })),
  mockConfirm: vi.fn(),
  mockToastHelpers: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  mockT: vi.fn((key: string, params?: Record<string, string | number>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  }),
  mockInitialize: vi.fn(),
}));

vi.mock("@/modules/video", () => ({
  useVideoTaskManager: mockUseVideoTaskManager,
  useVideoTaskStore: Object.assign(mockUseVideoTaskStore, {
    getState: () => ({ initialize: mockInitialize }),
  }),
}));

vi.mock("@/shared/presentation/BeforeUnloadGuard", () => ({
  useNavigationGuard: mockUseNavigationGuard,
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: mockConfirm,
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: () => mockToastHelpers,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

import { useVideoTasksPage } from "../useVideoTasksPage";

/** 构造模拟 VideoTask */
function makeTask(id: string, status: VideoTask["status"]): VideoTask {
  return {
    taskId: id,
    beatId: `beat-${id}`,
    status,
    prompt: `prompt-${id}`,
    createdAt: Date.now(),
  } as unknown as VideoTask;
}

/** 构造一组混合状态的任务 */
function makeMixedTasks(): VideoTask[] {
  return [
    makeTask("t-pending-1", "pending"),
    makeTask("t-pending-2", "pending"),
    makeTask("t-gen-1", "generating"),
    makeTask("t-gen-2", "generating"),
    makeTask("t-done-1", "completed"),
    makeTask("t-done-2", "completed"),
    makeTask("t-failed-1", "failed"),
    makeTask("t-timeout-1", "timeout"),
  ];
}

describe("R184: VideoTasksPage statusFilter 与刷新按钮", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupManager(tasks: VideoTask[]) {
    mockUseVideoTaskManager.mockReturnValue({
      allTasks: tasks,
      startBackgroundProcessing: vi.fn(),
      clearCompletedTasks: vi.fn().mockResolvedValue(undefined),
      clearFailedTasks: vi.fn().mockResolvedValue(undefined),
      recoverTask: vi.fn(),
    });
  }

  it("初始 statusFilter 为 'all'，filteredTasks 返回全部任务", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    expect(result.current.statusFilter).toBe("all");
    expect(result.current.allTasks).toHaveLength(tasks.length);
  });

  it("statusFilter='processing' 只包含 generating 和 pending", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    act(() => {
      result.current.setStatusFilter("processing");
    });

    expect(result.current.statusFilter).toBe("processing");
    expect(result.current.allTasks).toHaveLength(4); // 2 pending + 2 generating
    const ids = result.current.allTasks.map((t) => t.taskId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "t-pending-1",
        "t-pending-2",
        "t-gen-1",
        "t-gen-2",
      ]),
    );
    // 不应包含 completed/failed/timeout
    expect(ids).not.toContain("t-done-1");
    expect(ids).not.toContain("t-failed-1");
  });

  it("statusFilter='completed' 只包含 completed", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    act(() => {
      result.current.setStatusFilter("completed");
    });

    expect(result.current.statusFilter).toBe("completed");
    expect(result.current.allTasks).toHaveLength(2);
    expect(result.current.allTasks.every((t) => t.status === "completed")).toBe(true);
  });

  it("statusFilter='failed' 只包含 failed 和 timeout", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    act(() => {
      result.current.setStatusFilter("failed");
    });

    expect(result.current.statusFilter).toBe("failed");
    expect(result.current.allTasks).toHaveLength(2); // 1 failed + 1 timeout
    const ids = result.current.allTasks.map((t) => t.taskId);
    expect(ids).toEqual(
      expect.arrayContaining(["t-failed-1", "t-timeout-1"]),
    );
  });

  it("切回 'all' 应再次返回全部任务", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    act(() => {
      result.current.setStatusFilter("completed");
    });
    expect(result.current.allTasks).toHaveLength(2);

    act(() => {
      result.current.setStatusFilter("all");
    });
    expect(result.current.allTasks).toHaveLength(tasks.length);
  });

  it("handleRefresh 必须被返回且为函数", () => {
    setupManager(makeMixedTasks());

    const { result } = renderHook(() => useVideoTasksPage());

    expect(typeof result.current.handleRefresh).toBe("function");
  });

  it("调用 handleRefresh 应触发 useVideoTaskStore.getState().initialize() 重新加载任务", () => {
    setupManager(makeMixedTasks());

    const { result } = renderHook(() => useVideoTasksPage());

    act(() => {
      result.current.handleRefresh();
    });

    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it("setStatusFilter 必须被返回且为函数", () => {
    setupManager(makeMixedTasks());

    const { result } = renderHook(() => useVideoTasksPage());

    expect(typeof result.current.setStatusFilter).toBe("function");
  });

  it("filteredTasks 必须是基于 statusFilter 的派生数据（不污染原始任务列表）", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    act(() => {
      result.current.setStatusFilter("completed");
    });

    // allTasks 返回的是过滤后的派生数据
    expect(result.current.allTasks).toHaveLength(2);
    // 但统计字段（如 completedTasks）应基于原始任务计算
    expect(result.current.completedTasks).toBe(2);
    expect(result.current.totalTasks).toBe(tasks.length);
  });
});
