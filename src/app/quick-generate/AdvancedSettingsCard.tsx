import { Settings, ChevronDown, ChevronUp, X, Film, Trash2 } from "lucide-react";
import { t } from "@/shared/constants";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { createSimpleVideoErrorHandler } from "@/shared/utils/media-error-handler";

interface AdvancedSettingsCardProps {
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  enableSmartOptimization: boolean;
  onSmartOptimizationChange: (val: boolean) => void;
  negativePrompt: string;
  onNegativePromptChange: (val: string) => void;
  referenceImage: string | null;
  onReferenceImageChange: (val: string | null) => void;
  referenceVideo: string | null;
  referenceVideoName: string | null;
  onUploadReferenceVideo: (file: File) => void;
  onRemoveReferenceVideo: () => void;
}

export function AdvancedSettingsCard({
  showAdvanced,
  onToggleAdvanced,
  enableSmartOptimization,
  onSmartOptimizationChange,
  negativePrompt,
  onNegativePromptChange,
  referenceImage,
  onReferenceImageChange,
  referenceVideo,
  referenceVideoName,
  onUploadReferenceVideo,
  onRemoveReferenceVideo,
}: AdvancedSettingsCardProps) {
  return (
    <Card className="border border-slate-800 bg-slate-900/60">
      <CardHeader
        className="cursor-pointer"
        onClick={onToggleAdvanced}
        role="button"
        tabIndex={0}
        aria-expanded={showAdvanced}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleAdvanced();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-400" />
            {t("quickGenerate.advancedSettings")}
          </CardTitle>
          {showAdvanced ? (
            <ChevronUp className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-500" />
          )}
        </div>
      </CardHeader>
      {showAdvanced && (
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-slate-300">{t("quickGenerate.smartOptimization")}</Label>
              <p className="text-sm text-slate-500">
                {t("quickGenerate.smartOptimizationDesc")}
              </p>
            </div>
            <Switch
              checked={enableSmartOptimization}
              onCheckedChange={onSmartOptimizationChange}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">{t("quickGenerate.negativePrompt")}</Label>
            <Textarea
              value={negativePrompt}
              onChange={(e) => onNegativePromptChange(e.target.value)}
              placeholder={t("quickGenerate.negativePromptPlaceholder")}
              className="bg-slate-800 border-slate-700 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">{t("quickGenerate.referenceImage")}</Label>
            {referenceImage ? (
              <div className="relative inline-block">
                <img
                  src={referenceImage}
                  alt={t("quickGenerate.reference")}
                  className="w-32 h-32 rounded-lg object-cover border border-slate-700"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute -top-2 -right-2 w-6 h-6 p-0 rounded-full"
                  onClick={() => onReferenceImageChange(null)}
                  aria-label={t("quickGenerate.removeReferenceImage")}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-500 text-sm mb-2">
                  {t("quickGenerate.clickUploadRefImage")}
                </p>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="ref-image-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        onReferenceImageChange(
                          event.target?.result as string,
                        );
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    document.getElementById("ref-image-upload")?.click()
                  }
                >
                  {t("quickGenerate.selectImage")}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-2">
              <Film className="w-4 h-4" />
              {t("quickGenerate.referenceVideoOptional")}
            </Label>
            {referenceVideo ? (
              <div className="relative">
                <video
                  src={referenceVideo}
                  controls
                  className="w-full max-h-48 rounded-lg border border-slate-700"
                  onError={createSimpleVideoErrorHandler()}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-slate-400">
                    {referenceVideoName}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onRemoveReferenceVideo}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {t("quickGenerate.remove")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-500 text-sm mb-2">
                  {t("quickGenerate.uploadRefVideoDesc")}
                </p>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  id="ref-video-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUploadReferenceVideo(file);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    document.getElementById("ref-video-upload")?.click()
                  }
                >
                  <Film className="w-4 h-4 mr-2" />
                  {t("quickGenerate.selectVideo")}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
