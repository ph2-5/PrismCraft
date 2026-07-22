import { useState, useEffect } from "react";
import type { ApiCapability } from "@/infrastructure/di";
import { loadConfig } from "@/shared/api-config";
import type { ModelSelection } from "@/domain/schemas";
import { Bot, Image as ImageIcon, Video, Eye, Settings2, AudioWaveform, Boxes } from "lucide-react";
import { Link } from "react-router-dom";
import { errorLogger } from "@/shared/error-logger";
import { preferencesStorage } from "@/shared/utils/preferences";
import { t } from "@/shared/constants";

export type { ModelSelection };

interface ModelSelectorProps {
  capability: ApiCapability;
  value?: ModelSelection | null;
  onChange: (selection: ModelSelection | null) => void;
  compact?: boolean;
  // 可选：应用到内部 select 元素的 id，用于 <label htmlFor> 关联
  id?: string;
}

const capabilityIcons: Record<ApiCapability, React.ReactNode> = {
  text: <Bot className="w-3 h-3" />,
  image: <ImageIcon className="w-3 h-3" />,
  vision: <Eye className="w-3 h-3" />,
  video: <Video className="w-3 h-3" />,
  embedding: <Boxes className="w-3 h-3" />,
  audio: <AudioWaveform className="w-3 h-3" />,
};

const capabilityLabels: Record<ApiCapability, string> = {
  text: t("model.text"),
  image: t("model.image"),
  vision: t("model.vision"),
  video: t("model.video"),
  embedding: t("model.embedding"),
  audio: t("model.audio"),
};

export function ModelSelector({
  capability,
  value,
  onChange,
  compact = true,
  id,
}: ModelSelectorProps) {
  const [availableModels, setAvailableModels] = useState<
    Array<{
      providerId: string;
      providerName: string;
      modelId: string;
      modelName: string;
      value: string;
      format?: string;
      deprecated?: boolean;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then((config) => {
        if (cancelled) return;
        const models: typeof availableModels = [];
        for (const provider of config.providers) {
          for (const model of provider.models) {
            if (model.capabilities.includes(capability)) {
              models.push({
                providerId: provider.id,
                providerName: provider.name,
                modelId: model.id,
                modelName: model.name,
                value: `${provider.id}/${model.id}`,
                format: provider.format,
                deprecated: model.deprecated,
              });
            }
          }
        }
        setAvailableModels(models);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoading(false);
        setLoadError(true);
      });
    return () => { cancelled = true; };
  }, [capability]);

  const currentValue = value
    ? `${value.providerId}/${value.modelId}`
    : "";

  const handleValueChange = (newValue: string | null) => {
    if (!newValue) {
      onChange(null);
      return;
    }
    const [providerId, modelId] = newValue.split("/");
    const selected = availableModels.find(
      (m) => m.providerId === providerId && m.modelId === modelId
    );
    if (selected) {
      onChange({
        providerId: selected.providerId,
        modelId: selected.modelId,
        providerName: selected.providerName,
        modelName: selected.modelName,
        format: selected.format,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className={`${compact ? "w-[180px] h-8" : "w-[240px] h-9"} border border-border bg-card2 rounded-md animate-pulse`} />
      </div>
    );
  }

  if (loadError || availableModels.length === 0) {
    return (
      <Link
        to="/settings"
        className={`flex items-center gap-1.5 ${compact ? "text-xs" : "text-sm"} text-warning hover:text-warning transition-colors`}
      >
        <Settings2 className="w-3 h-3" />
        {t("model.pleaseConfigure", { capability: capabilityLabels[capability] })}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!compact && (
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <Settings2 className="w-3 h-3" />
          {t("model.modelLabel", { capability: capabilityLabels[capability] })}
        </span>
      )}
      <select
        id={id}
        className={`select ${compact ? "w-[180px] h-8 text-xs" : "w-[240px]"} border-border bg-card2`}
        value={currentValue}
        onChange={(e) => handleValueChange(e.target.value)}
      >
        <option value="">{t("model.defaultOption")}</option>
        {availableModels.map((m) => (
          <option key={m.value} value={m.value}>
            {m.deprecated ? `⚠ ${m.providerName} / ${m.modelName}` : `${m.providerName} / ${m.modelName}`}
          </option>
        ))}
      </select>
      {value && (
        <span className="badge badge-muted text-xs">
          {capabilityIcons[capability]}
          <span className="ml-1">{value.modelName}</span>
        </span>
      )}
    </div>
  );
}

export function useModelSelection(storageKey: string) {
  const [selection, setSelection] = useState<ModelSelection | null>(() => {
    try {
      return preferencesStorage.get<ModelSelection | null>(storageKey, null);
    } catch (e) {
      errorLogger.warn("[ModelSelector] 读取存储的选择失败:", e instanceof Error ? e.message : e);
      return null;
    }
  });

  const updateSelection = (newSelection: ModelSelection | null) => {
    setSelection(newSelection);
    if (newSelection) {
      preferencesStorage.set(storageKey, newSelection);
    } else {
      preferencesStorage.remove(storageKey);
    }
  };

  return [selection, updateSelection] as const;
}
