import { useEffect, useState, useCallback } from "react";
import { checkConfigStatus, initConfig } from "@/shared/api-config";
import type { ConfigStatus } from "@/infrastructure/di";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Settings, X } from "lucide-react";
import { Link } from "react-router-dom";
import { usePreference } from "@/shared/utils/preferences";
import { t } from "@/shared/constants";

const BANNER_KEY = "config-banner-dismissed";

interface BannerDismissState {
  dismissed?: boolean;
  expiresAt?: number;
}

export function ConfigCheckBanner() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [dismissState, setDismissState] = usePreference<BannerDismissState>(BANNER_KEY, {});
  const dismissed = !!(dismissState.dismissed && dismissState.expiresAt && Date.now() < dismissState.expiresAt);

  useEffect(() => {
    if (dismissState.dismissed && !dismissState.expiresAt) {
      setDismissState({});
    }
  }, [dismissState, setDismissState]);

  useEffect(() => {
    let cancelled = false;
    initConfig();
    const loadStatus = async () => {
      const configStatus = await checkConfigStatus();
      if (!cancelled) {
        setStatus(configStatus);
      }
    };
    loadStatus();
    return () => { cancelled = true; };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissState({
      dismissed: true,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
  }, [setDismissState]);

  if (!status || status.allConfigured || dismissed) {
    return null;
  }

  return (
    <Alert className="mb-4 border-orange-700/50 bg-orange-950/30 dark:border-orange-700/50 dark:bg-orange-950/30">
      <AlertTitle className="flex items-center gap-2 text-orange-400 dark:text-orange-400">
        <Settings className="h-4 w-4" />
        {t("config.incompleteTitle")}
      </AlertTitle>
      <AlertDescription className="text-orange-300 dark:text-orange-300">
        <p className="mb-2">
          {t("config.configuredCount", { count: status.configuredCount, total: status.totalCount })}， {t("config.missing")}{" "}
          {status.missing.join("、")}
        </p>
        <div className="flex items-center gap-2">
          <Link to="/settings">
            <Button
              variant="outline"
              size="sm"
              className="border-orange-700/50 text-orange-300 hover:bg-orange-900/30 hover:text-orange-200"
            >
              {t("config.goToSettings")}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-orange-500 hover:text-orange-300"
          >
            <X className="h-4 w-4 mr-1" />
            {t("config.dismiss")}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
