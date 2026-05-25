import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "@/domain/types";

vi.mock("@/infrastructure/di", () => ({
  container: {
    safeQuery: vi.fn(),
    safeTransaction: vi.fn(),
  },
}));

import { container } from "@/infrastructure/di";
import {
  exportCharacters,
  exportScenes,
  exportStoryboards,
  exportCollections,
  importFromFile,
} from "../asa-export-service";

function createJsonFile(data: unknown, name = "test.asa"): File {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  return new File([blob], name);
}

const mockCharacterRow = {
  id: "char-1",
  name: "小明",
  description: "男主角",
  ref_image_path: null,
  avatar_path: null,
  thumbnail_path: null,
  preview_path: null,
  generated_image: null,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

const mockOutfitRow = {
  id: "outfit-1",
  character_id: "char-1",
  name: "校服",
  image_url: null,
  local_image_path: null,
  created_at: "2025-01-01T00:00:00.000Z",
};

const mockSceneRow = {
  id: "scene-1",
  name: "客厅",
  description: "明亮的客厅",
  ref_image_path: null,
  generated_image: null,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

const mockStoryboardRow = {
  id: "story-1",
  title: "我的故事",
  description: "一个故事",
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

const mockBeatRow = {
  id: "beat-1",
  story_id: "story-1",
  title: "开场",
  content: "主角登场",
  order: 0,
  duration: 5,
  created_at: "2025-01-01T00:00:00.000Z",
};

const mockCollectionRow = {
  id: "col-1",
  name: "收藏集1",
  description: "测试收藏集",
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

describe("exportCharacters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应成功导出角色数据", async () => {
    (container.safeQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([mockCharacterRow])
      .mockResolvedValueOnce([mockOutfitRow]);

    const result = await exportCharacters(["char-1"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = new TextDecoder().decode(result.value);
      const data = JSON.parse(text);
      expect(data.format).toBe("asa-characters");
      expect(data.version).toBe(1);
      expect(data.characters).toHaveLength(1);
      expect(data.characters[0].name).toBe("小明");
      expect(data.outfits).toHaveLength(1);
    }
  });

  it("角色不存在时应导出空数组", async () => {
    (container.safeQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await exportCharacters(["non-existent"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = new TextDecoder().decode(result.value);
      const data = JSON.parse(text);
      expect(data.characters).toHaveLength(0);
    }
  });

  it("空 ID 列表应导出空数据", async () => {
    const result = await exportCharacters([]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = new TextDecoder().decode(result.value);
      const data = JSON.parse(text);
      expect(data.characters).toHaveLength(0);
      expect(data.outfits).toHaveLength(0);
    }
  });

  it("数据库查询失败时应返回错误", async () => {
    (container.safeQuery as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("数据库错误"),
    );

    const result = await exportCharacters(["char-1"]);

    expect(result.ok).toBe(false);
  });
});

describe("exportScenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应成功导出场景数据", async () => {
    (container.safeQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockSceneRow]);

    const result = await exportScenes(["scene-1"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = new TextDecoder().decode(result.value);
      const data = JSON.parse(text);
      expect(data.format).toBe("asa-scenes");
      expect(data.version).toBe(1);
      expect(data.scenes).toHaveLength(1);
      expect(data.scenes[0].name).toBe("客厅");
    }
  });

  it("场景不存在时应导出空数组", async () => {
    (container.safeQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await exportScenes(["non-existent"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = new TextDecoder().decode(result.value);
      const data = JSON.parse(text);
      expect(data.scenes).toHaveLength(0);
    }
  });
});

describe("exportStoryboards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应成功导出故事板数据", async () => {
    (container.safeQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([mockStoryboardRow])
      .mockResolvedValueOnce([mockBeatRow]);

    const result = await exportStoryboards(["story-1"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = new TextDecoder().decode(result.value);
      const data = JSON.parse(text);
      expect(data.format).toBe("asa-storyboards");
      expect(data.version).toBe(1);
      expect(data.storyboards).toHaveLength(1);
      expect(data.beats).toHaveLength(1);
      expect(data.storyboards[0].title).toBe("我的故事");
    }
  });

  it("故事板不存在但 beats 查询仍应执行", async () => {
    (container.safeQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await exportStoryboards(["non-existent"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = new TextDecoder().decode(result.value);
      const data = JSON.parse(text);
      expect(data.storyboards).toHaveLength(0);
      expect(data.beats).toHaveLength(0);
    }
  });
});

describe("exportCollections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应成功导出收藏集数据", async () => {
    (container.safeQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockCollectionRow]);

    const result = await exportCollections(["col-1"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = new TextDecoder().decode(result.value);
      const data = JSON.parse(text);
      expect(data.format).toBe("asa-collections");
      expect(data.version).toBe(1);
      expect(data.collections).toHaveLength(1);
      expect(data.collections[0].name).toBe("收藏集1");
    }
  });

  it("收藏集不存在时应导出空数组", async () => {
    (container.safeQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await exportCollections(["non-existent"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = new TextDecoder().decode(result.value);
      const data = JSON.parse(text);
      expect(data.collections).toHaveLength(0);
    }
  });
});

describe("importFromFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("无效 JSON 文件应返回 ValidationError", async () => {
    const blob = new Blob(["not json"], { type: "application/json" });
    const file = new File([blob], "bad.asa");

    const result = await importFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).toContain("JSON");
    }
  });

  it("缺少 format 字段应返回 ValidationError", async () => {
    const file = createJsonFile({ version: 1, exportedAt: new Date().toISOString() });

    const result = await importFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).toContain("校验失败");
    }
  });

  it("未知的 format 值应返回 ValidationError", async () => {
    const file = createJsonFile({
      format: "unknown-format",
      version: 1,
      exportedAt: new Date().toISOString(),
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it("应成功导入角色数据", async () => {
    (container.safeTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const file = createJsonFile({
      format: "asa-characters",
      version: 1,
      exportedAt: new Date().toISOString(),
      characters: [
        {
          id: "char-1",
          name: "小明",
          description: "男主角",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      outfits: [],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imported).toBe(1);
      expect(result.value.errors).toHaveLength(0);
    }
  });

  it("应成功导入场景数据", async () => {
    (container.safeTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const file = createJsonFile({
      format: "asa-scenes",
      version: 1,
      exportedAt: new Date().toISOString(),
      scenes: [
        {
          id: "scene-1",
          name: "客厅",
          description: "明亮的客厅",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imported).toBe(1);
    }
  });

  it("应成功导入故事板数据", async () => {
    (container.safeTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const file = createJsonFile({
      format: "asa-storyboards",
      version: 1,
      exportedAt: new Date().toISOString(),
      storyboards: [
        {
          id: "story-1",
          title: "我的故事",
          description: "一个故事",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      beats: [],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imported).toBe(1);
    }
  });

  it("应成功导入收藏集数据", async () => {
    (container.safeTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const file = createJsonFile({
      format: "asa-collections",
      version: 1,
      exportedAt: new Date().toISOString(),
      collections: [
        {
          id: "col-1",
          name: "收藏集1",
          description: "测试",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imported).toBe(1);
    }
  });

  it("角色数据缺少必填字段应返回 ValidationError", async () => {
    const file = createJsonFile({
      format: "asa-characters",
      version: 1,
      exportedAt: new Date().toISOString(),
      characters: [{ id: "", name: "" }],
      outfits: [],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it("场景数据缺少必填字段应返回 ValidationError", async () => {
    const file = createJsonFile({
      format: "asa-scenes",
      version: 1,
      exportedAt: new Date().toISOString(),
      scenes: [{ id: "", name: "" }],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it("故事板数据缺少必填字段应返回 ValidationError", async () => {
    const file = createJsonFile({
      format: "asa-storyboards",
      version: 1,
      exportedAt: new Date().toISOString(),
      storyboards: [{ id: "", title: "" }],
      beats: [],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it("收藏集数据缺少必填字段应返回 ValidationError", async () => {
    const file = createJsonFile({
      format: "asa-collections",
      version: 1,
      exportedAt: new Date().toISOString(),
      collections: [{ id: "", name: "" }],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it("导入角色时事务失败应返回错误", async () => {
    (container.safeTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("事务失败"),
    );

    const file = createJsonFile({
      format: "asa-characters",
      version: 1,
      exportedAt: new Date().toISOString(),
      characters: [
        {
          id: "char-1",
          name: "小明",
          description: "男主角",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      outfits: [],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(false);
  });

  it("导入包含 outfits 的角色数据应正确处理", async () => {
    (container.safeTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const file = createJsonFile({
      format: "asa-characters",
      version: 1,
      exportedAt: new Date().toISOString(),
      characters: [
        {
          id: "char-1",
          name: "小明",
          description: "男主角",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      outfits: [
        {
          id: "outfit-1",
          character_id: "char-1",
          name: "校服",
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imported).toBe(1);
      expect(container.safeTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sql: expect.stringContaining("character_outfits") }),
        ]),
      );
    }
  });

  it("导入包含 beats 的故事板数据应正确处理", async () => {
    (container.safeTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const file = createJsonFile({
      format: "asa-storyboards",
      version: 1,
      exportedAt: new Date().toISOString(),
      storyboards: [
        {
          id: "story-1",
          title: "我的故事",
          description: "一个故事",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      beats: [
        {
          id: "beat-1",
          story_id: "story-1",
          title: "开场",
          content: "主角登场",
          order: 0,
          duration: 5,
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imported).toBe(1);
      expect(container.safeTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sql: expect.stringContaining("story_beats") }),
        ]),
      );
    }
  });

  it("缺少 version 字段应返回 ValidationError", async () => {
    const file = createJsonFile({
      format: "asa-characters",
      exportedAt: new Date().toISOString(),
      characters: [],
      outfits: [],
    });

    const result = await importFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });
});
