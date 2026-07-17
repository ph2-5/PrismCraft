import fs from "fs";
import path from "path";
import { getUserDataSubDir } from "../app-paths";

export const CODE_PLUGINS_DIR = getUserDataSubDir("CodePlugins");

export interface CodePluginExport {
  id: string;
  displayName: string;

  matchPatterns?: Array<{ urlPattern: string; modelPattern?: string }>;

  apiKeyDetection?: {
    rules: Array<{ pattern: string; confidence: "high" | "medium" | "low" }>;
    suggestedName?: string;
    baseUrl?: string;
  };

  match: (apiUrl: string, model?: string) => boolean;

  capabilities?: {
    video: boolean;
    image: boolean;
    text: boolean;
    vision: boolean;
    nativeCharacterRef?: boolean;
    nativeSceneRef?: boolean;
  };

  videoCapabilities: {
    supportsLastFrame: boolean;
    supportsReferenceVideo: boolean;
    supportsMimicryLevel: boolean;
    defaultModel: string;
    maxDuration: number;
    characterRefMode?: "native_field" | "multimodal" | "ref_field" | "text_append" | "none";
    sceneRefMode?: "native_field" | "multimodal" | "ref_field" | "text_append" | "none";
    characterRefField?: string;
    sceneRefField?: string;
    imageUploadMode?: "base64" | "url" | "upload";
    maxCharacterRefs?: number;
  };
  imageCapabilities: {
    supportsReferenceImage: boolean;
    defaultModel: string;
  };

  getModelCapabilities: (modelId: string) => {
    maxReferences: number;
    maxResolution: number;
    maxSizeMB: number;
    supportsLastFrame: boolean;
    referenceMode: "separate" | "merged";
    defaultImageSize?: string;
    supportedImageSizes?: Array<{
      width: number;
      height: number;
      label: string;
      aspectRatio: string;
    }>;
  };

  buildVideoRequest: (ctx: {
    prompt: string;
    model?: string;
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    referenceVideoUrl?: string;
    referenceVideoMimicryLevel?: string;
    duration: number;
    characterRef?: string;
    sceneRef?: string;
  }) => { body: Record<string, unknown>; endpoint: string; extraHeaders?: Record<string, string>; method?: "POST" | "GET" };

  buildImageRequest: (ctx: {
    prompt: string;
    model?: string;
    size: string;
    referenceImages: string[];
    characterRef?: string;
    sceneRef?: string;
  }) => { body: Record<string, unknown>; endpoint: string };

  extractTaskId: (data: Record<string, unknown>) => string | undefined;
  extractVideoUrl: (data: Record<string, unknown>) => string | undefined;
  extractImageUrl: (data: Record<string, unknown>) => string | undefined;

  getAuthHeaders: (apiKey: string, endpoint?: string) => Record<string, string>;

  getModelParameterProfile: (modelId: string) => {
    modelId: string;
    displayName?: string;
    capabilities: ReturnType<NonNullable<CodePluginExport["getModelCapabilities"]>>;
    parameters: {
      durations?: Array<{ value: number; label: string }>;
      resolutions?: Array<{ value: string; label: string; width: number; height: number }>;
      styles?: Array<{ value: string; label: string; description?: string }>;
      negativePrompt?: boolean;
      seed?: boolean;
      cfgScale?: { min: number; max: number; default: number; step: number };
      lora?: boolean;
    };
  };

  getVideoStatusEndpoint?: (baseUrl: string, taskId: string, model?: string) => string;
  buildTextRequest?: (ctx: {
    prompt: string;
    model?: string;
    maxTokens: number;
    temperature: number;
  }) => { body: Record<string, unknown>; endpoint: string };
  buildVisionRequest?: (ctx: {
    prompt: string;
    model?: string;
    imageUrl: string;
    maxTokens?: number;
  }) => { body: Record<string, unknown>; endpoint: string };
  extractTextContent?: (response: Record<string, unknown>) => string;
  extractStatus?: (response: Record<string, unknown>) => { status: string; progress?: number; message?: string };
  getStatusMethod?: () => "GET" | "POST";
  getAvailableModels?: () => string[];
  getCloudInfo?: (baseUrl: string) => {
    name: string;
    websiteUrl: string;
    taskUrlPattern: (taskId: string) => string;
    queryEndpoint: (baseUrl: string, taskId: string) => string;
    apiDocUrl: string;
    howToCheck: string;
  } | undefined;
  preferLocalData?: boolean;
  getImageTransportMode?: (purpose: string) => "base64" | "url" | "upload";
  appendAuthToUrl?: (url: string, apiKey: string) => string;
}

