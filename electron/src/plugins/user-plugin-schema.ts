import Ajv from "ajv";
import fs from "fs";
import path from "path";
import { getLogger } from "../logging/logger";

const logger = getLogger("plugin-schema");

export interface ApiKeyDetectionRuleConfig {
  pattern: string;
  confidence: "high" | "medium" | "low";
}

export interface ApiKeyDetectionConfig {
  rules: ApiKeyDetectionRuleConfig[];
  suggestedName: string;
  baseUrl?: string;
}

export interface UserPluginConfig {
  id: string;
  version: string;
  displayName: string;
  description?: string;
  author?: string;
  homepage?: string;

  apiKeyDetection?: ApiKeyDetectionConfig;

  match: {
    mode?: "contains" | "prefix" | "regex";
    apiUrlPatterns: string[];
    modelPatterns?: string[];
    priority?: number;
  };

  capabilities: {
    video?: {
      supportsLastFrame: boolean;
      supportsReferenceVideo: boolean;
      supportsMimicryLevel: boolean;
      supportsCharacterRef?: boolean;
      supportsSceneRef?: boolean;
      defaultModel: string;
      maxDuration: number;
    };
    image?: {
      supportsReferenceImage: boolean;
      supportsCharacterRef?: boolean;
      supportsSceneRef?: boolean;
      defaultModel: string;
    };
    text?: boolean;
    vision?: boolean;
  };

  models?: Record<
    string,
    {
      maxReferences?: number;
      maxResolution?: number;
      maxSizeMB?: number;
      supportsLastFrame?: boolean;
      referenceMode?: "separate" | "merged";
      defaultImageSize?: string;
      supportedImageSizes?: Array<{
        width: number;
        height: number;
        label: string;
        aspectRatio: string;
      }>;
      parameters?: {
        durations?: Array<{ value: number; label: string }>;
        resolutions?: Array<{ value: string; label: string; width: number; height: number }>;
        styles?: Array<{ value: string; label: string; description?: string }>;
        negativePrompt?: boolean;
        seed?: boolean;
        cfgScale?: { min: number; max: number; default: number; step: number };
        lora?: boolean;
      };
      displayName?: string;
    }
  >;

  transport: {
    imageMode: "base64" | "url" | "upload";
    videoMode: "base64" | "url";
    preferLocalData?: boolean;
  };

  auth: {
    type: "bearer" | "api-key-header" | "api-key-query" | "custom";
    headerName?: string;
    queryParamName?: string;
    customHeaders?: Record<string, string>;
  };

  headers?: Record<string, string>;

  endpoints: {
    video?: {
      generate: string;
      status: string;
      method?: "POST";
      auth?: {
        type: "bearer" | "api-key-header" | "api-key-query" | "custom";
        headerName?: string;
        queryParamName?: string;
        customHeaders?: Record<string, string>;
      };
      headers?: Record<string, string>;
    };
    image?: {
      generate: string;
      method?: "POST";
      auth?: {
        type: "bearer" | "api-key-header" | "api-key-query" | "custom";
        headerName?: string;
        queryParamName?: string;
        customHeaders?: Record<string, string>;
      };
      headers?: Record<string, string>;
    };
    text?: {
      generate: string;
      method?: "POST";
      auth?: {
        type: "bearer" | "api-key-header" | "api-key-query" | "custom";
        headerName?: string;
        queryParamName?: string;
        customHeaders?: Record<string, string>;
      };
      headers?: Record<string, string>;
    };
    vision?: {
      generate: string;
      method?: "POST";
      auth?: {
        type: "bearer" | "api-key-header" | "api-key-query" | "custom";
        headerName?: string;
        queryParamName?: string;
        customHeaders?: Record<string, string>;
      };
      headers?: Record<string, string>;
    };
    upload?: {
      endpoint: string;
      method?: "POST";
      responseImagePath?: string;
    };
  };

