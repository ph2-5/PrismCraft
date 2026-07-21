import { create } from "zustand";
import { persist } from "zustand/middleware";

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

// 仅持久化 active*Id（sidebarCollapsed 由 Sidebar.tsx 通过 preferencesStorage 独立管理）
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeCharacterId: null,
      activeSceneId: null,
      activeStoryId: null,
      sidebarCollapsed: false,
      setActiveCharacterId: (id) => set({ activeCharacterId: id }),
      setActiveSceneId: (id) => set({ activeSceneId: id }),
      setActiveStoryId: (id) => set({ activeStoryId: id }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "ai_anim_studio_app-store",
      partialize: (state) => ({
        activeCharacterId: state.activeCharacterId,
        activeSceneId: state.activeSceneId,
        activeStoryId: state.activeStoryId,
      }),
    },
  ),
);
