import { getLogger } from "../logging/logger";
import type { ProviderCapabilities, VideoBuildContext, ImageBuildContext, TextBuildContext, VisionBuildContext, ImagePurpose, CloudProviderInfo, ModelParameterProfile, ImageRefMode, ImageUploadMode } from "./types";
import type { UserPluginConfig } from "./user-plugin-schema";
import { BaseAIProviderPlugin } from "./base-provider";
import {
  ensureAccessibleUrl,
  downloadAsBase64,
} from "./utils";

const logger = getLogger("user-plugin-adapter");

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function escapeTemplateChars(value: string): string {
  return value.replace(/\{\{/g, "\\u007B\\u007B").replace(/\}\}/g, "\\u007D\\u007D");
}

function resolveTemplateValue(
  template: unknown,
  vars: Record<string, unknown>,
): unknown {
  if (typeof template === "string") {
    const conditionalRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
    let result = template;
    result = result.replace(conditionalRegex, (_, key, content) => {
      const value = vars[key];
      if (value === undefined || value === null || value === "" || value === false) {
        return "";
      }
      return content;
    });

    const match = result.match(/^\{\{(\w+)\}\}$/);
    if (match) {
      const val = vars[match[1]!];
      if (val !== undefined) {
        return typeof val === "string" ? escapeTemplateChars(val) : val;
      }
      return result;
    }
    return result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = vars[key];
      if (val !== undefined) {
        return typeof val === "string" ? escapeTemplateChars(String(val)) : String(val);
      }
      return `{{${key}}}`;
    });
  }
  if (Array.isArray(template)) {
    return template.map((item) => resolveTemplateValue(item, vars));
  }
  if (template && typeof template === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      const resolved = resolveTemplateValue(value, vars);
      if (typeof resolved === "string" && resolved === "" && typeof value === "string" && /\{\{#(\w+)\}\}/.test(value)) {
        continue;
      }
      result[key] = resolved;
    }
    return result;
  }
  return template;
}

type VideoRequestConfig = NonNullable<UserPluginConfig["request"]["video"]>;
type ImageRequestConfig = NonNullable<UserPluginConfig["request"]["image"]>;

/** 根据 bodyFormat 分发 video 请求体构建（提取以降低 buildVideoRequest 复杂度） */
function buildVideoBodyByFormat(
  ctx: VideoBuildContext,
  req: VideoRequestConfig,
  defaultVideoModel: string,
): Record<string, unknown> {
  switch (req.bodyFormat) {
    case "openai-content":
      return buildVideoBodyOpenAIContent(ctx, req, defaultVideoModel);
    case "dashscope":
      return buildVideoBodyDashscope(ctx, req, defaultVideoModel);
    case "custom": {
      const body: Record<string, unknown> = {};
      if (req.customBodyTemplate) {
        Object.assign(body, resolveTemplateValue(req.customBodyTemplate, {
          prompt: ctx.prompt,
          model: ctx.model || defaultVideoModel,
          duration: ctx.duration,
          firstFrameUrl: ctx.firstFrameUrl,
          lastFrameUrl: ctx.lastFrameUrl,
          referenceVideoUrl: ctx.referenceVideoUrl,
          characterRef: ctx.characterRef,
          sceneRef: ctx.sceneRef,
        }));
      }
      return body;
    }
    case "flat":
    default:
      return buildVideoBodyFlat(ctx, req, defaultVideoModel);
  }
}

function buildVideoBodyOpenAIContent(
  ctx: VideoBuildContext,
  req: VideoRequestConfig,
  defaultVideoModel: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const content: Record<string, unknown>[] = [{ type: "text", text: ctx.prompt }];
  if (ctx.firstFrameUrl) content.push({ type: "image_url", image_url: { url: ctx.firstFrameUrl } });
  if (ctx.lastFrameUrl) content.push({ type: "image_url", image_url: { url: ctx.lastFrameUrl } });
  if (ctx.characterRef) content.push({ type: "image_url", image_url: { url: ctx.characterRef } });
  if (ctx.sceneRef) content.push({ type: "image_url", image_url: { url: ctx.sceneRef } });
  body.content = content;
  body.model = ctx.model || defaultVideoModel;
  if (ctx.duration) body.duration = ctx.duration;
  if (ctx.referenceVideoUrl) body[req.referenceVideoField || "reference_video"] = ctx.referenceVideoUrl;
  if (ctx.referenceVideoMimicryLevel) body[req.mimicryLevelField || "mimicry_level"] = ctx.referenceVideoMimicryLevel;
  return body;
}

