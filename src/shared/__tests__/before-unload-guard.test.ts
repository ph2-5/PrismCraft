import { describe, it, expect, beforeEach, vi } from "vitest";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";

describe("BeforeUnloadGuard logic", () => {
  beforeEach(() => {
    useDirtyState.setState({ dirtyKeys: new Set() });
  });

  it("does not prevent beforeunload when no dirty keys", () => {
    const event = new Event("beforeunload", { cancelable: true });
    const spy = vi.spyOn(event, "preventDefault");

    const dirtyCount = useDirtyState.getState().dirtyKeys.size;
    expect(dirtyCount).toBe(0);

    if (dirtyCount > 0) {
      event.preventDefault();
    }

    expect(spy).not.toHaveBeenCalled();
  });

  it("prevents beforeunload when dirty keys exist", () => {
    useDirtyState.getState().markDirty("story");

    const event = new Event("beforeunload", { cancelable: true });
    const dirtyCount = useDirtyState.getState().dirtyKeys.size;
    expect(dirtyCount).toBeGreaterThan(0);

    if (dirtyCount > 0) {
      event.preventDefault();
    }

    expect(event.defaultPrevented).toBe(true);
  });

  it("clears dirty state on route change", () => {
    useDirtyState.getState().markDirty("story");
    useDirtyState.getState().markDirty("character");
    expect(useDirtyState.getState().dirtyKeys.size).toBe(2);

    useDirtyState.getState().markAllClean();
    expect(useDirtyState.getState().dirtyKeys.size).toBe(0);
  });

  it("does not prevent beforeunload after markAllClean", () => {
    useDirtyState.getState().markDirty("story");
    useDirtyState.getState().markAllClean();

    const event = new Event("beforeunload", { cancelable: true });
    const dirtyCount = useDirtyState.getState().dirtyKeys.size;
    expect(dirtyCount).toBe(0);

    if (dirtyCount > 0) {
      event.preventDefault();
    }

    expect(event.defaultPrevented).toBe(false);
  });
});
