export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";
import {
  loadServerConfig,
  saveServerConfig,
  clearConfigCache,
} from "@/infrastructure/ai-providers/api-config/server";
import type { ApiConfig, ProviderConfig } from "@/infrastructure/ai-providers/api-config/types";
import { safeParseJson, sanitizeErrorMessage, maskApiKey } from "@/infrastructure/server/api-utils";

// 获取配置
export async function GET() {
  try {
    const config = await loadServerConfig();
    // 返回配置时移除 API Key（仅返回掩码）
    const safeConfig: ApiConfig = {
      ...config,
      providers: config.providers.map((p) => ({
        ...p,
        apiKey: maskApiKey(p.apiKey),
      })),
    };
    return NextResponse.json({ success: true, data: safeConfig });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}

// 保存配置
export async function POST(request: NextRequest) {
  try {
    const body = (await safeParseJson(request)) as Record<string, any>;
    const { config, action } = body;

    if (action === "clear-cache") {
      clearConfigCache();
      return NextResponse.json({ success: true });
    }

    if (config) {
      // 如果传入的 provider 没有 apiKey，保留原有配置中的 key
      const existingConfig = await loadServerConfig();
      const mergedProviders = config.providers.map((p: ProviderConfig) => {
        const existing = existingConfig.providers.find((ep) => ep.id === p.id);
        if (
          existing &&
          (!p.apiKey || p.apiKey === maskApiKey(existing.apiKey))
        ) {
          return { ...p, apiKey: existing.apiKey };
        }
        return p;
      });

      const newConfig: ApiConfig = {
        ...config,
        providers: mergedProviders,
      };

      await saveServerConfig(newConfig);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "无效请求" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}
