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
    <div className="card" style={{ padding: 16 }}>
      <div style={{ paddingBottom: 12 }}>
        <div style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <Eye size={20} />
          {t("plugin.previewExport")}
        </div>
        <div style={{ fontSize: 14, color: "var(--muted-fg)" }}>{t("plugin.previewExportDesc")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <textarea
          className="textarea"
          style={{ fontSize: 12, minHeight: 300, background: "var(--card2)", fontFamily: "monospace" }}
          value={generatedJson}
          readOnly
        />

        {validationResult && (
          <div style={{ padding: 12, borderRadius: 8, background: validationResult.valid ? "rgba(var(--success-rgb, 16, 185, 129), 0.1)" : "rgba(var(--destructive-rgb, 239, 68, 68), 0.1)", border: `1px solid ${validationResult.valid ? "var(--success)" : "var(--destructive)"}`, fontSize: 12, color: "var(--muted-fg)" }}>
            <div style={validationResult.valid ? { color: "var(--success)" } : undefined}>
              {validationResult.valid ? (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><CheckCircle size={16} /> {t("plugin.configValidationPassed")}</span>
              ) : (
                <span style={{ display: "flex", alignItems: "flex-start", gap: 4 }}><XCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} /> {validationResult.errors.join("; ")}</span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={onCopy}>
            <Copy size={16} style={{ marginRight: 4 }} />
            {t("plugin.copyToClipboard")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onValidate} disabled={isValidating}>
            {isValidating ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 4 }} /> : <CheckCircle size={16} style={{ marginRight: 4 }} />}
            {t("plugin.validate")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onDownload}>
            <Download size={16} style={{ marginRight: 4 }} />
            {t("plugin.downloadJson")}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onInstall} disabled={isInstalling}>
            {isInstalling ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 4 }} /> : <Upload size={16} style={{ marginRight: 4 }} />}
            {t("plugin.installPlugin")}
          </button>
        </div>
      </div>
    </div>
  );
}
