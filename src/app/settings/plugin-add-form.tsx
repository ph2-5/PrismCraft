import { useState, useRef } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Label } from "@/shared/ui/label";
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
      showError(t("plugin.addFailed"), e instanceof Error ? e.message : t("plugin.addError"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonInput(content);
      setValidationResult(null);
    };
    reader.readAsText(file);
  };

  return (
    <div className="w-full p-4 border rounded-lg bg-slate-800/50 space-y-4">
      <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-800">
        <h4 className="font-medium text-blue-300 mb-2">{t("plugin.addCustomPlugin")}</h4>
        <p className="text-sm text-blue-300/80">
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
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <FileJson className="h-4 w-4 mr-1" />
          {t("plugin.uploadJsonFile")}
        </Button>
        <span className="text-xs text-muted-foreground self-center">{t("plugin.orPasteJson")}</span>
      </div>

      <div className="space-y-2">
        <Label>{t("plugin.pluginConfigJson")}</Label>
        <Textarea
          value={jsonInput}
          onChange={(e) => {
            setJsonInput(e.target.value);
            setValidationResult(null);
          }}
          placeholder='{"id": "my-provider", "version": "1.0.0", "displayName": "My Provider", ...}'
          className="font-mono text-xs min-h-[200px]"
        />
      </div>

      {validationResult && (
        <Alert variant={validationResult.valid ? "default" : "destructive"} className={validationResult.valid ? "bg-green-900/20 border-green-800" : ""}>
          <AlertDescription className={validationResult.valid ? "text-green-700" : ""}>
            {validationResult.valid ? (
              <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4" /> {t("plugin.configValidationPassed")}</span>
            ) : (
              <span className="flex items-start gap-1"><XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {validationResult.errors.join("; ")}</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleValidate} disabled={!jsonInput.trim() || isValidating}>
          {isValidating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
          {t("plugin.validateConfig")}
        </Button>
        <Button onClick={handleAdd} disabled={!jsonInput.trim() || isAdding}>
          {isAdding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
          {t("plugin.addPluginBtn")}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
