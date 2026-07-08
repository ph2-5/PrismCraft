import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { loadModelProfilesFromServer, getAllModelProfiles, type ModelParameterProfile } from "@/shared/model-capabilities";
import { isElectron } from "@/shared/utils/platform";
import { errorLogger } from "@/shared/error-logger";
import { DEFAULT_STALE_TIME_MS } from "@/shared/constants";

const MODEL_CAPABILITIES_QUERY_KEY = ["model-capabilities"] as const;

export function useModelCapabilities(): UseQueryResult<Record<string, ModelParameterProfile>> {
  return useQuery<Record<string, ModelParameterProfile>>({
    queryKey: MODEL_CAPABILITIES_QUERY_KEY,
    queryFn: async () => {
      await loadModelProfilesFromServer();
      return getAllModelProfiles();
    },
    enabled: isElectron(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useInvalidateModelCapabilities(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => {
    errorLogger.info("[ModelCapabilities] Invalidating model capabilities cache");
    return queryClient.invalidateQueries({ queryKey: MODEL_CAPABILITIES_QUERY_KEY });
  };
}

export { MODEL_CAPABILITIES_QUERY_KEY };
