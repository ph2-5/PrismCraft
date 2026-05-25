import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterListItem } from "../CharacterListItem";

vi.mock("@/shared/utils/image-url", () => ({
  resolveImageUrl: vi.fn(),
}));

import { resolveImageUrl } from "@/shared/utils/image-url";

const mockedResolveImageUrl = vi.mocked(resolveImageUrl);

function buildCharacter(overrides: Partial<{
  id: string;
  name: string;
  style: string;
  generatedImage: string;
  avatarPath: string;
  refImagePath: string;
}> = {}) {
  return {
    id: "char-1",
    name: "测试角色",
    style: "动漫风",
    ...overrides,
  };
}

function renderListItem(overrides: {
  character?: ReturnType<typeof buildCharacter>;
  onClick?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
} = {}) {
  const character = overrides.character ?? buildCharacter();
  const onClick = overrides.onClick ?? vi.fn();
  const onDelete = overrides.onDelete ?? vi.fn();

  return {
    onClick,
    onDelete,
    ...render(
      <CharacterListItem
        character={character}
        onClick={onClick}
        onDelete={onDelete}
      />,
    ),
  };
}

describe("CharacterListItem", () => {
  it("renders character name and style", () => {
    mockedResolveImageUrl.mockReturnValue(undefined);
    renderListItem({ character: buildCharacter({ name: "小明", style: "写实风" }) });

    expect(screen.getByText("小明")).toBeInTheDocument();
    expect(screen.getByText("写实风")).toBeInTheDocument();
  });

  it("shows 未命名角色 when name is empty", () => {
    mockedResolveImageUrl.mockReturnValue(undefined);
    renderListItem({ character: buildCharacter({ name: "" }) });

    expect(screen.getByText("未命名角色")).toBeInTheDocument();
  });

  it("shows 无风格 when style is undefined", () => {
    mockedResolveImageUrl.mockReturnValue(undefined);
    const { style, ...charWithoutStyle } = buildCharacter();
    void style;
    renderListItem({ character: charWithoutStyle as ReturnType<typeof buildCharacter> });

    expect(screen.getByText("无风格")).toBeInTheDocument();
  });

  it("shows 无风格 when style is empty string", () => {
    mockedResolveImageUrl.mockReturnValue(undefined);
    renderListItem({ character: buildCharacter({ style: "" }) });

    expect(screen.getByText("无风格")).toBeInTheDocument();
  });

  it("shows img element when avatarPath is provided (highest priority)", () => {
    mockedResolveImageUrl.mockReturnValue("file:///avatar.png");
    renderListItem({
      character: buildCharacter({
        avatarPath: "/avatar.png",
        generatedImage: "https://gen.img",
        refImagePath: "https://ref.img",
      }),
    });

    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "file:///avatar.png");
    expect(mockedResolveImageUrl).toHaveBeenCalledWith("/avatar.png");
  });

  it("falls back to generatedImage when avatarPath is missing", () => {
    mockedResolveImageUrl.mockReturnValue("https://gen.img");
    renderListItem({
      character: buildCharacter({
        generatedImage: "https://gen.img",
        refImagePath: "https://ref.img",
      }),
    });

    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://gen.img");
    expect(mockedResolveImageUrl).toHaveBeenCalledWith("https://gen.img");
  });

  it("falls back to refImagePath when both avatarPath and generatedImage are missing", () => {
    mockedResolveImageUrl.mockReturnValue("https://ref.img");
    renderListItem({
      character: buildCharacter({
        refImagePath: "https://ref.img",
      }),
    });

    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://ref.img");
    expect(mockedResolveImageUrl).toHaveBeenCalledWith("https://ref.img");
  });

  it("shows fallback initial circle when no image paths provided", () => {
    mockedResolveImageUrl.mockReturnValue(undefined);
    renderListItem({ character: buildCharacter({ name: "小红" }) });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("小")).toBeInTheDocument();
  });

  it('shows "?" when name is empty and no image', () => {
    mockedResolveImageUrl.mockReturnValue(undefined);
    renderListItem({ character: buildCharacter({ name: "" }) });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("calls onClick when the card is clicked", async () => {
    const user = userEvent.setup();
    mockedResolveImageUrl.mockReturnValue(undefined);
    const onClick = vi.fn();
    renderListItem({ onClick });

    await user.click(screen.getByText("测试角色"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onDelete when delete button is clicked and does NOT propagate to onClick", async () => {
    const user = userEvent.setup();
    mockedResolveImageUrl.mockReturnValue(undefined);
    const onClick = vi.fn();
    const onDelete = vi.fn();
    renderListItem({ onClick, onDelete });

    await user.click(screen.getByLabelText("删除角色"));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('delete button has aria-label="删除角色"', () => {
    mockedResolveImageUrl.mockReturnValue(undefined);
    renderListItem();

    expect(screen.getByLabelText("删除角色")).toBeInTheDocument();
  });
});
