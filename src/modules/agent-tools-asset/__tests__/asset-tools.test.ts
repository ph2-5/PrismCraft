/**
 * Asset Tools 单元测试
 *
 * 5 个素材管理工具的关键路径测试：
 * - list_characters：查询角色列表（支持过滤/分页）
 * - list_scenes：查询场景列表（支持过滤/分页）
 * - get_character：获取角色详情
 * - get_scene：获取场景详情
 * - search_assets：跨资产搜索
 *
 * Mock 策略：
 * - characterService / sceneService（动态导入 @/modules/character、@/modules/scene）
 * - TOOL_TIMEOUTS（静态导入 ../../services/tool-executor）
 *
 * 测试重点：过滤（name/style/tag/gender）、分页（offset/limit）、limit 上限、
 * Result<T> 错误传播、search_assets 的优雅降级（service 失败返回空数组）
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted：mock 变量在 vi.mock 工厂执行前就已定义
const mocks = vi.hoisted(() => ({
  characterService: {
    getAll: vi.fn(),
    getById: vi.fn(),
  },
  sceneService: {
    getAll: vi.fn(),
    getById: vi.fn(),
  },
  // globalSearch 还会动态 import storyboard / asset，未 mock 会调用真实 service（DB/网络）导致超时
  storyService: {
    getAll: vi.fn(),
  },
  mediaAssetService: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/modules/character", () => ({
  characterService: mocks.characterService,
}));

vi.mock("@/modules/scene", () => ({
  sceneService: mocks.sceneService,
}));

vi.mock("@/modules/storyboard", () => ({
  storyService: mocks.storyService,
}));

vi.mock("@/modules/asset", () => ({
  mediaAssetService: mocks.mediaAssetService,
}));

vi.mock("@/shared/constants/tool-timeouts", () => ({
  TOOL_TIMEOUTS: {
    query: 30_000,
    mutation: 60_000,
    generation: 300_000,
    videoTask: 1_800_000,
    download: 600_000,
  },
}));

import {
  listCharactersTool,
  listScenesTool,
  getCharacterTool,
  getSceneTool,
  searchAssetsTool,
  assetTools,
} from "../asset-tools";
import type { ToolContext } from "@/domain/types/agent-tools";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

/** 构造成功的 Result */
function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** 构造失败的 Result */
function err(error: Error): { ok: false; error: Error } {
  return { ok: false, error };
}

/** 测试用角色数据（注意：search_assets 会访问 description，必须提供） */
const charactersData = [
  {
    id: "c1",
    name: "Alice",
    style: "写实",
    gender: "女性",
    age: 25,
    description: "勇敢的侦探",
    tags: ["主角", "冷酷"],
    thumbnailPath: "/thumb/c1.png",
    useCount: 5,
  },
  {
    id: "c2",
    name: "Bob",
    style: "赛博朋克",
    gender: "男性",
    age: 30,
    description: "黑客高手",
    tags: ["配角"],
    thumbnailPath: "/thumb/c2.png",
    useCount: 2,
  },
  {
    id: "c3",
    name: "alice friend",
    style: "写实",
    gender: "中性",
    age: 20,
    description: "助手",
    tags: ["配角", "温暖"],
    thumbnailPath: "/thumb/c3.png",
    useCount: 1,
  },
];

/** 测试用场景数据 */
const scenesData = [
  {
    id: "s1",
    name: "Rainy Street",
    type: "室外",
    timeOfDay: "夜晚",
    weather: "雨天",
    mood: "紧张",
    description: "雨夜街道场景",
    tags: ["城市"],
    thumbnailPath: "/thumb/s1.png",
    useCount: 3,
  },
  {
    id: "s2",
    name: "Cozy Room",
    type: "室内",
    timeOfDay: "白天",
    weather: "晴天",
    mood: "温馨",
    description: "温暖的房间",
    tags: ["家居"],
    thumbnailPath: "/thumb/s2.png",
    useCount: 8,
  },
  {
    id: "s3",
    name: "rainy forest",
    type: "自然",
    timeOfDay: "黄昏",
    weather: "雨天",
    mood: "神秘",
    description: "森林雨景",
    tags: ["自然"],
    thumbnailPath: "/thumb/s3.png",
    useCount: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  // 默认返回完整数据，便于过滤测试
  mocks.characterService.getAll.mockResolvedValue(ok(charactersData));
  mocks.sceneService.getAll.mockResolvedValue(ok(scenesData));
  // storyService 返回 Result（空数组），mediaAssetService 直接返回数组（非 Result）
  mocks.storyService.getAll.mockResolvedValue(ok([]));
  mocks.mediaAssetService.getAll.mockResolvedValue([]);
});