function buildVideoBodyDashscope(
  ctx: VideoBuildContext,
  req: VideoRequestConfig,
  defaultVideoModel: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const input: Record<string, unknown> = { prompt: ctx.prompt };
  if (ctx.firstFrameUrl) input.image_url = ctx.firstFrameUrl;
  if (ctx.characterRef) input[req.characterRefField || "character_ref"] = ctx.characterRef;
  if (ctx.sceneRef) input[req.sceneRefField || "scene_ref"] = ctx.sceneRef;
  if (ctx.referenceVideoUrl) input[req.referenceVideoField || "reference_video_url"] = ctx.referenceVideoUrl;
  const parameters: Record<string, unknown> = { size: "1280*720", duration: ctx.duration };
  if (ctx.referenceVideoMimicryLevel) {
    parameters[req.mimicryLevelField || "ref_mode"] = ctx.referenceVideoMimicryLevel;
  }
  body.model = ctx.model || defaultVideoModel;
  body.input = input;
  body.parameters = parameters;
  return body;
}

function buildVideoBodyFlat(
  ctx: VideoBuildContext,
  req: VideoRequestConfig,
  defaultVideoModel: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  body[req.promptField || "prompt"] = ctx.prompt;
  body[req.modelField || "model"] = ctx.model || defaultVideoModel;
  if (ctx.duration) body[req.durationField || "duration"] = ctx.duration;
  if (ctx.firstFrameUrl) body[req.firstFrameField || "image_url"] = ctx.firstFrameUrl;
  if (ctx.lastFrameUrl) body[req.lastFrameField || "last_frame_url"] = ctx.lastFrameUrl;
  if (ctx.characterRef) body[req.characterRefField || "character_ref"] = ctx.characterRef;
  if (ctx.sceneRef) body[req.sceneRefField || "scene_ref"] = ctx.sceneRef;
  if (ctx.referenceVideoUrl) body[req.referenceVideoField || "reference_video_url"] = ctx.referenceVideoUrl;
  if (ctx.referenceVideoMimicryLevel) body[req.mimicryLevelField || "mimicry_level"] = ctx.referenceVideoMimicryLevel;
  return body;
}

/** 根据 bodyFormat 分发 image 请求体构建（提取以降低 buildImageRequest 复杂度） */
function buildImageBodyByFormat(
  ctx: ImageBuildContext,
  req: ImageRequestConfig,
  defaultImageModel: string,
  supportsRefImage: boolean,
): Record<string, unknown> {
  switch (req.bodyFormat) {
    case "openai":
      return buildImageBodyOpenAI(ctx, defaultImageModel, supportsRefImage);
    case "custom": {
      const body: Record<string, unknown> = {};
      if (req.customBodyTemplate) {
        Object.assign(body, resolveTemplateValue(req.customBodyTemplate, {
          prompt: ctx.prompt,
          model: ctx.model || defaultImageModel,
          size: ctx.size,
          characterRef: ctx.characterRef,
          sceneRef: ctx.sceneRef,
        }));
      }
      return body;
    }
    case "flat":
    default:
      return buildImageBodyFlat(ctx, req, defaultImageModel, supportsRefImage);
  }
}

function buildImageBodyOpenAI(
  ctx: ImageBuildContext,
  defaultImageModel: string,
  supportsRefImage: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  body.model = ctx.model || defaultImageModel;
  body.prompt = ctx.prompt;
  body.n = 1;
  body.size = ctx.size;
  if (ctx.referenceImages.length > 0 && supportsRefImage) body.reference_images = ctx.referenceImages;
  if (ctx.characterRef && supportsRefImage) body.character_ref = ctx.characterRef;
  if (ctx.sceneRef && supportsRefImage) body.scene_ref = ctx.sceneRef;
  return body;
}

