import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const deprecatedImportPatterns = [
  {
    group: ["@/types/*", "@/types"],
    message:
      "\u274C @/types \u5DF2\u5F03\u7528\uFF0C\u8BF7\u4F7F\u7528 @/domain/schemas \u4F5C\u4E3A\u552F\u4E00\u7C7B\u578B\u6E90",
  },
  {
    group: ["@/lib/*", "@/lib"],
    message:
      "\u274C @/lib \u5DF2\u5168\u90E8\u8FC1\u79FB\uFF0C\u8BF7\u4F7F\u7528 @/modules/*\u3001@/infrastructure/* \u6216 @/shared/*",
  },
  {
    group: ["@/application/services/*", "@/application/services"],
    message:
      "\u274C @/application/services \u5DF2\u5F03\u7528\uFF0C\u8BF7\u76F4\u63A5\u4ECE\u5404\u6A21\u5757\u5BFC\u5165\u670D\u52A1",
  },
  {
    group: ["@/application/hooks/*", "@/application/hooks"],
    message:
      "\u274C @/application/hooks \u5DF2\u5F03\u7528\uFF0C\u8BF7\u76F4\u63A5\u4ECE\u5404\u6A21\u5757\u5BFC\u5165 hooks",
  },
  {
    group: ["@/application/stores/*", "@/application/stores"],
    message:
      "\u274C @/application/stores \u5DF2\u8FC1\u79FB\uFF0C\u8BF7\u4F7F\u7528 @/shared/app-store \u6216 @/modules/video/use-video-task-manager",
  },
  {
    group: ["@/components/*", "@/components"],
    message:
      "\u274C @/components \u5DF2\u8FC1\u79FB\uFF0C\u8BF7\u4F7F\u7528 @/shared/ui\u3001@/shared/presentation \u6216\u5404\u6A21\u5757\u7684 presentation/ \u76EE\u5F55",
  },
  {
    group: ["@/modules/*/*/*"],
    message:
      "\u274C \u7981\u6B62\u8DE8\u6A21\u5757\u4E09\u7EA7\u6DF1\u5C42\u5BFC\u5165\uFF0C\u8BF7\u4F7F\u7528\u6A21\u5757\u6876\u5BFC\u5165 @/modules/xxx",
  },
];

const infraSubdomainsExceptDi = [
  "@/infrastructure/api",
  "@/infrastructure/api/**",
  "@/infrastructure/ai-providers/api-cache",
  "@/infrastructure/ai-providers/api-cache/**",
  "@/infrastructure/ai-providers/api-config",
  "@/infrastructure/ai-providers/api-config/**",
  "@/infrastructure/ai-providers/config",
  "@/infrastructure/ai-providers/config-status",
  "@/infrastructure/ai-providers/core",
  "@/infrastructure/ai-providers/enhanced-video",
  "@/infrastructure/ai-providers/errors",
  "@/infrastructure/ai-providers/image",
  "@/infrastructure/ai-providers/image-normalization",
  "@/infrastructure/ai-providers/index",
  "@/infrastructure/ai-providers/model-adapter",
  "@/infrastructure/ai-providers/model-adapter/**",
  "@/infrastructure/ai-providers/multi-api",
  "@/infrastructure/ai-providers/offline-queue",
  "@/infrastructure/ai-providers/outfit-synthesis",
  "@/infrastructure/ai-providers/providers",
  "@/infrastructure/ai-providers/providers/**",
  "@/infrastructure/ai-providers/services",
  "@/infrastructure/ai-providers/text",
  "@/infrastructure/ai-providers/types",
  "@/infrastructure/ai-providers/utils",
  "@/infrastructure/ai-providers/video",
  "@/infrastructure/ai-providers/video-service",
  "@/infrastructure/database",
  "@/infrastructure/database/**",
  "@/infrastructure/monitoring",
  "@/infrastructure/monitoring/**",
  "@/infrastructure/network",
  "@/infrastructure/network/**",
  "@/infrastructure/server",
  "@/infrastructure/server/**",
  "@/infrastructure/storage",
  "@/infrastructure/storage/**",
  "@/infrastructure/video-utils",
  "@/infrastructure/video-utils/**",
  "@/infrastructure/api-config-facade",
];

