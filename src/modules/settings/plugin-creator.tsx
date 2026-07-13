import { useState, useMemo, useCallback } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Upload,
  Wand2,
  Settings2,
  Globe,
  Box,
  FileCode,
  Eye,
} from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState, ModelDefinition } from "./plugin-creator-types";
import { createDefaultModel } from "./plugin-creator-types";
import { validatePluginConfig, addPlugin, buildPluginJson } from "./plugin-creator-api";
import { PluginBasicInfo } from "./PluginBasicInfo";
import { PluginApiConfig } from "./PluginApiConfig";
import { PluginUrlRules } from "./PluginUrlRules";
import { PluginModelDefs } from "./PluginModelDefs";
import { PluginRequestFormat } from "./PluginRequestFormat";
import { PluginResponseFormat } from "./PluginResponseFormat";
import { PluginPreviewExport } from "./PluginPreviewExport";

const STEPS = [
  { id: "basic-info", label: () => t("plugin.basicInfo"), icon: Wand2 },
  { id: "api-config", label: () => t("plugin.apiConfig"), icon: Settings2 },
  { id: "url-match", label: () => t("plugin.urlMatch"), icon: Globe },
  { id: "model-defs", label: () => t("plugin.modelDefs"), icon: Box },
  { id: "request-format", label: () => t("plugin.requestFormatLabel"), icon: FileCode },
  { id: "response-format", label: () => t("plugin.responseFormat"), icon: Settings2 },
  { id: "preview-export", label: () => t("plugin.previewExport"), icon: Eye },
];

