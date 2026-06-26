import type { Result } from "@/domain/types";
import { fromAsyncThrowable, ok } from "@/domain/types";
import type { Story, StoryBeat, StoryVersion } from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";

const MAX_VERSIONS_PER_STORY = 20;

function getStableStoryId(story: Story): string {
  if (story.id) return story.id;
  return `new_${crypto.randomUUID()}`;
}

export async function getVersions(storyId: string): Promise<Result<StoryVersion[]>> {
  return fromAsyncThrowable(async () => {
    if (typeof window === "undefined") return [];
    return await container.versionStorage.getStoryVersions<StoryVersion>(storyId);
  });
}

export async function saveVersion(
  story: Story,
  beats: StoryBeat[],
  changeSummary: string = "",
  autoSaved: boolean = false,
): Promise<Result<StoryVersion | null>> {
  const stableId = getStableStoryId(story);
  const version: StoryVersion = {
    id: `${stableId}-${Date.now()}`,
    storyId: stableId,
    timestamp: Date.now(),
    beats: structuredClone(beats),
    title: story.title,
    description: story.description,
    genre: story.genre || "drama",
    tone: story.tone || "neutral",
    targetDuration: story.targetDuration || 60,
    characters: story.characters || [],
    scenes: story.scenes || [],
    changeSummary: changeSummary || (autoSaved ? "自动保存" : "手动保存"),
    autoSaved,
  };

  if (typeof window === "undefined") {
    return ok(version);
  }

  return fromAsyncThrowable(async () => {
    try {
      await container.versionStorage.createStoryVersion(version);
      await container.versionStorage.deleteOldStoryVersions(
        stableId,
        MAX_VERSIONS_PER_STORY,
      );
      return version;
    } catch (error) {
      errorLogger.error({ code: "SAVE_VERSION_ERROR", message: t("error.versionSaveFailed"), cause: error });
      return null;
    }
  });
}

export async function restoreVersion(
  version: StoryVersion,
  currentStory: Story,
  currentBeats: StoryBeat[],
): Promise<Result<{
  story: Story;
  beats: StoryBeat[];
}>> {
  return fromAsyncThrowable(async () => {
    await saveVersion(
      currentStory,
      currentBeats,
      `恢复版本 ${formatVersionTime(version.timestamp)} 前的备份`,
      false,
    );

    const story: Story = {
      id: version.storyId,
      title: version.title,
      description: version.description,
      genre: version.genre,
      tone: version.tone,
      targetDuration: version.targetDuration,
      characters: version.characters,
      scenes: version.scenes,
      beats: version.beats,
      elementIds: [],
      createdAt: Math.floor(version.timestamp / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    };

    return { story, beats: structuredClone(version.beats) };
  });
}

export async function deleteVersion(
  _storyId: string,
  versionId: string,
): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    if (typeof window === "undefined") return;
    try {
      await container.versionStorage.deleteStoryVersion(versionId);
    } catch (error) {
      errorLogger.error({ code: "DELETE_VERSION_ERROR", message: t("error.versionDeleteFailed"), cause: error });
    }
  });
}

export async function cleanupVersions(
  storyId: string,
  keepCount: number = 10,
): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    if (typeof window === "undefined") return;
    try {
      await container.versionStorage.deleteOldStoryVersions(storyId, keepCount);
    } catch (error) {
      errorLogger.error({ code: "CLEANUP_VERSION_ERROR", message: t("error.cleanupVersionFailed"), cause: error });
    }
  });
}

export async function getVersionStats(storyId: string): Promise<Result<{
  total: number;
  autoSaved: number;
  manualSaved: number;
  oldestVersion: number | null;
  newestVersion: number | null;
}>> {
  return fromAsyncThrowable(async () => {
    const versionsResult = await getVersions(storyId);
    const versions = versionsResult.ok ? versionsResult.value : [];
    return {
      total: versions.length,
      autoSaved: versions.filter((v) => v.autoSaved).length,
      manualSaved: versions.filter((v) => !v.autoSaved).length,
      oldestVersion:
        versions.length > 0 ? versions[versions.length - 1]!.timestamp : null,
      newestVersion: versions.length > 0 ? versions[0]!.timestamp : null,
    };
  });
}

export function compareVersions(
  v1: StoryVersion,
  v2: StoryVersion,
): {
  beatsAdded: number;
  beatsRemoved: number;
  beatsModified: number;
  durationChanged: number;
  charactersChanged: boolean;
  scenesChanged: boolean;
} {
  const beatsAdded = v2.beats.length - v1.beats.length;
  let beatsModified = 0;
  const minLength = Math.min(v1.beats.length, v2.beats.length);
  for (let i = 0; i < minLength; i++) {
    if (
      v1.beats[i]!.title !== v2.beats[i]!.title ||
      v1.beats[i]!.content !== v2.beats[i]!.content
    ) {
      beatsModified++;
    }
  }
  const v1Duration = v1.beats.reduce((sum, b) => sum + (b.duration || 0), 0);
  const v2Duration = v2.beats.reduce((sum, b) => sum + (b.duration || 0), 0);
  return {
    beatsAdded: Math.max(0, beatsAdded),
    beatsRemoved: Math.max(0, -beatsAdded),
    beatsModified,
    durationChanged: v2Duration - v1Duration,
    charactersChanged:
      JSON.stringify(v1.characters) !== JSON.stringify(v2.characters),
    scenesChanged: JSON.stringify(v1.scenes) !== JSON.stringify(v2.scenes),
  };
}

export function formatVersionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = Math.max(0, now.getTime() - timestamp);
  if (diff < 60 * 1000) return t("task.justNow");
  if (diff < 60 * 60 * 1000)
    return t("task.minutesAgo", { count: Math.floor(diff / (60 * 1000)) });
  if (diff < 24 * 60 * 60 * 1000)
    return t("task.hoursAgo", { count: Math.floor(diff / (60 * 60 * 1000)) });
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
