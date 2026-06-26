import { useNavigate } from "react-router-dom";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import { useStories } from "@/modules/story";

export function useHomePage() {
  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const { data: stories = [], isLoading: storiesLoading } = useStories();
  const navigate = useNavigate();
  const dataLoading = charactersLoading || scenesLoading || storiesLoading;

  return {
    characters,
    scenes,
    stories,
    dataLoading,
    navigate,
  };
}
