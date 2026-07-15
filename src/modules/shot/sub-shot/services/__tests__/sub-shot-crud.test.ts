import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SubShot } from "@/domain/schemas";

// Mock storage for tracking calls — must use vi.hoisted for vi.mock factory
const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getSubShotsByBeatId: vi.fn(),
    getSubShotById: vi.fn(),
    createSubShot: vi.fn(),
    updateSubShot: vi.fn(),
    deleteSubShot: vi.fn(),
    deleteSubShotsByBeatId: vi.fn(),
    reorderSubShots: vi.fn(),
  },
}));

vi.mock("@/infrastructure/di", () => ({
  container: { subShotStorage: mockStorage },
}));

import {
  listSubShots,
  createSubShot,
  updateSubShot,
  deleteSubShot,
  deleteSubShotsByBeatId,
  moveSubShot,
  reorderSubShots,
} from "../sub-shot-crud";

function makeSubShot(overrides: Partial<SubShot> = {}): SubShot {
  return {
    id: "subshot-1",
    storyBeatId: "beat-1",
    sequence: 0,
    shotType: "medium",
    cameraMovement: "static",
    cameraAngle: "eye_level",
    duration: 5,
    description: "测试镜头",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listSubShots", () => {
  it("应调用 storage.getSubShotsByBeatId 并返回结果", async () => {
    const shots = [makeSubShot({ id: "s1" }), makeSubShot({ id: "s2" })];
    mockStorage.getSubShotsByBeatId.mockResolvedValue(shots);

    const result = await listSubShots("beat-1");

    expect(mockStorage.getSubShotsByBeatId).toHaveBeenCalledWith("beat-1");
    expect(result).toEqual(shots);
  });

  it("无数据时应返回空数组", async () => {
    mockStorage.getSubShotsByBeatId.mockResolvedValue([]);

    const result = await listSubShots("beat-1");

    expect(result).toEqual([]);
  });
});

describe("createSubShot", () => {
  it("应自动计算 sequence 为现有数量", async () => {
    const existing = [makeSubShot({ sequence: 0 }), makeSubShot({ sequence: 1 })];
    mockStorage.getSubShotsByBeatId.mockResolvedValue(existing);
    mockStorage.createSubShot.mockResolvedValue(undefined);
    const created = makeSubShot({ id: "subshot-new", sequence: 2 });
    mockStorage.getSubShotById.mockResolvedValue(created);

    const result = await createSubShot("beat-1", { description: "新镜头" });

    expect(mockStorage.createSubShot).toHaveBeenCalledWith(
      expect.objectContaining({
        storyBeatId: "beat-1",
        sequence: 2,
        description: "新镜头",
      }),
    );
    expect(result.id).toBe("subshot-new");
  });

  it("无现有 SubShot 时 sequence 应为 0", async () => {
    mockStorage.getSubShotsByBeatId.mockResolvedValue([]);
    mockStorage.createSubShot.mockResolvedValue(undefined);
    const created = makeSubShot({ id: "subshot-new", sequence: 0 });
    mockStorage.getSubShotById.mockResolvedValue(created);

    const result = await createSubShot("beat-1", {});

    expect(mockStorage.createSubShot).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: 0,
        shotType: "medium",
        cameraMovement: "static",
        cameraAngle: "eye_level",
        duration: 5,
      }),
    );
    expect(result.sequence).toBe(0);
  });

  it("应生成 subshot- 前缀的 ID", async () => {
    mockStorage.getSubShotsByBeatId.mockResolvedValue([]);
    mockStorage.createSubShot.mockResolvedValue(undefined);
    mockStorage.getSubShotById.mockResolvedValue(makeSubShot());

    await createSubShot("beat-1", {});

    const call = mockStorage.createSubShot.mock.calls[0]![0] as { id: string };
    expect(call.id).toMatch(/^subshot-/);
  });

  it("创建失败时应抛出异常", async () => {
    mockStorage.getSubShotsByBeatId.mockResolvedValue([]);
    mockStorage.createSubShot.mockResolvedValue(undefined);
    mockStorage.getSubShotById.mockResolvedValue(null);

    await expect(createSubShot("beat-1", {})).rejects.toThrow();
  });
});

