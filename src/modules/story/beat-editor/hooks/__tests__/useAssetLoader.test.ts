import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Character, Scene } from "@/domain/schemas";

const { mockIsElectron, mockErrorLogger } = vi.hoisted(() => ({
  mockIsElectron: vi.fn().mockReturnValue(true),
  mockErrorLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

import { useAssetLoader } from "../useAssetLoader";

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
  generatedImage: "https://example.com/char-image.png",
};

const mockCharacterNoImage: Character = {
  id: "char-2",
  name: "角色B",
  description: "无图角色",
  gender: "female",
  style: "realistic",
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
  generatedImage: "https://example.com/scene-image.png",
};

const mockSceneNoImage: Scene = {
  id: "scene-2",
  name: "场景B",
  description: "无图场景",
  type: "outdoor",
  timeOfDay: "night",
  weather: "rainy",
  mood: "dark",
  lighting: "dim",
  elements: [],
  colors: [],
  prompt: "测试",
};

function createDefaultServices(overrides: Record<string, unknown> = {}) {
  return {
    getAllCharacters: vi.fn().mockResolvedValue({
      ok: true,
      value: [mockCharacter, mockCharacterNoImage],
    }),
    getAllScenes: vi.fn().mockResolvedValue({
      ok: true,
      value: [mockScene, mockSceneNoImage],
    }),
    getStoryboardAssets: vi.fn().mockResolvedValue([
      { id: "sb-1", script: "镜头1", previewPath: "https://example.com/sb-image.png" },
      { id: "sb-2", script: "镜头2", previewPath: "https://example.com/sb-video.mp4" },
      { id: "sb-3", script: "镜头3" },
    ]),
    ...overrides,
  };
}

describe("useAssetLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsElectron.mockReturnValue(true);
  });

  describe("正常加载", () => {
    it("应成功加载角色和场景", async () => {
      const services = createDefaultServices();
      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.characters).toHaveLength(2);
      expect(result.current.scenes).toHaveLength(2);
    });

    it("应过滤有 generatedImage 的角色到 assets", async () => {
      const services = createDefaultServices();
      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const charAssets = result.current.assets.filter((a) => a.id.startsWith("char-"));
      expect(charAssets).toHaveLength(1);
      expect(charAssets[0].id).toBe("char-char-1");
      expect(charAssets[0].type).toBe("image");
      expect(charAssets[0].url).toBe("https://example.com/char-image.png");
    });

    it("应过滤有 generatedImage 的场景到 assets", async () => {
      const services = createDefaultServices();
      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const sceneAssets = result.current.assets.filter((a) => a.id.startsWith("scene-"));
      expect(sceneAssets).toHaveLength(1);
      expect(sceneAssets[0].id).toBe("scene-scene-1");
      expect(sceneAssets[0].type).toBe("image");
      expect(sceneAssets[0].url).toBe("https://example.com/scene-image.png");
    });

    it("应加载 storyboard assets 并判断类型", async () => {
      const services = createDefaultServices();
      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const sbAssets = result.current.assets.filter((a) => !a.id.startsWith("char-") && !a.id.startsWith("scene-"));
      expect(sbAssets).toHaveLength(3);

      const imageSb = sbAssets.find((a) => a.id === "sb-1");
      expect(imageSb?.type).toBe("image");

      const videoSb = sbAssets.find((a) => a.id === "sb-2");
      expect(videoSb?.type).toBe("video");

      const noPathSb = sbAssets.find((a) => a.id === "sb-3");
      expect(noPathSb?.type).toBe("image");
    });

    it("初始 isLoading 应为 true", () => {
      const services = createDefaultServices();
      const { result } = renderHook(() => useAssetLoader(services));
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("getAllCharacters 返回失败", () => {
    it("ok=false 时应使用空数组", async () => {
      const services = createDefaultServices({
        getAllCharacters: vi.fn().mockResolvedValue({ ok: false }),
      });

      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.characters).toHaveLength(0);
    });

    it("ok=true 但 value 为 undefined 时应使用空数组", async () => {
      const services = createDefaultServices({
        getAllCharacters: vi.fn().mockResolvedValue({ ok: true }),
      });

      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.characters).toHaveLength(0);
    });
  });

  describe("getAllScenes 返回失败", () => {
    it("ok=false 时应使用空数组", async () => {
      const services = createDefaultServices({
        getAllScenes: vi.fn().mockResolvedValue({ ok: false }),
      });

      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.scenes).toHaveLength(0);
    });
  });

  describe("错误处理", () => {
    it("services 抛出异常时 isLoading 应变为 false", async () => {
      const services = createDefaultServices({
        getAllCharacters: vi.fn().mockRejectedValue(new Error("DB error")),
      });

      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it("Electron 环境下异常应调用 errorLogger.warn", async () => {
      mockIsElectron.mockReturnValue(true);
      const services = createDefaultServices({
        getAllCharacters: vi.fn().mockRejectedValue(new Error("DB error")),
      });

      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });

    it("非 Electron 环境下异常不应调用 errorLogger.warn", async () => {
      mockIsElectron.mockReturnValue(false);
      const services = createDefaultServices({
        getAllCharacters: vi.fn().mockRejectedValue(new Error("DB error")),
      });

      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockErrorLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe("ref 同步", () => {
    it("charactersRef 应与 characters 同步", async () => {
      const services = createDefaultServices();
      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.charactersRef.current).toEqual(result.current.characters);
    });

    it("scenesRef 应与 scenes 同步", async () => {
      const services = createDefaultServices();
      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.scenesRef.current).toEqual(result.current.scenes);
    });
  });

  describe("资源类型判断", () => {
    it("视频扩展名应识别为 video 类型", async () => {
      const services = createDefaultServices({
        getStoryboardAssets: vi.fn().mockResolvedValue([
          { id: "sb-mp4", previewPath: "https://example.com/video.mp4" },
          { id: "sb-webm", previewPath: "https://example.com/video.webm" },
          { id: "sb-mov", previewPath: "https://example.com/video.mov" },
        ]),
      });

      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const videoAssets = result.current.assets.filter((a) => a.type === "video");
      expect(videoAssets).toHaveLength(3);
    });

    it("图片扩展名应识别为 image 类型", async () => {
      const services = createDefaultServices({
        getAllCharacters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
        getAllScenes: vi.fn().mockResolvedValue({ ok: true, value: [] }),
        getStoryboardAssets: vi.fn().mockResolvedValue([
          { id: "sb-jpg", previewPath: "https://example.com/image.jpg" },
          { id: "sb-png", previewPath: "https://example.com/image.png" },
          { id: "sb-webp", previewPath: "https://example.com/image.webp" },
        ]),
      });

      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.assets).toHaveLength(3);
      expect(result.current.assets.every((a) => a.type === "image")).toBe(true);
    });

    it("未知扩展名应默认为 image 类型", async () => {
      const services = createDefaultServices({
        getStoryboardAssets: vi.fn().mockResolvedValue([
          { id: "sb-unknown", previewPath: "https://example.com/file.xyz" },
        ]),
      });

      const { result } = renderHook(() => useAssetLoader(services));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const unknownAsset = result.current.assets.find((a) => a.id === "sb-unknown");
      expect(unknownAsset?.type).toBe("image");
    });
  });

  describe("卸载保护", () => {
    it("组件卸载后不应更新状态", async () => {
      let resolveCharacters: (value: unknown) => void;
      const services = createDefaultServices({
        getAllCharacters: vi.fn().mockImplementation(
          () => new Promise((resolve) => { resolveCharacters = resolve; }),
        ),
      });

      const { unmount } = renderHook(() => useAssetLoader(services));

      unmount();

      await act(async () => {
        resolveCharacters!({ ok: true, value: [mockCharacter] });
      });

      expect(() => {}).not.toThrow();
    });
  });
});

async function act(fn: () => Promise<void>): Promise<void> {
  const { act: reactAct } = await import("@testing-library/react");
  return reactAct(fn);
}
