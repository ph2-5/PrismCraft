import { useState, useEffect, useCallback } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { t } from "@/shared/constants";
import {
  Loader2,
  Puzzle,
  Upload,
  RefreshCw,
  BookOpen,
  FileText,
  FolderOpen,
} from "lucide-react";
import { confirm } from "@/shared/utils/confirm";
import { isElectron } from "@/shared/utils/platform";
import PluginCreator from "./plugin-creator";
import { PluginList } from "./PluginList";
import {
  loadPluginDetectionRules,
  loadPluginTemplates,
} from "@/shared/api-config";
import { loadModelProfilesFromServer } from "@/shared/model-capabilities";
import { useInvalidateModelCapabilities } from "@/shared/hooks/use-model-capabilities";
import { useInvalidateProviderTemplates } from "@/shared/hooks/use-provider-templates";
import {
  fetchPlugins,
  deletePlugin,
  reloadPlugins,
  reloadCodePlugins,
  fetchPluginSchema,
  fetchPluginSpecification,
  fetchCodePluginsDir,
} from "./plugin-api";
import type { PluginInfo, UserPluginFile } from "./plugin-api";
import { PluginAddForm } from "./plugin-add-form";
import { PluginSchemaViewer } from "./plugin-schema-viewer";
import { PluginSpecViewer } from "./plugin-spec-viewer";

