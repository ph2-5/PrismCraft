import { t } from "@/shared/constants";
import { BookOpen } from "lucide-react";

interface PluginSchemaViewerProps {
  schemaData: Record<string, unknown>;
}

export function PluginSchemaViewer({ schemaData }: PluginSchemaViewerProps) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ paddingBottom: 12 }}>
        <div style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <BookOpen size={20} />
          {t("plugin.apiPluginSpec")}
        </div>
        <div style={{ fontSize: 14, color: "var(--muted-fg)" }}>{t("plugin.pluginSchemaDesc")}</div>
      </div>
      <div>
        <pre style={{ fontSize: 12, background: "#0f172a", padding: 16, borderRadius: 8, overflow: "auto", maxHeight: 600, fontFamily: "monospace", color: "var(--muted-fg)", whiteSpace: "pre-wrap" }}>
          {JSON.stringify(schemaData, null, 2)}
        </pre>
      </div>
    </div>
  );
}
