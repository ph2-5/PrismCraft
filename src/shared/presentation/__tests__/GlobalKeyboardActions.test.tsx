import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { mockUseGlobalKeyboardActions } = vi.hoisted(() => ({
  mockUseGlobalKeyboardActions: vi.fn(),
}));

vi.mock("@/shared/hooks/use-global-keyboard-actions", () => ({
  useGlobalKeyboardActions: mockUseGlobalKeyboardActions,
}));

import { GlobalKeyboardActions } from "../GlobalKeyboardActions";

describe("GlobalKeyboardActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应调用 useGlobalKeyboardActions hook", () => {
    render(<GlobalKeyboardActions />);
    expect(mockUseGlobalKeyboardActions).toHaveBeenCalledTimes(1);
  });

  it("未传 props 时调用 hook 应使用 undefined 作为参数", () => {
    render(<GlobalKeyboardActions />);
    expect(mockUseGlobalKeyboardActions).toHaveBeenCalledWith();
  });

  it("渲染后不产生任何 DOM 节点（返回 null）", () => {
    const { container } = render(<GlobalKeyboardActions />);
    expect(container.firstChild).toBeNull();
  });

  it("多次渲染应每次都调用 hook（与普通 React 行为一致）", () => {
    const { rerender } = render(<GlobalKeyboardActions />);
    rerender(<GlobalKeyboardActions />);
    expect(mockUseGlobalKeyboardActions).toHaveBeenCalledTimes(2);
  });
});