// ============================================================
// 1. list_characters
// ============================================================
describe("list_characters", () => {
  it("1. 默认分页（limit=20，offset=0）返回精简字段", async () => {
    const result = await listCharactersTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      offset: number;
      limit: number;
      items: Array<{
        id: string;
        name: string;
        style: string;
        gender: string;
        age: number;
        thumbnailPath: string;
        tags: string[];
        useCount: number;
      }>;
    };
    expect(data.total).toBe(3);
    expect(data.offset).toBe(0);
    expect(data.limit).toBe(20);
    expect(data.items).toHaveLength(3);
    // 验证精简字段（不包含 description）
    expect(data.items[0].id).toBe("c1");
    expect(data.items[0].name).toBe("Alice");
    expect(data.items[0].style).toBe("写实");
    expect(data.items[0]).not.toHaveProperty("description");
  });

  it("2. name 模糊匹配（大小写不敏感）", async () => {
    const result = await listCharactersTool.execute({ name: "alice" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ id: string }> };
    // 匹配 'Alice' 和 'alice friend'
    expect(data.total).toBe(2);
    expect(data.items.map((c) => c.id).sort()).toEqual(["c1", "c3"]);
  });

  it("3. style 精确匹配", async () => {
    const result = await listCharactersTool.execute({ style: "写实" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ id: string }> };
    expect(data.total).toBe(2);
    expect(data.items.map((c) => c.id).sort()).toEqual(["c1", "c3"]);
  });

  it("4. tag 过滤（tags 数组包含该值）", async () => {
    const result = await listCharactersTool.execute({ tag: "配角" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ id: string }> };
    expect(data.total).toBe(2);
    expect(data.items.map((c) => c.id).sort()).toEqual(["c2", "c3"]);
  });

  it("5. gender 过滤", async () => {
    const result = await listCharactersTool.execute({ gender: "男性" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ id: string }> };
    expect(data.total).toBe(1);
    expect(data.items[0].id).toBe("c2");
  });

  it("6. limit 上限 100（即使传入更大值也被截断）", async () => {
    const result = await listCharactersTool.execute({ limit: 500 }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { limit: number };
    expect(data.limit).toBe(100);
  });

  it("7. offset 分页", async () => {
    const result = await listCharactersTool.execute(
      { offset: 1, limit: 1 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      offset: number;
      limit: number;
      items: Array<{ id: string }>;
    };
    expect(data.total).toBe(3); // total 是过滤后的总数，不受分页影响
    expect(data.offset).toBe(1);
    expect(data.limit).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe("c2");
  });

  it("8. service.getAll 失败时返回错误（含原始消息）", async () => {
    mocks.characterService.getAll.mockResolvedValue(err(new Error("DB connection lost")));

    const result = await listCharactersTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("查询角色失败");
    expect(result.error).toContain("DB connection lost");
  });
});

// ============================================================
// 2. list_scenes
// ============================================================
describe("list_scenes", () => {
  it("9. 默认分页返回精简字段", async () => {
    const result = await listScenesTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      offset: number;
      limit: number;
      items: Array<{
        id: string;
        name: string;
        type: string;
        timeOfDay: string;
        weather: string;
        mood: string;
        thumbnailPath: string;
        tags: string[];
        useCount: number;
      }>;
    };
    expect(data.total).toBe(3);
    expect(data.offset).toBe(0);
    expect(data.limit).toBe(20);
    expect(data.items).toHaveLength(3);
    expect(data.items[0].id).toBe("s1");
    expect(data.items[0]).not.toHaveProperty("description");
  });

  it("10. name 模糊匹配（大小写不敏感）", async () => {
    const result = await listScenesTool.execute({ name: "rainy" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ id: string }> };
    // 匹配 'Rainy Street' 和 'rainy forest'
    expect(data.total).toBe(2);
    expect(data.items.map((s) => s.id).sort()).toEqual(["s1", "s3"]);
  });

  it("11. type 精确匹配", async () => {
    const result = await listScenesTool.execute({ type: "室内" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ id: string }> };
    expect(data.total).toBe(1);
    expect(data.items[0].id).toBe("s2");
  });

  it("12. mood 过滤", async () => {
    const result = await listScenesTool.execute({ mood: "神秘" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ id: string }> };
    expect(data.total).toBe(1);
    expect(data.items[0].id).toBe("s3");
  });

  it("13. weather 过滤", async () => {
    const result = await listScenesTool.execute({ weather: "雨天" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ id: string }> };
    expect(data.total).toBe(2);
    expect(data.items.map((s) => s.id).sort()).toEqual(["s1", "s3"]);
  });

  it("14. tag 过滤", async () => {
    const result = await listScenesTool.execute({ tag: "自然" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ id: string }> };
    expect(data.total).toBe(1);
    expect(data.items[0].id).toBe("s3");
  });

  it("15. limit 上限 100", async () => {
    const result = await listScenesTool.execute({ limit: 999 }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { limit: number };
    expect(data.limit).toBe(100);
  });

  it("16. service.getAll 失败时返回错误", async () => {
    mocks.sceneService.getAll.mockResolvedValue(err(new Error("network error")));

    const result = await listScenesTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("查询场景失败");
    expect(result.error).toContain("network error");
  });
});

// ============================================================
// 3. get_character
// ============================================================
describe("get_character", () => {
  it("17. 正常获取角色详情（返回完整字段）", async () => {
    const fullChar = {
      id: "c1",
      name: "Alice",
      style: "写实",
      gender: "女性",
      age: 25,
      description: "勇敢的侦探",
      tags: ["主角"],
      appearance: { hairColor: "银色" },
      customPrompt: "detective",
    };
    mocks.characterService.getById.mockResolvedValue(ok(fullChar));

    const result = await getCharacterTool.execute(
      { characterId: "c1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(fullChar);
    // 验证 ID 转换为字符串
    expect(mocks.characterService.getById).toHaveBeenCalledWith("c1");
  });

  it("18. 角色不存在（service 返回 ok:false）时返回错误", async () => {
    mocks.characterService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await getCharacterTool.execute(
      { characterId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取角色失败");
    expect(result.error).toContain("Not found");
  });

  it("19. characterId 参数转换为字符串", async () => {
    mocks.characterService.getById.mockResolvedValue(ok({ id: "123", name: "x" }));

    await getCharacterTool.execute({ characterId: 123 }, makeCtx());

    // 即使传入数字，也会被 String() 转换
    expect(mocks.characterService.getById).toHaveBeenCalledWith("123");
  });
});

// ============================================================
// 4. get_scene
// ============================================================
describe("get_scene", () => {
  it("20. 正常获取场景详情（返回完整字段）", async () => {
    const fullScene = {
      id: "s1",
      name: "Rainy Street",
      type: "室外",
      timeOfDay: "夜晚",
      weather: "雨天",
      mood: "紧张",
      description: "雨夜街道场景",
      lighting: "霓虹灯",
      camera: { angle: "俯视" },
    };
    mocks.sceneService.getById.mockResolvedValue(ok(fullScene));

    const result = await getSceneTool.execute(
      { sceneId: "s1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(fullScene);
    expect(mocks.sceneService.getById).toHaveBeenCalledWith("s1");
  });

  it("21. 场景不存在时返回错误", async () => {
    mocks.sceneService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await getSceneTool.execute(
      { sceneId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取场景失败");
    expect(result.error).toContain("Not found");
  });

  it("22. sceneId 参数转换为字符串", async () => {
    mocks.sceneService.getById.mockResolvedValue(ok({ id: "456", name: "x" }));

    await getSceneTool.execute({ sceneId: 456 }, makeCtx());

    expect(mocks.sceneService.getById).toHaveBeenCalledWith("456");
  });
});

// ============================================================
// 5. search_assets
// ============================================================
describe("search_assets", () => {
  it("23. 关键词匹配 character 的 name", async () => {
    const result = await searchAssetsTool.execute(
      { keyword: "alice" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      keyword: string;
      characters: Array<{ id: string; name: string; style: string; type: string }>;
      scenes: unknown[];
      total: number;
    };
    expect(data.keyword).toBe("alice");
    // 匹配 Alice 和 alice friend
    expect(data.characters).toHaveLength(2);
    expect(data.characters.map((c) => c.id).sort()).toEqual(["c1", "c3"]);
    expect(data.characters[0].type).toBe("character");
    // scenes 也会被搜索（assetType=all 默认）
    expect(data.total).toBe(data.characters.length + data.scenes.length);
  });

  it("24. 关键词匹配 character 的 description", async () => {
    const result = await searchAssetsTool.execute(
      { keyword: "侦探" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { characters: Array<{ id: string }>; scenes: unknown[] };
    expect(data.characters).toHaveLength(1);
    expect(data.characters[0].id).toBe("c1");
  });

  it("25. 关键词匹配 character 的 tags", async () => {
    const result = await searchAssetsTool.execute(
      { keyword: "黑客" }, // c2 description 含『黑客高手』
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { characters: Array<{ id: string }> };
    expect(data.characters).toHaveLength(1);
    expect(data.characters[0].id).toBe("c2");
  });

  it("26. assetType=character 时只搜索角色", async () => {
    const result = await searchAssetsTool.execute(
      { keyword: "rainy", assetType: "character" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { characters: unknown[]; scenes: unknown[] };
    expect(data.scenes).toEqual([]);
    expect(mocks.sceneService.getAll).not.toHaveBeenCalled();
  });

  it("27. assetType=scene 时只搜索场景", async () => {
    const result = await searchAssetsTool.execute(
      { keyword: "rainy", assetType: "scene" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { characters: unknown[]; scenes: Array<{ id: string }> };
    expect(data.characters).toEqual([]);
    expect(mocks.characterService.getAll).not.toHaveBeenCalled();
    // 匹配 Rainy Street 和 rainy forest
    expect(data.scenes).toHaveLength(2);
    expect(data.scenes.map((s) => s.id).sort()).toEqual(["s1", "s3"]);
  });

  it("28. limit 上限 50（每类资产返回上限）", async () => {
    // 准备 60 个匹配的角色
    const manyChars = Array.from({ length: 60 }, (_, i) => ({
      id: `mc${i}`,
      name: `match-${i}`,
      style: "写实",
      description: "match",
      tags: [],
    }));
    mocks.characterService.getAll.mockResolvedValue(ok(manyChars));

    const result = await searchAssetsTool.execute(
      { keyword: "match", limit: 100 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { characters: unknown[] };
    expect(data.characters).toHaveLength(50); // 被 limit 上限 50 截断
  });

  it("29. character service 失败时优雅降级（返回空数组）", async () => {
    mocks.characterService.getAll.mockResolvedValue(err(new Error("service down")));

    const result = await searchAssetsTool.execute(
      { keyword: "alice", assetType: "character" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      characters: unknown[];
      scenes: unknown[];
      total: number;
    };
    expect(data.characters).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("30. scene service 失败时优雅降级（返回空数组）", async () => {
    mocks.sceneService.getAll.mockResolvedValue(err(new Error("scene service down")));

    const result = await searchAssetsTool.execute(
      { keyword: "rainy", assetType: "scene" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { scenes: unknown[]; total: number };
    expect(data.scenes).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("31. 关键词大小写不敏感匹配", async () => {
    const result = await searchAssetsTool.execute(
      { keyword: "RAIN" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { scenes: Array<{ id: string }> };
    // 匹配 Rainy Street 和 rainy forest
    expect(data.scenes).toHaveLength(2);
  });
});

// ============================================================
// 导出完整性
// ============================================================
describe("assetTools 导出", () => {
  it("32. 导出 5 个工具", () => {
    expect(assetTools).toHaveLength(5);
    expect(assetTools).toContain(listCharactersTool);
    expect(assetTools).toContain(listScenesTool);
    expect(assetTools).toContain(getCharacterTool);
    expect(assetTools).toContain(getSceneTool);
    expect(assetTools).toContain(searchAssetsTool);
  });

  it("33. 所有工具 domain 为 asset", () => {
    for (const tool of assetTools) {
      expect(tool.domain).toBe("asset");
    }
  });

  it("34. 工具名正确", () => {
    const names = assetTools.map((t) => t.def.function.name);
    expect(names).toContain("list_characters");
    expect(names).toContain("list_scenes");
    expect(names).toContain("get_character");
    expect(names).toContain("get_scene");
    expect(names).toContain("search_assets");
  });
});
