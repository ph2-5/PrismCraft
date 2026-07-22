import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import { useStories } from "@/modules/storyboard";
import type { StoryStatus } from "@/domain/schemas";

// 首页「最近项目」隐藏的状态：归档和放弃的故事不在最近项目中展示
const HIDDEN_STATUSES: ReadonlySet<StoryStatus> = new Set<StoryStatus>([
  "archived",
  "abandoned",
]);

export function useHomePage() {
  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const { data: stories = [], isLoading: storiesLoading } = useStories();
  const navigate = useNavigate();
  const dataLoading = charactersLoading || scenesLoading || storiesLoading;

  // 过滤掉 archived / abandoned 状态的故事
  const visibleStories = useMemo(
    () => stories.filter((s) => !HIDDEN_STATUSES.has(s.status)),
    [stories],
  );

  return {
    characters,
    scenes,
    stories: visibleStories,
    dataLoading,
    navigate,
  };
}
