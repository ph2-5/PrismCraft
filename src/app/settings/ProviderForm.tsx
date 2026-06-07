import { useMemo } from "react";
import { t } from "@/shared/constants";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Puzzle,
  Code,
} from "lucide-react";
import {
  type ApiCapability,
  getAllTemplates,
  type PluginProviderTemplate,
} from "@/infrastructure/api-config-facade";

interface CapabilityItem {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

interface ProviderFormProps {
  newProviderKey: string;
  onKeyChange: (value: string) => void;
  newProviderName: string;
  onNameChange: (value: string) => void;
  selectedTemplate: string;
  onTemplateChange: (value: string) => void;
  isAdding: boolean;
  keyValidation: { valid: boolean; error?: string };
  detectedInfo: {
    templateId: string;
    confidence: "high" | "medium" | "low";
    suggestedName: string;
    baseUrl?: string;
    isPlugin?: boolean;
    pluginId?: string;
  } | null;
  onAdd: () => void;
  onCancel: () => void;
  capabilities: CapabilityItem[];
}

function isPluginTemplate(template: unknown): template is PluginProviderTemplate {
  return typeof template === "object" && template !== null && "pluginId" in template;
}

export function ProviderForm({
  newProviderKey,
  onKeyChange,
  newProviderName,
  onNameChange,
  selectedTemplate,
  onTemplateChange,
  isAdding,
  keyValidation,
  detectedInfo,
  onAdd,
  onCancel,
  capabilities,
}: ProviderFormProps) {
  const templateGroups = useMemo(() => {
    const all = getAllTemplates();
    const builtin: { id: string; name: string }[] = [];
    const pluginDeclarative: { id: string; name: string }[] = [];
    const pluginCode: { id: string; name: string }[] = [];

    for (const [id, template] of Object.entries(all)) {
      if (isPluginTemplate(template)) {
        if (template.isCodePlugin) {
          pluginCode.push({ id, name: template.name });
        } else {
          pluginDeclarative.push({ id, name: template.name });
        }
      } else {
        builtin.push({ id, name: template.name });
      }
    }

    return { builtin, pluginDeclarative, pluginCode };
  }, []);

  return (
    <div className="p-4 border rounded-lg bg-slate-800/50 space-y-4">
      <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-800">
        <h4 className="font-medium text-blue-300 mb-2">
          {t("provider.addProviderSteps")}
        </h4>
        <ol className="list-decimal list-inside text-sm text-blue-300 space-y-1">
          <li>{t("provider.step1")}</li>
          <li>{t("provider.step2")}</li>
          <li>{t("provider.step3")}</li>
          <li>{t("provider.step4")}</li>
          <li>{t("provider.step5")}</li>
        </ol>
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiKey">
          {t("provider.apiKey")} <span className="text-red-500">*</span>
        </Label>
        <Input
          id="apiKey"
          type="password"
          placeholder={t("provider.apiKeyPlaceholder")}
          value={newProviderKey}
          onChange={(e) => onKeyChange(e.target.value)}
        />
        {newProviderKey && (
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {keyValidation.valid ? (
              <>
                {detectedInfo ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>{t("provider.detected", { name: detectedInfo.suggestedName })}</span>
                    <Badge
                      variant={
                        detectedInfo.confidence === "high"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {detectedInfo.confidence === "high"
                        ? t("provider.highConfidence")
                        : t("provider.mediumConfidence")}
                    </Badge>
                    {detectedInfo.isPlugin && (
                      <Badge variant="outline" className="text-xs border-purple-500 text-purple-400">
                        <Puzzle className="h-3 w-3 mr-1" />
                        {t("plugin.detectedAsPlugin", { name: detectedInfo.suggestedName })}
                      </Badge>
                    )}
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <span className="text-yellow-600">
                      {t("provider.cannotAutoDetect")}
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-red-500">
                  {keyValidation.error}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {newProviderKey && !detectedInfo && (
        <div className="space-y-2">
          <Label>
            {t("provider.selectProvider")} <span className="text-red-500">*</span>
          </Label>
          <Select
            value={selectedTemplate}
            onValueChange={(val) => onTemplateChange(val || "")}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("provider.selectProviderPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {templateGroups.builtin.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {t("plugin.builtin")}
                  </div>
                  {templateGroups.builtin.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </>
              )}
              {templateGroups.pluginDeclarative.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-purple-400 flex items-center gap-1 mt-1">
                    <Puzzle className="h-3 w-3" />
                    {t("plugin.declarative")}
                  </div>
                  {templateGroups.pluginDeclarative.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                      <Badge variant="outline" className="ml-2 text-xs border-purple-500 text-purple-400">
                        {t("plugin.pluginTag")}
                      </Badge>
                    </SelectItem>
                  ))}
                </>
              )}
              {templateGroups.pluginCode.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-orange-400 flex items-center gap-1 mt-1">
                    <Code className="h-3 w-3" />
                    {t("plugin.codePlugin")}
                  </div>
                  {templateGroups.pluginCode.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                      <Badge variant="outline" className="ml-2 text-xs border-orange-500 text-orange-400">
                        {t("plugin.codePluginTag")}
                      </Badge>
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="providerName">{t("provider.displayNameOptional")}</Label>
        <Input
          id="providerName"
          placeholder={detectedInfo?.suggestedName || t("provider.displayNamePlaceholder")}
          value={newProviderName}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <p className="text-xs text-gray-500">
          {t("provider.displayNameHint")}
        </p>
      </div>

      <div className="bg-slate-700/50 p-3 rounded-lg">
        <h4 className="font-medium text-slate-300 mb-2">
          {t("provider.supportedFeatures")}
        </h4>
        <div className="flex flex-wrap gap-2">
          {capabilities.map((cap) => (
            <Badge
              key={cap.id}
              variant="secondary"
              className="text-xs"
            >
              {cap.icon}
              <span className="ml-1">{cap.name}</span>
            </Badge>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {t("provider.afterAddHint")}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={onAdd}
          disabled={!keyValidation.valid || isAdding}
          className="flex-1"
        >
          {isAdding ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          {t("provider.addProvider")}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
