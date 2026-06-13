export interface ImageSizeOption {
  width: number;
  height: number;
  label: string;
  aspectRatio: string;
}

export interface ModelCapabilities {
  maxReferences: number;
  maxResolution: number;
  maxSizeMB: number;
  supportsLastFrame: boolean;
  referenceMode: "separate" | "merged";
  supportedImageSizes?: ImageSizeOption[];
  defaultImageSize?: string;
  urlTtl?: number;
  supportsCharacterRef?: boolean;
  supportsSceneRef?: boolean;
  nativeCharacterRef?: boolean;
  nativeSceneRef?: boolean;
  characterRefMode?: ImageRefMode;
  sceneRefMode?: ImageRefMode;
}

export type ImageRefMode = "native_field" | "multimodal" | "ref_field" | "text_append" | "bake_into_first" | "none";

export type ImageUploadMode = "base64" | "url" | "upload";

export interface VideoCapabilities {
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsMimicryLevel: boolean;
  defaultModel: string;
  maxDuration: number;
  supportedCodecs?: string[];
  urlTtl?: number;
  supportsCharacterRef?: boolean;
  supportsSceneRef?: boolean;
  characterRefMode?: ImageRefMode;
  sceneRefMode?: ImageRefMode;
  characterRefField?: string;
  sceneRefField?: string;
  imageUploadMode?: ImageUploadMode;
  maxCharacterRefs?: number;
}

export interface ImageCapabilities {
  supportsReferenceImage: boolean;
  defaultModel: string;
}

export type ImageTransportMode = "base64" | "url" | "upload";

export type ImagePurpose =
  | "firstFrame"
  | "lastFrame"
  | "referenceVideo"
  | "characterRef"
  | "sceneRef"
  | "analysisTarget"
  | "referenceImage";

export interface VideoBuildContext {
  prompt: string;
  model?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceVideoUrl?: string;
  referenceVideoMimicryLevel?: string;
  duration: number;
  characterRefs?: string[];
  characterRef?: string;
  sceneRef?: string;
}

export interface ImageBuildContext {
  prompt: string;
  model?: string;
  size: string;
  referenceImages: string[];
  characterRef?: string;
  sceneRef?: string;
}

export interface TextBuildContext {
  prompt: string;
  model?: string;
  maxTokens: number;
  temperature: number;
}

export interface VisionBuildContext {
  prompt: string;
  model?: string;
  imageUrl: string;
  maxTokens?: number;
}

export interface VideoRequestResult {
  body: Record<string, unknown>;
  endpoint: string;
  extraHeaders?: Record<string, string>;
  method?: "POST" | "GET";
}

export interface ImageRequestResult {
  body: Record<string, unknown>;
  endpoint: string;
}

export interface TextRequestResult {
  body: Record<string, unknown>;
  endpoint: string;
}

export interface VisionRequestResult {
  body: Record<string, unknown>;
  endpoint: string;
}

export interface CloudProviderInfo {
  name: string;
  websiteUrl: string;
  taskUrlPattern: (taskId: string) => string;
  queryEndpoint: (baseUrl: string, taskId: string) => string;
  apiDocUrl: string;
  howToCheck: string;
}

export interface DurationOption {
  value: number;
  label: string;
}

export interface ResolutionOption {
  value: string;
  label: string;
  width: number;
  height: number;
}

export interface StyleOption {
  value: string;
  label: string;
  description?: string;
}

export interface ApiKeyDetectionRule {
  pattern: string;
  confidence: "high" | "medium" | "low";
  check?: (key: string) => boolean;
}

export interface ApiKeyDetection {
  rules: ApiKeyDetectionRule[];
  suggestedName: string;
  baseUrl?: string;
}

export interface ModelParameterOptions {
  durations?: DurationOption[];
  resolutions?: ResolutionOption[];
  styles?: StyleOption[];
  negativePrompt?: boolean;
  seed?: boolean;
  cfgScale?: { min: number; max: number; default: number; step: number };
  lora?: boolean;
}

