/**
 * 代码插件 Worker（fork 子进程）
 *
 * ⚠️ 安全模型说明（必读）：
 *
 * 1. Node.js vm 模块**不是安全沙箱**（官方明确警告）：
 *    https://nodejs.org/api/vm.html#vm-executing-javascript
 *    > The vm module is not a security mechanism. Do not use it to run untrusted code.
 *
 * 2. 本文件的主要安全边界是**进程级隔离**：plugin-worker 通过 child_process.fork 启动，
 *    与主进程独立内存空间、独立 Node.js 运行时。即使插件逃逸 vm 沙箱，也只能访问
 *    plugin-worker 子进程的全局对象，无法直接污染主进程或 Electron 渲染进程。
 *
 * 3. vm.createContext 仅作为**纵深防御层**：
 *    - 静态逃逸模式检测（escapePatterns）拦截已知攻击签名
 *    - Object.prototype.constructor 锁定（R123）切断 constructor 链逃逸
 *    - 危险全局（require/process/global/eval/Function 等）设为 undefined
 *    - 原型链冻结防止通过 prototype 篡改获取额外能力
 *
 * 4. **威胁模型**：本机制仅适用于加载用户**主动安装**的本地代码插件。
 *    不应用于加载远程、不可信或第三方提供的代码。如需加载不可信代码，
 *    应改用 isolated-vm（真正的 V8 Isolate）或独立容器/VM 隔离。
 *
 * 5. 已知限制：vm 沙箱无法完全阻止以下攻击向量（依赖进程级隔离兜底）：
 *    - 新版 Node.js 添加的全局对象可能未及时屏蔽
 *    - 通过原型链 + Symbol.toPrimitive 等元编程能力的未知逃逸路径
 *    - Promise 异步回调中的 this 指向（已通过 freezePrototype 部分缓解）
 */

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

/**
 * R123: 沙箱前缀代码。
 *
 * 必须包含 Object.prototype.constructor 锁定（writable: false, configurable: false），
 * 切断 constructor 链逃逸路径——恶意插件通过 `{}.constructor.constructor('return process')()`
 * 沿 constructor 链向上访问 Function 构造器，进而访问全局对象逃逸沙箱。
 *
 * 锁定后 Object.prototype.constructor 指向 Object 自身，无法再沿链向上获取 Function。
 *
 * 注意：在 IIFE 严格模式下 `this` 为 undefined，因此直接使用 Object.defineProperty
 * 而非通过 this.constructor 保存原始引用。
 *
 * 此外尝试覆盖 Object 上的反射 API（getPrototypeOf / getOwnPropertyDescriptors 等）
 * 为抛错函数，作为静态 escapePatterns 检测的运行时兜底。Object 上的方法多为
 * configurable: false，覆盖可能失败，try/catch 静默处理。
 *
 * 导出供回归测试 (regression-r123) 验证源码内容，避免测试自测自的假阳性。
 */
