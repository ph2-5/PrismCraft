import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Trash2, ChevronDown, Puzzle } from "lucide-react";
import { t } from "@/shared/constants";
import { PluginDetail } from "./PluginDetail";

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

interface PluginListProps {
  builtInPlugins: PluginInfo[];
  userPlugins: PluginInfo[];
  userPluginFiles: UserPluginFile[];
  expandedPlugin: string | null;
  onToggleExpand: (pluginId: string | null) => void;
  onDelete: (pluginId: string, displayName: string) => void;
}

export function PluginList({
  builtInPlugins,
  userPlugins,
  userPluginFiles,
  expandedPlugin,
  onToggleExpand,
  onDelete,
}: PluginListProps) {
  return (
    <>
      {builtInPlugins.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">{t("plugin.builtinPlugins", { count: builtInPlugins.length })}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {builtInPlugins.map((plugin) => (
              <div key={plugin.id} className="flex items-center justify-between p-2.5 border rounded-lg bg-slate-800/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-sm font-medium truncate">{plugin.displayName}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">{t("plugin.builtin")}</Badge>
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
          <h4 className="text-sm font-medium text-muted-foreground">{t("plugin.userPlugins", { count: userPlugins.length })}</h4>
          <div className="space-y-2">
            {userPlugins.map((plugin) => {
              const isExpanded = expandedPlugin === plugin.id;
              const fileInfo = userPluginFiles.find((f) => f.id === plugin.id);
              return (
                <div key={plugin.id} className="border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer bg-green-900/20"
                    onClick={() => onToggleExpand(isExpanded ? null : plugin.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <span className="font-medium truncate">{plugin.displayName}</span>
                      <Badge className="text-xs bg-green-700 shrink-0">{t("plugin.custom")}</Badge>
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
                          onDelete(plugin.id, plugin.displayName);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                  {isExpanded && <PluginDetail plugin={plugin} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {builtInPlugins.length === 0 && userPlugins.length === 0 && (
        <div className="text-center py-6 text-gray-500 border-2 border-dashed rounded-lg">
          <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{t("plugin.noPlugins")}</p>
        </div>
      )}
    </>
  );
}
