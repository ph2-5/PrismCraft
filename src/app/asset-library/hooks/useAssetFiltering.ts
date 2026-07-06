import { useMemo } from "react";
import type {
  StoryboardAsset,
  Collection,
} from "@/domain/schemas";
import type { Character, Scene } from "@/domain/schemas";
import type { AssetTab } from "../AssetCardGrid";

interface UseAssetFilteringParams {
  activeTab: AssetTab;
  searchQuery: string;
  characters: Character[];
  scenes: Scene[];
  storyboards: StoryboardAsset[];
  collections: Collection[];
}

function matchText(text: string | undefined, query: string): boolean {
  return !!text?.toLowerCase().includes(query.toLowerCase());
}

function filterBySearch<T extends { name?: string; description?: string; tags?: string[] }>(
  items: T[],
  query: string,
): T[] {
  if (!query) return items;
  return items.filter(
    (item) =>
      matchText(item.name, query) ||
      matchText(item.description, query) ||
      item.tags?.some((t) => matchText(t, query)),
  );
}

export function useAssetFiltering({
  activeTab,
  searchQuery,
  characters,
  scenes,
  storyboards,
  collections,
}: UseAssetFilteringParams) {
  const filteredCharacters = useMemo(
    () => filterBySearch(characters, searchQuery),
    [characters, searchQuery],
  );

  const filteredScenes = useMemo(
    () => filterBySearch(scenes, searchQuery),
    [scenes, searchQuery],
  );

  const filteredStoryboards = useMemo(
    () =>
      storyboards.filter((sb) =>
        matchText(sb.script, searchQuery),
      ),
    [storyboards, searchQuery],
  );

  const filteredCollections = useMemo(
    () =>
      searchQuery
        ? collections.filter((c) => matchText(c.name, searchQuery))
        : collections,
    [collections, searchQuery],
  );

  const currentItems =
    activeTab === "characters"
      ? filteredCharacters
      : activeTab === "scenes"
        ? filteredScenes
        : activeTab === "storyboards"
          ? filteredStoryboards
          : activeTab === "collections"
            ? filteredCollections
            : [];

  return {
    filteredCharacters,
    filteredScenes,
    filteredStoryboards,
    filteredCollections,
    currentItems,
  };
}
