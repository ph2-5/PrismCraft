import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { Plus, Trash2, Globe } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginUrlRulesProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginUrlRules({ state, updateField }: PluginUrlRulesProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="w-5 h-5" />
          {t("plugin.urlRules")}
        </CardTitle>
        <CardDescription>{t("plugin.urlRulesDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("plugin.matchMode")}</Label>
          <Select
            value={state.matchMode}
            onValueChange={(v) => updateField("matchMode", v as WizardState["matchMode"])}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">{t("plugin.matchContains")}</SelectItem>
              <SelectItem value="prefix">{t("plugin.matchPrefix")}</SelectItem>
              <SelectItem value="regex">{t("plugin.matchRegex")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("plugin.matchModeHint")}</p>
        </div>
        {state.apiUrlPatterns.map((pattern) => (
          <div key={pattern._uid} className="flex items-center gap-2">
            <Input
              value={pattern.pattern}
              onChange={(e) => {
                const patterns = state.apiUrlPatterns.map((p) =>
                  p._uid === pattern._uid ? { ...p, pattern: e.target.value } : p
                );
                updateField("apiUrlPatterns", patterns);
              }}
              placeholder="api.example.com"
              className="font-mono"
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-red-500 hover:text-red-400"
              onClick={() => {
                updateField(
                  "apiUrlPatterns",
                  state.apiUrlPatterns.filter((p) => p._uid !== pattern._uid)
                );
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            updateField("apiUrlPatterns", [
              ...state.apiUrlPatterns,
              { _uid: crypto.randomUUID(), pattern: "", type: state.matchMode },
            ]);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("plugin.addUrlPattern")}
        </Button>
        {state.apiUrlPatterns.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("plugin.urlPatternRequired")}</p>
        )}
      </CardContent>
    </Card>
  );
}
