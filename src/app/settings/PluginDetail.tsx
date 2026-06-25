import { t } from "@/shared/constants";

interface PluginDetailProps {
  plugin: {
    id: string;
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
  };
}

export function PluginDetail({ plugin }: PluginDetailProps) {
  return (
    <div style={{ padding: 12, borderTop: "1px solid var(--border)", background: "var(--card2)", display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        <div>
          <span style={{ color: "var(--muted-fg)" }}>{t("plugin.idLabel")}: </span>
          <span style={{ fontFamily: "monospace" }}>{plugin.id}</span>
        </div>
        <div>
          <span style={{ color: "var(--muted-fg)" }}>{t("plugin.videoModelLabel")}: </span>
          <span>{plugin.videoCapabilities.defaultModel}</span>
        </div>
        <div>
          <span style={{ color: "var(--muted-fg)" }}>{t("plugin.imageModelLabel")}: </span>
          <span>{plugin.imageCapabilities.defaultModel}</span>
        </div>
        <div>
          <span style={{ color: "var(--muted-fg)" }}>{t("plugin.maxDurationLabel")}: </span>
          <span>{plugin.videoCapabilities.maxDuration}s</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {plugin.capabilities.video && <span className="badge badge-muted" style={{ fontSize: 12 }}>{t("plugin.capVideo")}</span>}
        {plugin.capabilities.image && <span className="badge badge-muted" style={{ fontSize: 12 }}>{t("plugin.capImage")}</span>}
        {plugin.capabilities.text && <span className="badge badge-muted" style={{ fontSize: 12 }}>{t("plugin.capText")}</span>}
        {plugin.capabilities.vision && <span className="badge badge-muted" style={{ fontSize: 12 }}>{t("plugin.capVision")}</span>}
        {plugin.videoCapabilities.supportsLastFrame && <span className="badge badge-muted" style={{ fontSize: 12 }}>{t("plugin.lastFrame")}</span>}
        {plugin.videoCapabilities.supportsReferenceVideo && <span className="badge badge-muted" style={{ fontSize: 12 }}>{t("plugin.referenceVideo")}</span>}
        {plugin.videoCapabilities.supportsMimicryLevel && <span className="badge badge-muted" style={{ fontSize: 12 }}>{t("plugin.mimicryLevel")}</span>}
        {plugin.videoCapabilities.supportsCharacterRef && (
          <span className="badge badge-muted" style={{ fontSize: 12 }}>
            {t("plugin.characterRef")}
            {plugin.videoCapabilities.characterRefMode && plugin.videoCapabilities.characterRefMode !== "text_append"
              ? ` (${plugin.videoCapabilities.characterRefMode})`
              : ""}
          </span>
        )}
        {plugin.videoCapabilities.supportsSceneRef && (
          <span className="badge badge-muted" style={{ fontSize: 12 }}>
            {t("plugin.sceneRef")}
            {plugin.videoCapabilities.sceneRefMode && plugin.videoCapabilities.sceneRefMode !== "text_append"
              ? ` (${plugin.videoCapabilities.sceneRefMode})`
              : ""}
          </span>
        )}
        {plugin.imageCapabilities.supportsReferenceImage && <span className="badge badge-muted" style={{ fontSize: 12 }}>{t("plugin.referenceImage")}</span>}
      </div>
    </div>
  );
}
