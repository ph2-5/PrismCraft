"use client";

import { useState } from "react";
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
import { Label } from "@/shared/ui/label";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { Key, Save, Package, Activity } from "lucide-react";
import { ProjectExportImport } from "@/modules/asset";
import { MemoryMonitorPanel } from "@/shared/presentation/MemoryMonitorPanel";
import { ErrorLogViewer } from "@/shared/presentation/ErrorBoundary";
import { container } from "@/infrastructure/di";
import { preferencesStorage } from "@/shared/utils/preferences";
import { ApiConfigPanel } from "./ApiConfigPanel";

const AUTOSAVE_STORAGE_KEY = "ai-animation-autosave-settings";

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
            <ApiConfigPanel />
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