const ESCAPE_PATTERNS = [
  /constructor\s*\(\s*['"]return\s+(?:process|require|global)/,
  /\.__proto__/,
  /getPrototypeOf/,
  /Reflect\.(get|set|construct|apply)/,
];

export function validateCodePluginExport(obj: unknown): { valid: boolean; errors: string[]; export?: CodePluginExport } {
  const errors: string[] = [];

  if (!obj || typeof obj !== "object") {
    return { valid: false, errors: ["插件导出必须是一个对象"] };
  }

  const e = obj as Record<string, unknown>;

  if (!e.id || typeof e.id !== "string") errors.push("缺少必填字段: id (string)");
  if (!e.displayName || typeof e.displayName !== "string") errors.push("缺少必填字段: displayName (string)");
  if (typeof e.match !== "function") errors.push("缺少必填方法: match(apiUrl, model)");
  if (!e.videoCapabilities || typeof e.videoCapabilities !== "object") errors.push("缺少必填字段: videoCapabilities");
  if (!e.imageCapabilities || typeof e.imageCapabilities !== "object") errors.push("缺少必填字段: imageCapabilities");
  if (typeof e.getModelCapabilities !== "function") errors.push("缺少必填方法: getModelCapabilities(modelId)");
  if (typeof e.buildVideoRequest !== "function") errors.push("缺少必填方法: buildVideoRequest(ctx)");
  if (typeof e.buildImageRequest !== "function") errors.push("缺少必填方法: buildImageRequest(ctx)");
  if (typeof e.extractTaskId !== "function") errors.push("缺少必填方法: extractTaskId(data)");
  if (typeof e.extractVideoUrl !== "function") errors.push("缺少必填方法: extractVideoUrl(data)");
  if (typeof e.extractImageUrl !== "function") errors.push("缺少必填方法: extractImageUrl(data)");
  if (typeof e.getAuthHeaders !== "function") errors.push("缺少必填方法: getAuthHeaders(apiKey)");
  if (typeof e.getModelParameterProfile !== "function") errors.push("缺少必填方法: getModelParameterProfile(modelId)");

  if (e.matchPatterns !== undefined) {
    if (!Array.isArray(e.matchPatterns)) {
      errors.push("matchPatterns 必须是数组");
    } else {
      for (let i = 0; i < e.matchPatterns.length; i++) {
        const p = e.matchPatterns[i] as Record<string, unknown>;
        if (!p || typeof p !== "object" || typeof p.urlPattern !== "string") {
          errors.push(`matchPatterns[${i}] 缺少 urlPattern (string)`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], export: obj as CodePluginExport };
}

export function scanCodePluginFile(filePath: string): { valid: boolean; errors: string[]; id?: string; displayName?: string; matchPatterns?: Array<{ urlPattern: string; modelPattern?: string }> } {
  const fileName = path.basename(filePath);

  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, errors: [`文件不存在: ${fileName}`] };
    }

    const rawCode = fs.readFileSync(filePath, "utf-8");

    for (const pattern of ESCAPE_PATTERNS) {
      if (pattern.test(rawCode)) {
        return { valid: false, errors: [`代码插件 ${fileName} 包含禁止的逃逸模式 (${pattern.source})，已拒绝加载`] };
      }
    }

    const idMatch = rawCode.match(/(?:id\s*:\s*['"]([^'"]+)['"]|\.id\s*=\s*['"]([^'"]+)['"])/);
    const displayNameMatch = rawCode.match(/(?:displayName\s*:\s*['"]([^'"]+)['"])/);

    let matchPatterns: Array<{ urlPattern: string; modelPattern?: string }> | undefined;
    const matchPatternsMatch = rawCode.match(/matchPatterns\s*:\s*(\[[\s\S]*?\])/);
    if (matchPatternsMatch) {
      try {
        const parsed = JSON.parse((matchPatternsMatch[1] ?? "").replace(/'/g, '"'));
        if (Array.isArray(parsed)) {
          matchPatterns = parsed.filter(
            (p: unknown) => p && typeof p === "object" && typeof (p as Record<string, unknown>).urlPattern === "string",
          ) as Array<{ urlPattern: string; modelPattern?: string }>;
        }
      } catch (err) {
        console.warn("[CodePluginLoader] matchPatterns 解析失败", err);
      }
    }

    return {
      valid: true,
      errors: [],
      id: idMatch?.[1] || idMatch?.[2],
      displayName: displayNameMatch?.[1],
      matchPatterns,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { valid: false, errors: [`扫描代码插件 ${fileName} 失败: ${message}`] };
  }
}

export function listCodePluginFiles(): string[] {
  if (!fs.existsSync(CODE_PLUGINS_DIR)) return [];

  try {
    const entries = fs.readdirSync(CODE_PLUGINS_DIR);
    return entries
      .filter((entry) => entry.endsWith(".plugin.js"))
      .map((entry) => path.join(CODE_PLUGINS_DIR, entry));
  } catch {
    return [];
  }
}
