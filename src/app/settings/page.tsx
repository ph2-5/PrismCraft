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
import { Key, Save, Package, Activity, RefreshCw } from "lucide-react";
import { ProjectExportImport } from "@/modules/asset";
import { MemoryMonitorPanel } from "@/shared/presentation/MemoryMonitorPanel";
import { ErrorLogViewer } from "@/shared/presentation/ErrorBoundary";
import { Button } from "@/shared/ui/button";
import { ApiConfigPanel } from "./ApiConfigPanel";
import { SyncSettingsPanel } from "@/modules/sync";
import { useSettingsPage } from "./hooks/useSettingsPage";

function AutoSaveSettings({
  enabled,
  intervalMinutes,
  onEnabledChange,
  onIntervalChange,
}: {
  enabled: boolean;
  intervalMinutes: number;
  onEnabledChange: (val: boolean) => void;
  onIntervalChange: (val: string | null) => void;
}) {
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
              onCheckedChange={onEnabledChange}
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
              onValueChange={onIntervalChange}
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
  const {
    syncDialogOpen,
    openSyncDialog,
    closeSyncDialog,
    autoSaveEnabled,
    autoSaveIntervalMinutes,
    onAutoSaveEnabledChange,
    onAutoSaveIntervalChange,
    clearErrorLogs,
    loadErrorLogs,
    clearErrorLogsAll,
  } = useSettingsPage();

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
            <TabsTrigger value="sync">
              <RefreshCw className="w-4 h-4 mr-1.5" />
              {t("sync.settingsTitle")}
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
            <Alert className="mb-4">
              <AlertDescription className="text-sm">
                {t("settings.apiConfigTip")}
              </AlertDescription>
            </Alert>
            <ApiConfigPanel />
          </TabsContent>

          <TabsContent value="autosave">
            <AutoSaveSettings
              enabled={autoSaveEnabled}
              intervalMinutes={autoSaveIntervalMinutes}
              onEnabledChange={onAutoSaveEnabledChange}
              onIntervalChange={onAutoSaveIntervalChange}
            />
          </TabsContent>

          <TabsContent value="sync">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  {t("sync.settingsTitle")}
                </CardTitle>
                <CardDescription>
                  {t("sync.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={openSyncDialog}>
                  {t("sync.settingsTitle")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="project">
            <ProjectExportImport />
          </TabsContent>

          <TabsContent value="system">
            <div className="space-y-6">
              <MemoryMonitorPanel
                clearErrorLogs={clearErrorLogs}
              />
              <ErrorLogViewer
                loadLogs={loadErrorLogs}
                clearLogs={clearErrorLogsAll}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <SyncSettingsPanel isOpen={syncDialogOpen} onClose={closeSyncDialog} />
    </PageErrorBoundary>
  );
}
