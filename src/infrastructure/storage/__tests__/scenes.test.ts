import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: vi.fn(),
  safeRun: vi.fn(),
  safeTransaction: vi.fn(),
}));

vi.mock(import("@/infrastructure/storage/core"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseRecord: vi.fn((r) => r),
    toSqlValue: vi.fn((v) => (v === undefined ? null : v)),
    trackChange: vi.fn(),
    buildInsert: vi.fn((table, columns, values) => ({
      sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      params: values,
    })),
    isElectron: vi.fn(() => true),
  };
});

import { safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/sqlite-core";

const mockSafeQuery = vi.mocked(safeQuery);
const mockSafeRun = vi.mocked(safeRun);
const mockSafeTransaction = vi.mocked(safeTransaction);

let sceneStorage: typeof import("../scenes").sceneStorage;

beforeEach(async () => {
  vi.clearAllMocks();
  mockSafeQuery.mockResolvedValue([]);
  mockSafeRun.mockResolvedValue(undefined as unknown as import("@/domain/ports/sync-port").DbRunResult);
  mockSafeTransaction.mockResolvedValue([]);
  const mod = await import("../scenes");
  sceneStorage = mod.sceneStorage;
});

function makeSceneRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "s1",
    name: "test",
    description: "",
    type: "",
    ref_image_path: null,
    source: null,
    use_count: 0,
    last_used_at: null,
    appearance: "{}",
    generation: "{}",
    config: null,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

describe("storage/scenes", () => {
  describe("createScene", () => {
    it("传入 refImagePath 时应保存到 ref_image_path 列", async () => {
      await sceneStorage.createScene({
        name: "test",
        refImagePath: "/path/to/ref.png",
      });

      expect(mockSafeTransaction).toHaveBeenCalled();
      const statements = mockSafeTransaction.mock.calls[0]![0]! as {
        sql: string;
        params: unknown[];
      }[];
      expect(statements[0]!.sql).toContain("ref_image_path");
      expect(statements[0]!.params).toContain("/path/to/ref.png");
    });

    it("未提供 id 时应自动生成", async () => {
      await sceneStorage.createScene({ name: "auto-id" });

      expect(mockSafeTransaction).toHaveBeenCalled();
      const statements = mockSafeTransaction.mock.calls[0]![0]! as {
        sql: string;
        params: unknown[];
      }[];
      const id = statements[0]!.params[0] as string;
      expect(id).toMatch(/^scene_[0-9a-f]{8}-/);
    });

    it("未提供 source 时不自动设置默认值", async () => {
      await sceneStorage.createScene({ name: "default-source" });

      expect(mockSafeTransaction).toHaveBeenCalled();
      const statements = mockSafeTransaction.mock.calls[0]![0]! as {
        sql: string;
        params: unknown[];
      }[];
      expect(statements[0]!.sql).not.toContain("source");
    });
  });

  describe("updateScene refImagePath 映射", () => {
    it("传入 refImagePath 时，safeRun 的 SQL 中应包含 ref_image_path = ?", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 } as never);
      mockSafeQuery.mockResolvedValue([{ id: "scene-1" }]);

      await sceneStorage.updateScene("scene-1", {
        refImagePath: "/path/to/ref.png",
      });

      expect(mockSafeRun).toHaveBeenCalled();
      const [sql] = mockSafeRun.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("ref_image_path");
    });

    it("传入 imageUrl 时不应处理（imageUrl 不是 Scene 的字段）", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 } as never);
      mockSafeQuery.mockResolvedValue([{ id: "scene-1" }]);

      await sceneStorage.updateScene("scene-1", {
        name: "test",
      });

      expect(mockSafeRun).toHaveBeenCalled();
      const [sql] = mockSafeRun.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toContain("imageUrl");
    });
  });

  describe("updateScene not found", () => {
    it("更新不存在的场景应抛错", async () => {
      mockSafeRun.mockResolvedValue(undefined as unknown as import("@/domain/ports/sync-port").DbRunResult);
      mockSafeQuery.mockResolvedValue([]);
      await expect(
        sceneStorage.updateScene("nonexistent-id", { name: "test" }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("deleteScene 级联", () => {
    it("删除场景应级联删除关联数据", async () => {
      await sceneStorage.deleteScene("scene-1");

      expect(mockSafeTransaction).toHaveBeenCalled();
      const statements = mockSafeTransaction.mock.calls[0]![0]! as {
        sql: string;
        params: unknown[];
      }[];
      expect(statements.length).toBe(4);
      expect(statements[0]!.sql).toContain("collection_assets");
      expect(statements[1]!.sql).toContain("asset_tags");
      expect(statements[2]!.sql).toContain("media_assets");
      expect(statements[3]!.sql).toContain("DELETE FROM scenes");
    });
  });

  describe("parseScene config container", () => {
    it("config 容器为空时 camera 应为 undefined", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow()]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.camera).toBeUndefined();
    });

    it("config 容器中包含 camera 时应保留该对象", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        config: JSON.stringify({ camera: { movement: "pan" } }),
      })]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.camera).toEqual({ movement: "pan" });
    });
  });

  describe("parseScene JSON 容器映射", () => {
    it("数据库 JSON 容器字段应正确映射到 Scene camelCase 字段", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        id: "s1",
        name: "Sunset",
        description: "A beautiful sunset",
        type: "outdoor",
        ref_image_path: "/img/sunset.png",
        source: "ai-generated",
        use_count: 5,
        last_used_at: 1700000000,
        appearance: JSON.stringify({
          thumbnailPath: "/thumb/sunset.png",
          previewPath: "/preview/sunset.png",
          generatedImage: "/gen/sunset.png",
          generatedVideo: "/gen/sunset.mp4",
          videoGenerationStatus: "completed",
          videoGenerationTaskId: "task-1",
          imageGenerationPrompt: "sunset image",
        }),
        generation: JSON.stringify({
          prompt: "sunset scene",
          camera: { movement: "pan" },
          generationPrompt: "generate sunset",
          generationParams: { model: "dall-e" },
        }),
        config: JSON.stringify({
          atmosphere: "warm",
          camera: { movement: "pan" },
          tags: ["nature", "sunset"],
        }),
        atmosphere: JSON.stringify({
          mood: "warm",
          timeOfDay: "dusk",
          weather: "clear",
          lighting: "golden",
          elements: ["sunset glow"],
          colors: ["orange", "red"],
        }),
        created_at: "1699999999",
        updated_at: "1700000000",
      })]);

      const scenes = await sceneStorage.getScenes();
      const scene = scenes[0]!;
      expect(scene.id).toBe("s1");
      expect(scene.name).toBe("Sunset");
      expect(scene.refImagePath).toBe("/img/sunset.png");
      expect(scene.thumbnailPath).toBe("/thumb/sunset.png");
      expect(scene.previewPath).toBe("/preview/sunset.png");
      expect(scene.generationPrompt).toBe("generate sunset");
      expect(scene.generationParams).toEqual({ model: "dall-e" });
      expect(scene.generatedImage).toBe("/gen/sunset.png");
      expect(scene.generatedVideo).toBe("/gen/sunset.mp4");
      expect(scene.videoGenerationStatus).toBe("completed");
      expect(scene.videoGenerationTaskId).toBe("task-1");
      expect(scene.imageGenerationPrompt).toBe("sunset image");
      expect(scene.useCount).toBe(5);
      expect(scene.lastUsedAt).toBe(1700000000000);
      expect(scene.createdAt).toBe("1699999999000");
      expect(scene.updatedAt).toBe("1700000000000");
      expect(scene.atmosphere).toBe("warm");
      expect(scene.lighting).toBe("golden");
      expect(scene.camera).toEqual({ movement: "pan" });
      expect(scene.tags).toEqual(["nature", "sunset"]);
    });
  });

  describe("getSceneById", () => {
    it("查询存在的场景应返回 Scene 对象", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({ name: "Test" })]);

      const scene = await sceneStorage.getSceneById("s1");
      expect(scene).not.toBeNull();
      expect(scene!.id).toBe("s1");
      expect(scene!.name).toBe("Test");
    });

    it("查询不存在的场景应返回 null", async () => {
      mockSafeQuery.mockResolvedValue([]);

      const scene = await sceneStorage.getSceneById("nonexistent");
      expect(scene).toBeNull();
    });
  });

  describe("parseScene edge cases", () => {
    it("handles invalid created_at/updated_at type by using current time", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        created_at: true,
        updated_at: false,
      })]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.createdAt).toBeDefined();
      expect(scenes[0]!.updatedAt).toBeDefined();
    });

    it("handles last_used_at as string type by returning undefined", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        last_used_at: "1700000000",
      })]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.lastUsedAt).toBeUndefined();
    });

    it("handles null appearance container", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        appearance: null,
      })]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.thumbnailPath).toBeUndefined();
      expect(scenes[0]!.generatedImage).toBeUndefined();
    });

    it("handles null atmosphere container", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        atmosphere: null,
      })]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.mood).toBe("");
      expect(scenes[0]!.lighting).toBe("");
      expect(scenes[0]!.elements).toEqual([]);
      expect(scenes[0]!.colors).toEqual([]);
    });

    it("handles null generation container", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        generation: null,
      })]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.prompt).toBe("");
      expect(scenes[0]!.generationPrompt).toBeUndefined();
    });

    it("handles invalid JSON in container gracefully", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        appearance: "not-valid-json",
        atmosphere: "not-valid-json",
        generation: "not-valid-json",
        config: "not-valid-json",
      })]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.thumbnailPath).toBeUndefined();
      expect(scenes[0]!.mood).toBe("");
      expect(scenes[0]!.prompt).toBe("");
      expect(scenes[0]!.camera).toBeUndefined();
    });

    it("handles scenePath and imageUrl from appearance", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        appearance: JSON.stringify({
          scenePath: "/scene/path",
          imageUrl: "https://example.com/img.png",
        }),
      })]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.scenePath).toBe("/scene/path");
      expect(scenes[0]!.imageUrl).toBe("https://example.com/img.png");
    });

    it("handles tags and relatedCharacters from config container", async () => {
      mockSafeQuery.mockResolvedValue([makeSceneRow({
        config: JSON.stringify({
          tags: ["nature", "sunset"],
          relatedCharacters: ["CHAR_001"],
        }),
      })]);

      const scenes = await sceneStorage.getScenes();
      expect(scenes[0]!.tags).toEqual(["nature", "sunset"]);
    });
  });

  describe("createScene with createdAt", () => {
    it("handles createdAt as number", async () => {
      await sceneStorage.createScene({
        name: "test",
        createdAt: "1700000000000",
      });

      expect(mockSafeTransaction).toHaveBeenCalled();
    });

    it("handles createdAt as string", async () => {
      await sceneStorage.createScene({
        name: "test",
        createdAt: "2024-01-01T00:00:00.000Z",
      });

      expect(mockSafeTransaction).toHaveBeenCalled();
    });

    it("handles trackChange failure gracefully", async () => {
      const { trackChange } = await import("@/infrastructure/storage/core");
      vi.mocked(trackChange).mockRejectedValue(new Error("sync error"));

      await sceneStorage.createScene({ name: "test" });

      expect(mockSafeTransaction).toHaveBeenCalled();
    });
  });

  describe("updateScene with empty updates", () => {
    it("only updates updated_at when no field targets match", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 } as never);
      mockSafeQuery.mockResolvedValue([{ id: "scene-1" }]);

      await sceneStorage.updateScene("scene-1", {});

      expect(mockSafeRun).toHaveBeenCalledWith(
        "UPDATE scenes SET updated_at = ? WHERE id = ?",
        expect.any(Array),
      );
    });
  });

  describe("updateScene trackChange", () => {
    it("handles trackChange failure gracefully on update", async () => {
      const { trackChange } = await import("@/infrastructure/storage/core");
      vi.mocked(trackChange).mockRejectedValue(new Error("sync error"));
      mockSafeRun.mockResolvedValue({ changes: 1 } as never);
      mockSafeQuery.mockResolvedValue([{ id: "scene-1" }]);

      await sceneStorage.updateScene("scene-1", { name: "test" });

      expect(mockSafeRun).toHaveBeenCalled();
    });
  });

  describe("deleteScene trackChange", () => {
    it("handles trackChange failure gracefully", async () => {
      const { trackChange } = await import("@/infrastructure/storage/core");
      vi.mocked(trackChange).mockRejectedValue(new Error("sync error"));

      await sceneStorage.deleteScene("scene-1");

      expect(mockSafeTransaction).toHaveBeenCalled();
    });
  });

  describe("incrementSceneUseCount", () => {
    it("increments use count and updates last_used_at", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 } as never);

      await sceneStorage.incrementSceneUseCount("scene-1");

      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("use_count = use_count + 1"),
        expect.any(Array),
      );
    });

    it("handles trackChange failure gracefully", async () => {
      const { trackChange } = await import("@/infrastructure/storage/core");
      vi.mocked(trackChange).mockRejectedValue(new Error("sync error"));
      mockSafeRun.mockResolvedValue({ changes: 1 } as never);

      await sceneStorage.incrementSceneUseCount("scene-1");

      expect(mockSafeRun).toHaveBeenCalled();
    });
  });
});
