import { Trash2, ChevronDown, Puzzle, Code } from "lucide-react";
import { t } from "@/shared/constants";
import { IconButton } from "@/shared/presentation/IconButton";
import { PluginDetail } from "./PluginDetail";

interface PluginInfo {
  id: string;
  displayName: string;
  isUserPlugin: boolean;
  isCodePlugin: boolean;
  capabilities: {
    video: boolean;
    image: boolean;
    text: boolean;
    vision: boolean;
  };
  videoCapabilities: {
    supportsLastFrame: boolean;
    supportsReferenceVideo: boolean;
    supportsMimicryLevel: boolean;
    defaultModel: string;
    maxDuration: number;
    supportsCharacterRef?: boolean;
    supportsSceneRef?: boolean;
    characterRefMode?: string;
    sceneRefMode?: string;
    characterRefField?: string;
    sceneRefField?: string;
    imageUploadMode?: string;
    maxCharacterRefs?: number;
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

interface PluginListProps {
  builtInPlugins: PluginInfo[];
  declarativePlugins: PluginInfo[];
  codePlugins: PluginInfo[];
  userPluginFiles: UserPluginFile[];
  expandedPlugin: string | null;
  onToggleExpand: (pluginId: string | null) => void;
  onDelete: (pluginId: string, displayName: string) => void;
}

export function PluginList({
  builtInPlugins,
  declarativePlugins,
  codePlugins,
  userPluginFiles,
  expandedPlugin,
  onToggleExpand,
  onDelete,
}: PluginListProps) {
  const hasAnyPlugin = builtInPlugins.length > 0 || declarativePlugins.length > 0 || codePlugins.length > 0;

  return (
    <>
      {builtInPlugins.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-muted-foreground">{t("plugin.builtinPlugins", { count: builtInPlugins.length })}</h4>
          <div className="grid grid-cols-2 gap-2">
            {builtInPlugins.map((plugin) => (
              <div key={plugin.id} className="flex items-center justify-between p-2.5 border border-border rounded-lg bg-muted">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full shrink-0 bg-primary" />
                  <span className="text-sm font-medium truncate">{plugin.displayName}</span>
                  <span className="badge badge-muted !text-xs shrink-0">{t("plugin.builtin")}</span>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  {plugin.videoCapabilities.defaultModel && (
                    <span className="badge badge-muted !text-xs">{plugin.videoCapabilities.defaultModel}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {declarativePlugins.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium flex items-center gap-1 text-primary">
            <Puzzle size={14} />
            {t("plugin.declarativePlugins", { count: declarativePlugins.length })}
          </h4>
          <div className="flex flex-col gap-2">
            {declarativePlugins.map((plugin) => {
              const isExpanded = expandedPlugin === plugin.id;
              const fileInfo = userPluginFiles.find((f) => f.id === plugin.id);
              return (
                <div key={plugin.id} className="border border-border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer bg-primary/20"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => onToggleExpand(isExpanded ? null : plugin.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleExpand(isExpanded ? null : plugin.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0 bg-primary" />
                      <span className="font-medium truncate">{plugin.displayName}</span>
                      <span className="badge !text-xs shrink-0 bg-primary">{t("plugin.declarative")}</span>
                      {fileInfo && (
                        <span className="text-xs text-muted-foreground shrink-0">v{fileInfo.version}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <IconButton
                        variant="ghost"
                        className="btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(plugin.id, plugin.displayName);
                        }}
                        aria-label={t("aria.deletePlugin")}
                      >
                        <Trash2 size={16} className="text-destructive" />
                      </IconButton>
                      <ChevronDown size={16} style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "none" }} />
                    </div>
                  </div>
                  {isExpanded && <PluginDetail plugin={plugin} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {codePlugins.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium flex items-center gap-1 text-warning">
            <Code size={14} />
            {t("plugin.codePlugins", { count: codePlugins.length })}
          </h4>
          <div className="flex flex-col gap-2">
            {codePlugins.map((plugin) => {
              const isExpanded = expandedPlugin === plugin.id;
              return (
                <div key={plugin.id} className="border border-border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer bg-warning/20"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => onToggleExpand(isExpanded ? null : plugin.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleExpand(isExpanded ? null : plugin.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0 bg-warning" />
                      <span className="font-medium truncate">{plugin.displayName}</span>
                      <span className="badge !text-xs shrink-0 bg-warning">{t("plugin.codePlugin")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <IconButton
                        variant="ghost"
                        className="btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(plugin.id, plugin.displayName);
                        }}
                        aria-label={t("aria.deletePlugin")}
                      >
                        <Trash2 size={16} className="text-destructive" />
                      </IconButton>
                      <ChevronDown size={16} style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "none" }} />
                    </div>
                  </div>
                  {isExpanded && <PluginDetail plugin={plugin} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasAnyPlugin && (
        <div className="empty-state-box">
          <Puzzle size={40} className="mx-auto mb-3 opacity-50 block" />
          <p className="text-sm">{t("plugin.noPlugins")}</p>
        </div>
      )}
    </>
  );
}
