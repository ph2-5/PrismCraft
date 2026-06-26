/**
 * R170: Tab 模式必须使用 Tabs 组件
 *
 * 回归规则目的：
 *   标签页切换必须使用统一 <Tabs> 组件（src/shared/presentation/Tabs.tsx），
 *   该组件内置 role="tablist"、role="tab"、aria-selected、roving tabindex、
 *   键盘导航（ArrowLeft/Right/Home/End）。手写多个 button 作为 tab 缺少
 *   ARIA 语义和键盘支持。
 *
 * 被测代码：
 *   src/shared/presentation/Tabs.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tabs } from "../Tabs";

describe("R170: Tab 模式必须使用 Tabs 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Tabs 渲染 role='tablist' 容器", () => {
    render(
      <Tabs
        tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeTab="a"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("tablist")).not.toBeNull();
  });

  it("每个 tab 渲染 role='tab'", () => {
    render(
      <Tabs
        tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeTab="a"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
  });

  it("active tab 的 aria-selected='true'", () => {
    render(
      <Tabs
        tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeTab="a"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("false");
  });

  it("点击 tab 触发 onChange", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeTab="a"
        onChange={onChange}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]!);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("roving tabindex：active tab tabIndex=0，其余 tabIndex=-1", () => {
    render(
      <Tabs
        tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }]}
        activeTab="b"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]!.getAttribute("tabindex")).toBe("-1");
    expect(tabs[1]!.getAttribute("tabindex")).toBe("0");
    expect(tabs[2]!.getAttribute("tabindex")).toBe("-1");
  });

  it("ArrowRight 移动焦点到下一个 tab", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeTab="a"
        onChange={onChange}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("ArrowLeft 移动焦点到上一个 tab", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeTab="b"
        onChange={onChange}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[1]!, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("Home 键移动到第一个 tab", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }]}
        activeTab="c"
        onChange={onChange}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[2]!, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("End 键移动到最后一个 tab", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }]}
        activeTab="a"
        onChange={onChange}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[0]!, { key: "End" });
    expect(onChange).toHaveBeenCalledWith("c");
  });
});
