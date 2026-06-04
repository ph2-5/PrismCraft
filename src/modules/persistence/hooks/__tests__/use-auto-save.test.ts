import { vi, beforeEach, describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { mockEmitToast, mockT, mockOnSave, mockIsDirty } = vi.hoisted(() => ({
  mockEmitToast: vi.fn(),
  mockT: vi.fn((key: string) => key),
  mockOnSave: vi.fn<() => Promise<void>>(),
  mockIsDirty: vi.fn<() => boolean>(() => true),
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

import { useAutoSave } from "../use-auto-save";

function buildProps(overrides: Partial<Parameters<typeof useAutoSave>[0]> = {}) {
  return {
    enabled: true,
    intervalMinutes: 1,
    onSave: mockOnSave,
    isDirty: mockIsDirty,
    ...overrides,
  };
}

describe("useAutoSave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
    mockIsDirty.mockReturnValue(true);
  });

  describe("enabled / dirty guards", () => {
    it("should not save when enabled is false", () => {
      vi.useFakeTimers();
      try {
        renderHook(() => useAutoSave(buildProps({ enabled: false })));
        act(() => { vi.advanceTimersByTime(60 * 1000); });
        expect(mockOnSave).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("should not save when isDirty() returns false", () => {
      vi.useFakeTimers();
      try {
        mockIsDirty.mockReturnValue(false);
        renderHook(() => useAutoSave(buildProps()));
        act(() => { vi.advanceTimersByTime(60 * 1000); });
        expect(mockOnSave).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("should save when isDirty is undefined (not provided)", async () => {
      vi.useFakeTimers();
      try {
        renderHook(() => useAutoSave(buildProps({ isDirty: undefined })));
        await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
        expect(mockOnSave).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should not start interval when intervalMinutes <= 0", () => {
      vi.useFakeTimers();
      try {
        renderHook(() => useAutoSave(buildProps({ intervalMinutes: 0 })));
        act(() => { vi.advanceTimersByTime(60 * 1000); });
        expect(mockOnSave).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("interval saving", () => {
    it("should call onSave on interval when enabled and dirty", async () => {
      vi.useFakeTimers();
      try {
        renderHook(() => useAutoSave(buildProps({ intervalMinutes: 1 })));

        await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
        expect(mockOnSave).toHaveBeenCalledTimes(1);

        await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
        expect(mockOnSave).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should clamp interval to MIN_INTERVAL_MINUTES (0.5)", async () => {
      vi.useFakeTimers();
      try {
        renderHook(() => useAutoSave(buildProps({ intervalMinutes: 0.1 })));
        await act(async () => { await vi.advanceTimersByTimeAsync(0.5 * 60 * 1000); });
        expect(mockOnSave).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("retry with exponential backoff", () => {
    it("should retry on failure up to MAX_RETRY (3) with exponential backoff", async () => {
      mockOnSave.mockRejectedValue(new Error("save failed"));

      const { result } = renderHook(() => useAutoSave(buildProps({ intervalMinutes: 1 })));

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(mockOnSave).toHaveBeenCalledTimes(3);
      expect(mockEmitToast).toHaveBeenCalledWith(
        "error",
        "error.saveFailed",
        "多次重试后仍无法保存，请手动保存您的更改",
      );
    });

    it("should show error toast after MAX_RETRY failures and reset retry count", async () => {
      mockOnSave.mockRejectedValue(new Error("fail"));

      const { result } = renderHook(() => useAutoSave(buildProps({ intervalMinutes: 1 })));

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(mockEmitToast).toHaveBeenCalledTimes(1);
      expect(mockOnSave).toHaveBeenCalledTimes(3);

      mockOnSave.mockResolvedValue(undefined);

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(mockOnSave).toHaveBeenCalledTimes(4);
      expect(mockEmitToast).toHaveBeenCalledTimes(1);
    });

    it("should reset retry count on successful save after transient failure", async () => {
      let callCount = 0;
      mockOnSave.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) return Promise.reject(new Error("transient"));
        return Promise.resolve();
      });

      const { result } = renderHook(() => useAutoSave(buildProps({ intervalMinutes: 1 })));

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(mockEmitToast).not.toHaveBeenCalled();
      expect(callCount).toBe(2);

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(callCount).toBe(3);
      expect(mockEmitToast).not.toHaveBeenCalled();
    });
  });

  describe("concurrent save prevention", () => {
    it("should prevent concurrent saves and queue pending saves", async () => {
      let resolveFirst!: () => void;
      const firstSave = new Promise<void>((r) => { resolveFirst = r; });
      let callCount = 0;

      mockOnSave.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return firstSave;
        return Promise.resolve();
      });

      const { result } = renderHook(() => useAutoSave(buildProps({ intervalMinutes: 1 })));

      act(() => { result.current.triggerSave(); });
      expect(callCount).toBe(1);

      act(() => { result.current.triggerSave(); });
      expect(callCount).toBe(1);

      await act(async () => { resolveFirst(); });

      await waitFor(() => {
        expect(callCount).toBe(2);
      });
    });
  });

  describe("unmount cancellation", () => {
    it("should cancel on unmount", () => {
      vi.useFakeTimers();
      try {
        const { unmount } = renderHook(() => useAutoSave(buildProps({ intervalMinutes: 1 })));
        unmount();
        act(() => { vi.advanceTimersByTime(60 * 1000); });
        expect(mockOnSave).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("onSaveRef (stale closure avoidance)", () => {
    it("should use onSaveRef to avoid stale closure", async () => {
      vi.useFakeTimers();
      try {
        const onSaveV1 = vi.fn<() => Promise<void>>(() => Promise.resolve());
        const onSaveV2 = vi.fn<() => Promise<void>>(() => Promise.resolve());

        const { rerender } = renderHook(
          ({ onSave }) => useAutoSave(buildProps({ onSave, intervalMinutes: 1 })),
          { initialProps: { onSave: onSaveV1 } },
        );

        rerender({ onSave: onSaveV2 });

        await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });

        expect(onSaveV2).toHaveBeenCalledTimes(1);
        expect(onSaveV1).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("triggerSave", () => {
    it("should expose triggerSave function", () => {
      const { result } = renderHook(() => useAutoSave(buildProps()));
      expect(typeof result.current.triggerSave).toBe("function");
    });

    it("triggerSave should invoke onSave directly", async () => {
      const { result } = renderHook(() => useAutoSave(buildProps({ enabled: false })));

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });
  });
});
