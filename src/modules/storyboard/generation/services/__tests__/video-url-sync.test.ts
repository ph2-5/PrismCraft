import { describe, it, expect } from "vitest";
import {
  buildVideoUrlUpdates,
  applyVideoUrlUpdates,
  buildBeatsPersistData,
  buildCacheRequests,
  filterRemoteCacheRequests,
  collectBeatRemoteImageUrls,
  syncStoriesWithVideoUrls,
} from "../video-url-sync";
import type { StoryBeat, Story } from "@/domain/schemas";

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    order: 0,
    shotDescription: "test",
    duration: 5,
    camera: { movement: "static", angle: "eye_level" },
    ...overrides,
  } as StoryBeat;
}

describe("buildVideoUrlUpdates", () => {
  it("should return empty when no completed tasks", () => {
    const beats = [makeBeat()];
    const urls = new Map<string, string>();
    expect(buildVideoUrlUpdates(beats, urls)).toEqual([]);
  });

  it("should return update when beat videoUrl differs from task", () => {
    const beats = [makeBeat({ id: "beat-1", videoGen: { prompt: "test", videoUrl: "old-url", status: "generating" } } as Partial<StoryBeat>)];
    const urls = new Map([["beat-1", "new-url"]]);
    const updates = buildVideoUrlUpdates(beats, urls);
    expect(updates).toEqual([{ beatId: "beat-1", videoUrl: "new-url" }]);
  });

  it("should skip when beat videoUrl already matches", () => {
    const beats = [makeBeat({ id: "beat-1", videoGen: { prompt: "test", videoUrl: "same-url", status: "completed" } } as Partial<StoryBeat>)];
    const urls = new Map([["beat-1", "same-url"]]);
    expect(buildVideoUrlUpdates(beats, urls)).toEqual([]);
  });

  it("should skip when beatId not found in beats", () => {
    const beats = [makeBeat({ id: "beat-1" } as Partial<StoryBeat>)];
    const urls = new Map([["beat-999", "new-url"]]);
    expect(buildVideoUrlUpdates(beats, urls)).toEqual([]);
  });

  it("should handle multiple updates", () => {
    const beats = [
      makeBeat({ id: "beat-1", videoGen: { prompt: "a", videoUrl: "old-1", status: "generating" } } as Partial<StoryBeat>),
      makeBeat({ id: "beat-2", videoGen: { prompt: "b", videoUrl: "old-2", status: "generating" } } as Partial<StoryBeat>),
    ];
    const urls = new Map([["beat-1", "new-1"], ["beat-2", "new-2"]]);
    expect(buildVideoUrlUpdates(beats, urls)).toHaveLength(2);
  });
});

describe("applyVideoUrlUpdates", () => {
  it("should return original beats when no updates", () => {
    const beats = [makeBeat()];
    expect(applyVideoUrlUpdates(beats, [])).toBe(beats);
  });

  it("should apply video URL update to matching beat", () => {
    const beats = [makeBeat({ id: "beat-1" } as Partial<StoryBeat>)];
    const updates = [{ beatId: "beat-1", videoUrl: "new-url" }];
    const result = applyVideoUrlUpdates(beats, updates);
    expect(result[0]!.videoGen?.videoUrl).toBe("new-url");
    expect(result[0]!.videoGen?.status).toBe("completed");
    expect(result[0]!.videoGen).toHaveProperty("completedAt");
  });

  it("should preserve existing videoGen fields", () => {
    const beats = [makeBeat({ id: "beat-1", videoGen: { prompt: "my prompt", videoUrl: "old", status: "generating", taskId: "t-1" } } as Partial<StoryBeat>)];
    const updates = [{ beatId: "beat-1", videoUrl: "new-url" }];
    const result = applyVideoUrlUpdates(beats, updates);
    expect(result[0]!.videoGen?.prompt).toBe("my prompt");
    expect(result[0]!.videoGen?.taskId).toBe("t-1");
    expect(result[0]!.videoGen?.videoUrl).toBe("new-url");
  });

  it("should not modify unmatched beats", () => {
    const beats = [makeBeat({ id: "beat-1" } as Partial<StoryBeat>), makeBeat({ id: "beat-2" } as Partial<StoryBeat>)];
    const updates = [{ beatId: "beat-1", videoUrl: "new-url" }];
    const result = applyVideoUrlUpdates(beats, updates);
    expect(result[1]!.videoGen).toBeUndefined();
  });
});

