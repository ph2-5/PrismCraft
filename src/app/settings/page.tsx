"use client";

import { useState, useEffect, useRef } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
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
import { Separator } from "@/shared/ui/separator";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import {
  Plus,
  Trash2,
  TestTube,
  CheckCircle,
  XCircle,
  Loader2,
  Key,
  Bot,
  Image as ImageIcon,
  Video,
  Eye,
  AlertCircle,
  ChevronDown,
  Sparkles,
  Save,
  Package,
  Activity,
} from "lucide-react";
import PluginManager from "./plugin-manager";
import { confirm } from "@/shared/utils/confirm";
import {
  ApiConfig,
  ApiCapability,
  loadConfig,
  saveConfig,
  getDefaultConfig,
  addProvider,
  removeProvider,
  setCapabilityMapping,
  type ProviderConfig,
  type ModelConfig,
  PROVIDER_TEMPLATES,
  createProviderFromTemplate,
  getTemplateList,
  detectProvider,
  validateApiKey,
  checkConfigStatus,
  ConfigStatus,
} from "@/infrastructure/api-config-facade";
import { ProjectExportImport } from "@/modules/asset";
import { MemoryMonitorPanel } from "@/shared/presentation/MemoryMonitorPanel";
import { ErrorLogViewer } from "@/shared/presentation/ErrorBoundary";
import { container } from "@/infrastructure/di";
import { preferencesStorage } from "@/shared/utils/preferences";

const AUTOSAVE_STORAGE_KEY = "ai-animation-autosave-settings";

const capabilities: {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}[] = [
  { id: "text", name: "文本生成", icon: <Bot className="w-4 h-4" /> },
  { id: "image", name: "图片生成", icon: <ImageIcon className="w-4 h-4" /> },
  { id: "vision", name: "图片分析", icon: <Eye className="w-4 h-4" /> },
  { id: "video", name: "视频生成", icon: <Video className="w-4 h-4" /> },
];

function getCapabilityBadges(provider: ApiConfig["providers"][0]) {
  const caps = new Set<ApiCapability>();
  provider.models.forEach((m) => m.capabilities.forEach((c) => caps.add(c)));
  return Array.from(caps);
}

