import { create } from "zustand";

interface DirtyState {
  dirtyKeys: Set<string>;
  markDirty: (key: string) => void;
  markClean: (key: string) => void;
  markAllClean: () => void;
  isDirty: (key?: string) => boolean;
  getDirtyKeys: () => string[];
}

export const useDirtyState = create<DirtyState>((set, get) => ({
  dirtyKeys: new Set<string>(),

  markDirty: (key: string) => {
    set((state) => {
      if (state.dirtyKeys.has(key)) return state;
      const next = new Set(state.dirtyKeys);
      next.add(key);
      return { dirtyKeys: next };
    });
  },

  markClean: (key: string) => {
    set((state) => {
      if (!state.dirtyKeys.has(key)) return state;
      const next = new Set(state.dirtyKeys);
      next.delete(key);
      return { dirtyKeys: next };
    });
  },

  markAllClean: () => {
    set({ dirtyKeys: new Set<string>() });
  },

  isDirty: (key?: string) => {
    const keys = get().dirtyKeys;
    if (key) return keys.has(key);
    return keys.size > 0;
  },

  getDirtyKeys: () => Array.from(get().dirtyKeys),
}));
