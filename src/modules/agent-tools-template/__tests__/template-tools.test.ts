/**
 * Template Tools 单元测试
 *
 * 覆盖 5 个模板管理工具：
 * - list_templates：列出模板（支持分类过滤/分页）
 * - apply_template：应用模板到当前项目（创建角色/场景/故事）
 * - create_template：从当前项目创建模板
 * - import_template：导入外部模板（文件路径或 JSON 字符串）
 * - export_template：导出模板为 JSON 文件
 *
 * Mock 策略：
 * - container.templateStorage（@/infrastructure/di）
 * - characterService / sceneService / storyService（动态 import）
 * - readFile / writeFile / getCacheDirectory（@/shared/file-http）
 * - TOOL_TIMEOUTS（../../services/tool-executor）
 *
 * 测试重点：参数校验、Result 模式错误传播、分页计算、模板内容读写、内容文件缺失降级
 *
 * 注意 R175：模板相关错误消息使用英文（与原始源文件保持一致）
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted：mock 变量在 vi.mock 工厂执行前就已定义
const mocks = vi.hoisted(() => ({
  templateStorage: {
    getASTTemplates: vi.fn(),
    getASTTemplate: vi.fn(),
    saveASTTemplate: vi.fn(),
    incrementASTTemplateUsage: vi.fn(),
  },
  characterService: {
    getAll: vi.fn(),
    create: vi.fn(),
  },
  sceneService: {
    getAll: vi.fn(),
    create: vi.fn(),
  },
  storyService: {
    getById: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  readFile: vi.fn(),
  writeFile: vi.fn(),
  getCacheDirectory: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    templateStorage: mocks.templateStorage,
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

vi.mock("@/shared/file-http", () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  getCacheDirectory: mocks.getCacheDirectory,
}));

import {
  listTemplatesTool,
  applyTemplateTool,
  createTemplateTool,
  importTemplateTool,
  exportTemplateTool,
  templateTools,
} from "../template-tools";
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


/** 构造文本 ArrayBuffer（模拟 readFile 返回的 data） */
function textBuffer(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  return encoded.buffer.slice(0, encoded.byteLength) as ArrayBuffer;
}

beforeEach(() => {
  vi.resetAllMocks();
  // 默认 getCacheDirectory 成功
  mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
  // 默认 writeFile 成功
  mocks.writeFile.mockResolvedValue({ success: true });
});

