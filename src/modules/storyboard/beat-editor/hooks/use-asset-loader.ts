import { useState, useEffect, useRef } from "react";
import type { Character, Scene } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";

interface AssetLoaderServices {
  getAllCharacters: () => Promise<{ ok: boolean; value?: Character[] }>;
  getAllScenes: () => Promise<{ ok: boolean; value?: Scene[] }>;
  getStoryboardAssets: () => Promise<Array<{ id: string; script?: string; previewPath?: string }>>;
}

interface LoadedAsset {
  id: string;
  name: string;
  type: "image" | "video";
  url?: string;
}

export function useAssetLoader(services: AssetLoaderServices) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [assets, setAssets] = useState<LoadedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const charactersRef = useRef<Character[]>(characters);
  const scenesRef = useRef<Scene[]>(scenes);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        // 使用 Promise.allSettled 独立处理每个结果：单个数据源失败不阻塞其他数据源加载
        const [charsSettled, scnsSettled, sbAssetsSettled] = await Promise.allSettled([
          services.getAllCharacters(),
          services.getAllScenes(),
          services.getStoryboardAssets(),
        ]);
        const charsResult = charsSettled.status === "fulfilled" ? charsSettled.value : { ok: false };
        const scnsResult = scnsSettled.status === "fulfilled" ? scnsSettled.value : { ok: false };
        const sbAssets = sbAssetsSettled.status === "fulfilled" ? sbAssetsSettled.value : [];
        // 记录被拒绝的 Promise（便于诊断），但不阻断已成功的数据
        // 仅在 Electron 环境下记录（与非 Electron 环境的 catch 分支行为保持一致）
        if (isElectron()) {
          if (charsSettled.status === "rejected") {
            errorLogger.warn(
              { code: "AssetLoadPartialFail", message: "getAllCharacters rejected", cause: charsSettled.reason },
              { component: "useAssetLoader" },
            );
          }
          if (scnsSettled.status === "rejected") {
            errorLogger.warn(
              { code: "AssetLoadPartialFail", message: "getAllScenes rejected", cause: scnsSettled.reason },
              { component: "useAssetLoader" },
            );
          }
          if (sbAssetsSettled.status === "rejected") {
            errorLogger.warn(
              { code: "AssetLoadPartialFail", message: "getStoryboardAssets rejected", cause: sbAssetsSettled.reason },
              { component: "useAssetLoader" },
            );
          }
        }
        const chars = charsResult.ok ? charsResult.value || [] : [];
        const scns = scnsResult.ok ? scnsResult.value || [] : [];

        const determineAssetType = (url?: string): "image" | "video" => {
          if (!url) return "image";
          const videoExtensions = /\.(mp4|webm|mov|avi|mkv|flv|wmv)$/i;
          const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i;
          if (videoExtensions.test(url)) return "video";
          if (imageExtensions.test(url)) return "image";
          return "image";
        };

        const allAssets = [
          ...chars
            .filter((c) => c.generatedImage)
            .map((c) => ({
              id: `char-${c.id}`,
              name: c.name,
              type: "image" as const,
              url: c.generatedImage,
            })),
          ...scns
            .filter((s) => s.generatedImage)
            .map((s) => ({
              id: `scene-${s.id}`,
              name: s.name,
              type: "image" as const,
              url: s.generatedImage,
            })),
          ...sbAssets.map((a) => ({
            id: a.id,
            name: a.script || a.id,
            type: a.previewPath ? determineAssetType(a.previewPath) : "image",
            url: a.previewPath,
          })),
        ];

        if (!cancelled) {
          setCharacters(chars);
          setScenes(scns);
          setAssets(allAssets);
          setIsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setIsLoading(false);
          if (isElectron()) {
            errorLogger.warn(
              { code: "AssetLoadFailed", message: "Failed to load characters/scenes from database", cause: error },
              { component: "useAssetLoader" },
            );
          }
        }
      }
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [services]);

  return {
    characters,
    scenes,
    assets,
    isLoading,
    charactersRef,
    scenesRef,
  };
}
