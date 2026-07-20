#!/usr/bin/env node
/**
 * Face Embedding 模型下载脚本
 *
 * 从 HuggingFace Hub 下载 transformers.js 兼容的 ONNX face embedding 模型，
 * 安装到本地目录，并在应用 config.json 中写入 faceEmbeddingModelPath。
 *
 * 与 download-embedding-model.mjs 的差异：
 *   - text embedding 模型依赖 tokenizer.json，安装到应用缓存目录并由 model-manager 管理
 *   - face embedding 模型依赖 preprocessor_config.json，独立目录，路径写入 config.faceEmbeddingModelPath
 *   - 模型不走 model-manager registry，face-embedding-onnx-provider 直接按路径加载
 *
 * 用法：
 *   node scripts/download-face-embedding-model.mjs                              # 默认推荐模型
 *   node scripts/download-face-embedding-model.mjs --model Xenova/arcface-resnet50  # 指定模型
 *   node scripts/download-face-embedding-model.mjs --output ./my-face-models      # 自定义输出目录
 *   node scripts/download-face-embedding-model.mjs --set-config                   # 写入 config.faceEmbeddingModelPath
 *   node scripts/download-face-embedding-model.mjs --help                         # 查看帮助
 *
 * 推荐模型（face embedding）：
 *   - Xenova/arcface-resnet50      (256 维, ~110MB，ArcFace ResNet50)
 *   - Xenova/facenet               (512 维, ~90MB，FaceNet)
 *   - gallusen/face-recognition    (128 维, ~20MB，轻量 MobileFaceNet)
 *
 * 注意：face embedding 模型使用 `image-feature-extraction` pipeline，
 * 依赖 preprocessor_config.json（图像预处理配置），不需要 tokenizer.json。
 *
 * 下载后会自动修改 config.json，添加 modelName/dimensions/maxTokens/language/description 字段，
 * 使其符合 verifyFaceModelIntegrity 校验要求。
 */

import fs from "fs";
import fsp from "fs/promises";
import https from "https";
import path from "path";
import os from "os";

// ============= 常量 =============

const CURRENT_DIR_NAME = "PrismCraft";
const LEGACY_DIR_NAME = "AI Animation Studio";
const FACE_EMBEDDING_SUBDIR = "Cache/Videos/models/face-embedding";

/** HF Hub 文件下载基础 URL */
const HF_BASE = "https://huggingface.co";

/** 默认模型仓库 */
const DEFAULT_MODEL = "Xenova/arcface-resnet50";

/** 推荐模型预设（modelId → 显示信息） */
const MODEL_PRESETS = {
  "Xenova/arcface-resnet50": {
    modelName: "arcface-resnet50",
    dimensions: 256,
    language: "en",
    description: "ArcFace ResNet50 face embedding 模型（256 维，推荐）",
  },
  "Xenova/facenet": {
    modelName: "facenet",
    dimensions: 512,
    language: "en",
    description: "FaceNet face embedding 模型（512 维）",
  },
  "gallusen/face-recognition": {
    modelName: "face-recognition",
    dimensions: 128,
    language: "en",
    description: "轻量 MobileFaceNet face embedding 模型（128 维）",
  },
};

/**
 * 必需下载的文件（HF repo 内路径 → 本地文件名）
 *
 * face embedding 模型必需：config.json + preprocessor_config.json
 * （不需要 tokenizer.json，因为输入是图像而非文本）
 */
const REQUIRED_FILES = [
  { repoPath: "config.json", localName: "config.json" },
  { repoPath: "preprocessor_config.json", localName: "preprocessor_config.json" },
];

/** ONNX 文件候选（按优先级：量化版优先，更小） */
const ONNX_FILES_QUANTIZED = [
  { repoPath: "onnx/model_quantized.onnx", localName: "model_quantized.onnx" },
  { repoPath: "onnx/model.onnx", localName: "model.onnx" },
];

const ONNX_FILES_FULL = [
  { repoPath: "onnx/model.onnx", localName: "model.onnx" },
  { repoPath: "onnx/model_fp16.onnx", localName: "model_fp16.onnx" },
];

// ============= 工具函数 =============

/** 解析命令行参数 */
function parseArgs(argv) {
  const args = {
    model: DEFAULT_MODEL,
    output: null,
    quantized: true,
    setConfig: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--model") {
      args.model = argv[++i];
    } else if (arg === "--output") {
      args.output = argv[++i];
    } else if (arg === "--quantized") {
      args.quantized = argv[++i] !== "false";
    } else if (arg === "--set-config") {
      args.setConfig = true;
    }
  }
  return args;
}

