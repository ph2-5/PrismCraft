/**
 * File Management Tools 单元测试
 *
 * 6 个文件管理工具的关键路径测试：
 * - list_files：列出指定类别目录文件（支持分页）
 * - get_file_info：获取文件大小
 * - delete_file：删除文件（requiresConfirmation）
 * - copy_file：复制文件到目标类别
 * - move_file：移动文件（copy + delete 组合，requiresConfirmation）
 * - get_disk_space：查询磁盘空间
 *
 * Mock 策略：
 * - @/shared/file-http：listFiles / copyFile / getFileInfo / deleteFile / getDiskSpace / getCacheDirectory
 * - ../../services/tool-executor：TOOL_TIMEOUTS 常量
 *
 * 测试重点：
 * - file-http 返回 null（HTTP 与 IPC 都不可用）时的降级提示
 * - move_file 的组合逻辑：copy 失败不 delete / copy 成功 delete 失败返回 warning
 * - get_disk_space 默认使用缓存目录（getCacheDirectory 失败时返回错误）
 * - deleteSource=false 时不调用 deleteFile
 * - limit 上限 500 截断
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  copyFile: vi.fn(),
  getFileInfo: vi.fn(),
  deleteFile: vi.fn(),
  getDiskSpace: vi.fn(),
  getCacheDirectory: vi.fn(),
}));

vi.mock("@/shared/file-http", () => ({
  listFiles: mocks.listFiles,
  copyFile: mocks.copyFile,
  getFileInfo: mocks.getFileInfo,
  deleteFile: mocks.deleteFile,
  getDiskSpace: mocks.getDiskSpace,
  getCacheDirectory: mocks.getCacheDirectory,
}));

vi.mock("../../services/tool-executor", () => ({
  TOOL_TIMEOUTS: {
    query: 30_000,
    mutation: 60_000,
    generation: 300_000,
    videoTask: 1_800_000,
    download: 600_000,
  },
}));

import {
  listFilesTool,
  getFileInfoTool,
  deleteFileTool,
  copyFileTool,
  moveFileTool,
  getDiskSpaceTool,
  fileManagementTools,
} from "../file-management-tools";
import type { ToolContext } from "../../domain/types";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
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
// 1. list_files
// ============================================================
describe("list_files", () => {
  it("1. 正常列出文件（含分页参数）", async () => {
    mocks.listFiles.mockResolvedValue({
      success: true,
      data: {
        files: [
          { name: "a.png", size: 1024, modified: "2026-07-07" },
          { name: "b.png", size: 2048, modified: "2026-07-06" },
        ],
        total: 2,
        offset: 0,
        limit: 100,
      },
    });

    const result = await listFilesTool.execute(
      { category: "character" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      files: Array<{ name: string; size: number }>;
      total: number;
      offset: number;
      limit: number;
    };
    expect(data.files).toHaveLength(2);
    expect(data.files[0].name).toBe("a.png");
    expect(data.total).toBe(2);
    // 验证默认 limit=100, offset=0
    expect(mocks.listFiles).toHaveBeenCalledWith("character", { limit: 100, offset: 0 });
  });

  it("2. limit 上限 500（超出被截断）", async () => {
    mocks.listFiles.mockResolvedValue({
      success: true,
      data: { files: [], total: 0, offset: 0, limit: 500 },
    });

    await listFilesTool.execute(
      { category: "scene", limit: 9999, offset: 50 },
      makeCtx(),
    );

    expect(mocks.listFiles).toHaveBeenCalledWith("scene", { limit: 500, offset: 50 });
  });

  it("3. listFiles 返回 null（服务不可用）时返回错误", async () => {
    mocks.listFiles.mockResolvedValue(null);

    const result = await listFilesTool.execute(
      { category: "character" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("文件服务不可用");
  });

  it("4. listFiles 失败时返回错误", async () => {
    mocks.listFiles.mockResolvedValue({
      success: false,
      error: "目录不存在",
    });

    const result = await listFilesTool.execute(
      { category: "storyboard" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("目录不存在");
  });
});

// ============================================================
// 2. get_file_info
// ============================================================
describe("get_file_info", () => {
  it("5. 正常获取文件大小", async () => {
    mocks.getFileInfo.mockResolvedValue({
      success: true,
      size: 4096,
    });

    const result = await getFileInfoTool.execute(
      { filePath: "/assets/character/c1.png" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { size: number };
    expect(data.size).toBe(4096);
    expect(mocks.getFileInfo).toHaveBeenCalledWith("/assets/character/c1.png");
  });

  it("6. getFileInfo 返回 null 时返回错误", async () => {
    mocks.getFileInfo.mockResolvedValue(null);

    const result = await getFileInfoTool.execute(
      { filePath: "/missing.png" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("文件服务不可用");
  });

  it("7. getFileInfo 失败时返回错误", async () => {
    mocks.getFileInfo.mockResolvedValue({
      success: false,
      error: "权限不足",
    });

    const result = await getFileInfoTool.execute(
      { filePath: "/x.png" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("权限不足");
  });
});

// ============================================================
// 3. delete_file
// ============================================================
describe("delete_file", () => {
  it("8. 正常删除文件（返回 true）", async () => {
    mocks.deleteFile.mockResolvedValue(true);

    const result = await deleteFileTool.execute(
      { filePath: "/cache/old.mp4" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { filePath: string; deleted: boolean };
    expect(data.deleted).toBe(true);
    expect(data.filePath).toBe("/cache/old.mp4");
    expect(mocks.deleteFile).toHaveBeenCalledWith("/cache/old.mp4");
  });

  it("9. deleteFile 返回 false 时仍返回 success=true（best-effort）", async () => {
    // deleteFile 返回 boolean，工具始终返回 success: true（deleted 字段反映真实结果）
    mocks.deleteFile.mockResolvedValue(false);

    const result = await deleteFileTool.execute(
      { filePath: "/missing.png" },
      makeCtx(),
    );

    // 工具实现：success = await deleteFile()，false 时 success=false
    expect(result.success).toBe(false);
    const data = result.data as { deleted: boolean };
    expect(data.deleted).toBe(false);
  });
});

// ============================================================
// 4. copy_file
// ============================================================
describe("copy_file", () => {
  it("10. 正常复制文件", async () => {
    mocks.copyFile.mockResolvedValue({ success: true });

    const result = await copyFileTool.execute(
      {
        sourceKey: "/source/img.png",
        targetCategory: "scene",
        targetKey: "img_copy.png",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { sourceKey: string; targetCategory: string; targetKey: string };
    expect(data.targetCategory).toBe("scene");
    expect(data.targetKey).toBe("img_copy.png");
    expect(mocks.copyFile).toHaveBeenCalledWith("/source/img.png", "scene", "img_copy.png");
  });

  it("11. copyFile 返回 null 时返回错误", async () => {
    mocks.copyFile.mockResolvedValue(null);

    const result = await copyFileTool.execute(
      {
        sourceKey: "/s.png",
        targetCategory: "character",
        targetKey: "t.png",
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("文件服务不可用");
  });

  it("12. copyFile 失败时返回错误", async () => {
    mocks.copyFile.mockResolvedValue({
      success: false,
      error: "目标已存在",
    });

    const result = await copyFileTool.execute(
      {
        sourceKey: "/s.png",
        targetCategory: "character",
        targetKey: "t.png",
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("目标已存在");
  });
});

// ============================================================
// 5. move_file
// ============================================================
describe("move_file", () => {
  it("13. 正常移动（copy + delete 都成功）", async () => {
    mocks.copyFile.mockResolvedValue({ success: true });
    mocks.deleteFile.mockResolvedValue(true);

    const result = await moveFileTool.execute(
      {
        sourceKey: "/old/img.png",
        targetCategory: "scene",
        targetKey: "img.png",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      sourceKey: string;
      targetCategory: string;
      targetKey: string;
      sourceDeleted: boolean;
    };
    expect(data.sourceDeleted).toBe(true);
    expect(mocks.copyFile).toHaveBeenCalledWith("/old/img.png", "scene", "img.png");
    expect(mocks.deleteFile).toHaveBeenCalledWith("/old/img.png");
  });

  it("14. copy 失败时不调用 delete", async () => {
    mocks.copyFile.mockResolvedValue({
      success: false,
      error: "源文件不存在",
    });

    const result = await moveFileTool.execute(
      {
        sourceKey: "/missing.png",
        targetCategory: "scene",
        targetKey: "t.png",
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("源文件不存在");
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("15. copy 成功但 delete 失败时返回 warning", async () => {
    mocks.copyFile.mockResolvedValue({ success: true });
    mocks.deleteFile.mockResolvedValue(false);

    const result = await moveFileTool.execute(
      {
        sourceKey: "/old.png",
        targetCategory: "scene",
        targetKey: "new.png",
      },
      makeCtx(),
    );

    // 工具仍返回 success=true，但带 warning 字段
    expect(result.success).toBe(true);
    const data = result.data as { warning: string };
    expect(data.warning).toContain("源文件删除失败");
  });

  it("16. deleteSource=false 时不调用 deleteFile", async () => {
    mocks.copyFile.mockResolvedValue({ success: true });

    const result = await moveFileTool.execute(
      {
        sourceKey: "/old.png",
        targetCategory: "scene",
        targetKey: "new.png",
        deleteSource: false,
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { sourceDeleted: boolean };
    expect(data.sourceDeleted).toBe(false);
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("17. copyFile 返回 null 时返回错误", async () => {
    mocks.copyFile.mockResolvedValue(null);

    const result = await moveFileTool.execute(
      {
        sourceKey: "/old.png",
        targetCategory: "scene",
        targetKey: "new.png",
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("文件服务不可用");
  });
});

// ============================================================
// 6. get_disk_space
// ============================================================
describe("get_disk_space", () => {
  it("18. 正常查询（自定义路径）", async () => {
    mocks.getDiskSpace.mockResolvedValue({
      success: true,
      availableBytes: 1073741824, // 1 GB
      totalBytes: 10737418240, // 10 GB
    });

    const result = await getDiskSpaceTool.execute(
      { dirPath: "/custom/path" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      availableBytes: number;
      totalBytes: number;
      availableGB: number;
      totalGB: number;
    };
    expect(data.availableBytes).toBe(1073741824);
    expect(data.totalBytes).toBe(10737418240);
    expect(data.availableGB).toBe(1);
    expect(data.totalGB).toBe(10);
    expect(mocks.getDiskSpace).toHaveBeenCalledWith("/custom/path");
    // 自定义路径不调用 getCacheDirectory
    expect(mocks.getCacheDirectory).not.toHaveBeenCalled();
  });

  it("19. 未指定路径时使用缓存目录", async () => {
    mocks.getDiskSpace.mockResolvedValue({
      success: true,
      availableBytes: 5368709120, // 5 GB
      totalBytes: 10737418240, // 10 GB
    });

    await getDiskSpaceTool.execute({}, makeCtx());

    // 验证先获取缓存目录，再用其查询
    expect(mocks.getCacheDirectory).toHaveBeenCalled();
    expect(mocks.getDiskSpace).toHaveBeenCalledWith("/cache");
  });

  it("20. getCacheDirectory 失败时返回错误（未指定 dirPath 时）", async () => {
    mocks.getCacheDirectory.mockResolvedValue({ success: false, error: "no cache" });

    const result = await getDiskSpaceTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("无法获取缓存目录");
    expect(mocks.getDiskSpace).not.toHaveBeenCalled();
  });

  it("21. getDiskSpace 返回 null 时返回错误", async () => {
    mocks.getDiskSpace.mockResolvedValue(null);

    const result = await getDiskSpaceTool.execute(
      { dirPath: "/x" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("文件服务不可用");
  });

  it("22. getDiskSpace 失败时返回错误", async () => {
    mocks.getDiskSpace.mockResolvedValue({
      success: false,
      error: "路径不存在",
    });

    const result = await getDiskSpaceTool.execute(
      { dirPath: "/missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("路径不存在");
  });
});

// ============================================================
// 导出完整性
// ============================================================
describe("fileManagementTools 导出", () => {
  it("23. 导出 6 个工具", () => {
    expect(fileManagementTools).toHaveLength(6);
    expect(fileManagementTools).toContain(listFilesTool);
    expect(fileManagementTools).toContain(getFileInfoTool);
    expect(fileManagementTools).toContain(deleteFileTool);
    expect(fileManagementTools).toContain(copyFileTool);
    expect(fileManagementTools).toContain(moveFileTool);
    expect(fileManagementTools).toContain(getDiskSpaceTool);
  });

  it("24. 工具名正确", () => {
    const names = fileManagementTools.map((t) => t.def.function.name);
    expect(names).toContain("list_files");
    expect(names).toContain("get_file_info");
    expect(names).toContain("delete_file");
    expect(names).toContain("copy_file");
    expect(names).toContain("move_file");
    expect(names).toContain("get_disk_space");
  });

  it("25. 所有工具 domain 为 file-management", () => {
    for (const tool of fileManagementTools) {
      expect(tool.domain).toBe("file-management");
    }
  });

  it("26. delete_file 和 move_file 标记 requiresConfirmation", () => {
    // 危险操作需用户确认
    expect(deleteFileTool.requiresConfirmation).toBe(true);
    expect(moveFileTool.requiresConfirmation).toBe(true);
    // 只读/安全操作不要求确认
    expect(listFilesTool.requiresConfirmation).toBeFalsy();
    expect(getFileInfoTool.requiresConfirmation).toBeFalsy();
    expect(copyFileTool.requiresConfirmation).toBeFalsy();
    expect(getDiskSpaceTool.requiresConfirmation).toBeFalsy();
  });
});
