export interface UrlPattern {
  _uid: string;
  pattern: string;
  type: "contains" | "prefix" | "regex";
}

export interface DurationOption {
  _uid: string;
  value: number;
  label: string;
}

export interface ResolutionOption {
  _uid: string;
  value: string;
  label: string;
  width: number;
  height: number;
}

export interface StyleOption {
  _uid: string;
  value: string;
  label: string;
}

export interface CfgScaleConfig {
  min: number;
  max: number;
  default: number;
  step: number;
}

export interface ModelDefinition {
  _uid: string;
  modelId: string;
  displayName: string;
  type: "video" | "image" | "text";
  maxDuration: number;
  maxResolution: number;
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsReferenceImage: boolean;
  durations: DurationOption[];
  resolutions: ResolutionOption[];
  styles: StyleOption[];
  negativePrompt: boolean;
  seed: boolean;
  cfgScale: CfgScaleConfig | null;
}

export interface ExtraField {
  _uid: string;
  key: string;
  value: string;
}

export interface StatusMapping {
  _uid: string;
  apiStatus: string;
  appStatus: string;
}

export interface WizardState {
  id: string;
  displayName: string;
  version: string;
  description: string;
  baseUrl: string;
  authType: "bearer" | "api-key-header" | "api-key-query" | "custom";
  authHeader: string;
  authQueryName: string;
  apiUrlPatterns: UrlPattern[];
  matchMode: "contains" | "prefix" | "regex";
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsMimicryLevel: boolean;
  supportsCharacterRef: boolean;
  supportsSceneRef: boolean;
  supportsReferenceImage: boolean;
  defaultVideoModel: string;
  defaultImageModel: string;
  maxDuration: number;
  imageMode: "base64" | "url" | "upload";
  videoMode: "base64" | "url";
  preferLocalData: boolean;
  models: ModelDefinition[];
  bodyFormat: "openai-content" | "flat" | "dashscope" | "custom";
  promptField: string;
  modelField: string;
  durationField: string;
  firstFrameField: string;
  lastFrameField: string;
  extraFields: ExtraField[];
  videoGenerateEndpoint: string;
  videoStatusEndpoint: string;
  imageGenerateEndpoint: string;
  textGenerateEndpoint: string;
  visionGenerateEndpoint: string;
  taskIdPath: string;
  statusPath: string;
  videoUrlPath: string;
  imageUrlPath: string;
  statusMapping: StatusMapping[];
}

export function createDefaultModel(): ModelDefinition {
  return {
    _uid: crypto.randomUUID(),
    modelId: "",
    displayName: "",
    type: "video",
    maxDuration: 10,
    maxResolution: 1080,
    supportsLastFrame: false,
    supportsReferenceVideo: false,
    supportsReferenceImage: false,
    durations: [],
    resolutions: [],
    styles: [],
    negativePrompt: false,
    seed: false,
    cfgScale: null,
  };
}
