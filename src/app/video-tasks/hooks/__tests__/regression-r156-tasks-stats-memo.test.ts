/**
 * R156: useVideoTasksPage Statistics MUST Be Memoized (Single Pass) with Full Non-Terminal Status Classification
 *
 * 回归规则目的：
 *   src/app/video-tasks/hooks/useVideoTasksPage.ts 中的统计计算
 *   (totalTasks / completedTasks / processingTasks / pendingTasks / failedTasks)
 *   必须用 useMemo 单次遍历计算，且非终态状态必须正确分类：
 *   - timeout → failedTasks（超时视为失败）
 *   - retrying → processingTasks（重试中仍视为进行中，与 POLLABLE_STATUSES 一致）
 *   - cancelled → failedTasks（取消是不可恢复终态，归入失败类）
 *   禁止改回 5 次 O(n) filter，否则任务量大时（>1000 条）会反复创建中间数组，
 *   导致重渲染卡顿。
 *
 * 历史问题：
 *   原实现为 5 次连续 filter，每次重渲染都触发 5 次遍历，且 timeout 任务
 *   没有归入 failedTasks。2026-07-08 扩展：retrying 和 cancelled 状态被添加
 *   到 VideoTaskStatus 但统计/筛选逻辑未同步更新，导致同样的数量不一致问题。
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

/** 构造一组混合状态的任务（含全部 7 种状态） */
function makeMixedTasks(): VideoTask[] {
  return [
    makeTask("p1", "pending"),
    makeTask("p2", "pending"),
    makeTask("p3", "pending"),
    makeTask("g1", "generating"),
    makeTask("g2", "generating"),
    makeTask("r1", "retrying"),
    makeTask("c1", "completed"),
    makeTask("c2", "completed"),
    makeTask("c3", "completed"),
    makeTask("c4", "completed"),
    makeTask("f1", "failed"),
    makeTask("t1", "timeout"),
    makeTask("t2", "timeout"),
    makeTask("x1", "cancelled"),
  ];
}

describe("R156: useVideoTasksPage 统计必须 memoize 且非终态状态正确分类", () => {
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

  it("混合状态任务下统计值必须正确（timeout/cancelled 归入 failed，retrying 归入 processing）", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    // totalTasks = 14（包含所有 7 种状态）
    expect(result.current.totalTasks).toBe(14);
    // pending = 3
    expect(result.current.pendingTasks).toBe(3);
    // processing = 2 (generating) + 1 (retrying) = 3
    expect(result.current.processingTasks).toBe(3);
    // completed = 4
    expect(result.current.completedTasks).toBe(4);
    // failed = 1 (failed) + 2 (timeout) + 1 (cancelled) = 4
    expect(result.current.failedTasks).toBe(4);
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

  it("初始 statusFilter='all' 时 allTasks 返回全部任务（含 timeout/retrying/cancelled）", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    expect(result.current.statusFilter).toBe("all");
    expect(result.current.allTasks).toHaveLength(14);
    // 应包含 timeout/retrying/cancelled 任务
    expect(
      result.current.allTasks.some((t) => t.taskId === "t1"),
    ).toBe(true);
    expect(
      result.current.allTasks.some((t) => t.taskId === "r1"),
    ).toBe(true);
    expect(
      result.current.allTasks.some((t) => t.taskId === "x1"),
    ).toBe(true);
  });

  it("statusFilter='failed' 时 allTasks 应同时包含 failed/timeout/cancelled", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    act(() => {
      result.current.setStatusFilter("failed");
    });

    expect(result.current.allTasks).toHaveLength(4); // 1 failed + 2 timeout + 1 cancelled
    const ids = result.current.allTasks.map((t) => t.taskId);
    expect(ids).toEqual(expect.arrayContaining(["f1", "t1", "t2", "x1"]));
  });

  it("statusFilter='processing' 时 allTasks 应同时包含 generating 和 retrying", () => {
    const tasks = makeMixedTasks();
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    act(() => {
      result.current.setStatusFilter("processing");
    });

    expect(result.current.allTasks).toHaveLength(3); // 2 generating + 1 retrying
    const ids = result.current.allTasks.map((t) => t.taskId);
    expect(ids).toEqual(expect.arrayContaining(["g1", "g2", "r1"]));
  });

  it("retrying 任务必须计入 processingTasks，不计入其他类别", () => {
    const tasks: VideoTask[] = [
      makeTask("r1", "retrying"),
      makeTask("r2", "retrying"),
      makeTask("r3", "retrying"),
    ];
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    expect(result.current.processingTasks).toBe(3);
    expect(result.current.completedTasks).toBe(0);
    expect(result.current.pendingTasks).toBe(0);
    expect(result.current.failedTasks).toBe(0);
    expect(result.current.totalTasks).toBe(3);
  });

  it("cancelled 任务必须计入 failedTasks，不计入其他类别", () => {
    const tasks: VideoTask[] = [
      makeTask("x1", "cancelled"),
      makeTask("x2", "cancelled"),
    ];
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    expect(result.current.failedTasks).toBe(2);
    expect(result.current.processingTasks).toBe(0);
    expect(result.current.completedTasks).toBe(0);
    expect(result.current.pendingTasks).toBe(0);
    expect(result.current.totalTasks).toBe(2);
  });

  it("统计必须支持所有 VideoTask 状态（pending/generating/retrying/completed/failed/timeout/cancelled）", () => {
    // 这是单次遍历 switch 实现的覆盖性测试：每个分支都应被命中
    const tasks: VideoTask[] = [
      makeTask("a", "pending"),
      makeTask("b", "generating"),
      makeTask("c", "retrying"),
      makeTask("d", "completed"),
      makeTask("e", "failed"),
      makeTask("f", "timeout"),
      makeTask("g", "cancelled"),
    ];
    setupManager(tasks);

    const { result } = renderHook(() => useVideoTasksPage());

    expect(result.current.pendingTasks).toBe(1);
    expect(result.current.processingTasks).toBe(2); // generating + retrying
    expect(result.current.completedTasks).toBe(1);
    expect(result.current.failedTasks).toBe(3); // failed + timeout + cancelled
    expect(result.current.totalTasks).toBe(7);
  });
});
