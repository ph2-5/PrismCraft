import { create } from "zustand";

interface AppState {
  activeCharacterId: string | null;
  activeSceneId: string | null;
  activeStoryId: string | null;
  sidebarCollapsed: boolean;
  setActiveCharacterId: (id: string | null) => void;
  setActiveSceneId: (id: string | null) => void;
  setActiveStoryId: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeCharacterId: null,
  activeSceneId: null,
  activeStoryId: null,
  sidebarCollapsed: false,
  setActiveCharacterId: (id) => set({ activeCharacterId: id }),
  setActiveSceneId: (id) => set({ activeSceneId: id }),
  setActiveStoryId: (id) => set({ activeStoryId: id }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
