import type {
  AIProviderPlugin,
  ModelCapabilities,
  ProviderCapabilities,
  VideoCapabilities,
  ImageCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  VisionBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  VisionRequestResult,
  ImageTransportMode,
  ImagePurpose,
  CloudProviderInfo,
  ApiKeyDetection,
} from "../types";
import { BaseAIProviderPlugin } from "../base-provider";

const VIDEO_CAPABILITIES: VideoCapabilities = {
  supportsLastFrame: true,
  supportsReferenceVideo: true,
  supportsMimicryLevel: true,
  supportsCharacterRef: true,
  supportsSceneRef: true,
  characterRefMode: "bake_into_first",
  sceneRefMode: "bake_into_first",
  imageUploadMode: "base64",
  maxCharacterRefs: 4,
  defaultModel: "doubao-seedance-1-0-pro-250528",
  // maxDuration 取各模型最大值：doubao-seedance-2-5 支持原生 30 秒
  maxDuration: 30,
  supportedCodecs: ["h264", "h265"],
  urlTtl: 86400,
};

const IMAGE_CAPABILITIES: ImageCapabilities = {
  supportsReferenceImage: false,
  defaultModel: "doubao-seedream-4-0-250828",
};

const MODEL_CAPS_MAP: Record<string, ModelCapabilities> = {
  "doubao-seedance-2-5": {
    // Seedance 2.5 (2026-07-06 上线)：单段原生 30 秒 4K 直出，50 路全模态参考
    maxReferences: 50,
    maxResolution: 4096,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    defaultImageSize: "3840x2160",
    supportedImageSizes: [
      { width: 3840, height: 2160, label: "3840×2160 (4K)", aspectRatio: "16:9" },
      { width: 2160, height: 3840, label: "2160×3840 (4K 竖屏)", aspectRatio: "9:16" },
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
    ],
  },
  "doubao-seedance-1-0-pro-250528": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  },
  "doubao-seedance-1-0-pro-fast": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  },
  "doubao-seedance-1-0-lite": {
    maxReferences: 4,
    maxResolution: 1280,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    defaultImageSize: "1280x720",
    supportedImageSizes: [
      { width: 1280, height: 720, label: "1280×720", aspectRatio: "16:9" },
    ],
  },
  "doubao-seedance-1-5-pro": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  },
  "doubao-seedance-2-0": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  },
  "doubao-seedance-2-0-fast": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  },
  "doubao-seedream-4-0-250828": {
    supportsLastFrame: false,
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  } as ModelCapabilities,
  "doubao-seedream-4-5": {
    supportsLastFrame: false,
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  } as ModelCapabilities,
  "doubao-seedream-5-0": {
    supportsLastFrame: false,
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  } as ModelCapabilities,
};

