import { Loader2, Lightbulb, FlaskConical, Save } from "lucide-react";
import { t } from "@/shared/constants";
import type { ApiCapability } from "@/infrastructure/api-config-facade";

interface ApiCapabilityMeta {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

export function EncryptedStorageHint() {
  return (
    <div
      style={{
        padding: 12,
        background: "rgba(var(--primary-rgb), 0.08)",
        border: "1px solid rgba(var(--primary-rgb), 0.2)",
        borderRadius: 8,
        fontSize: 11,
        color: "var(--muted-fg)",
      }}
    >
      <Lightbulb className="inline-block" size={12} /> {t("config.encryptedStorageHint")}
    </div>
  );
}

interface TestResultsListProps {
  testResults: Record<string, { success: boolean; message: string }>;
  capabilities: ApiCapabilityMeta[];
}

export function TestResultsList({
  testResults,
  capabilities,
}: TestResultsListProps) {
  return (
    <>
      {Object.entries(testResults).map(
        ([cap, result]) =>
          result && (
            <div
              key={cap}
              style={{
                padding: 12,
                borderRadius: 8,
                background: result.success
                  ? "rgba(var(--success-rgb, 16, 185, 129), 0.1)"
                  : "rgba(var(--destructive-rgb, 239, 68, 68), 0.1)",
                border: `1px solid ${result.success ? "var(--success)" : "var(--destructive)"}`,
                fontSize: 12,
                color: "var(--muted-fg)",
              }}
            >
              <div style={result.success ? { color: "var(--success)" } : undefined}>
                {capabilities.find((c) => c.id === cap)?.name}: {result.message}
              </div>
            </div>
          ),
      )}
    </>
  );
}

interface BottomActionBarProps {
  testingCapability: ApiCapability | null;
  onTestAllConnections: () => void;
  onSaveConfig: () => void;
}

export function BottomActionBar({
  testingCapability,
  onTestAllConnections,
  onSaveConfig,
}: BottomActionBarProps) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={onTestAllConnections}
        disabled={testingCapability !== null}
      >
        {testingCapability !== null ? (
          <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />
        ) : (
          <FlaskConical size={14} style={{ marginRight: 6 }} />
        )}
        {t("connection.testAll")}
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={onSaveConfig}
      >
        <Save size={14} style={{ marginRight: 6 }} />
        {t("connection.save")}
      </button>
    </div>
  );
}
