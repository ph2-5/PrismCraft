import { Plus, Trash2, FileCode } from "lucide-react";
import { t } from "@/shared/constants";
import { IconButton } from "@/shared/presentation/IconButton";
import type { WizardState } from "./plugin-creator-types";

interface PluginRequestFormatProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginRequestFormat({ state, updateField }: PluginRequestFormatProps) {
  return (
    <div className="card">
      <div className="pb-3">
        <div className="text-lg flex items-center gap-2 font-semibold">
          <FileCode size={20} />
          {t("plugin.requestFormat")}
        </div>
        <div className="text-sm text-muted-foreground">{t("plugin.requestFormatDesc")}</div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="border-b border-border pb-4 flex flex-col gap-3">
          <h4 className="text-sm font-medium">{t("plugin.apiEndpoints")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.videoGenerate")} <span className="text-destructive">*</span></label>
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono"
                value={state.videoGenerateEndpoint}
                onChange={(e) => updateField("videoGenerateEndpoint", e.target.value)}
                placeholder="/v1/videos/generations"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.videoStatusQuery")} <span className="text-destructive">*</span></label>
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono"
                value={state.videoStatusEndpoint}
                onChange={(e) => updateField("videoStatusEndpoint", e.target.value)}
                placeholder="/v1/videos/{taskId}"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.imageGenerate")}</label>
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono"
                value={state.imageGenerateEndpoint}
                onChange={(e) => updateField("imageGenerateEndpoint", e.target.value)}
                placeholder="/v1/images/generations"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.textGenerate")}</label>
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono"
                value={state.textGenerateEndpoint}
                onChange={(e) => updateField("textGenerateEndpoint", e.target.value)}
                placeholder="/v1/chat/completions"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.visionAnalyze")}</label>
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono"
                value={state.visionGenerateEndpoint}
                onChange={(e) => updateField("visionGenerateEndpoint", e.target.value)}
                placeholder="/v1/chat/completions"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label>{t("plugin.bodyFormat")}</label>
          <select
            className="select"
            value={state.bodyFormat}
            onChange={(e) => updateField("bodyFormat", e.target.value as WizardState["bodyFormat"])}
          >
            <option value="openai-content">{t("plugin.bodyFormatOpenai")}</option>
            <option value="flat">{t("plugin.bodyFormatFlat")}</option>
            <option value="dashscope">{t("plugin.bodyFormatDashscope")}</option>
            <option value="custom">{t("plugin.authCustom")}</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label>{t("plugin.promptFieldName")}</label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.promptField}
              onChange={(e) => updateField("promptField", e.target.value)}
              placeholder="prompt"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label>{t("plugin.modelFieldName")}</label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.modelField}
              onChange={(e) => updateField("modelField", e.target.value)}
              placeholder="model"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label>{t("plugin.durationFieldName")}</label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.durationField}
              onChange={(e) => updateField("durationField", e.target.value)}
              placeholder="duration"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label>{t("plugin.firstFrameFieldName")}</label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.firstFrameField}
              onChange={(e) => updateField("firstFrameField", e.target.value)}
              placeholder="image_url"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label>{t("plugin.extraFields")}</label>
          {state.extraFields.map((field) => (
            <div key={field._uid} className="flex items-center gap-2">
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono h-9"
                value={field.key}
                onChange={(e) => {
                  const extraFields = state.extraFields.map((f) =>
                    f._uid === field._uid ? { ...f, key: e.target.value } : f
                  );
                  updateField("extraFields", extraFields);
                }}
                placeholder={t("plugin.fieldNamePlaceholder")}
              />
              <input
                className="input !text-xs !py-1.5 !px-2.5 h-9"
                value={field.value}
                onChange={(e) => {
                  const extraFields = state.extraFields.map((f) =>
                    f._uid === field._uid ? { ...f, value: e.target.value } : f
                  );
                  updateField("extraFields", extraFields);
                }}
                placeholder={t("plugin.fieldValuePlaceholder")}
              />
              <IconButton
                variant="ghost"
                className="btn-sm !text-destructive shrink-0"
                onClick={() => {
                  updateField("extraFields", state.extraFields.filter((f) => f._uid !== field._uid));
                }}
                aria-label={t("aria.removeField")}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              updateField("extraFields", [...state.extraFields, { _uid: crypto.randomUUID(), key: "", value: "" }]);
            }}
          >
            <Plus size={16} className="mr-1" />
            {t("plugin.addField")}
          </button>
        </div>
      </div>
    </div>
  );
}
