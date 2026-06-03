import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
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
import { usePreference } from "@/shared/utils/preferences";
import { ApiConfigPanel } from "./ApiConfigPanel";

const AUTOSAVE_STORAGE_KEY = "ai-animation-autosave-settings";

interface AutoSaveSettingsData {
  enabled?: boolean;
  interval?: number;
}

function AutoSaveSettings() {
  const { success } = useToastHelpers();
  const [settings, setSettings] = usePreference<AutoSaveSettingsData>(AUTOSAVE_STORAGE_KEY, {});
  const enabled = typeof settings.enabled === "boolean" ? settings.enabled : true;
  const intervalMinutes = typeof settings.interval === "number" && settings.interval > 0 ? settings.interval : 5;

  const persistSettings = (nextEnabled: boolean, nextInterval: number) => {
    try {
      setSettings({ enabled: nextEnabled, interval: nextInterval });
      success(t("success.saved"), t("success.settingsSaved"));
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
            {t("settings.autoSave")}
          </CardTitle>
          <CardDescription>
            {t("settings.autoSaveDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label>{t("settings.enableAutoSave")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.autoSaveHint")}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(val) => {
                persistSettings(val, intervalMinutes);
              }}
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label>{t("settings.saveInterval")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.saveIntervalHint")}
              </p>
            </div>
            <Select
              value={String(intervalMinutes)}
              onValueChange={(val) => {
                const num = Number(val);
                persistSettings(enabled, num);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("settings.minutes", { count: 1 })}</SelectItem>
                <SelectItem value="3">{t("settings.minutes", { count: 3 })}</SelectItem>
                <SelectItem value="5">{t("settings.minutes", { count: 5 })}</SelectItem>
                <SelectItem value="10">{t("settings.minutes", { count: 10 })}</SelectItem>
                <SelectItem value="15">{t("settings.minutes", { count: 15 })}</SelectItem>
                <SelectItem value="30">{t("settings.minutes", { count: 30 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Alert>
            <AlertDescription className="text-sm">
              {t("settings.autoSaveNote")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PageErrorBoundary pageName={t("page.settings")}>
      <div className="h-full max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold">{t("page.settings")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("page.settingsDesc")}
          </p>
        </div>

        <Tabs defaultValue="api">
          <TabsList className="mb-6">
            <TabsTrigger value="api">
              <Key className="w-4 h-4 mr-1.5" />
              {t("settings.apiConfig")}
            </TabsTrigger>
            <TabsTrigger value="autosave">
              <Save className="w-4 h-4 mr-1.5" />
              {t("settings.autoSave")}
            </TabsTrigger>
            <TabsTrigger value="project">
              <Package className="w-4 h-4 mr-1.5" />
              {t("settings.projectPack")}
            </TabsTrigger>
            <TabsTrigger value="system">
              <Activity className="w-4 h-4 mr-1.5" />
              {t("settings.systemStatus")}
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
