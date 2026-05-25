"use client";

import { useCallback, useState } from "react";
import { errorLogger } from "@/shared/error-logger";

interface SecureConfigResult {
  success: boolean;
  hasKey?: boolean;
  error?: string;
}

interface SecureConfigResolveResult {
  success: boolean;
  apiKey: string | null;
}

function getApi(): {
  secureConfigSave: (providerId: string, apiKey: string) => Promise<SecureConfigResult>;
  secureConfigLoad: (providerId: string) => Promise<SecureConfigResult>;
  secureConfigResolve: (providerId: string) => Promise<SecureConfigResolveResult>;
  secureConfigDelete: (providerId: string) => Promise<SecureConfigResult>;
  secureConfigHas: (providerId: string) => Promise<SecureConfigResult>;
} | null {
  return (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI as never ?? null;
}

export function useSecureConfig() {
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});

  const saveApiKey = useCallback(async (providerId: string, apiKey: string): Promise<boolean> => {
    const api = getApi();
    if (!api) {
      errorLogger.error(
        { code: "SECURE_CONFIG_NO_ELECTRON", message: "API Key storage requires Electron. Please run in the desktop app." },
        "SecureConfig",
      );
      return false;
    }
    const result = await api.secureConfigSave(providerId, apiKey);
    if (result.success) {
      setKeyStatus((prev) => ({ ...prev, [providerId]: true }));
    }
    return result.success;
  }, []);

  const hasApiKey = useCallback(async (providerId: string): Promise<boolean> => {
    const api = getApi();
    if (!api) {
      return false;
    }
    const result = await api.secureConfigHas(providerId);
    return result.success && !!result.hasKey;
  }, []);

  const resolveApiKey = useCallback(async (providerId: string): Promise<string | null> => {
    const api = getApi();
    if (!api) {
      return null;
    }
    const result = await api.secureConfigResolve(providerId);
    return result.success ? result.apiKey : null;
  }, []);

  const deleteApiKey = useCallback(async (providerId: string): Promise<boolean> => {
    const api = getApi();
    if (!api) {
      return false;
    }
    const result = await api.secureConfigDelete(providerId);
    if (result.success) {
      setKeyStatus((prev) => ({ ...prev, [providerId]: false }));
    }
    return result.success;
  }, []);

  const checkKeyStatus = useCallback(async (providerIds: string[]) => {
    const results = await Promise.all(
      providerIds.map(async (id) => {
        const has = await hasApiKey(id);
        return [id, has] as const;
      }),
    );
    const status: Record<string, boolean> = {};
    for (const [id, has] of results) {
      status[id] = has;
    }
    setKeyStatus(status);
  }, [hasApiKey]);

  return {
    saveApiKey,
    hasApiKey,
    resolveApiKey,
    deleteApiKey,
    checkKeyStatus,
    keyStatus,
  };
}
