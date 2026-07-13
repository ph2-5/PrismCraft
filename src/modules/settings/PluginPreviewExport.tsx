import { CheckCircle, XCircle, Copy, Download, Upload, Loader2, Eye } from "lucide-react";
import { t } from "@/shared/constants";

interface PluginPreviewExportProps {
  generatedJson: string;
  validationResult: { valid: boolean; errors: string[] } | null;
  isValidating: boolean;
  isInstalling: boolean;
  onValidate: () => void;
  onInstall: () => void;
  onCopy: () => void;
  onDownload: () => void;
}

export function PluginPreviewExport({
  generatedJson,
  validationResult,
  isValidating,
  isInstalling,
  onValidate,
  onInstall,
  onCopy,
  onDownload,
}: PluginPreviewExportProps) {
  return (
    <div className="card">
      <div className="pb-3">
        <div className="text-lg flex items-center gap-2 font-semibold">
          <Eye size={20} />
          {t("plugin.previewExport")}
        </div>
        <div className="text-sm text-muted-foreground">{t("plugin.previewExportDesc")}</div>
      </div>
      <div className="flex flex-col gap-4">
        <textarea
          className="textarea min-h-[300px] !font-mono"
          value={generatedJson}
          readOnly
        />

        {validationResult && (
          <div className={`validation-result ${validationResult.valid ? "valid" : "invalid"}`}>
            <div className={validationResult.valid ? "text-success" : ""}>
              {validationResult.valid ? (
                <span className="flex items-center gap-1"><CheckCircle size={16} /> {t("plugin.configValidationPassed")}</span>
              ) : (
                <span className="flex items-start gap-1"><XCircle size={16} className="mt-0.5 shrink-0" /> {validationResult.errors.join("; ")}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn btn-outline btn-sm" onClick={onCopy}>
            <Copy size={16} className="mr-1" />
            {t("plugin.copyToClipboard")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onValidate} disabled={isValidating}>
            {isValidating ? <Loader2 size={16} className="animate-spin mr-1" /> : <CheckCircle size={16} className="mr-1" />}
            {t("plugin.validate")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onDownload}>
            <Download size={16} className="mr-1" />
            {t("plugin.downloadJson")}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onInstall} disabled={isInstalling}>
            {isInstalling ? <Loader2 size={16} className="animate-spin mr-1" /> : <Upload size={16} className="mr-1" />}
            {t("plugin.installPlugin")}
          </button>
        </div>
      </div>
    </div>
  );
}
