import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { characterService } from "../services";
import type { CreateCharacterInput, UpdateCharacterInput } from "@/domain/schemas";
import { deleteCharacterWithRefs } from "@/modules/persistence";

const CHARACTERS_KEY = ["characters"] as const;
const CHARACTER_KEY = (id: string) => ["characters", id] as const;

export function useCharacters() {
  return useQuery({
    queryKey: CHARACTERS_KEY,
    queryFn: async () => {
      const result = await characterService.getAll();
      if (!result.ok) throw result.error;
      return result.value;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCharacter(id: string) {
  return useQuery({
    queryKey: CHARACTER_KEY(id),
    queryFn: async () => {
      const result = await characterService.getById(id);
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: !!id,
  });
}

export function useCharacterCount() {
  return useQuery({
    queryKey: [...CHARACTERS_KEY, "count"],
    queryFn: async () => {
      const result = await characterService.count();
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
}

export function useCreateCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCharacterInput) => {
      const result = await characterService.create(input);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHARACTERS_KEY });
    },
  });
}

export function useUpdateCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCharacterInput) => {
      const result = await characterService.update(input.id, input);
      if (!result.ok) throw result.error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: CHARACTERS_KEY });
      queryClient.invalidateQueries({ queryKey: CHARACTER_KEY(variables.id) });
    },
  });
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteCharacterWithRefs(id);
      if (!result.ok) throw result.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHARACTERS_KEY });
    },
  });
}
