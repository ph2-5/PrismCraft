import type { StoryBeat, Story } from "@/domain/schemas";

export interface VideoUrlUpdate {
  beatId: string;
  videoUrl: string;
}

export interface BeatPersistData {
  id: string;
  keyframeImageUrl?: string;
  firstFrameImageUrl?: string;
  lastFrameImageUrl?: string;
  videoUrl?: string;
  localKeyframePath?: string;
  localFirstFramePath?: string;
  localLastFramePath?: string;
  localVideoPath?: string;
}

export interface CacheRequest {
  beatId: string;
  field: "localKeyframePath" | "localFirstFramePath" | "localLastFramePath";
  url: string;
}

export function buildVideoUrlUpdates(
  beats: StoryBeat[],
  completedTaskUrls: Map<string, string>,
): VideoUrlUpdate[] {
  const updates: VideoUrlUpdate[] = [];
  for (const [beatId, videoUrl] of completedTaskUrls.entries()) {
    const beat = beats.find((b) => b.id === beatId);
    if (beat && beat.videoGen?.videoUrl !== videoUrl) {
      updates.push({ beatId, videoUrl });
    }
  }
  return updates;
}

export function applyVideoUrlUpdates(
  beats: StoryBeat[],
  updates: VideoUrlUpdate[],
): StoryBeat[] {
  if (updates.length === 0) return beats;
  const updateMap = new Map(updates.map((u) => [u.beatId, u.videoUrl]));
  return beats.map((b) => {
    const newUrl = updateMap.get(b.id);
    if (newUrl !== undefined) {
      return {
        ...b,
        videoGen: {
          ...(b.videoGen || { prompt: "" }),
          videoUrl: newUrl,
          status: "completed" as const,
          completedAt: Date.now(),
        },
      };
    }
    return b;
  });
}

export function buildBeatsPersistData(
  beats: StoryBeat[],
  completedTaskUrls: Map<string, string>,
): BeatPersistData[] {
  return beats.map((beat) => ({
    id: beat.id,
    keyframeImageUrl: beat.keyframe?.imageUrl,
    firstFrameImageUrl: beat.framePair?.firstFrame?.imageUrl,
    lastFrameImageUrl: beat.framePair?.lastFrame?.imageUrl,
    videoUrl: completedTaskUrls.get(beat.id) ?? beat.videoGen?.videoUrl,
    localKeyframePath: beat.localKeyframePath,
    localFirstFramePath: beat.localFirstFramePath,
    localLastFramePath: beat.localLastFramePath,
    localVideoPath: beat.localVideoPath,
  }));
}

export function buildCacheRequests(beats: StoryBeat[]): CacheRequest[] {
  const requests: CacheRequest[] = [];
  for (const beat of beats) {
    if (beat.keyframe?.imageUrl && !beat.localKeyframePath) {
      requests.push({ beatId: beat.id, field: "localKeyframePath", url: beat.keyframe.imageUrl });
    }
    if (beat.framePair?.firstFrame?.imageUrl && !beat.localFirstFramePath) {
      requests.push({ beatId: beat.id, field: "localFirstFramePath", url: beat.framePair.firstFrame.imageUrl });
    }
    if (beat.framePair?.lastFrame?.imageUrl && !beat.localLastFramePath) {
      requests.push({ beatId: beat.id, field: "localLastFramePath", url: beat.framePair.lastFrame.imageUrl });
    }
  }
  return requests;
}

export function filterRemoteCacheRequests(requests: CacheRequest[]): CacheRequest[] {
  return requests.filter(
    (r) => r.url.startsWith("http://") || r.url.startsWith("https://"),
  );
}

/** 收集 beat 关联的远程图片 URL，用于删除时清理 image_cache */
export function collectBeatRemoteImageUrls(beat: StoryBeat): string[] {
  const urls: string[] = [];
  if (beat.keyframe?.imageUrl?.startsWith("http")) {
    urls.push(beat.keyframe.imageUrl);
  }
  if (beat.framePair?.firstFrame?.imageUrl?.startsWith("http")) {
    urls.push(beat.framePair.firstFrame.imageUrl);
  }
  if (beat.framePair?.lastFrame?.imageUrl?.startsWith("http")) {
    urls.push(beat.framePair.lastFrame.imageUrl);
  }
  if (beat.videoGen?.videoUrl?.startsWith("http")) {
    urls.push(beat.videoGen.videoUrl);
  }
  return urls;
}

/** 将视频 URL 更新同步到 stories 内存缓存，避免切换故事时读到陈旧 beats */
export function syncStoriesWithVideoUrls(
  stories: Story[],
  completedTaskUrls: Map<string, string>,
): Story[] {
  if (completedTaskUrls.size === 0) return stories;
  return stories.map((story) => {
    const beats = story.beats;
    if (!beats?.length) return story;
    const updates = buildVideoUrlUpdates(beats, completedTaskUrls);
    if (updates.length === 0) return story;
    return { ...story, beats: applyVideoUrlUpdates(beats, updates) };
  });
}
