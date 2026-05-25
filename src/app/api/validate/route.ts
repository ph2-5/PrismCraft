export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";
import {
  performConsistencyCheck,
  validateFeatureAnchoringConfigFull,
  validateNoFrameBindingParams,
} from "@/modules/shot";
import { validateApiKey, detectProvider } from "@/infrastructure/ai-providers/api-config/detect";
import { getModelCapabilities } from "@/infrastructure/ai-providers/model-capabilities";
import { safeParseJson, sanitizeErrorMessage } from "@/infrastructure/server/api-utils";
import { errorLogger } from "@/shared/error-logger";

export async function POST(request: NextRequest) {
  try {
    const body = (await safeParseJson(request)) as Record<string, any>;
    const { type, params } = body;

    if (!params || typeof params !== "object") {
      return NextResponse.json(
        { success: false, error: "参数不能为空" },
        { status: 400 },
      );
    }

    switch (type) {
      case "consistency-check": {
        const result = performConsistencyCheck(params);
        return NextResponse.json({ success: true, data: result });
      }

      case "feature-anchoring": {
        const featureAnchoringResult = validateFeatureAnchoringConfigFull(params.config);
        return NextResponse.json({ success: true, data: featureAnchoringResult });
      }

      case "no-frame-binding": {
        const result = validateNoFrameBindingParams(params);
        return NextResponse.json({ success: true, data: result });
      }

      case "api-key": {
        const result = validateApiKey(params.apiKey);
        return NextResponse.json({ success: true, data: result });
      }

      case "detect-provider": {
        const result = detectProvider(params.apiKey);
        return NextResponse.json({ success: true, data: result });
      }

      case "model-capabilities": {
        const result = getModelCapabilities(params.modelId);
        return NextResponse.json({ success: true, data: result });
      }

      default:
        return NextResponse.json(
          { success: false, error: `未知的校验类型: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    errorLogger.error("[API Validate] Error:", error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
