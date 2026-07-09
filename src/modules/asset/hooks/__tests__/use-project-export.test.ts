import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { type ReactNode } from "react";
import { ok, err, AppError } from "@/domain/types";

const { mockDownloadExport, mockImportData } = vi.hoisted(() => ({
  mockDownloadExport: vi.fn<() => Promise<unknown>>(),
  mockImportData: vi.fn<(data: unknown) => Promise<unknown>>(),
}));

vi.mock("../../import-export", () => ({
  downloadExport: mockDownloadExport,
  importData: mockImportData,
}));

import { useProjectExport } from "../../hooks/use-project-export";
import type { ProjectData, ExportResult } from "../../hooks/use-project-export";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useProjectExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // importData 默认返回 ok，期望失败的测试可单独覆盖
    mockImportData.mockResolvedValue(ok({}));
  });

  describe("初始状态", () => {
    it("初始 progress 应为 0", () => {
      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      expect(result.current.progress).toBe(0);
    });

    it("初始 isExporting 应为 false", () => {
      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isExporting).toBe(false);
    });

    it("应返回 exportProject 和 importProject 方法", () => {
      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.exportProject).toBe("function");
      expect(typeof result.current.importProject).toBe("function");
    });
  });

  describe("exportProject", () => {
    it("成功导出时应返回 success: true 和 filename", async () => {
      mockDownloadExport.mockResolvedValue(ok(undefined));

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      let exportResult: ExportResult | undefined;
      await act(async () => {
        exportResult = await result.current.exportProject({ includeAssets: true });
      });

      expect(exportResult).toEqual({
        success: true,
        filename: expect.stringMatching(/^project-export-\d+\.json$/),
      });
      expect(mockDownloadExport).toHaveBeenCalledTimes(1);
    });

    it("导出完成后 progress 应为 100", async () => {
      mockDownloadExport.mockResolvedValue(ok(undefined));

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      expect(result.current.progress).toBe(0);

      await act(async () => {
        await result.current.exportProject({ includeAssets: true });
      });

      expect(result.current.progress).toBe(100);
    });

    it("downloadExport 返回 ok: false 时应返回 success: false 和错误消息", async () => {
      const exportError = new AppError("EXPORT_ERROR", "写入文件失败");
      mockDownloadExport.mockResolvedValue(err(exportError));

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      let exportResult: ExportResult | undefined;
      await act(async () => {
        exportResult = await result.current.exportProject({ includeAssets: false });
      });

      expect(exportResult).toEqual({
        success: false,
        error: "写入文件失败",
      });
    });

    it("downloadExport 返回 ok: false 且无 error.message 时应返回默认错误消息", async () => {
      const exportError = new AppError("EXPORT_ERROR", "");
      mockDownloadExport.mockResolvedValue(err(exportError));

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      let exportResult: ExportResult | undefined;
      await act(async () => {
        exportResult = await result.current.exportProject({ includeAssets: true });
      });

      expect(exportResult).toEqual({
        success: false,
        error: "导出失败",
      });
    });

    it("downloadExport 抛出异常时应返回 success: false 并重置 progress", async () => {
      mockDownloadExport.mockRejectedValue(new Error("网络连接中断"));

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      let exportResult: ExportResult | undefined;
      await act(async () => {
        exportResult = await result.current.exportProject({ includeAssets: true });
      });

      expect(exportResult).toEqual({
        success: false,
        error: "网络连接中断",
      });
      expect(result.current.progress).toBe(0);
    });

    it("downloadExport 抛出非 Error 异常时应返回默认错误消息", async () => {
      mockDownloadExport.mockRejectedValue("未知错误");

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      let exportResult: ExportResult | undefined;
      await act(async () => {
        exportResult = await result.current.exportProject({ includeAssets: true });
      });

      expect(exportResult).toEqual({
        success: false,
        error: "导出失败",
      });
      expect(result.current.progress).toBe(0);
    });
  });

  describe("importProject", () => {
    it("成功导入时应返回解析后的 ProjectData", async () => {
      const projectData: ProjectData = {
        characters: [{ id: "char-1" } as unknown as ProjectData["characters"][number]],
        scenes: [{ id: "scene-1" } as unknown as ProjectData["scenes"][number]],
        stories: [{ id: "story-1" } as unknown as ProjectData["stories"][number]],
        exportedAt: "2024-01-01T00:00:00Z",
      };

      const file = new File(
        [JSON.stringify(projectData)],
        "project.json",
        { type: "application/json" },
      );

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      interface ImportSuccessResult {
        success: true;
        data: ProjectData;
        blobUrls: string[];
      }
      interface ImportFailureResult {
        success: false;
        error: string;
        blobUrls: string[];
      }
      type ImportResult = ImportSuccessResult | ImportFailureResult;

      let importResult: ImportResult | undefined;
      await act(async () => {
        importResult = await result.current.importProject(file) as ImportResult;
      });

      expect(importResult!.success).toBe(true);
      if (importResult!.success) {
        expect(importResult!.data.characters).toHaveLength(1);
        expect(importResult!.data.scenes).toHaveLength(1);
        expect(importResult!.data.stories).toHaveLength(1);
        expect(importResult!.data.exportedAt).toBe("2024-01-01T00:00:00Z");
        expect(importResult!.blobUrls).toEqual([]);
      }
    });

    it("导入文件缺少可选字段时应使用默认空数组", async () => {
      const partialData = { exportedAt: "2024-01-01T00:00:00Z" };
      const file = new File(
        [JSON.stringify(partialData)],
        "partial.json",
        { type: "application/json" },
      );

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      interface ImportSuccessResult {
        success: true;
        data: ProjectData;
        blobUrls: string[];
      }
      type ImportResult = ImportSuccessResult | { success: false; error: string; blobUrls: string[] };

      let importResult: ImportResult | undefined;
      await act(async () => {
        importResult = await result.current.importProject(file) as ImportResult;
      });

      expect(importResult!.success).toBe(true);
      if (importResult!.success) {
        expect(importResult!.data.characters).toEqual([]);
        expect(importResult!.data.scenes).toEqual([]);
        expect(importResult!.data.stories).toEqual([]);
        expect(importResult!.data.exportedAt).toBe("2024-01-01T00:00:00Z");
      }
    });

    it("导入非 JSON 文件时应返回 success: false", async () => {
      const file = new File(
        ["this is not json"],
        "bad.txt",
        { type: "text/plain" },
      );

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      interface ImportFailureResult {
        success: false;
        error: string;
        blobUrls: string[];
      }
      type ImportResult = { success: true; data: ProjectData; blobUrls: string[] } | ImportFailureResult;

      let importResult: ImportResult | undefined;
      await act(async () => {
        importResult = await result.current.importProject(file) as ImportResult;
      });

      expect(importResult!.success).toBe(false);
      if (!importResult!.success) {
        expect(importResult!.error).toBeTruthy();
        expect(importResult!.blobUrls).toEqual([]);
      }
    });

    it("导入空 JSON 对象时应返回 success: true 和空数组", async () => {
      const file = new File(
        ["{}"],
        "empty.json",
        { type: "application/json" },
      );

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      interface ImportSuccessResult {
        success: true;
        data: ProjectData;
        blobUrls: string[];
      }
      type ImportResult = ImportSuccessResult | { success: false; error: string; blobUrls: string[] };

      let importResult: ImportResult | undefined;
      await act(async () => {
        importResult = await result.current.importProject(file) as ImportResult;
      });

      expect(importResult!.success).toBe(true);
      if (importResult!.success) {
        expect(importResult!.data.characters).toEqual([]);
        expect(importResult!.data.scenes).toEqual([]);
        expect(importResult!.data.stories).toEqual([]);
      }
    });

    it("导入抛出非 Error 异常时应返回默认错误消息", async () => {
      const file = new File(["test"], "test.json", { type: "application/json" });
      vi.spyOn(file, "text").mockRejectedValue("string error");

      const { result } = renderHook(() => useProjectExport(), {
        wrapper: createWrapper(),
      });

      interface ImportFailureResult {
        success: false;
        error: string;
        blobUrls: string[];
      }
      type ImportResult = { success: true; data: ProjectData; blobUrls: string[] } | ImportFailureResult;

      let importResult: ImportResult | undefined;
      await act(async () => {
        importResult = await result.current.importProject(file) as ImportResult;
      });

      expect(importResult!.success).toBe(false);
      if (!importResult!.success) {
        expect(importResult!.error).toBe("导入失败");
        expect(importResult!.blobUrls).toEqual([]);
      }
    });
  });
});
