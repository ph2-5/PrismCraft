import { t } from "@/shared/constants";
import { BookOpen } from "lucide-react";

interface PluginSpecViewerProps {
  specContent: string;
}

export function PluginSpecViewer({ specContent }: PluginSpecViewerProps) {
  return (
    <div className="card">
      <div className="pb-3">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen size={20} />
          {t("plugin.pluginSpecDoc")}
        </div>
        <div className="text-sm text-muted-foreground">{t("plugin.pluginSpecDocDesc")}</div>
      </div>
      <div>
        <pre className="pre-block">
          {specContent}
        </pre>
      </div>
    </div>
  );
}
