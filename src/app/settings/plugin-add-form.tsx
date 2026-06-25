import { useState, useRef } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { t } from "@/shared/constants";
import {
  Loader2,
  Upload,
  CheckCircle,
  XCircle,
  FileJson,
} from "lucide-react";
import { validatePluginConfig, addPlugin } from "./plugin-api";

interface PluginAddFormProps {
  onAdded: () => void;
  onCancel: () => void;
}

export function PluginAddForm({ onAdded, onCancel }: PluginAddFormProps) {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [jsonInput, setJsonInput] = useState("");
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleValidate = async () => {
    if (!jsonInput.trim()) return;
    setIsValidating(true);
    try {
      const parsed = JSON.parse(jsonInput);
      const result = await validatePluginConfig(parsed);
      setValidationResult(result);
    } catch (e) {
      setValidationResult({
        valid: false,
        errors: [t("plugin.jsonParseFailed", { error: e instanceof Error ? e.message : String(e) })],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleAdd = async () => {
    if (!jsonInput.trim()) return;
    setIsAdding(true);
    try {
      const parsed = JSON.parse(jsonInput);
      const result = await validatePluginConfig(parsed);
      if (!result.valid) {
        setValidationResult(result);
        showError(t("plugin.validateFailed"), result.errors.join("; "));
        return;
      }
      await addPlugin(parsed);
      showSuccess(t("success.added"), t("plugin.addedWithName", { name: parsed.displayName || parsed.id }));
      onAdded();
    } catch (e) {
      showError(t("plugin.addFailed"), mapUserFacingError(e));
    } finally {
      setIsAdding(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result !== "string") {
        showError(t("error.fileReadFailed"));
        return;
      }
      setJsonInput(result);
      setValidationResult(null);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ width: "100%", padding: 16, border: "1px solid var(--border)", borderRadius: 8, background: "var(--card2)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ padding: 12, borderRadius: 8, border: "1px solid var(--primary)", background: "rgba(var(--primary-rgb), 0.2)", borderColor: "var(--primary)" }}>
        <h4 style={{ fontWeight: 500, marginBottom: 8, color: "var(--primary)" }}>{t("plugin.addCustomPlugin")}</h4>
        <p style={{ fontSize: 14, color: "rgba(var(--primary-rgb), 0.8)" }}>
          {t("plugin.addCustomPluginDesc")}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>
          <FileJson size={16} style={{ marginRight: 4 }} />
          {t("plugin.uploadJsonFile")}
        </button>
        <span style={{ fontSize: 12, color: "var(--muted-fg)", alignSelf: "center" }}>{t("plugin.orPasteJson")}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label>{t("plugin.pluginConfigJson")}</label>
        <textarea
          className="textarea"
          style={{ fontSize: 12, minHeight: 200, fontFamily: "monospace" }}
          value={jsonInput}
          onChange={(e) => {
            setJsonInput(e.target.value);
            setValidationResult(null);
          }}
          placeholder='{"id": "my-provider", "version": "1.0.0", "displayName": "My Provider", ...}'
        />
      </div>

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

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleValidate} disabled={!jsonInput.trim() || isValidating}>
          {isValidating ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 4 }} /> : <CheckCircle size={16} style={{ marginRight: 4 }} />}
          {t("plugin.validateConfig")}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!jsonInput.trim() || isAdding}>
          {isAdding ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 4 }} /> : <Upload size={16} style={{ marginRight: 4 }} />}
          {t("plugin.addPluginBtn")}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
