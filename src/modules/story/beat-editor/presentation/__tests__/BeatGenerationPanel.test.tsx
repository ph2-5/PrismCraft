import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";
import type { StoryBeat } from "@/domain/schemas";

const { mockT, mockShowError, mockToastHelpers, mockResolveMediaUrl } = vi.hoisted(() => ({
  mockT: vi.fn((key: string) => key),
  mockShowError: vi.fn(),
  mockToastHelpers: vi.fn(() => ({ error: mockShowError })),
  // resolveMediaUrl 透传：优先 localPath，否则 remoteUrl
  mockResolveMediaUrl: vi.fn(
    (localPath?: string | null, remoteUrl?: string | null) => localPath ?? remoteUrl,
  ),
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: mockToastHelpers,
}));

vi.mock("@/shared/utils/image-url", () => ({
  resolveMediaUrl: mockResolveMediaUrl,
}));

import { BeatGenerationPanel } from "../BeatGenerationPanel";
import type { BeatUploadPanelHandle } from "../BeatUploadPanel";

function createBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 0,
    title: "镜头标题",
    description: "",
    duration: 5,
    characterIds: [],
    sceneId: undefined,
    sceneTransitions: undefined,
    sceneElements: undefined,
    elementIds: [],
    shotType: undefined,
    ...overrides,
  } as unknown as StoryBeat;
}

