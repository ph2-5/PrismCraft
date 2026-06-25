import { useState } from "react";
import { LayoutTemplate, Grid3x3 } from "lucide-react";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";
import {
  templateCategories,
  getTemplatesByCategory,
  type VideoTemplate,
} from "@/modules/video";

interface TemplateSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyTemplate: (template: VideoTemplate) => void;
}

export function TemplateSelectDialog({
  open,
  onOpenChange,
  onApplyTemplate,
}: TemplateSelectDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      ariaLabel={t("quickGenerate.selectVideoTemplate")}
      style={{ maxWidth: "48rem" }}
    >
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 16,
            fontWeight: 600,
            color: "var(--fg)",
          }}
        >
          <LayoutTemplate className="w-5 h-5" />
          {t("quickGenerate.selectVideoTemplate")}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--muted-fg)",
            marginTop: 4,
          }}
        >
          {t("quickGenerate.selectTemplateDesc")}
        </div>
      </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {templateCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`btn btn-sm ${
                    selectedCategory === category.id
                      ? "btn-primary"
                      : "btn-outline"
                  }`}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {getTemplatesByCategory(selectedCategory).map((template) => (
                <div
                  key={template.id}
                  className="p-4 rounded-lg border border-purple-700/50 bg-slate-900/50 hover:bg-slate-900 cursor-pointer transition-all"
                  onClick={() => onApplyTemplate(template)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-purple-100 flex items-center gap-2">
                        <Grid3x3 className="w-4 h-4 text-purple-400" />
                        {template.name}
                      </h3>
                      <p className="text-sm text-purple-300 mt-1">
                        {template.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                        {t("quickGenerate.seconds", { count: template.duration })}
                      </span>
                      <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                        {template.style}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </button>
            </div>
    </Modal>
  );
}
