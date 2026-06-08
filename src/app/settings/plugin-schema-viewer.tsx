import { t } from "@/shared/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { BookOpen } from "lucide-react";

interface PluginSchemaViewerProps {
  schemaData: Record<string, unknown>;
}

export function PluginSchemaViewer({ schemaData }: PluginSchemaViewerProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          {t("plugin.apiPluginSpec")}
        </CardTitle>
        <CardDescription>{t("plugin.pluginSchemaDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="text-xs bg-slate-900 p-4 rounded-lg overflow-auto max-h-[600px] font-mono text-slate-300 whitespace-pre-wrap">
          {JSON.stringify(schemaData, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
