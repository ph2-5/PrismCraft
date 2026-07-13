import { useCallback } from "react";
import { Sidebar } from "@/shared/presentation/Sidebar";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { characterService } from "@/modules/character";
import { sceneService } from "@/modules/scene";
import { storyService } from "@/modules/storyboard";
import type { SearchResult } from "@/domain/schemas";

const ROUTE_MAP: Record<SearchResult["type"], string> = {
  character: "/characters",
  scene: "/scenes",
  story: "/storyboard",
};

export function SidebarWithSearch() {
  const { guardedPush } = useNavigationGuard();

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

    // Filter first, then slice — ensures matches beyond index 50 are searchable
    for (const char of characters) {
      if (searchResults.length >= 20) break;
      if (char.name?.toLowerCase().includes(lowerTerm) || char.description?.toLowerCase().includes(lowerTerm) || char.style?.toLowerCase().includes(lowerTerm)) {
        searchResults.push({ type: "character", id: char.id, title: char.name, subtitle: char.description?.slice(0, 60) || "" });
      }
    }
    for (const scene of scenes) {
      if (searchResults.length >= 20) break;
      if (scene.name?.toLowerCase().includes(lowerTerm) || scene.description?.toLowerCase().includes(lowerTerm)) {
        searchResults.push({ type: "scene", id: scene.id, title: scene.name, subtitle: scene.description?.slice(0, 60) || "" });
      }
    }
    for (const story of stories) {
      if (searchResults.length >= 20) break;
      if (story.title?.toLowerCase().includes(lowerTerm) || story.description?.toLowerCase().includes(lowerTerm)) {
        searchResults.push({ type: "story", id: story.id, title: story.title, subtitle: story.description?.slice(0, 60) || "" });
      }
    }
    return searchResults;
  }, []);

  const handleSearchSelect = useCallback((result: SearchResult) => {
    if (result.type === "story") {
      guardedPush(`/storyboard/${result.id}`);
      return;
    }
    const basePath = ROUTE_MAP[result.type];
    guardedPush(`${basePath}?highlight=${encodeURIComponent(result.id)}`);
  }, [guardedPush]);

  return <Sidebar onSearch={handleSearch} onSearchSelect={handleSearchSelect} />;
}
