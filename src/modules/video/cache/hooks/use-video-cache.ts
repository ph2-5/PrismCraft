import { useQuery } from "@tanstack/react-query";
import { getCacheStats } from "@/modules/video/cache";
import { isElectron } from "@/shared/utils/platform";

const VIDEO_CACHE_KEY = ["video-cache"] as const;

export function useVideoCacheStats() {
  return useQuery({
    queryKey: [...VIDEO_CACHE_KEY, "stats"],
    queryFn: async () => {
      const result = await getCacheStats();
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: isElectron(),
    staleTime: 60_000,
  });
}
