import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import {
  BeatUploadPanel,
  type BeatUploadPanelHandle,
} from "../BeatUploadPanel";

describe("BeatUploadPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应渲染 4 个隐藏的 <input type='file'> 元素", () => {
    const { container } = render(<BeatUploadPanel beatId="beat-1" />);
    const inputs = container.querySelectorAll("input[type='file']");
    expect(inputs.length).toBe(4);
  });

  it("3 个图片输入框应 accept='image/*'，1 个视频输入框应 accept='video/*'", () => {
    const { container } = render(<BeatUploadPanel beatId="beat-1" />);
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"));
    const acceptValues = inputs.map((i) => i.accept);
    const imageCount = acceptValues.filter((a) => a === "image/*").length;
    const videoCount = acceptValues.filter((a) => a === "video/*").length;
    expect(imageCount).toBe(3);
    expect(videoCount).toBe(1);
  });

  it("所有输入框应使用 hidden 类", () => {
    const { container } = render(<BeatUploadPanel beatId="beat-1" />);
    const inputs = container.querySelectorAll<HTMLInputElement>("input[type='file']");
    inputs.forEach((i) => {
      expect(i.className).toContain("hidden");
    });
  });

  it("triggerKeyframeUpload 应调用第一个 input.click()", () => {
    const ref = createRef<BeatUploadPanelHandle>();
    const { container } = render(<BeatUploadPanel ref={ref} beatId="beat-1" />);
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"));
    const clickSpy = vi.spyOn(inputs[0]!, "click");
    ref.current!.triggerKeyframeUpload();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("triggerFirstFrameUpload 应调用第二个 input.click()", () => {
    const ref = createRef<BeatUploadPanelHandle>();
    const { container } = render(<BeatUploadPanel ref={ref} beatId="beat-1" />);
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"));
    const clickSpy = vi.spyOn(inputs[1]!, "click");
    ref.current!.triggerFirstFrameUpload();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("triggerLastFrameUpload 应调用第三个 input.click()", () => {
    const ref = createRef<BeatUploadPanelHandle>();
    const { container } = render(<BeatUploadPanel ref={ref} beatId="beat-1" />);
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"));
    const clickSpy = vi.spyOn(inputs[2]!, "click");
    ref.current!.triggerLastFrameUpload();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("triggerVideoUpload 应调用第四个 input.click()", () => {
    const ref = createRef<BeatUploadPanelHandle>();
    const { container } = render(<BeatUploadPanel ref={ref} beatId="beat-1" />);
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"));
    const clickSpy = vi.spyOn(inputs[3]!, "click");
    ref.current!.triggerVideoUpload();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("选择文件后应调用 onUploadKeyframe 回调，参数为 (beatId, file)", () => {
    const onUploadKeyframe = vi.fn();
    const { container } = render(
      <BeatUploadPanel beatId="beat-x" onUploadKeyframe={onUploadKeyframe} />,
    );
    const input = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"))[0]!;
    const file = new File(["dummy"], "keyframe.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUploadKeyframe).toHaveBeenCalledWith("beat-x", file);
  });

  it("选择首帧文件应调用 onUploadFirstFrame 回调", () => {
    const onUploadFirstFrame = vi.fn();
    const { container } = render(
      <BeatUploadPanel beatId="beat-y" onUploadFirstFrame={onUploadFirstFrame} />,
    );
    const input = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"))[1]!;
    const file = new File(["first"], "first.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUploadFirstFrame).toHaveBeenCalledWith("beat-y", file);
  });

  it("选择尾帧文件应调用 onUploadLastFrame 回调", () => {
    const onUploadLastFrame = vi.fn();
    const { container } = render(
      <BeatUploadPanel beatId="beat-z" onUploadLastFrame={onUploadLastFrame} />,
    );
    const input = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"))[2]!;
    const file = new File(["last"], "last.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUploadLastFrame).toHaveBeenCalledWith("beat-z", file);
  });

  it("选择视频文件应调用 onUploadVideo 回调", () => {
    const onUploadVideo = vi.fn();
    const { container } = render(
      <BeatUploadPanel beatId="beat-v" onUploadVideo={onUploadVideo} />,
    );
    const input = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"))[3]!;
    const file = new File(["video"], "video.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUploadVideo).toHaveBeenCalledWith("beat-v", file);
  });

  it("未选择文件时不应调用回调", () => {
    const onUploadKeyframe = vi.fn();
    const { container } = render(
      <BeatUploadPanel beatId="beat-1" onUploadKeyframe={onUploadKeyframe} />,
    );
    const input = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"))[0]!;
    fireEvent.change(input, { target: { files: [] } });
    expect(onUploadKeyframe).not.toHaveBeenCalled();
  });

  it("选择文件后 input.value 应被清空（允许重复上传同一文件）", () => {
    const { container } = render(<BeatUploadPanel beatId="beat-1" onUploadKeyframe={vi.fn()} />);
    const input = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file']"))[0]!;
    const file = new File(["x"], "x.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(input.value).toBe("");
  });
});
