/**
 * Task 2A.8 — usePropLibrary Hook
 *
 * 道具库的 React Query 数据获取与变更 hooks。
 * 参考 use-media-assets.ts 的模式：useQuery + useMutation + invalidateQueries。
 *
 * 提供：
 *   - useProps() — 获取所有道具
 *   - usePropsByType(type) — 按类型筛选
 *   - usePropsByTag(tag) — 按标签筛选
 *   - useCreateProp() — 创建道具
 *   - useUpdateProp() — 更新道具
 *   - useDeleteProp() — 删除道具
 *   - useMigrateOutfits() — 迁移服装数据
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAllProps,
  listPropsByType,
  listPropsByTag,
  createProp,
  updateProp,
  deleteProp,
  migrateOutfitsToProps,
} from "../services/prop-crud";
import type { PropType, CreatePropInput, UpdatePropInput } from "@/domain/schemas";
import { isElectron } from "@/shared/utils/platform";

/** 道具库 query key 前缀 */
export const PROP_QUERY_KEYS = {
  all: ["props"] as const,
  byType: (type: PropType) => ["props", "type", type] as const,
  byTag: (tag: string) => ["props", "tag", tag] as const,
};

/** 获取所有道具 */
export function useProps() {
  return useQuery({
    queryKey: PROP_QUERY_KEYS.all,
    queryFn: () => getAllProps(),
    enabled: isElectron(),
  });
}

/** 按类型筛选道具 */
export function usePropsByType(type: PropType | null) {
  return useQuery({
    queryKey: PROP_QUERY_KEYS.byType(type ?? ("all" as PropType)),
    queryFn: () => (type ? listPropsByType(type) : getAllProps()),
    enabled: isElectron(),
  });
}

/** 按标签筛选道具 */
export function usePropsByTag(tag: string | null) {
  return useQuery({
    queryKey: PROP_QUERY_KEYS.byTag(tag ?? ""),
    queryFn: () => (tag ? listPropsByTag(tag) : getAllProps()),
    enabled: isElectron() && Boolean(tag),
  });
}

/** 创建道具 */
export function useCreateProp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePropInput) => createProp(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROP_QUERY_KEYS.all });
    },
  });
}

/** 更新道具 */
export function useUpdateProp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePropInput }) =>
      updateProp(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROP_QUERY_KEYS.all });
    },
  });
}

/** 删除道具（软删除） */
export function useDeleteProp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROP_QUERY_KEYS.all });
    },
  });
}

/** 从 character_outfits 迁移服装数据到 props 表（幂等） */
export function useMigrateOutfits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => migrateOutfitsToProps(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROP_QUERY_KEYS.all });
    },
  });
}
