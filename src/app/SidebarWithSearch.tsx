"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/shared/presentation/Sidebar";
import { characterService } from "@/modules/character";
import { sceneService } from "@/modules/scene";
import { storyService } from "@/modules/story";
import type { SearchResult } from "@/domain/schemas";

const ROUTE_MAP: Record<SearchResult["type"], string> = {
  character: "/characters",
  scene: "/scenes",
  story: "/story",
};

export function SidebarWithSearch() {
  const router = useRouter();

  const handleSearch = useCallback(async (term: string): Promise<SearchResult[]> => {
    const lowerTerm = term.toLowerCase();
    const searchResults: SearchResult[] = [];
    const [charResult, sceneResult, storyResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
      storyService.getAll(),
    ]);
    const characters = charResult.ok ? charResult.value : [];
    const scenes = sceneResult.ok ? sceneResult.value : [];
    const stories = storyResult.ok ? storyResult.value : [];
    characters.slice(0, 50).forEach((char) => {
      if (char.name?.toLowerCase().includes(lowerTerm) || char.description?.toLowerCase().includes(lowerTerm) || char.style?.toLowerCase().includes(lowerTerm)) {
        searchResults.push({ type: "character", id: char.id, title: char.name, subtitle: char.description?.slice(0, 60) || "" });
      }
    });
    scenes.slice(0, 50).forEach((scene) => {
      if (scene.name?.toLowerCase().includes(lowerTerm) || scene.description?.toLowerCase().includes(lowerTerm)) {
        searchResults.push({ type: "scene", id: scene.id, title: scene.name, subtitle: scene.description?.slice(0, 60) || "" });
      }
    });
    stories.slice(0, 50).forEach((story) => {
      if (story.title?.toLowerCase().includes(lowerTerm) || story.description?.toLowerCase().includes(lowerTerm)) {
        searchResults.push({ type: "story", id: story.id, title: story.title, subtitle: story.description?.slice(0, 60) || "" });
      }
    });
    return searchResults;
  }, []);

  const handleSearchSelect = useCallback((result: SearchResult) => {
    const basePath = ROUTE_MAP[result.type];
    router.push(`${basePath}?highlight=${encodeURIComponent(result.id)}`);
  }, [router]);

  return <Sidebar onSearch={handleSearch} onSearchSelect={handleSearchSelect} />;
}
