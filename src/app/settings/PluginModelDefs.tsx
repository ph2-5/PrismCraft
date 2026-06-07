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
import { Plus, Trash2, ChevronRight, Box } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState, ModelDefinition } from "./plugin-creator-types";

interface PluginModelDefsProps {
  state: WizardState;
  updateModel: (index: number, updates: Partial<ModelDefinition>) => void;
  addModel: () => void;
  removeModel: (index: number) => void;
  expandedModelParams: Set<number>;
  toggleModelParams: (index: number) => void;
}

function ModelParams({
  model,
  index,
  isExpanded,
  updateModel,
  toggleModelParams,
}: {
  model: ModelDefinition;
  index: number;
  isExpanded: boolean;
  updateModel: (index: number, updates: Partial<ModelDefinition>) => void;
  toggleModelParams: (index: number) => void;
}) {
  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => toggleModelParams(index)}
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        {t("plugin.paramConfig")}
      </button>
      {isExpanded && (
        <div className="mt-3 space-y-4 pl-2">
          <div className="space-y-2">
            <Label className="text-xs">{t("plugin.durationOptions")}</Label>
            {model.durations.map((d) => (
              <div key={d._uid} className="flex items-center gap-2">
                <Input
                  type="number"
                  value={d.value}
                  onChange={(e) => {
                    const durations = model.durations.map((item) =>
                      item._uid === d._uid ? { ...item, value: Number(e.target.value) || 0 } : item
                    );
                    updateModel(index, { durations });
                  }}
                  placeholder={t("plugin.durationValuePlaceholder")}
                  className="font-mono h-8 text-xs"
                />
                <Input
                  value={d.label}
                  onChange={(e) => {
                    const durations = model.durations.map((item) =>
                      item._uid === d._uid ? { ...item, label: e.target.value } : item
                    );
                    updateModel(index, { durations });
                  }}
                  placeholder={t("plugin.durationLabelPlaceholder")}
                  className="h-8 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-red-500"
                  onClick={() => {
                    updateModel(index, { durations: model.durations.filter((item) => item._uid !== d._uid) });
                  }}
                  aria-label={t("aria.removeDuration")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                updateModel(index, { durations: [...model.durations, { _uid: crypto.randomUUID(), value: 0, label: "" }] });
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t("plugin.addDuration")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t("plugin.resolutionOptions")}</Label>
            {model.resolutions.map((r) => (
              <div key={r._uid} className="flex items-center gap-2">
                <Input
                  value={r.value}
                  onChange={(e) => {
                    const resolutions = model.resolutions.map((item) =>
                      item._uid === r._uid ? { ...item, value: e.target.value } : item
                    );
                    updateModel(index, { resolutions });
                  }}
                  placeholder={t("plugin.valuePlaceholder")}
                  className="font-mono h-8 text-xs w-20"
                />
                <Input
                  value={r.label}
                  onChange={(e) => {
                    const resolutions = model.resolutions.map((item) =>
                      item._uid === r._uid ? { ...item, label: e.target.value } : item
                    );
                    updateModel(index, { resolutions });
                  }}
                  placeholder={t("plugin.labelPlaceholder")}
                  className="h-8 text-xs w-24"
                />
                <Input
                  value={r.width ? String(r.width) : ""}
                  onChange={(e) => {
                    const resolutions = model.resolutions.map((item) =>
                      item._uid === r._uid ? { ...item, width: Number(e.target.value) || 0 } : item
                    );
                    updateModel(index, { resolutions });
                  }}
                  placeholder={t("plugin.resolutionWidthPlaceholder")}
                  type="number"
                  className="font-mono h-8 text-xs w-16"
                />
                <Input
                  value={r.height ? String(r.height) : ""}
                  onChange={(e) => {
                    const resolutions = model.resolutions.map((item) =>
                      item._uid === r._uid ? { ...item, height: Number(e.target.value) || 0 } : item
                    );
                    updateModel(index, { resolutions });
                  }}
                  placeholder={t("plugin.resolutionHeightPlaceholder")}
                  type="number"
                  className="font-mono h-8 text-xs w-16"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-red-500"
                  onClick={() => {
                    updateModel(index, { resolutions: model.resolutions.filter((item) => item._uid !== r._uid) });
                  }}
                  aria-label={t("aria.removeResolution")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                updateModel(index, { resolutions: [...model.resolutions, { _uid: crypto.randomUUID(), value: "", label: "", width: 0, height: 0 }] });
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t("plugin.addResolution")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t("plugin.styleOptions")}</Label>
            {model.styles.map((s) => (
              <div key={s._uid} className="flex items-center gap-2">
                <Input
                  value={s.value}
                  onChange={(e) => {
                    const styles = model.styles.map((item) =>
                      item._uid === s._uid ? { ...item, value: e.target.value } : item
                    );
                    updateModel(index, { styles });
                  }}
                  placeholder={t("plugin.valuePlaceholder")}
                  className="font-mono h-8 text-xs"
                />
                <Input
                  value={s.label}
                  onChange={(e) => {
                    const styles = model.styles.map((item) =>
                      item._uid === s._uid ? { ...item, label: e.target.value } : item
                    );
                    updateModel(index, { styles });
                  }}
                  placeholder={t("plugin.labelPlaceholder")}
                  className="h-8 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-red-500"
                  onClick={() => {
                    updateModel(index, { styles: model.styles.filter((item) => item._uid !== s._uid) });
                  }}
                  aria-label={t("aria.removeStyle")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                updateModel(index, { styles: [...model.styles, { _uid: crypto.randomUUID(), value: "", label: "" }] });
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t("plugin.addStyle")}
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={model.negativePrompt}
                onCheckedChange={(v) => updateModel(index, { negativePrompt: v === true })}
              />
              <Label className="text-xs">{t("plugin.negativePrompt")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={model.seed}
                onCheckedChange={(v) => updateModel(index, { seed: v === true })}
              />
              <Label className="text-xs">{t("plugin.seedValue")}</Label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={model.cfgScale !== null}
                onCheckedChange={(v) => {
                  updateModel(index, {
                    cfgScale: v === true ? { min: 1, max: 30, default: 7, step: 0.5 } : null,
                  });
                }}
              />
              <Label className="text-xs">{t("plugin.cfgScale")}</Label>
            </div>
            {model.cfgScale && (
              <div className="flex items-center gap-2 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("plugin.min")}</Label>
                  <Input
                    type="number"
                    value={model.cfgScale.min}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, min: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                    className="font-mono h-8 text-xs w-20"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("plugin.max")}</Label>
                  <Input
                    type="number"
                    value={model.cfgScale.max}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, max: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                    className="font-mono h-8 text-xs w-20"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("plugin.defaultVal")}</Label>
                  <Input
                    type="number"
                    value={model.cfgScale.default}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, default: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                    className="font-mono h-8 text-xs w-20"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("plugin.step")}</Label>
                  <Input
                    type="number"
                    value={model.cfgScale.step}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, step: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                    className="font-mono h-8 text-xs w-20"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
