"use client";

import { useState, useMemo, useCallback } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Copy,
  Download,
  Upload,
  Wand2,
  Settings2,
  Globe,
  Box,
  FileCode,
  Eye,
} from "lucide-react";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";

interface UrlPattern {
  pattern: string;
  type: "contains" | "prefix" | "regex";
}

interface DurationOption {
  value: number;
  label: string;
}

interface ResolutionOption {
  value: string;
  label: string;
  width: number;
  height: number;
}

interface StyleOption {
  value: string;
  label: string;
}

interface CfgScaleConfig {
  min: number;
  max: number;
  default: number;
  step: number;
}

interface ModelDefinition {
  modelId: string;
  displayName: string;
  type: "video" | "image" | "text";
  maxDuration: number;
  maxResolution: number;
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsReferenceImage: boolean;
  durations: DurationOption[];
  resolutions: ResolutionOption[];
  styles: StyleOption[];
  negativePrompt: boolean;
  seed: boolean;
  cfgScale: CfgScaleConfig | null;
}

interface ExtraField {
  key: string;
  value: string;
}

interface StatusMapping {
  apiStatus: string;
  appStatus: string;
}

interface WizardState {
  id: string;
  displayName: string;
  version: string;
  description: string;
  baseUrl: string;
  authType: "bearer" | "api-key-header" | "api-key-query" | "custom";
  authHeader: string;
  authQueryName: string;
  apiUrlPatterns: UrlPattern[];
  matchMode: "contains" | "prefix" | "regex";
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsMimicryLevel: boolean;
  supportsCharacterRef: boolean;
  supportsSceneRef: boolean;
  supportsReferenceImage: boolean;
  defaultVideoModel: string;
  defaultImageModel: string;
  maxDuration: number;
  imageMode: "base64" | "url" | "upload";
  videoMode: "base64" | "url";
  preferLocalData: boolean;
  models: ModelDefinition[];
  bodyFormat: "openai-content" | "flat" | "dashscope" | "custom";
  promptField: string;
  modelField: string;
  durationField: string;
  firstFrameField: string;
  lastFrameField: string;
  extraFields: ExtraField[];
  videoGenerateEndpoint: string;
  videoStatusEndpoint: string;
  imageGenerateEndpoint: string;
  textGenerateEndpoint: string;
  visionGenerateEndpoint: string;
  taskIdPath: string;
  statusPath: string;
  videoUrlPath: string;
  imageUrlPath: string;
  statusMapping: StatusMapping[];
}

const STEPS = [
  { label: "基本信息", icon: Wand2 },
  { label: "API 配置", icon: Settings2 },
  { label: "URL 匹配", icon: Globe },
  { label: "模型定义", icon: Box },
  { label: "请求格式", icon: FileCode },
  { label: "响应格式", icon: Settings2 },
  { label: "预览与导出", icon: Eye },
];

function getApiBase(): string {
  return `http://localhost:${API_SERVER_PORT}/api`;
}

async function validatePluginConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }> {
  const res = await fetch(`${getApiBase()}/plugins/validate`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "验证失败");
  return data.data;
}

