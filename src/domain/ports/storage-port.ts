import type { VideoTask } from "@/domain/schemas/api";
import type { Character, CharacterOutfit } from "@/domain/schemas/character";
import type { Scene } from "@/domain/schemas/scene";
import type { Story } from "@/domain/schemas/story";
import type { SubShot } from "@/domain/schemas/shot";

export interface IVideoTaskStorage {
  getVideoTasks(): Promise<VideoTask[]>;
  getVideoTaskById(taskId: string): Promise<VideoTask | null>;
  getVideoTasksByStory(storyId: string): Promise<VideoTask[]>;
  getVideoTasksByStatus(status: string): Promise<VideoTask[]>;
  getPendingVideoTasks(): Promise<VideoTask[]>;
  createVideoTask(task: Partial<VideoTask> & { taskId: string }): Promise<void>;
  updateVideoTask(taskId: string, updates: Partial<VideoTask>): Promise<void>;
  deleteVideoTask(taskId: string): Promise<void>;
  deleteVideoTasksByStatus(statuses: string[]): Promise<void>;
  deleteVideoTasksByBeatId(beatId: string): Promise<void>;
  deleteVideoTasksByStoryId(storyId: string): Promise<void>;
  deleteExpiredVideoTasks(): Promise<number>;
  clearVideoTasks(): Promise<void>;
  bulkPutVideoTasks(tasks: Partial<VideoTask>[]): Promise<void>;
  batchUpdateVideoTasks(updates: Array<{ taskId: string; updates: Partial<VideoTask> }>): Promise<void>;
  batchDeleteVideoTasks(taskIds: string[]): Promise<void>;
}

export interface ICharacterStorage {
  getCharacters(): Promise<Character[]>;
  getCharacterById(id: string): Promise<Character | null>;
  getCharacterVersion(id: string): Promise<number | null>;
  createCharacter(character: Partial<Character>): Promise<void>;
  updateCharacter(id: string, updates: Partial<Character>, version?: number): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  incrementCharacterUseCount(id: string): Promise<void>;
  getOutfitsForCharacter(characterId: string): Promise<CharacterOutfit[]>;
  saveOutfitsForCharacter(characterId: string, outfits: CharacterOutfit[]): Promise<void>;
  updateOutfitImage(outfitId: string, imageUrl: string, localImagePath?: string): Promise<void>;
}

export interface ISceneStorage {
  getScenes(): Promise<Scene[]>;
  getSceneById(id: string): Promise<Scene | null>;
  getSceneVersion(id: string): Promise<number | null>;
  createScene(scene: Partial<Scene>): Promise<void>;
  updateScene(id: string, updates: Partial<Scene>, version?: number): Promise<void>;
  deleteScene(id: string): Promise<void>;
}

export interface IStoryStorage {
  getStories(): Promise<Story[]>;
  getStoryById(id: string): Promise<Story | null>;
  getStoryByBeatId(beatId: string): Promise<Story | null>;
  getStoryVersion(id: string): Promise<number | null>;
  createStory(story: Partial<Story>): Promise<void>;
  updateStory(id: string, updates: Partial<Story>, version?: number): Promise<void>;
  deleteStory(id: string): Promise<void>;
}

export interface ISubShotStorage {
  getSubShotsByBeatId(beatId: string): Promise<SubShot[]>;
  getSubShotById(id: string): Promise<SubShot | null>;
  createSubShot(subShot: Partial<SubShot> & { id: string; storyBeatId: string }): Promise<void>;
  updateSubShot(id: string, updates: Partial<SubShot>): Promise<void>;
  deleteSubShot(id: string): Promise<void>;
  deleteSubShotsByBeatId(beatId: string): Promise<void>;
  reorderSubShots(beatId: string, orderedIds: string[]): Promise<void>;
}
