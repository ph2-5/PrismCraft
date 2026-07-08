/**
 * R10: Async Save Operations Must Guard Against Concurrent Invocations
 *   — Extension: isDirtyRef pattern (2026-07-08)
 *
 * 回归规则目的：
 *   useAutoSave 中的 setInterval 闭包不能直接捕获 isDirty 函数引用，
 *   因为 rerender 时 isDirty 引用会变化，但 setInterval 闭包仍持有旧引用（stale closure）。
 *   必须用 isDirtyRef 同步最新 isDirty，setInterval 内通过 isDirtyRef.current() 读取。
 *
 *   这与 savingRef 是同一原则的不同应用：ref-over-state 避免 stale closure。
 *
 * 历史问题：
 *   原实现中 setInterval 闭包直接捕获 isDirty，当 isDirty 函数引用变化时
 *   （例如 isDirty 闭包依赖了外部 state），interval 仍调用旧 isDirty，
 *   导致：脏的故事被跳过不保存，或不脏的故事被反复保存。
 *
 * 被测代码：
 *   src/modules/persistence/hooks/use-auto-save.ts
 */
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { mockEmitToast, mockT, mockOnSave } = vi.hoisted(() => ({
  mockEmitToast: vi.fn(),
  mockT: vi.fn((key: string) => key),
  mockOnSave: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

import { useAutoSave } from "../use-auto-save";

describe("R10 扩展：isDirtyRef 模式 — setInterval 闭包必须通过 ref 读取最新 isDirty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初始 isDirty 返回 false 时不保存，rerender 后 isDirty 返回 true 时 interval 能感知并保存", () => {
    vi.useFakeTimers();
    try {
      // 初始 isDirty 返回 false
      const isDirtyV1 = vi.fn(() => false);
      const { rerender } = renderHook(
        ({ isDirty }) => useAutoSave({
          enabled: true,
          intervalMinutes: 1,
          onSave: mockOnSave,
          isDirty,
        }),
        { initialProps: { isDirty: isDirtyV1 } },
      );

      // 第一次 interval：isDirty=false，不应保存
      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(mockOnSave).not.toHaveBeenCalled();
      expect(isDirtyV1).toHaveBeenCalled();

      // rerender：传入新的 isDirty 函数，返回 true
      const isDirtyV2 = vi.fn(() => true);
      rerender({ isDirty: isDirtyV2 });

      // 第二次 interval：isDirtyRef 已同步为 isDirtyV2（返回 true），应保存
      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalledTimes(1);
      expect(isDirtyV2).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("isDirty 函数引用变化但返回值不变时，interval 行为应一致（ref 同步不影响逻辑）", async () => {
    vi.useFakeTimers();
    try {
      const isDirtyV1 = vi.fn(() => true);
      const { rerender } = renderHook(
        ({ isDirty }) => useAutoSave({
          enabled: true,
          intervalMinutes: 1,
          onSave: mockOnSave,
          isDirty,
        }),
        { initialProps: { isDirty: isDirtyV1 } },
      );

      // 第一次 interval：isDirtyV1=true，保存
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalledTimes(1);

      // rerender：新的 isDirty 函数引用，但同样返回 true
      const isDirtyV2 = vi.fn(() => true);
      rerender({ isDirty: isDirtyV2 });

      // 第二次 interval：应继续保存
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isDirty 从 true 切换到 false 时，interval 应停止保存（ref 感知到变化）", () => {
    vi.useFakeTimers();
    try {
      const isDirtyV1 = vi.fn(() => true);
      const { rerender } = renderHook(
        ({ isDirty }) => useAutoSave({
          enabled: true,
          intervalMinutes: 1,
          onSave: mockOnSave,
          isDirty,
        }),
        { initialProps: { isDirty: isDirtyV1 } },
      );

      // 第一次 interval：isDirty=true，保存
      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalledTimes(1);

      // rerender：isDirty 切换为 false
      const isDirtyV2 = vi.fn(() => false);
      rerender({ isDirty: isDirtyV2 });

      // 第二次 interval：isDirty=false，不应保存
      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalledTimes(1); // 仍为 1，未增加
    } finally {
      vi.useRealTimers();
    }
  });

  it("未传入 isDirty 时（undefined），interval 应始终触发保存", async () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useAutoSave({
        enabled: true,
        intervalMinutes: 1,
        onSave: mockOnSave,
        // 不传 isDirty
      }));

      // interval 触发：应保存
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalledTimes(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isDirty 闭包依赖外部 state 变化时，interval 必须读取最新值（核心 stale closure 防护）", () => {
    vi.useFakeTimers();
    try {
      // 模拟外部 state 变化导致 isDirty 函数行为变化
      // 这是 isDirtyRef 模式的核心场景：isDirty 函数闭包依赖外部 state
      let externalDirtyFlag = false;
      const isDirty = vi.fn(() => externalDirtyFlag);

      const { rerender } = renderHook(
        ({ isDirty }) => useAutoSave({
          enabled: true,
          intervalMinutes: 1,
          onSave: mockOnSave,
          isDirty,
        }),
        { initialProps: { isDirty } },
      );

      // 第一次 interval：externalDirtyFlag=false，不保存
      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(mockOnSave).not.toHaveBeenCalled();

      // 外部 state 变化：dirty=true
      externalDirtyFlag = true;
      // rerender 触发 isDirtyRef 同步（即使 isDirty 函数引用未变，ref 同步仍执行）
      rerender({ isDirty });

      // 第二次 interval：isDirtyRef.current() 读取最新 externalDirtyFlag=true，应保存
      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalledTimes(1);

      // 外部 state 再次变化：dirty=false
      externalDirtyFlag = false;
      rerender({ isDirty });

      // 第三次 interval：isDirtyRef.current() 读取最新 externalDirtyFlag=false，不保存
      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalledTimes(1); // 仍为 1
    } finally {
      vi.useRealTimers();
    }
  });
});
