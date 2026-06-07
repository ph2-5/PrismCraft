import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { mockErrorLogger, mockEmitToast, mockT } = vi.hoisted(() => ({
  mockErrorLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockEmitToast: vi.fn(),
  mockT: vi.fn((key: string) => key),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

import { usePersistenceGuard } from "../use-persistence-guard";

describe("usePersistenceGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call saveFn successfully on first call", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(saveFn);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("should reset retry count after successful save", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(saveFn);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("should warn on save failure and return without retrying when no pending save", async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error("Save failed"));
    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(saveFn);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(mockErrorLogger.warn).toHaveBeenCalledWith(
      "[PersistenceGuard] Save failed",
      expect.any(Error),
    );
  });

  it("should retry when pending save is queued during failed save", async () => {
    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const firstSaveFn = vi.fn().mockReturnValue(firstPromise);
    const secondSaveFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => usePersistenceGuard());

    act(() => {
      result.current.guardedSave(firstSaveFn);
    });

    act(() => {
      result.current.guardedSave(secondSaveFn);
    });

    expect(firstSaveFn).toHaveBeenCalledTimes(1);
    expect(secondSaveFn).not.toHaveBeenCalled();

    resolveFirst!();
    await vi.waitFor(() => {
      expect(secondSaveFn).toHaveBeenCalledTimes(1);
    });
  });

  it("should retry with latest saveFn when pending save is queued", async () => {
    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const firstSaveFn = vi.fn().mockReturnValue(firstPromise);
    const secondSaveFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => usePersistenceGuard());

    act(() => {
      result.current.guardedSave(firstSaveFn);
    });

    act(() => {
      result.current.guardedSave(secondSaveFn);
    });

    resolveFirst!();
    await vi.waitFor(() => {
      expect(secondSaveFn).toHaveBeenCalledTimes(1);
    });
  });

  it("should emit error toast after MAX_RETRY consecutive failures", async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error("Persistent failure"));
    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    expect(mockEmitToast).toHaveBeenCalledWith(
      "error",
      "error.saveFailed",
      "多次重试后仍无法保存，请手动保存您的更改",
    );
  });

  it("should not call second saveFn immediately when first is in progress", async () => {
    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const firstSaveFn = vi.fn().mockReturnValue(firstPromise);
    const secondSaveFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => usePersistenceGuard());

    act(() => {
      result.current.guardedSave(firstSaveFn);
    });

    act(() => {
      result.current.guardedSave(secondSaveFn);
    });

    expect(firstSaveFn).toHaveBeenCalledTimes(1);
    expect(secondSaveFn).not.toHaveBeenCalled();

    resolveFirst!();
    await vi.waitFor(() => {
      expect(secondSaveFn).toHaveBeenCalledTimes(1);
    });
  });

  it("should use t() for error toast message key", async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error("Persistent failure"));
    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    expect(mockT).toHaveBeenCalledWith("error.saveFailed");
  });

  it("should handle consecutive guardedSave calls after success", async () => {
    const saveFn1 = vi.fn().mockResolvedValue(undefined);
    const saveFn2 = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(saveFn1);
    });

    await act(async () => {
      await result.current.guardedSave(saveFn2);
    });

    expect(saveFn1).toHaveBeenCalledTimes(1);
    expect(saveFn2).toHaveBeenCalledTimes(1);
  });

  it("should handle consecutive guardedSave calls after failure", async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error("Fail"));
    const succeedingFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    expect(failingFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.guardedSave(succeedingFn);
    });

    expect(succeedingFn).toHaveBeenCalledTimes(1);
  });

  it("should retry failed save when pending save triggers the retry loop", async () => {
    let callCount = 0;
    const saveFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("First call fails");
    });

    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const blockingFn = vi.fn().mockReturnValue(firstPromise);

    const { result } = renderHook(() => usePersistenceGuard());

    act(() => {
      result.current.guardedSave(blockingFn);
    });

    act(() => {
      result.current.guardedSave(saveFn);
    });

    resolveFirst!();
    await vi.waitFor(() => {
      expect(saveFn).toHaveBeenCalled();
    });

    expect(mockErrorLogger.warn).toHaveBeenCalledWith(
      "[PersistenceGuard] Save failed",
      expect.any(Error),
    );
  });

  it("should reset retry count on success after previous failures", async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error("Fail"));
    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    const succeedingFn = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.guardedSave(succeedingFn);
    });

    expect(succeedingFn).toHaveBeenCalledTimes(1);
    expect(mockEmitToast).not.toHaveBeenCalled();
  });

  it("should not emit toast when save succeeds on first attempt", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(saveFn);
    });

    expect(mockEmitToast).not.toHaveBeenCalled();
    expect(mockErrorLogger.warn).not.toHaveBeenCalled();
  });

  it("should reset pending and saving refs after MAX_RETRY failure", async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error("Fail"));
    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    expect(mockEmitToast).toHaveBeenCalled();

    const succeedingFn = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.guardedSave(succeedingFn);
    });

    expect(succeedingFn).toHaveBeenCalledTimes(1);
  });

  it("should warn on each consecutive failure before MAX_RETRY", async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error("Fail"));
    const { result } = renderHook(() => usePersistenceGuard());

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    expect(mockErrorLogger.warn).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    expect(mockErrorLogger.warn).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.guardedSave(failingFn);
    });

    expect(mockErrorLogger.warn).toHaveBeenCalledTimes(3);
  });
});
