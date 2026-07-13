import { Loader2, Lightbulb, FlaskConical, Save } from "lucide-react";
import { t } from "@/shared/constants";
import type { ApiCapability } from "@/shared/api-config";

interface ApiCapabilityMeta {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

export function EncryptedStorageHint() {
  return (
    <div className="tip-box">
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
              className="p-3 rounded-lg text-xs text-muted-foreground"
              style={{
                background: result.success
                  ? "rgba(var(--success-rgb, 16, 185, 129), 0.1)"
                  : "rgba(var(--destructive-rgb, 239, 68, 68), 0.1)",
                border: `1px solid ${result.success ? "var(--success)" : "var(--destructive)"}`,
              }}
            >
              <div className={result.success ? "text-success" : undefined}>
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
    <div className="flex gap-2 justify-end">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={onTestAllConnections}
        disabled={testingCapability !== null}
      >
        {testingCapability !== null ? (
          <Loader2 size={14} className="animate-spin mr-1.5" />
        ) : (
          <FlaskConical size={14} className="mr-1.5" />
        )}
        {t("connection.testAll")}
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={onSaveConfig}
      >
        <Save size={14} className="mr-1.5" />
        {t("connection.save")}
      </button>
    </div>
  );
}