async function addPlugin(config: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${getApiBase()}/plugins/add`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "添加插件失败");
}

function createDefaultModel(): ModelDefinition {
  return {
    modelId: "",
    displayName: "",
    type: "video",
    maxDuration: 10,
    maxResolution: 1080,
    supportsLastFrame: false,
    supportsReferenceVideo: false,
    supportsReferenceImage: false,
    durations: [],
    resolutions: [],
    styles: [],
    negativePrompt: false,
    seed: false,
    cfgScale: null,
  };
}

function buildPluginJson(state: WizardState): Record<string, unknown> {
  const models: Record<string, unknown> = {};
  const availableModels: Array<{ id: string; displayName: string; type: string }> = [];
  for (const m of state.models) {
    const modelEntry: Record<string, unknown> = {
      displayName: m.displayName,
    };
    if (m.maxResolution > 0) modelEntry.maxResolution = m.maxResolution;
    if (m.type === "video") {
      modelEntry.supportsLastFrame = m.supportsLastFrame;
      modelEntry.supportsReferenceVideo = m.supportsReferenceVideo;
    }
    if (m.type === "image") {
      modelEntry.supportsReferenceImage = m.supportsReferenceImage;
    }
    const parameters: Record<string, unknown> = {};
    if (m.durations.length > 0) parameters.durations = m.durations;
    if (m.resolutions.length > 0) parameters.resolutions = m.resolutions;
    if (m.styles.length > 0) parameters.styles = m.styles;
    if (m.negativePrompt) parameters.negativePrompt = true;
    if (m.seed) parameters.seed = true;
    if (m.cfgScale) parameters.cfgScale = m.cfgScale;
    if (Object.keys(parameters).length > 0) modelEntry.parameters = parameters;
    models[m.modelId] = modelEntry;
    availableModels.push({ id: m.modelId, displayName: m.displayName || m.modelId, type: m.type });
  }

  const auth: Record<string, unknown> = { type: state.authType };
  if (state.authType === "api-key-header") auth.headerName = state.authHeader || "X-API-Key";
  if (state.authType === "api-key-query") auth.queryParamName = state.authQueryName || "api_key";

  const match: Record<string, unknown> = {
    apiUrlPatterns: state.apiUrlPatterns.map((p) => p.pattern),
  };
  if (state.matchMode !== "contains") match.mode = state.matchMode;

  const videoRequest: Record<string, unknown> = { bodyFormat: state.bodyFormat };
  if (state.promptField && state.promptField !== "prompt") videoRequest.promptField = state.promptField;
  if (state.modelField && state.modelField !== "model") videoRequest.modelField = state.modelField;
  if (state.durationField && state.durationField !== "duration") videoRequest.durationField = state.durationField;
  if (state.firstFrameField && state.firstFrameField !== "image_url") videoRequest.firstFrameField = state.firstFrameField;
  if (state.lastFrameField && state.lastFrameField !== "last_frame_url") videoRequest.lastFrameField = state.lastFrameField;
  if (state.extraFields.length > 0) {
    videoRequest.extraFields = Object.fromEntries(
      state.extraFields.filter((f) => f.key).map((f) => [f.key, f.value]),
    );
  }

  const videoResponse: Record<string, unknown> = {};
  if (state.taskIdPath) videoResponse.taskIdPath = state.taskIdPath;
  if (state.statusPath) videoResponse.statusPath = state.statusPath;
  if (state.videoUrlPath) videoResponse.videoUrlPath = state.videoUrlPath;
  if (state.statusMapping.length > 0) {
    videoResponse.statusMapping = Object.fromEntries(
      state.statusMapping.filter((s) => s.apiStatus).map((s) => [s.apiStatus, s.appStatus]),
    );
  }

  const imageResponse: Record<string, unknown> = {};
  if (state.imageUrlPath) imageResponse.imageUrlPath = state.imageUrlPath;

  const plugin: Record<string, unknown> = {
    id: state.id,
    version: state.version,
    displayName: state.displayName,
    match,
    capabilities: {
      video: {
        supportsLastFrame: state.supportsLastFrame,
        supportsReferenceVideo: state.supportsReferenceVideo,
        supportsMimicryLevel: state.supportsMimicryLevel,
        supportsCharacterRef: state.supportsCharacterRef,
        supportsSceneRef: state.supportsSceneRef,
        defaultModel: state.defaultVideoModel,
        maxDuration: state.maxDuration,
      },
      image: {
        supportsReferenceImage: state.supportsReferenceImage,
        supportsCharacterRef: state.supportsCharacterRef,
        supportsSceneRef: state.supportsSceneRef,
        defaultModel: state.defaultImageModel,
      },
    },
    transport: {
      imageMode: state.imageMode,
      videoMode: state.videoMode,
      preferLocalData: state.preferLocalData,
    },
    auth,
    endpoints: {
      video: {
        generate: state.videoGenerateEndpoint,
        status: state.videoStatusEndpoint,
      },
      image: { generate: state.imageGenerateEndpoint },
      text: { generate: state.textGenerateEndpoint },
      vision: { generate: state.visionGenerateEndpoint },
    },
    request: {
      video: videoRequest,
      image: { bodyFormat: "openai" },
      text: { bodyFormat: "openai" },
      vision: { bodyFormat: "openai" },
    },
    response: {
      video: videoResponse,
      image: imageResponse,
      text: { contentPath: "choices.0.message.content" },
    },
  };

  if (state.description) plugin.description = state.description;
  if (Object.keys(models).length > 0) plugin.models = models;
  if (availableModels.length > 0) plugin.availableModels = availableModels;

  return plugin;
}

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
      models[index] = { ...models[index], ...updates };
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
        showSuccess("验证通过", "插件配置格式正确");
      } else {
        showError("验证失败", result.errors.join("; "));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "验证请求失败";
      setValidationResult({ valid: false, errors: [msg] });
      showError("验证失败", msg);
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
        showError("验证失败", result.errors.join("; "));
        return;
      }
      await addPlugin(config);
      showSuccess("安装成功", `插件「${state.displayName}」已安装`);
      onComplete();
    } catch (e) {
      showError("安装失败", e instanceof Error ? e.message : "安装插件时出错");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedJson);
      showSuccess("已复制", "插件配置 JSON 已复制到剪贴板");
    } catch {
      showError("复制失败", "无法写入剪贴板");
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
      showSuccess("已下载", `插件配置已保存为 ${state.id || "plugin"}.json`);
    } catch {
      showError("下载失败", "无法生成下载文件");
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
            key={i}
            onClick={() => {
              if (i < currentStep) setCurrentStep(i);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isActive
                ? "bg-purple-600 text-white"
                : isPast
                  ? "bg-slate-700 text-slate-300 cursor-pointer hover:bg-slate-600"
                  : "bg-slate-800/50 text-slate-500 cursor-default"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{step.label}</span>
            <span className="md:hidden">{i + 1}</span>
          </button>
        );
      })}
    </div>
  );

  const renderStep1 = () => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wand2 className="w-5 h-5" />
          基本信息
        </CardTitle>
        <CardDescription>设置插件的基本标识信息</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>插件 ID <span className="text-red-400">*</span></Label>
          <Input
            value={state.id}
            onChange={(e) => updateField("id", e.target.value)}
            placeholder="my-provider"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">仅允许小写字母、数字和连字符，必须以字母开头</p>
          {state.id && !/^[a-z][a-z0-9-]*$/.test(state.id) && (
            <p className="text-xs text-red-400">ID 格式不正确</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>显示名称 <span className="text-red-400">*</span></Label>
          <Input
            value={state.displayName}
            onChange={(e) => updateField("displayName", e.target.value)}
            placeholder="我的 AI 提供商"
          />
        </div>
        <div className="space-y-2">
          <Label>版本</Label>
          <Input
            value={state.version}
            onChange={(e) => updateField("version", e.target.value)}
            placeholder="1.0.0"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label>描述</Label>
          <Textarea
            value={state.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="插件的简要描述（可选）"
            className="min-h-[80px]"
          />
        </div>
      </CardContent>
    </Card>
  );

  const renderStep2 = () => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings2 className="w-5 h-5" />
          API 配置
        </CardTitle>
        <CardDescription>配置 API 连接、认证和能力声明</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>认证方式</Label>
          <Select
            value={state.authType}
            onValueChange={(v) => updateField("authType", v as WizardState["authType"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="api-key-header">API Key (Header)</SelectItem>
              <SelectItem value="api-key-query">API Key (Query)</SelectItem>
              <SelectItem value="custom">自定义</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {state.authType === "api-key-header" && (
          <div className="space-y-2">
            <Label>Header 名称</Label>
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
            <Label>Query 参数名</Label>
            <Input
              value={state.authQueryName}
              onChange={(e) => updateField("authQueryName", e.target.value)}
              placeholder="api_key"
              className="font-mono"
            />
          </div>
        )}

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">视频能力</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">默认视频模型 <span className="text-red-400">*</span></Label>
              <Input
                value={state.defaultVideoModel}
                onChange={(e) => updateField("defaultVideoModel", e.target.value)}
                placeholder="model-v1"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">最大时长 (秒)</Label>
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
              <Label className="text-xs">支持尾帧</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsReferenceVideo} onCheckedChange={(v) => updateField("supportsReferenceVideo", v === true)} />
              <Label className="text-xs">支持参考视频</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsMimicryLevel} onCheckedChange={(v) => updateField("supportsMimicryLevel", v === true)} />
              <Label className="text-xs">支持模仿级别</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsCharacterRef} onCheckedChange={(v) => updateField("supportsCharacterRef", v === true)} />
              <Label className="text-xs">支持角色参考图</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={state.supportsSceneRef} onCheckedChange={(v) => updateField("supportsSceneRef", v === true)} />
              <Label className="text-xs">支持场景参考图</Label>
            </div>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">图片能力</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">默认图片模型 <span className="text-red-400">*</span></Label>
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
              <Label className="text-xs">支持参考图</Label>
            </div>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">传输配置</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">图片传输方式</Label>
              <Select value={state.imageMode} onValueChange={(v) => updateField("imageMode", v as WizardState["imageMode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="base64">Base64</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="upload">上传</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">视频传输方式</Label>
              <Select value={state.videoMode} onValueChange={(v) => updateField("videoMode", v as WizardState["videoMode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="base64">Base64</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox checked={state.preferLocalData} onCheckedChange={(v) => updateField("preferLocalData", v === true)} />
              <Label className="text-xs">优先本地数据</Label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="w-5 h-5" />
          URL 匹配规则
        </CardTitle>
        <CardDescription>定义哪些 API URL 应由此插件处理</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>匹配模式</Label>
          <Select
            value={state.matchMode}
            onValueChange={(v) => updateField("matchMode", v as WizardState["matchMode"])}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">包含 (contains)</SelectItem>
              <SelectItem value="prefix">前缀 (prefix)</SelectItem>
              <SelectItem value="regex">正则 (regex)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">所有 URL 模式使用同一种匹配方式</p>
        </div>
        {state.apiUrlPatterns.map((pattern, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={pattern.pattern}
              onChange={(e) => {
                const patterns = [...state.apiUrlPatterns];
                patterns[i] = { ...patterns[i], pattern: e.target.value };
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
                  state.apiUrlPatterns.filter((_, j) => j !== i)
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
              { pattern: "", type: state.matchMode },
            ]);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          添加 URL 模式
        </Button>
        {state.apiUrlPatterns.length === 0 && (
          <p className="text-xs text-muted-foreground">至少添加一个 URL 匹配模式</p>
        )}
      </CardContent>
    </Card>
  );

  const renderModelParams = (model: ModelDefinition, index: number) => {
    const isExpanded = expandedModelParams.has(index);
    return (
      <div className="mt-3 border-t pt-3">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => toggleModelParams(index)}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          参数配置
        </button>
        {isExpanded && (
          <div className="mt-3 space-y-4 pl-2">
            <div className="space-y-2">
              <Label className="text-xs">时长选项</Label>
              {model.durations.map((d, di) => (
                <div key={di} className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={d.value}
                    onChange={(e) => {
                      const durations = [...model.durations];
                      durations[di] = { ...durations[di], value: Number(e.target.value) || 0 };
                      updateModel(index, { durations });
                    }}
                    placeholder="值 (如 5)"
                    className="font-mono h-8 text-xs"
                  />
                  <Input
                    value={d.label}
                    onChange={(e) => {
                      const durations = [...model.durations];
                      durations[di] = { ...durations[di], label: e.target.value };
                      updateModel(index, { durations });
                    }}
                    placeholder="标签 (如 5秒)"
                    className="h-8 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 text-red-500"
                    onClick={() => {
                      updateModel(index, { durations: model.durations.filter((_, j) => j !== di) });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  updateModel(index, { durations: [...model.durations, { value: 0, label: "" }] });
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                添加时长
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">分辨率选项</Label>
              {model.resolutions.map((r, ri) => (
                <div key={ri} className="flex items-center gap-2">
                  <Input
                    value={r.value}
                    onChange={(e) => {
                      const resolutions = [...model.resolutions];
                      resolutions[ri] = { ...resolutions[ri], value: e.target.value };
                      updateModel(index, { resolutions });
                    }}
                    placeholder="值"
                    className="font-mono h-8 text-xs w-20"
                  />
                  <Input
                    value={r.label}
                    onChange={(e) => {
                      const resolutions = [...model.resolutions];
                      resolutions[ri] = { ...resolutions[ri], label: e.target.value };
                      updateModel(index, { resolutions });
                    }}
                    placeholder="标签"
                    className="h-8 text-xs w-24"
                  />
                  <Input
                    value={r.width ? String(r.width) : ""}
                    onChange={(e) => {
                      const resolutions = [...model.resolutions];
                      resolutions[ri] = { ...resolutions[ri], width: Number(e.target.value) || 0 };
                      updateModel(index, { resolutions });
                    }}
                    placeholder="宽"
                    type="number"
                    className="font-mono h-8 text-xs w-16"
                  />
                  <Input
                    value={r.height ? String(r.height) : ""}
                    onChange={(e) => {
                      const resolutions = [...model.resolutions];
                      resolutions[ri] = { ...resolutions[ri], height: Number(e.target.value) || 0 };
                      updateModel(index, { resolutions });
                    }}
                    placeholder="高"
                    type="number"
                    className="font-mono h-8 text-xs w-16"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 text-red-500"
                    onClick={() => {
                      updateModel(index, { resolutions: model.resolutions.filter((_, j) => j !== ri) });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  updateModel(index, { resolutions: [...model.resolutions, { value: "", label: "", width: 0, height: 0 }] });
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                添加分辨率
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">风格选项</Label>
              {model.styles.map((s, si) => (
                <div key={si} className="flex items-center gap-2">
                  <Input
                    value={s.value}
                    onChange={(e) => {
                      const styles = [...model.styles];
                      styles[si] = { ...styles[si], value: e.target.value };
                      updateModel(index, { styles });
                    }}
                    placeholder="值"
                    className="font-mono h-8 text-xs"
                  />
                  <Input
                    value={s.label}
                    onChange={(e) => {
                      const styles = [...model.styles];
                      styles[si] = { ...styles[si], label: e.target.value };
                      updateModel(index, { styles });
                    }}
                    placeholder="标签"
                    className="h-8 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 text-red-500"
                    onClick={() => {
                      updateModel(index, { styles: model.styles.filter((_, j) => j !== si) });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  updateModel(index, { styles: [...model.styles, { value: "", label: "" }] });
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                添加风格
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={model.negativePrompt}
                  onCheckedChange={(v) => updateModel(index, { negativePrompt: v === true })}
                />
                <Label className="text-xs">反向提示词</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={model.seed}
                  onCheckedChange={(v) => updateModel(index, { seed: v === true })}
                />
                <Label className="text-xs">种子值</Label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={model.cfgScale !== null}
                  onCheckedChange={(v) => {
                    updateModel(index, {
                      cfgScale: v === true ? { min: 1, max: 30, default: 7, step: 0.5 } : null,
                    });
                  }}
                />
                <Label className="text-xs">CFG Scale</Label>
              </div>
              {model.cfgScale && (
                <div className="flex items-center gap-2 pl-6">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">最小</Label>
                    <Input
                      type="number"
                      value={model.cfgScale.min}
                      onChange={(e) => {
                        const cfgScale = { ...model.cfgScale!, min: Number(e.target.value) || 0 };
                        updateModel(index, { cfgScale });
                      }}
                      className="font-mono h-8 text-xs w-20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">最大</Label>
                    <Input
                      type="number"
                      value={model.cfgScale.max}
                      onChange={(e) => {
                        const cfgScale = { ...model.cfgScale!, max: Number(e.target.value) || 0 };
                        updateModel(index, { cfgScale });
                      }}
                      className="font-mono h-8 text-xs w-20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">默认</Label>
                    <Input
                      type="number"
                      value={model.cfgScale.default}
                      onChange={(e) => {
                        const cfgScale = { ...model.cfgScale!, default: Number(e.target.value) || 0 };
                        updateModel(index, { cfgScale });
                      }}
                      className="font-mono h-8 text-xs w-20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">步长</Label>
                    <Input
                      type="number"
                      value={model.cfgScale.step}
                      onChange={(e) => {
                        const cfgScale = { ...model.cfgScale!, step: Number(e.target.value) || 0.1 };
                        updateModel(index, { cfgScale });
                      }}
                      className="font-mono h-8 text-xs w-20"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStep4 = () => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Box className="w-5 h-5" />
              模型定义
            </CardTitle>
            <CardDescription>定义此插件支持的 AI 模型</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addModel}>
            <Plus className="h-4 w-4 mr-1" />
            添加模型
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.models.map((model, index) => (
          <div key={index} className="p-4 border rounded-lg bg-slate-800/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {model.type === "video" ? "视频" : model.type === "image" ? "图片" : "文本"}
                </Badge>
                <span className="text-sm font-medium">
                  {model.modelId || `模型 ${index + 1}`}
                </span>
              </div>
              {state.models.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500"
                  onClick={() => removeModel(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">模型 ID <span className="text-red-400">*</span></Label>
                <Input
                  value={model.modelId}
                  onChange={(e) => updateModel(index, { modelId: e.target.value })}
                  placeholder="model-v1"
                  className="font-mono h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">显示名称 <span className="text-red-400">*</span></Label>
                <Input
                  value={model.displayName}
                  onChange={(e) => updateModel(index, { displayName: e.target.value })}
                  placeholder="模型 V1"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">类型</Label>
                <Select
                  value={model.type}
                  onValueChange={(v) => updateModel(index, { type: v as ModelDefinition["type"] })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">视频</SelectItem>
                    <SelectItem value="image">图片</SelectItem>
                    <SelectItem value="text">文本</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">最大时长 (秒)</Label>
                <Input
                  type="number"
                  value={model.maxDuration}
                  onChange={(e) => updateModel(index, { maxDuration: Number(e.target.value) || 0 })}
                  className="font-mono h-9 text-sm"
                  disabled={model.type !== "video"}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">最大分辨率</Label>
                <Input
                  type="number"
                  value={model.maxResolution}
                  onChange={(e) => updateModel(index, { maxResolution: Number(e.target.value) || 0 })}
                  className="font-mono h-9 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {model.type === "video" && (
                <>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={model.supportsLastFrame}
                      onCheckedChange={(v) => updateModel(index, { supportsLastFrame: v === true })}
                    />
                    <Label className="text-xs">支持尾帧</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={model.supportsReferenceVideo}
                      onCheckedChange={(v) => updateModel(index, { supportsReferenceVideo: v === true })}
                    />
                    <Label className="text-xs">支持参考视频</Label>
                  </div>
                </>
              )}
              {model.type === "image" && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={model.supportsReferenceImage}
                    onCheckedChange={(v) => updateModel(index, { supportsReferenceImage: v === true })}
                  />
                  <Label className="text-xs">支持参考图</Label>
                </div>
              )}
            </div>

            {renderModelParams(model, index)}
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const renderStep5 = () => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileCode className="w-5 h-5" />
          请求格式与端点
        </CardTitle>
        <CardDescription>定义 API 端点和请求体结构</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-b pb-4 space-y-3">
          <h4 className="text-sm font-medium">API 端点</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">视频生成 <span className="text-red-400">*</span></Label>
              <Input
                value={state.videoGenerateEndpoint}
                onChange={(e) => updateField("videoGenerateEndpoint", e.target.value)}
                placeholder="/v1/videos/generations"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">视频状态查询 <span className="text-red-400">*</span></Label>
              <Input
                value={state.videoStatusEndpoint}
                onChange={(e) => updateField("videoStatusEndpoint", e.target.value)}
                placeholder="/v1/videos/{taskId}"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">图片生成</Label>
              <Input
                value={state.imageGenerateEndpoint}
                onChange={(e) => updateField("imageGenerateEndpoint", e.target.value)}
                placeholder="/v1/images/generations"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">文本生成</Label>
              <Input
                value={state.textGenerateEndpoint}
                onChange={(e) => updateField("textGenerateEndpoint", e.target.value)}
                placeholder="/v1/chat/completions"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">视觉分析</Label>
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
          <Label>Body 格式</Label>
          <Select
            value={state.bodyFormat}
            onValueChange={(v) => updateField("bodyFormat", v as WizardState["bodyFormat"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai-content">OpenAI Content</SelectItem>
              <SelectItem value="flat">Flat</SelectItem>
              <SelectItem value="dashscope">DashScope</SelectItem>
              <SelectItem value="custom">自定义</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Prompt 字段名</Label>
            <Input
              value={state.promptField}
              onChange={(e) => updateField("promptField", e.target.value)}
              placeholder="prompt"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Model 字段名</Label>
            <Input
              value={state.modelField}
              onChange={(e) => updateField("modelField", e.target.value)}
              placeholder="model"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Duration 字段名</Label>
            <Input
              value={state.durationField}
              onChange={(e) => updateField("durationField", e.target.value)}
              placeholder="duration"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>首帧字段名</Label>
            <Input
              value={state.firstFrameField}
              onChange={(e) => updateField("firstFrameField", e.target.value)}
              placeholder="image_url"
              className="font-mono"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>额外字段</Label>
          {state.extraFields.map((field, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={field.key}
                onChange={(e) => {
                  const extraFields = [...state.extraFields];
                  extraFields[i] = { ...extraFields[i], key: e.target.value };
                  updateField("extraFields", extraFields);
                }}
                placeholder="字段名"
                className="font-mono h-9"
              />
              <Input
                value={field.value}
                onChange={(e) => {
                  const extraFields = [...state.extraFields];
                  extraFields[i] = { ...extraFields[i], value: e.target.value };
                  updateField("extraFields", extraFields);
                }}
                placeholder="字段值"
                className="h-9"
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-red-500"
                onClick={() => {
                  updateField("extraFields", state.extraFields.filter((_, j) => j !== i));
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
              updateField("extraFields", [...state.extraFields, { key: "", value: "" }]);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            添加字段
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep6 = () => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings2 className="w-5 h-5" />
          响应格式
        </CardTitle>
        <CardDescription>定义 API 响应的解析路径</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>任务 ID 路径 <span className="text-red-400">*</span></Label>
            <Input
              value={state.taskIdPath}
              onChange={(e) => updateField("taskIdPath", e.target.value)}
              placeholder="data.task_id"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>状态路径 <span className="text-red-400">*</span></Label>
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
            <Label>视频 URL 路径</Label>
            <Input
              value={state.videoUrlPath}
              onChange={(e) => updateField("videoUrlPath", e.target.value)}
              placeholder="data.video_url"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>图片 URL 路径</Label>
            <Input
              value={state.imageUrlPath}
              onChange={(e) => updateField("imageUrlPath", e.target.value)}
              placeholder="data.image_url"
              className="font-mono"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>状态映射</Label>
          <p className="text-xs text-muted-foreground">将 API 返回的状态值映射为应用内部状态</p>
          {state.statusMapping.map((mapping, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={mapping.apiStatus}
                onChange={(e) => {
                  const statusMapping = [...state.statusMapping];
                  statusMapping[i] = { ...statusMapping[i], apiStatus: e.target.value };
                  updateField("statusMapping", statusMapping);
                }}
                placeholder="API 状态值"
                className="font-mono h-9"
              />
              <span className="text-muted-foreground">→</span>
              <Select
                value={mapping.appStatus}
                onValueChange={(v) => {
                  const statusMapping = [...state.statusMapping];
                  statusMapping[i] = { ...statusMapping[i], appStatus: v ?? "pending" };
                  updateField("statusMapping", statusMapping);
                }}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder="应用状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">等待中</SelectItem>
                  <SelectItem value="processing">处理中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-red-500"
                onClick={() => {
                  updateField("statusMapping", state.statusMapping.filter((_, j) => j !== i));
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
              updateField("statusMapping", [...state.statusMapping, { apiStatus: "", appStatus: "pending" }]);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            添加状态映射
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep7 = () => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Eye className="w-5 h-5" />
          预览与导出
        </CardTitle>
        <CardDescription>检查生成的插件配置并安装</CardDescription>
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
                <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4" /> 配置验证通过</span>
              ) : (
                <span className="flex items-start gap-1"><XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {validationResult.errors.join("; ")}</span>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-1" />
            复制到剪贴板
          </Button>
          <Button variant="outline" onClick={handleValidate} disabled={isValidating}>
            {isValidating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
            验证
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            下载 JSON
          </Button>
          <Button onClick={handleInstall} disabled={isInstalling}>
            {isInstalling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            安装插件
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const stepRenderers = [
    renderStep1,
    renderStep2,
    renderStep3,
    renderStep4,
    renderStep5,
    renderStep6,
    renderStep7,
  ];

  return (
    <div className="space-y-4">
      {renderStepIndicator()}
      {stepRenderers[currentStep]()}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          上一步
        </Button>
        <span className="text-xs text-muted-foreground">
          {currentStep + 1} / {STEPS.length}
        </span>
        {currentStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setCurrentStep((s) => s + 1)}
            disabled={!canProceed}
          >
            下一步
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleInstall} disabled={isInstalling || !canProceed}>
            {isInstalling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            安装插件
          </Button>
        )}
      </div>
    </div>
  );
}
