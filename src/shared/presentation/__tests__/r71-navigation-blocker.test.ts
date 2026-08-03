/**
 * 导航保护规则（原 R71 懒状态决策已更新）
 *
 * 背景：2026-06 曾决策"切换页面不弹窗，由 autosave + beforeunload 兜底"（懒状态）。
 * 2026-08 审计发现跨页切换会静默丢失未保存数据（场景/角色页编辑中切走无提示），
 * 因此恢复为"dirty 时确认后导航"：
 *   - useNavigationGuard.guardedPush 存在未保存修改时先弹 confirm，确认后才导航
 *   - 用户取消则不导航，dirty state 保持不变
 *   - 无 dirty 时直接导航
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

const { mockConfirm } = vi.hoisted(() => ({
  mockConfirm: vi.fn(async () => true),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: mockUseNavigate,
  useLocation: vi.fn(() => ({ pathname: "/story" })),
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: mockConfirm,
}));

import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";

describe("useNavigationGuard 导航保护", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDirtyState.setState({ dirtyKeys: new Set() });
    mockConfirm.mockResolvedValue(true);
  });

  it("无 dirty 时直接导航，不弹确认", async () => {
    const { result } = renderHook(() => useNavigationGuard());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.guardedPush("/storyboard");
    });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/storyboard");
    expect(returned).toBe(true);
  });

  it("存在 dirty 时弹确认，确认后导航", async () => {
    useDirtyState.getState().markDirty("story");
    const { result } = renderHook(() => useNavigationGuard());

    await act(async () => {
      await result.current.guardedPush("/characters");
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/characters");
  });

  it("存在 dirty 但用户取消时不导航，且不清除 dirty state", async () => {
    useDirtyState.getState().markDirty("story");
    mockConfirm.mockResolvedValue(false);
    const { result } = renderHook(() => useNavigationGuard());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.guardedPush("/characters");
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(returned).toBe(false);
    // dirty state 必须保持不变（R64 约束）
    expect(useDirtyState.getState().dirtyKeys.size).toBe(1);
    expect(useDirtyState.getState().isDirty("story")).toBe(true);
  });

  it("dirty 状态在导航后仍保留（路由切换不清脏状态）", async () => {
    useDirtyState.getState().markDirty("character");
    const { result } = renderHook(() => useNavigationGuard());

    await act(async () => {
      await result.current.guardedPush("/scenes");
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(useDirtyState.getState().dirtyKeys.size).toBe(1);
  });
});