function AutoSaveSettings() {
  const { success } = useToastHelpers();
  const [enabled, setEnabled] = useState(() => {
    try {
      const parsed = preferencesStorage.get<{ enabled?: boolean }>(AUTOSAVE_STORAGE_KEY, {});
      return typeof parsed.enabled === "boolean" ? parsed.enabled : true;
    } catch (e) {
      errorLogger.warn("[AutoSaveSettings] Failed to load auto-save settings", e);
      return true;
    }
  });
  const [intervalMinutes, setIntervalMinutes] = useState(() => {
    try {
      const parsed = preferencesStorage.get<{ interval?: number }>(AUTOSAVE_STORAGE_KEY, {});
      return typeof parsed.interval === "number" && parsed.interval > 0 ? parsed.interval : 5;
    } catch (e) {
      errorLogger.warn("[AutoSaveSettings] Failed to load auto-save settings", e);
      return 5;
    }
  });

  const persistSettings = (nextEnabled: boolean, nextInterval: number) => {
    try {
      preferencesStorage.set(AUTOSAVE_STORAGE_KEY, { enabled: nextEnabled, interval: nextInterval });
      success("已保存", "自动保存设置已更新");
    } catch (e) {
      errorLogger.warn("[AutoSaveSettings] Failed to persist auto-save settings", e);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Save className="w-5 h-5" />
            自动保存
          </CardTitle>
          <CardDescription>
            配置故事编辑器的自动保存行为
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label>启用自动保存</Label>
              <p className="text-sm text-muted-foreground">
                定期自动保存编辑中的故事，防止数据丢失
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(val) => {
                setEnabled(val);
                persistSettings(val, intervalMinutes);
              }}
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label>保存间隔</Label>
              <p className="text-sm text-muted-foreground">
                每隔多少分钟自动保存一次
              </p>
            </div>
            <Select
              value={String(intervalMinutes)}
              onValueChange={(val) => {
                const num = Number(val);
                setIntervalMinutes(num);
                persistSettings(enabled, num);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 分钟</SelectItem>
                <SelectItem value="3">3 分钟</SelectItem>
                <SelectItem value="5">5 分钟</SelectItem>
                <SelectItem value="10">10 分钟</SelectItem>
                <SelectItem value="15">15 分钟</SelectItem>
                <SelectItem value="30">30 分钟</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Alert>
            <AlertDescription className="text-sm">
              自动保存仅在故事编辑页面生效，且仅在有未保存更改时触发。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { error: showError } = useToastHelpers();
  const [config, setConfig] = useState<ApiConfig>(getDefaultConfig());
  const [_status, setStatus] = useState<ConfigStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newProviderKey, setNewProviderKey] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const [useFreeImageBackup, setUseFreeImageBackup] = useState(false);

  const [useCustomVision, setUseCustomVision] = useState(false);

  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [testingCapability, setTestingCapability] =
    useState<ApiCapability | null>(null);

  const detectedInfo = newProviderKey ? detectProvider(newProviderKey) : null;
  const keyValidation = newProviderKey
    ? validateApiKey(newProviderKey)
    : { valid: false };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const loaded = await loadConfig();
        if (!cancelled) {
          setConfig(loaded);
          setUseFreeImageBackup(loaded.freeImageBackup ?? false);
          setStatus(await checkConfigStatus());
        }
      } catch (e) {
        if (!cancelled) errorLogger.error("[Settings] 初始化失败:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      if (saveConfigDebounced.current) {
        clearTimeout(saveConfigDebounced.current);
      }
    };
  }, []);

  const handleAddProvider = async () => {
    if (!keyValidation.valid) return;

    setIsAdding(true);
    try {
      const templateId =
        detectedInfo?.templateId || selectedTemplate || "openai";
      const providerName =
        newProviderName ||
        detectedInfo?.suggestedName ||
        `${templateId}-${Date.now()}`;

      const newProvider = createProviderFromTemplate(
        templateId,
        newProviderKey,
      );

      if (!newProvider) {
        showError("创建失败", "创建提供商失败");
        return;
      }

      newProvider.name = providerName;

      const updatedConfig = addProvider(config, newProvider);
      setConfig(updatedConfig);
      saveConfig(updatedConfig);
      setStatus(await checkConfigStatus());

      setNewProviderKey("");
      setNewProviderName("");
      setSelectedTemplate("");
      setShowAddForm(false);
    } catch (e) {
      showError("添加失败", (e as Error).message || "添加提供商时出错");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;
    if (
      !(await confirm(
        `确定要删除提供商「${provider.name}」吗？此操作不可撤销。`,
        "删除提供商",
      ))
    )
      return;
    const updatedConfig = removeProvider(config, providerId);
    setConfig(updatedConfig);
    saveConfig(updatedConfig);
    setStatus(await checkConfigStatus());
    if (expandedProvider === providerId) {
      setExpandedProvider(null);
    }
  };

  const saveConfigDebounced = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleUpdateProvider = async (
    providerId: string,
    updates: Partial<ProviderConfig>,
  ) => {
    const updatedConfig = {
      ...config,
      providers: config.providers.map((p) =>
        p.id === providerId ? { ...p, ...updates } : p,
      ),
    };
    setConfig(updatedConfig);
    setStatus(await checkConfigStatus());

    if (saveConfigDebounced.current) {
      clearTimeout(saveConfigDebounced.current);
    }
    saveConfigDebounced.current = setTimeout(() => {
      saveConfig(updatedConfig);
    }, 500);
  };

  const handleAddCustomModel = async (providerId: string) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;

    const newModel = {
      id: "custom-model-" + Date.now(),
      name: "自定义模型",
      capabilities: ["text"] as ApiCapability[],
      defaultParams: { maxTokens: 4096, temperature: 0.7 },
    };

    handleUpdateProvider(providerId, {
      models: [...provider.models, newModel],
    });
  };

  const handleUpdateModel = (
    providerId: string,
    modelIndex: number,
    updates: Partial<ModelConfig>,
  ) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;

    const updatedModels = [...provider.models];
    updatedModels[modelIndex] = { ...updatedModels[modelIndex], ...updates };

    handleUpdateProvider(providerId, { models: updatedModels });
  };

  const handleRemoveModel = (providerId: string, modelIndex: number) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;

    const updatedModels = provider.models.filter(
      (_, index) => index !== modelIndex,
    );
    handleUpdateProvider(providerId, { models: updatedModels });
  };

  const handleUpdateProviderModels = (providerId: string) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;

    const templateId = provider.templateId || provider.id.split("-")[0];
    const template =
      PROVIDER_TEMPLATES[templateId as keyof typeof PROVIDER_TEMPLATES];
    if (!template) return;

    handleUpdateProvider(providerId, { models: template.models });
  };

  const handleSetMapping = async (
    capability: ApiCapability,
    value: string | null | undefined,
  ) => {
    const updatedConfig = setCapabilityMapping(
      config,
      capability,
      value === "_none" ? undefined : value || undefined,
    );
    setConfig(updatedConfig);
    saveConfig(updatedConfig);
    setStatus(await checkConfigStatus());
  };

  const handleTestCapability = async (capability: ApiCapability) => {
    setTestingCapability(capability);

    try {
      const mappingValue = config.mapping[capability];
      let providerId = "";
      let modelId = "";
      let format = "openai";
      let baseUrl = "";
      let apiKey = "";

      if (mappingValue) {
        const firstSlashIndex = mappingValue.indexOf("/");
        if (firstSlashIndex !== -1) {
          providerId = mappingValue.substring(0, firstSlashIndex);
          modelId = mappingValue.substring(firstSlashIndex + 1);
        }
        const provider = config.providers.find((p) => p.id === providerId);
        if (provider) {
          format = provider.format;
          baseUrl = provider.baseUrl;
          apiKey = provider.apiKey;
        }
      }

      const response = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability,
          providerId,
          modelId,
          format,
          baseUrl,
          apiKey,
        }),
      });

      if (!response.ok) {
        setTestResults((prev) => ({
          ...prev,
          [capability]: {
            success: false,
            message: `请求失败: HTTP ${response.status}`,
          },
        }));
        return;
      }

      const result = await response.json();
      setTestResults((prev) => ({
        ...prev,
        [capability]: {
          success: result.success,
          message: result.success ? "连接成功！" : result.error,
        },
      }));
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [capability]: {
          success: false,
          message: "测试失败: " + (error as Error).message,
        },
      }));
    } finally {
      setTestingCapability(null);
    }
  };

  const getAvailableModels = (capability: ApiCapability) => {
    const models: {
      providerId: string;
      providerName: string;
      modelId: string;
      modelName: string;
      value: string;
    }[] = [];

    for (const provider of config.providers) {
      for (const model of provider.models) {
        if (model.capabilities.includes(capability)) {
          models.push({
            providerId: provider.id,
            providerName: provider.name,
            modelId: model.id,
            modelName: model.name,
            value: `${provider.id}/${model.id}`,
          });
        }
      }
    }

    return models;
  };

  const getSelectedModelLabel = (capability: ApiCapability) => {
    const mappingValue = config.mapping[capability];
    if (!mappingValue) return null;

    const firstSlashIndex = mappingValue.indexOf("/");
    if (firstSlashIndex === -1) return null;
    const providerId = mappingValue.substring(0, firstSlashIndex);
    const modelId = mappingValue.substring(firstSlashIndex + 1);
    const provider = config.providers.find((p) => p.id === providerId);
    const model = provider?.models.find((m) => m.id === modelId);

    if (provider && model) {
      return { provider: provider.name, model: model.name };
    }
    return null;
  };

  const textModelHasVision = () => {
    const textMapping = config.mapping.text;
    if (!textMapping) return { hasVision: false, modelName: null };

    const firstSlashIndex = textMapping.indexOf("/");
    if (firstSlashIndex === -1) return { hasVision: false, modelName: null };
    const providerId = textMapping.substring(0, firstSlashIndex);
    const modelId = textMapping.substring(firstSlashIndex + 1);
    const provider = config.providers.find((p) => p.id === providerId);
    const model = provider?.models.find((m) => m.id === modelId);

    if (provider && model) {
      return {
        hasVision: model.capabilities.includes("vision"),
        modelName: `${provider.name} / ${model.name}`,
      };
    }
    return { hasVision: false, modelName: null };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <PageErrorBoundary pageName="设置">
      <div className="h-full max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold">设置</h2>
          <p className="text-sm text-muted-foreground">
            管理 API 配置、自动保存、工程打包和系统状态
          </p>
        </div>

        <Tabs defaultValue="api">
          <TabsList className="mb-6">
            <TabsTrigger value="api">
              <Key className="w-4 h-4 mr-1.5" />
              API 配置
            </TabsTrigger>
            <TabsTrigger value="autosave">
              <Save className="w-4 h-4 mr-1.5" />
              自动保存
            </TabsTrigger>
            <TabsTrigger value="project">
              <Package className="w-4 h-4 mr-1.5" />
              工程打包
            </TabsTrigger>
            <TabsTrigger value="system">
              <Activity className="w-4 h-4 mr-1.5" />
              系统状态
            </TabsTrigger>
          </TabsList>

          <TabsContent value="api">
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">已配置的提供商</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {config.providers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                      <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>暂无配置，请添加提供商</p>
                    </div>
                  ) : (
                    config.providers.map((provider) => {
                      const caps = getCapabilityBadges(provider);
                      const isConfigured = !!provider.apiKey;
                      const isExpanded = expandedProvider === provider.id;

                      return (
                        <div
                          key={provider.id}
                          className="border rounded-lg overflow-hidden"
                        >
                          <div
                            className={`flex items-center justify-between p-3 cursor-pointer ${
                              isConfigured ? "bg-green-900/20" : "bg-yellow-900/20"
                            }`}
                            onClick={() =>
                              setExpandedProvider(isExpanded ? null : provider.id)
                            }
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-2 h-2 rounded-full ${isConfigured ? "bg-green-500" : "bg-yellow-500"}`}
                              />
                              <div>
                                <div className="font-medium">{provider.name}</div>
                                <div className="text-xs text-gray-500 font-mono">
                                  {provider.apiKey
                                    ? `${provider.apiKey.slice(0, 4)}****${provider.apiKey.slice(-2)}`
                                    : "未配置 Key"}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                {caps.map((cap) => {
                                  const capConfig = capabilities.find(
                                    (c) => c.id === cap,
                                  );
                                  return (
                                    <Badge
                                      key={cap}
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {capConfig?.icon}
                                      <span className="ml-1">{capConfig?.name}</span>
                                    </Badge>
                                  );
                                })}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateProviderModels(provider.id);
                                }}
                              >
                                <Sparkles className="h-4 w-4 text-blue-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveProvider(provider.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-4 border-t bg-slate-800/50 space-y-4">
                              <div className="space-y-3">
                                <h4 className="font-medium text-sm">提供商配置</h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label
                                      htmlFor={`name-${provider.id}`}
                                      className="text-xs"
                                    >
                                      显示名称
                                    </Label>
                                    <Input
                                      id={`name-${provider.id}`}
                                      value={provider.name}
                                      onChange={(e) =>
                                        handleUpdateProvider(provider.id, {
                                          name: e.target.value,
                                        })
                                      }
                                      className="text-sm"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label
                                      htmlFor={`baseUrl-${provider.id}`}
                                      className="text-xs"
                                    >
                                      Base URL
                                    </Label>
                                    <Input
                                      id={`baseUrl-${provider.id}`}
                                      value={provider.baseUrl}
                                      onChange={(e) =>
                                        handleUpdateProvider(provider.id, {
                                          baseUrl: e.target.value,
                                        })
                                      }
                                      className="text-sm"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <Label
                                    htmlFor={`apiKey-${provider.id}`}
                                    className="text-xs"
                                  >
                                    API Key
                                  </Label>
                                  <Input
                                    id={`apiKey-${provider.id}`}
                                    type="password"
                                    value={provider.apiKey}
                                    onChange={(e) =>
                                      handleUpdateProvider(provider.id, {
                                        apiKey: e.target.value,
                                      })
                                    }
                                    className="text-sm"
                                  />
                                </div>
                              </div>

                              <Separator />

                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium text-sm">模型列表</h4>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAddCustomModel(provider.id)}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    添加自定义模型
                                  </Button>
                                </div>

                                <div className="space-y-2">
                                  {provider.models.map((model, index) => (
                                    <div
                                      key={model.id || index}
                                      className="p-3 border rounded-lg bg-slate-800/50 space-y-2"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                                          <div className="space-y-1">
                                            <Label className="text-xs">模型 ID</Label>
                                            <Input
                                              value={model.id}
                                              onChange={(e) =>
                                                handleUpdateModel(
                                                  provider.id,
                                                  index,
                                                  {
                                                    id: e.target.value,
                                                  },
                                                )
                                              }
                                              className="text-xs"
                                              placeholder="例如: doubao-seed-1-8-251228"
                                            />
                                          </div>
                                          <div className="space-y-1">
                                            <Label className="text-xs">
                                              显示名称
                                            </Label>
                                            <Input
                                              value={model.name}
                                              onChange={(e) =>
                                                handleUpdateModel(
                                                  provider.id,
                                                  index,
                                                  {
                                                    name: e.target.value,
                                                  },
                                                )
                                              }
                                              className="text-xs"
                                            />
                                          </div>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            handleRemoveModel(provider.id, index)
                                          }
                                        >
                                          <Trash2 className="h-3 w-3 text-red-500" />
                                        </Button>
                                      </div>

                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-gray-500">
                                          支持功能:
                                        </span>
                                        {["text", "image", "vision", "video"].map(
                                          (cap) => {
                                            const capConfig = capabilities.find(
                                              (c) => c.id === (cap as ApiCapability),
                                            );
                                            const isEnabled =
                                              model.capabilities.includes(
                                                cap as ApiCapability,
                                              );
                                            return (
                                              <div
                                                key={cap}
                                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                                                  isEnabled
                                                    ? "bg-blue-900/30 text-blue-300"
                                                    : "bg-slate-700/50 text-slate-400 hover:bg-slate-700"
                                                }`}
                                                onClick={() => {
                                                  const newCaps = isEnabled
                                                    ? model.capabilities.filter(
                                                        (c) => c !== cap,
                                                      )
                                                    : [
                                                        ...model.capabilities,
                                                        cap as ApiCapability,
                                                      ];
                                                  handleUpdateModel(
                                                    provider.id,
                                                    index,
                                                    { capabilities: newCaps },
                                                  );
                                                }}
                                              >
                                                {capConfig?.icon}
                                                {capConfig?.name}
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {!showAddForm ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowAddForm(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      添加提供商
                    </Button>
                  ) : (
                    <div className="p-4 border rounded-lg bg-slate-800/50 space-y-4">
                      <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-800">
                        <h4 className="font-medium text-blue-300 mb-2">
                          添加提供商步骤
                        </h4>
                        <ol className="list-decimal list-inside text-sm text-blue-300 space-y-1">
                          <li>输入 API Key（例如：sk-开头的密钥）</li>
                          <li>系统会自动检测提供商类型</li>
                          <li>如需手动选择，请从下拉菜单中选择提供商</li>
                          <li>输入显示名称（可选）</li>
                          <li>点击&quot;添加&quot;按钮完成配置</li>
                        </ol>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="apiKey">
                          API Key <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="apiKey"
                          type="password"
                          placeholder="sk-... (例如: sk-your-key-here)"
                          value={newProviderKey}
                          onChange={(e) => setNewProviderKey(e.target.value)}
                        />
                        {newProviderKey && (
                          <div className="flex items-center gap-2 text-sm">
                            {keyValidation.valid ? (
                              <>
                                {detectedInfo ? (
                                  <>
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                    <span>检测到: {detectedInfo.suggestedName}</span>
                                    <Badge
                                      variant={
                                        detectedInfo.confidence === "high"
                                          ? "default"
                                          : "secondary"
                                      }
                                    >
                                      {detectedInfo.confidence === "high"
                                        ? "高置信度"
                                        : "中置信度"}
                                    </Badge>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                                    <span className="text-yellow-600">
                                      无法自动识别，请手动选择提供商
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
                            选择提供商 <span className="text-red-500">*</span>
                          </Label>
                          <Select
                            value={selectedTemplate}
                            onValueChange={(val) => setSelectedTemplate(val || "")}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="请选择提供商" />
                            </SelectTrigger>
                            <SelectContent>
                              {getTemplateList().map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="providerName">显示名称（可选）</Label>
                        <Input
                          id="providerName"
                          placeholder={detectedInfo?.suggestedName || "我的 API"}
                          value={newProviderName}
                          onChange={(e) => setNewProviderName(e.target.value)}
                        />
                        <p className="text-xs text-gray-500">
                          用于在列表中标识该提供商，建议使用易于识别的名称
                        </p>
                      </div>

                      <div className="bg-slate-700/50 p-3 rounded-lg">
                        <h4 className="font-medium text-slate-300 mb-2">
                          支持的功能
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
                          添加提供商后，您可以为每个功能选择对应的模型
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={handleAddProvider}
                          disabled={!keyValidation.valid || isAdding}
                          className="flex-1"
                        >
                          {isAdding ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          添加提供商
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowAddForm(false)}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">功能映射</CardTitle>
                  <CardDescription>为每个功能选择使用的模型</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {capabilities.map((cap) => {
                    const models = getAvailableModels(cap.id);
                    const currentValue = config.mapping[cap.id];
                    const selected = getSelectedModelLabel(cap.id);
                    const visionInfo = textModelHasVision();

                    return (
                      <div key={cap.id} className="space-y-3">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 w-24 shrink-0">
                            {cap.icon}
                            <span className="font-medium">{cap.name}</span>
                          </div>

                          <Select
                            value={currentValue || "_none"}
                            onValueChange={(value) => handleSetMapping(cap.id, value)}
                            disabled={
                              cap.id === "vision" &&
                              !useCustomVision &&
                              visionInfo.hasVision
                            }
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder={`选择${cap.name}模型`}>
                                {selected ? (
                                  <span>
                                    {selected.provider} / {selected.model}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">未配置</span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">未配置</SelectItem>
                              {models.length === 0 ? (
                                <SelectItem value="_empty" disabled>
                                  没有可用的模型，请先添加提供商
                                </SelectItem>
                              ) : (
                                models.map((m) => (
                                  <SelectItem key={m.value} value={m.value}>
                                    {m.providerName} / {m.modelName}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>

                          {cap.id === "image" && (
                            <div className="flex items-center gap-2 shrink-0">
                              <Checkbox
                                id="useFreeBackup"
                                checked={useFreeImageBackup}
                                onCheckedChange={(checked) => {
                                  const val = checked as boolean;
                                  setUseFreeImageBackup(val);
                                  const updatedConfig = {
                                    ...config,
                                    freeImageBackup: val,
                                  };
                                  setConfig(updatedConfig);
                                  saveConfig(updatedConfig);
                                }}
                              />
                              <Label
                                htmlFor="useFreeBackup"
                                className="text-sm cursor-pointer flex items-center gap-1"
                              >
                                <Sparkles className="w-3 h-3 text-purple-500" />
                                使用免费备用
                              </Label>
                            </div>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTestCapability(cap.id)}
                            disabled={
                              !currentValue ||
                              testingCapability === cap.id ||
                              (cap.id === "vision" &&
                                !useCustomVision &&
                                visionInfo.hasVision)
                            }
                          >
                            {testingCapability === cap.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <TestTube className="h-4 w-4" />
                            )}
                          </Button>
                        </div>

                        {cap.id === "vision" && visionInfo.hasVision && (
                          <div className="pl-28 space-y-2">
                            <Alert className="bg-blue-900/20 border-blue-800">
                              <AlertDescription className="text-blue-300 text-sm">
                                💡 当前文本模型「{visionInfo.modelName}
                                」已支持图片识别功能，可直接使用无需额外配置。
                              </AlertDescription>
                            </Alert>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="useCustomVision"
                                checked={useCustomVision}
                                onCheckedChange={(checked) =>
                                  setUseCustomVision(checked as boolean)
                                }
                              />
                              <Label
                                htmlFor="useCustomVision"
                                className="text-sm cursor-pointer"
                              >
                                使用自配置的图片分析功能
                              </Label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">测试连接</CardTitle>
                  <CardDescription>验证各功能的 API 连接是否正常</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {capabilities.map((cap) => {
                      const result = testResults[cap.id];
                      return (
                        <Button
                          key={cap.id}
                          variant={result?.success ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleTestCapability(cap.id)}
                          disabled={
                            !config.mapping[cap.id] || testingCapability === cap.id
                          }
                          className={
                            result?.success ? "bg-green-600 hover:bg-green-700" : ""
                          }
                        >
                          {testingCapability === cap.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : result?.success ? (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          ) : (
                            cap.icon
                          )}
                          测试{cap.name}
                          {result && !result.success && (
                            <XCircle className="h-4 w-4 ml-2 text-red-500" />
                          )}
                        </Button>
                      );
                    })}
                  </div>

                  {Object.entries(testResults).map(
                    ([cap, result]) =>
                      result && (
                        <Alert
                          key={cap}
                          variant={result.success ? "default" : "destructive"}
                          className={`mt-4 ${result.success ? "bg-green-900/20 border-green-800" : ""}`}
                        >
                          <AlertDescription
                            className={result.success ? "text-green-700" : ""}
                          >
                            {capabilities.find((c) => c.id === cap)?.name}:{" "}
                            {result.message}
                          </AlertDescription>
                        </Alert>
                      ),
                  )}
                </CardContent>
              </Card>

              <PluginManager />
            </div>
          </TabsContent>

          <TabsContent value="autosave">
            <AutoSaveSettings />
          </TabsContent>

          <TabsContent value="project">
            <ProjectExportImport />
          </TabsContent>

          <TabsContent value="system">
            <div className="space-y-6">
              <MemoryMonitorPanel
                clearErrorLogs={async () => {
                  const logs = await container.errorLogStorage.getErrorLogs<{ timestamp: number }>();
                  if (logs.length > 100) {
                    await container.errorLogStorage.deleteOldErrorLogs(50);
                  }
                }}
              />
              <ErrorLogViewer
                loadLogs={() => container.errorLogStorage.getErrorLogs<{ timestamp: number; message: string; component?: string }>()}
                clearLogs={() => container.errorLogStorage.clearErrorLogs()}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageErrorBoundary>
  );
}
