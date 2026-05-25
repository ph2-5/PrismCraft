"use client";

import { useEffect, useState } from "react";
import { container } from "@/infrastructure/di";
import type { ConfigStatus } from "@/infrastructure/di";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Settings, X } from "lucide-react";
import Link from "next/link";

export function ConfigCheckBanner() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const data = JSON.parse(
        localStorage.getItem("config-banner-dismissed") || "{}",
      );
      if (data.dismissed && data.expiresAt && Date.now() < data.expiresAt) {
        return true;
      }
      if (data.dismissed && !data.expiresAt) {
        localStorage.removeItem("config-banner-dismissed");
      }
    } catch {
      localStorage.removeItem("config-banner-dismissed");
    }
    return false;
  });

  useEffect(() => {
    let cancelled = false;
    container.initConfig();
    const loadStatus = async () => {
      const configStatus = await container.checkConfigStatus();
      if (!cancelled) {
        setStatus(configStatus);
      }
    };
    loadStatus();
    return () => { cancelled = true; };
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(
      "config-banner-dismissed",
      JSON.stringify({
        dismissed: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
  };

  if (!status || status.allConfigured || dismissed) {
    return null;
  }

  return (
    <Alert className="mb-4 border-orange-700/50 bg-orange-950/30 dark:border-orange-700/50 dark:bg-orange-950/30">
      <AlertTitle className="flex items-center gap-2 text-orange-400 dark:text-orange-400">
        <Settings className="h-4 w-4" />
        API 配置不完整
      </AlertTitle>
      <AlertDescription className="text-orange-300 dark:text-orange-300">
        <p className="mb-2">
          已配置 {status.configuredCount}/{status.totalCount} 项功能， 缺少:{" "}
          {status.missing.join("、")}
        </p>
        <div className="flex items-center gap-2">
          <Link href="/settings">
            <Button
              variant="outline"
              size="sm"
              className="border-orange-700/50 text-orange-300 hover:bg-orange-900/30 hover:text-orange-200"
            >
              前往设置
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-orange-500 hover:text-orange-300"
          >
            <X className="h-4 w-4 mr-1" />
            忽略
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
