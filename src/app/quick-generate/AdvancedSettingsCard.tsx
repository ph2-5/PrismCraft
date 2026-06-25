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
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{ cursor: "pointer", padding: 16 }}
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
          <div className="text-lg flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Settings className="w-5 h-5 text-slate-400" />
            {t("quickGenerate.advancedSettings")}
          </div>
          {showAdvanced ? (
            <ChevronUp className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-500" />
          )}
        </div>
      </div>
      {showAdvanced && (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-slate-300">{t("quickGenerate.smartOptimization")}</label>
              <p className="text-sm text-slate-500">
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
            <label className="text-slate-300">{t("quickGenerate.negativePrompt")}</label>
            <textarea
              className="textarea"
              style={{ fontSize: 12 }}
              value={negativePrompt}
              onChange={(e) => onNegativePromptChange(e.target.value)}
              placeholder={t("quickGenerate.negativePromptPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <label className="text-slate-300">{t("quickGenerate.referenceImage")}</label>
            {referenceImage ? (
              <div className="relative inline-block">
                <img
                  src={referenceImage}
                  alt={t("quickGenerate.reference")}
                  className="w-32 h-32 rounded-lg object-cover border border-slate-700"
                />
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, padding: 0, borderRadius: "50%" }}
                  onClick={() => onReferenceImageChange(null)}
                  aria-label={t("quickGenerate.removeReferenceImage")}
                >
                  <X className="w-4 h-4" />
                </button>
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
            <label className="text-slate-300 flex items-center gap-2">
              <Film className="w-4 h-4" />
              {t("quickGenerate.referenceVideoOptional")}
            </label>
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
              <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-500 text-sm mb-2">
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
