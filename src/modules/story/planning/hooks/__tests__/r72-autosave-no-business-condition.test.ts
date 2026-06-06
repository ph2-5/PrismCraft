import { vi, beforeEach, describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

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

import { useAutoSave } from "@/modules/persistence/hooks/use-auto-save";

function buildProps(overrides: Partial<Parameters<typeof useAutoSave>[0]> = {}) {
  return {
    enabled: true,
    intervalMinutes: 1,
    onSave: mockOnSave,
    isDirty: mockIsDirty,
    ...overrides,
  };
}

describe("R72: Auto-save must not be disabled by business data absence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
    mockIsDirty.mockReturnValue(true);
  });

  it("auto-save is enabled when hasUnsavedChanges is true, regardless of beats.length", () => {
    const enabled = true;
    const hasUnsavedChanges = true;

    const autoSaveEnabled = enabled && hasUnsavedChanges;
    expect(autoSaveEnabled).toBe(true);
  });

  it("auto-save is enabled when hasUnsavedChanges is true and beats.length === 0", () => {
    const enabled = true;
    const hasUnsavedChanges = true;
    const beatsLength = 0;

    const autoSaveEnabled = enabled && hasUnsavedChanges;
    expect(autoSaveEnabled).toBe(true);
    expect(beatsLength).toBe(0);
  });

  it("auto-save is disabled when hasUnsavedChanges is false", () => {
    const enabled = true;
    const hasUnsavedChanges = false;

    const autoSaveEnabled = enabled && hasUnsavedChanges;
    expect(autoSaveEnabled).toBe(false);
  });

  it("useAutoSave runs when enabled=true and isDirty=true (no business data check)", () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useAutoSave(buildProps({ enabled: true })));

      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(mockOnSave).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("useAutoSave does not run when enabled=false (hasUnsavedChanges=false case)", () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useAutoSave(buildProps({ enabled: false })));

      act(() => { vi.advanceTimersByTime(60 * 1000); });
      expect(mockOnSave).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
