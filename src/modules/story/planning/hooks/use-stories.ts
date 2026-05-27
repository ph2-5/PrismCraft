import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storyService } from "../services/story-service";
import type { CreateStoryInput, UpdateStoryInput } from "@/domain/schemas";

const STORIES_KEY = ["stories"] as const;
const STORY_KEY = (id: string) => ["stories", id] as const;

export function useStories() {
  return useQuery({
    queryKey: STORIES_KEY,
    queryFn: async () => {
      const result = await storyService.getAll();
      if (!result.ok) throw result.error;
      return result.value;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useStory(id: string) {
  return useQuery({
    queryKey: STORY_KEY(id),
    queryFn: async () => {
      const result = await storyService.getById(id);
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: !!id,
  });
}

export function useStoryCount() {
  return useQuery({
    queryKey: [...STORIES_KEY, "count"],
    queryFn: async () => {
      const result = await storyService.count();
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
}

export function useCreateStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStoryInput) => {
      const result = await storyService.create(input);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STORIES_KEY });
    },
  });
}

export function useUpdateStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateStoryInput) => {
      const result = await storyService.update(input.id, input);
      if (!result.ok) throw result.error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: STORIES_KEY });
      queryClient.invalidateQueries({ queryKey: STORY_KEY(variables.id) });
    },
  });
}

export function useDeleteStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await storyService.delete(id);
      if (!result.ok) throw result.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STORIES_KEY });
    },
  });
}
