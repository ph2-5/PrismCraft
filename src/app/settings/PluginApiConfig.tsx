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
import { Checkbox } from "@/shared/ui/checkbox";
import { Settings2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginApiConfigProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginApiConfig({ state, updateField }: PluginApiConfigProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings2 className="w-5 h-5" />
          {t("plugin.apiConfig")}
        </CardTitle>
        <CardDescription>{t("plugin.apiConfigDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("plugin.authType")}</Label>
          <Select
            value={state.authType}
            onValueChange={(v) => updateField("authType", v as WizardState["authType"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bearer">{t("plugin.authBearer")}</SelectItem>
              <SelectItem value="api-key-header">{t("plugin.authApiKeyHeader")}</SelectItem>
              <SelectItem value="api-key-query">{t("plugin.authApiKeyQuery")}</SelectItem>
              <SelectItem value="custom">{t("plugin.authCustom")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {state.authType === "api-key-header" && (
          <div className="space-y-2">
            <Label>{t("plugin.authHeaderName")}</Label>
            <Input
              value={state.authHeader}
              onChange={(e) => updateField("authHeader", e.target.value)}
              placeholder="X-API-Key"
              className="font-mono"
            />
          </div>
        )}
        {state.authType === "api-key-query" && (
          <div className="space-y-2">
            <Label>{t("plugin.authQueryName")}</Label>
            <Input
              value={state.authQueryName}
              onChange={(e) => updateField("authQueryName", e.target.value)}
              placeholder="api_key"
              className="font-mono"
            />
          </div>
        )}

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">{t("plugin.videoCapabilities")}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.defaultVideoModel")} <span className="text-red-400">*</span></Label>
              <Input
                value={state.defaultVideoModel}
                onChange={(e) => updateField("defaultVideoModel", e.target.value)}
                placeholder="model-v1"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.maxDurationSeconds")}</Label>
              <Input
                type="number"
                value={state.maxDuration}
                onChange={(e) => updateField("maxDuration", Number(e.target.value) || 10)}
                className="font-mono"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsLastFrame} onCheckedChange={(v) => updateField("supportsLastFrame", v === true)} />
              <Label className="text-xs">{t("plugin.supportsLastFrame")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsReferenceVideo} onCheckedChange={(v) => updateField("supportsReferenceVideo", v === true)} />
              <Label className="text-xs">{t("plugin.supportsReferenceVideo")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsMimicryLevel} onCheckedChange={(v) => updateField("supportsMimicryLevel", v === true)} />
              <Label className="text-xs">{t("plugin.supportsMimicryLevel")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsCharacterRef} onCheckedChange={(v) => updateField("supportsCharacterRef", v === true)} />
              <Label className="text-xs">{t("plugin.supportsCharacterRef")}</Label>
            </div>
            {state.supportsCharacterRef && (
              <div className="space-y-2 pl-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">{t("plugin.characterRefMode")}</Label>
                  <select
                    value={state.characterRefMode}
                    onChange={(e) => updateField("characterRefMode", e.target.value as "native_field" | "multimodal" | "ref_field" | "text_append" | "none")}
                    className="text-xs border rounded px-2 py-1"
                  >
                    <option value="native_field">native_field</option>
                    <option value="multimodal">multimodal</option>
                    <option value="ref_field">ref_field</option>
                    <option value="text_append">text_append</option>
                  </select>
                </div>
                {state.characterRefMode === "native_field" && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">{t("plugin.characterRefField")}</Label>
                    <Input
                      value={state.characterRefField}
                      onChange={(e) => updateField("characterRefField", e.target.value)}
                      placeholder="subject_reference"
                      className="font-mono text-xs w-48"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsSceneRef} onCheckedChange={(v) => updateField("supportsSceneRef", v === true)} />
              <Label className="text-xs">{t("plugin.supportsSceneRef")}</Label>
            </div>
            {state.supportsSceneRef && (
              <div className="space-y-2 pl-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">{t("plugin.sceneRefMode")}</Label>
                  <select
                    value={state.sceneRefMode}
                    onChange={(e) => updateField("sceneRefMode", e.target.value as "native_field" | "multimodal" | "ref_field" | "text_append" | "none")}
                    className="text-xs border rounded px-2 py-1"
                  >
                    <option value="native_field">native_field</option>
                    <option value="multimodal">multimodal</option>
                    <option value="ref_field">ref_field</option>
                    <option value="text_append">text_append</option>
                  </select>
                </div>
                {state.sceneRefMode === "native_field" && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">{t("plugin.sceneRefField")}</Label>
                    <Input
                      value={state.sceneRefField}
                      onChange={(e) => updateField("sceneRefField", e.target.value)}
                      placeholder="scene_reference"
                      className="font-mono text-xs w-48"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label className="text-xs">{t("plugin.imageUploadMode")}</Label>
              <select
                value={state.imageUploadMode}
                onChange={(e) => updateField("imageUploadMode", e.target.value as "base64" | "url" | "upload")}
                className="text-xs border rounded px-2 py-1"
              >
                <option value="base64">base64</option>
                <option value="url">url</option>
                <option value="upload">upload</option>
              </select>
            </div>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">{t("plugin.imageCapabilities")}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.defaultImageModel")} <span className="text-red-400">*</span></Label>
              <Input
                value={state.defaultImageModel}
                onChange={(e) => updateField("defaultImageModel", e.target.value)}
                placeholder="image-v1"
                className="font-mono"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsReferenceImage} onCheckedChange={(v) => updateField("supportsReferenceImage", v === true)} />
              <Label className="text-xs">{t("plugin.supportsReferenceImage")}</Label>
            </div>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">{t("plugin.transportConfig")}</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.imageTransportMode")}</Label>
              <Select value={state.imageMode} onValueChange={(v) => updateField("imageMode", v as WizardState["imageMode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="base64">{t("plugin.transportBase64")}</SelectItem>
                  <SelectItem value="url">{t("plugin.transportUrl")}</SelectItem>
                  <SelectItem value="upload">{t("plugin.uploadMode")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("plugin.videoTransportMode")}</Label>
              <Select value={state.videoMode} onValueChange={(v) => updateField("videoMode", v as WizardState["videoMode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="base64">{t("plugin.transportBase64")}</SelectItem>
                  <SelectItem value="url">{t("plugin.transportUrl")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox checked={state.preferLocalData} onCheckedChange={(v) => updateField("preferLocalData", v === true)} />
              <Label className="text-xs">{t("plugin.preferLocalData")}</Label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
