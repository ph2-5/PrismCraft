/**
 * Model Manager（M5 多模型管理）单元测试
 *
 * 覆盖：
 * - 多模型注册表读写（registry.json）
 * - 模型列表 / active 模型查询 / 切换 / 删除 / 安装
 * - 软迁移（根目录模型自动注册到 registry）
 * - active 模型变更回调（注册 / 触发 / 注销 / 异常隔离）
 * - deriveModelId 派生规则
 * - getModelDirectory 路径计算
 *
 * Mock @/shared/file-http（in-memory 文件系统）与 @/shared/error-logger。
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  listLocalModels,
  getActiveModelId,
  getActiveModelEntry,
  setActiveModel,
  removeModel,
  installModelFromFiles,
  deriveModelId,
  getModelDirectory,
  _setActiveModelChangeCallback,
  type LocalModelEntry,
  type ModelRegistry,
} from "../model-manager";

// ── vi.hoisted 声明 mock 变量 ──
const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  fileExists: vi.fn(),
  getCacheDirectory: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("@/shared/file-http", () => ({
  writeFile: mocks.writeFile,
  readFile: mocks.readFile,
  fileExists: mocks.fileExists,
  getCacheDirectory: mocks.getCacheDirectory,
  deleteFile: mocks.deleteFile,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

// ============= 常量 =============

const CACHE_DIR = "/test/cache";
const MODEL_DIR = `${CACHE_DIR}/models/embedding`;
const REGISTRY_PATH = `${MODEL_DIR}/registry.json`;

// ============= Helpers =============

/** In-memory 文件系统（path → Uint8Array） */
const fs = new Map<string, Uint8Array>();

/** 编码 JSON 为 Uint8Array */
function encodeJson(data: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(data));
}

/** 将 Uint8Array 转换为独立 ArrayBuffer（避免 view 共享 buffer） */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

/** 构造合法 ONNX 文件内容（≥1KB，magic byte 0x08） */
function makeValidOnnx(size = 2048): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0x08; // protobuf magic byte (field 1, wire type 0/varint)
  return bytes;
}

/** 构造合法 tokenizer.json（含 model.model_type + vocab） */
function makeValidTokenizer(): Uint8Array {
  return encodeJson({
    model: { model_type: "bert", vocab: { "[PAD]": 0 } },
  });
}

/** 构造合法 config.json */
function makeValidConfig(overrides: Record<string, unknown> = {}): Uint8Array {
  return encodeJson({
    modelName: "test-model",
    dimensions: 384,
    maxTokens: 256,
    language: "en",
    description: "test model",
    ...overrides,
  });
}

/** 构造一个 LocalModelEntry（用于预设 registry） */
function makeEntry(overrides: Partial<LocalModelEntry> = {}): LocalModelEntry {
  const id = overrides.id ?? "model-1";
  const dir = overrides.directory ?? `${MODEL_DIR}/${id}`;
  return {
    id,
    modelName: overrides.modelName ?? "test-model",
    dimensions: overrides.dimensions ?? 384,
    maxTokens: overrides.maxTokens ?? 256,
    language: overrides.language ?? "en",
    description: overrides.description ?? "test",
    directory: dir,
    modelFileName: overrides.modelFileName ?? "model.onnx",
    modelPath: overrides.modelPath ?? `${dir}/model.onnx`,
    tokenizerPath: overrides.tokenizerPath ?? `${dir}/tokenizer.json`,
    addedAt: overrides.addedAt ?? 1000,
  };
}

/** 预设 registry.json 到 in-memory 文件系统 */
function setRegistry(registry: ModelRegistry): void {
  fs.set(REGISTRY_PATH, encodeJson(registry));
}

/** 读取 in-memory 中的 registry（用于断言写入内容） */
function getWrittenRegistry(): ModelRegistry | null {
  const data = fs.get(REGISTRY_PATH);
  if (!data) return null;
  return JSON.parse(new TextDecoder().decode(data)) as ModelRegistry;
}