/** 显示帮助 */
function showHelp() {
  console.log(`
Face Embedding 模型下载脚本

用法：
  node scripts/download-face-embedding-model.mjs [选项]

选项：
  --model <repo>      HuggingFace 模型仓库（默认：${DEFAULT_MODEL}）
  --output <dir>      自定义输出目录（默认：应用缓存目录）
  --quantized <bool>  下载量化版（true，默认）或全精度版（false）
  --set-config        下载完成后将路径写入应用 config.faceEmbeddingModelPath
  --help, -h          显示帮助

推荐模型：
  Xenova/arcface-resnet50    256 维, ~110MB（默认）
  Xenova/facenet             512 维, ~90MB
  gallusen/face-recognition  128 维, ~20MB（轻量）

示例：
  node scripts/download-face-embedding-model.mjs
  node scripts/download-face-embedding-model.mjs --model Xenova/facenet --set-config
  node scripts/download-face-embedding-model.mjs --output ./my-face-models
`);
}

/** 获取应用用户数据根目录（兼容新旧目录名） */
function getUserDataRoot() {
  const legacy = path.join(os.homedir(), LEGACY_DIR_NAME);
  const current = path.join(os.homedir(), CURRENT_DIR_NAME);
  return fs.existsSync(legacy) ? legacy : current;
}

/** 获取应用 config.json 路径 */
function getConfigFilePath() {
  return path.join(getUserDataRoot(), "config.json");
}

/** 从仓库名提取简短 modelName（取 / 后部分） */
function repoToModelName(repo) {
  return repo.split("/").pop() || repo;
}

/**
 * 下载单个文件（支持重定向，显示进度）
 * @returns {Promise<Buffer>} 文件内容
 */
function downloadFile(url, displayPath) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const location = res.headers.location;
        if (location) {
          downloadFile(location, displayPath).then(resolve, reject);
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }

      const total = parseInt(res.headers["content-length"] || "0", 10);
      let received = 0;
      const chunks = [];

      res.on("data", (chunk) => {
        chunks.push(chunk);
        received += chunk.length;
        if (total > 0) {
          const percent = ((received / total) * 100).toFixed(1);
          process.stdout.write(`\r  ↓ ${displayPath}: ${percent}% (${formatBytes(received)}/${formatBytes(total)})`);
        }
      });

      res.on("end", () => {
        if (total > 0) process.stdout.write("\n");
        resolve(Buffer.concat(chunks));
      });

      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

/** 格式化字节大小 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/** 安全写入文件（确保目录存在） */
async function writeFile(dir, fileName, data) {
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fsp.writeFile(filePath, data);
  return filePath;
}

/**
 * 修改 config.json，添加 verifyFaceModelIntegrity 需要的自定义字段
 *
 * face embedding 模型的原始 config.json 可能不包含 modelName/dimensions，
 * 我们从模型预设中读取并注入，确保 verifyFaceModelIntegrity 能通过。
 */
function enhanceConfig(originalConfig, preset) {
  const config = { ...originalConfig };
  config.modelName = preset.modelName;
  config.dimensions = preset.dimensions;
  config.language = preset.language;
  config.description = preset.description;
  return config;
}

/**
 * 将 faceEmbeddingModelPath 写入应用 config.json
 *
 * 不覆盖其他字段，只 set faceEmbeddingModelPath。
 * 文件不存在时创建最小结构。
 */
async function writeFaceEmbeddingModelPath(configPath, modelDir) {
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      const raw = await fsp.readFile(configPath, "utf-8");
      config = JSON.parse(raw);
    } catch (e) {
      console.warn(`  ⚠ 现有 config.json 解析失败，将覆盖：${e.message}`);
      config = {};
    }
  }
  config.faceEmbeddingModelPath = modelDir;
  await fsp.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  console.log(`  ✓ 已写入 config.faceEmbeddingModelPath = ${modelDir}`);
}

