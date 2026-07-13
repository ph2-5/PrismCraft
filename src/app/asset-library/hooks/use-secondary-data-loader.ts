import { useState, useCallback, useEffect } from "react";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
import type {
  StoryboardAsset,
  Collection,
  CollectionAsset,
} from "@/domain/schemas";
import { fetchSecondaryData } from "../AssetCardGrid";

export interface SecondaryData {
  storyboards: StoryboardAsset[];
  collections: Collection[];
  collectionAssets: CollectionAsset[];
}

export function useSecondaryDataLoader() {
  const [storyboards, setStoryboards] = useState<StoryboardAsset[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionAssets, setCollectionAssets] = useState<CollectionAsset[]>([]);
  const [secondaryDataLoading, setSecondaryDataLoading] = useState(true);

  const setSecondaryData = useCallback((data: SecondaryData) => {
    setStoryboards(data.storyboards);
    setCollections(data.collections);
    setCollectionAssets(data.collectionAssets);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isElectron()) {
        if (!cancelled) setSecondaryDataLoading(false);
        return;
      }
      try {
        const data = await fetchSecondaryData();
        if (!cancelled) {
          setSecondaryData(data);
          setSecondaryDataLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          errorLogger.warn("Failed to load secondary data", err);
          setSecondaryDataLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setSecondaryData]);

  return {
    storyboards,
    collections,
    collectionAssets,
    secondaryDataLoading,
    setSecondaryData,
  };
}
