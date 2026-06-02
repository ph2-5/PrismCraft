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
import { Plus, Trash2, Settings2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginResponseFormatProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginResponseFormat({ state, updateField }: PluginResponseFormatProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings2 className="w-5 h-5" />
          {t("plugin.responseFormat")}
        </CardTitle>
        <CardDescription>{t("plugin.responseFormatDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("plugin.taskIdPath")} <span className="text-red-400">*</span></Label>
            <Input
              value={state.taskIdPath}
              onChange={(e) => updateField("taskIdPath", e.target.value)}
              placeholder="data.task_id"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("plugin.statusPath")} <span className="text-red-400">*</span></Label>
            <Input
              value={state.statusPath}
              onChange={(e) => updateField("statusPath", e.target.value)}
              placeholder="data.status"
              className="font-mono"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("plugin.videoUrlPath")}</Label>
            <Input
              value={state.videoUrlPath}
              onChange={(e) => updateField("videoUrlPath", e.target.value)}
              placeholder="data.video_url"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("plugin.imageUrlPath")}</Label>
            <Input
              value={state.imageUrlPath}
              onChange={(e) => updateField("imageUrlPath", e.target.value)}
              placeholder="data.image_url"
              className="font-mono"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("plugin.statusMapping")}</Label>
          <p className="text-xs text-muted-foreground">{t("plugin.statusMappingHint")}</p>
          {state.statusMapping.map((mapping) => (
            <div key={mapping._uid} className="flex items-center gap-2">
              <Input
                value={mapping.apiStatus}
                onChange={(e) => {
                  const statusMapping = state.statusMapping.map((m) =>
                    m._uid === mapping._uid ? { ...m, apiStatus: e.target.value } : m
                  );
                  updateField("statusMapping", statusMapping);
                }}
                placeholder={t("plugin.apiStatusPlaceholder")}
                className="font-mono h-9"
              />
              <span className="text-muted-foreground">→</span>
              <Select
                value={mapping.appStatus}
                onValueChange={(v) => {
                  const statusMapping = state.statusMapping.map((m) =>
                    m._uid === mapping._uid ? { ...m, appStatus: v ?? "pending" } : m
                  );
                  updateField("statusMapping", statusMapping);
                }}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder={t("plugin.appStatusPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("plugin.statusPending")}</SelectItem>
                  <SelectItem value="processing">{t("plugin.statusProcessing")}</SelectItem>
                  <SelectItem value="completed">{t("plugin.statusCompleted")}</SelectItem>
                  <SelectItem value="failed">{t("plugin.statusFailed")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-red-500"
                onClick={() => {
                  updateField("statusMapping", state.statusMapping.filter((m) => m._uid !== mapping._uid));
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
              updateField("statusMapping", [...state.statusMapping, { _uid: crypto.randomUUID(), apiStatus: "", appStatus: "pending" }]);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("plugin.addStatusMapping")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
