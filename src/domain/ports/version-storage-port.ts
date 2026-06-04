import type { StoryVersion } from "@/domain/schemas";

export interface IVersionStorage {
  getStoryVersions<T = StoryVersion>(storyId: string): Promise<T[]>;
  createStoryVersion(version: StoryVersion): Promise<void>;
  deleteStoryVersion(versionId: string): Promise<void>;
  deleteOldStoryVersions(storyId: string, keepCount: number): Promise<void>;
}
