"use client";

import { useState, useEffect, useRef } from "react";
import type { Character, Scene } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";

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
        const charsResult = await services.getAllCharacters();
        const scnsResult = await services.getAllScenes();
        const chars = charsResult.ok ? charsResult.value || [] : [];
        const scns = scnsResult.ok ? scnsResult.value || [] : [];
        const sbAssets = await services.getStoryboardAssets();

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
        }
      } catch (error) {
        if (!cancelled) {
          errorLogger.warn(
            { code: "AssetLoadFailed", message: "Failed to load characters/scenes from database", cause: error },
            { component: "useAssetLoader" },
          );
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
    charactersRef,
    scenesRef,
  };
}
