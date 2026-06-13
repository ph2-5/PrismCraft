import { describe, it, expect } from "vitest";
import { getFirstFrameUrl, getLastFrameUrl } from "../frame-pair-accessors";
import type { StoryBeatFramePair } from "@/domain/schemas";

describe("getFirstFrameUrl", () => {
  it("returns undefined for undefined framePair", () => {
    expect(getFirstFrameUrl(undefined)).toBeUndefined();
  });

  it("returns undefined for empty framePair", () => {
    expect(getFirstFrameUrl({} as StoryBeatFramePair)).toBeUndefined();
  });

  it("returns firstFrameUrl when set (top-level field priority)", () => {
    const fp = {
      firstFrameUrl: "https://example.com/top-level.jpg",
      firstFrame: { imageUrl: "https://example.com/nested.jpg", prompt: "", derivedFrom: "" },
    } as StoryBeatFramePair;
    expect(getFirstFrameUrl(fp)).toBe("https://example.com/top-level.jpg");
  });

  it("falls back to firstFrame.imageUrl when firstFrameUrl is undefined", () => {
    const fp = {
      firstFrame: { imageUrl: "https://example.com/nested.jpg", prompt: "", derivedFrom: "" },
    } as StoryBeatFramePair;
    expect(getFirstFrameUrl(fp)).toBe("https://example.com/nested.jpg");
  });

  it("returns undefined when both firstFrameUrl and firstFrame.imageUrl are absent", () => {
    const fp = { firstFramePrompt: "test" } as StoryBeatFramePair;
    expect(getFirstFrameUrl(fp)).toBeUndefined();
  });

  it("returns undefined when firstFrame exists but imageUrl is empty string", () => {
    const fp = {
      firstFrame: { imageUrl: "", prompt: "", derivedFrom: "" },
    } as StoryBeatFramePair;
    expect(getFirstFrameUrl(fp)).toBe("");
  });

  it("prefers firstFrameUrl over firstFrame.imageUrl even when firstFrame.imageUrl is set", () => {
    const fp = {
      firstFrameUrl: "https://cdn.com/frame.jpg",
      firstFrame: { imageUrl: "https://cdn.com/other.jpg", prompt: "", derivedFrom: "" },
    } as StoryBeatFramePair;
    expect(getFirstFrameUrl(fp)).toBe("https://cdn.com/frame.jpg");
  });
});

describe("getLastFrameUrl", () => {
  it("returns undefined for undefined framePair", () => {
    expect(getLastFrameUrl(undefined)).toBeUndefined();
  });

  it("returns undefined for empty framePair", () => {
    expect(getLastFrameUrl({} as StoryBeatFramePair)).toBeUndefined();
  });

  it("returns lastFrameUrl when set (top-level field priority)", () => {
    const fp = {
      lastFrameUrl: "https://example.com/top-level.jpg",
      lastFrame: { imageUrl: "https://example.com/nested.jpg", prompt: "", derivedFrom: "" },
    } as StoryBeatFramePair;
    expect(getLastFrameUrl(fp)).toBe("https://example.com/top-level.jpg");
  });

  it("falls back to lastFrame.imageUrl when lastFrameUrl is undefined", () => {
    const fp = {
      lastFrame: { imageUrl: "https://example.com/nested.jpg", prompt: "", derivedFrom: "" },
    } as StoryBeatFramePair;
    expect(getLastFrameUrl(fp)).toBe("https://example.com/nested.jpg");
  });

  it("returns undefined when both lastFrameUrl and lastFrame.imageUrl are absent", () => {
    const fp = { lastFramePrompt: "test" } as StoryBeatFramePair;
    expect(getLastFrameUrl(fp)).toBeUndefined();
  });

  it("prefers lastFrameUrl over lastFrame.imageUrl even when lastFrame.imageUrl is set", () => {
    const fp = {
      lastFrameUrl: "https://cdn.com/frame.jpg",
      lastFrame: { imageUrl: "https://cdn.com/other.jpg", prompt: "", derivedFrom: "" },
    } as StoryBeatFramePair;
    expect(getLastFrameUrl(fp)).toBe("https://cdn.com/frame.jpg");
  });
});
