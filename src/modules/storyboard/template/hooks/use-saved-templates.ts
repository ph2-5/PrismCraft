/**
 * useSavedTemplates — 已保存故事模板的 React Query hooks
 *
 * 提供：
 *   - useSavedTemplates() — 查询所有已保存模板
 *   - useCreateSavedTemplate() — 创建/保存模板（upsert）
 *   - useDeleteSavedTemplate() — 删除模板
 *
 * 参考实现：use-prop-library.ts（useQuery + useMutation + invalidateQueries 模式）
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAllSavedTemplates,
  saveSavedTemplate,
  deleteSavedTemplate,
} from "../services/template-storage-service";
import type { StoryboardTemplate } from "../services/storyboard-template";
import { isElectron } from "@/shared/utils/platform";

/** 已保存模板的 query key 前缀 */
export const SAVED_TEMPLATE_QUERY_KEYS = {
  all: ["saved-templates"] as const,
};

/** 查询所有已保存模板 */
export function useSavedTemplates() {
  return useQuery({
    queryKey: SAVED_TEMPLATE_QUERY_KEYS.all,
    queryFn: async () => {
      const result = await getAllSavedTemplates();
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    enabled: isElectron(),
  });
}

/** 创建/保存模板（upsert：若 id 已存在则替换） */
export function useCreateSavedTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: StoryboardTemplate) => {
      const result = await saveSavedTemplate(template);
      if (!result.ok) {
        throw result.error;
      }
      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SAVED_TEMPLATE_QUERY_KEYS.all });
    },
  });
}

/** 删除模板（软删除） */
export function useDeleteSavedTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteSavedTemplate(id);
      if (!result.ok) {
        throw result.error;
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SAVED_TEMPLATE_QUERY_KEYS.all });
    },
  });
}
