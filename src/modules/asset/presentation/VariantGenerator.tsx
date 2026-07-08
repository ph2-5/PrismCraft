import { t } from "@/shared/constants/messages";
import type { StyleOption } from "@/modules/character";

interface VariantGeneratorProps {
  typeLabel: string;
  variantCount: number;
  onVariantCountChange: (count: number) => void;
  selectedStyle: string;
  onSelectedStyleChange: (style: string) => void;
  styleOptions: readonly StyleOption[];
  isGenerating: boolean;
}

export function VariantGenerator({
  typeLabel,
  variantCount,
  onVariantCountChange,
  selectedStyle,
  onSelectedStyleChange,
  styleOptions,
  isGenerating,
}: VariantGeneratorProps) {
  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
      <div className="space-y-2">
        <label>{t("batch.variantCountLabel", { type: typeLabel })}</label>
        <input
          className="input"
          type="number"
          aria-label={t("batch.variantCountLabel", { type: typeLabel })}
          min={1}
          max={10}
          value={variantCount}
          onChange={(e) => onVariantCountChange(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 10))}
          disabled={isGenerating}
        />
      </div>
      <div className="space-y-2">
        <label>{t("batch.styleOptional")}</label>
        <select
          className="select"
          aria-label={t("batch.styleOptional")}
          value={selectedStyle}
          onChange={(e) => onSelectedStyleChange(e.target.value)}
          disabled={isGenerating}
        >
          <option value="">{t("batch.autoSelect")}</option>
          {styleOptions.map((style) => (
            <option key={style.value} value={style.value}>
              {t(style.labelKey)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
