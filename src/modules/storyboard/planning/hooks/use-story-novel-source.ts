import { useQuery } from "@tanstack/react-query";
import { isElectron } from "@/shared/utils/platform";
import { DEFAULT_STALE_TIME_MS } from "@/shared/constants";
import { storyService } from "../services/story-service";

export const NOVEL_SOURCE_QUERY_KEY = "story-novel-source" as const;

/**
 * 查询 Story 关联的原始小说来源（novel_projects.story_id 回溯）。
 *
 * 仅当 Story 由小说导入管道创建时，data.novelSource 不为 null。
 * 用于 Story 详情页"查看原始小说"入口的显隐与内容展示。
 */
export function useStoryNovelSource(storyId: string) {
  return useQuery({
    queryKey: [NOVEL_SOURCE_QUERY_KEY, storyId],
    queryFn: async () => {
      const result = await storyService.getStoryWithNovelSource(storyId);
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: isElectron() && !!storyId,
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}
