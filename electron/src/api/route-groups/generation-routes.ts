import type { Route } from "../types";
import { defineRoute } from "../types";
import * as apiGateway from "../../api-gateway";
import * as storyService from "@shared-logic/story/story-service";
import * as videoTaskService from "@shared-logic/video/video-task-params";
import * as promptService from "@shared-logic/prompt/prompt-service";
import {
  analyzeImageSchema,
  generateImageSchema,
  generateKeyframeSchema,
  generateFramePairSchema,
  generateVideoSchema,
  videoStatusSchema,
  generateTextSchema,
  storyPlanSchema,
  storyGenerateVideoSchema,
  storyGenerateKeyframeSchema,
  storyGenerateFramePairSchema,
  quickGenerateVideoSchema,
  characterGenerateImageSchema,
  sceneGenerateImageSchema,
  characterAnalyzeImageSchema,
  sceneAnalyzeImageSchema,
} from "../schemas";

export const generationRoutes: Record<string, Route> = {
  "analyze-image": defineRoute({
    schema: analyzeImageSchema,
    handler: (_m, b) => apiGateway.analyzeImage(b),
    methods: ["POST"],
  }),
  "generate-image": defineRoute({
    schema: generateImageSchema,
    handler: (_m, b) => apiGateway.generateImage(b),
    methods: ["POST"],
  }),
  "generate-keyframe": defineRoute({
    schema: generateKeyframeSchema,
    handler: (_m, b) => apiGateway.generateKeyframe(b),
    methods: ["POST"],
  }),
  "generate-frame-pair": defineRoute({
    schema: generateFramePairSchema,
    handler: (_m, b) => apiGateway.generateFramePair(b),
    methods: ["POST"],
  }),
  "generate-video": defineRoute({
    schema: generateVideoSchema,
    handler: (_m, b) => apiGateway.generateVideo(b),
    methods: ["POST"],
  }),
  "video-status": defineRoute({
    schema: videoStatusSchema,
    handler: (_m, b) => apiGateway.videoStatus(b),
    methods: ["GET", "POST"],
  }),
  "generate-text": defineRoute({
    schema: generateTextSchema,
    handler: (_m, b) => apiGateway.generateText(b),
    methods: ["POST"],
  }),
  "story/plan": defineRoute({
    schema: storyPlanSchema,
    handler: async (_m, b) => {
      const result = await storyService.generateStoryPlanWithValidation(
        b.story || {},
        b.characters || [],
        b.scenes || [],
        { ...b.options, planPrompt: b.planPrompt },
        (prompt: string, opts: Record<string, unknown>) => apiGateway.generateText({ prompt, ...opts }),
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "story/generate-video": defineRoute({
    schema: storyGenerateVideoSchema,
    handler: async (_m, b) => {
      const params = videoTaskService.buildVideoGenerationParams(b);
      // VideoGenerationParams is an interface (no implicit index signature), so it is not
      // directly assignable to Record<string, unknown> expected by generateVideo.
      return apiGateway.generateVideo(params as unknown as Record<string, unknown>);
    },
    methods: ["POST"],
  }),
  "story/generate-keyframe": defineRoute({
    schema: storyGenerateKeyframeSchema,
    handler: async (_m, b) => {
      // Schema uses z.unknown().optional() for beat because Beat is a complex shared-logic type;
      // buildKeyframeGenerationParams expects { beat: Beat; ... } (beat required, typed).
      const params = videoTaskService.buildKeyframeGenerationParams(b as unknown as Parameters<typeof videoTaskService.buildKeyframeGenerationParams>[0]);
      return apiGateway.generateKeyframe(params);
    },
    methods: ["POST"],
  }),
  "story/generate-frame-pair": defineRoute({
    schema: storyGenerateFramePairSchema,
    handler: async (_m, b) => {
      // Schema uses z.unknown().optional() for beat because Beat is a complex shared-logic type;
      // buildFramePairGenerationParams expects { beat: Beat; ... } (beat required, typed).
      const params = videoTaskService.buildFramePairGenerationParams(b as unknown as Parameters<typeof videoTaskService.buildFramePairGenerationParams>[0]);
      const firstFrameResult = await apiGateway.generateKeyframe({
        ...params.firstFrame,
        prompt:
          params.firstFrame.prompt ||
          promptService.generateFirstFramePrompt(params.firstFrame),
      });
      let lastFrameResult: { success: boolean; data?: { imageUrl?: string }; error?: string | { code: string; message: string } } | null = null;
      if (firstFrameResult.success) {
        lastFrameResult = await apiGateway.generateKeyframe({
          ...params.lastFrame,
          prompt:
            params.lastFrame.prompt ||
            promptService.generateLastFramePrompt(params.lastFrame),
        });
      }
      return {
        success: true,
        data: {
          firstFrameUrl: firstFrameResult.data?.imageUrl,
          lastFrameUrl: lastFrameResult?.success
            ? lastFrameResult.data?.imageUrl
            : null,
          lastFrameError:
            lastFrameResult && !lastFrameResult.success
              ? lastFrameResult.error
              : null,
        },
      };
    },
    methods: ["POST"],
  }),
  "quick-generate/video": defineRoute({
    schema: quickGenerateVideoSchema,
    handler: async (_m, b) => {
      const params = videoTaskService.buildQuickVideoParams(b);
      return apiGateway.generateVideo(params);
    },
    methods: ["POST"],
  }),
  "character/generate-image": defineRoute({
    schema: characterGenerateImageSchema,
    handler: async (_m, b) => {
      const character = b.character;
      const useDetailedPrompt = b.useDetailedPrompt;
      const imageSize = b.imageSize;
      const providerId = b.providerId;
      const modelId = b.modelId;
      const imagePrompt = b.imagePrompt;
      const detailedPromptInstruction = b.detailedPromptInstruction;
      let finalPrompt: string =
        imagePrompt || promptService.generateCharacterImagePrompt(character as import("@shared-logic/prompt/prompt-service").CharacterInput);
      if (useDetailedPrompt && !imagePrompt) {
        const instruction: string =
          detailedPromptInstruction ||
          promptService.generateCharacterDetailedPromptInstruction(character as import("@shared-logic/prompt/prompt-service").CharacterInput);
        const detailedResult = await apiGateway.generateText({
          prompt: instruction,
          maxTokens: 300,
          temperature: 0.7,
        });
        if (detailedResult.success && (detailedResult.data as Record<string, unknown>)?.text) {
          finalPrompt = (detailedResult.data as Record<string, unknown>).text as string;
        }
      }
      return apiGateway.generateImage({
        prompt: finalPrompt,
        category: "character",
        size: imageSize || "1024x1024",
        providerId,
        modelId,
      });
    },
    methods: ["POST"],
  }),
  "scene/generate-image": defineRoute({
    schema: sceneGenerateImageSchema,
    handler: async (_m, b) => {
      const scene = b.scene;
      const useDetailedPrompt = b.useDetailedPrompt;
      const imageSize = b.imageSize;
      const providerId = b.providerId;
      const modelId = b.modelId;
      const imagePrompt = b.imagePrompt;
      const detailedPromptInstruction = b.detailedPromptInstruction;
      let finalPrompt: string =
        imagePrompt ||
        (scene.imageGenerationPrompt as string | undefined) ||
        promptService.generateSceneImagePrompt(scene as import("@shared-logic/prompt/prompt-service").SceneInput);
      if (useDetailedPrompt && !imagePrompt) {
        const instruction: string =
          detailedPromptInstruction ||
          promptService.generateScenePromptOptimization(
            (scene.description as string | undefined) || finalPrompt,
          );
        const detailedResult = await apiGateway.generateText({
          prompt: instruction,
          maxTokens: 300,
          temperature: 0.8,
        });
        if (detailedResult.success && (detailedResult.data as Record<string, unknown>)?.text) {
          finalPrompt = (detailedResult.data as Record<string, unknown>).text as string;
        }
      }
      return apiGateway.generateImage({
        prompt: finalPrompt,
        category: "scene",
        size: imageSize || "1024x1024",
        providerId,
        modelId,
      });
    },
    methods: ["POST"],
  }),
  "character/analyze-image": defineRoute({
    schema: characterAnalyzeImageSchema,
    handler: async (_m, b) => {
      const analysisPrompt: string =
        b.analysisPrompt || promptService.generateCharacterAnalysisPrompt();
      return apiGateway.analyzeImage({ ...b, prompt: analysisPrompt });
    },
    methods: ["POST"],
  }),
  "scene/analyze-image": defineRoute({
    schema: sceneAnalyzeImageSchema,
    handler: async (_m, b) => {
      const analysisPrompt: string =
        b.analysisPrompt || promptService.generateSceneAnalysisPrompt();
      return apiGateway.analyzeImage({ ...b, prompt: analysisPrompt });
    },
    methods: ["POST"],
  }),
};
