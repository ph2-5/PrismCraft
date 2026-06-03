import { useState } from "react";
import { LayoutTemplate, Grid3x3 } from "lucide-react";
import { t } from "@/shared/constants";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-slate-800 border-purple-700 text-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-100">
            <LayoutTemplate className="w-5 h-5" />
            {t("quickGenerate.selectVideoTemplate")}
          </DialogTitle>
          <DialogDescription className="text-purple-300">
            {t("quickGenerate.selectTemplateDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 mb-4">
          {templateCategories.map((category) => (
            <Button
              key={category.id}
              variant={
                selectedCategory === category.id ? "default" : "outline"
              }
              size="sm"
              onClick={() => setSelectedCategory(category.id)}
              className={
                selectedCategory === category.id
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "border-slate-700 text-slate-300 hover:border-purple-600 hover:bg-purple-900/20"
              }
            >
              {category.name}
            </Button>
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-purple-700 text-purple-200"
          >
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
