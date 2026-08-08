/**
 * blockout3d-panel.test.tsx — Blockout3DPanel 渲染回归（3D 透出修复保护）
 *
 * 背景（2026-08-08）：3D 白模画布容器无背景色 + Three.js Canvas 默认透明，
 * 导致分镜编辑器右侧 3D Tab 透出背后分镜画布内容（用户报告的"弹出画布内容"bug）。
 * 修复：画布容器加 var(--muted) 背景。本测试锁定该样式，防止回归。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/shared/constants", () => ({
  t: (key: string) => key,
}));

// 3D 渲染组件在 jsdom 不可用，全部打桩，聚焦容器样式契约
vi.mock("../Blockout3DCanvas", () => ({
  Blockout3DCanvas: () => <div data-testid="mock-3d-canvas">canvas</div>,
}));
vi.mock("../SceneOutliner", () => ({ SceneOutliner: () => <div /> }));
vi.mock("../PresetSelector", () => ({ PresetSelector: () => <div /> }));
vi.mock("../MannequinControls", () => ({ MannequinControls: () => <div /> }));
vi.mock("../CameraPathEditor", () => ({ CameraPathEditor: () => <div /> }));
vi.mock("../ExportPanel", () => ({ ExportPanel: () => <div /> }));

import { Blockout3DPanel } from "../Blockout3DPanel";
import { createEmptyScene } from "../../domain/scene-schema";

describe("Blockout3DPanel", () => {
  it("3D 画布容器带背景色（防透明透出背后内容回归）", () => {
    render(
      <Blockout3DPanel
        scene={createEmptyScene()}
        onSceneChange={() => {}}
        modelId="seedance-pro"
        modelSupports3D
      />,
    );

    // 3D 画布容器：relative + muted 背景（与 webglUnavailable fallback 一致的兜底底色）
    const canvasWrapper = screen.getByTestId("mock-3d-canvas").parentElement;
    expect(canvasWrapper).not.toBeNull();
    expect(canvasWrapper!.style.background).toContain("muted");
  });
});
