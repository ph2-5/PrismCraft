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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500, color: "var(--muted-fg)" }}>{t("plugin.builtinPlugins", { count: builtInPlugins.length })}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {builtInPlugins.map((plugin) => (
              <div key={plugin.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--muted)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 9999, flexShrink: 0, background: "var(--primary)" }} />
                  <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plugin.displayName}</span>
                  <span className="badge badge-muted" style={{ fontSize: 12, flexShrink: 0 }}>{t("plugin.builtin")}</span>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                  {plugin.videoCapabilities.defaultModel && (
                    <span className="badge badge-muted" style={{ fontSize: 12 }}>{plugin.videoCapabilities.defaultModel}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {declarativePlugins.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 4, color: "var(--primary)" }}>
            <Puzzle size={14} />
            {t("plugin.declarativePlugins", { count: declarativePlugins.length })}
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {declarativePlugins.map((plugin) => {
              const isExpanded = expandedPlugin === plugin.id;
              const fileInfo = userPluginFiles.find((f) => f.id === plugin.id);
              return (
                <div key={plugin.id} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <div
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, cursor: "pointer", background: "rgba(var(--primary-rgb), 0.2)" }}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 9999, flexShrink: 0, background: "var(--primary)" }} />
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plugin.displayName}</span>
                      <span className="badge" style={{ fontSize: 12, flexShrink: 0, background: "var(--primary)" }}>{t("plugin.declarative")}</span>
                      {fileInfo && (
                        <span style={{ fontSize: 12, color: "var(--muted-fg)", flexShrink: 0 }}>v{fileInfo.version}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <IconButton
                        variant="ghost"
                        className="btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(plugin.id, plugin.displayName);
                        }}
                        aria-label={t("aria.deletePlugin")}
                      >
                        <Trash2 size={16} style={{ color: "var(--destructive)" }} />
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 4, color: "var(--warning)" }}>
            <Code size={14} />
            {t("plugin.codePlugins", { count: codePlugins.length })}
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {codePlugins.map((plugin) => {
              const isExpanded = expandedPlugin === plugin.id;
              return (
                <div key={plugin.id} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <div
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, cursor: "pointer", background: "rgba(var(--warning-rgb), 0.2)" }}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 9999, flexShrink: 0, background: "var(--warning)" }} />
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plugin.displayName}</span>
                      <span className="badge" style={{ fontSize: 12, flexShrink: 0, background: "var(--warning)" }}>{t("plugin.codePlugin")}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <IconButton
                        variant="ghost"
                        className="btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(plugin.id, plugin.displayName);
                        }}
                        aria-label={t("aria.deletePlugin")}
                      >
                        <Trash2 size={16} style={{ color: "var(--destructive)" }} />
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
        <div style={{ textAlign: "center", padding: "24px 0", border: "2px dashed var(--border)", borderRadius: 8, color: "var(--muted-fg)" }}>
          <Puzzle size={40} style={{ margin: "0 auto 12px", opacity: 0.5, display: "block" }} />
          <p style={{ fontSize: 14 }}>{t("plugin.noPlugins")}</p>
        </div>
      )}
    </>
  );
}
