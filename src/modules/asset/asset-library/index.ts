import { container } from "@/infrastructure/di";
import type { AsaExportData, Character, Collection, Scene, StoryboardAsset } from "@/domain/schemas";
import { updateOutfitImage } from "@/shared/outfit";
import { errorLogger } from "@/shared/error-logger";
import { normalizeGender } from "@/shared/utils/utils";

async function saveImageToLocal(
  imageData: string,
  subDir: string,
  filename: string,
): Promise<string | null> {
  if (!window.electronAPI) return null;
  try {
    if (imageData.startsWith("data:")) {
      const result = await window.electronAPI.saveImage(
        imageData,
        subDir,
        filename,
      );
      return result?.filePath || null;
    }
    if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
      const response = await fetch(imageData);
      if (!response.ok) return null;
      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const result = await window.electronAPI.saveImage(
        base64,
        subDir,
        filename,
      );
      return result?.filePath || null;
    }
    if (imageData.startsWith("file://") || imageData.includes(":\\")) {
      return imageData.replace(/^file:\/\/\//, "");
    }
    return null;
  } catch {
    return null;
  }
}

async function deleteLocalFile(filePath: string): Promise<void> {
  if (!window.electronAPI) return;
  try {
    await window.electronAPI.deleteFile(filePath);
  } catch (e) {
    errorLogger.warn("[AssetLibrary] 删除文件失败", e);
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export const characterService = {
  async getAll(): Promise<Character[]> {
    return container.characterStorage.getCharacters();
  },

  async getById(id: string): Promise<Character | undefined> {
    return (await container.characterStorage.getCharacterById(id)) ?? undefined;
  },

  async create(
    character: Omit<Character, "id" | "createdAt"> & { id?: string },
  ): Promise<Character> {
    const id = character.id || `char-${generateId()}`;
    const now = new Date().toISOString();
    const newChar: Character = {
      ...character,
      gender: normalizeGender(character.gender),
      id,
      createdAt: now,
      updatedAt: now,
    } as Character;

    if (newChar.generatedImage) {
      const localPath = await saveImageToLocal(
        newChar.generatedImage,
        "characters",
        id,
      );
      if (localPath) {
        newChar.avatarPath = localPath;
        newChar.generatedImage = localPath;
      }
    }

    await container.characterStorage.createCharacter(newChar);
    return newChar;
  },

  async update(id: string, updates: Partial<Character>): Promise<void> {
    const existing = await container.characterStorage.getCharacterById(id);
    if (!existing) throw new Error("角色不存在");
    const updated = {
      ...existing,
      ...updates,
      ...(updates.gender !== undefined && { gender: normalizeGender(updates.gender) }),
      id,
      updatedAt: new Date().toISOString(),
    };
    if (updates.generatedImage) {
      const localPath = await saveImageToLocal(
        updates.generatedImage,
        "characters",
        id,
      );
      if (localPath) {
        updated.avatarPath = localPath;
        updated.generatedImage = localPath;
      }
    }
    if (updates.outfits) {
      for (const outfit of updates.outfits) {
        if (
          outfit.imageUrl &&
          !outfit.imageUrl.startsWith("file://") &&
          !outfit.imageUrl.includes(":\\") &&
          !outfit.imageUrl.startsWith("/")
        ) {
          const localPath = await saveImageToLocal(
            outfit.imageUrl,
            "characters",
            `${id}_outfit_${outfit.id}`,
          );
          if (localPath) {
            outfit.imageUrl = localPath;
            await updateOutfitImage(outfit.id, localPath, localPath);
          }
        }
      }
    }
    await container.characterStorage.updateCharacter(id, updated);
  },

  async remove(id: string): Promise<void> {
    const existing = await container.characterStorage.getCharacterById(id);
    if (existing?.avatarPath) await deleteLocalFile(existing.avatarPath);
    await container.characterStorage.deleteCharacter(id);
  },

  async batchRemove(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.remove(id);
    }
  },
};

export const sceneService = {
  async getAll(): Promise<Scene[]> {
    return container.sceneStorage.getScenes();
  },

  async getById(id: string): Promise<Scene | undefined> {
    return (await container.sceneStorage.getSceneById(id)) ?? undefined;
  },

  async create(
    scene: Omit<Scene, "id" | "createdAt"> & { id?: string },
  ): Promise<Scene> {
    const id = scene.id || `scene-${generateId()}`;
    const now = new Date().toISOString();
    const newScene: Scene = {
      ...scene,
      id,
      createdAt: now,
      updatedAt: now,
    } as Scene;

    if (newScene.generatedImage) {
      const localPath = await saveImageToLocal(
        newScene.generatedImage,
        "scenes",
        id,
      );
      if (localPath) {
        newScene.scenePath = localPath;
        newScene.generatedImage = localPath;
      }
    }

    await container.sceneStorage.createScene(newScene);
    return newScene;
  },

  async update(id: string, updates: Partial<Scene>): Promise<void> {
    const existing = await container.sceneStorage.getSceneById(id);
    if (!existing) throw new Error("场景不存在");
    const updated = {
      ...existing,
      ...updates,
      id,
      updatedAt: new Date().toISOString(),
    };
    if (updates.generatedImage) {
      const localPath = await saveImageToLocal(
        updates.generatedImage,
        "scenes",
        id,
      );
      if (localPath) {
        updated.scenePath = localPath;
        updated.generatedImage = localPath;
      }
    }
    await container.sceneStorage.updateScene(id, updated);
  },

  async remove(id: string): Promise<void> {
    const existing = await container.sceneStorage.getSceneById(id);
    if (existing?.scenePath) await deleteLocalFile(existing.scenePath);
    await container.sceneStorage.deleteScene(id);
  },
};

export const storyboardAssetService = {
  async getAll(): Promise<StoryboardAsset[]> {
    return container.storyboardStorage.getStoryboardAssets();
  },

  async getById(id: string): Promise<StoryboardAsset | undefined> {
    return (await container.storyboardStorage.getStoryboardAssetById(id)) ?? undefined;
  },

  async create(
    asset: Omit<StoryboardAsset, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<StoryboardAsset> {
    const id = asset.id || `sb-${generateId()}`;
    const nowSec = Math.floor(Date.now() / 1000);
    const nowIso = new Date(nowSec * 1000).toISOString();
    const newAsset: StoryboardAsset = {
      script: asset.script || "",
      duration: typeof asset.duration === "number" ? asset.duration : 0,
      shotType: asset.shotType,
      previewPath: asset.previewPath,
      characterIds: asset.characterIds || [],
      sceneId: asset.sceneId,
      projectId: asset.projectId,
      id,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await container.storyboardStorage.createStoryboardAsset(newAsset);
    return newAsset;
  },

  async remove(id: string): Promise<void> {
    await container.storyboardStorage.deleteStoryboardAsset(id);
  },
};

export const collectionService = {
  async getAll(): Promise<Collection[]> {
    return container.collectionStorage.getCollections();
  },

  async create(name: string): Promise<Collection> {
    return container.collectionStorage.createCollection(name);
  },

  async remove(id: string): Promise<void> {
    await container.collectionStorage.deleteCollection(id);
  },

  async addAsset(
    collectionId: string,
    assetType: string,
    assetId: string,
  ): Promise<void> {
    await container.collectionStorage.addAssetToCollection(
      collectionId,
      assetType,
      assetId,
    );
  },

  async removeAsset(
    collectionId: string,
    assetType: string,
    assetId: string,
  ): Promise<void> {
    await container.collectionStorage.removeAssetFromCollection(
      collectionId,
      assetType,
      assetId,
    );
  },
};

export { assetExportService } from "./asa-export-service";
