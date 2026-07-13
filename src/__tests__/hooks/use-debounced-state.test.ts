import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useDebouncedState,
  useDebouncedCallback,
} from "../../shared/hooks/use-debounced-state";

describe("useDebouncedState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("初始值正确", () => {
    const { result } = renderHook(() => useDebouncedState("hello", 500));
    expect(result.current.value).toBe("hello");
    expect(result.current.debouncedValue).toBe("hello");
    expect(result.current.isPending).toBe(false);
  });

  it("setValue 后 value 立即更新，debouncedValue 延迟更新", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebouncedState<string>("init", 300));

    act(() => {
      result.current.setValue("updated");
    });

    expect(result.current.value).toBe("updated");
    expect(result.current.debouncedValue).toBe("init");
    expect(result.current.isPending).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.debouncedValue).toBe("updated");
    expect(result.current.isPending).toBe(false);
  });

  it("flush 立即应用 debouncedValue", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebouncedState<string>("init", 500));

    act(() => {
      result.current.setValue("updated");
    });

    expect(result.current.debouncedValue).toBe("init");

    act(() => {
      result.current.flush();
    });

    expect(result.current.debouncedValue).toBe("updated");
    expect(result.current.isPending).toBe(false);
  });

  it("cancel 取消 debounce", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebouncedState<string>("init", 500));

    act(() => {
      result.current.setValue("updated");
    });

    expect(result.current.isPending).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.isPending).toBe(false);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.debouncedValue).toBe("init");
  });

  it("isPending 状态变化", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebouncedState(0, 200));

    expect(result.current.isPending).toBe(false);

    act(() => {
      result.current.setValue(1);
    });

    expect(result.current.isPending).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.isPending).toBe(false);
  });

  it("immediate 模式首次设置立即更新 debouncedValue", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useDebouncedState<string>("init", 500, { immediate: true })
    );

    act(() => {
      result.current.setValue("first");
    });

    expect(result.current.value).toBe("first");
    expect(result.current.debouncedValue).toBe("first");

    act(() => {
      result.current.setValue("second");
    });

    expect(result.current.value).toBe("second");
    expect(result.current.debouncedValue).toBe("first");

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.debouncedValue).toBe("second");
  });

  it("onDebouncedUpdate 回调在 debouncedValue 更新时调用", () => {
    vi.useFakeTimers();
    const onDebouncedUpdate = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedState<string>("init", 300, { onDebouncedUpdate })
    );

    act(() => {
      result.current.setValue("updated");
    });

    expect(onDebouncedUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onDebouncedUpdate).toHaveBeenCalledWith("updated");
  });

  it("onDebouncedUpdate 在 flush 时也被调用", () => {
    vi.useFakeTimers();
    const onDebouncedUpdate = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedState<string>("init", 500, { onDebouncedUpdate })
    );

    act(() => {
      result.current.setValue("updated");
    });

    act(() => {
      result.current.flush();
    });

    expect(onDebouncedUpdate).toHaveBeenCalledWith("updated");
  });
});

describe("useDebouncedCallback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("延迟执行回调", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.debouncedCallback("arg1", "arg2");
    });

    expect(callback).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledWith("arg1", "arg2");
    expect(result.current.isPending).toBe(false);
  });

  it("cancel 取消待执行的 debounce", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.debouncedCallback();
    });

    expect(result.current.isPending).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.isPending).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("flush 取消待执行的 debounce 且不执行回调", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.debouncedCallback();
    });

    act(() => {
      result.current.flush();
    });

    expect(result.current.isPending).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("isPending 初始为 false，调用后为 true，完成后为 false", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    expect(result.current.isPending).toBe(false);

    act(() => {
      result.current.debouncedCallback();
    });

    expect(result.current.isPending).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.isPending).toBe(false);
  });
});
