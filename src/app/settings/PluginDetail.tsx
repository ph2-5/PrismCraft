import { Badge } from "@/shared/ui/badge";
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
    <div className="p-3 border-t bg-slate-800/50 space-y-2 text-sm">
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
        {plugin.capabilities.video && <Badge variant="outline" className="text-xs">{t("plugin.capVideo")}</Badge>}
        {plugin.capabilities.image && <Badge variant="outline" className="text-xs">{t("plugin.capImage")}</Badge>}
        {plugin.capabilities.text && <Badge variant="outline" className="text-xs">{t("plugin.capText")}</Badge>}
        {plugin.capabilities.vision && <Badge variant="outline" className="text-xs">{t("plugin.capVision")}</Badge>}
        {plugin.videoCapabilities.supportsLastFrame && <Badge variant="outline" className="text-xs">{t("plugin.lastFrame")}</Badge>}
        {plugin.videoCapabilities.supportsReferenceVideo && <Badge variant="outline" className="text-xs">{t("plugin.referenceVideo")}</Badge>}
        {plugin.videoCapabilities.supportsMimicryLevel && <Badge variant="outline" className="text-xs">{t("plugin.mimicryLevel")}</Badge>}
        {plugin.videoCapabilities.supportsCharacterRef && (
          <Badge variant="outline" className="text-xs">
            {t("plugin.characterRef")}
            {plugin.videoCapabilities.characterRefMode && plugin.videoCapabilities.characterRefMode !== "text_append" 
              ? ` (${plugin.videoCapabilities.characterRefMode})` 
              : ""}
          </Badge>
        )}
        {plugin.videoCapabilities.supportsSceneRef && (
          <Badge variant="outline" className="text-xs">
            {t("plugin.sceneRef")}
            {plugin.videoCapabilities.sceneRefMode && plugin.videoCapabilities.sceneRefMode !== "text_append" 
              ? ` (${plugin.videoCapabilities.sceneRefMode})` 
              : ""}
          </Badge>
        )}
        {plugin.imageCapabilities.supportsReferenceImage && <Badge variant="outline" className="text-xs">{t("plugin.referenceImage")}</Badge>}
      </div>
    </div>
  );
}
