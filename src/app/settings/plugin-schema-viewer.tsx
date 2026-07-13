import { t } from "@/shared/constants";
import { BookOpen } from "lucide-react";

interface PluginSchemaViewerProps {
  schemaData: Record<string, unknown>;
}

export function PluginSchemaViewer({ schemaData }: PluginSchemaViewerProps) {
  return (
    <div className="card">
      <div className="pb-3">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen size={20} />
          {t("plugin.apiPluginSpec")}
        </div>
        <div className="text-sm text-muted-foreground">{t("plugin.pluginSchemaDesc")}</div>
      </div>
      <div>
        <pre className="pre-block">
          {JSON.stringify(schemaData, null, 2)}
        </pre>
      </div>
    </div>
  );
}
