import type {
  IVideoTaskStorage,
  ICharacterStorage,
  ISceneStorage,
  IStoryStorage,
  IVideoProvider,
  IImageProvider,
  ITextProvider,
  IFileUploader,
  ISyncStorage,
} from "@/domain/ports";

/*
 * DI Container Token Guidelines (AI 维护必读)
 *
 * ✅ SHOULD register in DI:
 *   1. Implementations of domain Port interfaces (IVideoProvider, ICharacterStorage, etc.)
 *   2. Stateful services (eventBus, preferencesStorage, apiClient)
 *   3. Functions that need test replacement via overrideToken()
 *
 * ❌ SHOULD NOT register in DI:
 *   1. Pure functions from @/shared/* — import directly (e.g., resolveImageUrl, getErrorMessage)
 *   2. Pure functions from @/infrastructure/* — use @/shared/ proxy exports instead
 *   3. Type-only exports — use `export type` instead
 *   4. Constants or enums — import directly from their source
 *
 * When adding a new token, ask: "Would a test need to mock this?" If no, consider direct import.
 * If the function is from @/infrastructure/* and modules need it, create a proxy export in @/shared/.
 */
import { videoTaskStorage } from "@/infrastructure/storage/video-tasks";
import { characterStorage } from "@/infrastructure/storage/characters";
import { sceneStorage } from "@/infrastructure/storage/scenes";
import { storyStorage } from "@/infrastructure/storage/stories";
import { versionStorage } from "@/infrastructure/storage/versions";
import { elementStorage } from "@/infrastructure/storage/elements";
import { videoCacheStorage } from "@/infrastructure/storage/video-cache";
import { imageCacheStorage } from "@/infrastructure/storage/image-cache";
import { collectionStorage } from "@/infrastructure/storage/collections";
import { storyboardStorage } from "@/infrastructure/storage/storyboard";
import {
  mediaAssetRepository,
} from "@/infrastructure/database";
import {
  generateVideo,
  generateKeyframe,
  generateFramePair,
  generateVideoWithFrames,
  queryVideoStatus,
} from "@/infrastructure/ai-providers/video";
import { generateImage, analyzeImage } from "@/infrastructure/ai-providers/image";
import { generateText } from "@/infrastructure/ai-providers/text";
import { uploadFile } from "@/infrastructure/ai-providers/utils";
import { safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/sqlite-core";
import { registerChangeTracker } from "@/infrastructure/storage/core";
import { apiClient, imageApi, videoApi, textApi } from "@/infrastructure/api";
import { eventBus } from "@/shared/event-bus";
import { importExportStorage } from "@/infrastructure/storage/import-export";
import { templateStorage } from "@/infrastructure/storage/templates";
import { autoSaveStorage } from "@/infrastructure/storage/auto-save";
import { errorLogStorage } from "@/infrastructure/storage/error-logs";
import { sessionStorage } from "@/infrastructure/storage/sessions";
import { preferencesStorage } from "@/shared/utils/preferences";
import { createToken, type Token } from "./types";
import { ModuleRegistry } from "./registry";

const videoProvider: IVideoProvider = {
  generateVideo,
  queryVideoStatus,
  generateKeyframe,
  generateFramePair,
  generateVideoWithFrames,
};

const imageProvider: IImageProvider = {
  generateImage,
  analyzeImage,
};

const textProvider: ITextProvider = {
  generateText,
};

const fileUploader: IFileUploader = {
  uploadFile: uploadFile as IFileUploader["uploadFile"],
};

const syncStorage: ISyncStorage = {
  safeQuery,
  safeRun,
  safeTransaction,
  registerChangeTracker: registerChangeTracker as ISyncStorage["registerChangeTracker"],
};

const tokens = {

  // ── A. Domain Port 实现（模块通过 Port 接口解耦） ──────────────────────
  videoTaskStorage: createToken<IVideoTaskStorage>("videoTaskStorage", () => videoTaskStorage as IVideoTaskStorage),
  characterStorage: createToken<ICharacterStorage>("characterStorage", () => characterStorage as ICharacterStorage),
  sceneStorage: createToken<ISceneStorage>("sceneStorage", () => sceneStorage as ISceneStorage),
  storyStorage: createToken<IStoryStorage>("storyStorage", () => storyStorage as IStoryStorage),
  videoProvider: createToken<IVideoProvider>("videoProvider", () => videoProvider),
  imageProvider: createToken<IImageProvider>("imageProvider", () => imageProvider),
  textProvider: createToken<ITextProvider>("textProvider", () => textProvider),
  fileUploader: createToken<IFileUploader>("fileUploader", () => fileUploader),
  syncStorage: createToken<ISyncStorage>("syncStorage", () => syncStorage),

  // ── B. 有状态服务（单例，需测试替换） ──────────────────────────────────
  eventBus: createToken("eventBus", () => eventBus),
  apiClient: createToken("apiClient", () => apiClient),
  imageApi: createToken("imageApi", () => imageApi),
  videoApi: createToken("videoApi", () => videoApi),
  textApi: createToken("textApi", () => textApi),
  preferencesStorage: createToken("preferencesStorage", () => preferencesStorage),

  // ── C. Storage 实例（有状态，模块无法直接导入 infrastructure/storage） ──
  versionStorage: createToken("versionStorage", () => versionStorage),
  elementStorage: createToken("elementStorage", () => elementStorage),
  videoCacheStorage: createToken("videoCacheStorage", () => videoCacheStorage),
  imageCacheStorage: createToken("imageCacheStorage", () => imageCacheStorage),
  collectionStorage: createToken("collectionStorage", () => collectionStorage),
  storyboardStorage: createToken("storyboardStorage", () => storyboardStorage),
  importExportStorage: createToken("importExportStorage", () => importExportStorage),
  templateStorage: createToken("templateStorage", () => templateStorage),
  autoSaveStorage: createToken("autoSaveStorage", () => autoSaveStorage),
  errorLogStorage: createToken("errorLogStorage", () => errorLogStorage),
  sessionStorage: createToken("sessionStorage", () => sessionStorage),

  // ── D. Repository 实例（Drizzle ORM，模块无法直接导入 infrastructure/database） ──
  mediaAssetRepository: createToken("mediaAssetRepository", () => mediaAssetRepository),

  elementManager: createToken("elementManager", async () => {
    const { elementManager } = await import("@/modules/shot/element-binding");
    return elementManager;
  }),
  referenceEngine: createToken("referenceEngine", async () => {
    const { referenceEngine } = await import("@/modules/shot/shot-reference");
    return referenceEngine;
  }),
};

const registry = new ModuleRegistry();

Object.values(tokens).forEach((token) => {
  registry.register(token, "singleton");
});

const resolving = new Set<string>();

export function resolve<T>(token: Token<T>): T {
  if (resolving.has(token.id)) {
    const chain = Array.from(resolving).join(" -> ");
    throw new Error(`[DI] Circular dependency detected: ${chain} -> ${token.id}`);
  }
  resolving.add(token.id);
  try {
    return registry.resolve(token);
  } finally {
    resolving.delete(token.id);
  }
}

export const container: AppContainer = new Proxy(tokens, {
  get(target, prop: string) {
    if (prop in target) {
      const token = target[prop as keyof typeof target];
      return registry.resolve(token as Token<unknown>);
    }
    if (typeof prop === "string" && prop !== "__proto__" && prop !== "then" && prop !== "toJSON") {
      throw new Error(`[DI] Unknown container token: "${prop}". Check container tokens for available dependencies.`);
    }
    return undefined;
  },
}) as unknown as AppContainer;

export function overrideToken<T>(token: Token<T>, factory: (c: import("./types").ModuleContainer) => T): void {
  registry.override(token, factory as import("./types").ModuleFactory<T>);
}

export function resetContainer(): void {
  registry.resetSingletons();
}

type ContainerShape = {
  [K in keyof typeof tokens]: ReturnType<typeof tokens[K]["factory"]>;
};

export type AppContainer = ContainerShape;
