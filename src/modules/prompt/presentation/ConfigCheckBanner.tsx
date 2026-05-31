"use client";

import { useEffect, useState, useSyncExternalStore, useCallback } from "react";
import { checkConfigStatus, initConfig } from "@/shared/api-config";
import type { ConfigStatus } from "@/infrastructure/di";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Settings, X } from "lucide-react";
import Link from "next/link";

const BANNER_KEY = "config-banner-dismissed";

const bannerListeners = new Set<() => void>();

function subscribeBanner(callback: () => void): () => void {
  bannerListeners.add(callback);
  return () => { bannerListeners.delete(callback); };
}

function getBannerDismissedSnapshot(): boolean {
  try {
    const data = JSON.parse(
      localStorage.getItem(BANNER_KEY) || "{}",
    );
    if (data.dismissed && data.expiresAt && Date.now() < data.expiresAt) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function getBannerDismissedServerSnapshot(): boolean {
  return false;
}

export function ConfigCheckBanner() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const dismissed = useSyncExternalStore(subscribeBanner, getBannerDismissedSnapshot, getBannerDismissedServerSnapshot);

  useEffect(() => {
    try {
      const data = JSON.parse(
        localStorage.getItem(BANNER_KEY) || "{}",
      );
      if (data.dismissed && !data.expiresAt) {
        localStorage.removeItem(BANNER_KEY);
      }
    } catch {
      localStorage.removeItem(BANNER_KEY);
    }
  }, []);

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
    localStorage.setItem(
      BANNER_KEY,
      JSON.stringify({
        dismissed: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    bannerListeners.forEach(l => l());
  }, []);

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