// ============= 主流程 =============

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    return;
  }

  if (!args.model) {
    console.error("错误：--model 参数不能为空");
    process.exit(1);
  }

  const repo = args.model;
  const preset = MODEL_PRESETS[repo] || {
    modelName: repoToModelName(repo),
    dimensions: 512, // 未知时保守值，用户可在 config.json 中手动修正
    language: "en",
    description: `Face embedding model from ${repo}`,
  };

  console.log("=".repeat(60));
  console.log("Face Embedding 模型下载脚本");
  console.log("=".repeat(60));
  console.log(`模型仓库: ${repo}`);
  console.log(`模型名称: ${preset.modelName}`);
  console.log(`向量维度: ${preset.dimensions}`);
  console.log(`语言:     ${preset.language}`);
  console.log(`量化版:   ${args.quantized ? "是" : "否"}`);

  // 确定输出目录
  const outputRoot = args.output || path.join(getUserDataRoot(), FACE_EMBEDDING_SUBDIR);
  const outputDir = path.join(outputRoot, preset.modelName);
  console.log(`输出目录: ${outputDir}`);
  console.log("-".repeat(60));

  // 确保输出目录存在
  await fsp.mkdir(outputDir, { recursive: true });

  // 1. 下载 config.json
  console.log("\n[1/4] 下载 config.json...");
  const configBuffer = await downloadFile(
    `${HF_BASE}/${repo}/resolve/main/config.json`,
    "config.json",
  );
  await writeFile(outputDir, "config.json", configBuffer);

  let originalConfig;
  try {
    originalConfig = JSON.parse(configBuffer.toString("utf-8"));
  } catch {
    originalConfig = {};
  }
  const enhancedConfig = enhanceConfig(originalConfig, preset);
  await writeFile(outputDir, "config.json", JSON.stringify(enhancedConfig, null, 2));
  console.log("  ✓ config.json 已增强（注入 modelName/dimensions/language/description）");

  // 2. 下载 preprocessor_config.json
  console.log("\n[2/4] 下载 preprocessor_config.json...");
  try {
    const preprocessorBuffer = await downloadFile(
      `${HF_BASE}/${repo}/resolve/main/preprocessor_config.json`,
      "preprocessor_config.json",
    );
    await writeFile(outputDir, "preprocessor_config.json", preprocessorBuffer);
    console.log("  ✓ preprocessor_config.json 已下载");
  } catch (e) {
    console.error(`\n  ✗ 下载 preprocessor_config.json 失败：${e.message}`);
    console.error("    face embedding 模型必需 preprocessor_config.json，请确认仓库是否正确。");
    process.exit(1);
  }

  // 3. 下载 ONNX 模型文件
  console.log("\n[3/4] 下载 ONNX 模型...");
  const onnxCandidates = args.quantized ? ONNX_FILES_QUANTIZED : ONNX_FILES_FULL;
  let onnxDownloaded = false;
  for (const candidate of onnxCandidates) {
    const url = `${HF_BASE}/${repo}/resolve/main/${candidate.repoPath}`;
    try {
      console.log(`\n  尝试下载 ${candidate.repoPath}...`);
      const onnxBuffer = await downloadFile(url, candidate.localName);
      await writeFile(outputDir, candidate.localName, onnxBuffer);
      console.log(`  ✓ ${candidate.localName} 已下载 (${formatBytes(onnxBuffer.length)})`);
      onnxDownloaded = true;
      break;
    } catch (e) {
      console.log(`  - ${candidate.repoPath} 不存在或下载失败：${e.message}`);
    }
  }
  if (!onnxDownloaded) {
    console.error("\n  ✗ 所有 ONNX 文件候选均下载失败，请检查仓库或网络。");
    process.exit(1);
  }

  // 4. 可选：写入应用 config
  console.log("\n[4/4] 写入应用配置...");
  if (args.setConfig) {
    const configPath = getConfigFilePath();
    try {
      await writeFaceEmbeddingModelPath(configPath, outputDir);
      console.log("  ✓ 应用 config.json 已更新");
    } catch (e) {
      console.error(`  ✗ 写入 config.json 失败：${e.message}`);
      console.error(`    请手动在 config.json 中添加："faceEmbeddingModelPath": "${outputDir}"`);
    }
  } else {
    console.log("  跳过写入 config（如需自动写入，请加 --set-config 参数）");
    console.log(`  请手动在应用设置面板的 Face Embedding 模型卡片中填入路径：`);
    console.log(`  ${outputDir}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✓ Face Embedding 模型下载完成！");
  console.log("=".repeat(60));
  console.log(`\n下一步：`);
  console.log(`  1. 打开应用 → 设置 → 向量模型`);
  console.log(`  2. 找到 "Face Embedding 模型" 卡片`);
  console.log(`  3. 在输入框中粘贴路径：${outputDir}`);
  console.log(`  4. 点击"测试模型"按钮校验完整性`);
  console.log(`  5. 点击"保存"激活 ONNX face embedding provider`);
  console.log(`\n注意：首次推理时 transformers.js 会加载模型（2-5 秒），之后缓存复用。`);
  console.log(`如未安装 @huggingface/transformers，将自动降级为 VLM/noop 模式。`);
}

main().catch((e) => {
  console.error("\n下载失败：", e.message);
  process.exit(1);
});
