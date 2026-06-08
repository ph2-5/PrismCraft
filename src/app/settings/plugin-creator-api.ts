import { validatePluginConfig, addPlugin } from "./plugin-api";
import type { WizardState } from "./plugin-creator-types";

export { validatePluginConfig, addPlugin };

export function buildPluginJson(state: WizardState): Record<string, unknown> {
  const models: Record<string, unknown> = {};
  const availableModels: Array<{ id: string; displayName: string; type: string }> = [];
  for (const m of state.models) {
    const modelEntry: Record<string, unknown> = {
      displayName: m.displayName,
    };
    if (m.maxResolution > 0) modelEntry.maxResolution = m.maxResolution;
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
    if (m.negativePrompt) parameters.negativePrompt = true;
    if (m.seed) parameters.seed = true;
    if (m.cfgScale) parameters.cfgScale = m.cfgScale;
    if (Object.keys(parameters).length > 0) modelEntry.parameters = parameters;
    models[m.modelId] = modelEntry;
    availableModels.push({ id: m.modelId, displayName: m.displayName || m.modelId, type: m.type });
  }

  const auth: Record<string, unknown> = { type: state.authType };
  if (state.authType === "api-key-header") auth.headerName = state.authHeader || "X-API-Key";
  if (state.authType === "api-key-query") auth.queryParamName = state.authQueryName || "api_key";

  const match: Record<string, unknown> = {
    apiUrlPatterns: state.apiUrlPatterns.map((p) => p.pattern),
  };
  if (state.matchMode !== "contains") match.mode = state.matchMode;

  const videoRequest: Record<string, unknown> = { bodyFormat: state.bodyFormat };
  if (state.promptField && state.promptField !== "prompt") videoRequest.promptField = state.promptField;
  if (state.modelField && state.modelField !== "model") videoRequest.modelField = state.modelField;
  if (state.durationField && state.durationField !== "duration") videoRequest.durationField = state.durationField;
  if (state.firstFrameField && state.firstFrameField !== "image_url") videoRequest.firstFrameField = state.firstFrameField;
  if (state.lastFrameField && state.lastFrameField !== "last_frame_url") videoRequest.lastFrameField = state.lastFrameField;
  if (state.extraFields.length > 0) {
    videoRequest.extraFields = Object.fromEntries(
      state.extraFields.filter((f) => f.key).map((f) => [f.key, f.value]),
    );
  }

  const videoResponse: Record<string, unknown> = {};
  if (state.taskIdPath) videoResponse.taskIdPath = state.taskIdPath;
  if (state.statusPath) videoResponse.statusPath = state.statusPath;
  if (state.videoUrlPath) videoResponse.videoUrlPath = state.videoUrlPath;
  if (state.statusMapping.length > 0) {
    videoResponse.statusMapping = Object.fromEntries(
      state.statusMapping.filter((s) => s.apiStatus).map((s) => [s.apiStatus, s.appStatus]),
    );
  }

  const imageResponse: Record<string, unknown> = {};
  if (state.imageUrlPath) imageResponse.imageUrlPath = state.imageUrlPath;

  const plugin: Record<string, unknown> = {
    id: state.id,
    version: state.version,
    displayName: state.displayName,
    match,
    capabilities: {
      video: {
        supportsLastFrame: state.supportsLastFrame,
        supportsReferenceVideo: state.supportsReferenceVideo,
        supportsMimicryLevel: state.supportsMimicryLevel,
        supportsCharacterRef: state.supportsCharacterRef,
        supportsSceneRef: state.supportsSceneRef,
        defaultModel: state.defaultVideoModel,
        maxDuration: state.maxDuration,
      },
      image: {
        supportsReferenceImage: state.supportsReferenceImage,
        supportsCharacterRef: state.supportsCharacterRef,
        supportsSceneRef: state.supportsSceneRef,
        defaultModel: state.defaultImageModel,
      },
    },
    transport: {
      imageMode: state.imageMode,
      videoMode: state.videoMode,
      preferLocalData: state.preferLocalData,
    },
    auth,
    endpoints: {
      video: {
        generate: state.videoGenerateEndpoint,
        status: state.videoStatusEndpoint,
      },
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

  if (state.description) plugin.description = state.description;
  if (Object.keys(models).length > 0) plugin.models = models;
  if (availableModels.length > 0) plugin.availableModels = availableModels;

  return plugin;
}
