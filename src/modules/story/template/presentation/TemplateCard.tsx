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
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            {template.name}
          </h3>
          {template.description && (
            <p className="text-sm text-gray-500 mt-1">
              {template.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
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
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
            title={t("template.preview")}
          >
            <FileText size={16} />
          </button>
          <button
            onClick={() => onApply(template)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600"
          >
            {t("template.apply")}
          </button>
          <button
            onClick={() => onExport(template)}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-green-600"
            title={t("template.export")}
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-600"
            title={t("common.delete")}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {isPreviewOpen && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="space-y-2">
            {template.beats.map((beat, i) => (
              <div
                key={`${beat.title}-${i}`}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium">
                  {i + 1}
                </span>
                <span className="font-medium">{beat.title || t("template.unnamed")}</span>
                <span className="text-xs text-gray-400">
                  {t("template.seconds", { count: beat.duration })}
                </span>
                {beat.shotType && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
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
