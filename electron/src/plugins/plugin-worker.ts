import vm from "vm";
import fs from "fs";
import path from "path";

interface WorkerMessage {
  type: "load" | "call" | "ping" | "shutdown" | "setConfig";
  id: string;
  filePath?: string;
  method?: string;
  args?: unknown[];
  config?: { apiKey?: string; apiUrl?: string };
}

interface WorkerResponse {
  type: "loaded" | "result" | "error" | "log" | "pong";
  id: string;
  pluginId?: string;
  pluginDisplayName?: string;
  metadata?: PluginMetadata;
  value?: unknown;
  message?: string;
  level?: string;
}

interface PluginMetadata {
  capabilities: {
    video: boolean;
    image: boolean;
    text: boolean;
    vision: boolean;
    nativeCharacterRef?: boolean;
    nativeSceneRef?: boolean;
  };
  videoCapabilities: Record<string, unknown>;
  imageCapabilities: Record<string, unknown>;
  availableModels: string[];
  apiKeyDetection: {
    rules: Array<{ pattern: string; confidence: string }>;
    suggestedName: string;
    baseUrl?: string;
  } | null;
  preferLocalData: boolean | undefined;
  matchPatterns: Array<{ urlPattern: string; modelPattern?: string }> | undefined;
}

let loadedPlugin: Record<string, unknown> | null = null;
let cachedConfig: { apiKey?: string; apiUrl?: string } = {};

const SANITIZED_CODE_PREFIX = `
(function() {
  'use strict';
  const _origConstructor = this.constructor;
  Object.defineProperty(this, 'constructor', { value: Object, writable: false, configurable: false });
  try { Object.defineProperty(Object.prototype, 'constructor', { value: Object, writable: true, configurable: true }); } catch {}
`;

const SANITIZED_CODE_SUFFIX = `
})();
`;

function freezePrototype<T extends object>(obj: T): T {
  try {
    const proto = Object.getPrototypeOf(obj);
    if (proto && proto !== Object.prototype) {
      Object.freeze(proto);
    }
  } catch {
  }
  return obj;
}

function safeGet<T>(obj: Record<string, unknown>, key: string, fallback: T): T {
  const val = obj[key];
  if (val === undefined) return fallback;
  if (typeof val === "function") {
    try {
      return (val as () => T)();
    } catch {
      return fallback;
    }
  }
  return val as T;
}

function extractMetadata(exported: Record<string, unknown>): PluginMetadata {
  const vc = exported.videoCapabilities;
  const ic = exported.imageCapabilities;
  const detection = exported.apiKeyDetection as Record<string, unknown> | undefined;

  const rawCapabilities = exported.capabilities as Record<string, unknown> | undefined;
  const capabilities: PluginMetadata["capabilities"] = {
    video: rawCapabilities?.video !== undefined ? Boolean(rawCapabilities.video) : true,
    image: rawCapabilities?.image !== undefined ? Boolean(rawCapabilities.image) : true,
    text: rawCapabilities?.text !== undefined ? Boolean(rawCapabilities.text) : true,
    vision: rawCapabilities?.vision !== undefined ? Boolean(rawCapabilities.vision) : true,
    nativeCharacterRef: rawCapabilities?.nativeCharacterRef !== undefined ? Boolean(rawCapabilities.nativeCharacterRef) : undefined,
    nativeSceneRef: rawCapabilities?.nativeSceneRef !== undefined ? Boolean(rawCapabilities.nativeSceneRef) : undefined,
  };

  let apiKeyDetection: PluginMetadata["apiKeyDetection"] = null;
  if (detection && Array.isArray(detection.rules) && detection.rules.length > 0) {
    apiKeyDetection = {
      rules: detection.rules.map((r: Record<string, unknown>) => ({
        pattern: String(r.pattern || ""),
        confidence: String(r.confidence || "medium"),
      })),
      suggestedName: String(detection.suggestedName || exported.displayName || ""),
      baseUrl: detection.baseUrl ? String(detection.baseUrl) : undefined,
    };
  }

  let matchPatterns: PluginMetadata["matchPatterns"] = undefined;
  const rawMatchPatterns = exported.matchPatterns;
  if (Array.isArray(rawMatchPatterns)) {
    matchPatterns = rawMatchPatterns.filter(
      (p: unknown) => p && typeof p === "object" && typeof (p as Record<string, unknown>).urlPattern === "string",
    ) as Array<{ urlPattern: string; modelPattern?: string }>;
  }

  return {
    capabilities,
    videoCapabilities: (vc && typeof vc === "object" ? vc : {}) as Record<string, unknown>,
    imageCapabilities: (ic && typeof ic === "object" ? ic : {}) as Record<string, unknown>,
    availableModels: safeGet<string[]>(exported, "getAvailableModels", []),
    apiKeyDetection,
    preferLocalData: exported.preferLocalData as boolean | undefined,
    matchPatterns,
  };
}

