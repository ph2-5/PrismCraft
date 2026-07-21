export const ShotParamsSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "ShotGenerationParams",
  type: "object",
  // PR 7：shotType/cameraAngle/cameraMovement 旧字段已彻底删除，只保留 shotInstruction
  required: ["prompt", "duration"],
  properties: {
    prompt: {
      type: "string",
      minLength: 10,
      maxLength: 4000,
      description: "镜头生成提示词",
    },
    shotInstruction: {
      type: "object",
      properties: {
        shotSize: {
          type: "string",
          enum: [
            "wide",
            "medium",
            "close",
            "extreme_close",
            "extreme_wide",
            "low",
            "high",
            "birdseye",
            "wormseye",
          ],
          description: "镜头景别",
        },
        cameraAngle: {
          type: "string",
          enum: [
            "eye_level",
            "low",
            "high",
            "birds_eye",
            "worms_eye",
            "dutch",
          ],
          description: "镜头角度",
        },
        cameraMovement: {
          type: "string",
          enum: [
            "static",
            "push",
            "pull",
            "pan",
            "orbit",
            "crane_up",
            "crane_down",
            "tracking",
          ],
          description: "运镜方式",
        },
      },
      description: "镜头指令（替代旧 shotType + cameraAngle + cameraMovement 顶层字段）",
    },
    duration: {
      type: "number",
      minimum: 2,
      maximum: 30,
      description: "镜头时长(秒)",
    },
    characterIds: {
      type: "array",
      items: { type: "string" },
      description: "角色ID列表",
    },
    sceneId: {
      type: "string",
      description: "场景ID",
    },
    referenceImageUrl: {
      type: "string",
      format: "uri",
      description: "参考图URL",
    },
    firstFrameUrl: {
      type: "string",
      format: "uri",
      description: "首帧URL",
    },
    lastFrameUrl: {
      type: "string",
      format: "uri",
      description: "尾帧URL",
    },
    featureAnchoring: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        characterAnchors: {
          type: "array",
          items: {
            type: "object",
            required: ["elementId", "weight"],
            properties: {
              elementId: { type: "string" },
              referenceImageUrl: { type: "string" },
              featureTags: {
                type: "array",
                items: { type: "string" },
              },
              weight: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
        previewImageUrl: { type: "string" },
        featureConsistencyStrength: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        disableFrameBinding: { type: "boolean" },
      },
      description: "特征锚定配置",
    },
    promptLayers: {
      type: "object",
      properties: {
        coreElements: { type: "string" },
        cameraAction: { type: "string" },
        styleAtmosphere: { type: "string" },
      },
      description: "提示词层级",
    },
    transition: {
      type: "string",
      enum: ["cut", "dissolve", "fade", "wipe"],
      description: "转场效果",
    },
  },
  additionalProperties: true,
} as const;

export const StoryBeatOutputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "StoryBeatOutput",
  type: "object",
  // PR 7：shotType/cameraAngle/cameraMovement 旧字段已彻底删除，只保留 shotInstruction
  required: ["title", "content", "duration"],
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 100,
    },
    content: {
      type: "string",
      minLength: 10,
      maxLength: 2000,
    },
    description: {
      type: "string",
      maxLength: 2000,
    },
    duration: {
      type: "number",
      minimum: 2,
      maximum: 30,
    },
    shotInstruction: {
      type: "object",
      properties: {
        shotSize: {
          type: "string",
          enum: [
            "wide",
            "medium",
            "close",
            "extreme_close",
            "extreme_wide",
            "low",
            "high",
            "birdseye",
            "wormseye",
          ],
        },
        cameraAngle: {
          type: "string",
          enum: [
            "eye_level",
            "low",
            "high",
            "birds_eye",
            "worms_eye",
            "dutch",
          ],
        },
        cameraMovement: {
          type: "string",
          enum: [
            "static",
            "push",
            "pull",
            "pan",
            "orbit",
            "crane_up",
            "crane_down",
            "tracking",
          ],
        },
      },
      description: "镜头指令（替代旧 shotType + cameraAngle + cameraMovement 顶层字段）",
    },
    type: {
      type: "string",
      enum: ["action", "dialogue", "scene", "transition", "effect"],
    },
    characterIds: {
      type: "array",
      items: { type: "string" },
    },
    sceneId: {
      type: "string",
    },
    dialogue: {
      type: "string",
    },
    emotion: {
      type: "string",
    },
  },
  additionalProperties: true,
} as const;

export const StoryPlanOutputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "StoryPlanOutput",
  type: "array",
  items: {
    ...StoryBeatOutputSchema,
  },
  minItems: 1,
  maxItems: 30,
} as const;

export type ShotParamsType = {
  prompt: string;
  shotInstruction?: {
    shotSize?: string;
    cameraAngle?: string;
    cameraMovement?: string;
  };
  duration: number;
  characterIds?: string[];
  sceneId?: string;
  referenceImageUrl?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  featureAnchoring?: Record<string, unknown>;
  promptLayers?: { coreElements?: string; cameraAction?: string; styleAtmosphere?: string };
  transition?: string;
};
