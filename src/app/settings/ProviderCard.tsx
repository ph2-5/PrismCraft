import { t } from "@/shared/constants";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { Separator } from "@/shared/ui/separator";
import {
  Plus,
  Trash2,
  ChevronDown,
  Sparkles,
  Settings2,
} from "lucide-react";
import {
  type ApiCapability,
  type ApiConfig,
  type ProviderConfig,
  type ModelConfig,
} from "@/infrastructure/api-config-facade";
import { getModelParameterProfile } from "@/shared/model-capabilities";

interface CapabilityItem {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

interface ProviderCardProps {
  provider: ApiConfig["providers"][0];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateProvider: (providerId: string, updates: Partial<ProviderConfig>) => void;
  onRemoveProvider: (providerId: string) => void;
  onAddCustomModel: (providerId: string) => void;
  onUpdateModel: (providerId: string, modelIndex: number, updates: Partial<ModelConfig>) => void;
  onRemoveModel: (providerId: string, modelIndex: number) => void;
  onUpdateProviderModels: (providerId: string) => void;
  capabilities: CapabilityItem[];
}

function getCapabilityBadges(provider: ApiConfig["providers"][0]) {
  const caps = new Set<ApiCapability>();
  provider.models.forEach((m) => m.capabilities.forEach((c) => caps.add(c)));
  return Array.from(caps);
}

export function ProviderCard({
  provider,
  isExpanded,
  onToggleExpand,
  onUpdateProvider,
  onRemoveProvider,
  onAddCustomModel,
  onUpdateModel,
  onRemoveModel,
  onUpdateProviderModels,
  capabilities,
}: ProviderCardProps) {
  const caps = getCapabilityBadges(provider);
  const isConfigured = !!provider.apiKey;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className={`flex items-center justify-between p-3 cursor-pointer ${
          isConfigured ? "bg-green-900/20" : "bg-yellow-900/20"
        }`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${isConfigured ? "bg-green-500" : "bg-yellow-500"}`}
          />
          <div>
            <div className="font-medium">{provider.name}</div>
            <div className="text-xs text-gray-500 font-mono">
              {provider.apiKey
                ? `${provider.apiKey.slice(0, 4)}****${provider.apiKey.slice(-2)}`
                : t("provider.keyNotConfigured")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {caps.map((cap) => {
              const capConfig = capabilities.find(
                (c) => c.id === cap,
              );
              return (
                <Badge
                  key={cap}
                  variant="secondary"
                  className="text-xs"
                >
                  {capConfig?.icon}
                  <span className="ml-1">{capConfig?.name}</span>
                </Badge>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateProviderModels(provider.id);
            }}
          >
            <Sparkles className="h-4 w-4 text-blue-500" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveProvider(provider.id);
            }}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 border-t bg-slate-800/50 space-y-4">
          <div className="space-y-3">
            <h4 className="font-medium text-sm">{t("provider.providerConfig")}</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label
                  htmlFor={`name-${provider.id}`}
                  className="text-xs"
                >
                  {t("provider.displayName")}
                </Label>
                <Input
                  id={`name-${provider.id}`}
                  value={provider.name}
                  onChange={(e) =>
                    onUpdateProvider(provider.id, {
                      name: e.target.value,
                    })
                  }
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor={`baseUrl-${provider.id}`}
                  className="text-xs"
                >
                  {t("provider.baseUrl")}
                </Label>
                <Input
                  id={`baseUrl-${provider.id}`}
                  value={provider.baseUrl}
                  onChange={(e) =>
                    onUpdateProvider(provider.id, {
                      baseUrl: e.target.value,
                    })
                  }
                  className="text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label
                htmlFor={`apiKey-${provider.id}`}
                className="text-xs"
              >
                {t("provider.apiKey")}
              </Label>
              <Input
                id={`apiKey-${provider.id}`}
                type="password"
                value={provider.apiKey}
                onChange={(e) =>
                  onUpdateProvider(provider.id, {
                    apiKey: e.target.value,
                  })
                }
                className="text-sm"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">{t("provider.modelList")}</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddCustomModel(provider.id)}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t("provider.addCustomModel")}
              </Button>
            </div>

            <div className="space-y-2">
              {provider.models.map((model, index) => (
                <div
                  key={model.id || index}
                  className="p-3 border rounded-lg bg-slate-800/50 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("provider.modelId")}</Label>
                        <Input
                          value={model.id}
                          onChange={(e) =>
                            onUpdateModel(
                              provider.id,
                              index,
                              {
                                id: e.target.value,
                              },
                            )
                          }
                          className="text-xs"
                          placeholder={t("provider.modelIdPlaceholder")}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("provider.displayName")}
                        </Label>
                        <Input
                          value={model.name}
                          onChange={(e) =>
                            onUpdateModel(
                              provider.id,
                              index,
                              {
                                name: e.target.value,
                              },
                            )
                          }
                          className="text-xs"
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onRemoveModel(provider.id, index)
                      }
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">
                      {t("provider.supportedCapabilities")}
                    </span>
                    {["text", "image", "vision", "video"].map(
                      (cap) => {
                        const capConfig = capabilities.find(
                          (c) => c.id === (cap as ApiCapability),
                        );
                        const isEnabled =
                          model.capabilities.includes(
                            cap as ApiCapability,
                          );
                        return (
                          <div
                            key={cap}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                              isEnabled
                                ? "bg-blue-900/30 text-blue-300"
                                : "bg-slate-700/50 text-slate-400 hover:bg-slate-700"
                            }`}
                            onClick={() => {
                              const newCaps = isEnabled
                                ? model.capabilities.filter(
                                    (c) => c !== cap,
                                  )
                                : [
                                    ...model.capabilities,
                                    cap as ApiCapability,
                                  ];
                              onUpdateModel(
                                provider.id,
                                index,
                                { capabilities: newCaps },
                              );
                            }}
                          >
                            {capConfig?.icon}
                            {capConfig?.name}
                          </div>
                        );
                      },
                    )}
                  </div>

                  {getModelParameterProfile(model.id) && (
                    <div className="mt-2 p-2 border rounded bg-slate-900/50">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
                        <Settings2 className="h-3 w-3" />
                        {t("plugin.modelParams")}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(() => {
                          const profile = getModelParameterProfile(model.id);
                          if (!profile) return null;
                          const tags: React.ReactNode[] = [];
                          if (profile.parameters.durations?.length) {
                            tags.push(
                              <Badge key="dur" variant="outline" className="text-xs">
                                {t("plugin.durationOptions")}: {profile.parameters.durations.map((d) => d.label).join(", ")}
                              </Badge>,
                            );
                          }
                          if (profile.parameters.resolutions?.length) {
                            tags.push(
                              <Badge key="res" variant="outline" className="text-xs">
                                {t("plugin.resolutionOptions")}: {profile.parameters.resolutions.map((r) => r.label).join(", ")}
                              </Badge>,
                            );
                          }
                          if (profile.parameters.styles?.length) {
                            tags.push(
                              <Badge key="style" variant="outline" className="text-xs">
                                {t("plugin.styleOptions")}: {profile.parameters.styles.map((s) => s.label).join(", ")}
                              </Badge>,
                            );
                          }
                          if (profile.parameters.negativePrompt) {
                            tags.push(<Badge key="neg" variant="outline" className="text-xs">{t("plugin.negativePrompt")}</Badge>);
                          }
                          if (profile.parameters.seed) {
                            tags.push(<Badge key="seed" variant="outline" className="text-xs">{t("plugin.seedSupport")}</Badge>);
                          }
                          if (profile.parameters.cfgScale) {
                            tags.push(
                              <Badge key="cfg" variant="outline" className="text-xs">
                                {t("plugin.cfgScale")}: {profile.parameters.cfgScale.min}-{profile.parameters.cfgScale.max}
                              </Badge>,
                            );
                          }
                          if (profile.parameters.lora) {
                            tags.push(<Badge key="lora" variant="outline" className="text-xs">{t("plugin.loraSupport")}</Badge>);
                          }
                          return tags;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
