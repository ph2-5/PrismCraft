import { useMemo, useCallback, useId } from "react";
import { cn } from "@/shared/utils/utils";
import { t } from "@/shared/constants";
import {
  getModelParameterProfile,
  getVideoGenerationStrategy,
  getModelCapabilities,
  type ModelParameterProfile,
  type VideoGenerationStrategy,
} from "@/shared/model-capabilities";

const FALLBACK_DURATIONS = [
  { value: 2, label: "2s" },
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
];

/**
 * Task 2A.20: 根据模型 maxDuration 过滤时长选项。
 *
 * - 有 maxDuration：仅保留 <= maxDuration 的选项
 * - 无 maxDuration：返回全部 FALLBACK_DURATIONS（旧行为）
 *
 * Seedance 2.5 maxDuration=30 → 显示全部 5 个选项（2/5/10/15/30）
 * Seedance 2.0 maxDuration 未设置 → 显示全部（保守默认）
 * 其他模型若 maxDuration=15 → 仅显示 2/5/10/15
 */
function filterDurationsByMaxDuration(
  durations: Array<{ value: number; label: string }>,
  maxDuration: number | undefined,
): Array<{ value: number; label: string }> {
  if (maxDuration === undefined) return durations;
  return durations.filter((d) => d.value <= maxDuration);
}

const FALLBACK_RESOLUTIONS = [
  { value: "1280x720", label: "720p HD", width: 1280, height: 720 },
  { value: "1920x1080", label: "1080p Full HD", width: 1920, height: 1080 },
  { value: "3840x2160", label: "4K Ultra HD", width: 3840, height: 2160 },
];

const FALLBACK_STYLES = [
  "realistic",
  "anime",
  "2d-illustration",
  "cinematic",
  "chinese-chic",
  "cyberpunk",
  "chinese-classical",
  "3d-cartoon",
  "pixel-art",
  "watercolor",
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
  // Task 2A.20: 根据模型 maxDuration 过滤时长选项
  const maxDuration = modelId ? getModelCapabilities(modelId)?.maxDuration : undefined;

  if (!modelId) {
    return {
      profile: undefined,
      durations: filterDurationsByMaxDuration(
        FALLBACK_DURATIONS.map((d) => ({ value: d.value, label: t("modelParam.seconds", { count: d.value }) })),
        maxDuration,
      ),
      resolutions: FALLBACK_RESOLUTIONS,
      styles: FALLBACK_STYLES.map((s) => ({ value: s, label: t(`modelParam.style.${s}`) })),
      showNegativePrompt: false,
      showSeed: false,
      cfgScaleConfig: undefined,
      showLora: false,
    };
  }

  const profile = getModelParameterProfile(modelId);
  const params = profile?.parameters;

  const rawDurations = params?.durations?.length
    ? params.durations.map((d) => ({ ...d, label: t("modelParam.seconds", { count: d.value }) }))
    : FALLBACK_DURATIONS.map((d) => ({ value: d.value, label: t("modelParam.seconds", { count: d.value }) }));

  return {
    profile,
    durations: filterDurationsByMaxDuration(rawDurations, maxDuration),
    resolutions: params?.resolutions?.length ? params.resolutions : FALLBACK_RESOLUTIONS,
    styles: params?.styles?.length
      ? params.styles.map((s) => ({ ...s, label: s.label || t(`modelParam.style.${s.value}`) }))
      : FALLBACK_STYLES.map((s) => ({ value: s, label: t(`modelParam.style.${s}`) })),
    showNegativePrompt: params?.negativePrompt === true,
    showSeed: params?.seed === true,
    cfgScaleConfig: params?.cfgScale,
    showLora: params?.lora === true,
  };
}

// 参考图模式 label 解析（提取以降低主组件 complexity）
function getRefModeLabel(mode: string | undefined): string {
  switch (mode) {
    case "native_field":
      return t("modelParam.refModeNative");
    case "both":
      return t("modelParam.refModeBoth");
    case "bake_into_first":
      return t("modelParam.refModeBake");
    default:
      return t("modelParam.refModeNone");
  }
}

interface ButtonGroupFieldProps<T extends string | number> {
  label: string;
  labelClass: string;
  options: Array<{ value: T; label: string }>;
  currentValue: T;
  btnDefaultClass: string;
  btnOutlineClass: string;
  onSelect: (value: T) => void;
}

