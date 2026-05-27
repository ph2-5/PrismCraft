import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/shared/app-store";

describe("app-store", () => {
  beforeEach(() => {
    useAppStore.setState({
      activeCharacterId: null,
      activeSceneId: null,
      activeStoryId: null,
      sidebarCollapsed: false,
    });
  });

  describe("initial state", () => {
    it("should have null activeCharacterId", () => {
      expect(useAppStore.getState().activeCharacterId).toBeNull();
    });

    it("should have null activeSceneId", () => {
      expect(useAppStore.getState().activeSceneId).toBeNull();
    });

    it("should have null activeStoryId", () => {
      expect(useAppStore.getState().activeStoryId).toBeNull();
    });

    it("should have sidebarCollapsed false", () => {
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe("setActiveCharacterId", () => {
    it("should set activeCharacterId", () => {
      useAppStore.getState().setActiveCharacterId("char-1");
      expect(useAppStore.getState().activeCharacterId).toBe("char-1");
    });

    it("should clear activeCharacterId with null", () => {
      useAppStore.getState().setActiveCharacterId("char-1");
      useAppStore.getState().setActiveCharacterId(null);
      expect(useAppStore.getState().activeCharacterId).toBeNull();
    });

    it("should replace previous activeCharacterId", () => {
      useAppStore.getState().setActiveCharacterId("char-1");
      useAppStore.getState().setActiveCharacterId("char-2");
      expect(useAppStore.getState().activeCharacterId).toBe("char-2");
    });
  });

  describe("setActiveSceneId", () => {
    it("should set activeSceneId", () => {
      useAppStore.getState().setActiveSceneId("scene-1");
      expect(useAppStore.getState().activeSceneId).toBe("scene-1");
    });

    it("should clear activeSceneId with null", () => {
      useAppStore.getState().setActiveSceneId("scene-1");
      useAppStore.getState().setActiveSceneId(null);
      expect(useAppStore.getState().activeSceneId).toBeNull();
    });

    it("should replace previous activeSceneId", () => {
      useAppStore.getState().setActiveSceneId("scene-1");
      useAppStore.getState().setActiveSceneId("scene-2");
      expect(useAppStore.getState().activeSceneId).toBe("scene-2");
    });
  });

  describe("setActiveStoryId", () => {
    it("should set activeStoryId", () => {
      useAppStore.getState().setActiveStoryId("story-1");
      expect(useAppStore.getState().activeStoryId).toBe("story-1");
    });

    it("should clear activeStoryId with null", () => {
      useAppStore.getState().setActiveStoryId("story-1");
      useAppStore.getState().setActiveStoryId(null);
      expect(useAppStore.getState().activeStoryId).toBeNull();
    });

    it("should replace previous activeStoryId", () => {
      useAppStore.getState().setActiveStoryId("story-1");
      useAppStore.getState().setActiveStoryId("story-2");
      expect(useAppStore.getState().activeStoryId).toBe("story-2");
    });
  });

  describe("toggleSidebar", () => {
    it("should toggle sidebarCollapsed from false to true", () => {
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarCollapsed).toBe(true);
    });

    it("should toggle sidebarCollapsed from true to false", () => {
      useAppStore.getState().toggleSidebar();
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
    });

    it("should toggle multiple times correctly", () => {
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarCollapsed).toBe(true);
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarCollapsed).toBe(true);
    });
  });

  describe("multiple actions in sequence", () => {
    it("should set all active IDs independently", () => {
      useAppStore.getState().setActiveCharacterId("char-1");
      useAppStore.getState().setActiveSceneId("scene-1");
      useAppStore.getState().setActiveStoryId("story-1");
      const state = useAppStore.getState();
      expect(state.activeCharacterId).toBe("char-1");
      expect(state.activeSceneId).toBe("scene-1");
      expect(state.activeStoryId).toBe("story-1");
    });

    it("should not affect other fields when setting one", () => {
      useAppStore.getState().setActiveCharacterId("char-1");
      useAppStore.getState().setActiveSceneId("scene-1");
      useAppStore.getState().setActiveStoryId("story-1");
      useAppStore.getState().toggleSidebar();
      const state = useAppStore.getState();
      expect(state.activeCharacterId).toBe("char-1");
      expect(state.activeSceneId).toBe("scene-1");
      expect(state.activeStoryId).toBe("story-1");
      expect(state.sidebarCollapsed).toBe(true);
    });

    it("should clear one ID without affecting others", () => {
      useAppStore.getState().setActiveCharacterId("char-1");
      useAppStore.getState().setActiveSceneId("scene-1");
      useAppStore.getState().setActiveStoryId("story-1");
      useAppStore.getState().setActiveSceneId(null);
      const state = useAppStore.getState();
      expect(state.activeCharacterId).toBe("char-1");
      expect(state.activeSceneId).toBeNull();
      expect(state.activeStoryId).toBe("story-1");
    });
  });
});