const noDirectDbIpcPlugin = {
  meta: { name: "eslint-plugin-no-direct-db-ipc" },
  rules: {
    "no-direct-db-ipc": {
      meta: {
        type: "suggestion",
        messages: {
          noDirectDbIpc:
            "\uD83D\uDEAB modules \u5C42\u7981\u6B62\u76F4\u63A5\u4F7F\u7528 IPC \u6570\u636E\u5E93\u64CD\u4F5C (electronAPI.{{method}})\uFF0C\u4E1A\u52A1\u903B\u8F91\u5E94\u901A\u8FC7 HTTP API \u6216 DI \u5BB9\u5668\u8BBF\u95EE",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename.replace(/\\/g, "/");
        if (!filename.includes("src/modules/")) return {};

        const FORBIDDEN_METHODS = new Set([
          "dbQuery",
          "dbRun",
          "dbBatchInsert",
          "dbGet",
          "dbTransaction",
        ]);

        function isElectronApiObject(obj) {
          return (
            (obj.type === "Identifier" && obj.name === "electronAPI") ||
            (obj.type === "MemberExpression" &&
              !obj.computed &&
              obj.object.type === "Identifier" &&
              obj.object.name === "window" &&
              obj.property.type === "Identifier" &&
              obj.property.name === "electronAPI")
          );
        }

        function checkCall(node) {
          const callee = node.callee;
          if (
            callee.type === "MemberExpression" &&
            !callee.computed &&
            isElectronApiObject(callee.object) &&
            callee.property.type === "Identifier" &&
            FORBIDDEN_METHODS.has(callee.property.name)
          ) {
            context.report({
              node,
              messageId: "noDirectDbIpc",
              data: { method: callee.property.name },
            });
          }
        }

        return {
          CallExpression: checkCall,
        };
      },
    },
  },
};

const eslintConfig = tseslint.config(
  tseslint.configs.base,
  {
    ignores: [
      "out/**",
      "build/**",
      "dist/**",
      "release/**",
      "release2/**",
      "coverage/**",
      "electron/dist/**",
      "scripts/**",
      "*.cjs",
      "analyze-coverage.js",
      "check-db.js",
      "test-schema.js",
      "test-pragma.js",
    ],
  },
  {
    plugins: { "react-hooks": reactHooksPlugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info", "debug"] }],
      "no-restricted-imports": [
        "error",
        { patterns: deprecatedImportPatterns },
      ],
      "react-hooks/rules-of-hooks": "error",
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "prefer-const": ["warn", { destructuring: "all" }],
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true }],
      "max-params": ["warn", 8],
      "max-depth": ["warn", 4],
      "complexity": ["warn", 20],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports", disallowTypeAnnotations: false }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "electron/src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": [
        "warn",
        {
          selector: "CallExpression[callee.name='success'] > Literal:first-child",
          message: "🚏 R56: 请使用 t() 消息常量替代硬编码字符串，如 success(t('success.saved'), ...)",
        },
        {
          selector: "CallExpression[callee.name='error'] > Literal:first-child",
          message: "🚏 R56: 请使用 t() 消息常量替代硬编码字符串，如 error(t('error.saveFailed'), ...)",
        },
        {
          selector: "CallExpression[callee.name='showError'] > Literal:first-child",
          message: "🚏 R56: 请使用 t() 消息常量替代硬编码字符串，如 showError(t('error.saveFailed'), ...)",
        },
      ],
    },
  },
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // 测试用例本身需要长 setup（mock 配置、多步断言），放宽行数限制
      "max-lines-per-function": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
      // 测试嵌套 describe/it/expect 链路天然较深
      "max-depth": ["warn", 5],
      // 测试分支覆盖多场景，复杂度适度放宽
      "complexity": ["warn", 25],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { react: reactPlugin },
    rules: {
      "react/no-unescaped-entities": "warn",
    },
  },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...deprecatedImportPatterns,
            {
              group: ["@/infrastructure", "@/infrastructure/**"],
              message:
                "\uD83C\uDFD7\uFE0F DDD: domain \u5C42\u7981\u6B62\u4F9D\u8D56 infrastructure\uFF0Cdomain \u662F\u7EAF\u4E1A\u52A1\u903B\u8F91\u5C42",
            },
            {
              group: ["@/modules", "@/modules/**"],
              message:
                "\uD83C\uDFD7\uFE0F DDD: domain \u5C42\u7981\u6B62\u4F9D\u8D56 modules\uFF0Cdomain \u662F\u6700\u5185\u5C42",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**/*.{ts,tsx}", "!src/shared/db-core/**", "!src/shared/api-config/**", "!src/shared/video-cache/**", "!src/shared/outfit/**", "!src/shared/sql-safety/**", "!src/shared/model-capabilities.*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...deprecatedImportPatterns,
            {
              group: ["@/infrastructure", "@/infrastructure/**"],
              message:
                "\uD83C\uDFD7\uFE0F DDD: shared \u5C42\u7981\u6B62\u4F9D\u8D56 infrastructure\uFF0C\u4EE3\u7406\u5BFC\u51FA\u76EE\u5F55\u9664\u5916\uFF08db-core, api-config, video-cache, outfit, sql-safety, model-capabilities\uFF09",
            },
            {
              group: ["@/modules", "@/modules/**"],
              message:
                "\uD83C\uDFD7\uFE0F DDD: shared \u5C42\u7981\u6B62\u4F9D\u8D56 modules\uFF0Cshared \u662F\u5E95\u5C42\u901A\u7528\u5C42",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/db-core/**/*.{ts,tsx}", "src/shared/api-config/**/*.{ts,tsx}", "src/shared/video-cache/**/*.{ts,tsx}", "src/shared/outfit/**/*.{ts,tsx}", "src/shared/sql-safety/**/*.{ts,tsx}", "src/shared/model-capabilities.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...deprecatedImportPatterns,
            {
              group: ["@/modules", "@/modules/**"],
              message:
                "\uD83C\uDFD7\uFE0F DDD: shared \u5C42\u7981\u6B62\u4F9D\u8D56 modules\uFF0Cshared \u662F\u5E95\u5C42\u901A\u7528\u5C42",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/**/*.{ts,tsx}", "!src/modules/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...deprecatedImportPatterns,
            {
              group: infraSubdomainsExceptDi,
              message:
                "\uD83C\uDFD7\uFE0F DDD: modules \u5C42\u7981\u6B62\u76F4\u63A5\u4F9D\u8D56 infrastructure \u5B50\u57DF\uFF0C\u8BF7\u901A\u8FC7 DI \u5BB9\u5668 (@/infrastructure/di) \u89E3\u8026",
            },
            {
              group: [
                "@/modules/video/*/*",
                "@/modules/story/*/*",
                "@/modules/character/*/*",
                "@/modules/scene/*/*",
                "@/modules/shot/*/*",
                "@/modules/prompt/*/*",
                "@/modules/asset/*/*",
                "@/modules/sync/*/*",
                "@/modules/persistence/*/*",
              ],
              message:
                "\uD83C\uDFD7\uFE0F DDD: \u7981\u6B62\u8DE8\u6A21\u5757\u6DF1\u8DEF\u5F84\u5BFC\u5165\uFF0C\u8BF7\u4F7F\u7528\u6876\u5BFC\u5165 @/modules/xxx \u6216\u901A\u8FC7 DI \u5BB9\u5668\u89E3\u8026",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/**/__tests__/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            ...deprecatedImportPatterns,
            {
              group: infraSubdomainsExceptDi,
              message:
                "\uD83C\uDFD7\uFE0F DDD: modules \u5C42\u7981\u6B62\u76F4\u63A5\u4F9D\u8D56 infrastructure \u5B50\u57DF\uFF0C\u8BF7\u901A\u8FC7 DI \u5BB9\u5668 (@/infrastructure/di) \u89E3\u8026",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/**/*.{ts,tsx}", "!src/modules/**/__tests__/**"],
    plugins: { "no-direct-db-ipc": noDirectDbIpcPlugin },
    rules: {
      "no-direct-db-ipc/no-direct-db-ipc": "error",
    },
  },
  {
    files: ["src/infrastructure/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: deprecatedImportPatterns },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: deprecatedImportPatterns },
      ],
    },
  },
  {
    files: ["src/__tests__/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        { patterns: deprecatedImportPatterns },
      ],
    },
  },
  {
    files: ["electron/**/*.ts", "electron/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);

export default eslintConfig;