describe("buildBeatsPersistData", () => {
  it("should map beat fields to persist data", () => {
    const beats = [makeBeat({
      id: "beat-1",
      keyframe: { imageUrl: "kf.jpg", prompt: "kf", generatedAt: "2024-01-01" },
      framePair: {
        firstFrame: { imageUrl: "ff.jpg", prompt: "ff", derivedFrom: "kf" },
        lastFrame: { imageUrl: "lf.jpg", prompt: "lf", derivedFrom: "kf" },
        generatedAt: "2024-01-01",
      },
      videoGen: { prompt: "v", videoUrl: "video.mp4", status: "completed" },
      localKeyframePath: "/local/kf.jpg",
      localVideoPath: "/local/video.mp4",
    } as Partial<StoryBeat>)];
    const urls = new Map<string, string>();

    const data = buildBeatsPersistData(beats, urls);
    expect(data).toHaveLength(1);
    expect(data[0]!.id).toBe("beat-1");
    expect(data[0]!.keyframeImageUrl).toBe("kf.jpg");
    expect(data[0]!.firstFrameImageUrl).toBe("ff.jpg");
    expect(data[0]!.lastFrameImageUrl).toBe("lf.jpg");
    expect(data[0]!.videoUrl).toBe("video.mp4");
    expect(data[0]!.localKeyframePath).toBe("/local/kf.jpg");
    expect(data[0]!.localVideoPath).toBe("/local/video.mp4");
  });

  it("should prefer completedTaskUrls over beat videoGen URL", () => {
    const beats = [makeBeat({
      id: "beat-1",
      videoGen: { prompt: "v", videoUrl: "old.mp4", status: "generating" },
    } as Partial<StoryBeat>)];
    const urls = new Map([["beat-1", "new.mp4"]]);

    const data = buildBeatsPersistData(beats, urls);
    expect(data[0]!.videoUrl).toBe("new.mp4");
  });

  it("should handle beat with no media fields", () => {
    const beats = [makeBeat({ id: "beat-1" } as Partial<StoryBeat>)];
    const urls = new Map<string, string>();

    const data = buildBeatsPersistData(beats, urls);
    expect(data[0]!.keyframeImageUrl).toBeUndefined();
    expect(data[0]!.videoUrl).toBeUndefined();
  });
});

describe("buildCacheRequests", () => {
  it("should return empty for beats with no remote images", () => {
    const beats = [makeBeat({ id: "beat-1" } as Partial<StoryBeat>)];
    expect(buildCacheRequests(beats)).toEqual([]);
  });

  it("should request cache for keyframe without local path", () => {
    const beats = [makeBeat({
      id: "beat-1",
      keyframe: { imageUrl: "https://cdn.com/kf.jpg", prompt: "kf", generatedAt: "2024-01-01" },
    } as Partial<StoryBeat>)];
    const requests = buildCacheRequests(beats);
    expect(requests).toEqual([{ beatId: "beat-1", field: "localKeyframePath", url: "https://cdn.com/kf.jpg" }]);
  });

  it("should skip keyframe that already has local path", () => {
    const beats = [makeBeat({
      id: "beat-1",
      keyframe: { imageUrl: "https://cdn.com/kf.jpg", prompt: "kf", generatedAt: "2024-01-01" },
      localKeyframePath: "/local/kf.jpg",
    } as Partial<StoryBeat>)];
    expect(buildCacheRequests(beats)).toEqual([]);
  });

  it("should request cache for frame pair images", () => {
    const beats = [makeBeat({
      id: "beat-1",
      framePair: {
        firstFrame: { imageUrl: "https://cdn.com/ff.jpg", prompt: "ff", derivedFrom: "kf" },
        lastFrame: { imageUrl: "https://cdn.com/lf.jpg", prompt: "lf", derivedFrom: "kf" },
        generatedAt: "2024-01-01",
      },
    } as Partial<StoryBeat>)];
    const requests = buildCacheRequests(beats);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.field).toBe("localFirstFramePath");
    expect(requests[1]!.field).toBe("localLastFramePath");
  });

  it("should handle multiple beats", () => {
    const beats = [
      makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://a.com/1.jpg", prompt: "1", generatedAt: "t" } } as Partial<StoryBeat>),
      makeBeat({ id: "beat-2", keyframe: { imageUrl: "https://b.com/2.jpg", prompt: "2", generatedAt: "t" } } as Partial<StoryBeat>),
    ];
    const requests = buildCacheRequests(beats);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.beatId).toBe("beat-1");
    expect(requests[1]!.beatId).toBe("beat-2");
  });
});