const DEFAULT_MODEL_CAPS: ModelCapabilities = {
  maxReferences: 4,
  maxResolution: 2048,
  maxSizeMB: 10,
  supportsLastFrame: true,
  referenceMode: "separate",
  defaultImageSize: "1920x1920",
  supportedImageSizes: [
    { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
  ],
};

export class VolcenginePlugin extends BaseAIProviderPlugin implements AIProviderPlugin {
  readonly id = "volcengine";
  readonly displayName = "火山引擎 (Doubao)";
  get capabilities(): ProviderCapabilities {
    return {
      video: true,
      image: true,
      text: false,
      vision: false,
    };
  }
  readonly videoCapabilities = VIDEO_CAPABILITIES;
  readonly imageCapabilities = IMAGE_CAPABILITIES;

  match(apiUrl: string, _model?: string): boolean {
    return apiUrl.includes("volces.com") || apiUrl.includes("bytepluses.com");
  }

  getModelCapabilities(modelId: string): ModelCapabilities {
    const isLiteI2V = modelId.includes("lite-i2v");
    const isLiteT2V = modelId.includes("lite-t2v");

    for (const [key, caps] of Object.entries(MODEL_CAPS_MAP)) {
      if (modelId.includes(key) || key.includes(modelId)) {
        if (isLiteI2V) {
          return { ...caps, characterRefMode: "ref_field", sceneRefMode: "ref_field", nativeCharacterRef: true, nativeSceneRef: true };
        }
        if (isLiteT2V) {
          return { ...caps, characterRefMode: "none", sceneRefMode: "none", supportsCharacterRef: false, supportsSceneRef: false };
        }
        return caps;
      }
    }

    if (isLiteI2V) {
      return { ...DEFAULT_MODEL_CAPS, characterRefMode: "ref_field", sceneRefMode: "ref_field", nativeCharacterRef: true, nativeSceneRef: true };
    }
    if (isLiteT2V) {
      return { ...DEFAULT_MODEL_CAPS, characterRefMode: "none", sceneRefMode: "none", supportsCharacterRef: false, supportsSceneRef: false };
    }
    return DEFAULT_MODEL_CAPS;
  }

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult {
    const content: Record<string, unknown>[] = [
      { type: "text", text: ctx.prompt },
    ];

    const isLiteI2V = ctx.model?.includes("lite-i2v");

    if (ctx.firstFrameUrl) {
      content.push({ type: "image_url", image_url: { url: ctx.firstFrameUrl }, role: "first_frame" });
    }

    if (ctx.lastFrameUrl) {
      content.push({ type: "image_url", image_url: { url: ctx.lastFrameUrl }, role: "last_frame" });
    }

    if (isLiteI2V) {
      const charRefs = ctx.characterRefs?.length ? ctx.characterRefs : (ctx.characterRef ? [ctx.characterRef] : []);
      const allRefImages = [...charRefs];
      if (ctx.sceneRef) allRefImages.push(ctx.sceneRef);

      for (const ref of allRefImages.slice(0, 4)) {
        if (ref) content.push({ type: "image_url", image_url: { url: ref }, role: "reference_image" });
      }
    }

    const body: Record<string, unknown> = {
      model: ctx.model || "doubao-seedance-1-0-pro-250528",
      content,
    };

    const isSeedance15 =
      ctx.model?.includes("seedance-1-5") || ctx.model?.includes("seedance-1.5");

    if (!isSeedance15) {
      body.duration = ctx.duration;
    }

    if (ctx.referenceVideoUrl) {
      body.reference_video = ctx.referenceVideoUrl;
      if (ctx.referenceVideoMimicryLevel && this.videoCapabilities.supportsMimicryLevel) {
        body.mimicry_level = ctx.referenceVideoMimicryLevel;
      }
    }

    return {
      body,
      endpoint: "/contents/generations/tasks",
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    const body: Record<string, unknown> = {
      model: ctx.model || "doubao-seedream-4-0-250828",
      prompt: ctx.prompt,
      n: 1,
      size: "1920x1920",
    };

    if (ctx.characterRef && ctx.sceneRef) {
      body.ref_image = ctx.characterRef;
      body.prompt = `[场景参考] 请严格按照参考图中的场景环境、光照、色调等特征生成场景。\n\n${ctx.prompt}`;
    } else if (ctx.characterRef) {
      body.ref_image = ctx.characterRef;
    } else if (ctx.sceneRef) {
      body.ref_image = ctx.sceneRef;
    }

    return {
      body,
      endpoint: "/images/generations",
    };
  }

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult {
    return {
      body: {
        model: ctx.model || "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ctx.prompt },
              { type: "image_url", image_url: { url: ctx.imageUrl } },
            ],
          },
        ],
      },
      endpoint: "/chat/completions",
    };
  }

  getImageTransportMode(_purpose: ImagePurpose): ImageTransportMode {
    return "base64";
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    // Volcengine 完成态: { content: [{ type: "video_url", video_url: { url } }] }
    const content = data.content as Record<string, unknown>[] | undefined;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.type === "video_url") {
          const videoUrl = item.video_url as Record<string, unknown> | undefined;
          if (videoUrl?.url) return videoUrl.url as string;
        }
      }
    }
    return (
      (data.video_url as string | undefined) ||
      (data.url as string | undefined)
    );
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/contents/generations/tasks/${taskId}`;
  }

  getCloudInfo(baseUrl: string): CloudProviderInfo {
    if (baseUrl.includes("bytepluses.com")) {
      return {
        name: "BytePlus (Seedance)",
        websiteUrl: "https://console.byteplus.com",
        taskUrlPattern: () =>
          "https://console.byteplus.com/ark/region:ap-southeast-1/task",
        queryEndpoint: (base, taskId) =>
          `${base}/contents/generations/tasks/${taskId}`,
        apiDocUrl: "https://docs.byteplus.com/en/docs/seedance/",
        howToCheck:
          "1. 登录 BytePlus 控制台 2. 进入「Ark」平台 3. 在「Task Center」查看视频生成任务",
      };
    }
    return {
      name: "火山引擎 (Doubao)",
      websiteUrl: "https://console.volcengine.com",
      taskUrlPattern: () =>
        "https://console.volcengine.com/ark/region:cn-beijing/task",
      queryEndpoint: (base, taskId) =>
        `${base}/contents/generations/tasks/${taskId}`,
      apiDocUrl: "https://www.volcengine.com/docs/82379/1115452",
      howToCheck:
        "1. 登录火山引擎控制台 2. 进入「方舟」平台 3. 在「任务中心」查看视频生成任务",
    };
  }

  getApiKeyDetection(): ApiKeyDetection {
    return {
      rules: [
        {
          pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          confidence: "high",
        },
      ],
      suggestedName: "火山引擎",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    };
  }
}
