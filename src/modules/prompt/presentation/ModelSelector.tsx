"use client";

import { useState, useEffect } from "react";
import { container } from "@/infrastructure/di";
import type { ApiCapability } from "@/infrastructure/di";
import type { ModelSelection } from "@/domain/schemas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";
import { Bot, Image as ImageIcon, Video, Eye, Settings2 } from "lucide-react";
import Link from "next/link";
import { errorLogger } from "@/shared/error-logger";
import { preferencesStorage } from "@/shared/utils/preferences";

export type { ModelSelection };

interface ModelSelectorProps {
  capability: ApiCapability;
  value?: ModelSelection | null;
  onChange: (selection: ModelSelection | null) => void;
  compact?: boolean;
}

const capabilityIcons: Record<ApiCapability, React.ReactNode> = {
  text: <Bot className="w-3 h-3" />,
  image: <ImageIcon className="w-3 h-3" />,
  vision: <Eye className="w-3 h-3" />,
  video: <Video className="w-3 h-3" />,
};

const capabilityLabels: Record<ApiCapability, string> = {
  text: "文本",
  image: "图片",
  vision: "视觉",
  video: "视频",
};

export function ModelSelector({
  capability,
  value,
  onChange,
  compact = true,
}: ModelSelectorProps) {
  const [availableModels, setAvailableModels] = useState<
    Array<{
      providerId: string;
      providerName: string;
      modelId: string;
      modelName: string;
      value: string;
      format?: string;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    container.loadConfig()
      .then((config) => {
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
              });
            }
          }
        }
        setAvailableModels(models);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
        setLoadError(true);
      });
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
        <div className={`${compact ? "w-[180px] h-8" : "w-[240px] h-9"} border border-slate-700 bg-slate-800/50 rounded-md animate-pulse`} />
      </div>
    );
  }

  if (loadError || availableModels.length === 0) {
    return (
      <Link
        href="/settings"
        className={`flex items-center gap-1.5 ${compact ? "text-xs" : "text-sm"} text-amber-400 hover:text-amber-300 transition-colors`}
      >
        <Settings2 className="w-3 h-3" />
        请先配置{capabilityLabels[capability]}模型
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!compact && (
        <span className="text-sm text-slate-400 flex items-center gap-1">
          <Settings2 className="w-3 h-3" />
          {capabilityLabels[capability]}模型:
        </span>
      )}
      <Select value={currentValue} onValueChange={handleValueChange}>
        <SelectTrigger className={`${compact ? "w-[180px] h-8 text-xs" : "w-[240px]"} border-slate-700 bg-slate-800/50`}>
          <SelectValue placeholder={`选择${capabilityLabels[capability]}模型`}>
            {value ? (
              <span className="truncate">
                {value.providerName} / {value.modelName}
              </span>
            ) : (
              <span className="text-slate-400">默认模型</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">默认（使用设置中的配置）</SelectItem>
          {availableModels.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              <div className="flex items-center gap-2">
                <span>{m.providerName}</span>
                <span className="text-slate-400">/</span>
                <span>{m.modelName}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <Badge variant="secondary" className="text-xs">
          {capabilityIcons[capability]}
          <span className="ml-1">{value.modelName}</span>
        </Badge>
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