export const SANITIZED_CODE_PREFIX = `
(function() {
  'use strict';
  try { Object.defineProperty(Object.prototype, 'constructor', { value: Object, writable: false, configurable: false }); } catch (e) { console.warn('[plugin-worker] Failed to lock Object.prototype.constructor:', e); }
  try {
    var __blocker = function() { throw new Error('[plugin-worker] forbidden reflection API'); };
    var __forbiddenMethods = ['getPrototypeOf', 'getOwnPropertyDescriptors', 'getOwnPropertySymbols', 'setPrototypeOf'];
    for (var i = 0; i < __forbiddenMethods.length; i++) {
      var __m = __forbiddenMethods[i];
      try { Object.defineProperty(Object, __m, { value: __blocker, writable: true, configurable: true }); } catch (e) {}
    }
  } catch (e) {}
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
  } catch (e) {
    console.warn("[plugin-worker] freezePrototype failed:", e);
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

async function loadPlugin(filePath: string, callId: string): Promise<void> {
  const fileName = path.basename(filePath);

  try {
    const rawCode = await fs.promises.readFile(filePath, "utf-8");

    const escapePatterns = [
      /constructor\s*\(\s*['"]return\s+(?:process|require|global)/,
      /\.__proto__/,
      /getPrototypeOf/,
      /Reflect\.(get|set|construct|apply)/,
      /arguments\.callee/,
      /import\s*\(/,
      // 字符串拼接逃逸检测：阻止通过拼接构造 require/process 等敏感词
      /['"]\s*\+\s*['"]\s*(?:req|pro|glob|req)/i,
      // Unicode 转义逃逸：\u0072\u0065\u0071... 拼接成 require
      /\\u00[0-9a-f]{2}\\u00[0-9a-f]{2}\\u00[0-9a-f]{2}/i,
      // String.fromCharCode 拼接逃逸
      /String\.fromCharCode/,
      // eval/Function 构造器逃逸
      /\beval\s*\(/,
      /\bnew\s+Function\b/,
      // Buffer 构造逃逸
      /Buffer\.from\s*\(\s*\[/,
      // AsyncFunction 构造器逃逸（通过 Object.getPrototypeOf(async function(){}).constructor 访问）
      /\bAsyncFunction\b/,
      // import.meta 元属性逃逸（ESM 模式下访问模块元数据）
      /\bimport\.meta\b/,
      // Symbol.toPrimitive / Symbol.hasInstance 元编程钩子逃逸
      /Symbol\.(toPrimitive|hasInstance|species)/,
      // Object.getOwnPropertyDescriptors / getOwnPropertySymbols 反射逃逸
      /Object\.getOwnProperty(?:Descriptors|Symbols)/,
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
      // Promise 保留但冻结原型，防止通过 then 回调中的 this/arguments 逃逸
      Promise: freezePrototype(Promise),
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
          const fn = ctor as (...args: unknown[]) => unknown;
          freezePrototype(fn as object);
          try {
            const proto = fn.prototype;
            if (proto && typeof proto === "object") {
              Object.freeze(proto);
            }
          } catch (e) {
            console.warn(`[plugin-worker] Failed to freeze prototype for ${key}:`, e);
          }
        }
      }
    } catch (e) {
      console.warn("[plugin-worker] Sandbox hardening failed:", e);
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
    send({ type: "error", id: callId, message: "PLUGIN_NOT_LOADED" });
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
        send({ type: "error", id: msg.id, message: "MISSING_FILE_PATH" });
        return;
      }
      loadPlugin(msg.filePath, msg.id);
      break;
    }
    case "call": {
      if (!msg.method) {
        send({ type: "error", id: msg.id, message: "MISSING_METHOD" });
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

/**
 * P2-3 修复：内存泄漏防护。
 *
 * 插件 worker 是长期运行的子进程，插件内部可能通过闭包、缓存等方式
 * 逐渐泄漏内存而无感知。定期检查堆使用量，超阈值时主动退出，
 * 由 code-plugin-adapter 的 attemptRestart 机制自动重启。
 */
const MEMORY_CHECK_INTERVAL_MS = 60_000;
const MEMORY_THRESHOLD_MB = 150;

const memoryCheckTimer = setInterval(() => {
  const heapUsedMB = process.memoryUsage().heapUsed / (1024 * 1024);
  if (heapUsedMB > MEMORY_THRESHOLD_MB) {
    console.warn(
      `[plugin-worker] 堆内存 ${heapUsedMB.toFixed(1)}MB 超过阈值 ${MEMORY_THRESHOLD_MB}MB，主动退出以释放内存`,
    );
    send({
      type: "error",
      id: "",
      message: `PLUGIN_MEMORY_LIMIT_EXCEEDED: ${heapUsedMB.toFixed(1)}MB`,
    });
    clearInterval(memoryCheckTimer);
    clearInterval(heartbeatTimer);
    process.exit(1);
  }
}, MEMORY_CHECK_INTERVAL_MS);

process.on("exit", () => {
  clearInterval(heartbeatTimer);
  clearInterval(memoryCheckTimer);
});

process.on("disconnect", () => {
  clearInterval(heartbeatTimer);
  clearInterval(memoryCheckTimer);
  loadedPlugin = null;
  process.exit(0);
});