function loadPlugin(filePath: string, callId: string): void {
  const fileName = path.basename(filePath);

  try {
    const rawCode = fs.readFileSync(filePath, "utf-8");

    const escapePatterns = [
      /constructor\s*\(\s*['"]return\s+(?:process|require|global)/,
      /\.__proto__/,
      /getPrototypeOf/,
      /Reflect\.(get|set|construct|apply)/,
      /arguments\.callee/,
      /import\s*\(/,
    ];
    for (const pattern of escapePatterns) {
      if (pattern.test(rawCode)) {
        send({ type: "error", id: callId, message: `代码插件 ${fileName} 包含禁止的逃逸模式 (${pattern.source})，已拒绝加载` });
        return;
      }
    }

    const code = SANITIZED_CODE_PREFIX + rawCode + SANITIZED_CODE_SUFFIX;

    const moduleObj = { exports: {} as Record<string, unknown> };
    const sandboxConsole = {
      log: (...args: unknown[]) => send({ type: "log", id: "", level: "info", message: args.map(String).join(" ") }),
      warn: (...args: unknown[]) => send({ type: "log", id: "", level: "warn", message: args.map(String).join(" ") }),
      error: (...args: unknown[]) => send({ type: "log", id: "", level: "error", message: args.map(String).join(" ") }),
    };

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
      Map: undefined,
      Set: undefined,
      Proxy: undefined,
      Promise,
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

    try {
      const sandboxObj = sandbox as Record<string, unknown>;
      for (const key of ["Object", "Array", "Function", "Error", "TypeError", "RangeError", "RegExp", "String", "Number", "Boolean", "Date", "Promise"]) {
        const ctor = sandboxObj[key];
        if (ctor && typeof ctor === "function") {
          freezePrototype(ctor as object);
          try {
            Object.freeze((ctor as unknown as Record<string, unknown>).prototype);
          } catch {
          }
        }
      }
    } catch {
    }

    vm.runInContext(code, sandbox, {
      filename: fileName,
      timeout: 5000,
      microtaskMode: "afterEvaluate",
    } as vm.RunningCodeOptions);

    const exported = moduleObj.exports;
    loadedPlugin = exported as Record<string, unknown>;

    const pluginId = (exported as Record<string, unknown>).id as string;
    const pluginDisplayName = (exported as Record<string, unknown>).displayName as string;
    const metadata = extractMetadata(exported);

    send({ type: "loaded", id: callId, pluginId, pluginDisplayName, metadata });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    send({ type: "error", id: callId, message: `加载代码插件 ${fileName} 失败: ${message}` });
  }
}

function callMethod(method: string, args: unknown[], callId: string): void {
  if (!loadedPlugin) {
    send({ type: "error", id: callId, message: "插件未加载" });
    return;
  }

  const fn = loadedPlugin[method];
  if (typeof fn !== "function") {
    if (fn !== undefined) {
      send({ type: "result", id: callId, value: fn });
    } else {
      send({ type: "error", id: callId, message: `方法 ${method} 不存在` });
    }
    return;
  }

  const injectedArgs = injectCachedConfig(method, args);

  try {
    const result = (fn as (...a: unknown[]) => unknown)(...injectedArgs);
    if (result && typeof result === "object" && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(
        (value) => send({ type: "result", id: callId, value }),
        (err) => send({ type: "error", id: callId, message: `调用 ${method}() 异步失败: ${err instanceof Error ? err.message : String(err)}` }),
      );
    } else {
      send({ type: "result", id: callId, value: result });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    send({ type: "error", id: callId, message: `调用 ${method}() 失败: ${message}` });
  }
}

const API_KEY_METHODS = new Set(["getAuthHeaders", "appendAuthToUrl"]);

function injectCachedConfig(method: string, args: unknown[]): unknown[] {
  if (!cachedConfig.apiKey) return args;

  if (API_KEY_METHODS.has(method) && args.length > 0 && !args[0]) {
    const patched = [...args];
    patched[0] = cachedConfig.apiKey;
    return patched;
  }

  return args;
}

function send(response: WorkerResponse): void {
  if (process.send) {
    process.send(response);
  }
}

process.on("message", (msg: WorkerMessage) => {
  switch (msg.type) {
    case "load": {
      if (!msg.filePath) {
        send({ type: "error", id: msg.id, message: "缺少 filePath" });
        return;
      }
      loadPlugin(msg.filePath, msg.id);
      break;
    }
    case "call": {
      if (!msg.method) {
        send({ type: "error", id: msg.id, message: "缺少 method" });
        return;
      }
      callMethod(msg.method, msg.args || [], msg.id);
      break;
    }
    case "ping": {
      send({ type: "pong", id: msg.id });
      break;
    }
    case "shutdown": {
      loadedPlugin = null;
      cachedConfig = {};
      process.exit(0);
      break;
    }
    case "setConfig": {
      if (msg.config) {
        cachedConfig = { ...cachedConfig, ...msg.config };
      }
      send({ type: "result", id: msg.id, value: true });
      break;
    }
  }
});

process.on("uncaughtException", (err) => {
  send({ type: "error", id: "", message: `子进程未捕获异常: ${err.message}` });
});

process.on("unhandledRejection", (reason) => {
  send({ type: "error", id: "", message: `子进程未处理的 Promise 拒绝: ${String(reason)}` });
});

const HEARTBEAT_TIMEOUT_MS = 60_000;
let lastHeartbeat = Date.now();

process.on("message", () => {
  lastHeartbeat = Date.now();
});

const heartbeatTimer = setInterval(() => {
  if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
    clearInterval(heartbeatTimer);
    process.exit(1);
  }
}, 15_000);

process.on("disconnect", () => {
  clearInterval(heartbeatTimer);
  loadedPlugin = null;
  process.exit(0);
});
