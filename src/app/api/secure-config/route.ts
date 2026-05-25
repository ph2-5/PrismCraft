export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";
import {
  loadServerConfig,
  saveServerConfig,
  clearConfigCache,
} from "@/infrastructure/ai-providers/api-config/server";
import type { ApiConfig, ProviderConfig } from "@/infrastructure/ai-providers/api-config/types";
import { safeParseJson, sanitizeErrorMessage, maskApiKey } from "@/infrastructure/server/api-utils";

type SaveConfigBody = {
  version?: unknown;
  providers?: unknown;
  [key: string]: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = await safeParseJson(request);
    const operation = body.operation;
    const cfg = body.config as SaveConfigBody | undefined;

    switch (operation) {
      case "save":
        if (cfg) {
          if (!cfg.version || !Array.isArray(cfg.providers)) {
            return NextResponse.json(
              { success: false, error: "配置格式无效" },
              { status: 400 },
            );
          }
          const existingConfig = await loadServerConfig();
          const mergedProviders = (cfg.providers as Array<ProviderConfig & { apiKey?: string }>).map((p) => {
            const existing = existingConfig.providers.find(
              (ep) => ep.id === p.id,
            );
            if (
              existing &&
              (!p.apiKey || p.apiKey === maskApiKey(existing.apiKey))
            ) {
              return { ...p, apiKey: existing.apiKey };
            }
            return p;
          });
          const configToSave: ApiConfig = { ...(cfg as unknown as ApiConfig), providers: mergedProviders };
          await saveServerConfig(configToSave);
        }
        return NextResponse.json({ success: true, message: "配置已保存" });
      case "load":
        const serverConfig = await loadServerConfig();
        const safeConfig = {
          ...serverConfig,
          providers: (serverConfig.providers || []).map((p: ProviderConfig) => ({
            ...p,
            apiKey: maskApiKey(p.apiKey),
          })),
        };
        return NextResponse.json({ success: true, config: safeConfig });
      case "clear":
        clearConfigCache();
        await saveServerConfig({
          version: 1,
          providers: [],
          mapping: {},
          fallback: {
            enabled: true,
            order: ["text", "image", "vision", "video"],
          },
          freeImageBackup: true,
        });
        return NextResponse.json({ success: true, message: "配置已清除" });
      default:
        return NextResponse.json(
          { success: false, error: "Unknown operation" },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}
