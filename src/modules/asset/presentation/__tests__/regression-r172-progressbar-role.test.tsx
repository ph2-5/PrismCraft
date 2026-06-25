/**
 * R172: 进度条必须有 role="progressbar"
 *
 * 回归规则目的：
 *   进度条（<div className="progress-bar">）必须有 role="progressbar"、
 *   aria-valuenow、aria-valuemin={0}、aria-valuemax={100}，使屏幕阅读器
 *   能朗读进度。
 *
 * 被测代码：
 *   src/modules/asset/presentation/BatchProgressDialog.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFile } from "fs/promises";
import { join } from "path";

const { mockT } = vi.hoisted(() => ({
  mockT: vi.fn((key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "common.generating": "生成中",
      "common.pending": "等待中",
      "asset.overallProgress": `已完成 ${params?.completed ?? 0} / ${params?.total ?? 0}`,
      "asset.completedCount": `完成 ${params?.count ?? 0}`,
      "asset.failedCount": `失败 ${params?.count ?? 0}`,
      "asset.pendingCount": `等待 ${params?.count ?? 0}`,
      "asset.startBatch": "开始批量生成",
      "asset.cancelBatch": "取消",
      "asset.retryFailed": "重试失败",
      "asset.downloadAll": "全部下载",
      "asset.saveSelected": "保存选中",
      "batch.tabAll": `全部 (${params?.count ?? 0})`,
      "batch.tabCompleted": `完成 (${params?.count ?? 0})`,
      "batch.tabFailed": `失败 (${params?.count ?? 0})`,
      "batch.noTasks": "暂无任务",
    };
    return map[key] ?? key;
  }),
}));

vi.mock("@/shared/constants/messages", () => ({ t: mockT }));

import { BatchProgressDialog } from "../BatchProgressDialog";

describe("R172: 进度条必须有 role='progressbar'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isGenerating=true 时渲染整体进度条 role='progressbar'", () => {
    render(
      <BatchProgressDialog
        tasks={[]}
        isGenerating={true}
        overallProgress={50}
        completedCount={1}
        failedCount={0}
        pendingCount={1}
        selectedResults={new Set()}
        viewMode="grid"
        globalError={null}
        hasItems={true}
        onStartGeneration={vi.fn()}
        onCancelGeneration={vi.fn()}
        onRetryFailed={vi.fn()}
        onDownloadAll={vi.fn()}
        onSaveSelected={vi.fn()}
        onToggleResultSelection={vi.fn()}
        onViewModeChange={vi.fn()}
        onRetryGlobalError={vi.fn()}
      />,
    );
    const progressbars = screen.getAllByRole("progressbar");
    expect(progressbars.length).toBeGreaterThanOrEqual(1);
  });

  it("进度条 aria-valuenow 等于 overallProgress", () => {
    render(
      <BatchProgressDialog
        tasks={[]}
        isGenerating={true}
        overallProgress={75}
        completedCount={3}
        failedCount={0}
        pendingCount={1}
        selectedResults={new Set()}
        viewMode="grid"
        globalError={null}
        hasItems={true}
        onStartGeneration={vi.fn()}
        onCancelGeneration={vi.fn()}
        onRetryFailed={vi.fn()}
        onDownloadAll={vi.fn()}
        onSaveSelected={vi.fn()}
        onToggleResultSelection={vi.fn()}
        onViewModeChange={vi.fn()}
        onRetryGlobalError={vi.fn()}
      />,
    );
    const progressbar = screen.getAllByRole("progressbar")[0]!;
    expect(progressbar.getAttribute("aria-valuenow")).toBe("75");
  });

  it("进度条 aria-valuemin=0 aria-valuemax=100", () => {
    render(
      <BatchProgressDialog
        tasks={[]}
        isGenerating={true}
        overallProgress={30}
        completedCount={1}
        failedCount={0}
        pendingCount={2}
        selectedResults={new Set()}
        viewMode="grid"
        globalError={null}
        hasItems={true}
        onStartGeneration={vi.fn()}
        onCancelGeneration={vi.fn()}
        onRetryFailed={vi.fn()}
        onDownloadAll={vi.fn()}
        onSaveSelected={vi.fn()}
        onToggleResultSelection={vi.fn()}
        onViewModeChange={vi.fn()}
        onRetryGlobalError={vi.fn()}
      />,
    );
    const progressbar = screen.getAllByRole("progressbar")[0]!;
    expect(progressbar.getAttribute("aria-valuemin")).toBe("0");
    expect(progressbar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("进度条有 aria-label（屏幕阅读器可识别）", () => {
    render(
      <BatchProgressDialog
        tasks={[]}
        isGenerating={true}
        overallProgress={50}
        completedCount={1}
        failedCount={0}
        pendingCount={1}
        selectedResults={new Set()}
        viewMode="grid"
        globalError={null}
        hasItems={true}
        onStartGeneration={vi.fn()}
        onCancelGeneration={vi.fn()}
        onRetryFailed={vi.fn()}
        onDownloadAll={vi.fn()}
        onSaveSelected={vi.fn()}
        onToggleResultSelection={vi.fn()}
        onViewModeChange={vi.fn()}
        onRetryGlobalError={vi.fn()}
      />,
    );
    const progressbar = screen.getAllByRole("progressbar")[0]!;
    expect(progressbar.getAttribute("aria-label")).not.toBeNull();
  });

  it("isGenerating=false 时不渲染整体进度条", () => {
    render(
      <BatchProgressDialog
        tasks={[]}
        isGenerating={false}
        overallProgress={0}
        completedCount={0}
        failedCount={0}
        pendingCount={0}
        selectedResults={new Set()}
        viewMode="grid"
        globalError={null}
        hasItems={true}
        onStartGeneration={vi.fn()}
        onCancelGeneration={vi.fn()}
        onRetryFailed={vi.fn()}
        onDownloadAll={vi.fn()}
        onSaveSelected={vi.fn()}
        onToggleResultSelection={vi.fn()}
        onViewModeChange={vi.fn()}
        onRetryGlobalError={vi.fn()}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("BatchProgressDialog.tsx 源码中 progress-bar 有 role='progressbar'", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/asset/presentation/BatchProgressDialog.tsx"),
      "utf-8",
    );
    // 源码中所有 progress-bar 应有 role="progressbar"
    const progressBars = source.match(/progress-bar[^>]*role="progressbar"/g);
    expect(progressBars).not.toBeNull();
    expect(progressBars!.length).toBeGreaterThanOrEqual(1);
  });

  it("BatchProgressDialog.tsx 源码中所有 progress-bar div 都有 role='progressbar'", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/asset/presentation/BatchProgressDialog.tsx"),
      "utf-8",
    );
    // 统计 progress-bar 出现次数
    const allProgressBars = source.match(/progress-bar/g);
    expect(allProgressBars).not.toBeNull();
    // 统计有 role="progressbar" 的
    const withRole = source.match(/progress-bar[^>]*role="progressbar"/g);
    expect(withRole).not.toBeNull();
    // 所有 progress-bar 都应有 role（数量相等）
    expect(allProgressBars!.length).toBe(withRole!.length);
  });
});