describe("filterRemoteCacheRequests", () => {
  it("should keep http and https URLs", () => {
    const requests = [
      { beatId: "b1", field: "localKeyframePath" as const, url: "https://cdn.com/img.jpg" },
      { beatId: "b2", field: "localKeyframePath" as const, url: "http://cdn.com/img.jpg" },
    ];
    expect(filterRemoteCacheRequests(requests)).toHaveLength(2);
  });

  it("should filter out non-http URLs", () => {
    const requests = [
      { beatId: "b1", field: "localKeyframePath" as const, url: "https://cdn.com/img.jpg" },
      { beatId: "b2", field: "localKeyframePath" as const, url: "blob:http://localhost/abc" },
      { beatId: "b3", field: "localKeyframePath" as const, url: "file:///local/img.jpg" },
      { beatId: "b4", field: "localKeyframePath" as const, url: "data:image/png;base64,abc" },
    ];
    expect(filterRemoteCacheRequests(requests)).toHaveLength(1);
    expect(filterRemoteCacheRequests(requests)[0]!.beatId).toBe("b1");
  });

  it("should return empty for empty input", () => {
    expect(filterRemoteCacheRequests([])).toEqual([]);
  });
});

describe("collectBeatRemoteImageUrls", () => {
  it("should collect http(s) image and video URLs from beat", () => {
    const beat = makeBeat({
      keyframe: { imageUrl: "https://cdn.com/kf.jpg", prompt: "kf", generatedAt: "t" },
      framePair: {
        firstFrame: { imageUrl: "https://cdn.com/ff.jpg", prompt: "ff", derivedFrom: "kf" },
        lastFrame: { imageUrl: "https://cdn.com/lf.jpg", prompt: "lf", derivedFrom: "kf" },
        generatedAt: "t",
      },
      videoGen: { prompt: "v", videoUrl: "https://cdn.com/video.mp4", status: "completed" },
    } as Partial<StoryBeat>);
    expect(collectBeatRemoteImageUrls(beat)).toEqual([
      "https://cdn.com/kf.jpg",
      "https://cdn.com/ff.jpg",
      "https://cdn.com/lf.jpg",
      "https://cdn.com/video.mp4",
    ]);
  });

  it("should skip local and data URLs", () => {
    const beat = makeBeat({
      keyframe: { imageUrl: "file:///local/kf.jpg", prompt: "kf", generatedAt: "t" },
    } as Partial<StoryBeat>);
    expect(collectBeatRemoteImageUrls(beat)).toEqual([]);
  });
});

describe("syncStoriesWithVideoUrls", () => {
  it("should update beats in matching stories", () => {
    const stories = [
      {
        id: "story-1",
        title: "A",
        beats: [makeBeat({ id: "beat-1", videoGen: { prompt: "v", videoUrl: "old", status: "generating" } })],
      },
      {
        id: "story-2",
        title: "B",
        beats: [makeBeat({ id: "beat-2" })],
      },
    ] as Story[];
    const urls = new Map([["beat-1", "new-url"]]);
    const result = syncStoriesWithVideoUrls(stories, urls);
    expect(result[0]!.beats?.[0]!.videoGen?.videoUrl).toBe("new-url");
    expect(result[1]).toBe(stories[1]);
  });

  it("should return same array reference when no updates needed", () => {
    const stories = [{ id: "story-1", title: "A", beats: [makeBeat({ id: "beat-1" })] }] as Story[];
    const urls = new Map<string, string>();
    expect(syncStoriesWithVideoUrls(stories, urls)).toBe(stories);
  });
});
