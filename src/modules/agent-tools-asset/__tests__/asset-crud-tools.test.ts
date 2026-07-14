/**
 * Asset CRUD Tools 单元测试
 *
 * 9 个素材 CRUD 工具的关键路径测试：
 * - create_character / update_character / delete_character
 * - create_scene / update_scene / delete_scene
 * - tag_asset / organize_assets / deduplicate_assets
 *
 * Mock 策略：
 * - characterService / sceneService（动态导入 @/modules/character、@/modules/scene）
 * - checkCharacterReferences / checkSceneReferences（动态导入 @/modules/shot）
 * - storyService.getAll（动态导入 @/modules/storyboard，用于引用检查）
 * - TOOL_TIMEOUTS（静态导入 ../../services/tool-executor）
 *
 * 测试重点：参数解析、Result<T> 错误传播、引用检查、标签计算、相似度检测
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted：mock 变量在 vi.mock 工厂执行前就已定义
const mocks = vi.hoisted(() => ({
  characterService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  sceneService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  storyService: {
    getAll: vi.fn(),
  },
  checkCharacterReferences: vi.fn(),
  checkSceneReferences: vi.fn(),
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

vi.mock("@/modules/shot", () => ({
  checkCharacterReferences: mocks.checkCharacterReferences,
  checkSceneReferences: mocks.checkSceneReferences,
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
  createCharacterTool,
  updateCharacterTool,
  deleteCharacterTool,
  createSceneTool,
  updateSceneTool,
  deleteSceneTool,
  tagAssetTool,
  organizeAssetsTool,
  deduplicateAssetsTool,
  assetCrudTools,
} from "../asset-crud-tools";
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

beforeEach(() => {
  vi.resetAllMocks();
  // 引用检查默认允许删除
  mocks.checkCharacterReferences.mockReturnValue({ canDelete: true, references: [] });
  mocks.checkSceneReferences.mockReturnValue({ canDelete: true, references: [] });
  mocks.storyService.getAll.mockResolvedValue(ok([]));
});

// ============================================================
// 1. create_character
// ============================================================
describe("create_character", () => {
  it("1. 正常创建角色（含完整字段）", async () => {
    mocks.characterService.create.mockResolvedValue(
      ok({
        id: "char_1",
        name: "艾莉",
        style: "赛博朋克",
        gender: "女性",
        age: 28,
        description: "侦探",
        tags: ["主角", "冷酷"],
      }),
    );

    const result = await createCharacterTool.execute(
      {
        name: "艾莉",
        style: "赛博朋克",
        gender: "女性",
        age: 28,
        description: "侦探",
        tags: ["主角", "冷酷"],
        appearance: { hairColor: "银色", clothing: "皮衣" },
        personality: "勇敢、干练",
        customPrompt: "cyberpunk detective",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string; name: string; tags: string[] };
    expect(data.id).toBe("char_1");
    expect(data.name).toBe("艾莉");
    expect(data.tags).toEqual(["主角", "冷酷"]);
    // 验证传给 service 的 input 包含转换后的字段
    const input = mocks.characterService.create.mock.calls[0][0];
    expect(input.personality).toEqual(["勇敢", "干练"]);
    expect(input.appearance.hairColor).toBe("银色");
    expect(input.prompt).toBe("cyberpunk detective");
  });

  it("2. service.create 失败时返回错误", async () => {
    mocks.characterService.create.mockResolvedValue(err(new Error("名称已存在")));

    const result = await createCharacterTool.execute(
      { name: "重复角色" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("创建角色失败");
    expect(result.error).toContain("名称已存在");
  });

  it("3. 仅传 name 也能成功创建（可选字段使用默认值）", async () => {
    mocks.characterService.create.mockResolvedValue(
      ok({ id: "c2", name: "简单角色", style: "", gender: "", age: undefined, description: "", tags: [] }),
    );

    const result = await createCharacterTool.execute({ name: "简单角色" }, makeCtx());

    expect(result.success).toBe(true);
    const input = mocks.characterService.create.mock.calls[0][0];
    expect(input.name).toBe("简单角色");
    expect(input.description).toBe("");
    expect(input.personality).toEqual([]);
    expect(input.age).toBeUndefined();
    expect(input.tags).toBeUndefined();
  });
});

// ============================================================
// 2. update_character
// ============================================================
describe("update_character", () => {
  it("4. 正常更新角色（部分字段）", async () => {
    mocks.characterService.update.mockResolvedValue(ok(undefined));

    const result = await updateCharacterTool.execute(
      { characterId: "char_1", name: "新名称", age: 30 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { updated: boolean; characterId: string };
    expect(data.updated).toBe(true);
    expect(data.characterId).toBe("char_1");
    // 验证只传了需要更新的字段
    const input = mocks.characterService.update.mock.calls[0][1];
    expect(input.id).toBe("char_1");
    expect(input.name).toBe("新名称");
    expect(input.age).toBe(30);
    expect(input.description).toBeUndefined();
  });

  it("5. service.update 失败时返回错误", async () => {
    mocks.characterService.update.mockResolvedValue(err(new Error("角色不存在")));

    const result = await updateCharacterTool.execute(
      { characterId: "missing", name: "x" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("更新角色失败");
    expect(result.error).toContain("角色不存在");
  });
});

// ============================================================
// 3. delete_character
// ============================================================
describe("delete_character", () => {
  it("6. 角色不存在时返回错误", async () => {
    mocks.characterService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await deleteCharacterTool.execute(
      { characterId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("角色不存在");
    expect(mocks.characterService.delete).not.toHaveBeenCalled();
  });

  it("7. 有引用且 force=false 时拒绝删除", async () => {
    mocks.characterService.getById.mockResolvedValue(
      ok({ id: "c1", name: "主角" }),
    );
    mocks.checkCharacterReferences.mockReturnValue({
      canDelete: false,
      references: [
        {
          elementId: "c1",
          elementType: "character",
          elementName: "主角",
          usedInBeats: ["b1", "b2"],
          usedInStories: ["故事A"],
        },
      ],
    });

    const result = await deleteCharacterTool.execute(
      { characterId: "c1", force: false },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("被 1 处引用");
    expect(result.error).toContain("force=true");
    expect(mocks.characterService.delete).not.toHaveBeenCalled();
  });

  it("8. 有引用但 force=true 时跳过检查并删除", async () => {
    mocks.characterService.getById.mockResolvedValue(ok({ id: "c1", name: "主角" }));
    mocks.characterService.delete.mockResolvedValue(ok(undefined));

    const result = await deleteCharacterTool.execute(
      { characterId: "c1", force: true },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(mocks.checkCharacterReferences).not.toHaveBeenCalled();
    expect(mocks.characterService.delete).toHaveBeenCalledWith("c1");
  });

  it("9. 无引用时正常删除", async () => {
    mocks.characterService.getById.mockResolvedValue(ok({ id: "c2", name: "配角" }));
    mocks.characterService.delete.mockResolvedValue(ok(undefined));

    const result = await deleteCharacterTool.execute(
      { characterId: "c2" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { deleted: boolean; characterId: string };
    expect(data.deleted).toBe(true);
    expect(data.characterId).toBe("c2");
  });

  it("10. delete service 失败时返回错误", async () => {
    mocks.characterService.getById.mockResolvedValue(ok({ id: "c3", name: "x" }));
    mocks.characterService.delete.mockResolvedValue(err(new Error("DB locked")));

    const result = await deleteCharacterTool.execute(
      { characterId: "c3" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("删除角色失败");
    expect(result.error).toContain("DB locked");
  });
});

// ============================================================
// 4. create_scene
// ============================================================
describe("create_scene", () => {
  it("11. 正常创建场景（lighting 对象自动拼接为字符串）", async () => {
    mocks.sceneService.create.mockResolvedValue(
      ok({
        id: "scene_1",
        name: "雨夜街道",
        type: "室外",
        timeOfDay: "夜晚",
        weather: "雨天",
        mood: "紧张",
        tags: ["城市"],
      }),
    );

    const result = await createSceneTool.execute(
      {
        name: "雨夜街道",
        type: "室外",
        timeOfDay: "夜晚",
        weather: "雨天",
        mood: "紧张",
        lighting: { type: "霓虹灯", intensity: "高", color: "蓝" },
        camera: { angle: "俯视", movement: "推进" },
        tags: ["城市"],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string; name: string };
    expect(data.id).toBe("scene_1");
    // 验证 lighting 对象被拼接为字符串
    const input = mocks.sceneService.create.mock.calls[0][0];
    expect(input.lighting).toBe("霓虹灯, 高, 蓝");
    expect(input.camera).toEqual({ angle: "俯视", movement: "推进" });
    expect(input.elements).toEqual([]);
    expect(input.colors).toEqual([]);
  });

  it("12. service.create 失败时返回错误", async () => {
    mocks.sceneService.create.mockResolvedValue(err(new Error("权限不足")));

    const result = await createSceneTool.execute(
      { name: "测试场景" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("创建场景失败");
    expect(result.error).toContain("权限不足");
  });
});

// ============================================================
// 5. update_scene
// ============================================================
describe("update_scene", () => {
  it("13. 正常更新场景", async () => {
    mocks.sceneService.update.mockResolvedValue(ok(undefined));

    const result = await updateSceneTool.execute(
      { sceneId: "scene_1", name: "新名称", lighting: "暖光" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { updated: boolean; sceneId: string };
    expect(data.updated).toBe(true);
    expect(data.sceneId).toBe("scene_1");
    const input = mocks.sceneService.update.mock.calls[0][1];
    expect(input.lighting).toBe("暖光");
  });

  it("14. service.update 失败时返回错误", async () => {
    mocks.sceneService.update.mockResolvedValue(err(new Error("场景不存在")));

    const result = await updateSceneTool.execute(
      { sceneId: "missing", name: "x" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("更新场景失败");
  });
});

// ============================================================
// 6. delete_scene
// ============================================================
describe("delete_scene", () => {
  it("15. 场景不存在时返回错误", async () => {
    mocks.sceneService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await deleteSceneTool.execute(
      { sceneId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("场景不存在");
  });

  it("16. 有引用且 force=false 时拒绝删除", async () => {
    mocks.sceneService.getById.mockResolvedValue(ok({ id: "s1", name: "街道" }));
    mocks.checkSceneReferences.mockReturnValue({
      canDelete: false,
      references: [
        {
          elementId: "s1",
          elementType: "scene",
          elementName: "街道",
          usedInBeats: ["b1"],
          usedInStories: ["故事A"],
        },
      ],
    });

    const result = await deleteSceneTool.execute(
      { sceneId: "s1", force: false },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("被 1 处引用");
    expect(mocks.sceneService.delete).not.toHaveBeenCalled();
  });

  it("17. 无引用时正常删除", async () => {
    mocks.sceneService.getById.mockResolvedValue(ok({ id: "s2", name: "室内" }));
    mocks.sceneService.delete.mockResolvedValue(ok(undefined));

    const result = await deleteSceneTool.execute(
      { sceneId: "s2" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { deleted: boolean; sceneId: string };
    expect(data.deleted).toBe(true);
    expect(data.sceneId).toBe("s2");
  });
});

// ============================================================
// 7. tag_asset
// ============================================================
describe("tag_asset", () => {
  it("18. add 模式（character）：追加标签并去重", async () => {
    mocks.characterService.getById.mockResolvedValue(
      ok({ id: "c1", name: "角色", tags: ["主角", "冷酷"] }),
    );
    mocks.characterService.update.mockResolvedValue(ok(undefined));

    const result = await tagAssetTool.execute(
      { assetType: "character", assetId: "c1", tags: ["冷酷", "勇敢"], mode: "add" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { tags: string[] };
    expect(data.tags).toEqual(["主角", "冷酷", "勇敢"]);
    // 验证 update 被调用且传入合并后的标签
    const input = mocks.characterService.update.mock.calls[0][1];
    expect(input.tags).toEqual(["主角", "冷酷", "勇敢"]);
  });

  it("19. remove 模式（scene）：移除指定标签", async () => {
    mocks.sceneService.getById.mockResolvedValue(
      ok({ id: "s1", name: "场景", tags: ["城市", "夜晚", "雨天"] }),
    );
    mocks.sceneService.update.mockResolvedValue(ok(undefined));

    const result = await tagAssetTool.execute(
      { assetType: "scene", assetId: "s1", tags: ["夜晚", "雨天"], mode: "remove" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { tags: string[] };
    expect(data.tags).toEqual(["城市"]);
  });

  it("20. replace 模式：直接替换全部标签", async () => {
    mocks.characterService.getById.mockResolvedValue(
      ok({ id: "c1", name: "角色", tags: ["旧标签"] }),
    );
    mocks.characterService.update.mockResolvedValue(ok(undefined));

    const result = await tagAssetTool.execute(
      { assetType: "character", assetId: "c1", tags: ["新标签1", "新标签2"], mode: "replace" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { tags: string[] };
    expect(data.tags).toEqual(["新标签1", "新标签2"]);
  });

  it("21. 无效 assetType 时返回错误", async () => {
    const result = await tagAssetTool.execute(
      { assetType: "invalid", assetId: "x", tags: ["t"] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("无效的素材类型");
    expect(result.error).toContain("invalid");
  });

  it("22. 角色不存在时返回错误", async () => {
    mocks.characterService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await tagAssetTool.execute(
      { assetType: "character", assetId: "missing", tags: ["t"], mode: "add" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("角色不存在");
  });
});

// ============================================================
// 8. organize_assets
// ============================================================
describe("organize_assets", () => {
  it("23. dryRun=true（默认）时只返回建议不修改", async () => {
    mocks.characterService.getAll.mockResolvedValue(
      ok([
        { id: "c1", name: "Beta", style: "写实" },
        { id: "c2", name: "Alpha", style: "动漫" },
      ]),
    );
    mocks.sceneService.getAll.mockResolvedValue(ok([]));

    const result = await organizeAssetsTool.execute(
      { assetType: "character", sortBy: "name" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      sorted: Array<{ id: string; oldName: string; newName: string; assetType: string }>;
      total: number;
      dryRun: boolean;
    };
    expect(data.dryRun).toBe(true);
    expect(data.total).toBe(2);
    // 按 name 排序：Alpha 在前
    expect(data.sorted[0].oldName).toBe("Alpha");
    expect(data.sorted[0].newName).toBe("动漫-Alpha-01");
    expect(data.sorted[1].oldName).toBe("Beta");
    expect(data.sorted[1].newName).toBe("写实-Beta-02");
    // dryRun 模式下不调用 update
    expect(mocks.characterService.update).not.toHaveBeenCalled();
  });

  it("24. dryRun=false 时实际更新名称", async () => {
    mocks.characterService.getAll.mockResolvedValue(
      ok([{ id: "c1", name: "OldName", style: "写实" }]),
    );
    mocks.characterService.update.mockResolvedValue(ok(undefined));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));

    const result = await organizeAssetsTool.execute(
      { assetType: "character", sortBy: "name", dryRun: false },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(mocks.characterService.update).toHaveBeenCalledWith("c1", {
      id: "c1",
      name: "写实-OldName-01",
    });
  });

  it("25. sortBy=useCount 时按使用次数降序", async () => {
    mocks.characterService.getAll.mockResolvedValue(
      ok([
        { id: "c1", name: "A", style: "s", useCount: 5 },
        { id: "c2", name: "B", style: "s", useCount: 10 },
        { id: "c3", name: "C", style: "s", useCount: 1 },
      ]),
    );
    mocks.sceneService.getAll.mockResolvedValue(ok([]));

    const result = await organizeAssetsTool.execute(
      { assetType: "character", sortBy: "useCount", dryRun: true },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { sorted: Array<{ id: string }> };
    // useCount 降序：B(10) > A(5) > C(1)
    expect(data.sorted.map((s) => s.id)).toEqual(["c2", "c1", "c3"]);
  });
});

// ============================================================
// 9. deduplicate_assets
// ============================================================
describe("deduplicate_assets", () => {
  it("26. 检测到相似度高的重复素材对", async () => {
    mocks.characterService.getAll.mockResolvedValue(
      ok([
        { id: "c1", name: "Character 1" },
        { id: "c2", name: "Character 2" },
        { id: "c3", name: "完全不同的名字" },
      ]),
    );
    mocks.sceneService.getAll.mockResolvedValue(ok([]));

    const result = await deduplicateAssetsTool.execute(
      { assetType: "character", threshold: 0.85 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      duplicates: Array<{
        asset1: { id: string; name: string };
        asset2: { id: string; name: string };
        similarity: number;
      }>;
      total: number;
    };
    expect(data.total).toBe(1);
    expect(data.duplicates[0].asset1.id).toBe("c1");
    expect(data.duplicates[0].asset2.id).toBe("c2");
    expect(data.duplicates[0].similarity).toBeGreaterThanOrEqual(0.85);
  });

  it("27. 无重复时返回空列表", async () => {
    mocks.characterService.getAll.mockResolvedValue(
      ok([
        { id: "c1", name: "Alice" },
        { id: "c2", name: "Bob" },
        { id: "c3", name: "Charlie" },
      ]),
    );
    mocks.sceneService.getAll.mockResolvedValue(ok([]));

    const result = await deduplicateAssetsTool.execute(
      { assetType: "character", threshold: 0.85 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { duplicates: unknown[]; total: number };
    expect(data.duplicates).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("28. assetType=all 时同时检测角色和场景", async () => {
    mocks.characterService.getAll.mockResolvedValue(
      ok([{ id: "c1", name: "Hero A" }, { id: "c2", name: "Hero B" }]),
    );
    mocks.sceneService.getAll.mockResolvedValue(
      ok([{ id: "s1", name: "Scene X" }, { id: "s2", name: "Scene Y" }]),
    );

    const result = await deduplicateAssetsTool.execute(
      { assetType: "all", threshold: 0.5 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      duplicates: Array<{ asset1: { type: string }; asset2: { type: string } }>;
    };
    // 角色对和场景对都应该被检测到
    const types = data.duplicates.map((d) => d.asset1.type);
    expect(types).toContain("character");
    expect(types).toContain("scene");
  });
});

// ============================================================
// 导出完整性
// ============================================================
describe("assetCrudTools 导出", () => {
  it("29. 导出 9 个工具", () => {
    expect(assetCrudTools).toHaveLength(9);
    expect(assetCrudTools).toContain(createCharacterTool);
    expect(assetCrudTools).toContain(updateCharacterTool);
    expect(assetCrudTools).toContain(deleteCharacterTool);
    expect(assetCrudTools).toContain(createSceneTool);
    expect(assetCrudTools).toContain(updateSceneTool);
    expect(assetCrudTools).toContain(deleteSceneTool);
    expect(assetCrudTools).toContain(tagAssetTool);
    expect(assetCrudTools).toContain(organizeAssetsTool);
    expect(assetCrudTools).toContain(deduplicateAssetsTool);
  });

  it("30. delete 工具标记 requiresConfirmation", () => {
    expect(deleteCharacterTool.requiresConfirmation).toBe(true);
    expect(deleteSceneTool.requiresConfirmation).toBe(true);
  });
});
