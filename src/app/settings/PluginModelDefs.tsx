import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Checkbox } from "@/shared/ui/checkbox";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Plus, Trash2, Box } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState, ModelDefinition } from "./plugin-creator-types";
import { ModelParams } from "./ModelParams";

interface PluginModelDefsProps {
  state: WizardState;
  updateModel: (index: number, updates: Partial<ModelDefinition>) => void;
  addModel: () => void;
  removeModel: (index: number) => void;
  expandedModelParams: Set<number>;
  toggleModelParams: (index: number) => void;
}

export function PluginModelDefs({
  state,
  updateModel,
  addModel,
  removeModel,
  expandedModelParams,
  toggleModelParams,
}: PluginModelDefsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Box className="w-5 h-5" />
              {t("plugin.modelDefs")}
            </CardTitle>
            <CardDescription>{t("plugin.modelDefsDesc")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addModel}>
            <Plus className="h-4 w-4 mr-1" />
            {t("plugin.addModel")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.models.map((model, index) => (
          <div key={model._uid} className="p-4 border rounded-lg bg-slate-800/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {model.type === "video" ? t("plugin.modelTypeVideo") : model.type === "image" ? t("plugin.modelTypeImage") : t("plugin.modelTypeText")}
                </Badge>
                <span className="text-sm font-medium">
                  {model.modelId || t("plugin.modelFallbackName", { index: index + 1 })}
                </span>
              </div>
              {state.models.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500"
                  onClick={() => removeModel(index)}
                  aria-label={t("aria.removeModel")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("plugin.modelId")} <span className="text-red-400">*</span></Label>
                <Input
                  value={model.modelId}
                  onChange={(e) => updateModel(index, { modelId: e.target.value })}
                  placeholder="model-v1"
                  className="font-mono h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("plugin.displayName")} <span className="text-red-400">*</span></Label>
                <Input
                  value={model.displayName}
                  onChange={(e) => updateModel(index, { displayName: e.target.value })}
                  placeholder="Model V1"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("plugin.modelType")}</Label>
                <Select
                  value={model.type}
                  onValueChange={(v) => updateModel(index, { type: v as ModelDefinition["type"] })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">{t("plugin.modelTypeVideo")}</SelectItem>
                    <SelectItem value="image">{t("plugin.modelTypeImage")}</SelectItem>
                    <SelectItem value="text">{t("plugin.modelTypeText")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("plugin.maxDurationSeconds")}</Label>
                <Input
                  type="number"
                  value={model.maxDuration}
                  onChange={(e) => updateModel(index, { maxDuration: Number(e.target.value) || 0 })}
                  className="font-mono h-9 text-sm"
                  disabled={model.type !== "video"}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("plugin.maxResolution")}</Label>
                <Input
                  type="number"
                  value={model.maxResolution}
                  onChange={(e) => updateModel(index, { maxResolution: Number(e.target.value) || 0 })}
                  className="font-mono h-9 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {model.type === "video" && (
                <>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={model.supportsLastFrame}
                      onCheckedChange={(v) => updateModel(index, { supportsLastFrame: v === true })}
                    />
                    <Label className="text-xs">{t("plugin.supportsLastFrame")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={model.supportsReferenceVideo}
                      onCheckedChange={(v) => updateModel(index, { supportsReferenceVideo: v === true })}
                    />
                    <Label className="text-xs">{t("plugin.supportsReferenceVideo")}</Label>
                  </div>
                </>
              )}
              {model.type === "image" && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={model.supportsReferenceImage}
                    onCheckedChange={(v) => updateModel(index, { supportsReferenceImage: v === true })}
                  />
                  <Label className="text-xs">{t("plugin.supportsReferenceImage")}</Label>
                </div>
              )}
            </div>

            <ModelParams
              model={model}
              index={index}
              isExpanded={expandedModelParams.has(index)}
              updateModel={updateModel}
              toggleModelParams={toggleModelParams}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
