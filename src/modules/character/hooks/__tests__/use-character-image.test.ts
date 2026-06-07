import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Character } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";

const {
  mockInvalidateQueries,
  mockGenerateText,
  mockGenerateImage,
  mockAnalyzeImage,
  mockUploadFile,
  mockServiceUpdate,
  mockGenerateCharacterImagePrompt,
  mockGenerateCharacterDetailedPromptInstruction,
  mockUseModelSelection,
} = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockGenerateText: vi.fn(),
  mockGenerateImage: vi.fn(),
  mockAnalyzeImage: vi.fn(),
  mockUploadFile: vi.fn(),
  mockServiceUpdate: vi.fn<(id: string, input: Character) => Promise<Result<void>>>(),
  mockGenerateCharacterImagePrompt: vi.fn<(char: Character) => string>(),
  mockGenerateCharacterDetailedPromptInstruction: vi.fn<(char: Character) => string>(),
  mockUseModelSelection: vi.fn(() => [{ providerId: "test-provider", modelId: "test-model" }, vi.fn()]),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: { generateText: mockGenerateText },
    imageProvider: { generateImage: mockGenerateImage, analyzeImage: mockAnalyzeImage },
    fileUploader: { uploadFile: mockUploadFile },
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/shared/constants/messages", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("@/shared/error-handler", () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

vi.mock("@/modules/prompt", () => ({
  useModelSelection: mockUseModelSelection,
  generateCharacterImagePrompt: mockGenerateCharacterImagePrompt,
  generateCharacterDetailedPromptInstruction: mockGenerateCharacterDetailedPromptInstruction,
}));

vi.mock("@/modules/character/services", () => ({
  characterService: { update: mockServiceUpdate },
}));

import { useCharacterImage } from "../use-character-image";

function mockImageConstructor() {
  const originalImage = globalThis.Image;
  beforeEach(() => {
    const mockImg = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: "",
      width: 100,
      height: 100,
    };
    vi.stubGlobal("Image", function () {
      setTimeout(() => {
        if (mockImg.onload) mockImg.onload();
      }, 0);
      return mockImg;
    });
  });
  return originalImage;
}

function buildCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char_1",
    name: "测试角色",
    description: "描述",
    gender: "male",
    age: 25,
    style: "写实",
    personality: ["勇敢"],
    appearance: { hairColor: "black", hairStyle: "short", eyeColor: "brown", height: "180cm", build: "athletic", clothing: "suit" },
    outfits: [],
    prompt: "测试提示词",
    traits: [],
    tags: [],
    useCount: 0,
    ...overrides,
  };
}

interface BuildPropsOverrides {
  currentCharacter?: Character;
  [key: string]: unknown;
}

