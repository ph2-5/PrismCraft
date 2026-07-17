/**
 * Task 2A.10 — Character Variants Hooks
 *
 * React Query hooks for character variants. 参考 use-prop-library.ts 模式。
 *
 * Hooks:
 *   - useCharacterVariants(characterId) — 查询角色变体列表
 *   - useAllCharacterVariants()          — 查询所有变体（按 character_id 分组）
 *   - useVariant(variantId)              — 查询单个变体
 *   - useCreateVariant()                 — 创建变体
 *   - useUpdateVariant()                 — 更新变体
 *   - useDeleteVariant()                 — 删除变体
 *   - useSetDefaultVariant()             — 设置默认变体
 *   - useMigrateOutfitsToVariants()      — 触发服装迁移
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isElectron } from "@/shared/utils/platform";
import type {
  CreateCharacterVariantInput,
  UpdateCharacterVariantInput,
} from "@/domain/schemas";
import {
  listVariantsForCharacter,
  listAllVariants,
  getVariantById,
  createVariant,
  updateVariant,
  deleteVariant,
  setDefaultVariant,
  migrateOutfitsToVariants,
} from "../services/variant-crud";

export const VARIANT_QUERY_KEYS = {
  /** 所有变体的根 queryKey */
  all: ["character-variants"] as const,
  /** 单个角色的变体列表 */
  forCharacter: (characterId: string) => ["character-variants", "character", characterId] as const,
  /** 单个变体 */
  detail: (variantId: string) => ["character-variants", "detail", variantId] as const,
  /** 所有变体（按 character_id 分组） */
  allGrouped: () => ["character-variants", "all-grouped"] as const,
};

/** 查询角色变体列表 */
export function useCharacterVariants(characterId: string | undefined | null) {
  return useQuery({
    queryKey: VARIANT_QUERY_KEYS.forCharacter(characterId ?? ""),
    queryFn: () => listVariantsForCharacter(characterId as string),
    enabled: isElectron() && !!characterId,
  });
}

/** 查询所有变体（按 character_id 分组） */
export function useAllCharacterVariants() {
  return useQuery({
    queryKey: VARIANT_QUERY_KEYS.allGrouped(),
    queryFn: () => listAllVariants(),
    enabled: isElectron(),
  });
}

/** 查询单个变体 */
export function useVariant(variantId: string | undefined | null) {
  return useQuery({
    queryKey: VARIANT_QUERY_KEYS.detail(variantId ?? ""),
    queryFn: () => getVariantById(variantId as string),
    enabled: isElectron() && !!variantId,
  });
}

/** 创建变体 */
export function useCreateVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCharacterVariantInput) => createVariant(input),
    onSuccess: (_data, variables) => {
      // 失效该角色的变体列表
      if (variables.characterId) {
        void queryClient.invalidateQueries({
          queryKey: VARIANT_QUERY_KEYS.forCharacter(variables.characterId),
        });
      }
      // 也失效 all-grouped
      void queryClient.invalidateQueries({ queryKey: VARIANT_QUERY_KEYS.allGrouped() });
    },
  });
}

/** 更新变体 */
export function useUpdateVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateCharacterVariantInput }) =>
      updateVariant(id, patch),
    onSuccess: async () => {
      // 失效所有相关 query（变体可能属于任何角色）
      await queryClient.invalidateQueries({ queryKey: VARIANT_QUERY_KEYS.all });
    },
  });
}

/** 删除变体 */
export function useDeleteVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVariant(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: VARIANT_QUERY_KEYS.all });
    },
  });
}

/** 设置默认变体 */
export function useSetDefaultVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ characterId, variantId }: { characterId: string; variantId: string }) =>
      setDefaultVariant(characterId, variantId),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: VARIANT_QUERY_KEYS.forCharacter(variables.characterId),
      });
    },
  });
}

/** 触发服装 → 变体迁移（幂等） */
export function useMigrateOutfitsToVariants() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => migrateOutfitsToVariants(),
    onSuccess: async (count) => {
      if (count > 0) {
        await queryClient.invalidateQueries({ queryKey: VARIANT_QUERY_KEYS.all });
      }
    },
  });
}

export type {
  CreateCharacterVariantInput,
  UpdateCharacterVariantInput,
} from "@/domain/schemas";
