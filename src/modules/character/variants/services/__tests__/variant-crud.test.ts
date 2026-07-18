/**
 * P1-12 测试覆盖 — character/variants/services/variant-crud
 *
 * 覆盖 P1-9 修复的补偿事务逻辑：
 * - createVariant 成功 + isDefault=false → 不调用 setDefaultVariant
 * - createVariant 成功 + isDefault=true + setDefaultVariant 成功 → 返回 variant
 * - createVariant 成功 + isDefault=true + setDefaultVariant 失败 → 删除 variant + 抛错
 * - createVariant 成功 + isDefault=true + setDefaultVariant 失败 + 删除 variant 也失败
 *   → 记录日志 + 抛原始错误（不丢失原始错误信息）
 * - createVariant 本身失败 → 直接抛错（不调用 setDefaultVariant）
 *
 * 覆盖 createVariantFromCompositorAsset：
 * - 成功路径（调用 createVariant 并传入 compositorPrompt metadata）
 * - createVariant 失败时记录日志并 rethrow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 使用 vi.hoisted 确保 mock 变量在 vi.mock factory 中可用（vi.mock 会被提升到文件顶部）
const { mockStorage, mockErrorLog, mockErrorWarn } = vi.hoisted(() => ({
  mockStorage: {
    getVariantsForCharacter: vi.fn(),
    getAllVariants: vi.fn(),
    getVariantById: vi.fn(),
    getDefaultVariant: vi.fn(),
    createVariant: vi.fn(),
    updateVariant: vi.fn(),
    deleteVariant: vi.fn(),
    setDefaultVariant: vi.fn(),
    updateVariantImage: vi.fn(),
    migrateOutfitsToVariants: vi.fn(),
  },
  mockErrorLog: vi.fn(),
  mockErrorWarn: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    characterVariantStorage: mockStorage,
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    error: (...args: unknown[]) => mockErrorLog(...args),
    warn: (...args: unknown[]) => mockErrorWarn(...args),
  },
}));

import {
  createVariant,
  deleteVariant,
  setDefaultVariant,
  createVariantFromCompositorAsset,
  listVariantsForCharacter,
  getVariantById,
} from "../variant-crud";

describe("variant-crud — createVariant 补偿事务（P1-9）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isDefault=false → 成功创建，不调用 setDefaultVariant", async () => {
    const created = { id: "v1", characterId: "c1", name: "变体1", isDefault: false };
    mockStorage.createVariant.mockResolvedValue(created);

    const result = await createVariant({
      characterId: "c1",
      name: "变体1",
      description: "",
      promptFragment: "",
      isDefault: false,
      isCanonical: false,
      metadata: {},
    });

    expect(result).toEqual(created);
    expect(mockStorage.createVariant).toHaveBeenCalledTimes(1);
    expect(mockStorage.setDefaultVariant).not.toHaveBeenCalled();
    expect(mockStorage.deleteVariant).not.toHaveBeenCalled();
  });

  it("isDefault=true + setDefaultVariant 成功 → 返回 variant", async () => {
    const created = { id: "v1", characterId: "c1", name: "变体1", isDefault: true };
    mockStorage.createVariant.mockResolvedValue(created);
    mockStorage.setDefaultVariant.mockResolvedValue(undefined);

    const result = await createVariant({
      characterId: "c1",
      name: "变体1",
      description: "",
      promptFragment: "",
      isDefault: true,
      isCanonical: false,
      metadata: {},
    });

    expect(result).toEqual(created);
    expect(mockStorage.createVariant).toHaveBeenCalledTimes(1);
    expect(mockStorage.setDefaultVariant).toHaveBeenCalledWith("c1", "v1");
    expect(mockStorage.deleteVariant).not.toHaveBeenCalled();
  });

  it("P1-9: isDefault=true + setDefaultVariant 失败 → 删除 variant + 抛原始错误", async () => {
    const created = { id: "v1", characterId: "c1", name: "变体1", isDefault: true };
    const setDefaultError = new Error("setDefault DB error");
    mockStorage.createVariant.mockResolvedValue(created);
    mockStorage.setDefaultVariant.mockRejectedValue(setDefaultError);
    mockStorage.deleteVariant.mockResolvedValue(undefined);

    await expect(
      createVariant({
        characterId: "c1",
        name: "变体1",
        description: "",
        promptFragment: "",
        isDefault: true,
        isCanonical: false,
        metadata: {},
      }),
    ).rejects.toThrow("setDefault DB error");

    // 补偿：删除刚创建的 variant
    expect(mockStorage.deleteVariant).toHaveBeenCalledWith("v1");
    // 不应该记录 error 日志（因为补偿成功）
    expect(mockErrorLog).not.toHaveBeenCalled();
  });

  it("P1-9: 补偿删除也失败 → 记录 VariantCreateRollbackFailed + 抛原始错误", async () => {
    const created = { id: "v1", characterId: "c1", name: "变体1", isDefault: true };
    const setDefaultError = new Error("setDefault DB error");
    const cleanupError = new Error("delete DB error");
    mockStorage.createVariant.mockResolvedValue(created);
    mockStorage.setDefaultVariant.mockRejectedValue(setDefaultError);
    mockStorage.deleteVariant.mockRejectedValue(cleanupError);

    await expect(
      createVariant({
        characterId: "c1",
        name: "变体1",
        description: "",
        promptFragment: "",
        isDefault: true,
        isCanonical: false,
        metadata: {},
      }),
    ).rejects.toThrow("setDefault DB error");

    // 补偿失败：记录日志
    expect(mockErrorLog).toHaveBeenCalledTimes(1);
    const logArg = mockErrorLog.mock.calls[0]![0];
    expect(logArg).toHaveProperty("code", "VariantCreateRollbackFailed");
    expect(logArg).toHaveProperty("cause", cleanupError);
  });

  it("createVariant 本身失败 → 直接抛错，不调用 setDefaultVariant", async () => {
    const createError = new Error("create DB error");
    mockStorage.createVariant.mockRejectedValue(createError);

    await expect(
      createVariant({
        characterId: "c1",
        name: "变体1",
        description: "",
        promptFragment: "",
        isDefault: true,
        isCanonical: false,
        metadata: {},
      }),
    ).rejects.toThrow("create DB error");

    expect(mockStorage.setDefaultVariant).not.toHaveBeenCalled();
    expect(mockStorage.deleteVariant).not.toHaveBeenCalled();
  });
});

describe("variant-crud — 薄封装函数", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listVariantsForCharacter 委托给 storage", async () => {
    const variants = [{ id: "v1" }, { id: "v2" }];
    mockStorage.getVariantsForCharacter.mockResolvedValue(variants);

    const result = await listVariantsForCharacter("c1");

    expect(mockStorage.getVariantsForCharacter).toHaveBeenCalledWith("c1");
    expect(result).toEqual(variants);
  });

  it("getVariantById 委托给 storage", async () => {
    const variant = { id: "v1", characterId: "c1" };
    mockStorage.getVariantById.mockResolvedValue(variant);

    const result = await getVariantById("v1");

    expect(mockStorage.getVariantById).toHaveBeenCalledWith("v1");
    expect(result).toEqual(variant);
  });

  it("getVariantById 返回 null（未找到）", async () => {
    mockStorage.getVariantById.mockResolvedValue(null);

    const result = await getVariantById("nonexistent");

    expect(result).toBeNull();
  });

  it("deleteVariant 委托给 storage", async () => {
    mockStorage.deleteVariant.mockResolvedValue(undefined);
    await deleteVariant("v1");
    expect(mockStorage.deleteVariant).toHaveBeenCalledWith("v1");
  });

  it("setDefaultVariant 委托给 storage", async () => {
    mockStorage.setDefaultVariant.mockResolvedValue(undefined);
    await setDefaultVariant("c1", "v1");
    expect(mockStorage.setDefaultVariant).toHaveBeenCalledWith("c1", "v1");
  });
});

describe("variant-crud — createVariantFromCompositorAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功路径：从 Compositor 资产创建变体", async () => {
    const created = { id: "v1", characterId: "c1", name: "新变体" };
    mockStorage.createVariant.mockResolvedValue(created);

    const result = await createVariantFromCompositorAsset(
      "c1",
      { id: "asset1", url: "/img.png", prompt: "a character" },
      "新变体",
      { promptFragment: "red clothes", isDefault: false },
    );

    expect(result).toEqual(created);
    expect(mockStorage.createVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: "c1",
        name: "新变体",
        imageUrl: "/img.png",
        sourceCompositorAssetId: "asset1",
        promptFragment: "red clothes",
        metadata: { compositorPrompt: "a character" },
      }),
    );
  });

  it("无 options 时使用默认值", async () => {
    const created = { id: "v1", characterId: "c1", name: "新变体" };
    mockStorage.createVariant.mockResolvedValue(created);

    await createVariantFromCompositorAsset(
      "c1",
      { id: "asset1", url: "/img.png", prompt: "a character" },
      "新变体",
    );

    expect(mockStorage.createVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "",
        promptFragment: "",
        isDefault: false,
        isCanonical: false,
        metadata: { compositorPrompt: "a character" },
      }),
    );
  });

  it("createVariant 失败时记录 warn 日志并 rethrow", async () => {
    const error = new Error("DB error");
    mockStorage.createVariant.mockRejectedValue(error);

    await expect(
      createVariantFromCompositorAsset(
        "c1",
        { id: "asset1", url: "/img.png", prompt: "a character" },
        "新变体",
      ),
    ).rejects.toThrow("DB error");

    expect(mockErrorWarn).toHaveBeenCalledTimes(1);
  });
});