  request: {
    video?: {
      bodyFormat: "openai-content" | "flat" | "dashscope" | "custom";
      promptField?: string;
      modelField?: string;
      durationField?: string;
      firstFrameField?: string;
      lastFrameField?: string;
      characterRefField?: string;
      sceneRefField?: string;
      referenceVideoField?: string;
      mimicryLevelField?: string;
      extraFields?: Record<string, unknown>;
      customBodyTemplate?: Record<string, unknown>;
    };
    image?: {
      bodyFormat: "openai" | "flat" | "custom";
      promptField?: string;
      modelField?: string;
      sizeField?: string;
      referenceImageField?: string;
      characterRefField?: string;
      sceneRefField?: string;
      extraFields?: Record<string, unknown>;
      customBodyTemplate?: Record<string, unknown>;
    };
    text?: {
      bodyFormat: "openai" | "anthropic" | "custom";
      promptField?: string;
      modelField?: string;
      maxTokensField?: string;
      temperatureField?: string;
      extraFields?: Record<string, unknown>;
      customBodyTemplate?: Record<string, unknown>;
    };
    vision?: {
      bodyFormat: "openai" | "anthropic" | "custom";
      promptField?: string;
      modelField?: string;
      imageUrlField?: string;
      extraFields?: Record<string, unknown>;
      customBodyTemplate?: Record<string, unknown>;
    };
  };

  response: {
    video?: {
      taskIdPath?: string;
      videoUrlPath?: string;
      statusPath?: string;
      statusMapping?: Record<string, string>;
      errorPath?: string;
      errorCodePath?: string;
    };
    image?: {
      imageUrlPath?: string;
      base64Path?: string;
      errorPath?: string;
      errorCodePath?: string;
    };
    text?: {
      contentPath?: string;
    };
  };

  polling?: {
    intervalSeconds?: number;
    maxAttempts?: number;
    backoffMultiplier?: number;
  };

  cloudInfo?: {
    name: string;
    websiteUrl?: string;
    taskUrlPattern?: string;
    apiDocUrl?: string;
    howToCheck?: string;
  };

  availableModels?: Array<{
    id: string;
    displayName: string;
    type: "video" | "image" | "text";
  }>;
}

export const PLUGIN_CONFIG_SCHEMA_VERSION = "1.3.0";

const BUILT_IN_IDS = [
  "volcengine",
  "kuaishou",
  "zhipu",
  "pixverse",
  "seedance",
  "google",
  "openai-sora",
  "minimax",
  "openai-compatible",
  "anthropic",
];

let cachedValidate: ReturnType<Ajv["compile"]> | null = null;

function getSchemaValidator() {
  if (cachedValidate) return cachedValidate;

  try {
    const schemaPath = path.join(__dirname, "..", "..", "docs", "plugin-spec.schema.json");
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(schemaContent);

    const ajv = new Ajv({ allErrors: true, strict: false });
    cachedValidate = ajv.compile(schema);
    return cachedValidate;
  } catch {
    logger.warn("Failed to load or compile plugin schema");
    return null;
  }
}

export function validatePluginConfig(
  config: unknown,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["插件配置必须是一个对象"] };
  }

  const c = config as Record<string, unknown>;

  if (c.id && typeof c.id === "string" && BUILT_IN_IDS.includes(c.id)) {
    errors.push(`id "${c.id}" 是内置插件保留 ID，请使用其他 ID`);
  }

  const validate = getSchemaValidator();
  if (validate) {
    const valid = validate(config);
    if (!valid && validate.errors) {
      for (const err of validate.errors) {
        const field = err.instancePath ? err.instancePath.slice(1).replace(/\//g, ".") : (err.params?.missingProperty as string || "unknown");
        errors.push(`${field}: ${err.message || "验证失败"}`);
      }
    }
  } else {
    if (!c.id || typeof c.id !== "string") errors.push("缺少必填字段: id");
    else if (!/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(c.id as string)) errors.push("id 只能包含小写字母、数字和连字符");
    if (!c.version || typeof c.version !== "string") errors.push("缺少必填字段: version");
    if (!c.displayName || typeof c.displayName !== "string") errors.push("缺少必填字段: displayName");
    if (!c.match || typeof c.match !== "object") errors.push("缺少必填字段: match");
    if (!c.capabilities || typeof c.capabilities !== "object") errors.push("缺少必填字段: capabilities");
    if (!c.transport || typeof c.transport !== "object") errors.push("缺少必填字段: transport");
    if (!c.auth || typeof c.auth !== "object") errors.push("缺少必填字段: auth");
    if (!c.endpoints || typeof c.endpoints !== "object") errors.push("缺少必填字段: endpoints");
    if (!c.request || typeof c.request !== "object") errors.push("缺少必填字段: request");
    if (!c.response || typeof c.response !== "object") errors.push("缺少必填字段: response");
  }

  return { valid: errors.length === 0, errors };
}
