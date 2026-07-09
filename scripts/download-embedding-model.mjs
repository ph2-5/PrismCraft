#!/usr/bin/env node
/**
 * Embedding 模型下载脚本（L1）
 *
 * 从 HuggingFace Hub 下载 transformers.js 兼容的 ONNX embedding 模型，
 * 安装到应用缓存目录 `<USER_DATA_ROOT>/Cache/Videos/models/embedding/<modelId>/`。
 *
 * 用法：
 *   node scripts/download-embedding-model.mjs                       # 默认下载 all-MiniLM-L6-v2
 *   node scripts/download-embedding-model.mjs --model Xenova/bge-small-zh-v1.5  # 下载中文模型
 *   node scripts/download-embedding-model.mjs --output ./models     # 自定义输出目录
 *   node scripts/download-embedding-model.mjs --quantized false     # 下载全精度版（更大）
 *   node scripts/download-embedding-model.mjs --help                # 查看帮助
 *
 * 推荐模型：
 *   - Xenova/all-MiniLM-L6-v2      (英文, 384 维, 量化版 ~33MB)  ← 默认
 *   - Xenova/bge-small-zh-v1.5     (中文, 512 维, 量化版 ~50MB)
 *   - Xenova/multilingual-e5-small (多语言, 384 维, 量化版 ~120MB)
 *   - Xenova/gte-small              (英文, 384 维, 量化版 ~33MB)
 *
 * 下载后会自动修改 config.json，添加 modelName/dimensions/maxTokens/language/description 字段，
 * 使其符合 model-manager 的完整性校验要求。
 */

import fs from "fs";
import fsp from "fs/promises";
import https from "https";
import path from "path";
import os from "os";

// ============= 常量 =============

const CURRENT_DIR_NAME = "PrismCraft";
const LEGACY_DIR_NAME = "AI Animation Studio";
const EMBEDDING_SUBDIR = "Cache/Videos/models/embedding";

/** HF Hub 文件下载基础 URL */
const HF_BASE = "https://huggingface.co";

/** 默认模型仓库 */
const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";

/** 推荐模型预设（modelId → 显示信息） */
const MODEL_PRESETS = {
  "Xenova/all-MiniLM-L6-v2": {
    modelName: "all-MiniLM-L6-v2",
    language: "en",
    description: "轻量英文 embedding 模型（推荐，384 维）",
  },
  "Xenova/bge-small-zh-v1.5": {
    modelName: "bge-small-zh-v1.5",
    language: "zh",
    description: "轻量中文 embedding 模型（512 维）",
  },
  "Xenova/multilingual-e5-small": {
    modelName: "multilingual-e5-small",
    language: "multilingual",
    description: "多语言 embedding 模型（384 维）",
  },
  "Xenova/gte-small": {
    modelName: "gte-small",
    language: "en",
    description: "英文 embedding 模型（384 维）",
  },
};

/** 必需下载的文件（HF repo 内路径 → 本地文件名） */
const REQUIRED_FILES = [
  { repoPath: "config.json", localName: "config.json" },
  { repoPath: "tokenizer.json", localName: "tokenizer.json" },
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

/** 可选辅助文件（存在则下载） */
const OPTIONAL_FILES = [
  { repoPath: "tokenizer_config.json", localName: "tokenizer_config.json" },
  { repoPath: "special_tokens_map.json", localName: "special_tokens_map.json" },
  { repoPath: "vocab.txt", localName: "vocab.txt" },
];

// ============= 工具函数 =============

/** 解析命令行参数 */
function parseArgs(argv) {
  const args = { model: DEFAULT_MODEL, output: null, quantized: true, help: false };
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
    }
  }
  return args;
}

/** 显示帮助 */
function showHelp() {
  console.log(`
Embedding 模型下载脚本

用法：
  node scripts/download-embedding-model.mjs [选项]

选项：
  --model <repo>      HuggingFace 模型仓库（默认：${DEFAULT_MODEL}）
  --output <dir>      自定义输出目录（默认：应用缓存目录）
  --quantized <bool>  下载量化版（true，默认）或全精度版（false）
  --help, -h          显示帮助

推荐模型：
  Xenova/all-MiniLM-L6-v2       英文, 384 维, 量化版 ~33MB（默认）
  Xenova/bge-small-zh-v1.5      中文, 512 维, 量化版 ~50MB
  Xenova/multilingual-e5-small  多语言, 384 维, 量化版 ~120MB
  Xenova/gte-small              英文, 384 维, 量化版 ~33MB

示例：
  node scripts/download-embedding-model.mjs
  node scripts/download-embedding-model.mjs --model Xenova/bge-small-zh-v1.5
  node scripts/download-embedding-model.mjs --output ./my-models
`);
}

/** 获取应用用户数据根目录（兼容新旧目录名） */
function getUserDataRoot() {
  const legacy = path.join(os.homedir(), LEGACY_DIR_NAME);
  const current = path.join(os.homedir(), CURRENT_DIR_NAME);
  return fs.existsSync(legacy) ? legacy : current;
}

