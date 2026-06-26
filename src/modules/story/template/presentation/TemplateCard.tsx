import { useState, memo } from "react";
import {
  Download,
  Trash2,
  FileText,
  Film,
  Clock,
  Tag,
} from "lucide-react";
import type { StoryboardTemplate } from "@/modules/story";
import { t } from "@/shared/constants";

const TEMPLATE_CATEGORIES = [
  { value: "custom", label: () => t("template.categoryCustom") },
  { value: "film", label: () => t("template.categoryFilm") },
  { value: "animation", label: () => t("template.categoryAnimation") },
  { value: "commercial", label: () => t("template.categoryCommercial") },
  { value: "documentary", label: () => t("template.categoryDocumentary") },
  { value: "music-video", label: () => t("template.categoryMusicVideo") },
  { value: "other", label: () => t("template.categoryOther") },
];

interface TemplateCardProps {
  template: StoryboardTemplate;
  onApply: (template: StoryboardTemplate) => void;
  onExport: (template: StoryboardTemplate) => void;
  onDelete: (id: string) => void;
}

export const TemplateCard = memo(function TemplateCard({
  template,
  onApply,
  onExport,
  onDelete,
}: TemplateCardProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg p-4 hover:border-primary transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium" style={{ color: "var(--muted-fg)" }}>
            {template.name}
          </h3>
          {template.description && (
            <p className="text-sm mt-1" style={{ color: "var(--muted-fg)" }}>
              {template.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: "var(--muted-fg)" }}>
            <span className="flex items-center gap-1">
              <Film size={12} />
              {t("template.beatsCount", { count: template.beats.length })}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {t("template.seconds", { count: template.totalDuration })}
            </span>
            {template.category && (
              <span className="flex items-center gap-1">
                <Tag size={12} />
                {TEMPLATE_CATEGORIES.find(
                  (c) => c.value === template.category,
                )?.label() || template.category}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title={t("template.preview")}
          >
            <FileText size={16} />
          </button>
          <button
            onClick={() => onApply(template)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary-hover"
          >
            {t("template.apply")}
          </button>
          <button
            onClick={() => onExport(template)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-success"
            title={t("template.export")}
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
            title={t("common.delete")}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {isPreviewOpen && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="space-y-2">
            {template.beats.map((beat, i) => (
              <div
                key={`${beat.title}-${i}`}
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--muted-fg)" }}
              >
                <span className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium" style={{ background: "var(--muted)" }}>
                  {i + 1}
                </span>
                <span className="font-medium">{beat.title || t("template.unnamed")}</span>
                <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                  {t("template.seconds", { count: beat.duration })}
                </span>
                {beat.shotType && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(var(--primary-rgb), 0.1)", color: "var(--primary)" }}>
                    {beat.shotType}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