describe("updateSubShot", () => {
  it("应调用 storage.updateSubShot", async () => {
    mockStorage.updateSubShot.mockResolvedValue(undefined);

    await updateSubShot("subshot-1", { description: "更新描述" });

    expect(mockStorage.updateSubShot).toHaveBeenCalledWith("subshot-1", {
      description: "更新描述",
    });
  });
});

describe("deleteSubShot", () => {
  it("应调用 storage.deleteSubShot", async () => {
    mockStorage.deleteSubShot.mockResolvedValue(undefined);

    await deleteSubShot("subshot-1");

    expect(mockStorage.deleteSubShot).toHaveBeenCalledWith("subshot-1");
  });
});

describe("deleteSubShotsByBeatId", () => {
  it("应调用 storage.deleteSubShotsByBeatId", async () => {
    mockStorage.deleteSubShotsByBeatId.mockResolvedValue(undefined);

    await deleteSubShotsByBeatId("beat-1");

    expect(mockStorage.deleteSubShotsByBeatId).toHaveBeenCalledWith("beat-1");
  });
});

describe("moveSubShot", () => {
  it("上移应调用 reorderSubShots 交换顺序", async () => {
    const original = [
      makeSubShot({ id: "s1", sequence: 0 }),
      makeSubShot({ id: "s2", sequence: 1 }),
      makeSubShot({ id: "s3", sequence: 2 }),
    ];
    mockStorage.getSubShotsByBeatId
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce([
        makeSubShot({ id: "s2", sequence: 0 }),
        makeSubShot({ id: "s1", sequence: 1 }),
        makeSubShot({ id: "s3", sequence: 2 }),
      ]);

    await moveSubShot("beat-1", 1, 0);

    expect(mockStorage.reorderSubShots).toHaveBeenCalledWith("beat-1", [
      "s2",
      "s1",
      "s3",
    ]);
  });

  it("下移应调用 reorderSubShots 交换顺序", async () => {
    const original = [
      makeSubShot({ id: "s1", sequence: 0 }),
      makeSubShot({ id: "s2", sequence: 1 }),
      makeSubShot({ id: "s3", sequence: 2 }),
    ];
    mockStorage.getSubShotsByBeatId
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce([
        makeSubShot({ id: "s1", sequence: 0 }),
        makeSubShot({ id: "s3", sequence: 1 }),
        makeSubShot({ id: "s2", sequence: 2 }),
      ]);

    await moveSubShot("beat-1", 1, 2);

    expect(mockStorage.reorderSubShots).toHaveBeenCalledWith("beat-1", [
      "s1",
      "s3",
      "s2",
    ]);
  });

  it("越界 fromIndex 应返回原数组不调用 reorder", async () => {
    const original = [makeSubShot({ id: "s1" })];
    mockStorage.getSubShotsByBeatId.mockResolvedValue(original);

    const result = await moveSubShot("beat-1", 5, 0);

    expect(mockStorage.reorderSubShots).not.toHaveBeenCalled();
    expect(result).toEqual(original);
  });

  it("越界 toIndex 应返回原数组不调用 reorder", async () => {
    const original = [makeSubShot({ id: "s1" })];
    mockStorage.getSubShotsByBeatId.mockResolvedValue(original);

    const result = await moveSubShot("beat-1", 0, 5);

    expect(mockStorage.reorderSubShots).not.toHaveBeenCalled();
    expect(result).toEqual(original);
  });
});

describe("reorderSubShots", () => {
  it("应直接调用 storage.reorderSubShots", async () => {
    mockStorage.reorderSubShots.mockResolvedValue(undefined);

    await reorderSubShots("beat-1", ["s3", "s1", "s2"]);

    expect(mockStorage.reorderSubShots).toHaveBeenCalledWith("beat-1", [
      "s3",
      "s1",
      "s2",
    ]);
  });
});