function buildProps(overrides: BuildPropsOverrides = {}) {
  const currentCharacter = overrides.currentCharacter ?? buildCharacter();
  return {
    currentCharacter,
    currentCharacterRef: { current: currentCharacter } as React.MutableRefObject<Character>,
    setCurrentCharacter: vi.fn<(update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void>(),
    addAssetToLibrary: vi.fn<(url: string, type: "image" | "video", name: string, boundTo?: { type: "character" | "scene"; id: string; name: string }) => void>(),
    success: vi.fn<(title: string, description?: string) => void>(),
    showError: vi.fn<(title: string, description?: string) => void>(),
    ...overrides,
  };
}

describe("useCharacterImage", () => {
  const originalImage = mockImageConstructor();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateCharacterImagePrompt.mockReturnValue("a character portrait");
    mockGenerateCharacterDetailedPromptInstruction.mockReturnValue("detailed prompt instruction");
    mockServiceUpdate.mockResolvedValue(ok(undefined));
    mockGenerateImage.mockResolvedValue({ success: true, data: { imageUrl: "https://img.example.com/generated.png" } });
    mockGenerateText.mockResolvedValue({ success: true, data: { text: "enhanced prompt" } });
    mockUploadFile.mockResolvedValue({ success: true, data: { url: "https://img.example.com/uploaded.png" } });
    mockAnalyzeImage.mockResolvedValue({
      success: true,
      data: {
        analyzed: {
          style: "anime",
          personality: ["温柔"],
          appearance: { hairColor: "blonde", hairStyle: "long", eyeColor: "blue", height: "165cm", build: "slim", clothing: "dress" },
        },
      },
    });
  });

  afterAll(() => {
    vi.stubGlobal("Image", originalImage);
  });

  describe("初始状态", () => {
    it("应返回正确的初始状态", () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.generatedImage).toBe(null);
      expect(result.current.isUploading).toBe(false);
      expect(result.current.isAnalyzing).toBe(false);
      expect(result.current.useDetailedPrompt).toBe(false);
      expect(result.current.imageSize).toBe("1920x1920");
    });
  });

  describe("generatePrompt", () => {
    it("应调用 generateCharacterImagePrompt 并返回结果", () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const prompt = result.current.generatePrompt(buildCharacter());
      expect(mockGenerateCharacterImagePrompt).toHaveBeenCalled();
      expect(prompt).toBe("a character portrait");
    });

    it("prompt 为空时应返回默认提示", () => {
      mockGenerateCharacterImagePrompt.mockReturnValueOnce("");
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const prompt = result.current.generatePrompt(buildCharacter());
      expect(prompt).toBe("请输入角色信息生成提示词...");
    });
  });

  describe("generateImage", () => {
    it("提示词为空时应显示错误且不调用生成", async () => {
      mockGenerateCharacterImagePrompt.mockReturnValueOnce("请输入角色信息生成提示词...");
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockGenerateImage).not.toHaveBeenCalled();
    });

    it("基础模式应直接用基础提示词生成图片", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(mockGenerateImage).toHaveBeenCalledWith("a character portrait", "character", expect.objectContaining({ size: "1920x1920" }));
      expect(result.current.generatedImage).toBe("https://img.example.com/generated.png");
      expect(props.success).toHaveBeenCalled();
    });

    it("详细模式应先调用 textProvider 再生成图片", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      act(() => { result.current.setUseDetailedPrompt(true); });

      await act(async () => {
        await result.current.generateImage();
      });

      expect(mockGenerateText).toHaveBeenCalledWith("detailed prompt instruction", expect.objectContaining({ maxTokens: 300 }));
      expect(mockGenerateImage).toHaveBeenCalledWith("enhanced prompt", "character", expect.objectContaining({ size: "1920x1920" }));
    });

    it("详细模式 textProvider 失败时应回退到基础提示词", async () => {
      mockGenerateText.mockResolvedValueOnce({ success: false, error: "文本生成失败" });
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      act(() => { result.current.setUseDetailedPrompt(true); });

      await act(async () => {
        await result.current.generateImage();
      });

      expect(mockGenerateImage).toHaveBeenCalledWith("a character portrait", "character", expect.objectContaining({ size: "1920x1920" }));
    });

    it("图片生成失败时应显示错误", async () => {
      mockGenerateImage.mockResolvedValueOnce({ success: false, error: "API 错误" });
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isGenerating).toBe(false);
    });

    it("图片生成抛出异常时应显示错误并重置状态", async () => {
      mockGenerateImage.mockRejectedValueOnce(new Error("网络错误"));
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isGenerating).toBe(false);
    });

    it("应传递选中的模型配置", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      await act(async () => {
        await result.current.generateImage();
      });

      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.any(String),
        "character",
        expect.objectContaining({ providerId: "test-provider", modelId: "test-model" }),
      );
    });
  });

  describe("saveImageToCharacter", () => {
    it("有图片和角色ID时应保存到角色", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      act(() => { result.current.setGeneratedImage("https://img.example.com/test.png"); });

      await act(async () => {
        await result.current.saveImageToCharacter();
      });

      expect(mockServiceUpdate).toHaveBeenCalledWith("char_1", expect.objectContaining({
        refImagePath: "https://img.example.com/test.png",
        generatedImage: "https://img.example.com/test.png",
      }));
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["characters"] });
      expect(props.addAssetToLibrary).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
    });

    it("无图片时不应调用 service", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      await act(async () => {
        await result.current.saveImageToCharacter();
      });

      expect(mockServiceUpdate).not.toHaveBeenCalled();
    });

    it("无角色ID时不应调用 service", async () => {
      const props = buildProps({ currentCharacter: buildCharacter({ id: "" }) });
      const { result } = renderHook(() => useCharacterImage(props));

      act(() => { result.current.setGeneratedImage("https://img.example.com/test.png"); });

      await act(async () => {
        await result.current.saveImageToCharacter();
      });

      expect(mockServiceUpdate).not.toHaveBeenCalled();
    });

    it("保存失败时应显示错误", async () => {
      mockServiceUpdate.mockResolvedValueOnce(err(new AppError("DATABASE_ERROR", "保存失败")));
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      act(() => { result.current.setGeneratedImage("https://img.example.com/test.png"); });

      await act(async () => {
        await result.current.saveImageToCharacter();
      });

      expect(props.showError).toHaveBeenCalled();
    });
  });

  describe("handleFileUpload", () => {
    it("上传成功且角色有ID时应保存图片到角色", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const file = new File(["test"], "test.png", { type: "image/png" });
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleFileUpload(event);
      });

      expect(mockUploadFile).toHaveBeenCalled();
      expect(result.current.generatedImage).toBe("https://img.example.com/uploaded.png");
      expect(mockServiceUpdate).toHaveBeenCalled();
      expect(props.addAssetToLibrary).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
      expect(result.current.isUploading).toBe(false);
    });

    it("上传成功但角色无ID时应只添加到资产库", async () => {
      const props = buildProps({ currentCharacter: buildCharacter({ id: "" }) });
      const { result } = renderHook(() => useCharacterImage(props));

      const file = new File(["test"], "test.png", { type: "image/png" });
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleFileUpload(event);
      });

      expect(mockServiceUpdate).not.toHaveBeenCalled();
      expect(props.addAssetToLibrary).toHaveBeenCalledWith("https://img.example.com/uploaded.png", "image", "上传的图片");
    });

    it("无文件时不应执行任何操作", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const event = { target: { files: [] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleFileUpload(event);
      });

      expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it("上传失败时应显示错误", async () => {
      mockUploadFile.mockResolvedValueOnce({ success: false, error: "上传失败" });
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const file = new File(["test"], "test.png", { type: "image/png" });
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleFileUpload(event);
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isUploading).toBe(false);
    });

    it("上传抛出异常时应显示错误", async () => {
      mockUploadFile.mockRejectedValueOnce(new Error("网络错误"));
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const file = new File(["test"], "test.png", { type: "image/png" });
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleFileUpload(event);
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isUploading).toBe(false);
    });
  });

  describe("clearImage", () => {
    it("应清除生成的图片", () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      act(() => { result.current.setGeneratedImage("https://img.example.com/test.png"); });
      expect(result.current.generatedImage).toBe("https://img.example.com/test.png");

      act(() => { result.current.clearImage(); });
      expect(result.current.generatedImage).toBe(null);
    });
  });

  describe("setImageSize", () => {
    it("应更新图片尺寸", () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      act(() => { result.current.setImageSize("1024x1024"); });
      expect(result.current.imageSize).toBe("1024x1024");
    });
  });

  describe("handleAnalyzeFileUpload", () => {
    it("上传成功后应触发图片分析并更新角色属性", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const file = new File(["test"], "test.png", { type: "image/png" });
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleAnalyzeFileUpload(event);
      });

      expect(mockUploadFile).toHaveBeenCalled();
      expect(mockAnalyzeImage).toHaveBeenCalledWith(
        "https://img.example.com/uploaded.png",
        "character",
        undefined,
        expect.objectContaining({ providerId: "test-provider", modelId: "test-model" }),
      );
      expect(props.setCurrentCharacter).toHaveBeenCalledWith(expect.any(Function), true);
      expect(props.addAssetToLibrary).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
      expect(result.current.isAnalyzing).toBe(false);
    });

    it("分析失败时应显示错误", async () => {
      mockAnalyzeImage.mockResolvedValueOnce({ success: false, error: "分析失败" });
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const file = new File(["test"], "test.png", { type: "image/png" });
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleAnalyzeFileUpload(event);
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isAnalyzing).toBe(false);
    });

    it("分析抛出异常时应显示错误", async () => {
      mockAnalyzeImage.mockRejectedValueOnce(new Error("网络错误"));
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const file = new File(["test"], "test.png", { type: "image/png" });
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleAnalyzeFileUpload(event);
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isAnalyzing).toBe(false);
    });

    it("上传失败时应显示错误", async () => {
      mockUploadFile.mockResolvedValueOnce({ success: false, error: "上传失败" });
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const file = new File(["test"], "test.png", { type: "image/png" });
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleAnalyzeFileUpload(event);
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("无文件时不应执行任何操作", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useCharacterImage(props));

      const event = { target: { files: [] } } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleAnalyzeFileUpload(event);
      });

      expect(mockUploadFile).not.toHaveBeenCalled();
    });
  });
});
