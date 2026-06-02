import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { type ReactNode } from "react";

vi.mock("@/shared/utils/platform", () => ({
  isElectron: vi.fn(),
}));

vi.mock("@/infrastructure/monitoring", () => ({
  performanceMonitor: {
    measure: vi.fn((_label: string, _key: string, fn: () => unknown) => fn()),
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  ),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    storyStorage: { getAllStories: vi.fn(), getStoryById: vi.fn(), countStories: vi.fn() },
    characterStorage: { getAllCharacters: vi.fn(), getCharacterById: vi.fn(), countCharacters: vi.fn() },
    sceneStorage: { getAllScenes: vi.fn(), getSceneById: vi.fn(), countScenes: vi.fn() },
    videoTaskStorage: { getAllVideoTasks: vi.fn() },
    videoCacheStorage: { getCacheStats: vi.fn() },
    mediaAssetRepository: { findAll: vi.fn() },
  },
}));

import { isElectron } from "@/shared/utils/platform";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("R51: useQuery hooks must have enabled: isElectron() guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isElectron).mockReturnValue(false);
  });

  const queryHooks = [
    { name: "useStories", importPath: "@/modules/story/planning/hooks/use-stories", hookName: "useStories" },
    { name: "useStory", importPath: "@/modules/story/planning/hooks/use-stories", hookName: "useStory", args: ["test-id"] },
    { name: "useStoryCount", importPath: "@/modules/story/planning/hooks/use-stories", hookName: "useStoryCount" },
    { name: "useCharacters", importPath: "@/modules/character/hooks/use-characters", hookName: "useCharacters" },
    { name: "useCharacter", importPath: "@/modules/character/hooks/use-characters", hookName: "useCharacter", args: ["test-id"] },
    { name: "useCharacterCount", importPath: "@/modules/character/hooks/use-characters", hookName: "useCharacterCount" },
    { name: "useScenes", importPath: "@/modules/scene/hooks/use-scenes", hookName: "useScenes" },
    { name: "useScene", importPath: "@/modules/scene/hooks/use-scenes", hookName: "useScene", args: ["test-id"] },
    { name: "useSceneCount", importPath: "@/modules/scene/hooks/use-scenes", hookName: "useSceneCount" },
    { name: "useVideoTasks", importPath: "@/modules/video/task-management/hooks/use-video-tasks", hookName: "useVideoTasks" },
    { name: "useFailedVideoTasks", importPath: "@/modules/video/task-management/hooks/use-video-tasks", hookName: "useFailedVideoTasks" },
    { name: "useVideoCacheStats", importPath: "@/modules/video/cache/hooks/use-video-cache", hookName: "useVideoCacheStats" },
    { name: "useMediaAssets", importPath: "@/modules/asset/hooks/use-media-assets", hookName: "useMediaAssets" },
  ];

  for (const { name, importPath, hookName, args } of queryHooks) {
    it(`${name} should have enabled: isElectron() guard (disabled in browser mode)`, async () => {
      const mod = await import(importPath);
      const hook = mod[hookName];
      const hookArgs = args ?? [];

      const wrapper = createWrapper();
      const { result } = renderHook(() => hook(...hookArgs), { wrapper });

      await vi.waitFor(() => {
        expect(result.current.fetchStatus).toBe("idle");
      });

      expect(result.current.isLoading).toBe(false);
    });
  }
});
