import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Label } from "@/shared/ui/label";
import { Wand2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginBasicInfoProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginBasicInfo({ state, updateField }: PluginBasicInfoProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wand2 className="w-5 h-5" />
          {t("plugin.basicInfo")}
        </CardTitle>
        <CardDescription>{t("plugin.basicInfoDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("plugin.pluginId")} <span className="text-red-400">*</span></Label>
          <Input
            value={state.id}
            onChange={(e) => updateField("id", e.target.value)}
            placeholder="my-provider"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">{t("plugin.pluginIdHint")}</p>
          {state.id && !/^[a-z][a-z0-9-]*$/.test(state.id) && (
            <p className="text-xs text-red-400">{t("plugin.pluginIdInvalid")}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>{t("plugin.displayName")} <span className="text-red-400">*</span></Label>
          <Input
            value={state.displayName}
            onChange={(e) => updateField("displayName", e.target.value)}
            placeholder="My AI Provider"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("plugin.version")}</Label>
          <Input
            value={state.version}
            onChange={(e) => updateField("version", e.target.value)}
            placeholder="1.0.0"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("plugin.description")}</Label>
          <Textarea
            value={state.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder={t("plugin.descriptionPlaceholder")}
            className="min-h-[80px]"
          />
        </div>
      </CardContent>
    </Card>
  );
}
