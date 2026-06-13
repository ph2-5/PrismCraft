import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyframeChain, generateFramePairChain } from "../beat-chain-generator";

vi.mock("@/domain/utils", () => ({
  generateBeatImagePrompt: vi.fn().mockReturnValue("generated prompt"),
  getFirstFrameUrl: vi.fn((fp: any) => fp?.firstFrameUrl || fp?.firstFrame?.imageUrl),
  getLastFrameUrl: vi.fn((fp: any) => fp?.lastFrameUrl || fp?.lastFrame?.imageUrl),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("../video-generation-mode", () => ({
  determineVideoGenerationMode: vi.fn(() => "first_frame_anchor"),
}));

vi.mock("../beat-frame-generator", () => ({
  generateBeatKeyframe: vi.fn(),
  generateBeatFramePair: vi.fn(),
}));

vi.mock("../beat-video-generator", () => ({
  generateBeatVideo: vi.fn(),
}));

import { generateBeatKeyframe, generateBeatFramePair } from "../beat-frame-generator";
import { getLastFrameUrl } from "@/domain/utils";

function buildBeat(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    title: `Beat ${id}`,
    content: `Content for ${id}`,
    description: `Desc for ${id}`,
    order: 0,
    keyframe: { imageUrl: `https://cdn.com/keyframe-${id}.jpg`, prompt: "", derivedFrom: "" },
    ...overrides,
  } as any;
}

const mockProviders = {
  videoProvider: {},
  imageProvider: {},
  textProvider: {},
} as any;

describe("generateKeyframeChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty map for empty beats array", async () => {
    const result = await generateKeyframeChain([], {}, mockProviders);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(0);
    }
  });

  it("generates keyframes for all beats sequentially", async () => {
    const beats = [buildBeat("b1"), buildBeat("b2"), buildBeat("b3")];

    (generateBeatKeyframe as any).mockImplementation(async (beat: any) => ({
      ok: true,
      value: { imageUrl: `https://cdn.com/kf-${beat.id}.jpg`, prompt: "", derivedFrom: "" },
    }));

    const result = await generateKeyframeChain(beats, {}, mockProviders);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(3);
      expect(result.value.has("b1")).toBe(true);
      expect(result.value.has("b2")).toBe(true);
      expect(result.value.has("b3")).toBe(true);
    }
  });

  it("continues chain when a beat fails", async () => {
    const beats = [buildBeat("b1"), buildBeat("b2"), buildBeat("b3")];

    (generateBeatKeyframe as any).mockImplementation(async (beat: any) => {
      if (beat.id === "b2") return { ok: false, error: new Error("fail") };
      return { ok: true, value: { imageUrl: `https://cdn.com/kf-${beat.id}.jpg`, prompt: "", derivedFrom: "" } };
    });

    const result = await generateKeyframeChain(beats, {}, mockProviders);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(2);
      expect(result.value.has("b1")).toBe(true);
      expect(result.value.has("b3")).toBe(true);
    }
  });
});

describe("generateFramePairChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips beats without keyframes", async () => {
    const beats = [
      buildBeat("b1", { keyframe: undefined }),
      buildBeat("b2", { keyframe: { imageUrl: "https://cdn.com/kf.jpg", prompt: "", derivedFrom: "" } }),
    ];

    (generateBeatFramePair as any).mockImplementation(async (beat: any) => ({
      ok: true,
      value: {
        firstFrameUrl: `https://cdn.com/ff-${beat.id}.jpg`,
        lastFrameUrl: `https://cdn.com/lf-${beat.id}.jpg`,
      },
    }));

    const result = await generateFramePairChain(beats, { characters: [], scenes: [] }, mockProviders);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(1);
      expect(result.value.has("b2")).toBe(true);
    }
  });

  it("passes prevLastFrameUrl from previous beat's framePair", async () => {
    const beats = [
      buildBeat("b1"),
      buildBeat("b2"),
    ];

    (generateBeatFramePair as any).mockImplementation(async (beat: any, _options: any) => {
      if (beat.id === "b1") {
        return {
          ok: true,
          value: {
            lastFrameUrl: "https://cdn.com/lf-b1.jpg",
            lastFrame: { imageUrl: "https://cdn.com/lf-b1-nested.jpg", prompt: "", derivedFrom: "" },
          },
        };
      }
      return {
        ok: true,
        value: { firstFrameUrl: `https://cdn.com/ff-${beat.id}.jpg` },
      };
    });

    const result = await generateFramePairChain(beats, { characters: [], scenes: [] }, mockProviders);
    expect(result.ok).toBe(true);

    const secondCallOptions = (generateBeatFramePair as any).mock.calls[1]?.[1];
    expect(secondCallOptions?.prevLastFrameUrl).toBe("https://cdn.com/lf-b1.jpg");
  });

  it("resets prevLastFrameUrl to undefined when a beat fails", async () => {
    const beats = [buildBeat("b1"), buildBeat("b2"), buildBeat("b3")];

    (generateBeatFramePair as any).mockImplementation(async (beat: any) => {
      if (beat.id === "b2") throw new Error("fail");
      return {
        ok: true,
        value: { lastFrameUrl: `https://cdn.com/lf-${beat.id}.jpg` },
      };
    });

    const result = await generateFramePairChain(beats, { characters: [], scenes: [] }, mockProviders);
    expect(result.ok).toBe(true);

    const thirdCallOptions = (generateBeatFramePair as any).mock.calls[2]?.[1];
    expect(thirdCallOptions?.prevLastFrameUrl).toBeUndefined();
  });

  it("uses getLastFrameUrl for prevLastFrameUrl extraction", async () => {
    const beats = [buildBeat("b1"), buildBeat("b2")];

    (generateBeatFramePair as any).mockImplementation(async (beat: any) => {
      if (beat.id === "b1") {
        return {
          ok: true,
          value: {
            lastFrame: { imageUrl: "https://cdn.com/lf-b1-nested.jpg", prompt: "", derivedFrom: "" },
          },
        };
      }
      return { ok: true, value: {} };
    });

    await generateFramePairChain(beats, { characters: [], scenes: [] }, mockProviders);

    expect(getLastFrameUrl).toHaveBeenCalledWith(
      expect.objectContaining({ lastFrame: expect.any(Object) }),
    );
  });
});