function buildImageBodyFlat(
  ctx: ImageBuildContext,
  req: ImageRequestConfig,
  defaultImageModel: string,
  supportsRefImage: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  body[req.promptField || "prompt"] = ctx.prompt;
  body[req.modelField || "model"] = ctx.model || defaultImageModel;
  body[req.sizeField || "size"] = ctx.size;
  if (ctx.referenceImages.length > 0 && supportsRefImage) {
    body[req.referenceImageField || "reference_image"] = ctx.referenceImages[0];
  }
  if (ctx.characterRef && supportsRefImage) body[req.characterRefField || "character_ref"] = ctx.characterRef;
  if (ctx.sceneRef && supportsRefImage) body[req.sceneRefField || "scene_ref"] = ctx.sceneRef;
  return body;
}

export class UserPluginAdapter extends BaseAIProviderPlugin {
  readonly config: UserPluginConfig;

  constructor(config: UserPluginConfig) {
    super();
    this.config = config;
  }

  get id(): string {
    return this.config.id;
  }

  get displayName(): string {
    return this.config.displayName;
  }

  match(apiUrl: string, model?: string): boolean {
    const mode = this.config.match.mode || "contains";

    const urlMatch = this.config.match.apiUrlPatterns.some((p) => {
      switch (mode) {
        case "prefix": return apiUrl.startsWith(p);
        case "regex": try { return new RegExp(p).test(apiUrl); } catch { logger.warn(`Invalid regex pattern: ${p}`); return false; }
        case "contains":
        default: return apiUrl.includes(p);
      }
    });
    if (!urlMatch) return false;

    if (this.config.match.modelPatterns && this.config.match.modelPatterns.length > 0 && model) {
      return this.config.match.modelPatterns.some((p) => {
        switch (mode) {
          case "prefix": return model.toLowerCase().startsWith(p.toLowerCase());
          case "regex": try { return new RegExp(p, "i").test(model); } catch { logger.warn(`Invalid regex pattern: ${p}`); return false; }
          case "contains":
          default: return model.toLowerCase().includes(p.toLowerCase());
        }
      });
    }

    return true;
  }

  get videoCapabilities() {
    return this.config.capabilities.video ?? {
      supportsLastFrame: false,
      supportsReferenceVideo: false,
      supportsMimicryLevel: false,
      supportsCharacterRef: false,
      supportsSceneRef: false,
      characterRefMode: "none" as ImageRefMode,
      sceneRefMode: "none" as ImageRefMode,
      characterRefField: "",
      sceneRefField: "",
      imageUploadMode: "base64" as ImageUploadMode,
      maxCharacterRefs: 1,
      defaultModel: "",
      maxDuration: 10,
    };
  }

  get imageCapabilities() {
    return this.config.capabilities.image ?? {
      supportsReferenceImage: false,
      defaultModel: "",
    };
  }

  get capabilities(): ProviderCapabilities {
    return {
      video: !!this.config.capabilities.video,
      image: !!this.config.capabilities.image,
      text: this.config.capabilities.text ?? false,
      vision: this.config.capabilities.vision ?? false,
    };
  }

  getModelCapabilities(modelId: string) {
    const models = this.config.models || {};
    const lowerModelId = modelId.toLowerCase();

    for (const [key, caps] of Object.entries(models)) {
      if (lowerModelId.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerModelId)) {
        return {
          maxReferences: caps.maxReferences ?? 4,
          maxResolution: caps.maxResolution ?? 2048,
          maxSizeMB: caps.maxSizeMB ?? 10,
          supportsLastFrame: caps.supportsLastFrame ?? this.config.capabilities.video?.supportsLastFrame ?? false,
          referenceMode: caps.referenceMode ?? "separate",
          defaultImageSize: caps.defaultImageSize ?? "1920x1920",
          supportedImageSizes: caps.supportedImageSizes ?? [
            { width: caps.maxResolution ?? 2048, height: caps.maxResolution ?? 2048, label: "1:1", aspectRatio: "1:1" },
          ],
        };
      }
    }

