import { useMemo, useCallback } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Slider } from "@/shared/ui/slider";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { t } from "@/shared/constants";
import {
  getModelParameterProfile,
  type ModelParameterProfile,
} from "@/shared/model-capabilities";

const FALLBACK_DURATIONS = [
  { value: 2, label: "2秒" },
  { value: 5, label: "5秒" },
  { value: 10, label: "10秒" },
  { value: 15, label: "15秒" },
  { value: 30, label: "30秒" },
];

const FALLBACK_RESOLUTIONS = [
  { value: "1280x720", label: "720p HD", width: 1280, height: 720 },
  { value: "1920x1080", label: "1080p Full HD", width: 1920, height: 1080 },
  { value: "3840x2160", label: "4K Ultra HD", width: 3840, height: 2160 },
];

const FALLBACK_STYLES = [
  "写实",
  "动漫",
  "二次元",
  "电影感",
  "国潮",
  "赛博朋克",
  "古风",
  "3D卡通",
  "像素风",
  "水彩",
];

export interface ModelParameterValues {
  duration: number;
  resolution: string;
  style: string;
  negativePrompt: string;
  seed: string;
  cfgScale: number;
}

interface ModelParameterPanelProps {
  modelId: string | undefined;
  values: ModelParameterValues;
  onValuesChange: (values: Partial<ModelParameterValues>) => void;
  variant?: "default" | "dark";
}

interface ResolvedProfile {
  profile: ModelParameterProfile | undefined;
  durations: Array<{ value: number; label: string }>;
  resolutions: Array<{ value: string; label: string; width: number; height: number }>;
  styles: Array<{ value: string; label: string }>;
  showNegativePrompt: boolean;
  showSeed: boolean;
  cfgScaleConfig: { min: number; max: number; default: number; step: number } | undefined;
  showLora: boolean;
}

function resolveProfile(modelId: string | undefined): ResolvedProfile {
  if (!modelId) {
    return {
      profile: undefined,
      durations: FALLBACK_DURATIONS,
      resolutions: FALLBACK_RESOLUTIONS,
      styles: FALLBACK_STYLES.map((s) => ({ value: s, label: s })),
      showNegativePrompt: false,
      showSeed: false,
      cfgScaleConfig: undefined,
      showLora: false,
    };
  }

  const profile = getModelParameterProfile(modelId);
  const params = profile?.parameters;

  return {
    profile,
    durations: params?.durations?.length ? params.durations : FALLBACK_DURATIONS,
    resolutions: params?.resolutions?.length ? params.resolutions : FALLBACK_RESOLUTIONS,
    styles: params?.styles?.length ? params.styles : FALLBACK_STYLES.map((s) => ({ value: s, label: s })),
    showNegativePrompt: params?.negativePrompt === true,
    showSeed: params?.seed === true,
    cfgScaleConfig: params?.cfgScale,
    showLora: params?.lora === true,
  };
}

export function ModelParameterPanel({
  modelId,
  values,
  onValuesChange,
  variant = "default",
}: ModelParameterPanelProps) {
  const resolved = useMemo(() => resolveProfile(modelId), [modelId]);

  const isDark = variant === "dark";
  const labelClass = isDark ? "text-slate-300" : "";
  const btnDefaultClass = isDark
    ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
    : "";
  const btnOutlineClass = isDark
    ? "border-slate-700 hover:border-purple-500 text-slate-300"
    : "";
  const selectTriggerClass = isDark ? "bg-slate-800 border-slate-700" : "";
  const selectContentClass = isDark ? "bg-slate-800 border-slate-700" : "";
  const inputClass = isDark ? "bg-slate-800 border-slate-700" : "";
  const textareaClass = isDark ? "bg-slate-800 border-slate-700 text-sm" : "";

  const handleDurationChange = useCallback(
    (value: number) => onValuesChange({ duration: value }),
    [onValuesChange],
  );

  const handleResolutionChange = useCallback(
    (value: string | null) => {
      if (value) onValuesChange({ resolution: value });
    },
    [onValuesChange],
  );

  const handleStyleChange = useCallback(
    (value: string) => onValuesChange({ style: value }),
    [onValuesChange],
  );

  const handleNegativePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      onValuesChange({ negativePrompt: e.target.value }),
    [onValuesChange],
  );

  const handleSeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onValuesChange({ seed: e.target.value }),
    [onValuesChange],
  );

  const handleCfgScaleChange = useCallback(
    (value: number | readonly number[]) => {
      const v = Array.isArray(value) ? value[0] : value;
      onValuesChange({ cfgScale: v });
    },
    [onValuesChange],
  );

  if (!modelId) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        {t("modelParam.noModelSelected")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className={labelClass}>{t("modelParam.duration")}</Label>
        <div className="flex flex-wrap gap-2">
          {resolved.durations.map((opt) => (
            <Button
              key={opt.value}
              variant={values.duration === opt.value ? "default" : "outline"}
              size="sm"
              className={
                values.duration === opt.value ? btnDefaultClass : btnOutlineClass
              }
              onClick={() => handleDurationChange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className={labelClass}>{t("modelParam.resolution")}</Label>
        <Select value={values.resolution} onValueChange={handleResolutionChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContentClass}>
            {resolved.resolutions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className={labelClass}>{t("modelParam.style")}</Label>
        <div className="flex flex-wrap gap-2">
          {resolved.styles.map((style) => (
            <Button
              key={style.value}
              variant={values.style === style.value ? "default" : "outline"}
              size="sm"
              className={
                values.style === style.value ? btnDefaultClass : btnOutlineClass
              }
              onClick={() => handleStyleChange(style.value)}
            >
              {style.label}
            </Button>
          ))}
        </div>
      </div>

      {resolved.showNegativePrompt && (
        <div className="space-y-2">
          <Label className={labelClass}>{t("modelParam.negativePrompt")}</Label>
          <Textarea
            value={values.negativePrompt}
            onChange={handleNegativePromptChange}
            placeholder={t("modelParam.negativePromptPlaceholder")}
            className={textareaClass}
          />
        </div>
      )}

      {resolved.showSeed && (
        <div className="space-y-2">
          <Label className={labelClass}>{t("modelParam.seed")}</Label>
          <Input
            type="number"
            value={values.seed}
            onChange={handleSeedChange}
            placeholder={t("modelParam.seedPlaceholder")}
            className={inputClass}
          />
        </div>
      )}

      {resolved.cfgScaleConfig && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className={labelClass}>{t("modelParam.cfgScale")}</Label>
            <span className="text-sm text-muted-foreground">
              {values.cfgScale}
            </span>
          </div>
          <Slider
            min={resolved.cfgScaleConfig.min}
            max={resolved.cfgScaleConfig.max}
            step={resolved.cfgScaleConfig.step}
            value={[values.cfgScale]}
            onValueChange={handleCfgScaleChange}
          />
        </div>
      )}
    </div>
  );
}
