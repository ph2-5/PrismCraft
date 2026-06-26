import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageLoader } from "../PageLoader";

describe("PageLoader", () => {
  it("应渲染一个加载图标（Loader2 svg）", () => {
    const { container } = render(<PageLoader />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("默认 size=md 时 Loader2 宽高应为 24px", () => {
    const { container } = render(<PageLoader />);
    const svg = container.querySelector("svg")!;
    expect(svg.style.width).toBe("24px");
    expect(svg.style.height).toBe("24px");
  });

  it("size='sm' 时 Loader2 宽高应为 16px", () => {
    const { container } = render(<PageLoader size="sm" />);
    const svg = container.querySelector("svg")!;
    expect(svg.style.width).toBe("16px");
    expect(svg.style.height).toBe("16px");
  });

  it("size='lg' 时 Loader2 宽高应为 32px", () => {
    const { container } = render(<PageLoader size="lg" />);
    const svg = container.querySelector("svg")!;
    expect(svg.style.width).toBe("32px");
    expect(svg.style.height).toBe("32px");
  });

  it("未传入 label 时不应渲染 label span", () => {
    const { container } = render(<PageLoader />);
    const spans = container.querySelectorAll("span");
    expect(spans.length).toBe(0);
  });

  it("传入 label 时应在 span 中渲染 label 文本", () => {
    render(<PageLoader label="加载中" />);
    expect(screen.getByText("加载中")).not.toBeNull();
  });

  it("label span 应使用 text-muted-foreground 样式", () => {
    render(<PageLoader label="加载中" />);
    const span = screen.getByText("加载中");
    expect(span.className).toContain("text-muted-foreground");
  });

  it("传入 className 时根 div 应包含该 className", () => {
    const { container } = render(<PageLoader className="my-loader" />);
    const root = container.querySelector("div");
    expect(root?.className).toContain("my-loader");
  });

  it("根 div 应使用 flex 布局并居中", () => {
    const { container } = render(<PageLoader />);
    const root = container.querySelector("div");
    expect(root?.style.display).toBe("flex");
    expect(root?.style.alignItems).toBe("center");
    expect(root?.style.justifyContent).toBe("center");
  });

  it("Loader2 应有 spin 动画", () => {
    const { container } = render(<PageLoader />);
    const svg = container.querySelector("svg")!;
    expect(svg.style.animation).toContain("spin");
    expect(svg.style.animation).toContain("1s");
  });
});
