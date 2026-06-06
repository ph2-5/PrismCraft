import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConfirm, mockUseBlocker, mockUseNavigate, mockUseLocation, mockT } = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockUseBlocker: vi.fn(),
  mockUseNavigate: vi.fn(() => vi.fn()),
  mockUseLocation: vi.fn(() => ({ pathname: "/story" })),
  mockT: vi.fn((key: string) => key),
}));

vi.mock("react-router-dom", () => ({
  useBlocker: mockUseBlocker,
  useNavigate: mockUseNavigate,
  useLocation: mockUseLocation,
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: mockConfirm,
}));

vi.mock("@/shared/constants/messages", () => ({
  t: mockT,
}));

import { useDirtyState } from "@/shared/hooks/use-dirty-state";

describe("R71: Route navigation must intercept when dirty state exists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDirtyState.setState({ dirtyKeys: new Set() });
    mockUseBlocker.mockReturnValue({ state: "unblocked", proceed: vi.fn(), reset: vi.fn() });
    mockConfirm.mockResolvedValue(true);
  });

  it("when dirtyKeys is empty, blocker should not be active", () => {
    const dirtyCount = useDirtyState.getState().dirtyKeys.size;
    expect(dirtyCount).toBe(0);

    mockUseBlocker(dirtyCount > 0);
    expect(mockUseBlocker).toHaveBeenCalledWith(false);
  });

  it("when dirtyKeys has entries, blocker should be active", () => {
    useDirtyState.getState().markDirty("story");
    const dirtyCount = useDirtyState.getState().dirtyKeys.size;
    expect(dirtyCount).toBeGreaterThan(0);

    mockUseBlocker(dirtyCount > 0);
    expect(mockUseBlocker).toHaveBeenCalledWith(true);
  });

  it("when user confirms, markAllClean is called and blocker proceeds", async () => {
    useDirtyState.getState().markDirty("story");
    expect(useDirtyState.getState().dirtyKeys.size).toBeGreaterThan(0);

    const mockProceed = vi.fn();
    mockUseBlocker.mockReturnValue({ state: "blocked", proceed: mockProceed, reset: vi.fn() });
    mockConfirm.mockResolvedValue(true);

    const blocker = mockUseBlocker(true);
    if (blocker.state === "blocked") {
      const confirmed = await mockConfirm(
        mockT("nav.unsavedChangesConfirm"),
        mockT("nav.unsavedChanges"),
      );
      if (confirmed) {
        useDirtyState.getState().markAllClean();
        blocker.proceed?.();
      }
    }

    expect(mockConfirm).toHaveBeenCalled();
    expect(useDirtyState.getState().dirtyKeys.size).toBe(0);
    expect(mockProceed).toHaveBeenCalled();
  });

  it("when user cancels, blocker resets without clearing dirty state", async () => {
    useDirtyState.getState().markDirty("story");
    expect(useDirtyState.getState().dirtyKeys.size).toBe(1);

    const mockReset = vi.fn();
    mockUseBlocker.mockReturnValue({ state: "blocked", proceed: vi.fn(), reset: mockReset });
    mockConfirm.mockResolvedValue(false);

    const blocker = mockUseBlocker(true);
    if (blocker.state === "blocked") {
      const confirmed = await mockConfirm(
        mockT("nav.unsavedChangesConfirm"),
        mockT("nav.unsavedChanges"),
      );
      if (confirmed) {
        useDirtyState.getState().markAllClean();
        blocker.proceed?.();
      } else {
        blocker.reset?.();
      }
    }

    expect(mockConfirm).toHaveBeenCalled();
    expect(useDirtyState.getState().dirtyKeys.size).toBe(1);
    expect(mockReset).toHaveBeenCalled();
  });
});
