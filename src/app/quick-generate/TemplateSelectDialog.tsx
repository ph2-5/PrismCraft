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
                  {t(category.nameKey)}
                </button>
              ))}
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {getTemplatesByCategory(selectedCategory).map((template) => (
                <div
                  key={template.id}
                  className="p-4 rounded-lg border border-primary/50 bg-card2 hover:bg-card cursor-pointer transition-all"
                  onClick={() => onApplyTemplate(template)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-primary flex items-center gap-2">
                        <Grid3x3 className="w-4 h-4 text-primary" />
                        {t(template.nameKey)}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t(template.descKey)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {t("quickGenerate.seconds", { count: template.duration })}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {t(template.categoryKey)}
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
