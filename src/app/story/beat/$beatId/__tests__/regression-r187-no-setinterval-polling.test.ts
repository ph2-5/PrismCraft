/**
 * R187: useBeatDetail 必须使用 Zustand selector 订阅 task，禁止 setInterval 自定义轮询
 *
 * 回归规则目的：
 *   src/app/story/beat/$beatId/use-beat-detail.ts 必须通过 useVideoTaskStore 的
 *   selector 订阅 task 状态，由 polling-engine 统一负责轮询。禁止在 hook 中使用
 *   setInterval 自定义轮询，避免重复请求、资源浪费、状态不一致。
 *
 * 历史问题：
 *   原实现自定义 5 秒 setInterval 轮询 task 状态，与 polling-engine 重复，
 *   导致同一任务被轮询两次。
 *
 * 被测代码：
 *   src/app/story/beat/$beatId/use-beat-detail.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { VideoTask } from "@/modules/video";

const {
  mockUseVideoTaskStore,
  mockStoryService,
  mockErrorLogger,
  mockUseParams,
} = vi.hoisted(() => ({
  mockUseVideoTaskStore: vi.fn(),
  mockStoryService: {
    getByBeatId: vi.fn(),
  },
  mockErrorLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockUseParams: vi.fn(() => ({ beatId: "beat-1" })),
}));

vi.mock("@/modules/video", () => ({
  useVideoTaskStore: mockUseVideoTaskStore,
}));

vi.mock("@/modules/story", () => ({
  storyService: mockStoryService,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("react-router-dom", () => ({
  useParams: mockUseParams,
}));

import { useBeatDetail } from "../use-beat-detail";

describe("R187: useBeatDetail 禁止 setInterval 自定义轮询", () => {
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    setIntervalSpy = vi.spyOn(global, "setInterval");
    clearIntervalSpy = vi.spyOn(global, "clearInterval");
    setTimeoutSpy = vi.spyOn(global, "setTimeout");

    // 默认返回 undefined（无任务）
    mockUseVideoTaskStore.mockReturnValue(undefined);
    mockStoryService.getByBeatId.mockResolvedValue({
      ok: true,
      value: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  it("hook 渲染期间不应调用 setInterval", async () => {
    renderHook(() => useBeatDetail());

    // 等待 useEffect 中的异步操作完成
    await vi.runAllTimersAsync();

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("hook 卸载时不应调用 clearInterval（因为没有 setInterval）", async () => {
    const { unmount } = renderHook(() => useBeatDetail());
    await vi.runAllTimersAsync();

    unmount();

    expect(clearIntervalSpy).not.toHaveBeenCalled();
  });

  it("hook 必须调用 useVideoTaskStore 订阅", async () => {
    renderHook(() => useBeatDetail());
    await vi.runAllTimersAsync();

    expect(mockUseVideoTaskStore).toHaveBeenCalled();
    // 第一次参数应该是 selector 函数
    const selectorArg = mockUseVideoTaskStore.mock.calls[0]![0];
    expect(typeof selectorArg).toBe("function");
  });

  it("selector 应根据 beatId 从 allTasks 中查找任务", async () => {
    renderHook(() => useBeatDetail());
    await vi.runAllTimersAsync();

    const selector = mockUseVideoTaskStore.mock.calls[0]![0] as (
      state: { allTasks: VideoTask[] },
    ) => VideoTask | undefined;

    const task1 = { taskId: "t1", beatId: "beat-1" } as unknown as VideoTask;
    const task2 = { taskId: "t2", beatId: "beat-2" } as unknown as VideoTask;

    // selector 应找到 beatId 匹配的任务
    const found = selector({ allTasks: [task1, task2] });
    expect(found).toBe(task1);
  });

  it("当 beatId 不匹配任何任务时，selector 应返回 undefined", async () => {
    renderHook(() => useBeatDetail());
    await vi.runAllTimersAsync();

    const selector = mockUseVideoTaskStore.mock.calls[0]![0] as (
      state: { allTasks: VideoTask[] },
    ) => VideoTask | undefined;

    const task2 = { taskId: "t2", beatId: "beat-2" } as unknown as VideoTask;
    const found = selector({ allTasks: [task2] });
    expect(found).toBeUndefined();
  });

  it("当 beatId 参数缺失时，selector 应返回 undefined", async () => {
    mockUseParams.mockReturnValue({} as { beatId: string }); // 无 beatId

    renderHook(() => useBeatDetail());
    await vi.runAllTimersAsync();

    const selector = mockUseVideoTaskStore.mock.calls[0]![0] as (
      state: { allTasks: VideoTask[] },
    ) => VideoTask | undefined;

    const found = selector({ allTasks: [] });
    expect(found).toBeUndefined();
  });

  it("selector 返回的 task 应被 hook 暴露", async () => {
    const task = {
      taskId: "t1",
      beatId: "beat-1",
      status: "completed",
    } as unknown as VideoTask;
    mockUseVideoTaskStore.mockReturnValue(task);

    const { result } = renderHook(() => useBeatDetail());
    await vi.runAllTimersAsync();

    expect(result.current.task).toBe(task);
  });

  it("长时间运行也不应触发 setInterval（即使 hook 重新渲染多次）", async () => {
    const { rerender } = renderHook(() => useBeatDetail());

    // 多次 rerender 模拟长时间使用
    for (let i = 0; i < 5; i++) {
      rerender();
      await vi.advanceTimersByTimeAsync(10_000); // 推进 10 秒
    }

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("hook 卸载后不应有遗留的 setInterval（确保无定时器泄漏）", async () => {
    const { unmount } = renderHook(() => useBeatDetail());
    await vi.runAllTimersAsync();

    unmount();
    await vi.advanceTimersByTimeAsync(60_000); // 卸载后等 60 秒

    // setInterval 从未被调用
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
