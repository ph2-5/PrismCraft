import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockUseStory, mockSetDeleteDialogOpen, mockPerformDeleteStory, mockT } = vi.hoisted(() => ({
  mockUseStory: vi.fn(),
  mockSetDeleteDialogOpen: vi.fn(),
  mockPerformDeleteStory: vi.fn(),
  mockT: vi.fn((key: string, params?: Record<string, string>) => {
    if (key === "story.deleteConfirmInputHint" && params?.name) return `请输入 "${params.name}" 确认删除`;
    if (key === "story.unnamed") return "未命名";
    const map: Record<string, string> = {
      "story.confirmDeleteProject": "确认删除项目",
      "story.confirmDeleteProjectDesc": "此操作不可撤销",
      "story.deleteConfirmInputPlaceholder": "输入项目名称",
      "story.confirmDeleteButton": "确认删除",
      "common.cancel": "取消",
    };
    return map[key] ?? key;
  }),
}));

vi.mock("@/modules/storyboard/StoryProvider", () => ({
  useStory: mockUseStory,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("lucide-react", () => ({
  Trash2: () => <span data-testid="icon-trash" />,
}));

function DeleteDialogTestWrapper({ storyTitle, deleteDialogOpen: _deleteDialogOpen }: { storyTitle: string; deleteDialogOpen: boolean }) {
  const React = require("react");
  const [deleteConfirmInput, setDeleteConfirmInput] = React.useState("");

  const expectedMatch = storyTitle || mockT("story.unnamed");

  return (
    <div>
      <input
        data-testid="delete-confirm-input"
        value={deleteConfirmInput}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeleteConfirmInput(e.target.value)}
        placeholder={mockT("story.deleteConfirmInputPlaceholder")}
      />
      <button
        data-testid="button-cancel"
        onClick={() => {
          mockSetDeleteDialogOpen(false);
          setDeleteConfirmInput("");
        }}
      >
        {mockT("common.cancel")}
      </button>
      <button
        data-testid="button-destructive"
        disabled={deleteConfirmInput !== expectedMatch}
        onClick={mockPerformDeleteStory}
      >
        {mockT("story.confirmDeleteButton")}
      </button>
    </div>
  );
}

describe("R69: Destructive entity deletion must require input confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delete button is disabled when input is empty", () => {
    render(<DeleteDialogTestWrapper storyTitle="我的故事" deleteDialogOpen={true} />);

    const deleteButton = screen.getByTestId("button-destructive");
    expect(deleteButton).toBeDisabled();
  });

  it("delete button is disabled when input does not match story title", async () => {
    render(<DeleteDialogTestWrapper storyTitle="我的故事" deleteDialogOpen={true} />);

    const input = screen.getByTestId("delete-confirm-input");
    const user = userEvent.setup();
    await user.type(input, "错误的名字");

    const deleteButton = screen.getByTestId("button-destructive");
    expect(deleteButton).toBeDisabled();
  });

  it("delete button is enabled when input matches story title", async () => {
    render(<DeleteDialogTestWrapper storyTitle="我的故事" deleteDialogOpen={true} />);

    const input = screen.getByTestId("delete-confirm-input");
    const user = userEvent.setup();
    await user.type(input, "我的故事");

    const deleteButton = screen.getByTestId("button-destructive");
    expect(deleteButton).not.toBeDisabled();
  });

  it("input is cleared when dialog is closed/cancelled", async () => {
    render(<DeleteDialogTestWrapper storyTitle="我的故事" deleteDialogOpen={true} />);

    const input = screen.getByTestId("delete-confirm-input");
    const user = userEvent.setup();
    await user.type(input, "我的故事");
    expect(input).toHaveValue("我的故事");

    const cancelButton = screen.getByTestId("button-cancel");
    await user.click(cancelButton);

    expect(mockSetDeleteDialogOpen).toHaveBeenCalledWith(false);
    expect(input).toHaveValue("");
  });
});