describe("BeatGenerationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未生成关键帧时应渲染占位 emoji 🌅", () => {
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={createBeat()}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    expect(screen.getByText("🌅")).not.toBeNull();
  });

  it("已有 keyframe.imageUrl 时应渲染 <img>（resolveMediaUrl 被调用）", () => {
    const beat = createBeat({
      keyframe: { imageUrl: "http://example.com/k.png" } as never,
      localKeyframePath: "/local/k.png",
    } as Partial<StoryBeat>);
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={beat}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    expect(mockResolveMediaUrl).toHaveBeenCalledWith("/local/k.png", "http://example.com/k.png");
    const img = screen.getByAltText("镜头标题");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("/local/k.png");
  });

  it("未生成首尾帧时应渲染 '首帧' / '尾帧' 占位文字", () => {
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={createBeat()}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    expect(screen.getByText("首帧")).not.toBeNull();
    expect(screen.getByText("尾帧")).not.toBeNull();
  });

  it("已有 firstFrame.imageUrl 时应渲染对应 <img alt='first frame'>", () => {
    const beat = createBeat({
      framePair: {
        firstFrame: { imageUrl: "http://example.com/first.png" },
        lastFrame: { imageUrl: "http://example.com/last.png" },
      } as never,
    } as Partial<StoryBeat>);
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={beat}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    expect(screen.getByAltText("first frame")).not.toBeNull();
    expect(screen.getByAltText("last frame")).not.toBeNull();
  });

  it("未生成视频时应渲染 ▶️ 占位", () => {
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={createBeat()}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    expect(screen.getByText("▶️")).not.toBeNull();
  });

  it("已有 videoGen.videoUrl 时应渲染 <video>", () => {
    const beat = createBeat({
      videoGen: { videoUrl: "http://example.com/v.mp4" } as never,
    } as Partial<StoryBeat>);
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    const { container } = render(
      <BeatGenerationPanel
        beat={beat}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("http://example.com/v.mp4");
  });

  it("imageModelId 存在时应渲染 model-chip", () => {
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    const { container } = render(
      <BeatGenerationPanel
        beat={createBeat()}
        imageModelId="model-abc"
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    const chip = container.querySelector(".model-chip");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("model-abc");
  });

  it("generatingKeyframe=true 时所有生成按钮应 disabled", () => {
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={createBeat()}
        generatingKeyframe={true}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    const buttons = screen.getAllByRole("button");
    // 3 个生成按钮 + 1 个一键生成按钮都应 disabled
    const generateButtons = buttons.filter((b) => b.textContent?.includes("common.generate"));
    generateButtons.forEach((b) => {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    });
    const oneClickBtn = buttons.find((b) => b.textContent?.includes("keyframe.oneClickGenerate"));
    expect(oneClickBtn).toBeDefined();
    expect((oneClickBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("点击关键帧生成按钮应调用 onGenerateKeyframe", () => {
    const onGenerateKeyframe = vi.fn();
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={createBeat()}
        onGenerateKeyframe={onGenerateKeyframe}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    const buttons = screen.getAllByRole("button").filter((b) => b.textContent === "common.generate");
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]!);
    expect(onGenerateKeyframe).toHaveBeenCalledTimes(1);
  });

  it("点击关键帧上传按钮应调用 uploadPanelHandle.current.triggerKeyframeUpload()", () => {
    const triggerKeyframeUpload = vi.fn();
    const handle = createRef<BeatUploadPanelHandle>();
    handle.current = { triggerKeyframeUpload } as unknown as BeatUploadPanelHandle;
    render(
      <BeatGenerationPanel
        beat={createBeat()}
        uploadPanelHandle={handle as React.RefObject<BeatUploadPanelHandle | null>}
      />,
    );
    const uploadButtons = screen.getAllByRole("button", { name: "common.upload" });
    expect(uploadButtons.length).toBeGreaterThan(0);
    fireEvent.click(uploadButtons[0]!);
    expect(triggerKeyframeUpload).toHaveBeenCalledTimes(1);
  });

  it("已有 keyframe 且提供 onRegenerateKeyframe 时应渲染重新生成按钮", () => {
    const onRegenerateKeyframe = vi.fn();
    const beat = createBeat({
      keyframe: { imageUrl: "http://example.com/k.png" } as never,
    } as Partial<StoryBeat>);
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={beat}
        onRegenerateKeyframe={onRegenerateKeyframe}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    const regenBtn = screen.getByRole("button", { name: "common.regenerate" });
    expect(regenBtn).not.toBeNull();
    fireEvent.click(regenBtn);
    expect(onRegenerateKeyframe).toHaveBeenCalledTimes(1);
  });

  it("点击一键生成应依次调用 onGenerateKeyframe / onGenerateFramePair / onGenerateVideoNew", async () => {
    const onGenerateKeyframe = vi.fn().mockResolvedValue(undefined);
    const onGenerateFramePair = vi.fn().mockResolvedValue(undefined);
    const onGenerateVideoNew = vi.fn().mockResolvedValue(undefined);
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={createBeat()}
        onGenerateKeyframe={onGenerateKeyframe}
        onGenerateFramePair={onGenerateFramePair}
        onGenerateVideoNew={onGenerateVideoNew}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    const oneClickBtn = screen.getByRole("button", { name: /keyframe.oneClickGenerate/ });
    fireEvent.click(oneClickBtn);
    await waitFor(() => {
      expect(onGenerateKeyframe).toHaveBeenCalledTimes(1);
      expect(onGenerateFramePair).toHaveBeenCalledTimes(1);
      expect(onGenerateVideoNew).toHaveBeenCalledTimes(1);
    });
  });

  it("一键生成时如果已有 keyframe，应跳过 onGenerateKeyframe", async () => {
    const onGenerateKeyframe = vi.fn().mockResolvedValue(undefined);
    const onGenerateFramePair = vi.fn().mockResolvedValue(undefined);
    const onGenerateVideoNew = vi.fn().mockResolvedValue(undefined);
    const beat = createBeat({
      keyframe: { imageUrl: "http://example.com/k.png" } as never,
    } as Partial<StoryBeat>);
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={beat}
        onGenerateKeyframe={onGenerateKeyframe}
        onGenerateFramePair={onGenerateFramePair}
        onGenerateVideoNew={onGenerateVideoNew}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    const oneClickBtn = screen.getByRole("button", { name: /keyframe.oneClickGenerate/ });
    fireEvent.click(oneClickBtn);
    await waitFor(() => {
      expect(onGenerateKeyframe).not.toHaveBeenCalled();
      expect(onGenerateFramePair).toHaveBeenCalledTimes(1);
      expect(onGenerateVideoNew).toHaveBeenCalledTimes(1);
    });
  });

  it("一键生成抛出错误时应调用 showError toast", async () => {
    const onGenerateKeyframe = vi.fn().mockRejectedValue(new Error("boom"));
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={createBeat()}
        onGenerateKeyframe={onGenerateKeyframe}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    const oneClickBtn = screen.getByRole("button", { name: /keyframe.oneClickGenerate/ });
    fireEvent.click(oneClickBtn);
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith("error.keyframeBatchFailed", "boom");
    });
  });

  it("一键生成抛出非 Error 对象时应使用默认错误消息", async () => {
    const onGenerateKeyframe = vi.fn().mockRejectedValue("string error");
    const uploadPanelHandle = { current: null } as React.RefObject<BeatUploadPanelHandle | null>;
    render(
      <BeatGenerationPanel
        beat={createBeat()}
        onGenerateKeyframe={onGenerateKeyframe}
        uploadPanelHandle={uploadPanelHandle}
      />,
    );
    const oneClickBtn = screen.getByRole("button", { name: /keyframe.oneClickGenerate/ });
    fireEvent.click(oneClickBtn);
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith("error.keyframeBatchFailed", "error.keyframeBatchFailed");
    });
  });
});
