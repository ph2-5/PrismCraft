import type { StoryBeat } from "@/domain/schemas";

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
