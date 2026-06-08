import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { type ReactNode } from "react";
import { ok, err, AppError } from "@/domain/types";

const { mockDownloadExport, mockImportData, mockImportFromFile } = vi.hoisted(() => ({
  mockDownloadExport: vi.fn<() => Promise<unknown>>(),
  mockImportData: vi.fn<(_data: unknown, _options?: { mergeStrategy?: string }) => Promise<unknown>>(),
  mockImportFromFile: vi.fn<(_file: File) => Promise<unknown>>(),
}));

vi.mock("../../import-export", () => ({
  downloadExport: mockDownloadExport,
  importData: mockImportData,
  importFromFile: mockImportFromFile,
}));

import {
  useExportData,
  useDownloadExport,
  useImportData,
  useImportFromFile,
} from "../../hooks/use-import-export";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useExportData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功导出时应返回 ok 结果", async () => {
    mockDownloadExport.mockResolvedValue(ok(undefined));

    const { result } = renderHook(() => useExportData(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockDownloadExport).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ ok: true, value: undefined });
  });

  it("导出失败时应返回错误状态", async () => {
    const exportError = new AppError("EXPORT_ERROR", "导出失败");
    mockDownloadExport.mockResolvedValue(err(exportError));

    const { result } = renderHook(() => useExportData(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockDownloadExport).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ ok: false, error: exportError });
  });

  it("导出抛出异常时应返回错误状态", async () => {
    mockDownloadExport.mockRejectedValue(new Error("网络异常"));

    const { result } = renderHook(() => useExportData(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await vi.waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe("网络异常");
  });

  it("初始状态应为 idle", () => {
    const { result } = renderHook(() => useExportData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.isPending).toBe(false);
  });
});

describe("useDownloadExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功下载导出时应返回 ok 结果", async () => {
    mockDownloadExport.mockResolvedValue(ok(undefined));

    const { result } = renderHook(() => useDownloadExport(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockDownloadExport).toHaveBeenCalledTimes(1);
  });

  it("下载导出失败时应返回错误状态", async () => {
    const exportError = new AppError("EXPORT_ERROR", "写入文件失败");
    mockDownloadExport.mockResolvedValue(err(exportError));

    const { result } = renderHook(() => useDownloadExport(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ ok: false, error: exportError });
  });
});

describe("useImportData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功导入数据时应返回结果", async () => {
    const importResult = { success: true, imported: { characters: 5 }, errors: [] };
    mockImportData.mockResolvedValue(ok(importResult));

    const { result } = renderHook(() => useImportData(), {
      wrapper: createWrapper(),
    });

    const testData = { characters: [{ id: "1", name: "角色A" }] };

    act(() => {
      result.current.mutate({ data: testData });
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockImportData).toHaveBeenCalledWith(testData, { mergeStrategy: undefined });
    expect(result.current.data).toEqual({ ok: true, value: importResult });
  });

  it("使用 mergeStrategy 导入时应传递策略参数", async () => {
    const importResult = { success: true, imported: { stories: 3 }, errors: [] };
    mockImportData.mockResolvedValue(ok(importResult));

    const { result } = renderHook(() => useImportData(), {
      wrapper: createWrapper(),
    });

    const testData = { stories: [{ id: "1" }] };

    act(() => {
      result.current.mutate({ data: testData, mergeStrategy: "replace" });
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockImportData).toHaveBeenCalledWith(testData, { mergeStrategy: "replace" });
  });

  it("导入数据验证失败时应返回错误", async () => {
    const importResult = { success: false, imported: {}, errors: ["没有找到可导入的数据"] };
    mockImportData.mockResolvedValue(ok(importResult));

    const { result } = renderHook(() => useImportData(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ data: {} });
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data!.ok).toBe(true);
    expect((result.current.data! as { ok: true; value: { success: boolean; imported: Record<string, number>; errors: string[] } }).value.success).toBe(false);
  });

  it("导入抛出异常时应返回错误状态", async () => {
    mockImportData.mockRejectedValue(new Error("数据库写入失败"));

    const { result } = renderHook(() => useImportData(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ data: { characters: [] } });
    });

    await vi.waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe("数据库写入失败");
  });

  it("初始状态应为 idle", () => {
    const { result } = renderHook(() => useImportData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
  });
});

describe("useImportFromFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功从文件导入时应返回结果", async () => {
    const importResult = { success: true, imported: { characters: 2 }, errors: [] };
    mockImportFromFile.mockResolvedValue(ok(importResult));

    const { result } = renderHook(() => useImportFromFile(), {
      wrapper: createWrapper(),
    });

    const file = new File(['{"characters":[]}'], "export.json", { type: "application/json" });

    act(() => {
      result.current.mutate(file);
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockImportFromFile).toHaveBeenCalledTimes(1);
    expect(mockImportFromFile).toHaveBeenCalledWith(file);
    expect(result.current.data).toEqual({ ok: true, value: importResult });
  });

  it("文件内容不是有效 JSON 时应返回错误", async () => {
    const validationError = new AppError("VALIDATION_ERROR", "文件内容不是有效的 JSON 格式");
    mockImportFromFile.mockResolvedValue(err(validationError));

    const { result } = renderHook(() => useImportFromFile(), {
      wrapper: createWrapper(),
    });

    const file = new File(["not json"], "bad.json", { type: "application/json" });

    act(() => {
      result.current.mutate(file);
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ ok: false, error: validationError });
  });

  it("从文件导入抛出异常时应返回错误状态", async () => {
    mockImportFromFile.mockRejectedValue(new Error("文件读取失败"));

    const { result } = renderHook(() => useImportFromFile(), {
      wrapper: createWrapper(),
    });

    const file = new File(["{}"], "test.json", { type: "application/json" });

    act(() => {
      result.current.mutate(file);
    });

    await vi.waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe("文件读取失败");
  });

  it("初始状态应为 idle", () => {
    const { result } = renderHook(() => useImportFromFile(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
  });
});
