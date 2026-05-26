import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sceneService } from "../services";
import type { CreateSceneInput, UpdateSceneInput } from "@/domain/schemas";
import { deleteSceneWithRefs } from "@/modules/persistence";

const SCENES_KEY = ["scenes"] as const;
const SCENE_KEY = (id: string) => ["scenes", id] as const;

export function useScenes() {
  return useQuery({
    queryKey: SCENES_KEY,
    queryFn: async () => {
      const result = await sceneService.getAll();
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
}

export function useScene(id: string) {
  return useQuery({
    queryKey: SCENE_KEY(id),
    queryFn: async () => {
      const result = await sceneService.getById(id);
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: !!id,
  });
}

export function useSceneCount() {
  return useQuery({
    queryKey: [...SCENES_KEY, "count"],
    queryFn: async () => {
      const result = await sceneService.count();
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
}

export function useCreateScene() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSceneInput) => {
      const result = await sceneService.create(input);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCENES_KEY });
    },
  });
}

export function useUpdateScene() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSceneInput) => {
      const result = await sceneService.update(input.id, input);
      if (!result.ok) throw result.error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: SCENES_KEY });
      queryClient.invalidateQueries({ queryKey: SCENE_KEY(variables.id) });
    },
  });
}

export function useDeleteScene() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteSceneWithRefs(id);
      if (!result.ok) throw result.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCENES_KEY });
    },
  });
}
