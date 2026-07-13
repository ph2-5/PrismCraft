import { t } from "@/shared/constants";
import { Loader2, ArrowLeftRight, FlaskConical } from "lucide-react";
import {
  type ApiCapability,
  type ApiConfig,
} from "@/infrastructure/api-config-facade";
import { IconButton } from "@/shared/presentation/IconButton";

interface CapabilityItem {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

interface ModelMappingSectionProps {
  config: ApiConfig;
  useCustomVision: boolean;
  testingCapability: ApiCapability | null;
  onSetMapping: (capability: ApiCapability, value: string | null | undefined) => void;
  onTestCapability: (capability: ApiCapability) => void;
  onSetCustomVision: (value: boolean) => void;
  capabilities: CapabilityItem[];
}

// 每个 capability 对应的 emoji + 背景色，对齐预览页面 element-card 布局
const CAPABILITY_VISUAL: Record<ApiCapability, { emoji: string; bg: string }> = {
  text: { emoji: "", bg: "rgba(var(--primary-rgb), 0.15)" },
  image: { emoji: "", bg: "color-mix(in srgb, var(--chart-2) 15%, transparent)" },
  vision: { emoji: "", bg: "rgba(var(--success-rgb), 0.15)" },
  video: { emoji: "", bg: "rgba(var(--warning-rgb), 0.15)" },
  embedding: { emoji: "", bg: "color-mix(in srgb, var(--chart-3) 15%, transparent)" },
  audio: { emoji: "", bg: "color-mix(in srgb, var(--chart-4) 15%, transparent)" },
};

function getAvailableModels(config: ApiConfig, capability: ApiCapability) {
  const models: {
    providerId: string;
    providerName: string;
    modelId: string;
    modelName: string;
    value: string;
  }[] = [];

  for (const provider of config.providers) {
    for (const model of provider.models) {
      if (model.capabilities.includes(capability)) {
        models.push({
          providerId: provider.id,
          providerName: provider.name,
          modelId: model.id,
          modelName: model.name,
          value: `${provider.id}/${model.id}`,
        });
      }
    }
  }

  return models;
}

function textModelHasVision(config: ApiConfig) {
  const textMapping = config.mapping.text;
  if (!textMapping) return { hasVision: false, modelName: null };

  const lastSlashIndex = textMapping.lastIndexOf("/");
  if (lastSlashIndex === -1) return { hasVision: false, modelName: null };
  const providerId = textMapping.substring(0, lastSlashIndex);
  const modelId = textMapping.substring(lastSlashIndex + 1);
  const provider = config.providers.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);

  if (provider && model) {
    return {
      hasVision: model.capabilities.includes("vision"),
      modelName: `${provider.name} / ${model.name}`,
    };
  }
  return { hasVision: false, modelName: null };
}

export function ModelMappingSection({
  config,
  useCustomVision,
  testingCapability,
  onSetMapping,
  onTestCapability,
  onSetCustomVision,
  capabilities,
}: ModelMappingSectionProps) {
  const visionInfo = textModelHasVision(config);

  return (
    <div className="card">
      <div className="section-label mb-2.5"><ArrowLeftRight className="inline-block" size={14} /> {t("mapping.title")}</div>
      <div className="text-[11px] text-muted-foreground mb-3">{t("mapping.description")}</div>
      <div className="flex flex-col gap-2">
        {capabilities.map((cap) => {
          const models = getAvailableModels(config, cap.id);
          const currentValue = config.mapping[cap.id];
          const visual = CAPABILITY_VISUAL[cap.id];
          const isDisabled =
            cap.id === "vision" && !useCustomVision && visionInfo.hasVision;

          return (
            <div key={cap.id} className="element-card items-center">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0"
                style={{ background: visual.bg }}
              >
                {visual.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold">{cap.name}</div>
              </div>
              <select
                className="select text-[11px] w-[180px]"
                value={currentValue || "_none"}
                onChange={(e) => onSetMapping(cap.id, e.target.value)}
                disabled={isDisabled}
              >
                <option value="_none">{t("mapping.notConfigured")}</option>
                {models.length === 0 ? (
                  <option value="_empty" disabled>
                    {t("mapping.noModels")}
                  </option>
                ) : (
                  models.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.providerName} / {m.modelName}
                    </option>
                  ))
                )}
              </select>
              <IconButton
                variant="ghost"
                className="btn-xs"
                onClick={() => onTestCapability(cap.id)}
                disabled={
                  !currentValue ||
                  testingCapability === cap.id ||
                  isDisabled
                }
                title={t("connection.title")}
                aria-label={t("aria.testCapability")}
              >
                {testingCapability === cap.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FlaskConical size={14} />
                )}
              </IconButton>

              {cap.id === "vision" && visionInfo.hasVision && (
                <div className="mt-2 p-2 rounded-md bg-card2 text-[11px] text-muted-foreground">
                  <div className="text-[11px] text-success mb-1.5">
                    {t("mapping.visionAutoDetect", { modelName: visionInfo.modelName ?? "" })}
                  </div>
                  <label className="element-card items-center gap-1.5 cursor-pointer px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      id="useCustomVision"
                      checked={useCustomVision}
                      onChange={(e) => onSetCustomVision(e.target.checked)}
                    />
                    {t("mapping.useCustomVision")}
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
