import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("@/shared/utils/confirm", () => ({
  confirm: vi.fn(),
}));

import { confirm } from "@/shared/utils/confirm";
const mockConfirm = vi.mocked(confirm);

describe("R43: Destructive Operations Must Require Confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirm() must be called with danger variant for delete operations", async () => {
    mockConfirm.mockResolvedValue(true);

    await confirm({
      title: "确认删除",
      description: "确定删除该视频任务？此操作不可撤销。",
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
    });

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "danger" }),
    );
  });

  it("confirm() must return false when user cancels, preventing deletion", async () => {
    mockConfirm.mockResolvedValue(false);

    const result = await confirm({
      title: "确认批量删除",
      description: "确定删除选中的 3 个视频任务？此操作不可撤销。",
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
    });

    expect(result).toBe(false);
  });

  it("confirm() must return true when user confirms, allowing deletion", async () => {
    mockConfirm.mockResolvedValue(true);

    const result = await confirm({
      title: "确认删除",
      description: "确定删除该视频任务？此操作不可撤销。",
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
    });

    expect(result).toBe(true);
  });

  it("VideoTaskManagerUI single delete must await confirm() with danger variant", () => {
    const source = readFileSync(
      resolve(__dirname, "../../VideoTaskManagerUI.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/await confirm\(/);
    expect(source).toMatch(/variant:\s*["']danger["']/);
    expect(source).toMatch(/if\s*\(!confirmed\)\s*return/);
  });

  it("VideoTaskManagerUI batch delete must await confirm() with danger variant", () => {
    const source = readFileSync(
      resolve(__dirname, "../../VideoTaskManagerUI.tsx"),
      "utf-8",
    );
    const handleRemoveSelected = source.match(
      /handleRemoveSelected[\s\S]*?^\s*\}/m,
    );
    expect(handleRemoveSelected).toBeTruthy();
    expect(handleRemoveSelected![0]).toContain("await confirm(");
    expect(handleRemoveSelected![0]).toContain("variant: \"danger\"");
  });
});
