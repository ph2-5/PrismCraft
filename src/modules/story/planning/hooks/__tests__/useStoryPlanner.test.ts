import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Story, StoryBeat, Character, Scene } from "@/domain/schemas";

const { mockLoadConfig, mockGenerateStoryPlan, mockGetAllElements, mockConfirm, mockSuccess, mockShowError, mockSetBeats, mockErrorLogger } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockGenerateStoryPlan: vi.fn(),
  mockGetAllElements: vi.fn(),
  mockConfirm: vi.fn(),
  mockSuccess: vi.fn(),
  mockShowError: vi.fn(),
  mockSetBeats: vi.fn(),
  mockErrorLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/api-config", () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock("@/modules/shot", () => ({
  generateStoryPlanWithValidation: mockGenerateStoryPlan,
  formatValidationResult: vi.fn().mockReturnValue("formatted"),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    elementStorage: { getAllElements: mockGetAllElements },
  },
}));

vi.mock("@/shared/error-handler", () => ({
  getErrorMessage: vi.fn().mockReturnValue("mocked error"),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: mockConfirm,
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

import { useStoryPlanner } from "../useStoryPlanner";

const mockStory: Story = {
  id: "story-1",
  title: "测试故事",
  description: "测试描述",
  characters: [],
  scenes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  beats: [],
  elementIds: [],
};

const mockBeat: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  description: "测试镜头",
  type: "scene",
  characterIds: [],
  elementIds: [],
  enhancedGeneration: false,
};

const mockCharacter: Character = {
  id: "char-1",
  name: "角色A",
  description: "测试角色",
  gender: "male",
  style: "anime",
  personality: [],
  appearance: {
    hairColor: "",
    hairStyle: "",
    eyeColor: "",
    height: "",
    build: "",
    clothing: "",
  },
  prompt: "测试",
};

const mockScene: Scene = {
  id: "scene-1",
  name: "场景A",
  description: "测试场景",
  type: "indoor",
  timeOfDay: "day",
  weather: "sunny",
  mood: "calm",
  lighting: "bright",
  elements: [],
  colors: [],
  prompt: "测试",
};

function createDefaultProps(overrides: Record<string, unknown> = {}) {
  return {
    currentStory: mockStory,
    beatsRef: { current: [] } as React.MutableRefObject<StoryBeat[]>,
    charactersRef: { current: [mockCharacter] } as React.MutableRefObject<Character[]>,
    scenesRef: { current: [mockScene] } as React.MutableRefObject<Scene[]>,
    setBeats: mockSetBeats as unknown as React.Dispatch<React.SetStateAction<StoryBeat[]>>,
    generationEnhanced: false,
    success: mockSuccess,
    showError: mockShowError,
    ...overrides,
  };
}

describe("useStoryPlanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockResolvedValue({
      providers: [{ models: [{ capabilities: ["text"] }] }],
    });
    mockGetAllElements.mockResolvedValue([]);
    mockConfirm.mockResolvedValue(true);
  });

  describe("planStoryWithAI - 前置校验", () => {
    it("故事无标题且无描述时应调用 showError 并返回", async () => {
      const emptyStory: Story = {
        ...mockStory,
        title: "",
        description: "",
      };
      const props = createDefaultProps({ currentStory: emptyStory });
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockShowError).toHaveBeenCalled();
      expect(mockGenerateStoryPlan).not.toHaveBeenCalled();
    });

    it("无文本 API 配置时应调用 showError", async () => {
      mockLoadConfig.mockResolvedValue({
        providers: [{ models: [{ capabilities: ["image"] }] }],
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockShowError).toHaveBeenCalled();
      expect(mockGenerateStoryPlan).not.toHaveBeenCalled();
    });

    it("loadConfig 抛出异常时应继续执行（不阻断）", async () => {
      mockLoadConfig.mockRejectedValue(new Error("config error"));

      const props = createDefaultProps();
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [mockBeat],
        validationResults: [],
        autoFixedCount: 0,
        retryCount: 0,
        fixDetails: [],
      });

      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockErrorLogger.warn).toHaveBeenCalled();
      expect(mockGenerateStoryPlan).toHaveBeenCalled();
    });
  });

  describe("planStoryWithAI - 确认对话框", () => {
    it("已有镜头时应弹出确认对话框", async () => {
      const props = createDefaultProps({
        beatsRef: { current: [mockBeat] },
      });
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [mockBeat],
        validationResults: [],
        autoFixedCount: 0,
        retryCount: 0,
        fixDetails: [],
      });

      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockConfirm).toHaveBeenCalled();
    });

    it("用户取消确认时应返回且不调用生成", async () => {
      mockConfirm.mockResolvedValue(false);

      const props = createDefaultProps({
        beatsRef: { current: [mockBeat] },
      });
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockGenerateStoryPlan).not.toHaveBeenCalled();
    });

    it("无已有镜头时不应弹出确认对话框", async () => {
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [mockBeat],
        validationResults: [],
        autoFixedCount: 0,
        retryCount: 0,
        fixDetails: [],
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockGenerateStoryPlan).toHaveBeenCalled();
    });

    it("有活跃视频任务时确认消息应包含警告", async () => {
      const props = createDefaultProps({
        beatsRef: { current: [mockBeat] },
        activeVideoTaskCount: 3,
      });
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [mockBeat],
        validationResults: [],
        autoFixedCount: 0,
        retryCount: 0,
        fixDetails: [],
      });

      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.stringContaining("3"),
        expect.anything(),
      );
    });
  });

  describe("planStoryWithAI - 生成成功", () => {
    it("生成成功时应调用 setBeats 和 success", async () => {
      const generatedBeats: StoryBeat[] = [
        { ...mockBeat, id: "beat-gen-1" },
        { ...mockBeat, id: "beat-gen-2", sequence: 1 },
      ];
      mockGenerateStoryPlan.mockResolvedValue({
        beats: generatedBeats,
        validationResults: [],
        autoFixedCount: 0,
        retryCount: 0,
        fixDetails: [],
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockSetBeats).toHaveBeenCalled();
      expect(mockSuccess).toHaveBeenCalled();
    });

    it("生成结果为空时应调用 showError", async () => {
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [],
        validationResults: [],
        autoFixedCount: 0,
        retryCount: 0,
        fixDetails: [],
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockShowError).toHaveBeenCalled();
    });

    it("有自动修复时应包含修复信息", async () => {
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [mockBeat],
        validationResults: [],
        autoFixedCount: 2,
        retryCount: 0,
        fixDetails: ["修复1", "修复2"],
      });

      const props = createDefaultProps({ generationEnhanced: true });
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("2"),
      );
    });

    it("有重试时应包含重试信息", async () => {
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [mockBeat],
        validationResults: [],
        autoFixedCount: 0,
        retryCount: 2,
        fixDetails: [],
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("2"),
      );
    });

    it("generationEnhanced=true 时应传递增强参数", async () => {
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [mockBeat],
        validationResults: [],
        autoFixedCount: 0,
        retryCount: 0,
        fixDetails: [],
      });

      const props = createDefaultProps({ generationEnhanced: true });
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockGenerateStoryPlan).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          maxRetries: 3,
          autoFix: true,
          fewShotCount: 3,
        }),
        true,
      );
    });

    it("generationEnhanced=false 时应传递基础参数", async () => {
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [mockBeat],
        validationResults: [],
        autoFixedCount: 0,
        retryCount: 0,
        fixDetails: [],
      });

      const props = createDefaultProps({ generationEnhanced: false });
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockGenerateStoryPlan).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          maxRetries: 1,
          autoFix: false,
          fewShotCount: 1,
        }),
        false,
      );
    });
  });

  describe("planStoryWithAI - 错误处理", () => {
    it("生成过程抛出异常时应调用 showError", async () => {
      mockGenerateStoryPlan.mockRejectedValue(new Error("AI error"));

      const props = createDefaultProps();
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(mockShowError).toHaveBeenCalled();
    });

    it("无论成功或失败，isPlanningStory 最终应为 false", async () => {
      mockGenerateStoryPlan.mockRejectedValue(new Error("fail"));

      const props = createDefaultProps();
      const { result } = renderHook(() => useStoryPlanner(props));

      await act(async () => {
        await result.current.planStoryWithAI();
      });

      expect(result.current.isPlanningStory).toBe(false);
    });
  });

  describe("isPlanningStory 状态", () => {
    it("初始状态应为 false", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useStoryPlanner(props));
      expect(result.current.isPlanningStory).toBe(false);
    });

    it("规划中应为 true", async () => {
      let resolveGeneration: (value: unknown) => void;
      mockGenerateStoryPlan.mockImplementation(
        () => new Promise((resolve) => { resolveGeneration = resolve; }),
      );

      const props = createDefaultProps();
      let resolveConfigCheck: (value: unknown) => void;
      mockLoadConfig.mockImplementation(
        () => new Promise((resolve) => { resolveConfigCheck = resolve; }),
      );

      const { result } = renderHook(() => useStoryPlanner(props));

      act(() => {
        result.current.planStoryWithAI();
      });

      await act(async () => {
        resolveConfigCheck!({
          providers: [{ models: [{ capabilities: ["text"] }] }],
        });
      });

      expect(result.current.isPlanningStory).toBe(true);

      await act(async () => {
        resolveGeneration!({
          beats: [mockBeat],
          validationResults: [],
          autoFixedCount: 0,
          retryCount: 0,
          fixDetails: [],
        });
      });

      expect(result.current.isPlanningStory).toBe(false);
    });
  });
});
