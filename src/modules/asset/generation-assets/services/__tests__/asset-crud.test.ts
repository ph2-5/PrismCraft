import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GenerationAsset } from "@/domain/schemas";

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getAssetsByType: vi.fn(),
    getAssetsByProject: vi.fn(),
    getAssetsByStoryBeat: vi.fn(),
    getAssetById: vi.fn(),
    createAsset: vi.fn(),
    updateAsset: vi.fn(),
    deleteAsset: vi.fn(),
    deleteUnreferencedAssets: vi.fn(),
  },
}));

vi.mock("@/infrastructure/di", () => ({
  container: { generationAssetStorage: mockStorage },
}));

import {
  listAssetsByType,
  listAssetsByProject,
  listAssetsByBeat,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  deleteUnreferencedAssets,
  getReferenceInfo,
} from "../asset-crud";

function makeAsset(overrides: Partial<GenerationAsset> = {}): GenerationAsset {
  return {
    id: "asset-1",
    type: "keyframe",
    sourceType: "ai_generated",
    url: "https://example.com/img.png",
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAssetsByType", () => {
  it("应调用 storage.getAssetsByType", async () => {
    const assets = [makeAsset()];
    mockStorage.getAssetsByType.mockResolvedValue(assets);
    const result = await listAssetsByType("keyframe");
    expect(mockStorage.getAssetsByType).toHaveBeenCalledWith("keyframe");
    expect(result).toEqual(assets);
  });
});

describe("listAssetsByProject", () => {
  it("应调用 storage.getAssetsByProject", async () => {
    mockStorage.getAssetsByProject.mockResolvedValue([]);
    await listAssetsByProject("proj-1");
    expect(mockStorage.getAssetsByProject).toHaveBeenCalledWith("proj-1");
  });
});

describe("listAssetsByBeat", () => {
  it("应调用 storage.getAssetsByStoryBeat", async () => {
    mockStorage.getAssetsByStoryBeat.mockResolvedValue([]);
    await listAssetsByBeat("beat-1");
    expect(mockStorage.getAssetsByStoryBeat).toHaveBeenCalledWith("beat-1");
  });
});

describe("getAsset", () => {
  it("应调用 storage.getAssetById", async () => {
    const asset = makeAsset();
    mockStorage.getAssetById.mockResolvedValue(asset);
    const result = await getAsset("asset-1");
    expect(mockStorage.getAssetById).toHaveBeenCalledWith("asset-1");
    expect(result).toEqual(asset);
  });

  it("不存在时应返回 null", async () => {
    mockStorage.getAssetById.mockResolvedValue(null);
    const result = await getAsset("missing");
    expect(result).toBeNull();
  });
});

describe("createAsset", () => {
  it("应生成 gen-asset- 前缀的 ID 并创建", async () => {
    mockStorage.createAsset.mockResolvedValue(undefined);
    const created = makeAsset({ id: "gen-asset-new" });
    mockStorage.getAssetById.mockResolvedValue(created);

    const result = await createAsset({ type: "keyframe", sourceType: "ai_generated", url: "https://example.com/img.png" });

    const call = mockStorage.createAsset.mock.calls[0]![0] as { id: string };
    expect(call.id).toMatch(/^gen-asset-/);
    expect(result.id).toBe("gen-asset-new");
  });

  it("创建后获取失败应抛出异常", async () => {
    mockStorage.createAsset.mockResolvedValue(undefined);
    mockStorage.getAssetById.mockResolvedValue(null);
    await expect(createAsset({ type: "video", sourceType: "ai_generated", url: "url" })).rejects.toThrow();
  });
});

describe("updateAsset", () => {
  it("应调用 storage.updateAsset", async () => {
    mockStorage.updateAsset.mockResolvedValue(undefined);
    await updateAsset("asset-1", { prompt: "new prompt" });
    expect(mockStorage.updateAsset).toHaveBeenCalledWith("asset-1", { prompt: "new prompt" });
  });
});

describe("deleteAsset", () => {
  it("应调用 storage.deleteAsset", async () => {
    mockStorage.deleteAsset.mockResolvedValue(undefined);
    await deleteAsset("asset-1");
    expect(mockStorage.deleteAsset).toHaveBeenCalledWith("asset-1");
  });
});

describe("deleteUnreferencedAssets", () => {
  it("应返回删除数量", async () => {
    mockStorage.deleteUnreferencedAssets.mockResolvedValue(5);
    const count = await deleteUnreferencedAssets();
    expect(count).toBe(5);
  });
});

describe("getReferenceInfo", () => {
  it("有 storyBeatId 时应返回 StoryBeat 引用", () => {
    const asset = makeAsset({ storyBeatId: "beat-1" });
    expect(getReferenceInfo(asset)).toBe("StoryBeat: beat-1");
  });

  it("有 characterId 时应返回 Character 引用", () => {
    const asset = makeAsset({ characterId: "char-1" });
    expect(getReferenceInfo(asset)).toBe("Character: char-1");
  });

  it("无任何引用时应返回 null", () => {
    const asset = makeAsset();
    expect(getReferenceInfo(asset)).toBeNull();
  });

  it("有 projectId 时应返回 Project 引用", () => {
    const asset = makeAsset({ projectId: "proj-1" });
    expect(getReferenceInfo(asset)).toBe("Project: proj-1");
  });
});
