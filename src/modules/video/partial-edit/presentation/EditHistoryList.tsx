/**
 * Task 2A.22: EditHistoryList — 该视频的多次重绘历史
 *
 * 列出某原视频的所有局部重绘版本（type='partial_edit_video'）。
 * 用户可点击历史项切换预览，或与原视频对比。
 */

import { useEffect, useState } from "react";
import { History, Film, Loader2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { GenerationAsset } from "@/domain/schemas";
import { listPartialEditHistory } from "../services/partial-edit-service";

export interface EditHistoryListProps {
  /** 原视频 Asset ID */
  sourceVideoAssetId: string;
  /** 选择某个历史项时触发（传 null 表示取消选择） */
  onSelectAsset?: (asset: GenerationAsset | null) => void;
  /** 当前选中的 Asset ID */
  selectedAssetId?: string;
  /** 外部刷新触发器（任务完成时改变此值以触发刷新） */
  refreshTrigger?: unknown;
}

export function EditHistoryList({
  sourceVideoAssetId,
  onSelectAsset,
  selectedAssetId,
  refreshTrigger,
}: EditHistoryListProps) {
  const [assets, setAssets] = useState<GenerationAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listPartialEditHistory(sourceVideoAssetId)
      .then((result) => {
        if (cancelled) return;
        setAssets(result);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setAssets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceVideoAssetId, refreshTrigger]);

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: "var(--muted)" }}>
      <div className="flex items-center gap-2">
        <History className="w-4 h-4" style={{ color: "var(--muted-fg)" }} />
        <h4 className="text-sm font-medium">{t("video.partialEditHistoryTitle")}</h4>
        {assets.length > 0 && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--background)", color: "var(--muted-fg)" }}
          >
            {assets.length}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-2 text-xs" style={{ color: "var(--muted-fg)" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          {t("video.partialEditHistoryEmpty")}
        </div>
      )}

      {!loading && error && (
        <div className="text-xs py-2" style={{ color: "var(--destructive)" }}>
          {error}
        </div>
      )}

      {!loading && !error && assets.length === 0 && (
        <div className="text-xs py-2" style={{ color: "var(--muted-fg)" }}>
          {t("video.partialEditHistoryEmpty")}
        </div>
      )}

      {!loading && !error && assets.length > 0 && (
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto" role="list">
          {assets.map((asset, index) => {
            const isSelected = asset.id === selectedAssetId;
            const time = new Date(asset.createdAt).toLocaleString();
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left ${
                    isSelected ? "btn-primary" : "btn-ghost"
                  }`}
                  onClick={() => onSelectAsset?.(asset)}
                  aria-pressed={isSelected}
                  style={{
                    background: isSelected ? undefined : "var(--background)",
                    color: isSelected ? undefined : "var(--foreground)",
                  }}
                >
                  <Film className="w-3 h-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      {t("video.partialEditHistoryItem", {
                        index: index + 1,
                        time,
                      })}
                    </div>
                    {asset.prompt && (
                      <div className="truncate text-[10px] opacity-70">
                        {asset.prompt}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
