/**
 * R156: useVideoTasksPage Statistics MUST Be Memoized (Single Pass) and timeout Counts as failed
 *
 * 回归规则目的：
 *   src/app/video-tasks/hooks/useVideoTasksPage.ts 中的统计计算
 *   (totalTasks / completedTasks / processingTasks / pendingTasks / failedTasks)
 *   必须用 useMemo 单次遍历计算，且 `timeout` 状态的任务必须归入 failedTasks。
 *   禁止改回 5 次 O(n) filter，否则任务量大时（>1000 条）会反复创建中间数组，
 *   导致重渲染卡顿。
 *
 * 历史问题：
 *   原实现为 5 次连续 filter：
 *     - completedTasks = tasks.filter(t => t.status === "completed").length
 *     - processingTasks = tasks.filter(t => t.status === "generating").length
 *     - ...
 *   每次重渲染（包括 statusFilter 变化）都触发 5 次遍历，且 timeout 任务
 *   没有归入 failedTasks，导致 failed 数量不一致。
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
}));

vi.mock("@/modules/video", () => ({
  useVideoTaskManager: mockUseVideoTaskManager,
  useVideoTaskStore: mockUseVideoTaskStore,
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
    makeTask("p1", "pending"),
    makeTask("p2", "pending"),
    makeTask("p3", "pending"),
    makeTask("g1", "generating"),
    makeTask("g2", "generating"),
    makeTask("c1", "completed"),
    makeTask("c2", "completed"),
    makeTask("c3", "completed"),
    makeTask("c4", "completed"),
    makeTask("f1", "failed"),
    makeTask("t1", "timeout"),
    makeTask("t2", "timeout"),
  ];
}

describe("R156: useVideoTasksPage 统计必须 memoize 且 timeout 归入 failed", () => {
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

  it("混合状态任务下统计值必须正确（timeout 归入 failed）", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    // totalTasks = 12（包含所有状态）
    expect(result.current.totalTasks).toBe(12);
    // pending = 3
    expect(result.current.pendingTasks).toBe(3);
    // processing (generating) = 2
    expect(result.current.processingTasks).toBe(2);
    // completed = 4
    expect(result.current.completedTasks).toBe(4);
    // failed = 1 (failed) + 2 (timeout) = 3
    expect(result.current.failedTasks).toBe(3);
  });

  it("timeout 任务必须计入 failedTasks，不计入其他类别", () => {
    const tasks: VideoTask[] = [
      makeTask("t1", "timeout"),
      makeTask("t2", "timeout"),
      makeTask("t3", "timeout"),
    ];
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    expect(result.current.failedTasks).toBe(3);
    expect(result.current.completedTasks).toBe(0);
    expect(result.current.processingTasks).toBe(0);
    expect(result.current.pendingTasks).toBe(0);
    expect(result.current.totalTasks).toBe(3);
  });

  it("空任务列表时所有统计应为 0", () => {
    setupManager([]);

    const { result } = renderHook(() => useVideoTasksPage());

    expect(result.current.totalTasks).toBe(0);
    expect(result.current.completedTasks).toBe(0);
    expect(result.current.processingTasks).toBe(0);
    expect(result.current.pendingTasks).toBe(0);
    expect(result.current.failedTasks).toBe(0);
  });

  it("completionRate 应基于 completedTasks/totalTasks 计算", () => {
    const tasks: VideoTask[] = [
      makeTask("c1", "completed"),
      makeTask("c2", "completed"),
      makeTask("g1", "generating"),
      makeTask("f1", "failed"),
      makeTask("t1", "timeout"),
    ];
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    // completed=2, total=5 → 40%
    expect(result.current.completionRate).toBe(40);
  });

  it("统计值之和必须等于 totalTasks（无遗漏状态）", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    const sum =
      result.current.completedTasks +
      result.current.processingTasks +
      result.current.pendingTasks +
      result.current.failedTasks;

    expect(sum).toBe(result.current.totalTasks);
  });

  it("统计值应随 tasks 变化重新计算（memoize 失效）", () => {
    // 初始：3 个 completed 任务
    setupManager([
      makeTask("c1", "completed"),
      makeTask("c2", "completed"),
      makeTask("c3", "completed"),
    ]);

    const { result, rerender } = renderHook(() => useVideoTasksPage());

    expect(result.current.completedTasks).toBe(3);
    expect(result.current.totalTasks).toBe(3);

    // 重新渲染时切换 mock 返回值：1 个 completed + 1 个 timeout
    const newTasks: VideoTask[] = [
      makeTask("c1", "completed"),
      makeTask("t1", "timeout"),
    ];
    mockUseVideoTaskManager.mockReturnValue({
      allTasks: newTasks,
      startBackgroundProcessing: vi.fn(),
      clearCompletedTasks: vi.fn().mockResolvedValue(undefined),
      clearFailedTasks: vi.fn().mockResolvedValue(undefined),
      recoverTask: vi.fn(),
    });

    rerender();

    expect(result.current.totalTasks).toBe(2);
    expect(result.current.completedTasks).toBe(1);
    expect(result.current.failedTasks).toBe(1); // timeout 归入 failed
  });

  it("初始 statusFilter='all' 时 allTasks 返回全部任务（含 timeout）", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    expect(result.current.statusFilter).toBe("all");
    expect(result.current.allTasks).toHaveLength(12);
    // 应包含 timeout 任务
    expect(
      result.current.allTasks.some((t) => t.taskId === "t1"),
    ).toBe(true);
    expect(
      result.current.allTasks.some((t) => t.taskId === "t2"),
    ).toBe(true);
  });

  it("statusFilter='failed' 时 allTasks 应同时包含 failed 和 timeout", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    act(() => {
      result.current.setStatusFilter("failed");
    });

    expect(result.current.allTasks).toHaveLength(3); // 1 failed + 2 timeout
    const ids = result.current.allTasks.map((t) => t.taskId);
    expect(ids).toEqual(expect.arrayContaining(["f1", "t1", "t2"]));
  });

  it("统计必须支持所有 VideoTask 状态（pending/generating/completed/failed/timeout）", () => {
    // 这是单次遍历 switch 实现的覆盖性测试：每个分支都应被命中
    const tasks: VideoTask[] = [
      makeTask("a", "pending"),
      makeTask("b", "generating"),
      makeTask("c", "completed"),
      makeTask("d", "failed"),
      makeTask("e", "timeout"),
    ];
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    expect(result.current.pendingTasks).toBe(1);
    expect(result.current.processingTasks).toBe(1);
    expect(result.current.completedTasks).toBe(1);
    expect(result.current.failedTasks).toBe(2); // failed + timeout
    expect(result.current.totalTasks).toBe(5);
  });
});
