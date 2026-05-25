export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";
import { promptBuilder,
  generateProfessionalVideoPrompt,
  generateEnhancedVideoPrompt,
  generateQuickVideoPrompt,
  generateSingleBeatPrompt,
  generateBeatImagePrompt,
  generateSimpleBeatImagePrompt,
  generateCharacterImagePrompt,
  generateSimpleCharacterImagePrompt,
  generateSceneImagePrompt,
  generateSimpleSceneImagePrompt,
  generateStoryPlanPrompt,
  generateQuickModeVideoPrompt,
} from "@/modules/prompt";
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

    let prompt = "";

    switch (type) {
      // 视频提示词
      case "professional-video":
        prompt = generateProfessionalVideoPrompt(params);
        break;
      case "enhanced-video":
        prompt = generateEnhancedVideoPrompt(params);
        break;
      case "quick-video":
        prompt = generateQuickVideoPrompt(params);
        break;
      case "single-beat":
        prompt = generateSingleBeatPrompt(params);
        break;
      case "quick-mode":
        prompt = generateQuickModeVideoPrompt(params);
        break;

      // 图片提示词
      case "beat-image":
        prompt = generateBeatImagePrompt(params);
        break;
      case "simple-beat-image":
        prompt = generateSimpleBeatImagePrompt(
          params.beat,
          params.characters,
          params.scenes,
        );
        break;
      case "character-image":
        prompt = generateCharacterImagePrompt(params.character);
        break;
      case "simple-character-image":
        prompt = generateSimpleCharacterImagePrompt(params.character);
        break;
      case "scene-image":
        prompt = generateSceneImagePrompt(params.scene);
        break;
      case "simple-scene-image":
        prompt = generateSimpleSceneImagePrompt(params.scene);
        break;

      // 故事规划
      case "story-plan":
        prompt = generateStoryPlanPrompt(params);
        break;

      // 特征锚定提示词
      case "feature-anchored":
        prompt = promptBuilder.buildFeatureAnchoredPrompt(
          params.shot,
          params.elements,
          params.featureAnchoring,
          params.shotInstruction,
        );
        break;

      case "first-shot":
        prompt = promptBuilder.buildFirstShotPrompt(
          params.shot,
          params.elements,
        );
        break;

      case "inheritance":
        prompt = promptBuilder.buildInheritancePrompt(
          params.shot,
          params.elements,
          params.previousShot,
        );
        break;

      case "independent-shot":
        prompt = promptBuilder.buildIndependentShotPrompt(
          params.shot,
          params.elements,
          params.reference,
          params.referenceShot,
        );
        break;

      case "cross-reference":
        prompt = promptBuilder.buildCrossReferencePrompt(
          params.shot,
          params.elements,
          params.reference,
          params.referenceShot,
        );
        break;

      default:
        return NextResponse.json(
          { success: false, error: `未知的提示词类型: ${type}` },
          { status: 400 },
        );
    }

    return NextResponse.json({
      success: true,
      data: { prompt, type },
    });
  } catch (error) {
    errorLogger.error("[API Build Prompt] Error:", error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
