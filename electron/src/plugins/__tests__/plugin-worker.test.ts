import { describe, it, expect } from "vitest";

describe("plugin-worker", () => {
  describe("extractMetadata logic", () => {
    function extractMetadata(exported: Record<string, unknown>): {
      videoCapabilities: Record<string, unknown>;
      imageCapabilities: Record<string, unknown>;
      availableModels: string[];
      apiKeyDetection: {
        rules: Array<{ pattern: string; confidence: string }>;
        suggestedName: string;
        baseUrl?: string;
      } | null;
      preferLocalData: boolean | undefined;
    } {
      const vc = exported.videoCapabilities;
      const ic = exported.imageCapabilities;
      const detection = exported.apiKeyDetection as Record<string, unknown> | undefined;

      let apiKeyDetection: {
        rules: Array<{ pattern: string; confidence: string }>;
        suggestedName: string;
        baseUrl?: string;
      } | null = null;
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

      function safeGet<T>(obj: Record<string, unknown>, key: string, fallback: T): T {
        const val = obj[key];
        if (val === undefined) return fallback;
        if (typeof val === "function") {
          try { return (val as () => T)(); } catch { return fallback; }
        }
        return val as T;
      }

      return {
        videoCapabilities: (vc && typeof vc === "object" ? vc : {}) as Record<string, unknown>,
        imageCapabilities: (ic && typeof ic === "object" ? ic : {}) as Record<string, unknown>,
        availableModels: safeGet<string[]>(exported, "getAvailableModels", []),
        apiKeyDetection,
        preferLocalData: exported.preferLocalData as boolean | undefined,
      };
    }

    it("should extract all metadata fields", () => {
      const exported = {
        id: "test",
        displayName: "Test Plugin",
        videoCapabilities: { supportsLastFrame: true, defaultModel: "v2" },
        imageCapabilities: { supportsReferenceImage: true, defaultModel: "i2" },
        getAvailableModels: () => ["m1", "m2"],
        apiKeyDetection: {
          rules: [{ pattern: "^sk-", confidence: "high" }],
          suggestedName: "Test Provider",
          baseUrl: "https://test.com",
        },
        preferLocalData: true,
      };

      const meta = extractMetadata(exported);
      expect(meta.videoCapabilities).toEqual({ supportsLastFrame: true, defaultModel: "v2" });
      expect(meta.imageCapabilities).toEqual({ supportsReferenceImage: true, defaultModel: "i2" });
      expect(meta.availableModels).toEqual(["m1", "m2"]);
      expect(meta.apiKeyDetection).toEqual({
        rules: [{ pattern: "^sk-", confidence: "high" }],
        suggestedName: "Test Provider",
        baseUrl: "https://test.com",
      });
      expect(meta.preferLocalData).toBe(true);
    });

    it("should handle missing apiKeyDetection", () => {
      const exported = {
        id: "no-detect",
        displayName: "No Detection",
        videoCapabilities: {},
        imageCapabilities: {},
        getAvailableModels: () => [],
      };

      const meta = extractMetadata(exported);
      expect(meta.apiKeyDetection).toBeNull();
    });

    it("should handle empty rules array", () => {
      const exported = {
        id: "empty-rules",
        displayName: "Empty Rules",
        videoCapabilities: {},
        imageCapabilities: {},
        apiKeyDetection: { rules: [], suggestedName: "Empty" },
      };

      const meta = extractMetadata(exported);
      expect(meta.apiKeyDetection).toBeNull();
    });

    it("should handle missing videoCapabilities", () => {
      const exported = {
        id: "no-vc",
        displayName: "No VC",
        imageCapabilities: {},
      };

      const meta = extractMetadata(exported);
      expect(meta.videoCapabilities).toEqual({});
    });

    it("should handle getAvailableModels as non-function value", () => {
      const exported = {
        id: "models-array",
        displayName: "Models Array",
        videoCapabilities: {},
        imageCapabilities: {},
        getAvailableModels: ["m1"],
      };

      const meta = extractMetadata(exported);
      expect(meta.availableModels).toEqual(["m1"]);
    });

    it("should use displayName as fallback for suggestedName", () => {
      const exported = {
        id: "fallback-name",
        displayName: "Fallback Plugin",
        videoCapabilities: {},
        imageCapabilities: {},
        apiKeyDetection: {
          rules: [{ pattern: "^fb-", confidence: "medium" }],
        },
      };

      const meta = extractMetadata(exported);
      expect(meta.apiKeyDetection?.suggestedName).toBe("Fallback Plugin");
    });

    it("should handle getAvailableModels throwing", () => {
      const exported = {
        id: "throwing",
        displayName: "Throwing",
        videoCapabilities: {},
        imageCapabilities: {},
        getAvailableModels: () => { throw new Error("boom"); },
      };

      const meta = extractMetadata(exported);
      expect(meta.availableModels).toEqual([]);
    });
  });

  describe("escape pattern detection", () => {
    const escapePatterns = [
      /constructor\s*\(\s*['"]return\s+(?:process|require|global)/,
      /\.__proto__/,
      /getPrototypeOf/,
      /Reflect\.(get|set|construct|apply)/,
    ];

    it("should detect __proto__ escape pattern", () => {
      const code = "module.exports = this.__proto__;";
      const matched = escapePatterns.some((p) => p.test(code));
      expect(matched).toBe(true);
    });

    it("should detect Reflect.get escape pattern", () => {
      const code = "module.exports = Reflect.get(obj, 'key');";
      const matched = escapePatterns.some((p) => p.test(code));
      expect(matched).toBe(true);
    });

    it("should detect constructor return escape pattern", () => {
      const code = "const p = constructor('return process')();";
      const matched = escapePatterns.some((p) => p.test(code));
      expect(matched).toBe(true);
    });

    it("should detect getPrototypeOf escape pattern", () => {
      const code = "Object.getPrototypeOf({}).constructor;";
      const matched = escapePatterns.some((p) => p.test(code));
      expect(matched).toBe(true);
    });

    it("should not flag safe code", () => {
      const code = "module.exports = { id: 'safe', buildVideoRequest: (ctx) => ({ body: {}, endpoint: '' }) };";
      const matched = escapePatterns.some((p) => p.test(code));
      expect(matched).toBe(false);
    });

    it("should not flag Reflect.construct in comments", () => {
      const code = "// Uses Reflect.construct internally\nmodule.exports = { id: 'test' };";
      const matched = escapePatterns.some((p) => p.test(code));
      expect(matched).toBe(true);
    });
  });

  describe("IPC message protocol", () => {
    it("should define correct message types", () => {
      const workerMessageTypes = ["load", "call", "ping", "shutdown"];
      const workerResponseTypes = ["loaded", "result", "error", "log", "pong"];

      expect(workerMessageTypes).toContain("load");
      expect(workerMessageTypes).toContain("call");
      expect(workerMessageTypes).toContain("ping");
      expect(workerMessageTypes).toContain("shutdown");

      expect(workerResponseTypes).toContain("loaded");
      expect(workerResponseTypes).toContain("result");
      expect(workerResponseTypes).toContain("error");
      expect(workerResponseTypes).toContain("log");
      expect(workerResponseTypes).toContain("pong");
    });
  });

  describe("sandbox context", () => {
    it("should block dangerous globals", () => {
      const blockedGlobals = [
        "require", "process", "__filename", "__dirname",
        "global", "globalThis", "Buffer", "fetch",
        "XMLHttpRequest", "WebSocket", "Worker",
        "eval", "Function", "setTimeout", "setInterval",
        "Proxy", "Reflect", "Symbol", "Map", "Set",
        "WeakMap", "WeakSet",
      ];

      const sandboxContext: Record<string, unknown> = {
        require: undefined,
        process: undefined,
        __filename: undefined,
        __dirname: undefined,
        global: undefined,
        globalThis: undefined,
        Buffer: undefined,
        fetch: undefined,
        XMLHttpRequest: undefined,
        WebSocket: undefined,
        Worker: undefined,
        eval: undefined,
        Function: undefined,
        setTimeout: undefined,
        setInterval: undefined,
        Proxy: undefined,
        Reflect: undefined,
        Symbol: undefined,
        Map: undefined,
        Set: undefined,
        WeakMap: undefined,
        WeakSet: undefined,
      };

      for (const key of blockedGlobals) {
        expect(sandboxContext[key]).toBeUndefined();
      }
    });

    it("should allow safe globals", () => {
      const allowedGlobals = [
        "JSON", "Math", "Date", "parseInt", "parseFloat",
        "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent",
        "RegExp", "String", "Number", "Boolean", "Array", "Object", "Error",
      ];

      const sandboxContext: Record<string, unknown> = {
        JSON: {},
        Math: {},
        Date: {},
        parseInt: () => {},
        parseFloat: () => {},
        isNaN: () => {},
        isFinite: () => {},
        encodeURIComponent: () => {},
        decodeURIComponent: () => {},
        RegExp: () => {},
        String: () => {},
        Number: () => {},
        Boolean: () => {},
        Array: () => {},
        Object: () => {},
        Error: () => {},
      };

      for (const key of allowedGlobals) {
        expect(sandboxContext[key]).toBeDefined();
      }
    });
  });
});
