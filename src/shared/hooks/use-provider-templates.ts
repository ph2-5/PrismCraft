import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllTemplatesAsync, type ProviderTemplate } from "@/shared/api-config";
import { isElectron } from "@/shared/utils/platform";
import { errorLogger } from "@/shared/error-logger";
import { DEFAULT_STALE_TIME_MS } from "@/shared/constants";

const PROVIDER_TEMPLATES_QUERY_KEY = ["provider-templates"] as const;

export function useProviderTemplates() {
  return useQuery<Record<string, ProviderTemplate>>({
    queryKey: PROVIDER_TEMPLATES_QUERY_KEY,
    queryFn: () => getAllTemplatesAsync(),
    enabled: isElectron(),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useInvalidateProviderTemplates() {
  const queryClient = useQueryClient();
  return () => {
    errorLogger.info("[ProviderTemplates] Invalidating provider templates cache");
    return queryClient.invalidateQueries({ queryKey: PROVIDER_TEMPLATES_QUERY_KEY });
  };
}

export { PROVIDER_TEMPLATES_QUERY_KEY };
