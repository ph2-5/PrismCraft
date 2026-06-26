/**
 * R71 (已废弃): Route Navigation 拦截规则
 *
 * 历史规则目的（已废弃）：
 *   原 R71 要求路由切换时弹 confirm 拦截未保存修改。自 2026-06 起，
 *   产品决策改为"懒状态"——切换页面不弹窗，由 autosave + beforeunload 兜底。
 *   R64 明确要求路由切换不清脏状态。
 *
 * 当前行为（被测）：
 *   src/shared/presentation/BeforeUnloadGuard.tsx 的 useNavigationGuard
 *   - guardedPush 直接调用 navigate(href)，不再 confirm
 *   - 不清除 dirty state（保留 R64 约束）
 *   - 不再使用 useBlocker
 *   - BeforeUnloadGuard 组件仍监听 beforeunload（程序关闭时浏览器原生提示）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { mockUseNavigate, mockNavigate } = vi.hoisted(() => {
  const mockNavigate = vi.fn();
  return {
    mockNavigate,
    mockUseNavigate: vi.fn(() => mockNavigate),
  };
});

vi.mock("react-router-dom", () => ({
  useNavigate: mockUseNavigate,
  useLocation: vi.fn(() => ({ pathname: "/story" })),
}));

import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";

describe("R71 (已废弃): useNavigationGuard 懒状态行为", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDirtyState.setState({ dirtyKeys: new Set() });
  });

  it("guardedPush 直接调用 navigate，不弹 confirm", () => {
    const { result } = renderHook(() => useNavigationGuard());

    act(() => {
      result.current.guardedPush("/storyboard");
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/storyboard");
  });

  it("存在 dirty state 时 guardedPush 仍直接导航，不拦截", () => {
    useDirtyState.getState().markDirty("story");
    expect(useDirtyState.getState().dirtyKeys.size).toBe(1);

    const { result } = renderHook(() => useNavigationGuard());

    act(() => {
      result.current.guardedPush("/characters");
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/characters");
  });

  it("guardedPush 不清除 dirty state（R64 约束）", () => {
    useDirtyState.getState().markDirty("story");
    useDirtyState.getState().markDirty("character");
    expect(useDirtyState.getState().dirtyKeys.size).toBe(2);

    const { result } = renderHook(() => useNavigationGuard());

    act(() => {
      result.current.guardedPush("/scenes");
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    // dirty state 必须保持不变（不清脏）
    expect(useDirtyState.getState().dirtyKeys.size).toBe(2);
    expect(useDirtyState.getState().isDirty("story")).toBe(true);
    expect(useDirtyState.getState().isDirty("character")).toBe(true);
  });

  it("guardedPush 为同步函数，返回 void（不返回 Promise）", () => {
    const { result } = renderHook(() => useNavigationGuard());

    let returnValue: unknown = "sentinel";
    act(() => {
      returnValue = result.current.guardedPush("/story");
    });

    expect(returnValue).toBeUndefined();
    expect(mockNavigate).toHaveBeenCalledWith("/story");
  });

  it("多次调用 guardedPush 每次都直接导航", () => {
    const { result } = renderHook(() => useNavigationGuard());

    act(() => {
      result.current.guardedPush("/a");
      result.current.guardedPush("/b");
      result.current.guardedPush("/c");
    });

    expect(mockNavigate).toHaveBeenCalledTimes(3);
    expect(mockNavigate).toHaveBeenNthCalledWith(1, "/a");
    expect(mockNavigate).toHaveBeenNthCalledWith(2, "/b");
    expect(mockNavigate).toHaveBeenNthCalledWith(3, "/c");
  });
});
