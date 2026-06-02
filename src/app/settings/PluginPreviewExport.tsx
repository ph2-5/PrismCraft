import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Textarea } from "@/shared/ui/textarea";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Eye className="w-5 h-5" />
          {t("plugin.previewExport")}
        </CardTitle>
        <CardDescription>{t("plugin.previewExportDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={generatedJson}
          readOnly
          className="font-mono text-xs min-h-[300px] bg-slate-900"
        />

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

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={onCopy}>
            <Copy className="h-4 w-4 mr-1" />
            {t("plugin.copyToClipboard")}
          </Button>
          <Button variant="outline" onClick={onValidate} disabled={isValidating}>
            {isValidating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
            {t("plugin.validate")}
          </Button>
          <Button variant="outline" onClick={onDownload}>
            <Download className="h-4 w-4 mr-1" />
            {t("plugin.downloadJson")}
          </Button>
          <Button onClick={onInstall} disabled={isInstalling}>
            {isInstalling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            {t("plugin.installPlugin")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
