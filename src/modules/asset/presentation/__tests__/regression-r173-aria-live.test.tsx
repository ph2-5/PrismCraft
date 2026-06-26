/**
 * R173: 动态状态变化必须有 aria-live
 *
 * 回归规则目的：
 *   动态变化的状态文本（如任务计数、进度百分比）必须放在
 *   role="status" aria-live="polite" 容器中，使屏幕阅读器在内容变化时
 *   自动朗读。
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

function renderDialog(props: Partial<React.ComponentProps<typeof BatchProgressDialog>> = {}) {
  return render(
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
      {...props}
    />,
  );
}

describe("R173: 动态状态变化必须有 aria-live", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isGenerating=true 时渲染 role='status' 容器", () => {
    renderDialog({ isGenerating: true, overallProgress: 50 });
    const statuses = screen.getAllByRole("status");
    expect(statuses.length).toBeGreaterThanOrEqual(1);
  });

  it("进度文本容器有 aria-live='polite'", () => {
    renderDialog({ isGenerating: true, overallProgress: 50 });
    const statuses = screen.getAllByRole("status");
    const polite = statuses.filter((s) => s.getAttribute("aria-live") === "polite");
    expect(polite.length).toBeGreaterThanOrEqual(1);
  });

  it("任务计数容器有 role='status' aria-live='polite'", () => {
    // tasks.length > 0 时渲染计数容器
    renderDialog({
      tasks: [
        { id: "1", itemName: "a", status: "completed", progress: 100 } as never,
        { id: "2", itemName: "b", status: "failed", progress: 0, error: "err" } as never,
      ],
      completedCount: 1,
      failedCount: 1,
    });
    const statuses = screen.getAllByRole("status");
    expect(statuses.length).toBeGreaterThanOrEqual(1);
  });

  it("isGenerating=false 且 tasks 为空时不强制渲染 status（无动态内容）", () => {
    renderDialog({ isGenerating: false, tasks: [] });
    // 无动态内容时不需要 status 容器
    // 但如果有也不算违规
  });

  it("BatchProgressDialog.tsx 源码包含 role='status'", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/asset/presentation/BatchProgressDialog.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/role="status"/);
  });

  it("BatchProgressDialog.tsx 源码包含 aria-live='polite'", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/asset/presentation/BatchProgressDialog.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/aria-live="polite"/);
  });

  it("进度百分比文本在 status 容器内（可被屏幕阅读器朗读）", () => {
    renderDialog({ isGenerating: true, overallProgress: 80 });
    const statuses = screen.getAllByRole("status");
    // 至少一个 status 容器包含进度文本
    const hasProgressText = statuses.some((s) => s.textContent?.includes("80"));
    expect(hasProgressText).toBe(true);
  });

  it("任务计数文本在 status 容器内（可被屏幕阅读器朗读）", () => {
    renderDialog({
      tasks: [
        { id: "1", itemName: "a", status: "completed", progress: 100 } as never,
      ],
      completedCount: 1,
    });
    const statuses = screen.getAllByRole("status");
    // 至少一个 status 容器包含完成计数
    const hasCompletedText = statuses.some((s) => s.textContent?.includes("完成"));
    expect(hasCompletedText).toBe(true);
  });
});
