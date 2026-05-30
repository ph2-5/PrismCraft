"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Label } from "@/shared/ui/label";
import {
  Trash2,
  Loader2,
  Puzzle,
  Upload,
  RefreshCw,
  CheckCircle,
  XCircle,
  FileJson,
  ChevronDown,
  BookOpen,
  FileText,
} from "lucide-react";
import { confirm } from "@/shared/utils/confirm";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import PluginCreator from "./plugin-creator";

interface PluginInfo {
  id: string;
  displayName: string;
  isUserPlugin: boolean;
  videoCapabilities: {
    supportsLastFrame: boolean;
    supportsReferenceVideo: boolean;
    supportsMimicryLevel: boolean;
    defaultModel: string;
    maxDuration: number;
  };
  imageCapabilities: {
    supportsReferenceImage: boolean;
    defaultModel: string;
  };
}

interface UserPluginFile {
  id: string;
  fileName: string;
  filePath: string;
  displayName: string;
  version: string;
  valid: boolean;
  errors: string[];
}

interface PluginListData {
  plugins: PluginInfo[];
  userPluginFiles: UserPluginFile[];
}

function getApiBase(): string {
  return `http://localhost:${API_SERVER_PORT}/api`;
}

async function fetchPlugins(): Promise<PluginListData> {
  const res = await fetch(`${getApiBase()}/plugins/list`, {
    headers: { ...ELECTRON_APP_HEADERS },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.loadListFailed"));
  return data.data;
}

async function addPlugin(config: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${getApiBase()}/plugins/add`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.addPluginFailed"));
}

async function deletePlugin(pluginId: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/plugins/delete`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ pluginId }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.deletePluginFailed"));
}

async function reloadPlugins(): Promise<{ loaded: number; errors: string[] }> {
  const res = await fetch(`${getApiBase()}/plugins/reload`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.reloadPluginFailed"));
  return data.data;
}

async function validatePluginConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }> {
  const res = await fetch(`${getApiBase()}/plugins/validate`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.validateFailed"));
  return data.data;
}

async function fetchPluginSchema(): Promise<Record<string, unknown>> {
  const res = await fetch(`${getApiBase()}/plugins/schema`, {
    headers: { ...ELECTRON_APP_HEADERS },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.loadSchemaFailed"));
  return data.data;
}

async function fetchPluginSpecification(): Promise<string> {
  const res = await fetch(`${getApiBase()}/plugins/specification`, {
    headers: { ...ELECTRON_APP_HEADERS },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.loadSpecDocFailed"));
  return data.data.content;
}

export default function PluginManager() {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [userPluginFiles, setUserPluginFiles] = useState<UserPluginFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [showSchema, setShowSchema] = useState(false);
  const [schemaData, setSchemaData] = useState<Record<string, unknown> | null>(null);
  const [specContent, setSpecContent] = useState<string | null>(null);
  const [showSpec, setShowSpec] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPlugins = useCallback(async () => {
    try {
      const data = await fetchPlugins();
      setPlugins(data.plugins || []);
      setUserPluginFiles(data.userPluginFiles || []);
    } catch (e) {
      errorLogger.error("[PluginManager] 加载插件列表失败:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPlugins();
        if (!cancelled) {
          setPlugins(data.plugins || []);
          setUserPluginFiles(data.userPluginFiles || []);
        }
      } catch (e) {
        if (!cancelled) errorLogger.error("[PluginManager] 加载插件列表失败:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleValidate = async () => {
    if (!jsonInput.trim()) return;
    setIsValidating(true);
    try {
      const parsed = JSON.parse(jsonInput);
      const result = await validatePluginConfig(parsed);
      setValidationResult(result);
    } catch (e) {
      setValidationResult({
        valid: false,
        errors: [t("plugin.jsonParseFailed", { error: e instanceof Error ? e.message : String(e) })],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleAdd = async () => {
    if (!jsonInput.trim()) return;
    setIsAdding(true);
    try {
      const parsed = JSON.parse(jsonInput);
      const result = await validatePluginConfig(parsed);
      if (!result.valid) {
        setValidationResult(result);
        showError(t("plugin.validateFailed"), result.errors.join("; "));
        return;
      }
      await addPlugin(parsed);
      showSuccess(t("success.added"), t("plugin.addedWithName", { name: parsed.displayName || parsed.id }));
      setJsonInput("");
      setValidationResult(null);
      setShowAddForm(false);
      await loadPlugins();
    } catch (e) {
      showError(t("plugin.addFailed"), e instanceof Error ? e.message : t("plugin.addError"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (pluginId: string, displayName: string) => {
    if (!(await confirm(t("plugin.confirmDelete", { name: displayName }), t("plugin.confirmDeleteTitle")))) return;
    try {
      await deletePlugin(pluginId);
      showSuccess(t("success.deleted"), t("plugin.deletedWithName", { name: displayName }));
      await loadPlugins();
    } catch (e) {
      showError(t("plugin.deleteFailed"), e instanceof Error ? e.message : t("plugin.deleteError"));
    }
  };

  const handleReload = async () => {
    setIsReloading(true);
    try {
      const result = await reloadPlugins();
      showSuccess(t("success.reloaded"), t("plugin.loaded", { count: result.loaded }));
      await loadPlugins();
    } catch (e) {
      showError(t("plugin.reloadFailed"), e instanceof Error ? e.message : t("plugin.reloadError"));
    } finally {
      setIsReloading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonInput(content);
      setValidationResult(null);
    };
    reader.readAsText(file);
  };

  const handleShowSchema = async () => {
    if (showSchema) {
      setShowSchema(false);
      return;
    }
    if (!schemaData) {
      try {
        const data = await fetchPluginSchema();
        setSchemaData(data);
      } catch {
        showError(t("error.loadFailed"), t("plugin.loadSpecFailed"));
        return;
      }
    }
    setShowSchema(true);
  };

  const handleShowSpec = async () => {
    if (showSpec) {
      setShowSpec(false);
      return;
    }
    if (!specContent) {
      try {
        const content = await fetchPluginSpecification();
        setSpecContent(content);
      } catch {
        showError(t("error.loadFailed"), t("plugin.loadSpecDocFailed"));
        return;
      }
    }
    setShowSpec(true);
  };

  const builtInPlugins = plugins.filter((p) => !p.isUserPlugin);
  const userPlugins = plugins.filter((p) => p.isUserPlugin);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Puzzle className="w-5 h-5" />
            插件管理
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Puzzle className="w-5 h-5" />
                插件管理
              </CardTitle>
              <CardDescription>管理 AI 提供商插件，添加自定义 API 插件</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleShowSchema}>
                <BookOpen className="h-4 w-4 mr-1" />
                {showSchema ? "隐藏规范" : "插件规范"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleShowSpec}>
                <FileText className="h-4 w-4 mr-1" />
                {showSpec ? "隐藏文档" : "规范文档"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleReload} disabled={isReloading}>
                {isReloading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                重载
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {builtInPlugins.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">内置插件 ({builtInPlugins.length})</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {builtInPlugins.map((plugin) => (
                  <div key={plugin.id} className="flex items-center justify-between p-2.5 border rounded-lg bg-slate-800/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-sm font-medium truncate">{plugin.displayName}</span>
                      <Badge variant="secondary" className="text-xs shrink-0">内置</Badge>
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      {plugin.videoCapabilities.defaultModel && (
                        <Badge variant="outline" className="text-xs">{plugin.videoCapabilities.defaultModel}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {userPlugins.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">用户插件 ({userPlugins.length})</h4>
              <div className="space-y-2">
                {userPlugins.map((plugin) => {
                  const isExpanded = expandedPlugin === plugin.id;
                  const fileInfo = userPluginFiles.find((f) => f.id === plugin.id);
                  return (
                    <div key={plugin.id} className="border rounded-lg overflow-hidden">
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer bg-green-900/20"
                        onClick={() => setExpandedPlugin(isExpanded ? null : plugin.id)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <span className="font-medium truncate">{plugin.displayName}</span>
                          <Badge className="text-xs bg-green-700 shrink-0">自定义</Badge>
                          {fileInfo && (
                            <span className="text-xs text-muted-foreground shrink-0">v{fileInfo.version}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(plugin.id, plugin.displayName);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="p-3 border-t bg-slate-800/50 space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-muted-foreground">ID: </span>
                              <span className="font-mono">{plugin.id}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">视频模型: </span>
                              <span>{plugin.videoCapabilities.defaultModel}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">图片模型: </span>
                              <span>{plugin.imageCapabilities.defaultModel}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">最大时长: </span>
                              <span>{plugin.videoCapabilities.maxDuration}s</span>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {plugin.videoCapabilities.supportsLastFrame && <Badge variant="outline" className="text-xs">尾帧</Badge>}
                            {plugin.videoCapabilities.supportsReferenceVideo && <Badge variant="outline" className="text-xs">参考视频</Badge>}
                            {plugin.videoCapabilities.supportsMimicryLevel && <Badge variant="outline" className="text-xs">模仿度</Badge>}
                            {plugin.imageCapabilities.supportsReferenceImage && <Badge variant="outline" className="text-xs">参考图</Badge>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {plugins.length === 0 && (
            <div className="text-center py-6 text-gray-500 border-2 border-dashed rounded-lg">
              <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">暂无插件</p>
            </div>
          )}

          <div className="flex gap-2">
            {!showAddForm && !showCreator ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => setShowCreator(true)}>
                  <Puzzle className="w-4 h-4 mr-2" />
                  创建插件
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowAddForm(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  导入 JSON
                </Button>
              </>
            ) : showAddForm ? (
              <div className="w-full p-4 border rounded-lg bg-slate-800/50 space-y-4">
                <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-800">
                  <h4 className="font-medium text-blue-300 mb-2">添加自定义插件</h4>
                  <p className="text-sm text-blue-300/80">
                    粘贴或上传符合插件规范的 JSON 配置文件。插件将根据 API URL 和模型名称自动匹配请求。
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <FileJson className="h-4 w-4 mr-1" />
                    上传 JSON 文件
                  </Button>
                  <span className="text-xs text-muted-foreground self-center">或直接粘贴 JSON 配置</span>
                </div>

                <div className="space-y-2">
                  <Label>插件配置 JSON</Label>
                  <Textarea
                    value={jsonInput}
                    onChange={(e) => {
                      setJsonInput(e.target.value);
                      setValidationResult(null);
                    }}
                    placeholder='{"id": "my-provider", "version": "1.0.0", "displayName": "我的提供商", ...}'
                    className="font-mono text-xs min-h-[200px]"
                  />
                </div>

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

                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleValidate} disabled={!jsonInput.trim() || isValidating}>
                    {isValidating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                    验证配置
                  </Button>
                  <Button onClick={handleAdd} disabled={!jsonInput.trim() || isAdding}>
                    {isAdding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                    添加插件
                  </Button>
                  <Button variant="outline" onClick={() => { setShowAddForm(false); setJsonInput(""); setValidationResult(null); }}>
                    取消
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {userPluginFiles.some((f) => !f.valid) && (
            <Alert variant="destructive">
              <AlertDescription>
                <span className="font-medium">存在无效插件：</span>
                {userPluginFiles.filter((f) => !f.valid).map((f) => f.fileName).join(", ")}
                <span className="text-xs ml-2">请检查配置格式或删除无效插件</span>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {showSchema && schemaData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              API 插件规范
            </CardTitle>
            <CardDescription>自定义插件配置的 JSON Schema 说明</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-900 p-4 rounded-lg overflow-auto max-h-[600px] font-mono text-slate-300 whitespace-pre-wrap">
              {JSON.stringify(schemaData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {showSpec && specContent && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              插件规范文档
            </CardTitle>
            <CardDescription>自定义插件配置的完整参考文档</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-900 p-4 rounded-lg overflow-auto max-h-[600px] font-mono text-slate-300 whitespace-pre-wrap">
              {specContent}
            </pre>
          </CardContent>
        </Card>
      )}

      {showCreator && (
        <PluginCreator
          onComplete={() => {
            setShowCreator(false);
            loadPlugins();
          }}
        />
      )}
    </>
  );
}
