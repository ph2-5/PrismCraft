/**
 * Q3-1 — Scene Variants Hooks
 *
 * React Query hooks for scene variants. 对称 use-character-variants.ts 模式。
 *
 * Hooks:
 *   - useSceneVariants(sceneId)    — 查询场景变体列表
 *   - useAllSceneVariants()         — 查询所有变体（按 scene_id 分组）
 *   - useSceneVariant(variantId)    — 查询单个变体
 *   - useCreateSceneVariant()       — 创建变体
 *   - useUpdateSceneVariant()       — 更新变体
 *   - useDeleteSceneVariant()       — 删除变体
 *   - useSetDefaultSceneVariant()   — 设置默认变体
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isElectron } from "@/shared/utils/platform";
import type {
  CreateSceneVariantInput,
  UpdateSceneVariantInput,
} from "@/domain/schemas";
import {
  listVariantsForScene,
  listAllVariants,
  getVariantById,
  createVariant,
  updateVariant,
  deleteVariant,
  setDefaultVariant,
} from "../services/variant-crud";

export const SCENE_VARIANT_QUERY_KEYS = {
  /** 所有变体的根 queryKey */
  all: ["scene-variants"] as const,
  /** 单个场景的变体列表 */
  forScene: (sceneId: string) => ["scene-variants", "scene", sceneId] as const,
  /** 单个变体 */
  detail: (variantId: string) => ["scene-variants", "detail", variantId] as const,
  /** 所有变体（按 scene_id 分组） */
  allGrouped: () => ["scene-variants", "all-grouped"] as const,
};

/** 查询场景变体列表 */
export function useSceneVariants(sceneId: string | undefined | null) {
  return useQuery({
    queryKey: SCENE_VARIANT_QUERY_KEYS.forScene(sceneId ?? ""),
    queryFn: () => listVariantsForScene(sceneId as string),
    enabled: isElectron() && !!sceneId,
  });
}

/** 查询所有变体（按 scene_id 分组） */
export function useAllSceneVariants() {
  return useQuery({
    queryKey: SCENE_VARIANT_QUERY_KEYS.allGrouped(),
    queryFn: () => listAllVariants(),
    enabled: isElectron(),
  });
}

/** 查询单个变体 */
export function useSceneVariant(variantId: string | undefined | null) {
  return useQuery({
    queryKey: SCENE_VARIANT_QUERY_KEYS.detail(variantId ?? ""),
    queryFn: () => getVariantById(variantId as string),
    enabled: isElectron() && !!variantId,
  });
}

/** 创建变体 */
export function useCreateSceneVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSceneVariantInput) => createVariant(input),
    onSuccess: (_data, variables) => {
      if (variables.sceneId) {
        void queryClient.invalidateQueries({
          queryKey: SCENE_VARIANT_QUERY_KEYS.forScene(variables.sceneId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: SCENE_VARIANT_QUERY_KEYS.allGrouped() });
    },
  });
}

/** 更新变体 */
export function useUpdateSceneVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSceneVariantInput }) =>
      updateVariant(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCENE_VARIANT_QUERY_KEYS.all });
    },
  });
}

/** 删除变体 */
export function useDeleteSceneVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVariant(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCENE_VARIANT_QUERY_KEYS.all });
    },
  });
}

/** 设置默认变体 */
export function useSetDefaultSceneVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneId, variantId }: { sceneId: string; variantId: string }) =>
      setDefaultVariant(sceneId, variantId),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: SCENE_VARIANT_QUERY_KEYS.forScene(variables.sceneId),
      });
    },
  });
}

export type {
  CreateSceneVariantInput,
  UpdateSceneVariantInput,
} from "@/domain/schemas";
