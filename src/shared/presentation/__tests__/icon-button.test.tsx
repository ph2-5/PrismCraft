import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";
import { IconButton } from "../IconButton";

describe("IconButton", () => {
  it("renders children and applies aria-label", () => {
    render(
      <IconButton aria-label="删除" onClick={() => undefined}>
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "删除" });
    expect(button).toBeDefined();
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("applies ghost variant classes by default", () => {
    render(
      <IconButton aria-label="关闭">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "关闭" });
    expect(button.className).toContain("btn");
    expect(button.className).toContain("btn-ghost");
  });

  it("applies primary variant classes", () => {
    render(
      <IconButton aria-label="提交" variant="primary">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "提交" });
    expect(button.className).toContain("btn-primary");
  });

  it("applies outline variant classes", () => {
    render(
      <IconButton aria-label="取消" variant="outline">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "取消" });
    expect(button.className).toContain("btn-outline");
  });

  it("merges additional className after variant classes", () => {
    render(
      <IconButton aria-label="删除" className="btn-xs h-6 w-6">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "删除" });
    expect(button.className).toContain("btn btn-ghost");
    expect(button.className).toContain("btn-xs");
    expect(button.className).toContain("h-6 w-6");
  });

  it("defaults type attribute to button", () => {
    render(
      <IconButton aria-label="删除">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "删除" });
    expect(button.getAttribute("type")).toBe("button");
  });

  it("respects explicitly passed type attribute", () => {
    render(
      <IconButton aria-label="提交" type="submit">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "提交" });
    expect(button.getAttribute("type")).toBe("submit");
  });

  it("forwards additional button props (disabled, onClick, title)", () => {
    let clicked = false;
    render(
      <IconButton
        aria-label="删除"
        disabled
        title="删除该项"
        onClick={() => {
          clicked = true;
        }}
      >
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "删除" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("删除该项");
    button.click();
    expect(clicked).toBe(false);
  });
});
