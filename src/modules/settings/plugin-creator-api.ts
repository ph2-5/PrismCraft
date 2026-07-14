import { validatePluginConfig, addPlugin } from "./plugin-api";
import type { WizardState } from "./plugin-creator-types";

export { validatePluginConfig, addPlugin };

// ============= 构建辅助函数（内部使用，不导出） =============

/** 添加非空字段到目标对象 */
function addIf(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value) target[key] = value;
}

/** 添加条件字段（值不等于默认值时才添加） */
function addIfNotDefault(target: Record<string, unknown>, key: string, value: unknown, defaultValue: string): void {
  if (value && value !== defaultValue) target[key] = value;
}

/** 构建 models 和 availableModels 部分 */
function buildModelsSection(state: WizardState): { models: Record<string, unknown>; availableModels: Array<{ id: string; displayName: string; type: string }> } {
  const models: Record<string, unknown> = {};
  const availableModels: Array<{ id: string; displayName: string; type: string }> = [];
  for (const m of state.models) {
    const modelEntry: Record<string, unknown> = { displayName: m.displayName };
    addIf(modelEntry, "maxResolution", m.maxResolution > 0 ? m.maxResolution : undefined);
    if (m.type === "video") {
      modelEntry.supportsLastFrame = m.supportsLastFrame;
      modelEntry.supportsReferenceVideo = m.supportsReferenceVideo;
    }
    if (m.type === "image") {
      modelEntry.supportsReferenceImage = m.supportsReferenceImage;
    }
    const parameters: Record<string, unknown> = {};
    if (m.durations.length > 0) parameters.durations = m.durations.map(({ _uid, ...rest }) => rest);
    if (m.resolutions.length > 0) parameters.resolutions = m.resolutions.map(({ _uid, ...rest }) => rest);
    if (m.styles.length > 0) parameters.styles = m.styles.map(({ _uid, ...rest }) => rest);
    addIf(parameters, "negativePrompt", m.negativePrompt ? true : undefined);
    addIf(parameters, "seed", m.seed ? true : undefined);
    addIf(parameters, "cfgScale", m.cfgScale);
    if (Object.keys(parameters).length > 0) modelEntry.parameters = parameters;
    models[m.modelId] = modelEntry;
    availableModels.push({ id: m.modelId, displayName: m.displayName || m.modelId, type: m.type });
  }
  return { models, availableModels };
}

/** 构建 auth 部分 */
function buildAuthSection(state: WizardState): Record<string, unknown> {
  const auth: Record<string, unknown> = { type: state.authType };
  if (state.authType === "api-key-header") auth.headerName = state.authHeader || "X-API-Key";
  if (state.authType === "api-key-query") auth.queryParamName = state.authQueryName || "api_key";
  return auth;
}

/** 构建 match 部分 */
function buildMatchSection(state: WizardState): Record<string, unknown> {
  const match: Record<string, unknown> = { apiUrlPatterns: state.apiUrlPatterns.map((p) => p.pattern) };
  if (state.matchMode !== "contains") match.mode = state.matchMode;
  return match;
}

/** 构建 videoRequest 部分 */
function buildVideoRequestSection(state: WizardState): Record<string, unknown> {
  const videoRequest: Record<string, unknown> = { bodyFormat: state.bodyFormat };
  addIfNotDefault(videoRequest, "promptField", state.promptField, "prompt");
  addIfNotDefault(videoRequest, "modelField", state.modelField, "model");
  addIfNotDefault(videoRequest, "durationField", state.durationField, "duration");
  addIfNotDefault(videoRequest, "firstFrameField", state.firstFrameField, "image_url");
  addIfNotDefault(videoRequest, "lastFrameField", state.lastFrameField, "last_frame_url");
  if (state.extraFields.length > 0) {
    videoRequest.extraFields = Object.fromEntries(
      state.extraFields.filter((f) => f.key).map((f) => [f.key, f.value]),
    );
  }
  return videoRequest;
}

/** 构建 videoResponse 部分 */
function buildVideoResponseSection(state: WizardState): Record<string, unknown> {
  const videoResponse: Record<string, unknown> = {};
  addIf(videoResponse, "taskIdPath", state.taskIdPath);
  addIf(videoResponse, "statusPath", state.statusPath);
  addIf(videoResponse, "videoUrlPath", state.videoUrlPath);
  if (state.statusMapping.length > 0) {
    videoResponse.statusMapping = Object.fromEntries(
      state.statusMapping.filter((s) => s.apiStatus).map((s) => [s.apiStatus, s.appStatus]),
    );
  }
  return videoResponse;
}

/** 构建 imageResponse 部分 */
function buildImageResponseSection(state: WizardState): Record<string, unknown> {
  const imageResponse: Record<string, unknown> = {};
  addIf(imageResponse, "imageUrlPath", state.imageUrlPath);
  return imageResponse;
}

/** 构建 capabilities 部分 */
function buildCapabilitiesSection(state: WizardState): Record<string, unknown> {
  return {
    video: {
      supportsLastFrame: state.supportsLastFrame,
      supportsReferenceVideo: state.supportsReferenceVideo,
      supportsMimicryLevel: state.supportsMimicryLevel,
      supportsCharacterRef: state.supportsCharacterRef,
      supportsSceneRef: state.supportsSceneRef,
      characterRefMode: state.characterRefMode,
      sceneRefMode: state.sceneRefMode,
      characterRefField: state.characterRefField,
      sceneRefField: state.sceneRefField,
      imageUploadMode: state.imageUploadMode,
      maxCharacterRefs: state.maxCharacterRefs,
      defaultModel: state.defaultVideoModel,
      maxDuration: state.maxDuration,
    },
    image: {
      supportsReferenceImage: state.supportsReferenceImage,
      supportsCharacterRef: state.supportsCharacterRef,
      supportsSceneRef: state.supportsSceneRef,
      defaultModel: state.defaultImageModel,
    },
  };
}

export function buildPluginJson(state: WizardState): Record<string, unknown> {
  const { models, availableModels } = buildModelsSection(state);
  const auth = buildAuthSection(state);
  const match = buildMatchSection(state);
  const videoRequest = buildVideoRequestSection(state);
  const videoResponse = buildVideoResponseSection(state);
  const imageResponse = buildImageResponseSection(state);
  const capabilities = buildCapabilitiesSection(state);

  const plugin: Record<string, unknown> = {
    id: state.id,
    version: state.version,
    displayName: state.displayName,
    match,
    capabilities,
    transport: {
      imageMode: state.imageMode,
      videoMode: state.videoMode,
      preferLocalData: state.preferLocalData,
    },
    auth,
    endpoints: {
      video: { generate: state.videoGenerateEndpoint, status: state.videoStatusEndpoint },
      image: { generate: state.imageGenerateEndpoint },
      text: { generate: state.textGenerateEndpoint },
      vision: { generate: state.visionGenerateEndpoint },
    },
    request: {
      video: videoRequest,
      image: { bodyFormat: "openai" },
      text: { bodyFormat: "openai" },
      vision: { bodyFormat: "openai" },
    },
    response: {
      video: videoResponse,
      image: imageResponse,
      text: { contentPath: "choices.0.message.content" },
    },
  };

  addIf(plugin, "description", state.description);
  if (Object.keys(models).length > 0) plugin.models = models;
  if (availableModels.length > 0) plugin.availableModels = availableModels;

  return plugin;
}
