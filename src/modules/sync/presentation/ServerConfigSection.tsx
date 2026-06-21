import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { CheckCircle2, AlertTriangle, Loader2, Server, Unplug } from "lucide-react";
import { t } from "@/shared/constants";

export type ConnectionStatus = "disconnected" | "testing" | "connected" | "error";

interface ServerConfigSectionProps {
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  username: string;
  onUsernameChange: (username: string) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  connectionStatus: ConnectionStatus;
  connectionMessage: string;
  serverVersion: string | null;
  onTestConnection: () => void;
  enabled: boolean;
}

export function ServerConfigSection({
  serverUrl,
  onServerUrlChange,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  connectionStatus,
  connectionMessage,
  serverVersion,
  onTestConnection,
  enabled,
}: ServerConfigSectionProps) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Server className="h-4 w-4" />
        {t("sync.serverConfig")}
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t("sync.serverAddress")}</Label>
        <Input
          data-testid="sync-server-url-input"
          placeholder="https://sync.example.com"
          value={serverUrl}
          onChange={(e) => onServerUrlChange(e.target.value)}
          disabled={!enabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs">{t("sync.username")}</Label>
          <Input
            data-testid="sync-username-input"
            placeholder="admin"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            disabled={!enabled}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">{t("sync.password")}</Label>
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={!enabled}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          {connectionStatus === "connected" && (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span className="text-green-600">{connectionMessage}</span>
              {serverVersion && (
                <span className="text-muted-foreground">({serverVersion})</span>
              )}
            </>
          )}
          {connectionStatus === "testing" && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
              <span className="text-blue-500">{t("sync.testingConnection")}</span>
            </>
          )}
          {connectionStatus === "error" && (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-red-500">{connectionMessage}</span>
            </>
          )}
          {connectionStatus === "disconnected" && (
            <>
              <Unplug className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{t("sync.disconnected")}</span>
            </>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onTestConnection}
          disabled={
            !enabled ||
            !serverUrl ||
            !username ||
            !password ||
            connectionStatus === "testing"
          }
          className="h-7 text-xs"
        >
          {connectionStatus === "testing" ? t("sync.testing") : t("sync.testConnection")}
        </Button>
      </div>
    </div>
  );
}
