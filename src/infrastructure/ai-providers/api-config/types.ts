export type ApiFormat =
  | "openai"
  | "zhipu"
  | "anthropic"
  | "google"
  | "seedance"
  | "kuaishou"
  | "pixverse";

export type ApiCapability = "text" | "image" | "vision" | "video";

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
