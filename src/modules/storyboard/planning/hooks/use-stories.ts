import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Story, CreateStoryInput, UpdateStoryInput, StoryStatus } from "@/domain/schemas";
import type { StorySearchOptions } from "@/domain/ports/storage-port";
import { storyService } from "../services/story-service";
import { createCrudHooks } from "@/shared/hooks/create-crud-hooks";
import { isElectron } from "@/shared/utils/platform";
import { DEFAULT_STALE_TIME_MS } from "@/shared/constants";

const crud = createCrudHooks<Story, CreateStoryInput, UpdateStoryInput>({
  entityName: "stories",
  service: storyService,
});

export const useStories = crud.useList;
export const useStory = crud.useOne;
export const useCreateStory = crud.useCreate;
export const useUpdateStory = crud.useUpdate;
export const useDeleteStory = crud.useDelete;

const STORIES_KEY = ["stories"] as const;

/**
 * 故事计数。当传入 options 时按条件统计（走 SQL COUNT 路径）；
 * 不传 options 时统计全部（向后兼容，走 getStories().length 路径）。
 */
export function useStoryCount(options?: StorySearchOptions) {
  const hasOptions = options !== undefined;
  return useQuery({
    queryKey: hasOptions
      ? [...STORIES_KEY, "count", "search", options]
      : ([...STORIES_KEY, "count"] as const),
    queryFn: async () => {
      const result = await storyService.count(options);
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: isElectron(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

/**
 * 按条件搜索故事。支持 query 模糊匹配、status/genre/tone 多选过滤、字段排序与分页。
 * options 为空对象时等价于 useStories，但走 SQL 路径。
 */
export function useSearchStories(options: StorySearchOptions) {
  return useQuery({
    queryKey: [...STORIES_KEY, "search", options] as const,
    queryFn: async () => {
      const result = await storyService.search(options);
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: isElectron(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

/**
 * 更新 Story 状态。成功后失效 stories 列表和单条 story 缓存。
 */
export function useUpdateStoryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; status: StoryStatus }) => {
      const result = await storyService.updateStatus(params.id, params.status);
      if (!result.ok) throw result.error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: STORIES_KEY });
      queryClient.invalidateQueries({ queryKey: ["stories", variables.id] });
    },
  });
}

/**
 * 按状态查询 Stories。status 为 undefined 时返回全部。
 */
export function useStoriesByStatus(status?: StoryStatus) {
  return useQuery({
    queryKey: [...STORIES_KEY, "by-status", status ?? "all"] as const,
    queryFn: async () => {
      const result = await storyService.getByStatus(status);
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: isElectron(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

/**
 * 复制故事。基于现有故事创建变体（status='draft'）。
 * 成功后失效 stories 列表缓存。
 */
export function useDuplicateStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { sourceId: string; newTitle: string }) => {
      const result = await storyService.duplicate(params.sourceId, params.newTitle);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STORIES_KEY });
    },
  });
}
