import { useRef } from "react";
import { Settings, ChevronDown, ChevronUp, X, Film, Trash2 } from "lucide-react";
import { t } from "@/shared/constants";
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
  const refImageUploadRef = useRef<HTMLInputElement>(null);
  const refVideoUploadRef = useRef<HTMLInputElement>(null);
  return (
    <div className="card !p-0">
      <div
        className="cursor-pointer p-4"
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
          <div className="text-base font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5 text-muted-foreground" />
            {t("quickGenerate.advancedSettings")}
          </div>
          {showAdvanced ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </div>
      {showAdvanced && (
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-muted-foreground">{t("quickGenerate.smartOptimization")}</label>
              <p className="text-sm text-muted-foreground">
                {t("quickGenerate.smartOptimizationDesc")}
              </p>
            </div>
            <button
              type="button"
              className={`toggle ${enableSmartOptimization ? "on" : ""}`}
              aria-label={t("quickGenerate.smartOptimization")}
              aria-pressed={enableSmartOptimization}
              onClick={() => onSmartOptimizationChange(!enableSmartOptimization)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-muted-foreground">{t("quickGenerate.negativePrompt")}</label>
            <textarea
              className="textarea !text-xs"
              value={negativePrompt}
              onChange={(e) => onNegativePromptChange(e.target.value)}
              placeholder={t("quickGenerate.negativePromptPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <label className="text-muted-foreground">{t("quickGenerate.referenceImage")}</label>
            {referenceImage ? (
              <div className="relative inline-block">
                <img
                  src={referenceImage}
                  alt={t("quickGenerate.reference")}
                  className="w-32 h-32 rounded-lg object-cover border border-border"
                />
                <button
                  type="button"
                  className="btn btn-danger btn-sm absolute -top-2 -right-2 w-6 h-6 !p-0 !rounded-full"
                  onClick={() => onReferenceImageChange(null)}
                  aria-label={t("quickGenerate.removeReferenceImage")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground text-sm mb-2">
                  {t("quickGenerate.clickUploadRefImage")}
                </p>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="ref-image-upload"
                  ref={refImageUploadRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const result = event.target?.result;
                        if (typeof result === "string") {
                          onReferenceImageChange(result);
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => refImageUploadRef.current?.click()}
                >
                  {t("quickGenerate.selectImage")}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-muted-foreground flex items-center gap-2">
              <Film className="w-4 h-4" />
              {t("quickGenerate.referenceVideoOptional")}
            </label>
            {referenceVideo ? (
              <div className="relative">
                <video
                  src={referenceVideo}
                  controls
                  className="w-full max-h-48 rounded-lg border border-border"
                  onError={createSimpleVideoErrorHandler()}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-muted-foreground">
                    {referenceVideoName}
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={onRemoveReferenceVideo}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {t("quickGenerate.remove")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground text-sm mb-2">
                  {t("quickGenerate.uploadRefVideoDesc")}
                </p>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  id="ref-video-upload"
                  ref={refVideoUploadRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUploadReferenceVideo(file);
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => refVideoUploadRef.current?.click()}
                >
                  <Film className="w-4 h-4 mr-2" />
                  {t("quickGenerate.selectVideo")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