export default function PluginCreator({ onComplete }: { onComplete: () => void }) {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [currentStep, setCurrentStep] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [expandedModelParams, setExpandedModelParams] = useState<Set<number>>(new Set());

  const [state, setState] = useState<WizardState>({
    id: "",
    displayName: "",
    version: "1.0.0",
    description: "",
    baseUrl: "",
    authType: "bearer",
    authHeader: "X-API-Key",
    authQueryName: "api_key",
    apiUrlPatterns: [],
    matchMode: "contains",
    supportsLastFrame: false,
    supportsReferenceVideo: false,
    supportsMimicryLevel: false,
    supportsCharacterRef: false,
    supportsSceneRef: false,
    characterRefMode: "none",
    sceneRefMode: "none",
    characterRefField: "",
    sceneRefField: "",
    imageUploadMode: "base64",
    maxCharacterRefs: 1,
    supportsReferenceImage: false,
    defaultVideoModel: "",
    defaultImageModel: "",
    maxDuration: 10,
    imageMode: "base64",
    videoMode: "url",
    preferLocalData: true,
    models: [createDefaultModel()],
    bodyFormat: "openai-content",
    promptField: "prompt",
    modelField: "model",
    durationField: "duration",
    firstFrameField: "image_url",
    lastFrameField: "last_frame_url",
    extraFields: [],
    videoGenerateEndpoint: "/v1/videos/generations",
    videoStatusEndpoint: "/v1/videos/{taskId}",
    imageGenerateEndpoint: "/v1/images/generations",
    textGenerateEndpoint: "/v1/chat/completions",
    visionGenerateEndpoint: "/v1/chat/completions",
    taskIdPath: "data.task_id",
    statusPath: "data.status",
    videoUrlPath: "data.video_url",
    imageUrlPath: "data.image_url",
    statusMapping: [],
  });

  const updateField = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    setValidationResult(null);
  }, []);

  const updateModel = useCallback((index: number, updates: Partial<ModelDefinition>) => {
    setState((prev) => {
      const models = [...prev.models];
      models[index] = { ...models[index]!, ...updates };
      return { ...prev, models };
    });
    setValidationResult(null);
  }, []);

  const addModel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      models: [...prev.models, createDefaultModel()],
    }));
  }, []);

  const removeModel = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index),
    }));
  }, []);

  const toggleModelParams = useCallback((index: number) => {
    setExpandedModelParams((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const generatedJson = useMemo(() => {
    if (currentStep !== 6) return "";
    try {
      return JSON.stringify(buildPluginJson(state), null, 2);
    } catch {
      errorLogger.warn("[PluginCreator] Failed to serialize plugin JSON");
      return "{}";
    }
  }, [state, currentStep]);

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 0:
        return (
          /^[a-z][a-z0-9-]*$/.test(state.id) &&
          state.displayName.trim() !== "" &&
          /^\d+\.\d+\.\d+$/.test(state.version)
        );
      case 1:
        return state.defaultVideoModel.trim() !== "" || state.defaultImageModel.trim() !== "";
      case 2:
        return state.apiUrlPatterns.length > 0 && state.apiUrlPatterns.some((p) => p.pattern.trim() !== "");
      case 3:
        return state.models.length > 0 && state.models.every((m) => m.modelId.trim() !== "" && m.displayName.trim() !== "");
      case 4:
        return state.videoGenerateEndpoint.trim() !== "" && state.videoStatusEndpoint.trim() !== "";
      case 5:
        return state.taskIdPath.trim() !== "" && state.statusPath.trim() !== "";
      case 6:
        return true;
      default:
        return true;
    }
  }, [currentStep, state]);

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const config = buildPluginJson(state);
      const result = await validatePluginConfig(config);
      setValidationResult(result);
      if (result.valid) {
        showSuccess(t("success.validated"), t("plugin.configValid"));
      } else {
        showError(t("plugin.validateFailed"), result.errors.join("; "));
      }
    } catch (e) {
      const msg = mapUserFacingError(e) || t("plugin.validateRequestFailed");
      setValidationResult({ valid: false, errors: [msg] });
      showError(t("plugin.validateFailed"), msg);
    } finally {
      setIsValidating(false);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const config = buildPluginJson(state);
      const result = await validatePluginConfig(config);
      if (!result.valid) {
        setValidationResult(result);
        showError(t("plugin.validateFailed"), result.errors.join("; "));
        return;
      }
      await addPlugin(config);
      showSuccess(t("success.installed"), t("plugin.installedWithName", { name: state.displayName }));
      onComplete();
    } catch (e) {
      showError(t("plugin.addFailed"), mapUserFacingError(e));
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedJson);
      showSuccess(t("success.copied"), t("plugin.configJsonCopied"));
    } catch (e) {
      errorLogger.warn("[PluginCreator] Failed to copy plugin JSON to clipboard", e as Error);
      showError(t("error.copyFailed"), t("error.clipboardUnavailable"));
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([generatedJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.id || "plugin"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess(t("success.downloaded"), t("plugin.configSavedAs", { filename: `${state.id || "plugin"}.json` }));
    } catch (e) {
      errorLogger.warn("[PluginCreator] Failed to download plugin config file", e as Error);
      showError(t("error.exportFailed"), t("error.cannotGenerateDownload"));
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center gap-1 mb-4">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentStep;
        const isPast = i < currentStep;
        return (
          <button
            key={step.id}
            onClick={() => {
              if (i < currentStep) setCurrentStep(i);
            }}
            className={`wizard-step-btn ${isActive ? "active" : isPast ? "past" : "default"}`}
          >
            <Icon size={14} />
            <span>{step.label()}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {renderStepIndicator()}
      {currentStep === 0 && <PluginBasicInfo state={state} updateField={updateField} />}
      {currentStep === 1 && <PluginApiConfig state={state} updateField={updateField} />}
      {currentStep === 2 && <PluginUrlRules state={state} updateField={updateField} />}
      {currentStep === 3 && (
        <PluginModelDefs
          state={state}
          updateModel={updateModel}
          addModel={addModel}
          removeModel={removeModel}
          expandedModelParams={expandedModelParams}
          toggleModelParams={toggleModelParams}
        />
      )}
      {currentStep === 4 && <PluginRequestFormat state={state} updateField={updateField} />}
      {currentStep === 5 && <PluginResponseFormat state={state} updateField={updateField} />}
      {currentStep === 6 && (
        <PluginPreviewExport
          generatedJson={generatedJson}
          validationResult={validationResult}
          isValidating={isValidating}
          isInstalling={isInstalling}
          onValidate={handleValidate}
          onInstall={handleInstall}
          onCopy={handleCopy}
          onDownload={handleDownload}
        />
      )}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0}
        >
          <ChevronLeft size={16} className="mr-1" />
          {t("plugin.prevStep")}
        </button>
        <span className="text-[11px] text-muted-foreground">
          {currentStep + 1} / {STEPS.length}
        </span>
        {currentStep < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCurrentStep((s) => s + 1)}
            disabled={!canProceed}
          >
            {t("plugin.nextStep")}
            <ChevronRight size={16} className="ml-2" />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={handleInstall} disabled={isInstalling || !canProceed}>
            {isInstalling ? <Loader2 size={16} className="animate-spin mr-1" /> : <Upload size={16} className="mr-1" />}
            {t("plugin.installPlugin")}
          </button>
        )}
      </div>
    </div>
  );
}
