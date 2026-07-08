import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Result } from "@/domain/types";
import { isElectron } from "@/shared/utils/platform";
import { DEFAULT_STALE_TIME_MS } from "@/shared/constants";

/**
 * Minimal CRUD service contract that createCrudHooks relies on.
 *
 * Each module's service (characterService, sceneService, storyService)
 * satisfies this interface. The `delete` method is optional because some
 * modules override it via `deleteFn` (e.g. deleteCharacterWithRefs).
 */
export interface CrudService<T, TCreateInput, TUpdateInput extends { id: string }> {
  getAll(): Promise<Result<T[]>>;
  getById(id: string): Promise<Result<T>>;
  count(): Promise<Result<number>>;
  create(input: TCreateInput): Promise<Result<T>>;
  update(id: string, input: TUpdateInput): Promise<Result<void>>;
  delete?(id: string): Promise<Result<void>>;
}

export interface CreateCrudHooksOptions<T, TCreateInput, TUpdateInput extends { id: string }> {
  entityName: string;
  service: CrudService<T, TCreateInput, TUpdateInput>;
  /** Optional override for the delete operation (e.g. transactional deletes with ref cleanup). */
  deleteFn?: (id: string) => Promise<Result<void>>;
}

/**
 * Factory that generates a standard set of React Query CRUD hooks for an entity.
 *
 * Extracted from use-characters.ts, use-scenes.ts, and use-stories.ts which
 * had near-identical implementations differing only in entity name, service,
 * and (for character/scene) the delete function.
 *
 * Returns hooks named useList/useOne/useCount/useCreate/useUpdate/useDelete.
 * Callers should re-export them with entity-specific names for backward
 * compatibility, e.g. `export const useCharacters = crud.useList`.
 */
export function createCrudHooks<T, TCreateInput, TUpdateInput extends { id: string }>(
  options: CreateCrudHooksOptions<T, TCreateInput, TUpdateInput>,
) {
  const { entityName, service, deleteFn } = options;

  const LIST_KEY = [entityName] as const;
  const ITEM_KEY = (id: string) => [entityName, id] as const;

  const useList = () =>
    useQuery({
      queryKey: LIST_KEY,
      queryFn: async () => {
        const result = await service.getAll();
        if (!result.ok) throw result.error;
        return result.value;
      },
      enabled: isElectron(),
      staleTime: DEFAULT_STALE_TIME_MS,
    });

  const useOne = (id: string) =>
    useQuery({
      queryKey: ITEM_KEY(id),
      queryFn: async () => {
        const result = await service.getById(id);
        if (!result.ok) throw result.error;
        return result.value;
      },
      enabled: isElectron() && !!id,
    });

  const useCount = () =>
    useQuery({
      queryKey: [...LIST_KEY, "count"],
      queryFn: async () => {
        const result = await service.count();
        if (!result.ok) throw result.error;
        return result.value;
      },
      enabled: isElectron(),
    });

  const useCreate = () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (input: TCreateInput) => {
        const result = await service.create(input);
        if (!result.ok) throw result.error;
        return result.value;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: LIST_KEY });
      },
    });
  };

  const useUpdate = () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (input: TUpdateInput) => {
        const result = await service.update(input.id, input);
        if (!result.ok) throw result.error;
      },
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: LIST_KEY });
        queryClient.invalidateQueries({ queryKey: ITEM_KEY(variables.id) });
      },
    });
  };

  const useDelete = () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        const fn = deleteFn ?? service.delete;
        if (!fn) throw new Error(`No delete function for ${entityName}`);
        const result = await fn(id);
        if (!result.ok) throw result.error;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: LIST_KEY });
      },
    });
  };

  return { useList, useOne, useCount, useCreate, useUpdate, useDelete };
}
