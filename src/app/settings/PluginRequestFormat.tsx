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
import { Plus, Trash2, FileCode } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginRequestFormatProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginRequestFormat({ state, updateField }: PluginRequestFormatProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileCode className="w-5 h-5" />
          {t("plugin.requestFormat")}
        </CardTitle>
        <CardDescription>{t("plugin.requestFormatDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-b pb-4 space-y-3">
          <h4 className="text-sm font-medium">{t("plugin.apiEndpoints")}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.videoGenerate")} <span className="text-red-400">*</span></Label>
              <Input
                value={state.videoGenerateEndpoint}
                onChange={(e) => updateField("videoGenerateEndpoint", e.target.value)}
                placeholder="/v1/videos/generations"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.videoStatusQuery")} <span className="text-red-400">*</span></Label>
              <Input
                value={state.videoStatusEndpoint}
                onChange={(e) => updateField("videoStatusEndpoint", e.target.value)}
                placeholder="/v1/videos/{taskId}"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.imageGenerate")}</Label>
              <Input
                value={state.imageGenerateEndpoint}
                onChange={(e) => updateField("imageGenerateEndpoint", e.target.value)}
                placeholder="/v1/images/generations"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.textGenerate")}</Label>
              <Input
                value={state.textGenerateEndpoint}
                onChange={(e) => updateField("textGenerateEndpoint", e.target.value)}
                placeholder="/v1/chat/completions"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.visionAnalyze")}</Label>
              <Input
                value={state.visionGenerateEndpoint}
                onChange={(e) => updateField("visionGenerateEndpoint", e.target.value)}
                placeholder="/v1/chat/completions"
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("plugin.bodyFormat")}</Label>
          <Select
            value={state.bodyFormat}
            onValueChange={(v) => updateField("bodyFormat", v as WizardState["bodyFormat"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai-content">{t("plugin.bodyFormatOpenai")}</SelectItem>
              <SelectItem value="flat">{t("plugin.bodyFormatFlat")}</SelectItem>
              <SelectItem value="dashscope">{t("plugin.bodyFormatDashscope")}</SelectItem>
              <SelectItem value="custom">{t("plugin.authCustom")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("plugin.promptFieldName")}</Label>
            <Input
              value={state.promptField}
              onChange={(e) => updateField("promptField", e.target.value)}
              placeholder="prompt"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("plugin.modelFieldName")}</Label>
            <Input
              value={state.modelField}
              onChange={(e) => updateField("modelField", e.target.value)}
              placeholder="model"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("plugin.durationFieldName")}</Label>
            <Input
              value={state.durationField}
              onChange={(e) => updateField("durationField", e.target.value)}
              placeholder="duration"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("plugin.firstFrameFieldName")}</Label>
            <Input
              value={state.firstFrameField}
              onChange={(e) => updateField("firstFrameField", e.target.value)}
              placeholder="image_url"
              className="font-mono"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("plugin.extraFields")}</Label>
          {state.extraFields.map((field) => (
            <div key={field._uid} className="flex items-center gap-2">
              <Input
                value={field.key}
                onChange={(e) => {
                  const extraFields = state.extraFields.map((f) =>
                    f._uid === field._uid ? { ...f, key: e.target.value } : f
                  );
                  updateField("extraFields", extraFields);
                }}
                placeholder={t("plugin.fieldNamePlaceholder")}
                className="font-mono h-9"
              />
              <Input
                value={field.value}
                onChange={(e) => {
                  const extraFields = state.extraFields.map((f) =>
                    f._uid === field._uid ? { ...f, value: e.target.value } : f
                  );
                  updateField("extraFields", extraFields);
                }}
                placeholder={t("plugin.fieldValuePlaceholder")}
                className="h-9"
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-red-500"
                onClick={() => {
                  updateField("extraFields", state.extraFields.filter((f) => f._uid !== field._uid));
                }}
                aria-label={t("aria.removeField")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              updateField("extraFields", [...state.extraFields, { _uid: crypto.randomUUID(), key: "", value: "" }]);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("plugin.addField")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
