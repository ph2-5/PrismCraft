/**
 * R155: StoryProvider MUST Memoize the services Object Passed to useAssetLoader
 *
 * 回归规则目的：
 *   src/app/story/StoryProvider.tsx 中传给 useAssetLoader 的 services 对象
 *   （包含 getAllCharacters / getAllScenes / getStoryboardAssets 三个方法）
 *   必须用 useMemo 包裹，确保在多次渲染间引用稳定。useAssetLoader 内部有
 *   useEffect 依赖 [services]，若 services 引用每次渲染都变化，effect 会被
 *   反复触发，导致 characters/scenes/assets 反复重新加载（性能退化 + 闪烁）。
 *
 * 历史问题：
 *   原实现把 services 对象内联在 useAssetLoader 调用处（每次渲染创建新对象），
 *   导致任何状态变化（例如 beats 修改、saveStatus 切换）都会重新触发 useAssetLoader
 *   的 effect，反复调用 services.getAllCharacters() 等数据库查询。
 *
 * 被测代码：
 *   src/app/story/StoryProvider.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

// 用 vi.hoisted 提升 mock，确保在 StoryProvider 模块导入前生效。
// 关键：mockUseAssetLoader 会捕获每次渲染传入的 services 引用。
const {
  mockUseAssetLoader,
  capturedServicesRefs,
  mockUseStoryState,
  mockUseUploadHandlers,
  mockUseStoryPlanner,
  mockUseKeyframeGenerator,
  mockUseFramePairGenerator,
  mockUseVideoGenerator,
  mockUseBatchGenerator,
  mockUseStorySaver,
  mockUseStoryActions,
  mockUseStoryVideo,
  mockUseStoryPersistence,
  mockUseVideoTaskManager,
  mockStoryService,
  mockCharacterService,
  mockSceneService,
  mockContainer,
  mockErrorLogger,
  mockToastHelpers,
  mockT,
} = vi.hoisted(() => ({
  // 记录每次 useAssetLoader 调用时收到的 services 引用
  capturedServicesRefs: [] as unknown[],
  mockUseAssetLoader: vi.fn((services: unknown) => {
    capturedServicesRefs.push(services);
    return {
      characters: [],
      scenes: [],
      assets: [],
      isLoading: false,
      charactersRef: { current: [] },
      scenesRef: { current: [] },
    };
  }),
  mockUseStoryState: vi.fn(() => ({
    stories: [],
    currentStory: { id: "s1", title: "t", beats: [], genre: "drama", tone: "neutral" },
    beats: [],
    beatsRef: { current: [] },
    hasUnsavedChanges: false,
    generationEnhanced: false,
    selectedVideoModel: undefined,
    selectedImageModel: undefined,
    setStories: vi.fn(),
    setCurrentStory: vi.fn(),
    setBeats: vi.fn(),
    markClean: vi.fn(),
    markDirty: vi.fn(),
    setGenerationEnhanced: vi.fn(),
    setSelectedVideoModel: vi.fn(),
    setSelectedImageModel: vi.fn(),
    updateBeat: vi.fn(),
    addBeat: vi.fn(),
    deleteBeat: vi.fn(),
    moveBeat: vi.fn(),
  })),
  mockUseUploadHandlers: vi.fn(() => ({
    handleUploadKeyframe: vi.fn(),
    handleUploadFirstFrame: vi.fn(),
    handleUploadLastFrame: vi.fn(),
    handleUploadVideo: vi.fn(),
  })),
  mockUseStoryPlanner: vi.fn(() => ({
    planStoryWithAI: vi.fn(),
    isPlanningStory: false,
  })),
  mockUseKeyframeGenerator: vi.fn(() => ({
    generateKeyframe: vi.fn(),
    regenerateKeyframe: vi.fn(),
    generatingKeyframe: false,
  })),
  mockUseFramePairGenerator: vi.fn(() => ({
    generateFramePair: vi.fn(),
    generatingFramePair: false,
  })),
  mockUseVideoGenerator: vi.fn(() => ({
    generateVideoNew: vi.fn(),
    generatingVideo: false,
  })),
  mockUseBatchGenerator: vi.fn(() => ({
    batchGenerateKeyframes: vi.fn(),
    batchGenerateFramePairs: vi.fn(),
    batchGenerateVideos: vi.fn(),
  })),
  mockUseStorySaver: vi.fn(() => ({
    handleSave: vi.fn(),
    handleDeleteStory: vi.fn(),
    performDeleteStory: vi.fn(),
    handleRestoreVersion: vi.fn(),
    savedTemplates: [],
    handleSaveTemplate: vi.fn(),
    handleDeleteTemplate: vi.fn(),
    applyStoryboardTemplate: vi.fn(),
    updateRecommendedTemplates: vi.fn(),
    templateDialogOpen: false,
    setTemplateDialogOpen: vi.fn(),
    versionDialogOpen: false,
    setVersionDialogOpen: vi.fn(),
    deleteDialogOpen: false,
    setDeleteDialogOpen: vi.fn(),
    saveStatus: "idle" as const,
    saveError: null,
  })),
  mockUseStoryActions: vi.fn(() => ({
    deleteBeatWithCleanup: vi.fn(),
    switchToStory: vi.fn(),
  })),
  mockUseStoryVideo: vi.fn(() => ({
    allCompletedTaskUrls: new Map<string, string>(),
    completedTaskUrls: new Map<string, string>(),
    generatingBeats: new Set<string>(),
  })),
  mockUseStoryPersistence: vi.fn(() => ({
    isVideoUrlPersisting: false,
  })),
  mockUseVideoTaskManager: vi.fn(() => ({
    tasks: [],
    activeTasks: [],
    allTasks: [],
    addTask: vi.fn(),
    createTask: vi.fn(),
    pollTask: vi.fn(),
    removeTask: vi.fn(),
    removeTasks: vi.fn(),
    startBackgroundProcessing: vi.fn(),
    clearCompletedTasks: vi.fn(),
    clearFailedTasks: vi.fn(),
    recoverTask: vi.fn(),
  })),
  mockStoryService: { getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
  mockCharacterService: { getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
  mockSceneService: { getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
  mockContainer: {
    storyboardStorage: { getStoryboardAssets: vi.fn().mockResolvedValue([]) },
  },
  mockErrorLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockToastHelpers: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  mockT: vi.fn((key: string) => key),
}));

vi.mock("@/modules/story", () => ({
  useAssetLoader: mockUseAssetLoader,
  useStoryState: mockUseStoryState,
  useUploadHandlers: mockUseUploadHandlers,
  useStoryPlanner: mockUseStoryPlanner,
  useKeyframeGenerator: mockUseKeyframeGenerator,
  useFramePairGenerator: mockUseFramePairGenerator,
  useVideoGenerator: mockUseVideoGenerator,
  useBatchGenerator: mockUseBatchGenerator,
  useStorySaver: mockUseStorySaver,
  storyService: mockStoryService,
}));

vi.mock("@/modules/character", () => ({
  characterService: mockCharacterService,
}));

vi.mock("@/modules/scene", () => ({
  sceneService: mockSceneService,
}));

vi.mock("@/modules/video", () => ({
  useVideoTaskManager: mockUseVideoTaskManager,
}));

vi.mock("@/infrastructure/di", () => ({
  container: mockContainer,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: () => mockToastHelpers,
}));

vi.mock("@/shared/constants/messages", () => ({
  t: mockT,
}));

vi.mock("@/domain/types", () => ({
  // 让 VideoModelFormat 在测试中是 string 即可
}));

vi.mock("../useStoryActions", () => ({
  useStoryActions: mockUseStoryActions,
}));

vi.mock("../useStoryPersistence", () => ({
  useStoryPersistence: mockUseStoryPersistence,
}));

vi.mock("../useStoryVideo", () => ({
  useStoryVideo: mockUseStoryVideo,
}));

import { StoryProvider } from "../StoryProvider";

describe("R155: StoryProvider 必须用 useMemo 包裹传给 useAssetLoader 的 services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedServicesRefs.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("多次渲染时 services 对象引用必须保持稳定", () => {
    const { rerender } = render(
      <StoryProvider>
        <div>child</div>
      </StoryProvider>,
    );

    // 第一次渲染应调用 useAssetLoader 一次
    expect(mockUseAssetLoader).toHaveBeenCalledTimes(1);

    // 用相同的 props rerender 多次
    rerender(
      <StoryProvider>
        <div>child</div>
      </StoryProvider>,
    );
    rerender(
      <StoryProvider>
        <div>child-changed</div>
      </StoryProvider>,
    );
    rerender(
      <StoryProvider>
        <div>child</div>
      </StoryProvider>,
    );

    // 总共 4 次渲染
    expect(mockUseAssetLoader).toHaveBeenCalledTimes(4);

    // 关键断言：所有传入的 services 引用必须严格相等（===）
    // 如果没用 useMemo 包裹，每次渲染会创建新的内联对象，引用会不同
    expect(capturedServicesRefs.length).toBe(4);
    const first = capturedServicesRefs[0];
    for (let i = 1; i < capturedServicesRefs.length; i++) {
      expect(capturedServicesRefs[i]).toBe(first);
    }
  });

  it("services 对象必须包含 getAllCharacters / getAllScenes / getStoryboardAssets 三个方法", () => {
    render(
      <StoryProvider>
        <div>child</div>
      </StoryProvider>,
    );

    expect(capturedServicesRefs.length).toBeGreaterThanOrEqual(1);
    const services = capturedServicesRefs[0] as Record<string, unknown>;
    expect(typeof services.getAllCharacters).toBe("function");
    expect(typeof services.getAllScenes).toBe("function");
    expect(typeof services.getStoryboardAssets).toBe("function");
  });

  it("services.getAllCharacters 调用时应委托到 characterService.getAll", async () => {
    render(
      <StoryProvider>
        <div>child</div>
      </StoryProvider>,
    );

    expect(capturedServicesRefs.length).toBeGreaterThanOrEqual(1);
    const services = capturedServicesRefs[0] as {
      getAllCharacters: () => Promise<unknown>;
    };
    await services.getAllCharacters();
    expect(mockCharacterService.getAll).toHaveBeenCalledTimes(1);
  });

  it("services.getAllScenes 调用时应委托到 sceneService.getAll", async () => {
    render(
      <StoryProvider>
        <div>child</div>
      </StoryProvider>,
    );

    const services = capturedServicesRefs[0] as {
      getAllScenes: () => Promise<unknown>;
    };
    await services.getAllScenes();
    expect(mockSceneService.getAll).toHaveBeenCalledTimes(1);
  });

  it("services.getStoryboardAssets 调用时应委托到 container.storyboardStorage.getStoryboardAssets", async () => {
    render(
      <StoryProvider>
        <div>child</div>
      </StoryProvider>,
    );

    const services = capturedServicesRefs[0] as {
      getStoryboardAssets: () => Promise<unknown>;
    };
    await services.getStoryboardAssets();
    expect(mockContainer.storyboardStorage.getStoryboardAssets).toHaveBeenCalledTimes(1);
  });

  it("services 引用稳定可避免 useAssetLoader 内部 effect 反复触发", () => {
    // 这个测试是行为层面的断言：useAssetLoader 的 effect 依赖 [services]，
    // 如果 services 引用稳定，effect 不会在每次渲染时重新执行。
    // 我们通过捕获 services 引用来验证：当 React 调用 useAssetLoader(services) 时，
    // 传入的 services 必须在所有渲染间是同一引用（===）。
    const { rerender } = render(
      <StoryProvider>
        <div>child</div>
      </StoryProvider>,
    );

    rerender(
      <StoryProvider>
        <div>child-2</div>
      </StoryProvider>,
    );

    expect(capturedServicesRefs.length).toBe(2);
    expect(capturedServicesRefs[0]).toBe(capturedServicesRefs[1]);

    // 引用相同 → React.useEffect([services]) 不会重新执行
    // 这是 useMemo 优化的核心目的
  });
});
