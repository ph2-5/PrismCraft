import type { Route } from "../types";
import { defineRoute } from "../types";
import * as referenceEngine from "@shared-logic/shot/reference-engine";
import * as consistencyCheck from "@shared-logic/shot/consistency-check";
import * as referenceCheck from "@shared-logic/shot/reference-check";
import * as visualConsistencyCheck from "@shared-logic/shot/visual-consistency-check";
import * as apiGateway from "../../api-gateway";
import {
  shotValidateReferenceSchema,
  shotGetReferenceVideoUrlSchema,
  shotBuildReferenceDescriptionSchema,
  validateConsistencySchema,
  validateFeatureAnchoringSchema,
  validateNoFrameBindingSchema,
  referenceCheckCharacterSchema,
  referenceCheckSceneSchema,
  visualConsistencyCheckSchema,
  visualConsistencyCheckBeatSchema,
} from "../schemas";

export const shotRoutes: Record<string, Route> = {
  "shot/validate-reference": defineRoute({
    schema: shotValidateReferenceSchema,
    handler: async (_m, b) => {
      const result = referenceEngine.validateReference(
        b.shot as import("@shared-logic/shot/reference-engine").Shot,
        b.allShots as import("@shared-logic/shot/reference-engine").Shot[],
        b.reference as import("@shared-logic/shot/reference-engine").Reference,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "shot/get-reference-video-url": defineRoute({
    schema: shotGetReferenceVideoUrlSchema,
    handler: async (_m, b) => {
      const url = referenceEngine.getReferenceVideoUrl(
        b.shot as import("@shared-logic/shot/reference-engine").Shot,
        b.allShots as import("@shared-logic/shot/reference-engine").Shot[],
        b.reference as import("@shared-logic/shot/reference-engine").Reference,
      );
      return { success: true, data: { videoUrl: url } };
    },
    methods: ["POST"],
  }),
  "shot/build-reference-description": defineRoute({
    schema: shotBuildReferenceDescriptionSchema,
    handler: async (_m, b) => {
      const desc = referenceEngine.buildReferenceDescription(
        b.shot as import("@shared-logic/shot/reference-engine").Shot,
        b.allShots as import("@shared-logic/shot/reference-engine").Shot[],
        b.reference as import("@shared-logic/shot/reference-engine").Reference,
      );
      return { success: true, data: { description: desc } };
    },
    methods: ["POST"],
  }),
  "validate/consistency": defineRoute({
    schema: validateConsistencySchema,
    handler: async (_m, b) => {
      const result = consistencyCheck.performConfigCheck(b as unknown as Parameters<typeof consistencyCheck.performConfigCheck>[0]);
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "validate/feature-anchoring": defineRoute({
    schema: validateFeatureAnchoringSchema,
    handler: async (_m, b) => {
      const config = b.config as import("@shared-logic/shot/consistency-check").FeatureAnchoringConfig;
      const result = consistencyCheck.validateFeatureAnchoringConfig(config);
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "validate/no-frame-binding": defineRoute({
    schema: validateNoFrameBindingSchema,
    handler: async (_m, b) => {
      const result = consistencyCheck.validateNoFrameBinding(b);
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "reference/check-character": defineRoute({
    schema: referenceCheckCharacterSchema,
    handler: async (_m, b) => {
      const result = referenceCheck.checkCharacterReferences(
        b.characterId,
        b.stories as import("@shared-logic/shot/reference-check").Story[],
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "reference/check-scene": defineRoute({
    schema: referenceCheckSceneSchema,
    handler: async (_m, b) => {
      const result = referenceCheck.checkSceneReferences(b.sceneId, b.stories as import("@shared-logic/shot/reference-check").Story[]);
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "visual-consistency/check": defineRoute({
    schema: visualConsistencyCheckSchema,
    handler: async (_m, b) => {
      const result = await visualConsistencyCheck.checkVisualConsistency(
        apiGateway as unknown as import("@shared-logic/story/storyboard-generation").ApiGateway,
        {
          generatedImageUrl: b.generatedImageUrl,
          referenceImageUrl: b.referenceImageUrl,
          element: b.element as unknown as import("@shared-logic/shot/visual-consistency-check").Element,
        },
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "visual-consistency/check-beat": defineRoute({
    schema: visualConsistencyCheckBeatSchema,
    handler: async (_m, b) => {
      const result = await visualConsistencyCheck.checkBeatElementConsistency(
        apiGateway as unknown as import("@shared-logic/story/storyboard-generation").ApiGateway,
        {
          beat: b.beat as import("@shared-logic/shot/visual-consistency-check").Beat,
          elements: b.elements as import("@shared-logic/shot/visual-consistency-check").Element[],
          getGeneratedImageUrl: (elementId: string) =>
            (b.generatedImageMap || {})[elementId],
        },
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
};
