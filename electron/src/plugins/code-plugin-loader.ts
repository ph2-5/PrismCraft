import vm from "vm";
import fs from "fs";
import path from "path";
import os from "os";
import { getLogger } from "../logging/logger";

const logger = getLogger("code-plugin-loader");

export const CODE_PLUGINS_DIR = path.join(
  os.homedir(),
  "AI Animation Studio",
  "CodePlugins",
);

export interface CodePluginExport {
  id: string;
  displayName: string;

  apiKeyDetection?: {
    rules: Array<{ pattern: string; confidence: "high" | "medium" | "low" }>;
    suggestedName?: string;
    baseUrl?: string;
  };

  match: (apiUrl: string, model?: string) => boolean;

  videoCapabilities: {
    supportsLastFrame: boolean;
    supportsReferenceVideo: boolean;
    supportsMimicryLevel: boolean;
    defaultModel: string;
    maxDuration: number;
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

function validateCodePluginExport(obj: unknown): { valid: boolean; errors: string[]; export?: CodePluginExport } {
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

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], export: obj as CodePluginExport };
}

function createSandboxConsole(namespace: string) {
  return {
    log: (...args: unknown[]) => logger.info(`[code-plugin:${namespace}] ${args.map(String).join(" ")}`),
    warn: (...args: unknown[]) => logger.warn(`[code-plugin:${namespace}] ${args.map(String).join(" ")}`),
    error: (...args: unknown[]) => logger.error(`[code-plugin:${namespace}] ${args.map(String).join(" ")}`),
  };
}

function freezePrototype<T extends object>(obj: T): T {
  try {
    const proto = Object.getPrototypeOf(obj);
    if (proto && proto !== Object.prototype) {
      Object.freeze(proto);
    }
  } catch {
    // 无法访问原型，忽略
  }
  return obj;
}

const SANITIZED_CODE_PREFIX = `
(function() {
  'use strict';
  // 阻止原型链逃逸：覆盖 this 指向
  const _origConstructor = this.constructor;
  Object.defineProperty(this, 'constructor', { value: Object, writable: false, configurable: false });
  // 阻止通过 arguments.callee.constructor 逃逸
  try { Object.defineProperty(Object.prototype, 'constructor', { value: Object, writable: true, configurable: true }); } catch {}
`;

const SANITIZED_CODE_SUFFIX = `
})();
`;

export function loadCodePluginFromFile(filePath: string): { plugin: CodePluginExport } | { error: string } {
  const fileName = path.basename(filePath);

  try {
    const rawCode = fs.readFileSync(filePath, "utf-8");

    // 检测明显的逃逸模式
    const escapePatterns = [
      /constructor\s*\(\s*['"]return\s+(?:process|require|global)/,
      /\.__proto__/,
      /getPrototypeOf/,
      /Reflect\.(get|set|construct|apply)/,
    ];
    for (const pattern of escapePatterns) {
      if (pattern.test(rawCode)) {
        return { error: `代码插件 ${fileName} 包含禁止的逃逸模式 (${pattern.source})，已拒绝加载` };
      }
    }

    const code = SANITIZED_CODE_PREFIX + rawCode + SANITIZED_CODE_SUFFIX;

    const moduleObj = { exports: {} as Record<string, unknown> };
    const sandboxConsole = createSandboxConsole(fileName);

    // 创建安全的沙箱上下文
    // 关键：不提供 Function 构造器，冻结 Object/Array 等原型
    const sandbox = vm.createContext({
      module: moduleObj,
      exports: moduleObj.exports,
      console: sandboxConsole,
      JSON,
      Math,
      Date,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      RegExp,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Error,
      TypeError,
      RangeError,
      // 明确禁用危险对象
      Map: undefined,
      Set: undefined,
      Promise: undefined,
      Proxy: undefined,
      Reflect: undefined,
      Symbol: undefined,
      WeakMap: undefined,
      WeakSet: undefined,
      SharedArrayBuffer: undefined,
      ArrayBuffer: undefined,
      Atomics: undefined,
      require: undefined,
      process: undefined,
      __filename: undefined,
      __dirname: undefined,
      global: undefined,
      globalThis: undefined,
      Buffer: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      clearImmediate: undefined,
      fetch: undefined,
      XMLHttpRequest: undefined,
      WebSocket: undefined,
      Worker: undefined,
      eval: undefined,
      Function: undefined,
    });

    // 冻结沙箱中关键构造器的原型，防止通过原型链逃逸
    try {
      const sandboxObj = sandbox as Record<string, unknown>;
      for (const key of ["Object", "Array", "Function", "Error", "TypeError", "RangeError", "RegExp", "String", "Number", "Boolean", "Date"]) {
        const ctor = sandboxObj[key];
        if (ctor && typeof ctor === "function") {
          freezePrototype(ctor as object);
          try {
            Object.freeze((ctor as unknown as Record<string, unknown>).prototype);
          } catch {
            // 某些原型可能已冻结
          }
        }
      }
    } catch {
      // 冻结失败不阻止加载
    }

    vm.runInContext(code, sandbox, {
      filename: fileName,
      timeout: 5000,
    });

    const exported = moduleObj.exports;

    const validation = validateCodePluginExport(exported);
    if (!validation.valid) {
      return { error: `插件验证失败: ${validation.errors.join("; ")}` };
    }

    logger.info(`Loaded code plugin: ${validation.export!.id} (${validation.export!.displayName}) from ${fileName}`);
    return { plugin: validation.export! };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `加载代码插件 ${fileName} 失败: ${message}` };
  }
}

export function loadCodePlugins(): CodePluginExport[] {
  const plugins: CodePluginExport[] = [];

  if (!fs.existsSync(CODE_PLUGINS_DIR)) {
    try {
      fs.mkdirSync(CODE_PLUGINS_DIR, { recursive: true });
    } catch (e) {
      logger.warn(
        `创建代码插件目录失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return plugins;
  }

  const files: string[] = [];
  try {
    const entries = fs.readdirSync(CODE_PLUGINS_DIR);
    for (const entry of entries) {
      if (entry.endsWith(".plugin.js")) {
        files.push(path.join(CODE_PLUGINS_DIR, entry));
      }
    }
  } catch (e) {
    logger.warn(
      `读取代码插件目录失败: ${e instanceof Error ? e.message : String(e)}`,
    );
    return plugins;
  }

  for (const filePath of files) {
    const result = loadCodePluginFromFile(filePath);
    if ("plugin" in result) {
      plugins.push(result.plugin);
    } else {
      logger.warn(result.error);
    }
  }

  return plugins;
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