/** 构造安装文件数组 */
function makeInstallFiles(
  configOverrides: Record<string, unknown> = {},
): Array<{ name: string; data: ArrayBuffer }> {
  return [
    { name: "model.onnx", data: toArrayBuffer(makeValidOnnx()) },
    { name: "tokenizer.json", data: toArrayBuffer(makeValidTokenizer()) },
    {
      name: "config.json",
      data: toArrayBuffer(
        makeValidConfig({ modelName: "new-model", dimensions: 256, ...configOverrides }),
      ),
    },
  ];
}

// ============= Tests =============

describe("model-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.clear();

    // 初始化 in-memory 文件系统 mock
    mocks.getCacheDirectory.mockResolvedValue({ success: true, path: CACHE_DIR });
    mocks.fileExists.mockImplementation(async (p: string) => fs.has(p));
    mocks.readFile.mockImplementation(async (p: string) => {
      const data = fs.get(p);
      if (!data) return { success: false };
      const ab = new ArrayBuffer(data.byteLength);
      new Uint8Array(ab).set(data);
      return { success: true, data: ab };
    });
    mocks.writeFile.mockImplementation(async (p: string, data: unknown) => {
      let bytes: Uint8Array;
      if (typeof data === "string") {
        bytes = new TextEncoder().encode(data);
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else if (data instanceof Uint8Array) {
        bytes = new Uint8Array(data);
      } else {
        bytes = new TextEncoder().encode(String(data));
      }
      fs.set(p, bytes);
      return { success: true };
    });
    mocks.deleteFile.mockImplementation(async (p: string) => {
      fs.delete(p);
      return true;
    });

    // 重置 active 模型变更回调
    _setActiveModelChangeCallback(null);
  });

  afterEach(() => {
    _setActiveModelChangeCallback(null);
  });

  // ============= deriveModelId =============

  describe("deriveModelId", () => {
    it("基础转换：大小写 + 空格", () => {
      expect(deriveModelId("all-MiniLM-L6-v2")).toBe("all-minilm-l6-v2");
      expect(deriveModelId("BGE Small zh")).toBe("bge-small-zh");
    });

    it("特殊字符替换为连字符", () => {
      expect(deriveModelId("model_v2.0")).toBe("model-v2-0");
      expect(deriveModelId("model (test)")).toBe("model-test");
    });

    it("连续分隔符合并", () => {
      expect(deriveModelId("model---test")).toBe("model-test");
      expect(deriveModelId("model   test")).toBe("model-test");
    });

    it("去除首尾连字符", () => {
      expect(deriveModelId("---test---")).toBe("test");
      expect(deriveModelId("  test  ")).toBe("test");
    });

    it("非 ASCII 字符替换为连字符", () => {
      // 中文字符不属于 [a-z0-9-]，替换为 -
      expect(deriveModelId("模型v1")).toBe("v1");
      expect(deriveModelId("123")).toBe("123");
    });
  });

  // ============= getModelDirectory =============

  describe("getModelDirectory", () => {
    it("返回 cacheDir/models/embedding", async () => {
      const dir = await getModelDirectory();
      expect(dir).toBe(MODEL_DIR);
    });

    it("规范化 Windows 路径分隔符", async () => {
      mocks.getCacheDirectory.mockResolvedValue({
        success: true,
        path: "C:\\Users\\test\\cache",
      });
      const dir = await getModelDirectory();
      expect(dir).toBe("C:/Users/test/cache/models/embedding");
    });

    it("getCacheDirectory 失败时抛错", async () => {
      mocks.getCacheDirectory.mockResolvedValue({ success: false, error: "no cache" });
      await expect(getModelDirectory()).rejects.toThrow("Failed to get cache directory");
    });
  });

  // ============= listLocalModels =============

  describe("listLocalModels", () => {
    it("空 registry（无文件）返回空数组", async () => {
      const models = await listLocalModels();
      expect(models).toEqual([]);
    });

    it("多模型列表", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [
          makeEntry({ id: "model-a", modelName: "Model A" }),
          makeEntry({ id: "model-b", modelName: "Model B" }),
        ],
      });

      const models = await listLocalModels();
      expect(models).toHaveLength(2);
      expect(models[0]!.id).toBe("model-a");
      expect(models[1]!.id).toBe("model-b");
    });
  });

  // ============= getActiveModelId =============

  describe("getActiveModelId", () => {
    it("无 active 返回 null", async () => {
      setRegistry({
        version: 1,
        activeModelId: null,
        models: [makeEntry({ id: "model-a" })],
      });

      const id = await getActiveModelId();
      expect(id).toBeNull();
    });

    it("有 active 返回 id", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" })],
      });

      const id = await getActiveModelId();
      expect(id).toBe("model-a");
    });

    it("无 registry 文件时返回 null", async () => {
      const id = await getActiveModelId();
      expect(id).toBeNull();
    });
  });

  // ============= getActiveModelEntry =============

  describe("getActiveModelEntry", () => {
    it("无 active 返回 null", async () => {
      setRegistry({
        version: 1,
        activeModelId: null,
        models: [makeEntry({ id: "model-a" })],
      });

      const entry = await getActiveModelEntry();
      expect(entry).toBeNull();
    });

    it("有 active 返回对应条目", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-b",
        models: [
          makeEntry({ id: "model-a", modelName: "A" }),
          makeEntry({ id: "model-b", modelName: "B" }),
        ],
      });

      const entry = await getActiveModelEntry();
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe("model-b");
      expect(entry!.modelName).toBe("B");
    });

    it("active id 指向不存在的条目时返回 null", async () => {
      setRegistry({
        version: 1,
        activeModelId: "nonexistent",
        models: [makeEntry({ id: "model-a" })],
      });

      const entry = await getActiveModelEntry();
      expect(entry).toBeNull();
    });
  });

  // ============= setActiveModel =============

  describe("setActiveModel", () => {
    it("切换 active 并触发回调", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" }), makeEntry({ id: "model-b" })],
      });

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      const result = await setActiveModel("model-b");
      expect(result.success).toBe(true);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith("model-b");

      // registry 已更新
      const registry = getWrittenRegistry();
      expect(registry!.activeModelId).toBe("model-b");
    });

    it("不存在的 id 返回失败", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" })],
      });

      const result = await setActiveModel("nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toContain("不存在");
    });

    it("相同 id 不触发回调", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" })],
      });

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      const result = await setActiveModel("model-a");
      expect(result.success).toBe(true);
      expect(cb).not.toHaveBeenCalled();
    });

    it("无回调注册时正常切换", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" }), makeEntry({ id: "model-b" })],
      });

      // 不注册回调
      const result = await setActiveModel("model-b");
      expect(result.success).toBe(true);
      const registry = getWrittenRegistry();
      expect(registry!.activeModelId).toBe("model-b");
    });

    it("writeRegistry 失败时返回错误且不触发回调", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" }), makeEntry({ id: "model-b" })],
      });

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      // 让下一次 writeFile（写 registry）失败
      mocks.writeFile.mockResolvedValueOnce({ success: false, error: "disk full" });

      const result = await setActiveModel("model-b");
      expect(result.success).toBe(false);
      expect(result.error).toContain("写入");
      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ============= removeModel =============

  describe("removeModel", () => {
    it("删除指定模型（文件 + registry 条目）", async () => {
      const entry = makeEntry({ id: "model-a" });
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [entry],
      });
      // 预设模型文件
      fs.set(entry.modelPath, makeValidOnnx());
      fs.set(entry.tokenizerPath, makeValidTokenizer());
      fs.set(`${entry.directory}/config.json`, makeValidConfig());

      const result = await removeModel("model-a");
      expect(result.success).toBe(true);

      // 文件应被删除
      expect(fs.has(entry.modelPath)).toBe(false);
      expect(fs.has(entry.tokenizerPath)).toBe(false);
      expect(fs.has(`${entry.directory}/config.json`)).toBe(false);

      // registry 应不含该条目
      const registry = getWrittenRegistry();
      expect(registry!.models).toHaveLength(0);
    });

    it("删除 active 模型时自动切换到下一个", async () => {
      const entryA = makeEntry({ id: "model-a" });
      const entryB = makeEntry({ id: "model-b" });
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [entryA, entryB],
      });
      fs.set(entryA.modelPath, makeValidOnnx());

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      const result = await removeModel("model-a");
      expect(result.success).toBe(true);

      // active 应切换到 model-b
      const registry = getWrittenRegistry();
      expect(registry!.activeModelId).toBe("model-b");

      // 回调应被触发（切换到 model-b）
      expect(cb).toHaveBeenCalledWith("model-b");
    });

    it("删除唯一 active 模型时 active 变为 null", async () => {
      const entry = makeEntry({ id: "model-a" });
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [entry],
      });
      fs.set(entry.modelPath, makeValidOnnx());

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      const result = await removeModel("model-a");
      expect(result.success).toBe(true);

      const registry = getWrittenRegistry();
      expect(registry!.activeModelId).toBeNull();
      expect(cb).toHaveBeenCalledWith(null);
    });

    it("删除非 active 模型不触发回调", async () => {
      const entryA = makeEntry({ id: "model-a" });
      const entryB = makeEntry({ id: "model-b" });
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [entryA, entryB],
      });
      fs.set(entryB.modelPath, makeValidOnnx());

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      const result = await removeModel("model-b");
      expect(result.success).toBe(true);
      // active 未变化，回调不应触发
      expect(cb).not.toHaveBeenCalled();
    });

    it("删除不存在的 id 返回失败", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" })],
      });

      const result = await removeModel("nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toContain("不存在");
    });

    it("删除量化变体 ONNX 文件", async () => {
      const entry = makeEntry({
        id: "model-a",
        modelFileName: "model_quantized.onnx",
        modelPath: `${MODEL_DIR}/model-a/model_quantized.onnx`,
      });
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [entry],
      });
      fs.set(entry.modelPath, makeValidOnnx());

      const result = await removeModel("model-a");
      expect(result.success).toBe(true);
      expect(fs.has(entry.modelPath)).toBe(false);
    });

    it("部分文件删除失败时返回部分错误但 registry 仍更新", async () => {
      const entry = makeEntry({ id: "model-a" });
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [entry],
      });
      fs.set(entry.modelPath, makeValidOnnx());
      fs.set(entry.tokenizerPath, makeValidTokenizer());
      fs.set(`${entry.directory}/config.json`, makeValidConfig());

      // 让 config.json 删除失败
      mocks.deleteFile.mockImplementation(async (p: string) => {
        if (p.includes("config.json")) {
          throw new Error("permission denied");
        }
        fs.delete(p);
        return true;
      });

      const result = await removeModel("model-a");
      expect(result.success).toBe(false);
      expect(result.error).toContain("部分文件删除失败");

      // 其他文件应已删除
      expect(fs.has(entry.modelPath)).toBe(false);
      expect(fs.has(entry.tokenizerPath)).toBe(false);
      // config.json 仍在（删除失败）
      expect(fs.has(`${entry.directory}/config.json`)).toBe(true);

      // registry 条目仍应被移除
      const registry = getWrittenRegistry();
      expect(registry!.models).toHaveLength(0);
    });
  });

  // ============= installModelFromFiles =============

  describe("installModelFromFiles", () => {
    it("安装新模型到子目录", async () => {
      const result = await installModelFromFiles("new-model", makeInstallFiles());
      expect(result.success).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry!.id).toBe("new-model");
      expect(result.entry!.directory).toBe(`${MODEL_DIR}/new-model`);
      expect(result.entry!.modelName).toBe("new-model");
      expect(result.entry!.dimensions).toBe(256);

      // 文件应写入子目录
      expect(fs.has(`${MODEL_DIR}/new-model/model.onnx`)).toBe(true);
      expect(fs.has(`${MODEL_DIR}/new-model/tokenizer.json`)).toBe(true);
      expect(fs.has(`${MODEL_DIR}/new-model/config.json`)).toBe(true);

      // registry 应包含新条目
      const registry = getWrittenRegistry();
      expect(registry!.models).toHaveLength(1);
      expect(registry!.models[0]!.id).toBe("new-model");
    });

    it("首个模型自动设为 active 并触发回调", async () => {
      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      const result = await installModelFromFiles("new-model", makeInstallFiles());
      expect(result.success).toBe(true);

      const registry = getWrittenRegistry();
      expect(registry!.activeModelId).toBe("new-model");
      expect(cb).toHaveBeenCalledWith("new-model");
    });

    it("已有模型时新安装不自动设为 active", async () => {
      setRegistry({
        version: 1,
        activeModelId: "existing",
        models: [makeEntry({ id: "existing" })],
      });

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      const result = await installModelFromFiles("new-model", makeInstallFiles());
      expect(result.success).toBe(true);

      const registry = getWrittenRegistry();
      expect(registry!.activeModelId).toBe("existing"); // 不变
      expect(cb).not.toHaveBeenCalled();
    });

    it("重复 id 报错", async () => {
      setRegistry({
        version: 1,
        activeModelId: "existing",
        models: [makeEntry({ id: "existing" })],
      });

      const result = await installModelFromFiles("existing", makeInstallFiles());
      expect(result.success).toBe(false);
      expect(result.error).toContain("已存在");
    });

    it("缺少 config.json 报错", async () => {
      const files = [
        { name: "model.onnx", data: toArrayBuffer(makeValidOnnx()) },
        { name: "tokenizer.json", data: toArrayBuffer(makeValidTokenizer()) },
      ];

      const result = await installModelFromFiles("new-model", files);
      expect(result.success).toBe(false);
      expect(result.error).toContain("config.json");
    });

    it("config.json 缺少 modelName 报错", async () => {
      const configBytes = encodeJson({ dimensions: 384 }); // 缺 modelName
      const files = [
        { name: "model.onnx", data: toArrayBuffer(makeValidOnnx()) },
        { name: "tokenizer.json", data: toArrayBuffer(makeValidTokenizer()) },
        { name: "config.json", data: toArrayBuffer(configBytes) },
      ];

      const result = await installModelFromFiles("new-model", files);
      expect(result.success).toBe(false);
      expect(result.error).toContain("modelName");
    });

    it("config.json dimensions 非正整数报错", async () => {
      const configBytes = encodeJson({ modelName: "test", dimensions: 0 });
      const files = [
        { name: "model.onnx", data: toArrayBuffer(makeValidOnnx()) },
        { name: "tokenizer.json", data: toArrayBuffer(makeValidTokenizer()) },
        { name: "config.json", data: toArrayBuffer(configBytes) },
      ];

      const result = await installModelFromFiles("new-model", files);
      expect(result.success).toBe(false);
      expect(result.error).toContain("dimensions");
    });

    it("完整性校验失败时回滚（清理已写入文件）", async () => {
      // ONNX 文件过小（< 1KB）→ 完整性校验失败
      const badOnnx = new Uint8Array(100);
      badOnnx[0] = 0x08;
      const files = [
        { name: "model.onnx", data: toArrayBuffer(badOnnx) },
        { name: "tokenizer.json", data: toArrayBuffer(makeValidTokenizer()) },
        {
          name: "config.json",
          data: toArrayBuffer(makeValidConfig({ modelName: "new-model", dimensions: 256 })),
        },
      ];

      const result = await installModelFromFiles("new-model", files);
      expect(result.success).toBe(false);
      expect(result.error).toContain("ONNX");

      // 已写入的文件应被清理
      expect(fs.has(`${MODEL_DIR}/new-model/model.onnx`)).toBe(false);
      expect(fs.has(`${MODEL_DIR}/new-model/tokenizer.json`)).toBe(false);
      expect(fs.has(`${MODEL_DIR}/new-model/config.json`)).toBe(false);

      // registry 不应包含失败的条目（校验失败时不会写入 registry.json）
      const registry = getWrittenRegistry();
      expect(registry?.models ?? []).toHaveLength(0);
    });

    it("缺少 tokenizer.json 导致完整性校验失败", async () => {
      const files = [
        { name: "model.onnx", data: toArrayBuffer(makeValidOnnx()) },
        {
          name: "config.json",
          data: toArrayBuffer(makeValidConfig({ modelName: "new-model", dimensions: 256 })),
        },
        // 缺 tokenizer.json
      ];

      const result = await installModelFromFiles("new-model", files);
      expect(result.success).toBe(false);
      expect(result.error).toContain("tokenizer.json");
    });

    it("支持量化变体 ONNX 文件名", async () => {
      const files = [
        { name: "model_quantized.onnx", data: toArrayBuffer(makeValidOnnx()) },
        { name: "tokenizer.json", data: toArrayBuffer(makeValidTokenizer()) },
        {
          name: "config.json",
          data: toArrayBuffer(makeValidConfig({ modelName: "new-model", dimensions: 256 })),
        },
      ];

      const result = await installModelFromFiles("new-model", files);
      expect(result.success).toBe(true);
      expect(result.entry!.modelFileName).toBe("model_quantized.onnx");
      expect(result.entry!.modelPath).toContain("model_quantized.onnx");
    });

    it("writeFile 失败时返回错误", async () => {
      // 让下一次 writeFile（第一个文件）失败
      mocks.writeFile.mockResolvedValueOnce({ success: false, error: "disk full" });

      const result = await installModelFromFiles("new-model", makeInstallFiles());
      expect(result.success).toBe(false);
      expect(result.error).toContain("写入");
      expect(result.error).toContain("model.onnx");
    });
  });

  // ============= 软迁移 =============

  describe("软迁移", () => {
    it("根目录有完整模型时自动注册到 registry", async () => {
      // 根目录有完整模型文件，但无 registry.json
      fs.set(`${MODEL_DIR}/model.onnx`, makeValidOnnx());
      fs.set(`${MODEL_DIR}/tokenizer.json`, makeValidTokenizer());
      fs.set(
        `${MODEL_DIR}/config.json`,
        makeValidConfig({ modelName: "root-model", dimensions: 384 }),
      );

      const models = await listLocalModels();
      expect(models).toHaveLength(1);
      expect(models[0]!.modelName).toBe("root-model");
      expect(models[0]!.directory).toBe(MODEL_DIR); // 根目录
      expect(models[0]!.id).toBe("root-model"); // 从 modelName 派生

      // registry.json 应已写入
      const registry = getWrittenRegistry();
      expect(registry).not.toBeNull();
      expect(registry!.activeModelId).toBe("root-model"); // 自动设为 active

      // 模型文件未被移动
      expect(fs.has(`${MODEL_DIR}/model.onnx`)).toBe(true);
    });

    it("根目录无 ONNX 文件时返回空 registry", async () => {
      // 只有 tokenizer 和 config，缺 ONNX
      fs.set(`${MODEL_DIR}/tokenizer.json`, makeValidTokenizer());
      fs.set(`${MODEL_DIR}/config.json`, makeValidConfig());

      const models = await listLocalModels();
      expect(models).toEqual([]);

      // 不应写入 registry.json
      expect(fs.has(REGISTRY_PATH)).toBe(false);
    });

    it("根目录模型校验失败时返回空 registry", async () => {
      // ONNX 文件损坏（过小）
      const badOnnx = new Uint8Array(100);
      badOnnx[0] = 0x08;
      fs.set(`${MODEL_DIR}/model.onnx`, badOnnx);
      fs.set(`${MODEL_DIR}/tokenizer.json`, makeValidTokenizer());
      fs.set(`${MODEL_DIR}/config.json`, makeValidConfig());

      const models = await listLocalModels();
      expect(models).toEqual([]);
      // 不应写入 registry.json
      expect(fs.has(REGISTRY_PATH)).toBe(false);
    });

    it("已有 registry 时不触发软迁移", async () => {
      // 预设 registry
      setRegistry({
        version: 1,
        activeModelId: "registered",
        models: [makeEntry({ id: "registered", modelName: "Registered Model" })],
      });
      // 根目录也有模型文件（不应被扫描）
      fs.set(`${MODEL_DIR}/model.onnx`, makeValidOnnx());
      fs.set(`${MODEL_DIR}/tokenizer.json`, makeValidTokenizer());
      fs.set(`${MODEL_DIR}/config.json`, makeValidConfig({ modelName: "root-model" }));

      const models = await listLocalModels();
      // 应返回 registry 中的条目，不是根目录模型
      expect(models).toHaveLength(1);
      expect(models[0]!.id).toBe("registered");
      expect(models[0]!.modelName).toBe("Registered Model");
    });
  });

  // ============= _setActiveModelChangeCallback =============

  describe("_setActiveModelChangeCallback", () => {
    it("注册回调并在 setActiveModel 时触发", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" }), makeEntry({ id: "model-b" })],
      });

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      await setActiveModel("model-b");
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith("model-b");
    });

    it("注销回调（传 null）后不触发", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" }), makeEntry({ id: "model-b" })],
      });

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);
      _setActiveModelChangeCallback(null); // 注销

      await setActiveModel("model-b");
      expect(cb).not.toHaveBeenCalled();
    });

    it("回调异常不影响切换流程", async () => {
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [makeEntry({ id: "model-a" }), makeEntry({ id: "model-b" })],
      });

      const cb = vi.fn(() => {
        throw new Error("callback error");
      });
      _setActiveModelChangeCallback(cb);

      const result = await setActiveModel("model-b");
      // 切换应成功（异常被捕获）
      expect(result.success).toBe(true);
      expect(cb).toHaveBeenCalledTimes(1);

      // registry 应已更新
      const registry = getWrittenRegistry();
      expect(registry!.activeModelId).toBe("model-b");
    });

    it("removeModel 删除 active 时触发回调", async () => {
      const entryA = makeEntry({ id: "model-a" });
      const entryB = makeEntry({ id: "model-b" });
      setRegistry({
        version: 1,
        activeModelId: "model-a",
        models: [entryA, entryB],
      });
      fs.set(entryA.modelPath, makeValidOnnx());

      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      await removeModel("model-a");
      expect(cb).toHaveBeenCalledWith("model-b"); // 切换到 model-b
    });

    it("installModelFromFiles 首个模型时触发回调", async () => {
      const cb = vi.fn();
      _setActiveModelChangeCallback(cb);

      const files = [
        { name: "model.onnx", data: toArrayBuffer(makeValidOnnx()) },
        { name: "tokenizer.json", data: toArrayBuffer(makeValidTokenizer()) },
        {
          name: "config.json",
          data: toArrayBuffer(makeValidConfig({ modelName: "first-model", dimensions: 256 })),
        },
      ];

      await installModelFromFiles("first-model", files);
      expect(cb).toHaveBeenCalledWith("first-model");
    });
  });
});