// ============================================================
// 1. list_templates
// ============================================================
describe("list_templates", () => {
  it("1. 正常列出模板（默认分页）", async () => {
    mocks.templateStorage.getASTTemplates.mockResolvedValue([
      { id: "t1", name: "模板1", category: "wuxia", description: "D1", usage_count: 5 },
      { id: "t2", name: "模板2", category: "scifi", description: "D2", usage_count: 0 },
    ]);

    const result = await listTemplatesTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      offset: number;
      limit: number;
      items: Array<{ id: string; name: string; usageCount: number }>;
    };
    expect(data.total).toBe(2);
    expect(data.offset).toBe(0);
    expect(data.limit).toBe(20);
    expect(data.items).toHaveLength(2);
    expect(data.items[0].id).toBe("t1");
    expect(data.items[0].usageCount).toBe(5);
  });

  it("2. 按 category 过滤", async () => {
    mocks.templateStorage.getASTTemplates.mockResolvedValue([
      { id: "t1", name: "武侠模板", category: "wuxia" },
    ]);

    const result = await listTemplatesTool.execute(
      { category: "wuxia" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    // 验证 category 传给 storage
    const args = mocks.templateStorage.getASTTemplates.mock.calls[0][0];
    expect(args.category).toBe("wuxia");
  });

  it("3. 分页（offset/limit）", async () => {
    const all = Array.from({ length: 25 }, (_, i) => ({
      id: `t${i}`,
      name: `T${i}`,
    }));
    mocks.templateStorage.getASTTemplates.mockResolvedValue(all);

    const result = await listTemplatesTool.execute(
      { limit: 10, offset: 5 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      offset: number;
      limit: number;
      items: Array<{ id: string }>;
    };
    expect(data.total).toBe(25);
    expect(data.offset).toBe(5);
    expect(data.limit).toBe(10);
    expect(data.items).toHaveLength(10);
    expect(data.items[0].id).toBe("t5");
    expect(data.items[9].id).toBe("t14");
  });

  it("4. limit 超过 100 时被截断为 100", async () => {
    mocks.templateStorage.getASTTemplates.mockResolvedValue([]);

    const result = await listTemplatesTool.execute(
      { limit: 500 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { limit: number };
    expect(data.limit).toBe(100);
  });

  it("5. storage 抛出异常时返回错误", async () => {
    mocks.templateStorage.getASTTemplates.mockRejectedValue(new Error("DB error"));

    const result = await listTemplatesTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("查询模板列表失败");
    expect(result.error).toContain("DB error");
  });
});

// ============================================================
// 2. apply_template
// ============================================================
describe("apply_template", () => {
  it("6. 正常应用模板（创建新故事 + 角色 + 场景）", async () => {
    const templateContent = {
      name: "武侠故事模板",
      description: "一个武侠故事",
      category: "wuxia",
      genre: "wuxia",
      tone: "serious",
      characters: [{ name: "主角", description: "剑客" }],
      scenes: [{ name: "竹林", description: "幽静竹林" }],
      story: { title: "竹林剑影" },
    };
    mocks.templateStorage.getASTTemplate.mockResolvedValue({
      id: "t1",
      name: "武侠故事模板",
      astFilePath: "/cache/templates/t1.json",
    });
    mocks.readFile.mockResolvedValue({
      success: true,
      data: textBuffer(JSON.stringify(templateContent)),
    });
    mocks.characterService.create.mockResolvedValue(ok({ id: "c1", name: "主角" }));
    mocks.sceneService.create.mockResolvedValue(ok({ id: "s1", name: "竹林" }));
    mocks.storyService.create.mockResolvedValue(ok({ id: "story1", title: "竹林剑影" }));
    mocks.templateStorage.incrementASTTemplateUsage.mockResolvedValue(undefined);

    const result = await applyTemplateTool.execute(
      { templateId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      applied: boolean;
      createdCharacters: string[];
      createdScenes: string[];
      createdStory: string;
      templateName: string;
    };
    expect(data.applied).toBe(true);
    expect(data.createdCharacters).toEqual(["c1"]);
    expect(data.createdScenes).toEqual(["s1"]);
    expect(data.createdStory).toBe("story1");
    expect(data.templateName).toBe("武侠故事模板");
    // 验证使用计数增加
    expect(mocks.templateStorage.incrementASTTemplateUsage).toHaveBeenCalledWith("t1");
  });

  it("7. 应用到已有故事（targetStoryId）", async () => {
    const templateContent = {
      name: "T",
      description: "D",
      category: "custom",
      characters: [{ name: "新角色" }],
      scenes: [],
      story: null,
    };
    mocks.templateStorage.getASTTemplate.mockResolvedValue({
      id: "t1",
      astFilePath: "/cache/t1.json",
    });
    mocks.readFile.mockResolvedValue({
      success: true,
      data: textBuffer(JSON.stringify(templateContent)),
    });
    mocks.characterService.create.mockResolvedValue(ok({ id: "c_new", name: "新角色" }));
    mocks.storyService.getById.mockResolvedValue(ok({
      id: "existing_story",
      title: "已有故事",
      characters: ["c_old"],
      scenes: ["s_old"],
    }));
    mocks.storyService.update.mockResolvedValue(ok(undefined));

    const result = await applyTemplateTool.execute(
      { templateId: "t1", targetStoryId: "existing_story" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { createdStory: string; createdCharacters: string[] };
    expect(data.createdStory).toBe("existing_story");
    expect(data.createdCharacters).toEqual(["c_new"]);
    // 验证合并角色 ID（去重）
    const updateArgs = mocks.storyService.update.mock.calls[0][1];
    expect(updateArgs.characters).toEqual(["c_old", "c_new"]);
    expect(updateArgs.scenes).toEqual(["s_old"]);
  });

  it("8. 模板不存在时返回错误", async () => {
    mocks.templateStorage.getASTTemplate.mockResolvedValue(null);

    const result = await applyTemplateTool.execute(
      { templateId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("模板不存在");
    expect(result.error).toContain("missing");
  });

  it("9. getASTTemplate 抛出异常时返回错误", async () => {
    mocks.templateStorage.getASTTemplate.mockRejectedValue(new Error("DB locked"));

    const result = await applyTemplateTool.execute(
      { templateId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取模板失败");
    expect(result.error).toContain("DB locked");
  });

  it("10. overrideCharacters=false 时跳过角色创建", async () => {
    const templateContent = {
      name: "T",
      description: "D",
      category: "custom",
      characters: [{ name: "应被跳过" }],
      scenes: [],
      story: null,
    };
    mocks.templateStorage.getASTTemplate.mockResolvedValue({
      id: "t1",
      astFilePath: "/cache/t1.json",
    });
    mocks.readFile.mockResolvedValue({
      success: true,
      data: textBuffer(JSON.stringify(templateContent)),
    });
    mocks.storyService.create.mockResolvedValue(ok({ id: "s_new", title: "T - 故事" }));

    const result = await applyTemplateTool.execute(
      { templateId: "t1", options: { overrideCharacters: false, overrideScenes: false } },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { createdCharacters: string[]; createdScenes: string[] };
    expect(data.createdCharacters).toEqual([]);
    expect(data.createdScenes).toEqual([]);
    expect(mocks.characterService.create).not.toHaveBeenCalled();
  });

  it("11. 内容文件读取失败时使用元数据构建最小内容", async () => {
    mocks.templateStorage.getASTTemplate.mockResolvedValue({
      id: "t1",
      name: "元数据模板",
      description: "从元数据",
      category: "custom",
      // 无 astFilePath
    });
    mocks.storyService.create.mockResolvedValue(ok({ id: "s1", title: "T" }));

    const result = await applyTemplateTool.execute(
      { templateId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { templateName: string };
    expect(data.templateName).toBe("元数据模板");
    // 验证未读取内容文件
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});

// ============================================================
// 3. create_template
// ============================================================
describe("create_template", () => {
  it("12. 正常创建模板（包含角色/场景/节拍）", async () => {
    mocks.characterService.getAll.mockResolvedValue(ok([
      { id: "c1", name: "角色A", description: "D", gender: "男", style: "写实", age: 25, tags: ["主角"] },
    ]));
    mocks.sceneService.getAll.mockResolvedValue(ok([
      { id: "s1", name: "场景A", description: "D", type: "室内", timeOfDay: "白天", weather: "晴", mood: "欢快", tags: [] },
    ]));
    mocks.storyService.getAll.mockResolvedValue(ok([
      {
        id: "story1",
        title: "故事",
        description: "故事描述",
        genre: "wuxia",
        tone: "serious",
        targetDuration: 120,
        beats: [{ id: "b1", title: "开场", description: "D", type: "intro", duration: 10, content: "C" }],
      },
    ]));
    mocks.templateStorage.saveASTTemplate.mockResolvedValue(undefined);

    const result = await createTemplateTool.execute(
      {
        name: "新模板",
        description: "模板描述",
        category: "wuxia",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      templateId: string;
      name: string;
      includedItems: { characters: number; scenes: number; beats: number };
    };
    expect(data.templateId).toMatch(/^ast_\d+_/);
    expect(data.name).toBe("新模板");
    expect(data.includedItems.characters).toBe(1);
    expect(data.includedItems.scenes).toBe(1);
    expect(data.includedItems.beats).toBe(1);
    // 验证元数据保存调用
    const saveArgs = mocks.templateStorage.saveASTTemplate.mock.calls[0][0];
    expect(saveArgs.name).toBe("新模板");
    expect(saveArgs.category).toBe("wuxia");
    expect(saveArgs.author).toBe("agent");
    expect(saveArgs.beatsCount).toBe(1);
    expect(saveArgs.charactersCount).toBe(1);
    expect(saveArgs.scenesCount).toBe(1);
  });

  it("13. name 为空时返回错误", async () => {
    const result = await createTemplateTool.execute(
      { name: "  ", description: "D", category: "wuxia" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("name 不能为空");
    expect(mocks.templateStorage.saveASTTemplate).not.toHaveBeenCalled();
  });

  it("14. description 为空时返回错误", async () => {
    const result = await createTemplateTool.execute(
      { name: "N", description: "", category: "wuxia" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("description 不能为空");
  });

  it("15. category 为空时返回错误", async () => {
    const result = await createTemplateTool.execute(
      { name: "N", description: "D", category: "" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("category 不能为空");
  });

  it("16. writeTemplateContent 失败时返回错误", async () => {
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.storyService.getAll.mockResolvedValue(ok([]));
    mocks.getCacheDirectory.mockResolvedValue({ success: false, error: "no disk" });

    const result = await createTemplateTool.execute(
      { name: "N", description: "D", category: "custom" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("创建模板失败");
  });

  it("17. includeCharacters=false 时跳过角色收集", async () => {
    mocks.sceneService.getAll.mockResolvedValue(ok([
      { id: "s1", name: "场景", description: "", type: "", timeOfDay: "", weather: "", mood: "", tags: [] },
    ]));
    mocks.storyService.getAll.mockResolvedValue(ok([]));
    mocks.templateStorage.saveASTTemplate.mockResolvedValue(undefined);

    const result = await createTemplateTool.execute(
      {
        name: "N",
        description: "D",
        category: "custom",
        includeCharacters: false,
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { includedItems: { characters: number; scenes: number } };
    expect(data.includedItems.characters).toBe(0);
    expect(mocks.characterService.getAll).not.toHaveBeenCalled();
  });

  it("18. 指定 sourceStoryId 时使用指定故事", async () => {
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.storyService.getById.mockResolvedValue(ok({
      id: "specific",
      title: "指定故事",
      description: "D",
      genre: "scifi",
      tone: "tense",
      targetDuration: 60,
      beats: [{ id: "b1", title: "B", description: "D", type: "intro", duration: 5, content: "C" }],
    }));
    mocks.templateStorage.saveASTTemplate.mockResolvedValue(undefined);

    const result = await createTemplateTool.execute(
      {
        name: "N",
        description: "D",
        category: "scifi",
        sourceStoryId: "specific",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(mocks.storyService.getById).toHaveBeenCalledWith("specific");
    const saveArgs = mocks.templateStorage.saveASTTemplate.mock.calls[0][0];
    expect(saveArgs.genre).toBe("scifi");
    expect(saveArgs.beatsCount).toBe(1);
  });
});

// ============================================================
// 4. import_template
// ============================================================
describe("import_template", () => {
  it("19. 从 JSON 字符串导入", async () => {
    const templateJson = JSON.stringify({
      name: "导入模板",
      description: "从 JSON",
      category: "custom",
      characters: [{ name: "C1" }],
    });
    mocks.templateStorage.saveASTTemplate.mockResolvedValue(undefined);

    const result = await importTemplateTool.execute(
      { templateJson },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { templateId: string; name: string; imported: boolean };
    expect(data.templateId).toMatch(/^ast_\d+_/);
    expect(data.name).toBe("导入模板");
    expect(data.imported).toBe(true);
    // 验证未调用 readFile
    expect(mocks.readFile).not.toHaveBeenCalled();
    // 验证元数据保存
    const saveArgs = mocks.templateStorage.saveASTTemplate.mock.calls[0][0];
    expect(saveArgs.author).toBe("import");
    expect(saveArgs.charactersCount).toBe(1);
  });

  it("20. 从文件路径导入", async () => {
    const templateContent = {
      name: "文件模板",
      description: "从文件",
      category: "wuxia",
      beats: [{ title: "B1" }],
    };
    mocks.readFile.mockResolvedValue({
      success: true,
      data: textBuffer(JSON.stringify(templateContent)),
    });
    mocks.templateStorage.saveASTTemplate.mockResolvedValue(undefined);

    const result = await importTemplateTool.execute(
      { templatePath: "/path/to/template.json" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { name: string; imported: boolean };
    expect(data.name).toBe("文件模板");
    expect(mocks.readFile).toHaveBeenCalledWith("/path/to/template.json");
    const saveArgs = mocks.templateStorage.saveASTTemplate.mock.calls[0][0];
    expect(saveArgs.beatsCount).toBe(1);
  });

  it("21. 未提供 templatePath/templateJson 时返回错误", async () => {
    const result = await importTemplateTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("需提供 templatePath 或 templateJson 之一");
  });

  it("22. templateJson 非法 JSON 时返回错误", async () => {
    const result = await importTemplateTool.execute(
      { templateJson: "{invalid json}" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("templateJson 解析失败");
  });

  it("23. 模板格式非法（缺 name）时返回错误", async () => {
    const templateJson = JSON.stringify({
      // 缺 name
      description: "D",
      category: "custom",
    });

    const result = await importTemplateTool.execute(
      { templateJson },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("模板格式非法");
    expect(mocks.templateStorage.saveASTTemplate).not.toHaveBeenCalled();
  });

  it("24. 模板格式非法（name 为空字符串）时返回错误", async () => {
    const templateJson = JSON.stringify({
      name: "  ",
      description: "D",
      category: "custom",
    });

    const result = await importTemplateTool.execute(
      { templateJson },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("模板格式非法");
  });

  it("25. 文件读取失败时返回错误", async () => {
    mocks.readFile.mockResolvedValue({
      success: false,
      error: "文件不存在",
    });

    const result = await importTemplateTool.execute(
      { templatePath: "/missing.json" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("读取模板文件失败");
  });

  it("26. 文件内容非合法 JSON 时返回错误", async () => {
    mocks.readFile.mockResolvedValue({
      success: true,
      data: textBuffer("not a json"),
    });

    const result = await importTemplateTool.execute(
      { templatePath: "/bad.json" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("模板 JSON 解析失败");
  });
});

// ============================================================
// 5. export_template
// ============================================================
describe("export_template", () => {
  it("27. 正常导出（含内容文件）", async () => {
    const templateContent = {
      name: "导出模板",
      description: "D",
      category: "wuxia",
      characters: [{ name: "C1" }],
    };
    mocks.templateStorage.getASTTemplate.mockResolvedValue({
      id: "t1",
      name: "导出模板",
      astFilePath: "/cache/t1.json",
    });
    mocks.readFile.mockResolvedValue({
      success: true,
      data: textBuffer(JSON.stringify(templateContent)),
    });
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await exportTemplateTool.execute(
      { templateId: "t1", outputPath: "/output/t1.json" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputPath: string; templateName: string };
    expect(data.outputPath).toBe("/output/t1.json");
    expect(data.templateName).toBe("导出模板");
    // 验证 writeFile 被调用
    expect(mocks.writeFile).toHaveBeenCalled();
  });

  it("28. 模板不存在时返回错误", async () => {
    mocks.templateStorage.getASTTemplate.mockResolvedValue(null);

    const result = await exportTemplateTool.execute(
      { templateId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("模板不存在");
    expect(result.error).toContain("missing");
  });

  it("29. 未指定 outputPath 时使用缓存目录", async () => {
    mocks.templateStorage.getASTTemplate.mockResolvedValue({
      id: "t1",
      name: "T",
      // 无 astFilePath，会走元数据导出
    });
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await exportTemplateTool.execute(
      { templateId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputPath: string };
    expect(data.outputPath).toContain("/cache/templates/t1_");
    expect(data.outputPath).toContain(".json");
  });

  it("30. getCacheDirectory 失败时返回错误", async () => {
    mocks.templateStorage.getASTTemplate.mockResolvedValue({
      id: "t1",
      name: "T",
    });
    mocks.getCacheDirectory.mockResolvedValue({ success: false, error: "no cache" });

    const result = await exportTemplateTool.execute(
      { templateId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取缓存目录失败");
  });

  it("31. writeFile 失败时返回错误", async () => {
    mocks.templateStorage.getASTTemplate.mockResolvedValue({
      id: "t1",
      name: "T",
    });
    mocks.writeFile.mockResolvedValue({ success: false, error: "disk full" });

    const result = await exportTemplateTool.execute(
      { templateId: "t1", outputPath: "/out.json" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("写入导出文件失败");
    expect(result.error).toContain("disk full");
  });

  it("32. 内容文件读取失败时降级为元数据导出", async () => {
    mocks.templateStorage.getASTTemplate.mockResolvedValue({
      id: "t1",
      name: "元数据导出",
      description: "D",
      category: "custom",
      astFilePath: "/cache/missing.json",
      beats_count: 5,
    });
    // 内容文件读取失败
    mocks.readFile.mockResolvedValue({ success: false });
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await exportTemplateTool.execute(
      { templateId: "t1", outputPath: "/out.json" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    // writeFile 应该被调用（导出元数据 JSON）
    expect(mocks.writeFile).toHaveBeenCalled();
    // 验证写入的内容包含元数据字段
    const writeArgs = mocks.writeFile.mock.calls[0];
    const buffer = writeArgs[1] as ArrayBuffer;
    const text = new TextDecoder().decode(buffer);
    expect(text).toContain("元数据导出");
    expect(text).toContain("beatsCount");
    expect(text).toContain("5");
  });
});

// ============================================================
// 导出完整性
// ============================================================
describe("templateTools 导出", () => {
  it("33. 导出 5 个工具", () => {
    expect(templateTools).toHaveLength(5);
    expect(templateTools).toContain(listTemplatesTool);
    expect(templateTools).toContain(applyTemplateTool);
    expect(templateTools).toContain(createTemplateTool);
    expect(templateTools).toContain(importTemplateTool);
    expect(templateTools).toContain(exportTemplateTool);
  });
});
