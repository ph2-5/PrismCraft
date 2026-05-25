# AI Animation Studio 测试指南

## 快速开始

### 1. 首次配置

运行测试配置向导：

```bash
npm run test:setup
```

按照提示：
- 添加您的 API Keys（支持智谱AI、快手、Pixverse 等）
- 配置测试选项（是否运行 E2E 测试、是否生成覆盖率等）

### 2. 运行完整测试套件

```bash
npm run test:full
```

或者在向导菜单中选择"运行完整测试套件"。

## 单独运行测试

### 快速测试（不生成覆盖率）

```bash
npm run test:quick
```

### 运行所有测试并生成覆盖率

```bash
npm run test:coverage
```

### 交互式测试 UI

```bash
npm run test:ui
```

### E2E 测试

```bash
npm run test:e2e
```

## API Key 配置方式

### 方式一：使用测试配置向导（推荐）

```bash
npm run test:setup
```

选择"添加/管理 API Key"来配置。

### 方式二：环境变量

在运行测试前设置环境变量：

```bash
# Windows (PowerShell)
$env:TEST_API_KEY_ZHIPU="your-api-key"
$env:TEST_BASE_URL_ZHIPU="https://api.example.com"  # 可选
npm run test:full

# Windows (CMD)
set TEST_API_KEY_ZHIPU=your-api-key
npm run test:full

# macOS/Linux
export TEST_API_KEY_ZHIPU="your-api-key"
npm run test:full
```

### 环境变量格式

| 提供商 | API Key 变量 | Base URL 变量 |
|--------|--------------|---------------|
| 智谱AI | `TEST_API_KEY_ZHIPU` | `TEST_BASE_URL_ZHIPU` |
| 快手 | `TEST_API_KEY_KUAISHOU` | `TEST_BASE_URL_KUAISHOU` |
| Pixverse | `TEST_API_KEY_PIXVERSE` | `TEST_BASE_URL_PIXVERSE` |
| Seedance | `TEST_API_KEY_SEEDANCE` | `TEST_BASE_URL_SEEDANCE` |
| 火山引擎 | `TEST_API_KEY_VOLCENGINE` | `TEST_BASE_URL_VOLCENGINE` |
| Anthropic | `TEST_API_KEY_ANTHROPIC` | `TEST_BASE_URL_ANTHROPIC` |
| OpenAI | `TEST_API_KEY_OPENAI` | `TEST_BASE_URL_OPENAI` |

## 配置文件位置

测试配置保存在用户目录中：

- Windows: `C:\Users\[用户名]\.ai-animation-studio-tests\test-config.json`
- macOS: `~/.ai-animation-studio-tests/test-config.json`
- Linux: `~/.ai-animation-studio-tests/test-config.json`

## 测试架构

### 目录结构

```
src/__tests__/
├── e2e/                      # E2E 测试
│   ├── smoke.test.ts        # 冒烟测试
│   ├── integration-api.test.ts  # API 集成测试
│   └── ...
├── lib/                      # 工具库测试
│   ├── api-client.test.ts
│   ├── storage/
│   └── video-providers.test.ts
├── test-helpers/             # 测试辅助工具
│   └── api-key-helper.ts
└── setup.ts                  # 测试环境设置
```

### 测试辅助函数

#### `api-key-helper.ts`

```typescript
import {
  getTestApiKey,
  getTestBaseUrl,
  hasApiKey,
  getAvailableTestProviders,
  requireApiKey,
} from "./test-helpers/api-key-helper";

// 获取 API Key
const apiKey = getTestApiKey("zhipu");

// 检查是否有某个提供商的 Key
if (hasApiKey("zhipu")) {
  // 运行测试...
}

// 获取所有可用的提供商
const providers = getAvailableTestProviders();

// 要求 API Key 存在（否则抛出错误）
const { apiKey, baseUrl } = requireApiKey("zhipu");
```

## 覆盖率报告

运行 `npm run test:coverage` 后，在浏览器中打开：

```
./coverage/index.html
```

## 测试最佳实践

1. **添加新测试时**：在 `src/__tests__/` 目录下创建对应的测试文件
2. **API 集成测试**：使用 `hasApiKey()` 检查 Key 是否可用，避免在 CI 中失败
3. **Mock 外部依赖**：对于不需要真实 API 的测试，使用 vi.mock()
4. **保持测试快速**：快速测试（`npm run test:quick`）应在几分钟内完成

## 常见问题

### Q: 如何只运行某个提供商的测试？

```bash
# 设置环境变量后运行
$env:TEST_API_KEY_ZHIPU="key"
npm test -- run src/__tests__/lib/video-providers.test.ts
```

### Q: 配置文件有问题怎么办？

删除配置文件目录后重新运行向导：

```bash
# Windows
rmdir /s /q "%USERPROFILE%\.ai-animation-studio-tests"

# macOS/Linux
rm -rf ~/.ai-animation-studio-tests
```

### Q: 测试报告在哪里？

测试报告保存在项目根目录的 `test-reports/` 目录下。
