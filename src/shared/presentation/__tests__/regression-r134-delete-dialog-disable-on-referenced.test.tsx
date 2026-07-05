/**
 * R134: DeleteConfirmDialog 在有引用时 confirm 按钮必须 disabled
 *
 * 回归规则目的：
 *   src/shared/presentation/DeleteConfirmDialog.tsx 当 referenceCheck.references.length > 0
 *   时，删除按钮必须 disabled。这防止用户在被引用实体上点击删除导致引用失效。
 *
 * 历史问题：
 *   原实现即使 referenceCheck.references.length > 0，confirm 按钮仍可点击。
 *
 * 被测代码：
 *   src/shared/presentation/DeleteConfirmDialog.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { mockT } = vi.hoisted(() => ({
  mockT: vi.fn((key: string) => key),
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <span data-testid="icon-alert" />,
}));

import { DeleteConfirmDialog } from "../DeleteConfirmDialog";

describe("R134: DeleteConfirmDialog 引用时禁用 confirm 按钮", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function makeReferenceCheck(refCount: number) {
    if (refCount === 0) {
      return { references: [] };
    }
    return {
      references: Array.from({ length: refCount }, (_, i) => ({
        elementId: `elem-${i}`,
        elementName: `Element ${i}`,
        usedInBeats: [{ beatId: `beat-${i}` }],
      })),
    };
  }

  it("open=false 时不渲染任何内容", () => {
    const { container } = render(
      <DeleteConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={vi.fn()}
        referenceCheck={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("referenceCheck=null（无引用检查）时 confirm 按钮可点", () => {
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={vi.fn()}
        referenceCheck={null}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "confirm.deleteTitle" });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("references.length=0 时 confirm 按钮可点", () => {
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={vi.fn()}
        referenceCheck={makeReferenceCheck(0)}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "confirm.deleteTitle" });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("references.length=1 时 confirm 按钮 disabled", () => {
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={vi.fn()}
        referenceCheck={makeReferenceCheck(1)}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "confirm.deleteTitle" });
    expect(confirmBtn).toBeDisabled();
  });

  it("references.length>1 时 confirm 按钮 disabled", () => {
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={vi.fn()}
        referenceCheck={makeReferenceCheck(3)}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "confirm.deleteTitle" });
    expect(confirmBtn).toBeDisabled();
  });

  it("isDeleting=true 时 confirm 按钮 disabled（即使无引用）", () => {
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={true}
        onConfirm={vi.fn()}
        referenceCheck={null}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "common.deleting" });
    expect(confirmBtn).toBeDisabled();
  });

  it("引用时点击 confirm 按钮不应触发 onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={onConfirm}
        referenceCheck={makeReferenceCheck(2)}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "confirm.deleteTitle" });
    expect(confirmBtn).toBeDisabled();

    // 即使尝试点击，由于 disabled，onConfirm 不应被触发
    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("无引用时点击 confirm 按钮应触发 onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={onConfirm}
        referenceCheck={makeReferenceCheck(0)}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "confirm.deleteTitle" });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("引用时 confirm 按钮应有 title 提示", () => {
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={vi.fn()}
        referenceCheck={makeReferenceCheck(2)}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "confirm.deleteTitle" });
    // title 应存在且包含 "cannotDeleteReferenced" 文本（mock 后是 key）
    expect(confirmBtn).toHaveAttribute("title");
    const title = confirmBtn.getAttribute("title");
    expect(title).toContain("delete.cannotDeleteReferenced");
  });

  it("无引用时 confirm 按钮不应有 title 提示", () => {
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={vi.fn()}
        referenceCheck={null}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "confirm.deleteTitle" });
    expect(confirmBtn).not.toHaveAttribute("title");
  });

  it("cancel 按钮始终可点（除 isDeleting 外不受引用影响）", () => {
    render(
      <DeleteConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        entityLabel="Character"
        isDeleting={false}
        onConfirm={vi.fn()}
        referenceCheck={makeReferenceCheck(5)}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: "common.cancel" });
    expect(cancelBtn).not.toBeDisabled();
  });
});
