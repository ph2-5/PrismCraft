/**
 * R160: Modal Components MUST Use the Unified `<Modal>` Component
 *
 * 回归规则目的：
 *   统一 Modal 组件（src/shared/presentation/Modal.tsx）提供 role="dialog"、
 *   aria-modal="true"、aria-label、tabIndex={-1}、Escape 关闭、overlay 点击关闭。
 *   所有迁移过的 modal 必须使用该统一组件，不得重新实现 overlay/Escape/aria 样板。
 *
 * 被测代码：
 *   src/shared/presentation/Modal.tsx
 *   + 19 个已迁移的 modal 文件（见 MODAL_FILES）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFile } from "fs/promises";
import { join } from "path";
import { Modal } from "../Modal";

// 已迁移到统一 Modal 的 19 个文件清单（相对项目根 src/）
const MODAL_FILES = [
  "src/modules/character/presentation/OutfitDialog.tsx",
  "src/app/story/SwitchConfirmDialog.tsx",
  "src/modules/video/task-management/presentation/BulkDeleteDialog.tsx",
  "src/modules/video/task-management/presentation/DeleteConfirmDialog.tsx",
  "src/modules/video/task-management/presentation/TaskDetailDialog.tsx",
  "src/modules/video/task-management/presentation/TaskTrackingDialog.tsx",
  "src/modules/video/task-management/presentation/VideoPreviewDialog.tsx",
  "src/modules/video/task-management/presentation/video-task-manager-ui/task-detail-dialog.tsx",
  "src/app/quick-generate/TemplateSelectDialog.tsx",
  "src/app/asset-library/AssetEditDialog.tsx",
  "src/app/asset-library/AssetCollectionDialogs.tsx",
  "src/modules/story/template/presentation/VersionDialog.tsx",
  "src/modules/sync/presentation/SyncConflictPanel.tsx",
  "src/modules/sync/presentation/SyncSettingsPanel.tsx",
  "src/modules/asset/presentation/BatchOperations.tsx",
  "src/modules/story/generation/presentation/ReferenceVideoUploader.tsx",
  "src/modules/asset/presentation/ProjectExportImport.tsx",
  "src/shared/utils/confirm.tsx",
  "src/app/story/page.tsx",
];

describe("R160: Modal 类组件必须使用统一 <Modal> 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("open=true 时渲染 role='dialog'", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="测试对话框">
        <div>内容</div>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toBeNull();
  });

  it("open=true 时 aria-modal='true'", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("ariaLabel prop 透传到容器 aria-label", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="删除确认">
        <div>内容</div>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("删除确认");
  });

  it("容器 tabIndex=-1（可编程聚焦）", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("tabindex")).toBe("-1");
  });

  it("open=false 时不渲染任何内容", () => {
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("点击 overlay 触发 onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const overlay = container.querySelector(".modal-overlay") as HTMLElement;
    expect(overlay).not.toBeNull();
    overlay.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点击 modal 内容区不触发 onClose（stopPropagation）", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const modalPanel = container.querySelector(".modal") as HTMLElement;
    modalPanel.click();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closeOnOverlayClick=false 时点击 overlay 不关闭", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose} closeOnOverlayClick={false} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const overlay = container.querySelector(".modal-overlay") as HTMLElement;
    overlay.click();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("已迁移的 19 个 modal 文件都 import 了 Modal 组件", async () => {
    const IMPORT_REGEX = /from\s+["']@\/shared\/presentation\/Modal["']/;
    for (const relPath of MODAL_FILES) {
      const source = await readFile(join(process.cwd(), relPath), "utf-8");
      expect(IMPORT_REGEX.test(source), `${relPath} 未导入 @/shared/presentation/Modal`).toBe(true);
    }
  });

  it("已迁移的 modal 文件不应再重复实现 aria-modal 属性（应由 Modal 提供）", async () => {
    // 检查迁移后的文件不应直接写 aria-modal="true"（应在 Modal.tsx 内）
    // 注意：confirm.tsx 和 story/page.tsx 可能间接通过 Modal 渲染，不算违规
    for (const relPath of MODAL_FILES) {
      if (relPath.endsWith("confirm.tsx") || relPath.endsWith("story/page.tsx")) continue;
      const source = await readFile(join(process.cwd(), relPath), "utf-8");
      // 允许 Modal.tsx 自己有 aria-modal，但其他迁移文件不应再硬编码
      expect(
        source.includes('aria-modal="true"'),
        `${relPath} 不应直接硬编码 aria-modal="true"（应由 <Modal> 提供）`,
      ).toBe(false);
    }
  });
});
