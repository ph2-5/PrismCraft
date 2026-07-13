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
    <div className="w-full p-4 border border-border rounded-lg bg-card2 flex flex-col gap-4">
      <div className="plugin-primary-box">
        <h4 className="font-medium mb-2 text-primary">{t("plugin.addCustomPlugin")}</h4>
        <p className="text-sm text-[rgba(var(--primary-rgb),0.8)]">
          {t("plugin.addCustomPluginDesc")}
        </p>
      </div>

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileUpload}
        />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>
          <FileJson size={16} className="mr-1" />
          {t("plugin.uploadJsonFile")}
        </button>
        <span className="text-xs text-muted-foreground self-center">{t("plugin.orPasteJson")}</span>
      </div>

      <div className="flex flex-col gap-2">
        <label>{t("plugin.pluginConfigJson")}</label>
        <textarea
          className="textarea !font-mono min-h-[200px]"
          value={jsonInput}
          onChange={(e) => {
            setJsonInput(e.target.value);
            setValidationResult(null);
          }}
          placeholder='{"id": "my-provider", "version": "1.0.0", "displayName": "My Provider", ...}'
        />
      </div>

      {validationResult && (
        <div className={`validation-result ${validationResult.valid ? "valid" : "invalid"}`}>
          <div className={validationResult.valid ? "text-success" : undefined}>
            {validationResult.valid ? (
              <span className="flex items-center gap-1"><CheckCircle size={16} /> {t("plugin.configValidationPassed")}</span>
            ) : (
              <span className="flex items-start gap-1"><XCircle size={16} className="mt-0.5 shrink-0" /> {validationResult.errors.join("; ")}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={handleValidate} disabled={!jsonInput.trim() || isValidating}>
          {isValidating ? <Loader2 size={16} className="animate-spin mr-1" /> : <CheckCircle size={16} className="mr-1" />}
          {t("plugin.validateConfig")}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!jsonInput.trim() || isAdding}>
          {isAdding ? <Loader2 size={16} className="animate-spin mr-1" /> : <Upload size={16} className="mr-1" />}
          {t("plugin.addPluginBtn")}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
