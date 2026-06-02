import { t } from "@/shared/constants/messages";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

interface VariantGeneratorProps {
  typeLabel: string;
  variantCount: number;
  onVariantCountChange: (count: number) => void;
  selectedStyle: string;
  onSelectedStyleChange: (style: string) => void;
  styleOptions: string[];
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
        <Label>{t("batch.variantCountLabel", { type: typeLabel })}</Label>
        <Input
          type="number"
          min={1}
          max={10}
          value={variantCount}
          onChange={(e) => onVariantCountChange(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 10))}
          disabled={isGenerating}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("batch.styleOptional")}</Label>
        <Select
          value={selectedStyle}
          onValueChange={(value) => onSelectedStyleChange(value || "")}
          disabled={isGenerating}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("batch.autoSelect")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("batch.autoSelect")}</SelectItem>
            {styleOptions.map((style) => (
              <SelectItem key={style} value={style}>
                {style}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
