/**
 * useGenerationAssets — 生成资产列表状态管理 Hook（Task 4.11）
 */
import { useCallback, useEffect, useState } from "react";
import type { GenerationAsset } from "@/domain/schemas";
import {
  listAssetsByType,
  listAssetsByProject,
  deleteAsset,
  deleteUnreferencedAssets,
} from "../services/asset-crud";

export interface UseGenerationAssetsResult {
  assets: GenerationAsset[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  cleanUnreferenced: () => Promise<number>;
}

export function useGenerationAssets(options?: {
  type?: string;
  projectId?: string;
}): UseGenerationAssetsResult {
  const { type, projectId } = options ?? {};
  const [assets, setAssets] = useState<GenerationAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result: GenerationAsset[];
      if (projectId) {
        result = await listAssetsByProject(projectId);
      } else if (type) {
        result = await listAssetsByType(type);
      } else {
        result = await listAssetsByType("keyframe");
      }
      setAssets(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [type, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteAsset(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const cleanUnreferenced = useCallback(async () => {
    try {
      const count = await deleteUnreferencedAssets();
      await refresh();
      return count;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return 0;
    }
  }, [refresh]);

  return { assets, loading, error, refresh, remove, cleanUnreferenced };
}
