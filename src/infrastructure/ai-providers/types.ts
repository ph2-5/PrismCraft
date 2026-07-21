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
  characterRefs?: string[];
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

/**
 * 原生对话补全请求体（Chat Completion）。
 *
 * 与 TextGenerationRequestBody 的区别：
 * - 用 messages 数组替代单字符串 prompt
 * - 支持 tools（function calling 定义）
 * - 流式标志由调用方决定（有 onChunk 则 stream=true）
 */
export interface ChatCompletionRequestBody {
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown;
    tool_call_id?: string;
    name?: string;
  }>;
  maxTokens?: number;
  temperature?: number;
  tools?: unknown[];
  stream?: boolean;
  providerId?: string;
  modelId?: string;
}

export interface KeyframeGenerationRequestBody {
  characterRef?: string;
  characterRefs?: string[];
  sceneRef?: string;
  prevKeyframe?: string;
  shotRequirement?: {
    // PR 7：统一字段名为 shotSize
    shotSize?: string;
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
  characterRefs?: string[];
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
  characterRefs?: string[];
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
