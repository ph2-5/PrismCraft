import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mediaAssetService } from "../media-assets";
import type { MediaAsset } from "@/domain/schemas";
import { isElectron } from "@/shared/utils/platform";

export function useMediaAssets() {
  return useQuery({
    queryKey: ["media-assets"],
    queryFn: () => mediaAssetService.getAll(),
    enabled: isElectron(),
  });
}

export function useCreateMediaAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asset: Omit<MediaAsset, "id" | "createdAt" | "updatedAt">) =>
      mediaAssetService.create(asset),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
  });
}

export function useDeleteMediaAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mediaAssetService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
  });
}
