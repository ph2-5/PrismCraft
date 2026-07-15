/**
 * Stryker 8.x — Command Runner 模式
 *
 * 为什么不用 native vitest runner：
 *   Vitest 4.x 改了内部 API (project.server 不再存在)，
 *   Stryker 8.x 和 9.x 的 vitest-runner 都还没适配。
 *
 * Command runner 方案：
 *   Stryker → 修改源码 → shell out `npx vitest run` → 检查退出码
 *   绕过了 Stryker 直接调用 Vitest 内部 API 的问题。
 *
 * Task 3.1：新增 4 个 mutate 目标（model-capabilities-utils / video-service /
 * mood-shot-mapping / shot-recommender），并使用 vitest.config.stryker.ts
 * 禁用覆盖率阈值，避免 Stryker 初始测试运行因覆盖率不足误判失败。
 */

const FIRST_BATCH = [
  "src/domain/types/result.ts",
  "src/domain/types/error-codes.ts",
  "src/domain/types/sync.ts",
];

// Task 3.1：新增 mutate 目标（模型能力自适应 + 镜头推荐）
const TASK_3_1_BATCH = [
  "src/infrastructure/ai-providers/model-capabilities-utils.ts",
  "src/infrastructure/ai-providers/video-service.ts",
  "src/shared-logic/shot/mood-shot-mapping.ts",
  "src/modules/shot/shot-instruction/services/shot-recommender.ts",
];

export default {
  packageManager: "npm",
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/index.html" },

  mutate: [...FIRST_BATCH, ...TASK_3_1_BATCH],

  ignorePatterns: [
    "node_modules",
    "dist",
    "out",
    "*.d.ts",
    // 注意：不要排除 __tests__ 或 *.test.*！
    // ignorePatterns 控制的是"不复制到 sandbox"的文件，
    // 排除测试文件会导致 sandbox 里没有测试可跑！
    // Task 3.1：不排除 electron，因为 5 个 sync 测试文件导入 electron/src/handlers/sync
  ],

  testRunner: "command",
  commandRunner: {
    // Task 3.1：禁用覆盖率阈值，避免 Stryker 初始测试运行因覆盖率不足误判失败
    command: "npx vitest run --coverage.enabled=false",
  },

  coverageAnalysis: "off",
  disableTypeChecks: true,

  mutator: {
    excludedMutations: [
      "StringLiteral",
      "ArrayDeclaration",
      "ConditionalExpression",
    ],
  },

  timeoutMS: 60000,
  timeoutFactor: 3,
  maxTestRunnerReuse: 0,
  concurrency: 1,

  thresholds: { high: 95, low: 70, break: null },
  logLevel: "info",
  cleanTempDir: true,
  force: true,
  dryRunTimeoutMinutes: 10,
};
