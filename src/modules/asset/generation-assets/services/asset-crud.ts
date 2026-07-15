/**
 * GenerationAsset CRUD Service — 生成资产业务逻辑（Task 4.11）
 */
import { container } from "@/infrastructure/di";
import type { GenerationAsset } from "@/domain/schemas";

function generateAssetId(): string {
  return `gen-asset-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export async function listAssetsByType(type: string): Promise<GenerationAsset[]> {
  const storage = container.generationAssetStorage;
  return storage.getAssetsByType(type);
}

export async function listAssetsByProject(projectId: string): Promise<GenerationAsset[]> {
  const storage = container.generationAssetStorage;
  return storage.getAssetsByProject(projectId);
}

export async function listAssetsByBeat(beatId: string): Promise<GenerationAsset[]> {
  const storage = container.generationAssetStorage;
  return storage.getAssetsByStoryBeat(beatId);
}

export async function getAsset(id: string): Promise<GenerationAsset | null> {
  const storage = container.generationAssetStorage;
  return storage.getAssetById(id);
}

export async function createAsset(
  input: Partial<Omit<GenerationAsset, "id" | "createdAt">> & { type: string; sourceType: string; url: string },
): Promise<GenerationAsset> {
  const storage = container.generationAssetStorage;
  const asset = {
    id: generateAssetId(),
    ...input,
  };
  await storage.createAsset(asset);
  const created = await storage.getAssetById(asset.id);
  if (!created) {
    throw new Error(`Failed to create GenerationAsset: ${asset.id}`);
  }
  return created;
}

export async function updateAsset(id: string, updates: Partial<GenerationAsset>): Promise<void> {
  const storage = container.generationAssetStorage;
  await storage.updateAsset(id, updates);
}

export async function deleteAsset(id: string): Promise<void> {
  const storage = container.generationAssetStorage;
  await storage.deleteAsset(id);
}

export async function deleteUnreferencedAssets(): Promise<number> {
  const storage = container.generationAssetStorage;
  return storage.deleteUnreferencedAssets();
}

export function getReferenceInfo(asset: GenerationAsset): string | null {
  if (asset.storyBeatId) return `StoryBeat: ${asset.storyBeatId}`;
  if (asset.subShotId) return `SubShot: ${asset.subShotId}`;
  if (asset.characterId) return `Character: ${asset.characterId}`;
  if (asset.characterVariantId) return `CharacterVariant: ${asset.characterVariantId}`;
  if (asset.sceneId) return `Scene: ${asset.sceneId}`;
  if (asset.sceneVariantId) return `SceneVariant: ${asset.sceneVariantId}`;
  if (asset.projectId) return `Project: ${asset.projectId}`;
  return null;
}