export default function PluginManager() {
  const {
    plugins,
    userPluginFiles,
    isLoading,
    showAddForm,
    setShowAddForm,
    isReloading,
    isReloadingCode,
    expandedPlugin,
    setExpandedPlugin,
    showSchema,
    schemaData,
    handleShowSchema,
    showSpec,
    specContent,
    handleShowSpec,
    showCreator,
    setShowCreator,
    loadPlugins,
    handleDelete,
    handleReload,
    handleReloadCodePlugins,
    handleOpenCodePluginDir,
  } = usePluginManagerState();

  const builtInPlugins = plugins.filter((p) => !p.isUserPlugin && !p.isCodePlugin);
  const declarativePlugins = plugins.filter((p) => p.isUserPlugin && !p.isCodePlugin);
  const codePlugins = plugins.filter((p) => p.isCodePlugin);

  if (isLoading) {
    return (
      <div className="card">
        <div className="pb-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Puzzle size={20} />
            {t("plugin.management")}
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <PluginManagerHeader
          showSchema={showSchema}
          showSpec={showSpec}
          isReloading={isReloading}
          onShowSchema={handleShowSchema}
          onShowSpec={handleShowSpec}
          onReload={handleReload}
        />
        <div className="flex flex-col gap-4">
          <PluginList
            builtInPlugins={builtInPlugins}
            declarativePlugins={declarativePlugins}
            codePlugins={codePlugins}
            userPluginFiles={userPluginFiles}
            expandedPlugin={expandedPlugin}
            onToggleExpand={(id) => setExpandedPlugin(id)}
            onDelete={handleDelete}
          />

          {codePlugins.length > 0 && (
            <CodePluginActions
              isReloadingCode={isReloadingCode}
              onReloadCodePlugins={handleReloadCodePlugins}
              onOpenCodePluginDir={handleOpenCodePluginDir}
            />
          )}

          <PluginImportActions
            showAddForm={showAddForm}
            showCreator={showCreator}
            onShowAddForm={() => setShowAddForm(true)}
            onShowCreator={() => setShowCreator(true)}
            onAdded={() => {
              setShowAddForm(false);
              loadPlugins();
            }}
            onCancelAddForm={() => setShowAddForm(false)}
          />

          {userPluginFiles.some((f) => !f.valid) && (
            <div className="plugin-invalid-box">
              <div>
                <span className="font-medium">{t("plugin.invalidPluginsExist")}</span>
                {userPluginFiles.filter((f) => !f.valid).map((f) => f.fileName).join(", ")}
                <span className="text-xs ml-2">{t("plugin.checkConfigOrDelete")}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {showSchema && schemaData && (
        <PluginSchemaViewer schemaData={schemaData} />
      )}

      {showSpec && specContent && (
        <PluginSpecViewer specContent={specContent} />
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

// ============= 状态 Hook =============

function usePluginManagerState() {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const invalidateModelCapabilities = useInvalidateModelCapabilities();
  const invalidateProviderTemplates = useInvalidateProviderTemplates();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [userPluginFiles, setUserPluginFiles] = useState<UserPluginFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isReloadingCode, setIsReloadingCode] = useState(false);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [showSchema, setShowSchema] = useState(false);
  const [schemaData, setSchemaData] = useState<Record<string, unknown> | null>(null);
  const [specContent, setSpecContent] = useState<string | null>(null);
  const [showSpec, setShowSpec] = useState(false);
  const [showCreator, setShowCreator] = useState(false);

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
    if (!isElectron()) {
      setIsLoading(false);
      return;
    }
    loadPlugins();
  }, [loadPlugins]);

  const handleDelete = async (pluginId: string, displayName: string) => {
    if (!(await confirm(t("plugin.confirmDelete", { name: displayName }), t("plugin.confirmDeleteTitle")))) return;
    try {
      await deletePlugin(pluginId);
      showSuccess(t("success.deleted"), t("plugin.deletedWithName", { name: displayName }));
      await loadPlugins();
    } catch (e) {
      showError(t("plugin.deleteFailed"), mapUserFacingError(e));
    }
  };

  const handleReload = async () => {
    setIsReloading(true);
    try {
      const result = await reloadPlugins();
      showSuccess(t("success.reloaded"), t("plugin.loaded", { count: result.loaded }));
      await Promise.allSettled([
        loadPluginDetectionRules(),
        loadPluginTemplates(),
        loadModelProfilesFromServer(),
      ]);
      await Promise.allSettled([
        invalidateModelCapabilities(),
        invalidateProviderTemplates(),
      ]);
      await loadPlugins();
    } catch (e) {
      showError(t("plugin.reloadFailed"), mapUserFacingError(e));
    } finally {
      setIsReloading(false);
    }
  };

  const handleReloadCodePlugins = async () => {
    setIsReloadingCode(true);
    try {
      const result = await reloadCodePlugins();
      showSuccess(t("success.reloaded"), t("plugin.codePluginReloaded", { count: result.loaded }));
      await Promise.allSettled([
        loadPluginDetectionRules(),
        loadPluginTemplates(),
        loadModelProfilesFromServer(),
      ]);
      await Promise.allSettled([
        invalidateModelCapabilities(),
        invalidateProviderTemplates(),
      ]);
      await loadPlugins();
    } catch (e) {
      showError(t("plugin.codePluginReloadFailed"), mapUserFacingError(e));
    } finally {
      setIsReloadingCode(false);
    }
  };

  const handleOpenCodePluginDir = async () => {
    if (!isElectron()) return;
    try {
      const codePluginsDir = await fetchCodePluginsDir();
      const result = await window.electronAPI?.openPath(codePluginsDir);
      if (result && !result.success) {
        showError(t("error.loadFailed"), result.error || t("plugin.codePluginReloadFailed"));
      }
    } catch (e) {
      errorLogger.error("[PluginManager] 打开代码插件目录失败:", e);
    }
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
      } catch (e) {
        errorLogger.warn("[PluginManager] Failed to fetch plugin schema", e as Error);
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
      } catch (e) {
        errorLogger.warn("[PluginManager] Failed to fetch plugin specification", e as Error);
        showError(t("error.loadFailed"), t("plugin.loadSpecDocFailed"));
        return;
      }
    }
    setShowSpec(true);
  };

  return {
    plugins,
    userPluginFiles,
    isLoading,
    showAddForm,
    setShowAddForm,
    isReloading,
    isReloadingCode,
    expandedPlugin,
    setExpandedPlugin,
    showSchema,
    schemaData,
    handleShowSchema,
    showSpec,
    specContent,
    handleShowSpec,
    showCreator,
    setShowCreator,
    loadPlugins,
    handleDelete,
    handleReload,
    handleReloadCodePlugins,
    handleOpenCodePluginDir,
  };
}

// ============= 子组件 =============

interface PluginManagerHeaderProps {
  showSchema: boolean;
  showSpec: boolean;
  isReloading: boolean;
  onShowSchema: () => void;
  onShowSpec: () => void;
  onReload: () => void;
}

function PluginManagerHeader({
  showSchema,
  showSpec,
  isReloading,
  onShowSchema,
  onShowSpec,
  onReload,
}: PluginManagerHeaderProps) {
  return (
    <div className="pb-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Puzzle size={20} />
            {t("plugin.management")}
          </div>
          <div className="text-sm text-muted-foreground">{t("plugin.managementDesc")}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={onShowSchema}>
            <BookOpen size={16} className="mr-1" />
            {showSchema ? t("plugin.hideSpec") : t("plugin.showSpec")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onShowSpec}>
            <FileText size={16} className="mr-1" />
            {showSpec ? t("plugin.hideDoc") : t("plugin.showDoc")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onReload} disabled={isReloading}>
            {isReloading ? <Loader2 size={16} className="animate-spin mr-1" /> : <RefreshCw size={16} className="mr-1" />}
            {t("plugin.reload")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CodePluginActionsProps {
  isReloadingCode: boolean;
  onReloadCodePlugins: () => void;
  onOpenCodePluginDir: () => void;
}

function CodePluginActions({
  isReloadingCode,
  onReloadCodePlugins,
  onOpenCodePluginDir,
}: CodePluginActionsProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={onReloadCodePlugins}
        disabled={isReloadingCode}
      >
        {isReloadingCode ? (
          <Loader2 size={16} className="animate-spin mr-1" />
        ) : (
          <RefreshCw size={16} className="mr-1" />
        )}
        {t("plugin.reloadCodePlugins")}
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={onOpenCodePluginDir}
      >
        <FolderOpen size={16} className="mr-1" />
        {t("plugin.openCodePluginDir")}
      </button>
    </div>
  );
}

interface PluginImportActionsProps {
  showAddForm: boolean;
  showCreator: boolean;
  onShowAddForm: () => void;
  onShowCreator: () => void;
  onAdded: () => void;
  onCancelAddForm: () => void;
}

function PluginImportActions({
  showAddForm,
  showCreator,
  onShowAddForm,
  onShowCreator,
  onAdded,
  onCancelAddForm,
}: PluginImportActionsProps) {
  if (!showAddForm && !showCreator) {
    return (
      <div className="flex gap-2">
        <button type="button" className="btn btn-outline btn-sm flex-1" onClick={onShowCreator}>
          <Puzzle size={16} className="mr-2" />
          {t("plugin.createPlugin")}
        </button>
        <button type="button" className="btn btn-outline btn-sm flex-1" onClick={onShowAddForm}>
          <Upload size={16} className="mr-2" />
          {t("plugin.importJson")}
        </button>
      </div>
    );
  }
  if (showAddForm) {
    return (
      <PluginAddForm onAdded={onAdded} onCancel={onCancelAddForm} />
    );
  }
  return null;
}
