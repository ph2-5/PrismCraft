import { t } from "@/shared/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  TestTube,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  type ApiCapability,
  type ApiConfig,
} from "@/infrastructure/api-config-facade";

interface CapabilityItem {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

interface ModelMappingSectionProps {
  config: ApiConfig;
  useFreeImageBackup: boolean;
  useCustomVision: boolean;
  testingCapability: ApiCapability | null;
  onSetMapping: (capability: ApiCapability, value: string | null | undefined) => void;
  onTestCapability: (capability: ApiCapability) => void;
  onSetFreeImageBackup: (value: boolean) => void;
  onSetCustomVision: (value: boolean) => void;
  capabilities: CapabilityItem[];
}

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

function getSelectedModelLabel(config: ApiConfig, capability: ApiCapability) {
  const mappingValue = config.mapping[capability];
  if (!mappingValue) return null;

  const lastSlashIndex = mappingValue.lastIndexOf("/");
  if (lastSlashIndex === -1) return null;
  const providerId = mappingValue.substring(0, lastSlashIndex);
  const modelId = mappingValue.substring(lastSlashIndex + 1);
  const provider = config.providers.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);

  if (provider && model) {
    return { provider: provider.name, model: model.name };
  }
  return null;
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
  useFreeImageBackup,
  useCustomVision,
  testingCapability,
  onSetMapping,
  onTestCapability,
  onSetFreeImageBackup,
  onSetCustomVision,
  capabilities,
}: ModelMappingSectionProps) {
  const visionInfo = textModelHasVision(config);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{t("mapping.title")}</CardTitle>
        <CardDescription>{t("mapping.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {capabilities.map((cap) => {
          const models = getAvailableModels(config, cap.id);
          const currentValue = config.mapping[cap.id];
          const selected = getSelectedModelLabel(config, cap.id);

          return (
            <div key={cap.id} className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-24 shrink-0">
                  {cap.icon}
                  <span className="font-medium">{cap.name}</span>
                </div>

                <Select
                  value={currentValue || "_none"}
                  onValueChange={(value) => onSetMapping(cap.id, value)}
                  disabled={
                    cap.id === "vision" &&
                    !useCustomVision &&
                    visionInfo.hasVision
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t("mapping.selectModel", { name: cap.name })}>
                      {selected ? (
                        <span>
                          {selected.provider} / {selected.model}
                        </span>
                      ) : (
                        <span className="text-gray-400">{t("mapping.notConfigured")}</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t("mapping.notConfigured")}</SelectItem>
                    {models.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        {t("mapping.noModels")}
                      </SelectItem>
                    ) : (
                      models.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.providerName} / {m.modelName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                {cap.id === "image" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Checkbox
                      id="useFreeBackup"
                      checked={useFreeImageBackup}
                      onCheckedChange={(checked) => {
                        onSetFreeImageBackup(checked as boolean);
                      }}
                    />
                    <Label
                      htmlFor="useFreeBackup"
                      className="text-sm cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-purple-500" />
                      {t("mapping.useFreeBackup")}
                    </Label>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTestCapability(cap.id)}
                  disabled={
                    !currentValue ||
                    testingCapability === cap.id ||
                    (cap.id === "vision" &&
                      !useCustomVision &&
                      visionInfo.hasVision)
                  }
                >
                  {testingCapability === cap.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TestTube className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {cap.id === "vision" && visionInfo.hasVision && (
                <div className="pl-28 space-y-2">
                  <Alert className="bg-blue-900/20 border-blue-800">
                    <AlertDescription className="text-blue-300 text-sm">
                      {t("mapping.visionAutoDetect", { modelName: visionInfo.modelName ?? "" })}
                    </AlertDescription>
                  </Alert>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="useCustomVision"
                      checked={useCustomVision}
                      onCheckedChange={(checked) =>
                        onSetCustomVision(checked as boolean)
                      }
                    />
                    <Label
                      htmlFor="useCustomVision"
                      className="text-sm cursor-pointer"
                    >
                      {t("mapping.useCustomVision")}
                    </Label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
