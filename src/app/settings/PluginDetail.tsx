import { Badge } from "@/shared/ui/badge";
import { t } from "@/shared/constants";

interface PluginDetailProps {
  plugin: {
    id: string;
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
        {plugin.videoCapabilities.supportsLastFrame && <Badge variant="outline" className="text-xs">{t("plugin.lastFrame")}</Badge>}
        {plugin.videoCapabilities.supportsReferenceVideo && <Badge variant="outline" className="text-xs">{t("plugin.referenceVideo")}</Badge>}
        {plugin.videoCapabilities.supportsMimicryLevel && <Badge variant="outline" className="text-xs">{t("plugin.mimicryLevel")}</Badge>}
        {plugin.imageCapabilities.supportsReferenceImage && <Badge variant="outline" className="text-xs">{t("plugin.referenceImage")}</Badge>}
      </div>
    </div>
  );
}
