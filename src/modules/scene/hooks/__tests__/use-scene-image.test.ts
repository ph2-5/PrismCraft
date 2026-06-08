import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Scene } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";

const {
  mockSceneService,
  mockInvalidateQueries,
  mockErrorLogger,
  mockTextProvider,
  mockImageProvider,
  mockFileUploader,
  mockGenerateSceneImagePrompt,
  mockGenerateSimpleSceneImagePrompt,
  mockGenerateScenePromptOptimization,
  mockUseModelSelection,
  mockGetErrorMessage,
} = vi.hoisted(() => ({
  mockSceneService: {
    update: vi.fn<(id: string, input: unknown) => Promise<Result<void>>>(),
  },
  mockInvalidateQueries: vi.fn(),
  mockErrorLogger: { error: vi.fn(), warn: vi.fn() },
  mockTextProvider: {
    generateText: vi.fn<(prompt: string, options?: unknown) => Promise<{ success: boolean; data?: { text: string }; error?: string }>>(),
  },
  mockImageProvider: {
    generateImage: vi.fn<(prompt: string, type: string, options?: unknown) => Promise<{ success: boolean; data?: { imageUrl: string }; error?: string; message?: string }>>(),
    analyzeImage: vi.fn<(imageUrl: string, type: string, prompt?: string, options?: unknown) => Promise<{ success: boolean; data?: { analyzed: Partial<Scene> }; error?: string; message?: string }>>(),
  },
  mockFileUploader: {
    uploadFile: vi.fn<(file: File) => Promise<{ success: boolean; data?: { url: string }; error?: string }>>(),
  },
  mockGenerateSceneImagePrompt: vi.fn<(scene: Scene) => string>(),
  mockGenerateSimpleSceneImagePrompt: vi.fn<(scene: Scene) => string>(),
  mockGenerateScenePromptOptimization: vi.fn<(description: string) => string>(),
  mockUseModelSelection: vi.fn<() => [{ providerId: string; modelId: string } | null, (v: unknown) => void]>(),
  mockGetErrorMessage: vi.fn<(error: unknown) => string>(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

vi.mock("@/modules/scene/services", () => ({
  sceneService: mockSceneService,
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: mockTextProvider,
    imageProvider: mockImageProvider,
    fileUploader: mockFileUploader,
  },
}));

vi.mock("@/modules/prompt", () => ({
  useModelSelection: mockUseModelSelection,
  generateSceneImagePrompt: mockGenerateSceneImagePrompt,
  generateSimpleSceneImagePrompt: mockGenerateSimpleSceneImagePrompt,
  generateScenePromptOptimization: mockGenerateScenePromptOptimization,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/error-handler", () => ({
  getErrorMessage: mockGetErrorMessage,
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

import { useSceneImage } from "../use-scene-image";

const defaultScene: Scene = {
  id: "scene-1",
  name: "测试场景",
  description: "场景描述",
  type: "室内",
  timeOfDay: "白天",
  weather: "晴天",
  mood: "欢快",
  lighting: "自然光",
  elements: ["建筑"],
  colors: ["暖色调"],
  prompt: "提示词",
};

function buildProps(overrides: Record<string, unknown> = {}) {
  return {
    currentScene: { ...defaultScene },
    currentSceneRef: { current: { ...defaultScene } } as React.MutableRefObject<Scene>,
    setCurrentScene: vi.fn<(update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void>(),
    addAssetToLibrary: vi.fn(),
    success: vi.fn<(title: string, description?: string) => void>(),
    showError: vi.fn<(title: string, description?: string) => void>(),
    ...overrides,
  };
}

type UseSceneImageProps = Parameters<typeof useSceneImage>[0];

describe("useSceneImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSceneService.update.mockResolvedValue(ok(undefined));
    mockGenerateSceneImagePrompt.mockReturnValue("生成的场景图片提示词");
    mockGenerateSimpleSceneImagePrompt.mockReturnValue("简化的场景图片提示词");
    mockGenerateScenePromptOptimization.mockReturnValue("优化提示词系统消息");
    mockUseModelSelection.mockReturnValue([{ providerId: "provider-1", modelId: "model-1" }, vi.fn()]);
    mockGetErrorMessage.mockReturnValue("错误消息");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("generatePrompt", () => {
    it("应调用 generateSceneImagePrompt 并返回结果", () => {
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      const prompt = result.current.generatePrompt(defaultScene);

      expect(mockGenerateSceneImagePrompt).toHaveBeenCalledWith(defaultScene);
      expect(prompt).toBe("生成的场景图片提示词");
    });

    it("当 generateSceneImagePrompt 返回空时应返回默认提示", () => {
      mockGenerateSceneImagePrompt.mockReturnValue("");
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      const prompt = result.current.generatePrompt(defaultScene);

      expect(prompt).toBe("请输入场景信息生成提示词...");
    });
  });

  describe("optimizePrompt", () => {
    it("成功优化提示词时应更新 currentScene", async () => {
      mockTextProvider.generateText.mockResolvedValue({
        success: true,
        data: { text: "  优化后的描述  " },
      });
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.optimizePrompt();
      });

      expect(mockGenerateScenePromptOptimization).toHaveBeenCalledWith("场景描述");
      expect(mockTextProvider.generateText).toHaveBeenCalledWith("优化提示词系统消息", expect.objectContaining({ maxTokens: 300, temperature: 0.8 }));
      expect(props.setCurrentScene).toHaveBeenCalledWith(expect.any(Function), true);
      expect(props.success).toHaveBeenCalled();
      expect(result.current.isOptimizingPrompt).toBe(false);
    });

    it("描述为空时应显示错误且不调用 AI", async () => {
      const props = buildProps({
        currentScene: { ...defaultScene, description: "" },
      });
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.optimizePrompt();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockTextProvider.generateText).not.toHaveBeenCalled();
    });

    it("AI 返回失败时应显示错误", async () => {
      mockTextProvider.generateText.mockResolvedValue({
        success: false,
        error: "API 不可用",
      });
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.optimizePrompt();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isOptimizingPrompt).toBe(false);
    });

    it("AI 返回空文本时应显示错误", async () => {
      mockTextProvider.generateText.mockResolvedValue({
        success: true,
        data: { text: "   " },
      });
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.optimizePrompt();
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("AI 抛出异常时应记录错误并显示提示", async () => {
      mockTextProvider.generateText.mockRejectedValue(new Error("网络错误"));
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.optimizePrompt();
      });

      expect(mockErrorLogger.error).toHaveBeenCalled();
      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isOptimizingPrompt).toBe(false);
    });
  });

  describe("generateImage", () => {
    it("成功生成图片时应设置 generatedImage", async () => {
      mockImageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "https://example.com/scene.png" },
      });
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(mockImageProvider.generateImage).toHaveBeenCalled();
      expect(result.current.generatedImage).toBe("https://example.com/scene.png");
      expect(props.success).toHaveBeenCalled();
      expect(result.current.isGenerating).toBe(false);
    });

    it("使用 imageGenerationPrompt 优先于自动生成提示词", async () => {
      mockImageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "https://example.com/scene.png" },
      });
      const props = buildProps({
        currentScene: { ...defaultScene, imageGenerationPrompt: "自定义图片提示词" },
      });
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(mockImageProvider.generateImage).toHaveBeenCalledWith(
        "自定义图片提示词",
        "scene",
        expect.objectContaining({ size: "1920x1920", providerId: "provider-1", modelId: "model-1" }),
      );
    });

    it("无 imageGenerationPrompt 时使用 generateSimpleSceneImagePrompt", async () => {
      mockImageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "https://example.com/scene.png" },
      });
      const props = buildProps({
        currentScene: { ...defaultScene, imageGenerationPrompt: "" },
      });
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(mockGenerateSimpleSceneImagePrompt).toHaveBeenCalledWith(expect.objectContaining({ imageGenerationPrompt: "" }));
      expect(mockImageProvider.generateImage).toHaveBeenCalledWith(
        "简化的场景图片提示词",
        "scene",
        expect.anything(),
      );
    });

    it("提示词为默认占位文本时应显示错误且不调用 AI", async () => {
      mockGenerateSimpleSceneImagePrompt.mockReturnValue("请输入场景信息生成提示词...");
      const props = buildProps({
        currentScene: { ...defaultScene, imageGenerationPrompt: "" },
      });
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockImageProvider.generateImage).not.toHaveBeenCalled();
    });

    it("AI 返回失败时应显示错误", async () => {
      mockImageProvider.generateImage.mockResolvedValue({
        success: false,
        error: "生成失败",
      });
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isGenerating).toBe(false);
    });

    it("AI 抛出异常时应记录错误", async () => {
      mockImageProvider.generateImage.mockRejectedValue(new Error("网络错误"));
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(mockErrorLogger.error).toHaveBeenCalled();
      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isGenerating).toBe(false);
    });
  });

  describe("saveImageToScene", () => {
    it("成功保存图片到场景时应更新数据库并添加到资产库", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      act(() => {
        result.current.setGeneratedImage("https://example.com/scene.png");
      });

      await act(async () => {
        await result.current.saveImageToScene();
      });

      expect(mockSceneService.update).toHaveBeenCalled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["scenes"] });
      expect(props.addAssetToLibrary).toHaveBeenCalledWith(
        "https://example.com/scene.png",
        "image",
        "测试场景",
        { type: "scene", id: "scene-1", name: "测试场景" },
      );
      expect(props.success).toHaveBeenCalled();
    });

    it("没有 generatedImage 时不应执行任何操作", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.saveImageToScene();
      });

      expect(mockSceneService.update).not.toHaveBeenCalled();
    });

    it("没有场景 id 时不应执行任何操作", async () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "" },
      });
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      act(() => {
        result.current.setGeneratedImage("https://example.com/scene.png");
      });

      await act(async () => {
        await result.current.saveImageToScene();
      });

      expect(mockSceneService.update).not.toHaveBeenCalled();
    });

    it("数据库更新失败时应显示错误", async () => {
      mockSceneService.update.mockResolvedValueOnce(err(new AppError("DATABASE_ERROR", "数据库错误")));
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      act(() => {
        result.current.setGeneratedImage("https://example.com/scene.png");
      });

      await act(async () => {
        await result.current.saveImageToScene();
      });

      expect(mockErrorLogger.error).toHaveBeenCalled();
      expect(props.showError).toHaveBeenCalled();
    });
  });

  describe("handleFileUpload", () => {
    function createFileInputEvent(filename: string): React.ChangeEvent<HTMLInputElement> {
      const file = new File(["content"], filename, { type: "image/png" });
      return {
        target: { files: [file] } as unknown as HTMLInputElement,
      } as React.ChangeEvent<HTMLInputElement>;
    }

    it("成功上传文件并保存到场景", async () => {
      mockFileUploader.uploadFile.mockResolvedValue({
        success: true,
        data: { url: "https://example.com/uploaded.png" },
      });
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.handleFileUpload(createFileInputEvent("scene.png"));
      });

      expect(mockFileUploader.uploadFile).toHaveBeenCalled();
      expect(result.current.generatedImage).toBe("https://example.com/uploaded.png");
      expect(mockSceneService.update).toHaveBeenCalled();
      expect(props.addAssetToLibrary).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
      expect(result.current.isUploading).toBe(false);
    });

    it("场景无 id 时上传文件只添加到资产库不保存到数据库", async () => {
      mockFileUploader.uploadFile.mockResolvedValue({
        success: true,
        data: { url: "https://example.com/uploaded.png" },
      });
      const props = buildProps({
        currentScene: { ...defaultScene, id: "" },
      });
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.handleFileUpload(createFileInputEvent("scene.png"));
      });

      expect(mockSceneService.update).not.toHaveBeenCalled();
      expect(props.addAssetToLibrary).toHaveBeenCalledWith(
        "https://example.com/uploaded.png",
        "image",
        "上传的图片",
      );
    });

    it("上传失败时应显示错误", async () => {
      mockFileUploader.uploadFile.mockResolvedValue({
        success: false,
        error: "上传失败",
      });
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.handleFileUpload(createFileInputEvent("scene.png"));
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isUploading).toBe(false);
    });

    it("上传抛出异常时应记录错误", async () => {
      mockFileUploader.uploadFile.mockRejectedValue(new Error("网络错误"));
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      await act(async () => {
        await result.current.handleFileUpload(createFileInputEvent("scene.png"));
      });

      expect(mockErrorLogger.error).toHaveBeenCalled();
      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isUploading).toBe(false);
    });

    it("没有选择文件时不应执行任何操作", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      const emptyEvent = {
        target: { files: null },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleFileUpload(emptyEvent);
      });

      expect(mockFileUploader.uploadFile).not.toHaveBeenCalled();
    });
  });

  describe("clearImage", () => {
    it("应清除 generatedImage", () => {
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      act(() => {
        result.current.setGeneratedImage("https://example.com/scene.png");
      });

      act(() => {
        result.current.clearImage();
      });

      expect(result.current.generatedImage).toBeNull();
    });
  });

  describe("initial state", () => {
    it("初始状态应为空值", () => {
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.generatedImage).toBeNull();
      expect(result.current.isUploading).toBe(false);
      expect(result.current.isAnalyzing).toBe(false);
      expect(result.current.isOptimizingPrompt).toBe(false);
      expect(result.current.imageSize).toBe("1920x1920");
    });
  });

  describe("setImageSize", () => {
    it("应更新 imageSize", () => {
      const props = buildProps();
      const { result } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      act(() => {
        result.current.setImageSize("1024x1024");
      });

      expect(result.current.imageSize).toBe("1024x1024");
    });
  });

  describe("cleanup", () => {
    it("卸载时应清除 analyzeTimeout", () => {
      const props = buildProps();
      const { unmount } = renderHook(() => useSceneImage(props as UseSceneImageProps));

      unmount();

      expect(() => vi.advanceTimersByTime(60000)).not.toThrow();
    });
  });
});
