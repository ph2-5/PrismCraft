import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SceneListItem } from "@/modules/scene";

vi.mock("@/shared/utils/image-url", () => ({
  resolveImageUrl: vi.fn(),
}));

import { resolveImageUrl } from "@/shared/utils/image-url";

const mockedResolveImageUrl = vi.mocked(resolveImageUrl);

interface SceneProps {
  id: string;
  name: string;
  type?: string;
  generatedImage?: string;
  scenePath?: string;
}

function buildScene(overrides: Partial<SceneProps> = {}): SceneProps {
  return {
    id: "scene-1",
    name: "测试场景",
    type: "城市",
    ...overrides,
  };
}

describe("SceneListItem", () => {
  const mockOnClick = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveImageUrl.mockReturnValue(undefined);
  });

  it("renders scene name and type", () => {
    render(
      <SceneListItem
        scene={buildScene()}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText("测试场景")).toBeInTheDocument();
    expect(screen.getByText("城市")).toBeInTheDocument();
  });

  it('shows "未命名场景" when name is empty', () => {
    render(
      <SceneListItem
        scene={buildScene({ name: "" })}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText("未命名场景")).toBeInTheDocument();
  });

  it('shows "无类型" when type is undefined', () => {
    render(
      <SceneListItem
        scene={buildScene({ type: undefined })}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText("无类型")).toBeInTheDocument();
  });

  it('shows "无类型" when type is empty string', () => {
    render(
      <SceneListItem
        scene={buildScene({ type: "" })}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText("无类型")).toBeInTheDocument();
  });

  it("shows img element when scenePath is provided (highest priority)", () => {
    mockedResolveImageUrl.mockReturnValue("file:///resolved/scene-path.png");

    render(
      <SceneListItem
        scene={buildScene({ scenePath: "/images/scene.png", generatedImage: "/images/generated.png" })}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(mockedResolveImageUrl).toHaveBeenCalledWith("/images/scene.png");
    const img = screen.getByAltText("测试场景");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "file:///resolved/scene-path.png");
  });

  it("falls back to generatedImage when scenePath is missing", () => {
    mockedResolveImageUrl.mockReturnValue("http://example.com/generated.jpg");

    render(
      <SceneListItem
        scene={buildScene({ scenePath: undefined, generatedImage: "http://example.com/generated.jpg" })}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(mockedResolveImageUrl).toHaveBeenCalledWith("http://example.com/generated.jpg");
    const img = screen.getByAltText("测试场景");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "http://example.com/generated.jpg");
  });

  it("shows fallback initial circle when no image paths provided", () => {
    mockedResolveImageUrl.mockReturnValue(undefined);

    render(
      <SceneListItem
        scene={buildScene({ scenePath: undefined, generatedImage: undefined })}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("测")).toBeInTheDocument();
  });

  it('shows "?" when name is empty and no image', () => {
    mockedResolveImageUrl.mockReturnValue(undefined);

    render(
      <SceneListItem
        scene={buildScene({ name: "", scenePath: undefined, generatedImage: undefined })}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("calls onClick when the card is clicked", async () => {
    const user = userEvent.setup();

    render(
      <SceneListItem
        scene={buildScene()}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    await user.click(screen.getByText("测试场景"));

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("calls onDelete when delete button is clicked and does NOT propagate to onClick", async () => {
    const user = userEvent.setup();

    render(
      <SceneListItem
        scene={buildScene()}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    const deleteButton = screen.getByRole("button", { name: "删除场景" });
    await user.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledTimes(1);
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('delete button has aria-label="删除场景"', () => {
    render(
      <SceneListItem
        scene={buildScene()}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    const deleteButton = screen.getByRole("button", { name: "删除场景" });
    expect(deleteButton).toHaveAttribute("aria-label", "删除场景");
  });
});
