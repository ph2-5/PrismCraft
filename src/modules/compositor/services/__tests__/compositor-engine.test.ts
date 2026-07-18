/**
 * P1-12 测试覆盖 — compositor/services/compositor-engine
 *
 * 覆盖 P1-8 修复的取消信号传递：
 * - composeImage 未传入 signal 时正常执行
 * - composeImage 在多个 await 检查点检查 signal.aborted
 * - composeImage 在图像生成阶段用 withAbortSignal 包装，支持立即取消
 * - signal 已 aborted 时立即抛错
 *
 * 覆盖其他路径：
 * - 角色不存在 → 抛错
 * - 图像生成失败 → 抛错
 * - 图像生成返回空 URL → 抛错
 * - 持久化失败不阻塞返回
 * - buildCompositorPrompt 仅拼装 prompt
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 使用 vi.hoisted 确保 mock 变量在 vi.mock factory 中可用（vi.mock 会被提升到文件顶部）
const {
  mockCreateAsset,
  mockGeneratePrompt,
  mockCharStorage,
  mockSceneStorage,
  mockPropStorage,
  mockVariantStorage,
  mockImageProvider,
} = vi.hoisted(() => ({
  mockCreateAsset: vi.fn(),
  mockGeneratePrompt: vi.fn(),
  mockCharStorage: { getCharacterById: vi.fn() },
  mockSceneStorage: { getSceneById: vi.fn() },
  mockPropStorage: { getPropById: vi.fn() },
  mockVariantStorage: { getVariantById: vi.fn() },
  mockImageProvider: { generateImage: vi.fn() },
}));

vi.mock("@/modules/asset", () => ({
  createAsset: (...args: unknown[]) => mockCreateAsset(...args),
}));

vi.mock("@/shared-logic/prompt", () => ({
  generateCompositorPrompt: (...args: unknown[]) => mockGeneratePrompt(...args),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  ),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    characterStorage: mockCharStorage,
    sceneStorage: mockSceneStorage,
    propStorage: mockPropStorage,
    characterVariantStorage: mockVariantStorage,
    imageProvider: mockImageProvider,
  },
}));

import { composeImage, buildCompositorPrompt, getCompositorErrorMessage } from "../compositor-engine";

const baseInput = {
  characterId: "c1",
  propIds: [],
  extraPrompt: "",
  provider: "openai",
  modelId: "dall-e-3",
};

describe("compositor-engine — composeImage 取消信号（P1-8）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCharStorage.getCharacterById.mockResolvedValue({
      id: "c1",
      name: "张三",
      gender: "male",
      age: 25,
      appearance: { hairColor: "black" },
    });
    mockGeneratePrompt.mockReturnValue("english prompt");
    mockImageProvider.generateImage.mockResolvedValue({
      success: true,
      data: { imageUrl: "/img.png" },
    });
    mockCreateAsset.mockResolvedValue({ id: "asset-1" });
  });

  it("未传入 signal 时正常执行", async () => {
    const result = await composeImage(baseInput);

    expect(result.imageUrl).toBe("/img.png");
    expect(result.prompt).toBe("english prompt");
    expect(result.id).toBe("asset-1");
    expect(mockImageProvider.generateImage).toHaveBeenCalledTimes(1);
  });

  it("未传入 signal 时 options 默认为空对象", async () => {
    const result = await composeImage(baseInput, {});

    expect(result.imageUrl).toBe("/img.png");
  });

  it("角色不存在时抛错", async () => {
    mockCharStorage.getCharacterById.mockResolvedValue(null);

    await expect(composeImage(baseInput)).rejects.toThrow("角色不存在");
  });

  it("P1-8: 已 aborted 的 signal 立即抛错（加载角色前）", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      composeImage(baseInput, { signal: controller.signal }),
    ).rejects.toThrow("已取消");

    // 不应该继续调用 generateImage
    expect(mockImageProvider.generateImage).not.toHaveBeenCalled();
  });

  it("P1-8: 加载角色后但图像生成前 aborted → 抛错", async () => {
    const controller = new AbortController();

    // 让 getCharacterById 完成，但延迟 generateImage 以便在中间 abort
    mockImageProvider.generateImage.mockImplementation(() => {
      controller.abort();
      return new Promise(() => {}); // 永不 resolve
    });

    await expect(
      composeImage(baseInput, { signal: controller.signal }),
    ).rejects.toThrow();

    expect(mockCharStorage.getCharacterById).toHaveBeenCalled();
  });

  it("P1-8: 图像生成中 abort → withAbortSignal 立即 reject", async () => {
    const controller = new AbortController();

    // generateImage 返回一个 pending promise（模拟慢请求）
    mockImageProvider.generateImage.mockImplementation(() => {
      return new Promise(() => {}); // 永不 resolve
    });

    // 在 generateImage 被调用后立即 abort
    const promise = composeImage(baseInput, { signal: controller.signal });
    // 让事件循环前进一帧，让 generateImage 被调用
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();

    await expect(promise).rejects.toThrow("已取消");
  });

  it("图像生成失败 → 抛错", async () => {
    mockImageProvider.generateImage.mockResolvedValue({
      success: false,
      error: "API rate limit",
    });

    await expect(composeImage(baseInput)).rejects.toThrow("API rate limit");
  });

  it("图像生成返回空 URL → 抛错", async () => {
    mockImageProvider.generateImage.mockResolvedValue({
      success: true,
      data: { imageUrl: "" },
    });

    await expect(composeImage(baseInput)).rejects.toThrow("空 URL");
  });

  it("持久化失败不阻塞返回", async () => {
    mockCreateAsset.mockRejectedValue(new Error("DB error"));

    // 不应该抛错，应该正常返回（仅记录日志）
    const result = await composeImage(baseInput);

    expect(result.imageUrl).toBe("/img.png");
    // id 回退到时间戳生成的格式
    expect(result.id).toMatch(/^compositor-\d+-\w+$/);
  });

  it("sceneId 提供但场景不存在 → 记录 warn，继续执行", async () => {
    mockSceneStorage.getSceneById.mockResolvedValue(null);

    const result = await composeImage({ ...baseInput, sceneId: "s1" });

    expect(result.imageUrl).toBe("/img.png");
  });

  it("propIds 提供但部分道具不存在 → 跳过", async () => {
    mockPropStorage.getPropById
      .mockResolvedValueOnce({ id: "p1", name: "剑", type: "weapon", tags: [] })
      .mockResolvedValueOnce(null); // p2 不存在

    const result = await composeImage({ ...baseInput, propIds: ["p1", "p2"] });

    expect(result.imageUrl).toBe("/img.png");
  });

  it("characterVariantId 提供但变体不存在 → 记录 warn，使用基础角色", async () => {
    mockVariantStorage.getVariantById.mockResolvedValue(null);

    const result = await composeImage({ ...baseInput, characterVariantId: "v1" });

    expect(result.imageUrl).toBe("/img.png");
  });

  it("characterVariantId 提供但变体不属于该角色 → 忽略变体", async () => {
    mockVariantStorage.getVariantById.mockResolvedValue({
      id: "v1",
      characterId: "other-character", // 不匹配
    });

    const result = await composeImage({ ...baseInput, characterVariantId: "v1" });

    expect(result.imageUrl).toBe("/img.png");
  });
});

describe("compositor-engine — buildCompositorPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCharStorage.getCharacterById.mockResolvedValue({
      id: "c1",
      name: "张三",
    });
    mockGeneratePrompt.mockReturnValue("preview prompt");
  });

  it("仅拼装 prompt（不调用模型）", async () => {
    const result = await buildCompositorPrompt(baseInput);

    expect(result).toBe("preview prompt");
    expect(mockImageProvider.generateImage).not.toHaveBeenCalled();
    expect(mockCreateAsset).not.toHaveBeenCalled();
  });

  it("角色不存在时抛错", async () => {
    mockCharStorage.getCharacterById.mockResolvedValue(null);

    await expect(buildCompositorPrompt(baseInput)).rejects.toThrow("角色不存在");
  });

  it("角色不存在时抛错（i18n 消息包含 ID）", async () => {
    mockCharStorage.getCharacterById.mockResolvedValue(null);

    await expect(buildCompositorPrompt({ ...baseInput, characterId: "c999" }))
      .rejects.toThrow("角色不存在：c999");
  });
});

describe("compositor-engine — getCompositorErrorMessage", () => {
  it("Error 实例返回 message", () => {
    const result = getCompositorErrorMessage(new Error("test error"));
    expect(result).toBe("test error");
  });

  it("字符串错误原样返回", () => {
    const result = getCompositorErrorMessage("string error");
    expect(result).toBe("string error");
  });

  it("其他类型转字符串", () => {
    expect(getCompositorErrorMessage(42)).toBe("42");
    expect(getCompositorErrorMessage(null)).toBe("null");
  });
});
