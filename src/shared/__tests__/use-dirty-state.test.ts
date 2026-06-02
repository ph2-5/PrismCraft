import { describe, it, expect, beforeEach } from "vitest";
import { useDirtyState } from "../hooks/use-dirty-state";

describe("useDirtyState", () => {
  beforeEach(() => {
    useDirtyState.setState({ dirtyKeys: new Set() });
  });

  it("starts with no dirty keys", () => {
    const state = useDirtyState.getState();
    expect(state.dirtyKeys.size).toBe(0);
    expect(state.isDirty()).toBe(false);
  });

  it("markDirty adds a key", () => {
    useDirtyState.getState().markDirty("story");
    const state = useDirtyState.getState();
    expect(state.dirtyKeys.has("story")).toBe(true);
    expect(state.isDirty()).toBe(true);
    expect(state.isDirty("story")).toBe(true);
  });

  it("markDirty ignores duplicate keys", () => {
    useDirtyState.getState().markDirty("story");
    const sizeBefore = useDirtyState.getState().dirtyKeys.size;
    useDirtyState.getState().markDirty("story");
    expect(useDirtyState.getState().dirtyKeys.size).toBe(sizeBefore);
  });

  it("markClean removes a key", () => {
    useDirtyState.getState().markDirty("story");
    useDirtyState.getState().markClean("story");
    expect(useDirtyState.getState().dirtyKeys.has("story")).toBe(false);
    expect(useDirtyState.getState().isDirty()).toBe(false);
  });

  it("markClean on non-existent key is no-op", () => {
    useDirtyState.getState().markClean("nonexistent");
    expect(useDirtyState.getState().dirtyKeys.size).toBe(0);
  });

  it("markAllClean clears all keys", () => {
    useDirtyState.getState().markDirty("story");
    useDirtyState.getState().markDirty("character");
    useDirtyState.getState().markAllClean();
    expect(useDirtyState.getState().dirtyKeys.size).toBe(0);
    expect(useDirtyState.getState().isDirty()).toBe(false);
  });

  it("getDirtyKeys returns array of keys", () => {
    useDirtyState.getState().markDirty("story");
    useDirtyState.getState().markDirty("character");
    const keys = useDirtyState.getState().getDirtyKeys();
    expect(keys).toContain("story");
    expect(keys).toContain("character");
    expect(keys.length).toBe(2);
  });

  it("isDirty with specific key checks that key only", () => {
    useDirtyState.getState().markDirty("story");
    expect(useDirtyState.getState().isDirty("story")).toBe(true);
    expect(useDirtyState.getState().isDirty("character")).toBe(false);
  });
});
