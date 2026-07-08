import { t } from "@/shared/constants";
import { BookOpen } from "lucide-react";

interface PluginSpecViewerProps {
  specContent: string;
}

export function PluginSpecViewer({ specContent }: PluginSpecViewerProps) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ paddingBottom: 12 }}>
        <div style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <BookOpen size={20} />
          {t("plugin.pluginSpecDoc")}
        </div>
        <div style={{ fontSize: 14, color: "var(--muted-fg)" }}>{t("plugin.pluginSpecDocDesc")}</div>
      </div>
      <div>
        <pre style={{ fontSize: 12, background: "var(--card2)", padding: 16, borderRadius: 8, overflow: "auto", maxHeight: 600, fontFamily: "monospace", color: "var(--muted-fg)", whiteSpace: "pre-wrap" }}>
          {specContent}
        </pre>
      </div>
    </div>
  );
}
