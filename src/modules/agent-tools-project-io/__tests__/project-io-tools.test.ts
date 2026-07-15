/**
 * Project I/O Tools 单元测试
 *
 * 4 个项目导入导出工具的关键路径测试：
 * - export_project：导出全量项目数据为 JSON
 * - import_project：从 JSON 文件导入项目数据
 * - export_characters：导出指定角色为 ASA 文件
 * - export_scenes：导出指定场景为 ASA 文件
 *
 * Mock 策略：
 * - @/modules/asset/import-export：exportData / importData（动态导入）
 * - @/modules/asset：assetExportService / characterService / sceneService（动态导入）
 * - @/shared/file-http：writeFile / readFile / getCacheDirectory（静态导入）
 * - ../../services/tool-executor：TOOL_TIMEOUTS 常量
 *
 * 测试重点：
 * - Result<T> 错误传播（exportData/importData 失败时 String(error) 转换）
 * - 默认输出路径解析（getCacheDirectory 失败时抛错）
 * - asset 模块 characterService.getAll() 返回直接数组（非 Result）
 * - import_project 的 readFile null 检查与 JSON 解析错误
 * - 未指定 ID 时自动导出全部（getAll → map id）
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  exportData: vi.fn(),
  importData: vi.fn(),
  assetExportService: {
    exportCharacters: vi.fn(),
    exportScenes: vi.fn(),
  },
  characterService: {
    getAll: vi.fn(),
  },
  sceneService: {
    getAll: vi.fn(),
  },
  writeFile: vi.fn(),
  readFile: vi.fn(),
  getCacheDirectory: vi.fn(),
}));

vi.mock("@/modules/asset/import-export", () => ({
  exportData: mocks.exportData,
  importData: mocks.importData,
}));

vi.mock("@/modules/asset", () => ({
  assetExportService: mocks.assetExportService,
  characterService: mocks.characterService,
  sceneService: mocks.sceneService,
}));

vi.mock("@/shared/file-http", () => ({
  writeFile: mocks.writeFile,
  readFile: mocks.readFile,
  getCacheDirectory: mocks.getCacheDirectory,
}));

import {
  exportProjectTool,
  importProjectTool,
  exportCharactersTool,
  exportScenesTool,
  projectIoTools,
} from "../project-io-tools";
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
function err(error: unknown): { ok: false; error: unknown } {
  return { ok: false, error };
}

beforeEach(() => {
  vi.resetAllMocks();
  // 默认缓存目录可用
  mocks.getCacheDirectory.mockResolvedValue({
    success: true,
    path: "/cache",
  });
});

// ============================================================
// 1. export_project
// ============================================================
describe("export_project", () => {
  it("1. 正常导出（含统计与默认输出路径）", async () => {
    const projectData = {
      characters: [{ id: "c1" }, { id: "c2" }],
      scenes: [{ id: "s1" }],
      stories: [],
      exportedAt: "2026-07-07T00:00:00.000Z",
    };
    mocks.exportData.mockResolvedValue(ok(projectData));
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await exportProjectTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      outputPath: string;
      fileSize: number;
      stats: Record<string, number>;
      exportedAt: string;
    };
    // 默认输出路径包含 project-exports 子目录
    expect(data.outputPath).toContain("project-exports");
    expect(data.outputPath).toContain(".json");
    expect(data.stats.characters).toBe(2);
    expect(data.stats.scenes).toBe(1);
    expect(data.stats.stories).toBe(0);
    expect(data.exportedAt).toBe("2026-07-07T00:00:00.000Z");
    // 验证 writeFile 被调用且传入 JSON 字符串
    const writtenContent = mocks.writeFile.mock.calls[0][1] as string;
    expect(writtenContent).toContain("characters");
    expect(writtenContent).toContain("c1");
  });

  it("2. 自定义输出路径被使用", async () => {
    mocks.exportData.mockResolvedValue(ok({ characters: [] }));
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await exportProjectTool.execute(
      { outputPath: "/custom/path.json" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputPath: string };
    expect(data.outputPath).toBe("/custom/path.json");
    expect(mocks.writeFile).toHaveBeenCalledWith("/custom/path.json", expect.any(String));
  });

  it("3. exportData 失败时返回错误（String(error) 转换）", async () => {
    mocks.exportData.mockResolvedValue(err(new Error("DB locked")));

    const result = await exportProjectTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("DB locked");
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("4. writeFile 失败时返回错误", async () => {
    mocks.exportData.mockResolvedValue(ok({ characters: [] }));
    mocks.writeFile.mockResolvedValue({ success: false, error: "磁盘已满" });

    const result = await exportProjectTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("磁盘已满");
  });

  it("5. getCacheDirectory 失败时抛错（resolveOutputPath 内部 throw，execute 无 try/catch）", async () => {
    mocks.exportData.mockResolvedValue(ok({ characters: [] }));
    mocks.getCacheDirectory.mockResolvedValue({ success: false, error: "no cache" });

    // resolveOutputPath 抛错，execute 未 try/catch，Promise rejection 传播
    await expect(exportProjectTool.execute({}, makeCtx())).rejects.toThrow(
      "Failed to get cache directory",
    );
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});

// ============================================================
// 2. import_project
// ============================================================
describe("import_project", () => {
  it("6. 正常导入（默认 merge 策略）", async () => {
    const fileContent = new TextEncoder().encode(JSON.stringify({ characters: [] }));
    mocks.readFile.mockResolvedValue({ success: true, data: fileContent });
    mocks.importData.mockResolvedValue(
      ok({ imported: { characters: 5, scenes: 2 }, errors: [] }),
    );

    const result = await importProjectTool.execute(
      { filePath: "/path/to/project.json" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      imported: Record<string, number>;
      errors: string[];
      mergeStrategy: string;
    };
    expect(data.imported.characters).toBe(5);
    expect(data.imported.scenes).toBe(2);
    expect(data.mergeStrategy).toBe("merge");
    // 验证 importData 被调用时传入 mergeStrategy
    const importArgs = mocks.importData.mock.calls[0][1] as { mergeStrategy: string };
    expect(importArgs.mergeStrategy).toBe("merge");
  });

  it("7. 指定 replace 策略被传递", async () => {
    const fileContent = new TextEncoder().encode(JSON.stringify({}));
    mocks.readFile.mockResolvedValue({ success: true, data: fileContent });
    mocks.importData.mockResolvedValue(ok({ imported: {}, errors: [] }));

    await importProjectTool.execute(
      { filePath: "/p.json", mergeStrategy: "replace" },
      makeCtx(),
    );

    const importArgs = mocks.importData.mock.calls[0][1] as { mergeStrategy: string };
    expect(importArgs.mergeStrategy).toBe("replace");
  });

  it("8. readFile 返回 null（服务不可用）时返回错误", async () => {
    mocks.readFile.mockResolvedValue(null);

    const result = await importProjectTool.execute(
      { filePath: "/missing.json" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("读取文件失败");
    expect(mocks.importData).not.toHaveBeenCalled();
  });

  it("9. readFile 失败时返回错误", async () => {
    mocks.readFile.mockResolvedValue({ success: false, error: "权限拒绝" });

    const result = await importProjectTool.execute(
      { filePath: "/p.json" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("权限拒绝");
  });

  it("10. JSON 解析失败时返回错误", async () => {
    const invalidJson = new TextEncoder().encode("{ invalid json");
    mocks.readFile.mockResolvedValue({ success: true, data: invalidJson });

    const result = await importProjectTool.execute(
      { filePath: "/p.json" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("JSON 解析失败");
    expect(mocks.importData).not.toHaveBeenCalled();
  });

  it("11. importData 失败时返回错误", async () => {
    const fileContent = new TextEncoder().encode(JSON.stringify({}));
    mocks.readFile.mockResolvedValue({ success: true, data: fileContent });
    mocks.importData.mockResolvedValue(err(new Error("schema 不匹配")));

    const result = await importProjectTool.execute(
      { filePath: "/p.json" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("schema 不匹配");
  });
});

// ============================================================
// 3. export_characters
// ============================================================
describe("export_characters", () => {
  it("12. 指定 characterIds 时导出指定角色", async () => {
    mocks.assetExportService.exportCharacters.mockResolvedValue(ok("asa-content"));
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await exportCharactersTool.execute(
      { characterIds: ["c1", "c2"] },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputPath: string; characterCount: number };
    expect(data.characterCount).toBe(2);
    expect(data.outputPath).toContain("character-exports");
    expect(data.outputPath).toContain(".asa");
    // 验证未调用 getAll（已提供 ID）
    expect(mocks.characterService.getAll).not.toHaveBeenCalled();
    expect(mocks.assetExportService.exportCharacters).toHaveBeenCalledWith(["c1", "c2"]);
  });

  it("13. 未指定 characterIds 时导出全部角色（getAll 返回直接数组）", async () => {
    mocks.characterService.getAll.mockResolvedValue([
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
      { id: "c3", name: "C" },
    ]);
    mocks.assetExportService.exportCharacters.mockResolvedValue(ok("asa"));
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await exportCharactersTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { characterCount: number };
    expect(data.characterCount).toBe(3);
    expect(mocks.assetExportService.exportCharacters).toHaveBeenCalledWith(["c1", "c2", "c3"]);
  });

  it("14. 没有可导出的角色时返回错误", async () => {
    mocks.characterService.getAll.mockResolvedValue([]);

    const result = await exportCharactersTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("没有可导出的角色");
    expect(mocks.assetExportService.exportCharacters).not.toHaveBeenCalled();
  });

  it("15. exportCharacters 服务失败时返回错误", async () => {
    mocks.assetExportService.exportCharacters.mockResolvedValue(err(new Error("打包失败")));

    const result = await exportCharactersTool.execute(
      { characterIds: ["c1"] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("打包失败");
  });

  it("16. writeFile 失败时返回错误", async () => {
    mocks.assetExportService.exportCharacters.mockResolvedValue(ok("asa"));
    mocks.writeFile.mockResolvedValue({ success: false, error: "磁盘满" });

    const result = await exportCharactersTool.execute(
      { characterIds: ["c1"] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("磁盘满");
  });
});

// ============================================================
// 4. export_scenes
// ============================================================
describe("export_scenes", () => {
  it("17. 指定 sceneIds 时导出指定场景", async () => {
    mocks.assetExportService.exportScenes.mockResolvedValue(ok("asa-scene"));
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await exportScenesTool.execute(
      { sceneIds: ["s1", "s2"] },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputPath: string; sceneCount: number };
    expect(data.sceneCount).toBe(2);
    expect(data.outputPath).toContain("scene-exports");
    expect(mocks.sceneService.getAll).not.toHaveBeenCalled();
    expect(mocks.assetExportService.exportScenes).toHaveBeenCalledWith(["s1", "s2"]);
  });

  it("18. 未指定 sceneIds 时导出全部场景", async () => {
    mocks.sceneService.getAll.mockResolvedValue([
      { id: "s1", name: "A" },
      { id: "s2", name: "B" },
    ]);
    mocks.assetExportService.exportScenes.mockResolvedValue(ok("asa"));
    mocks.writeFile.mockResolvedValue({ success: true });

    const result = await exportScenesTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    expect(mocks.assetExportService.exportScenes).toHaveBeenCalledWith(["s1", "s2"]);
  });

  it("19. 没有可导出的场景时返回错误", async () => {
    mocks.sceneService.getAll.mockResolvedValue([]);

    const result = await exportScenesTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("没有可导出的场景");
  });

  it("20. exportScenes 服务失败时返回错误", async () => {
    mocks.assetExportService.exportScenes.mockResolvedValue(err(new Error("打包失败")));

    const result = await exportScenesTool.execute(
      { sceneIds: ["s1"] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("打包失败");
  });
});

// ============================================================
// 导出完整性
// ============================================================
describe("projectIoTools 导出", () => {
  it("21. 导出 4 个工具", () => {
    expect(projectIoTools).toHaveLength(4);
    expect(projectIoTools).toContain(exportProjectTool);
    expect(projectIoTools).toContain(importProjectTool);
    expect(projectIoTools).toContain(exportCharactersTool);
    expect(projectIoTools).toContain(exportScenesTool);
  });

  it("22. 工具名正确", () => {
    const names = projectIoTools.map((t) => t.def.function.name);
    expect(names).toContain("export_project");
    expect(names).toContain("import_project");
    expect(names).toContain("export_characters");
    expect(names).toContain("export_scenes");
  });

  it("23. 所有工具 domain 为 project-io", () => {
    for (const tool of projectIoTools) {
      expect(tool.domain).toBe("project-io");
    }
  });
});