function ButtonGroupField<T extends string | number>({
  label,
  labelClass,
  options,
  currentValue,
  btnDefaultClass,
  btnOutlineClass,
  onSelect,
}: ButtonGroupFieldProps<T>) {
  return (
    <div className="space-y-2">
      <label className={labelClass}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={cn(
              currentValue === opt.value ? "btn btn-primary" : "btn btn-outline",
              "btn-sm",
              currentValue === opt.value ? btnDefaultClass : btnOutlineClass,
            )}
            onClick={() => onSelect(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface RefStrategyInfoProps {
  strategy: VideoGenerationStrategy;
  labelClass: string;
}

function RefStrategyInfo({ strategy, labelClass }: RefStrategyInfoProps) {
  return (
    <div className="space-y-2">
      <label className={labelClass}>{t("modelParam.refStrategy")}</label>
      <p className="text-xs text-muted-foreground">{t("modelParam.refStrategyDesc")}</p>
      <div className="flex flex-wrap gap-2">
        <span className={cn("badge", strategy.useCharacterRef ? "border-success/50 text-success" : "border-border/50 text-muted-foreground")}>
          {t("modelParam.charRefSupported")}: {getRefModeLabel(strategy.referenceStrategy.characterRef)}
        </span>
        <span className={cn("badge", strategy.useSceneRef ? "border-success/50 text-success" : "border-border/50 text-muted-foreground")}>
          {t("modelParam.sceneRefSupported")}: {getRefModeLabel(strategy.referenceStrategy.sceneRef)}
        </span>
      </div>
    </div>
  );
}

export function ModelParameterPanel({
  modelId,
  values,
  onValuesChange,
  variant = "default",
}: ModelParameterPanelProps) {
  const resolved = useMemo(() => resolveProfile(modelId), [modelId]);
  const strategy = useMemo(() => modelId ? getVideoGenerationStrategy(modelId) : null, [modelId]);
  const resolutionId = useId();
  const negativePromptId = useId();
  const seedId = useId();
  const cfgScaleId = useId();

  const isDark = variant === "dark";
  const labelClass = isDark ? "text-muted-foreground" : "";
  const btnDefaultClass = isDark
    ? "bg-primary hover:bg-primary/90 text-primary-foreground border-primary"
    : "";
  const btnOutlineClass = isDark
    ? "border-border hover:border-primary text-muted-foreground"
    : "";
  const selectTriggerClass = isDark ? "bg-card2 border-border" : "";
  const inputClass = isDark ? "bg-card2 border-border" : "";
  const textareaClass = isDark ? "bg-card2 border-border text-sm" : "";

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
      <ButtonGroupField
        label={t("modelParam.duration")}
        labelClass={labelClass}
        options={resolved.durations}
        currentValue={values.duration}
        btnDefaultClass={btnDefaultClass}
        btnOutlineClass={btnOutlineClass}
        onSelect={handleDurationChange}
      />

      <div className="space-y-2">
        <label htmlFor={resolutionId} className={labelClass}>{t("modelParam.resolution")}</label>
        <select
          id={resolutionId}
          className={cn("select", selectTriggerClass)}
          value={values.resolution}
          onChange={(e) => handleResolutionChange(e.target.value)}
        >
          {resolved.resolutions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <ButtonGroupField
        label={t("modelParam.style")}
        labelClass={labelClass}
        options={resolved.styles}
        currentValue={values.style}
        btnDefaultClass={btnDefaultClass}
        btnOutlineClass={btnOutlineClass}
        onSelect={handleStyleChange}
      />

      {resolved.showNegativePrompt && (
        <div className="space-y-2">
          <label htmlFor={negativePromptId} className={labelClass}>{t("modelParam.negativePrompt")}</label>
          <textarea
            id={negativePromptId}
            className={cn("textarea", textareaClass)}
            value={values.negativePrompt}
            onChange={handleNegativePromptChange}
            placeholder={t("modelParam.negativePromptPlaceholder")}
          />
        </div>
      )}

      {resolved.showSeed && (
        <div className="space-y-2">
          <label htmlFor={seedId} className={labelClass}>{t("modelParam.seed")}</label>
          <input
            id={seedId}
            type="number"
            className={cn("input", inputClass)}
            value={values.seed}
            onChange={handleSeedChange}
            placeholder={t("modelParam.seedPlaceholder")}
          />
        </div>
      )}

      {resolved.cfgScaleConfig && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor={cfgScaleId} className={labelClass}>{t("modelParam.cfgScale")}</label>
            <span className="text-sm text-muted-foreground">
              {values.cfgScale}
            </span>
          </div>
          <input
            id={cfgScaleId}
            type="range"
            className="slider"
            min={resolved.cfgScaleConfig.min}
            max={resolved.cfgScaleConfig.max}
            step={resolved.cfgScaleConfig.step}
            value={values.cfgScale}
            onChange={(e) => handleCfgScaleChange(Number(e.target.value))}
          />
        </div>
      )}

      {strategy && <RefStrategyInfo strategy={strategy} labelClass={labelClass} />}
    </div>
  );
}