    return {
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: this.config.capabilities.video?.supportsLastFrame ?? false,
      referenceMode: "separate" as const,
      defaultImageSize: "1920x1920",
      supportedImageSizes: [{ width: 2048, height: 2048, label: "1:1", aspectRatio: "1:1" }],
    };
  }

  buildVideoRequest(ctx: VideoBuildContext) {
    const req = this.config.request.video;
    if (!req) {
      return {
        body: {},
        endpoint: "",
        notSupported: true as const,
      };
    }
    const defaultVideoModel = this.config.capabilities.video?.defaultModel || "";
    const body = buildVideoBodyByFormat(ctx, req, defaultVideoModel);

    if (req.extraFields) {
      Object.assign(body, req.extraFields);
    }

    return {
      body,
      endpoint: this.config.endpoints.video?.generate || "",
      extraHeaders: this.config.auth.type === "custom"
        ? this.config.auth.customHeaders
        : undefined,
    };
  }

  buildImageRequest(ctx: ImageBuildContext) {
    const req = this.config.request.image;
    if (!req) {
      return {
        body: {},
        endpoint: "",
        notSupported: true as const,
      };
    }
    const defaultImageModel = this.config.capabilities.image?.defaultModel || "";
    const supportsRefImage = this.config.capabilities.image?.supportsReferenceImage ?? false;
    const body = buildImageBodyByFormat(ctx, req, defaultImageModel, supportsRefImage);

    if (req.extraFields) {
      Object.assign(body, req.extraFields);
    }

    return {
      body,
      endpoint: this.config.endpoints.image?.generate || "",
    };
  }

  extractTaskId(data: Record<string, unknown>): string | undefined {
    const path = this.config.response.video?.taskIdPath;
    if (path) {
      const value = getNestedValue(data, path);
      if (typeof value === "string") return value;
    }
    return super.extractTaskId(data);
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    const path = this.config.response.video?.videoUrlPath;
    if (path) {
      const value = getNestedValue(data, path);
      if (typeof value === "string") return value;
    }
    return super.extractVideoUrl(data);
  }

  extractImageUrl(data: Record<string, unknown>): string | undefined {
    const urlPath = this.config.response.image?.imageUrlPath;
    if (urlPath) {
      const value = getNestedValue(data, urlPath);
      if (typeof value === "string") return value;
    }
    const b64Path = this.config.response.image?.base64Path;
    if (b64Path) {
      const value = getNestedValue(data, b64Path);
      if (typeof value === "string") return `data:image/png;base64,${value}`;
    }
    return super.extractImageUrl(data);
  }

  getVideoStatusEndpoint(baseUrl: string, taskId: string, model?: string): string {
    const template = this.config.endpoints.video?.status;
    if (!template) {
      return `${baseUrl}/v1/videos/${taskId}`;
    }
    return template
      .replace("{baseUrl}", baseUrl)
      .replace("{taskId}", taskId)
      .replace("{model}", model || "");
  }

  buildTextRequest(ctx: TextBuildContext) {
    const req = this.config.request.text;
    if (!req) {
      return {
        body: {},
        endpoint: "",
        notSupported: true as const,
      };
    }
    const body: Record<string, unknown> = {};

    switch (req.bodyFormat) {
      case "anthropic": {
        body.model = ctx.model || "claude-3-sonnet";
        body.messages = [{ role: "user", content: ctx.prompt }];
        body.max_tokens = ctx.maxTokens;
        break;
      }
      case "custom": {
        if (req.customBodyTemplate) {
          Object.assign(
            body,
            resolveTemplateValue(req.customBodyTemplate, {
              prompt: ctx.prompt,
              model: ctx.model || "gpt-4o",
              maxTokens: ctx.maxTokens,
              temperature: ctx.temperature,
            }),
          );
        }
        break;
      }
      default: {
        body[req.promptField || "prompt"] = ctx.prompt;
        body[req.modelField || "model"] = ctx.model || "gpt-4o";
        body[req.maxTokensField || "max_tokens"] = ctx.maxTokens;
        body[req.temperatureField || "temperature"] = ctx.temperature;
        break;
      }
    }

    if (req.extraFields) {
      Object.assign(body, req.extraFields);
    }

    return {
      body,
      endpoint: this.config.endpoints.text?.generate || "",
    };
  }

  buildVisionRequest(ctx: VisionBuildContext) {
    const req = this.config.request.vision;
    if (!req) {
      return {
        body: {},
        endpoint: "",
        notSupported: true as const,
      };
    }
    const body: Record<string, unknown> = {};

    switch (req.bodyFormat) {
      case "anthropic": {
        body.model = ctx.model || "claude-3-sonnet";
        body.messages = [
          {
            role: "user",
            content: [
              { type: "text", text: ctx.prompt },
              { type: "image_url", image_url: { url: ctx.imageUrl } },
            ],
          },
        ];
        body.max_tokens = ctx.maxTokens || 4096;
        break;
      }
      case "custom": {
        if (req.customBodyTemplate) {
          Object.assign(
            body,
            resolveTemplateValue(req.customBodyTemplate, {
              prompt: ctx.prompt,
              model: ctx.model || "gpt-4o",
              imageUrl: ctx.imageUrl,
              maxTokens: ctx.maxTokens || 4096,
            }),
          );
        }
        break;
      }
      default: {
        body.model = ctx.model || "gpt-4o";
        body.messages = [
          {
            role: "user",
            content: [
              { type: "text", text: ctx.prompt },
              { type: "image_url", image_url: { url: ctx.imageUrl } },
            ],
          },
        ];
        break;
      }
    }

    if (req.extraFields) {
      Object.assign(body, req.extraFields);
    }

    return {
      body,
      endpoint: this.config.endpoints.vision?.generate || "",
    };
  }

  getImageTransportMode() {
    return this.config.transport.imageMode;
  }

  async prepareImage(
    url: string,
    _purpose: ImagePurpose,
    _apiConfig: { apiKey: string; apiUrl: string },
  ): Promise<string | undefined> {
    const preferLocal = this.config.transport.preferLocalData !== false;

    if (preferLocal) {
      if (url.startsWith("data:")) return url;

      if (url.startsWith("https://") || url.startsWith("http://")) {
        try {
          const base64 = await downloadAsBase64(url);
          const ext = url.split(".").pop()?.toLowerCase() || "png";
          const mimeMap: Record<string, string> = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            webp: "image/webp",
            gif: "image/gif",
          };
          const mime = mimeMap[ext] || "image/png";
          return `data:${mime};base64,${base64}`;
        } catch (e) {
          logger.warn(
            `Failed to download remote image, falling back to URL: ${e instanceof Error ? e.message : String(e)}`,
          );
          return url;
        }
      }

      return ensureAccessibleUrl(url);
    }

    return ensureAccessibleUrl(url);
  }

  getAuthHeaders(apiKey: string, endpoint?: string): Record<string, string> {
    const endpointAuth = this.getEndpointAuth(endpoint);
    if (endpointAuth) {
      return this.buildAuthHeaders(endpointAuth, apiKey);
    }
    return this.buildAuthHeaders(this.config.auth, apiKey);
  }

  private getEndpointAuth(endpoint?: string): UserPluginConfig["auth"] | undefined {
    if (!endpoint) return undefined;
    const endpoints = this.config.endpoints;
    if (endpoints.video?.generate === endpoint && endpoints.video.auth) return endpoints.video.auth;
    if (endpoints.image?.generate === endpoint && endpoints.image.auth) return endpoints.image.auth;
    if (endpoints.text?.generate === endpoint && endpoints.text.auth) return endpoints.text.auth;
    if (endpoints.vision?.generate === endpoint && endpoints.vision.auth) return endpoints.vision.auth;
    return undefined;
  }

  private buildAuthHeaders(auth: UserPluginConfig["auth"], apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {};
    switch (auth.type) {
      case "bearer":
        headers.Authorization = `Bearer ${apiKey}`;
        break;
      case "api-key-header":
        headers[auth.headerName || "X-API-Key"] = apiKey;
        break;
      case "api-key-query":
        break;
      case "custom":
        if (auth.customHeaders) {
          for (const [key, value] of Object.entries(auth.customHeaders)) {
            headers[key] = (value as string).replace("{apiKey}", apiKey);
          }
        }
        break;
    }
    return headers;
  }

  getRequestHeaders(endpoint?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }
    if (endpoint) {
      const epHeaders = this.getEndpointHeaders(endpoint);
      if (epHeaders) Object.assign(headers, epHeaders);
    }
    return headers;
  }

  private getEndpointHeaders(endpoint?: string): Record<string, string> | undefined {
    if (!endpoint) return undefined;
    const endpoints = this.config.endpoints;
    if (endpoints.video?.generate === endpoint && endpoints.video.headers) return endpoints.video.headers;
    if (endpoints.image?.generate === endpoint && endpoints.image.headers) return endpoints.image.headers;
    if (endpoints.text?.generate === endpoint && endpoints.text.headers) return endpoints.text.headers;
    if (endpoints.vision?.generate === endpoint && endpoints.vision.headers) return endpoints.vision.headers;
    return undefined;
  }

  extractError(response: Record<string, unknown>): { message?: string; code?: string } | undefined {
    const errorConfigs = [
      this.config.response.video,
      this.config.response.image,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));

    for (const config of errorConfigs) {
      if (config.errorPath) {
        const message = getNestedValue(response, config.errorPath);
        if (typeof message === "string") {
          const code = config.errorCodePath ? getNestedValue(response, config.errorCodePath) : undefined;
          return { message, code: typeof code === "string" ? code : undefined };
        }
      }
    }
    return undefined;
  }

  getPollingConfig(): { intervalSeconds: number; maxAttempts: number; backoffMultiplier: number } {
    return {
      intervalSeconds: this.config.polling?.intervalSeconds ?? 5,
      maxAttempts: this.config.polling?.maxAttempts ?? 120,
      backoffMultiplier: this.config.polling?.backoffMultiplier ?? 1.0,
    };
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo | undefined {
    if (!this.config.cloudInfo) return undefined;
    return {
      name: this.config.cloudInfo.name,
      websiteUrl: this.config.cloudInfo.websiteUrl || "",
      taskUrlPattern: (taskId: string) =>
        (this.config.cloudInfo?.taskUrlPattern || "").replace("{taskId}", taskId),
      queryEndpoint: (baseUrl: string, taskId: string) =>
        this.getVideoStatusEndpoint(baseUrl, taskId),
      apiDocUrl: this.config.cloudInfo.apiDocUrl || "",
      howToCheck: this.config.cloudInfo.howToCheck || "",
    };
  }

  private findModelKey(modelId: string): string | undefined {
    const models = this.config.models || {};
    const lowerModelId = modelId.toLowerCase();
    if (models[modelId]) return modelId;
    if (models[lowerModelId]) return lowerModelId;
    for (const key of Object.keys(models)) {
      if (key.toLowerCase() === lowerModelId) return key;
    }
    return undefined;
  }

  getModelParameterProfile(modelId: string): ModelParameterProfile {
    const capabilities = this.getModelCapabilities(modelId);
    const modelKey = this.findModelKey(modelId);
    const modelConfig = modelKey ? this.config.models![modelKey] : {};
    const params = (modelConfig as Record<string, unknown>).parameters as {
      durations?: Array<{ value: number; label: string }>;
      resolutions?: Array<{ value: string; label: string; width: number; height: number }>;
      styles?: Array<{ value: string; label: string; description?: string }>;
      negativePrompt?: boolean;
      seed?: boolean;
      cfgScale?: { min: number; max: number; default: number; step: number };
      lora?: boolean;
    } | undefined;
    return {
      modelId,
      displayName: (modelConfig as Record<string, unknown>).displayName as string | undefined,
      capabilities,
      parameters: {
        durations: params?.durations || [
          { value: 2, label: "2秒" },
          { value: 5, label: "5秒" },
          { value: 10, label: "10秒" },
        ],
        resolutions: params?.resolutions || capabilities.supportedImageSizes?.map((s) => ({
          value: `${s.width}x${s.height}`,
          label: s.label,
          width: s.width,
          height: s.height,
        })) || [{ value: `${capabilities.maxResolution}x${capabilities.maxResolution}`, label: "1:1", width: capabilities.maxResolution, height: capabilities.maxResolution }],
        styles: params?.styles || [],
        negativePrompt: params?.negativePrompt ?? false,
        seed: params?.seed ?? false,
        cfgScale: params?.cfgScale,
        lora: params?.lora ?? false,
      },
    };
  }

  getAvailableModels(): string[] {
    return this.config.availableModels?.map((m) => m.id) || [];
  }

  getApiKeyDetection(): import("./types").ApiKeyDetection | undefined {
    const detection = this.config.apiKeyDetection;
    if (!detection || !detection.rules?.length) return undefined;
    return {
      rules: detection.rules.map((r) => ({
        pattern: r.pattern,
        confidence: r.confidence,
      })),
      suggestedName: detection.suggestedName || this.config.displayName,
      baseUrl: detection.baseUrl,
    };
  }
}
