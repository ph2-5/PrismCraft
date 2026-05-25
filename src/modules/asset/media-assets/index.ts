import type { MediaAsset } from "@/domain/schemas";
import { container } from "@/infrastructure/di";

export const mediaAssetService = {
  async getAll(): Promise<MediaAsset[]> {
    const result = await container.mediaAssetRepository.findAll();
    return result.ok ? result.value : [];
  },

  async getById(id: string): Promise<MediaAsset | undefined> {
    const result = await container.mediaAssetRepository.findById(id);
    if (!result.ok) return undefined;
    return result.value ?? undefined;
  },

  async create(asset: Omit<MediaAsset, "id" | "createdAt" | "updatedAt">): Promise<MediaAsset> {
    const id = `media_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newAsset: MediaAsset = {
      ...asset,
      id,
      createdAt: now,
      updatedAt: now,
    };
    const result = await container.mediaAssetRepository.create(newAsset);
    if (!result.ok) throw result.error;
    return result.value;
  },

  async update(id: string, updates: Partial<MediaAsset>): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error(`Media asset ${id} not found`);
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    const result = await container.mediaAssetRepository.create(updated);
    if (!result.ok) throw result.error;
  },

  async remove(id: string): Promise<void> {
    const result = await container.mediaAssetRepository.delete(id);
    if (!result.ok) throw result.error;
  },

  async batchRemove(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.remove(id);
    }
  },
};
