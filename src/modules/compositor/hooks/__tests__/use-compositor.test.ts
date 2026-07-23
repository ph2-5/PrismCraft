/**
 * useCompositor Hook 测试 — PrismCraft 第四章改造
 *
 * 覆盖 12+ actions 状态机：
 *   - 初始状态（idle / 空图层）
 *   - 图层操作（addLayer / removeLayer / selectLayer / moveLayer / updateLayerScale / clearCanvas）
 *   - extraPrompt 编辑
 *   - buildPrompt（预览 prompt，不调用模型）
 *   - generate 流程（idle → building-prompt → generating → saving → success / error）
 *   - generate 取消（AbortSignal）
 *   - loadPreset / reset
 *
 * 参考：compositor-engine.test.ts 的 vi.hoisted + vi.mock 模式
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Character, Scene, Prop } from "@/domain/schemas";
import type { CompositorResult, CompositorPreset } from "../../domain/compositor.schema";

// vi.hoisted 确保 mock 变量在 vi.mock factory 中可用（vi.mock 会被提升到文件顶部）
const {
  mockComposeImage,
  mockBuildCompositorPrompt,
  mockGetCompositorErrorMessage,
} = vi.hoisted(() => ({
  mockComposeImage: vi.fn(),
  mockBuildCompositorPrompt: vi.fn(),
  mockGetCompositorErrorMessage: vi.fn(),
}));

vi.mock("../../services/compositor-engine", () => ({
  composeImage: (...args: unknown[]) => mockComposeImage(...args),
  buildCompositorPrompt: (...args: unknown[]) => mockBuildCompositorPrompt(...args),
  getCompositorErrorMessage: (...args: unknown[]) => mockGetCompositorErrorMessage(...args),
}));

import { useCompositor } from "../use-compositor";

// ---- 测试数据 ----
const mockCharacter: Character = {
  id: "char-1",
  name: "Alice",
  description: "A brave hero",
  gender: "female",
  style: "anime",
  personality: ["brave"],
  appearance: {
    hairColor: "blonde",
    hairStyle: "long",
    eyeColor: "blue",
    height: "",
    build: "",
    clothing: "",
  },
  prompt: "a brave hero",
} as Character;

const mockCharacter2: Character = {
  id: "char-2",
  name: "Bob",
  description: "A wise sage",
  gender: "male",
  style: "realistic",
  personality: ["wise"],
  appearance: {
    hairColor: "black",
    hairStyle: "short",
    eyeColor: "brown",
    height: "",
    build: "",
    clothing: "",
  },
  prompt: "a wise sage",
} as Character;

const mockScene: Scene = {
  id: "scene-1",
  name: "Forest",
  description: "A dark forest",
  type: "outdoor",
  timeOfDay: "night",
  weather: "rainy",
  mood: "mysterious",
  lighting: "dim",
  elements: ["trees"],
  colors: ["dark green"],
  prompt: "a dark forest",
} as Scene;

const mockScene2: Scene = {
  id: "scene-2",
  name: "Castle",
  description: "An ancient castle",
  type: "indoor",
  timeOfDay: "day",
  weather: "clear",
  mood: "grand",
  lighting: "bright",
  elements: ["stone walls"],
  colors: ["gray"],
  prompt: "an ancient castle",
} as Scene;

const mockProp: Prop = {
  id: "prop-1",
  name: "Sword",
  type: "weapon",
  description: "A sharp sword",
  tags: ["sharp"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Prop;

const mockProp2: Prop = {
  id: "prop-2",
  name: "Shield",
  type: "accessory",
  description: "A sturdy shield",
  tags: ["sturdy"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Prop;

const mockCompositorResult: CompositorResult = {
  id: "asset-1",
  characterId: "char-1",
  propIds: [],
  imageUrl: "/img.png",
  prompt: "test prompt",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("useCompositor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComposeImage.mockResolvedValue(mockCompositorResult);
    mockBuildCompositorPrompt.mockResolvedValue("preview prompt");
    mockGetCompositorErrorMessage.mockImplementation((err: unknown) =>
      err instanceof Error ? err.message : String(err),
    );
  });

  // ============================================================
  // 初始状态
  // ============================================================
  describe("初始状态", () => {
    it("初始状态为 idle，空图层列表", () => {
      const { result } = renderHook(() => useCompositor());

      expect(result.current.status).toBe("idle");
      expect(result.current.layers).toEqual([]);
      expect(result.current.selectedLayerId).toBeNull();
      expect(result.current.extraPrompt).toBe("");
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.provider).toBeUndefined();
      expect(result.current.modelId).toBeUndefined();
      expect(result.current.resolution).toBeUndefined();
    });

    it("初始派生状态：characterLayer/sceneLayer/propLayers 均为空", () => {
      const { result } = renderHook(() => useCompositor());

      expect(result.current.characterLayer).toBeNull();
      expect(result.current.sceneLayer).toBeNull();
      expect(result.current.propLayers).toEqual([]);
    });

    it("初始 canGenerate 为 false（无角色图层）", () => {
      const { result } = renderHook(() => useCompositor());

      expect(result.current.canGenerate).toBe(false);
    });
  });

  // ============================================================
  // 图层操作
  // ============================================================
  describe("图层操作", () => {
    it("addCharacterLayer 添加角色图层", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });

      expect(result.current.layers).toHaveLength(1);
      expect(result.current.layers[0].type).toBe("character");
      expect(result.current.layers[0].id).toBe("char-1");
      expect(result.current.layers[0].name).toBe("Alice");
      expect(result.current.layers[0].emoji).toBe("👤");
      expect(result.current.characterLayer).not.toBeNull();
      expect(result.current.canGenerate).toBe(true);
    });

    it("addSceneLayer 添加场景图层", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addSceneLayer(mockScene);
      });

      expect(result.current.layers).toHaveLength(1);
      expect(result.current.layers[0].type).toBe("scene");
      expect(result.current.layers[0].id).toBe("scene-1");
      expect(result.current.layers[0].emoji).toBe("🏞");
      expect(result.current.sceneLayer).not.toBeNull();
    });

    it("addPropLayer 添加道具图层", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addPropLayer(mockProp);
      });

      expect(result.current.layers).toHaveLength(1);
      expect(result.current.layers[0].type).toBe("prop");
      expect(result.current.layers[0].id).toBe("prop-1");
      expect(result.current.layers[0].emoji).toBe("🎁");
      expect(result.current.propLayers).toHaveLength(1);
    });

    it("addCharacterLayer 角色图层单实例（新替换旧）", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });
      expect(result.current.layers).toHaveLength(1);
      expect(result.current.layers[0].id).toBe("char-1");

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter2);
      });

      expect(result.current.layers).toHaveLength(1);
      expect(result.current.layers[0].id).toBe("char-2");
      expect(result.current.layers[0].name).toBe("Bob");
    });

    it("addSceneLayer 场景图层单实例（新替换旧）", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addSceneLayer(mockScene);
      });
      expect(result.current.layers).toHaveLength(1);

      await act(async () => {
        result.current.addSceneLayer(mockScene2);
      });

      expect(result.current.layers).toHaveLength(1);
      expect(result.current.layers[0].id).toBe("scene-2");
      expect(result.current.layers[0].name).toBe("Castle");
    });

    it("addPropLayer 道具图层可多实例（按 id 去重）", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addPropLayer(mockProp);
      });
      await act(async () => {
        result.current.addPropLayer(mockProp2);
      });

      // 不同 id 的道具：均添加
      expect(result.current.layers).toHaveLength(2);
      expect(result.current.propLayers).toHaveLength(2);

      // 相同 id 的道具：去重，不重复添加
      await act(async () => {
        result.current.addPropLayer(mockProp);
      });

      expect(result.current.layers).toHaveLength(2);
      expect(result.current.propLayers).toHaveLength(2);
    });

    it("removeLayer 删除图层", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });
      const layerId = result.current.layers[0].layerId;

      await act(async () => {
        result.current.removeLayer(layerId);
      });

      expect(result.current.layers).toHaveLength(0);
      expect(result.current.characterLayer).toBeNull();
      expect(result.current.canGenerate).toBe(false);
    });

    it("removeLayer 删除选中的图层时清除选中状态", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });
      const layerId = result.current.layers[0].layerId;

      await act(async () => {
        result.current.selectLayer(layerId);
      });
      expect(result.current.selectedLayerId).toBe(layerId);

      await act(async () => {
        result.current.removeLayer(layerId);
      });

      expect(result.current.selectedLayerId).toBeNull();
    });

    it("removeLayer 删除非选中图层时保留选中状态", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
        result.current.addPropLayer(mockProp);
      });
      const propLayerId = result.current.propLayers[0].layerId;

      await act(async () => {
        result.current.selectLayer(propLayerId);
      });

      // 删除角色图层（非选中），选中状态应保留
      const charLayerId = result.current.characterLayer!.layerId;
      await act(async () => {
        result.current.removeLayer(charLayerId);
      });

      expect(result.current.selectedLayerId).toBe(propLayerId);
    });

    it("selectLayer 选中图层", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });
      const layerId = result.current.layers[0].layerId;

      await act(async () => {
        result.current.selectLayer(layerId);
      });
      expect(result.current.selectedLayerId).toBe(layerId);

      await act(async () => {
        result.current.selectLayer(null);
      });
      expect(result.current.selectedLayerId).toBeNull();
    });

    it("moveLayer 移动图层位置", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addPropLayer(mockProp);
      });
      const layerId = result.current.layers[0].layerId;

      await act(async () => {
        result.current.moveLayer(layerId, 100, 200);
      });

      expect(result.current.layers[0].x).toBe(100);
      expect(result.current.layers[0].y).toBe(200);
    });

    it("updateLayerScale 更新图层缩放", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addPropLayer(mockProp);
      });
      const layerId = result.current.layers[0].layerId;

      await act(async () => {
        result.current.updateLayerScale(layerId, 2.5);
      });

      expect(result.current.layers[0].scale).toBe(2.5);
    });

    it("clearCanvas 清空画布（图层、选中、状态、结果）", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
        result.current.addSceneLayer(mockScene);
        result.current.addPropLayer(mockProp);
      });
      const firstLayerId = result.current.layers[0].layerId;
      await act(async () => {
        result.current.selectLayer(firstLayerId);
      });

      await act(async () => {
        result.current.clearCanvas();
      });

      expect(result.current.layers).toHaveLength(0);
      expect(result.current.selectedLayerId).toBeNull();
      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      expect(result.current.result).toBeNull();
    });

    it("clearCanvas 保留 extraPrompt / provider / modelId / resolution", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.setExtraPrompt("keep me");
        result.current.setProvider("openai");
        result.current.setModelId("m1");
        result.current.setResolution("1024x1024");
        result.current.addCharacterLayer(mockCharacter);
      });

      await act(async () => {
        result.current.clearCanvas();
      });

      // clearCanvas 不清除 extraPrompt/provider/modelId/resolution（与 reset 的区别）
      expect(result.current.extraPrompt).toBe("keep me");
      expect(result.current.provider).toBe("openai");
      expect(result.current.modelId).toBe("m1");
      expect(result.current.resolution).toBe("1024x1024");
    });
  });

  // ============================================================
  // extraPrompt 编辑
  // ============================================================
  describe("extraPrompt 编辑", () => {
    it("setExtraPrompt 更新额外提示词", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.setExtraPrompt("custom prompt");
      });

      expect(result.current.extraPrompt).toBe("custom prompt");
    });

    it("setExtraPrompt 可清空", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.setExtraPrompt("text");
      });
      await act(async () => {
        result.current.setExtraPrompt("");
      });

      expect(result.current.extraPrompt).toBe("");
    });
  });

  // ============================================================
  // setProvider / setModelId / setResolution
  // ============================================================
  describe("setProvider / setModelId / setResolution", () => {
    it("setProvider 更新提供商", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.setProvider("openai");
      });

      expect(result.current.provider).toBe("openai");
    });

    it("setModelId 更新模型 ID", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.setModelId("dall-e-3");
      });

      expect(result.current.modelId).toBe("dall-e-3");
    });

    it("setResolution 更新分辨率", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.setResolution("1024x1024");
      });

      expect(result.current.resolution).toBe("1024x1024");
    });
  });

  // ============================================================
  // buildPrompt
  // ============================================================
  describe("buildPrompt", () => {
    it("无角色图层时抛错（t('compositor.errorSelectCharacter')）", async () => {
      const { result } = renderHook(() => useCompositor());

      await expect(result.current.buildPrompt()).rejects.toThrow("请先选择角色");
      expect(mockBuildCompositorPrompt).not.toHaveBeenCalled();
    });

    it("有角色图层时调用 buildCompositorPrompt 并返回结果", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });

      const prompt = await result.current.buildPrompt();

      expect(prompt).toBe("preview prompt");
      expect(mockBuildCompositorPrompt).toHaveBeenCalledTimes(1);
      expect(mockBuildCompositorPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: "char-1",
        }),
      );
    });

    it("buildPrompt 传入 sceneId 和 propIds", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
        result.current.addSceneLayer(mockScene);
        result.current.addPropLayer(mockProp);
        result.current.addPropLayer(mockProp2);
      });

      await result.current.buildPrompt();

      expect(mockBuildCompositorPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: "char-1",
          sceneId: "scene-1",
          propIds: ["prop-1", "prop-2"],
        }),
      );
    });

    it("buildPrompt 传入 extraPrompt（非空时）", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
        result.current.setExtraPrompt("extra text");
      });

      await result.current.buildPrompt();

      expect(mockBuildCompositorPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          extraPrompt: "extra text",
        }),
      );
    });

    it("buildPrompt 无 extraPrompt 时传 undefined", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });

      await result.current.buildPrompt();

      expect(mockBuildCompositorPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          extraPrompt: undefined,
        }),
      );
    });
  });

  // ============================================================
  // generate 流程
  // ============================================================
  describe("generate", () => {
    it("无角色图层时设置 error 状态（不调用 composeImage）", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("请先选择角色");
      expect(mockComposeImage).not.toHaveBeenCalled();
    });

    it("generate 成功时状态转为 success 并设置 result", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.status).toBe("success");
      expect(result.current.result).toEqual(mockCompositorResult);
      expect(result.current.error).toBeNull();
      expect(mockComposeImage).toHaveBeenCalledTimes(1);
    });

    it("generate 调用 composeImage 时传入正确的参数（含 signal）", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
        result.current.addSceneLayer(mockScene);
        result.current.addPropLayer(mockProp);
        result.current.setExtraPrompt("extra");
        result.current.setProvider("openai");
        result.current.setModelId("dall-e-3");
        result.current.setResolution("1024x1024");
      });

      await act(async () => {
        await result.current.generate();
      });

      expect(mockComposeImage).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: "char-1",
          sceneId: "scene-1",
          propIds: ["prop-1"],
          extraPrompt: "extra",
          provider: "openai",
          modelId: "dall-e-3",
          resolution: "1024x1024",
        }),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it("generate 中间状态经过 generating（composeImage pending 时）", async () => {
      // 使用 deferred 控制 composeImage 的 resolve 时机
      let resolveCompose!: (value: CompositorResult) => void;
      mockComposeImage.mockImplementation(
        () =>
          new Promise<CompositorResult>((resolve) => {
            resolveCompose = resolve;
          }),
      );

      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });

      expect(result.current.status).toBe("idle");

      let generatePromise: Promise<void>;
      await act(async () => {
        generatePromise = result.current.generate();
      });

      // composeImage pending 时状态应为 generating
      // （idle → building-prompt → generating，React 批处理后可观察到 generating）
      expect(result.current.status).toBe("generating");

      await act(async () => {
        resolveCompose(mockCompositorResult);
        await generatePromise;
      });

      expect(result.current.status).toBe("success");
      expect(result.current.result).toEqual(mockCompositorResult);
    });

    it("generate 失败时状态转为 error 并调用 getCompositorErrorMessage", async () => {
      mockComposeImage.mockRejectedValue(new Error("API rate limit"));
      mockGetCompositorErrorMessage.mockReturnValue("API rate limit");

      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("API rate limit");
      expect(result.current.result).toBeNull();
      expect(mockGetCompositorErrorMessage).toHaveBeenCalledWith(
        expect.any(Error),
      );
    });

    it("generate 可通过 clearCanvas 取消（AbortSignal 中止进行中的生成）", async () => {
      // mock composeImage 监听 signal：aborted 时 reject
      mockComposeImage.mockImplementation(
        (_input: unknown, options?: { signal?: AbortSignal }) =>
          new Promise<CompositorResult>((_resolve, reject) => {
            const signal = options?.signal;
            if (signal?.aborted) {
              reject(new Error("aborted"));
              return;
            }
            signal?.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            );
          }),
      );

      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });

      let generatePromise: Promise<void>;
      await act(async () => {
        generatePromise = result.current.generate();
      });

      // 确认生成进行中
      expect(result.current.status).toBe("generating");

      // clearCanvas 取消进行中的生成
      await act(async () => {
        result.current.clearCanvas();
        await generatePromise;
      });

      // 取消后状态应为 idle（clearCanvas 设置 + catch 块 signal.aborted 分支也设置 idle）
      expect(result.current.status).toBe("idle");
      // signal.aborted 时 catch 块提前返回，不调用 getCompositorErrorMessage
      expect(mockGetCompositorErrorMessage).not.toHaveBeenCalled();
    });

    it("generate 再次调用时取消上一次进行中的生成", async () => {
      // 记录每次 composeImage 调用时的 signal
      const signals: AbortSignal[] = [];
      let resolveSecond!: (value: CompositorResult) => void;

      mockComposeImage.mockImplementation(
        (_input: unknown, options?: { signal?: AbortSignal }) => {
          const signal = options?.signal;
          signals.push(signal!);
          // 第一次调用：监听 abort，aborted 时 reject（模拟 withAbortSignal 行为）
          if (signals.length === 1) {
            return new Promise<CompositorResult>((_resolve, reject) => {
              if (signal?.aborted) {
                reject(new Error("aborted"));
                return;
              }
              signal?.addEventListener(
                "abort",
                () => reject(new Error("aborted")),
                { once: true },
              );
            });
          }
          // 第二次调用：可控 resolve
          return new Promise<CompositorResult>((resolve) => {
            resolveSecond = resolve;
          });
        },
      );

      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });

      let firstGenerate: Promise<void>;
      await act(async () => {
        firstGenerate = result.current.generate();
      });

      expect(result.current.status).toBe("generating");
      expect(signals).toHaveLength(1);
      expect(signals[0].aborted).toBe(false);

      // 第二次 generate：取消第一次
      let secondGenerate: Promise<void>;
      await act(async () => {
        secondGenerate = result.current.generate();
      });

      // 第一次的 signal 应被 abort
      expect(signals[0].aborted).toBe(true);
      expect(signals).toHaveLength(2);

      // 等待第一次 generate 的 catch 块完成
      // 注意：第一次 catch 块因 signal.aborted 会 setStatus("idle")，
      // 这会覆盖第二次 generate 设置的 "generating"（hook 的实际竞态行为）
      await act(async () => {
        await firstGenerate;
      });

      // 完成第二次 generate
      await act(async () => {
        resolveSecond(mockCompositorResult);
        await secondGenerate;
      });

      // 第二次最终成功
      expect(result.current.status).toBe("success");
      expect(result.current.result).toEqual(mockCompositorResult);
      // signal.aborted 时 catch 块提前返回，不调用 getCompositorErrorMessage
      expect(mockGetCompositorErrorMessage).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // loadPreset
  // ============================================================
  describe("loadPreset", () => {
    it("loadPreset 清空图层并设置 extraPrompt", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
        result.current.addPropLayer(mockProp);
      });

      const preset: CompositorPreset = {
        id: "preset-1",
        name: "Preset 1",
        characterId: "char-1",
        propIds: ["prop-1"],
        extraPrompt: "preset prompt",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };

      await act(async () => {
        result.current.loadPreset(preset);
      });

      expect(result.current.layers).toHaveLength(0);
      expect(result.current.selectedLayerId).toBeNull();
      expect(result.current.extraPrompt).toBe("preset prompt");
    });

    it("loadPreset 无 extraPrompt 时设置为空字符串", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.setExtraPrompt("old text");
      });

      const preset: CompositorPreset = {
        id: "preset-1",
        name: "Preset 1",
        characterId: "char-1",
        propIds: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };

      await act(async () => {
        result.current.loadPreset(preset);
      });

      expect(result.current.extraPrompt).toBe("");
    });
  });

  // ============================================================
  // reset
  // ============================================================
  describe("reset", () => {
    it("reset 清空所有图层和状态", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
        result.current.addSceneLayer(mockScene);
        result.current.addPropLayer(mockProp);
        result.current.setExtraPrompt("text");
        result.current.setProvider("openai");
        result.current.setModelId("m1");
        result.current.setResolution("1024x1024");
      });
      const firstLayerId = result.current.layers[0].layerId;
      await act(async () => {
        result.current.selectLayer(firstLayerId);
      });

      await act(async () => {
        result.current.reset();
      });

      expect(result.current.layers).toHaveLength(0);
      expect(result.current.selectedLayerId).toBeNull();
      expect(result.current.extraPrompt).toBe("");
      expect(result.current.status).toBe("idle");
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.provider).toBeUndefined();
      expect(result.current.modelId).toBeUndefined();
      expect(result.current.resolution).toBeUndefined();
    });

    it("reset 在生成成功后可清空 result", async () => {
      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });
      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.status).toBe("success");
      expect(result.current.result).not.toBeNull();

      await act(async () => {
        result.current.reset();
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.result).toBeNull();
    });

    it("reset 在生成失败后可清空 error", async () => {
      mockComposeImage.mockRejectedValue(new Error("fail"));
      mockGetCompositorErrorMessage.mockReturnValue("fail");

      const { result } = renderHook(() => useCompositor());

      await act(async () => {
        result.current.addCharacterLayer(mockCharacter);
      });
      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("fail");

      await act(async () => {
        result.current.reset();
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
    });
  });
});