/** 从 modelName 派生 modelId（小写 + 非 [a-z0-9-] 替换为 -） */
function deriveModelId(modelName) {
  return modelName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
      // 处理重定向
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
 * 修改 config.json，添加 model-manager 需要的自定义字段
 *
 * transformers.js 模型的原始 config.json 包含 hidden_size / max_position_embeddings，
 * 我们将其映射为 dimensions / maxTokens，并添加 modelName / language / description。
 */
function enhanceConfig(originalConfig, modelName, language, description) {
  const config = { ...originalConfig };

  // 添加应用自定义字段
  config.modelName = modelName;
  config.dimensions = config.hidden_size || config.dim || 384;
  config.maxTokens = config.max_position_embeddings || config.max_seq_length || 256;
  config.language = language;
  config.description = description;

  return config;
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
  const preset = MODEL_PRESETS[repo];
  const modelName = preset?.modelName || repoToModelName(repo);
  const language = preset?.language || "en";
  const description = preset?.description || `Embedding model from ${repo}`;
  const modelId = deriveModelId(modelName);

  console.log("=".repeat(60));
  console.log("Embedding 模型下载脚本");
  console.log("=".repeat(60));
  console.log(`模型仓库: ${repo}`);
  console.log(`模型名称: ${modelName}`);
  console.log(`模型 ID:  ${modelId}`);
  console.log(`语言:     ${language}`);
  console.log(`量化版:   ${args.quantized ? "是" : "否"}`);

  // 确定输出目录
  const outputRoot = args.output || path.join(getUserDataRoot(), EMBEDDING_SUBDIR);
  const outputDir = path.join(outputRoot, modelId);
  console.log(`输出目录: ${outputDir}`);
  console.log("-".repeat(60));

  // 确保输出目录存在
  await fsp.mkdir(outputDir, { recursive: true });

  // 1. 下载 config.json（先下载，用于读取 dimensions）
  console.log("\n[1/4] 下载 config.json...");
  const configBuffer = await downloadFile(
    `${HF_BASE}/${repo}/resolve/main/config.json`,
    "config.json",
  );
  const originalConfig = JSON.parse(configBuffer.toString("utf-8"));
  const enhancedConfig = enhanceConfig(originalConfig, modelName, language, description);
  await writeFile(outputDir, "config.json", JSON.stringify(enhancedConfig, null, 2));
  console.log(`  ✓ config.json (dimensions=${enhancedConfig.dimensions}, maxTokens=${enhancedConfig.maxTokens})`);

  // 2. 下载 tokenizer.json
  console.log("\n[2/4] 下载 tokenizer.json...");
  try {
    const tokenizerBuffer = await downloadFile(
      `${HF_BASE}/${repo}/resolve/main/tokenizer.json`,
      "tokenizer.json",
    );
    await writeFile(outputDir, "tokenizer.json", tokenizerBuffer);
    console.log("  ✓ tokenizer.json");
  } catch (e) {
    console.error(`\n错误：tokenizer.json 下载失败：${e.message}`);
    console.error("该模型可能不兼容 transformers.js，请选择 Xenova/ 前缀的模型。");
    process.exit(1);
  }

  // 3. 下载 ONNX 模型文件
  console.log("\n[3/4] 下载 ONNX 模型文件...");
  const onnxCandidates = args.quantized ? ONNX_FILES_QUANTIZED : ONNX_FILES_FULL;
  let onnxDownloaded = false;
  for (const { repoPath, localName } of onnxCandidates) {
    try {
      console.log(`  尝试下载 ${repoPath}...`);
      const onnxBuffer = await downloadFile(
        `${HF_BASE}/${repo}/resolve/main/${repoPath}`,
        localName,
      );
      await writeFile(outputDir, localName, onnxBuffer);
      console.log(`  ✓ ${localName} (${formatBytes(onnxBuffer.length)})`);
      onnxDownloaded = true;
      break;
    } catch (e) {
      console.log(`  跳过 ${repoPath}（${e.message}）`);
    }
  }
  if (!onnxDownloaded) {
    console.error("\n错误：无法下载任何 ONNX 文件，该模型可能不支持 transformers.js。");
    process.exit(1);
  }

  // 4. 下载可选辅助文件
  console.log("\n[4/4] 下载可选辅助文件...");
  for (const { repoPath, localName } of OPTIONAL_FILES) {
    try {
      const buffer = await downloadFile(
        `${HF_BASE}/${repo}/resolve/main/${repoPath}`,
        localName,
      );
      await writeFile(outputDir, localName, buffer);
      console.log(`  ✓ ${localName}`);
    } catch {
      console.log(`  跳过 ${localName}（不存在）`);
    }
  }

  // 完成
  console.log("\n" + "=".repeat(60));
  console.log("✓ 模型下载完成！");
  console.log("=".repeat(60));
  console.log(`\n模型已安装到: ${outputDir}`);
  console.log(`\n下一步：`);
  console.log(`  1. 启动应用`);
  console.log(`  2. 进入设置 → 向量模型`);
  console.log(`  3. 系统会自动检测到新安装的模型`);
  console.log(`  4. 点击"启用"激活该模型\n`);

  // 如果下载到默认目录，提示自动检测
  if (!args.output) {
    console.log(`提示：模型已下载到应用缓存目录，启动应用后会自动注册到 registry.json。`);
  } else {
    console.log(`提示：模型已下载到自定义目录，请手动复制到应用缓存目录：`);
    console.log(`  ${path.join(getUserDataRoot(), EMBEDDING_SUBDIR, modelId)}`);
  }
}

main().catch((error) => {
  console.error("\n下载失败：", error instanceof Error ? error.message : error);
  process.exit(1);
});