export interface ModelParameterProfile {
  modelId: string;
  displayName?: string;
  capabilities: ModelCapabilities;
  parameters: ModelParameterOptions;
}

export interface MatchPattern {
  urlPattern: string;
  modelPattern?: string;
}

export interface ProviderCapabilities {
  video: boolean;
  image: boolean;
  text: boolean;
  vision: boolean;
  nativeCharacterRef?: boolean;
  nativeSceneRef?: boolean;
}

export interface AIProviderPlugin {
  readonly id: string;
  readonly displayName: string;

  match(apiUrl: string, model?: string): boolean;

  readonly matchPatterns?: MatchPattern[];

  readonly capabilities: ProviderCapabilities;

  readonly videoCapabilities: VideoCapabilities;
  readonly imageCapabilities: ImageCapabilities;
  getModelCapabilities(modelId: string): ModelCapabilities;

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult;
  extractTaskId(response: Record<string, unknown>): string | undefined;
  extractVideoUrl(response: Record<string, unknown>): string | undefined;
  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    model?: string,
  ): string;

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult;
  extractImageUrl(response: Record<string, unknown>): string | undefined;

  buildTextRequest(ctx: TextBuildContext): TextRequestResult;

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult;

  getImageTransportMode(purpose: ImagePurpose): ImageTransportMode;
  prepareImage(
    url: string,
    purpose: ImagePurpose,
    apiConfig: { apiKey: string; apiUrl: string },
  ): Promise<string | undefined>;
  uploadAsset?(
    data: Buffer,
    filename: string,
    mimeType: string,
    apiKey: string,
    apiUrl: string,
  ): Promise<string>;

  getAuthHeaders(
    apiKey: string,
    endpoint?: string,
  ): Record<string, string>;

  readonly preferLocalData?: boolean;

  getCloudInfo?(baseUrl: string): CloudProviderInfo | undefined;

  appendAuthToUrl?(url: string, apiKey: string): string;
  extractTextContent?(response: Record<string, unknown>): string;
  extractStatus?(
    response: Record<string, unknown>,
  ): { status: string; progress?: number; message?: string };
  getStatusMethod?(): "GET" | "POST";

  getModelParameterProfile(modelId: string): ModelParameterProfile;
  getAvailableModels?(): string[];

  getApiKeyDetection?(): ApiKeyDetection | undefined;
}

export interface AsyncAIProviderPlugin extends AIProviderPlugin {
  buildVideoRequestAsync?(ctx: VideoBuildContext): Promise<VideoRequestResult>;
  buildImageRequestAsync?(ctx: ImageBuildContext): Promise<ImageRequestResult>;
  buildTextRequestAsync?(ctx: TextBuildContext): Promise<TextRequestResult>;
  buildVisionRequestAsync?(ctx: VisionBuildContext): Promise<VisionRequestResult>;
  getAuthHeadersAsync?(apiKey: string, endpoint?: string): Promise<Record<string, string>>;
  extractTaskIdAsync?(response: Record<string, unknown>): Promise<string | undefined>;
  extractVideoUrlAsync?(response: Record<string, unknown>): Promise<string | undefined>;
  extractImageUrlAsync?(response: Record<string, unknown>): Promise<string | undefined>;
  extractStatusAsync?(response: Record<string, unknown>): Promise<{ status: string; progress?: number; message?: string }>;
  extractTextContentAsync?(response: Record<string, unknown>): Promise<string>;
  getVideoStatusEndpointAsync?(baseUrl: string, taskId: string, model?: string): Promise<string>;
  getModelCapabilitiesAsync?(modelId: string): Promise<ModelCapabilities>;
  getModelParameterProfileAsync?(modelId: string): Promise<ModelParameterProfile>;
  getAvailableModelsAsync?(): Promise<string[]>;
  getApiKeyDetectionAsync?(): Promise<ApiKeyDetection | undefined>;
  getCloudInfoAsync?(baseUrl: string): Promise<CloudProviderInfo | undefined>;
}
