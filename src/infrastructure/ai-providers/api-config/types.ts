export type ApiFormat =
  | "openai"
  | "zhipu"
  | "anthropic"
  | "google"
  | "seedance"
  | "kuaishou"
  | "pixverse";

/**
 * API 能力类型
 *
 * - text/image/vision/video：原有四大能力
 * - embedding：向量嵌入，用于记忆系统语义检索与相似度匹配
 * - audio：音频生成（TTS/音乐/旁白）与识别（STT）
 */
export type ApiCapability = "text" | "image" | "vision" | "video" | "embedding" | "audio";

export interface ProviderConfig {
  id: string;
  templateId?: string;
  name: string;
  format: ApiFormat;
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
  isCustom?: boolean;
  _obfuscationVersion?: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  capabilities: ApiCapability[];
  defaultParams?: {
    maxTokens?: number;
    temperature?: number;
    size?: string;
    duration?: number;
    quality?: string;
    maxKeyframes?: number;
    [key: string]: unknown;
  };
}

export interface CapabilityMapping {
  text?: string;
  image?: string;
  vision?: string;
  video?: string;
  embedding?: string;
  audio?: string;
}

export interface ApiConfig {
  version: number;
  providers: ProviderConfig[];
  mapping: CapabilityMapping;
  fallback: {
    enabled: boolean;
    order: ApiCapability[];
  };
  freeImageBackup?: boolean;
}
