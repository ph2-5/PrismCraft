export interface ApiRequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface CustomApiConfig {
  providerId?: string;
  modelId?: string;
  format?: string;
}

export interface ApiProviderConfig {
  providerId: string;
  modelId: string;
  format?: string;
}

export interface CapabilityResolution {
  provider: {
    id: string;
    models: Array<{
      id: string;
      capabilities: string[];
    }>;
    format?: string;
  };
  model: {
    id: string;
    capabilities: string[];
  };
}

export interface ImageGenerationRequestBody {
  prompt: string;
  type?: string;
  size?: string;
  promptWasTruncated?: boolean;
  providerId?: string;
  modelId?: string;
}

export interface VideoGenerationRequestBody {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  characterRef?: string;
  sceneRef?: string;
  duration?: number;
  promptWasTruncated?: boolean;
  referenceVideo?: {
    enabled: boolean;
    videoUrl: string;
    mimicryLevel: string;
  };
  providerId?: string;
  modelId?: string;
  format?: string;
}

export interface TextGenerationRequestBody {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  promptWasTruncated?: boolean;
  providerId?: string;
  modelId?: string;
}

export interface KeyframeGenerationRequestBody {
  characterRef?: string;
  sceneRef?: string;
  prevKeyframe?: string;
  shotRequirement?: {
    shotType?: string;
    cameraAngle?: string;
    cameraMovement?: string;
    action?: string;
  };
  content?: string;
  providerId?: string;
  modelId?: string;
  format?: string;
}

export interface FramePairGenerationRequestBody {
  keyframeUrl: string;
  keyframePrompt?: string;
  characterRef?: string;
  sceneRef?: string;
  prevLastFrameUrl?: string;
  actionDescription?: string;
  duration?: number;
  providerId?: string;
  modelId?: string;
  format?: string;
}

export interface VideoStatusRequestBody {
  taskId: string;
  providerId?: string;
  modelId?: string;
  format?: string;
}

export interface UploadRequestBody {
  file: string;
  filename: string;
  mimetype: string;
}

export interface VideoGenerationParams {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  characterRef?: string;
  sceneRef?: string;
  duration?: number;
  model?: string;
  primaryImage?: string;
  lastFrameImage?: string;
  shouldIncludeDuration?: boolean;
  referenceVideo?: {
    enabled: boolean;
    videoUrl: string;
    mimicryLevel: string;
  };
  providerId?: string;
  modelId?: string;
  format?: string;
  promptWasTruncated?: boolean;
}

export interface VideoProviderStrategy {
  readonly name: string;
  readonly endpoint: string;
  supports(apiUrl: string, format: string, model: string): boolean;
  buildRequestBody(params: VideoGenerationParams): Record<string, unknown>;
  extractTaskId(data: Record<string, unknown>): string | undefined;
  extractVideoUrl(data: Record<string, unknown>): string | undefined;
  getEndpoint?(params: VideoGenerationParams): string;
  getExtraHeaders?(): Record<string, string>;
}
