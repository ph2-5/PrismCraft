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
    <div className="p-3 border-t border-border bg-card2 flex flex-col gap-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-muted-foreground">{t("plugin.idLabel")}: </span>
          <span className="font-mono">{plugin.id}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("plugin.videoModelLabel")}: </span>
          <span>{plugin.videoCapabilities.defaultModel}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("plugin.imageModelLabel")}: </span>
          <span>{plugin.imageCapabilities.defaultModel}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("plugin.maxDurationLabel")}: </span>
          <span>{plugin.videoCapabilities.maxDuration}s</span>
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        {plugin.capabilities.video && <span className="badge badge-muted !text-xs">{t("plugin.capVideo")}</span>}
        {plugin.capabilities.image && <span className="badge badge-muted !text-xs">{t("plugin.capImage")}</span>}
        {plugin.capabilities.text && <span className="badge badge-muted !text-xs">{t("plugin.capText")}</span>}
        {plugin.capabilities.vision && <span className="badge badge-muted !text-xs">{t("plugin.capVision")}</span>}
        {plugin.videoCapabilities.supportsLastFrame && <span className="badge badge-muted !text-xs">{t("plugin.lastFrame")}</span>}
        {plugin.videoCapabilities.supportsReferenceVideo && <span className="badge badge-muted !text-xs">{t("plugin.referenceVideo")}</span>}
        {plugin.videoCapabilities.supportsMimicryLevel && <span className="badge badge-muted !text-xs">{t("plugin.mimicryLevel")}</span>}
        {plugin.videoCapabilities.supportsCharacterRef && (
          <span className="badge badge-muted !text-xs">
            {t("plugin.characterRef")}
            {plugin.videoCapabilities.characterRefMode && plugin.videoCapabilities.characterRefMode !== "text_append"
              ? ` (${plugin.videoCapabilities.characterRefMode})`
              : ""}
          </span>
        )}
        {plugin.videoCapabilities.supportsSceneRef && (
          <span className="badge badge-muted !text-xs">
            {t("plugin.sceneRef")}
            {plugin.videoCapabilities.sceneRefMode && plugin.videoCapabilities.sceneRefMode !== "text_append"
              ? ` (${plugin.videoCapabilities.sceneRefMode})`
              : ""}
          </span>
        )}
        {plugin.imageCapabilities.supportsReferenceImage && <span className="badge badge-muted !text-xs">{t("plugin.referenceImage")}</span>}
      </div>
    </div>
  );
}
