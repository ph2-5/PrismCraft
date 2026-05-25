# 开发指南

> 更新日期: 2026-05-18

## 1. 环境准备

### 1.1 前置要求

- Node.js >= 18
- npm >= 9
- Git

### 1.2 安装

```bash
git clone <repo-url>
cd ai-animation-studio
npm install
```

### 1.3 环境变量

复制 `.env.example` 为 `.env.local`，填入 API 密钥：

```env
# 必填
API_URL=https://your-api-endpoint
API_KEY=your-api-key

# 可选
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
```

## 2. 开发命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | Web 开发服务器 (localhost:3000) |
| `npm run electron:dev` | Electron 开发模式 (localhost:3001) |
| `npm run build` | Web 生产构建 |
| `npm run build:electron` | Electron 构建 |
| `npm test` | 运行测试 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化 |

## 3. 项目约定

### 3.1 目录命名

- 模块: `kebab-case` (如 `task-management`)
- 子域: `kebab-case` (如 `beat-editor`)
- 测试: `__tests__/`
- 组件: `PascalCase.tsx` (如 `TaskCard.tsx`)
- Hook: `use-*.ts` (如 `use-video-task-manager.ts`)
- 服务: `kebab-case.ts` (如 `video-tracker.ts`)

### 3.2 导入路径

项目配置了以下路径别名：

```typescript
"@/*"          → "src/*"
"@/domain/*"   → "src/domain/*"
"@/shared/*"   → "src/shared/*"
"@/modules/*"  → "src/modules/*"
"@/infrastructure/*" → "src/infrastructure/*"
```

**重要**：不要从子域内部路径导入，应从模块入口导入：

```typescript
// ❌ 错误 — 深层导入
import { TaskMachine } from "@/modules/video/task-management/domain";

// ✅ 正确 — 从模块入口导入
import { TaskMachine } from "@/modules/video/task-management";
```

### 3.3 子域结构

每个子域遵循统一结构：

```
subdomain/
├── contract.json      # 公共 API 契约
├── index.ts           # Barrel 导出
├── hooks/             # React Hooks
├── services/          # 业务服务
├── presentation/      # UI 组件
├── domain/            # 领域模型 (可选)
├── infrastructure/    # 基础设施 (可选)
└── __tests__/         # 测试
```

### 3.4 contract.json 格式

```json
{
  "name": "subdomain-name",
  "version": "1.0.0",
  "entryPoints": {
    "hooks": ["hooks/use-xxx.ts"],
    "services": ["services/xxx-service.ts"],
    "presentation": ["presentation/XxxComponent.tsx"]
  },
  "exports": ["TypeA", "functionB", "ComponentC"],
  "invariants": [
    "所有状态变更必须通过 TaskMachine",
    "不允许直接 as 强转状态"
  ]
}
```

## 4. 编码规范

### 4.1 错误处理

使用 Result 类型，不使用异常：

```typescript
// ✅ 正确
function doWork(): Result<Data> {
  try {
    return ok(data);
  } catch (e) {
    return err(new ApiError("WORK_FAILED", extractErrorMessage(e)));
  }
}

// ❌ 错误
function doWork(): Data {
  throw new Error("failed"); // 不要抛异常
}
```

### 4.2 errorLogger 使用

```typescript
// 合法签名: AppError | string | { code: string; message: string; cause?: unknown }
errorLogger.warn({ code: "CODE", message: "描述信息" }, "Context");
errorLogger.error("简单字符串消息", "Context");
errorLogger.info({ code: "CODE", message: "信息" });
```

**禁止**传入非法属性 (taskId, field, operation 等)：

```typescript
// ❌ 错误 — taskId 不在类型定义中
errorLogger.warn({ code: "CODE", taskId: "123" }, "Context");

// ✅ 正确 — 嵌入 message
errorLogger.warn({ code: "CODE", message: "taskId=123 failed" }, "Context");
```

### 4.3 时间类型

全项目统一使用 ISO 8601 字符串：

```typescript
// ✅ 正确
createdAt: new Date().toISOString()

// ❌ 错误
createdAt: Date.now()
createdAt: Math.floor(Date.now() / 1000)
```

### 4.4 非空断言

避免使用 `!` 非空断言，使用可选链 + 空值合并：

```typescript
// ❌ 危险
const url = result!.data!.imageUrl;

// ✅ 安全
const url = result?.data?.imageUrl ?? "";
```

### 4.5 空 catch 块

禁止空 catch 块，至少添加日志：

```typescript
// ❌ 危险
} catch {}

// ✅ 安全
} catch (e) {
  console.debug("[Module] Operation failed:", e);
}
```

### 4.6 状态管理

- 使用 Zustand Store
- 状态变更必须通过状态机验证
- 使用 `withTransitionGuard` 守卫函数

### 4.7 数据验证

- 所有领域类型使用 Zod Schema 定义
- Schema 即类型：`type X = z.infer<typeof xSchema>`
- API 返回值使用 `schema.safeParse()` 验证

### 4.8 依赖注入

```typescript
import { container } from "@/infrastructure/di";

// 获取服务
const storage = container.videoTaskStorage;
const elementManager = container.elementManager;
```

### 4.9 URL 安全

所有 fetch 调用用户提供的 URL 前应验证：

```typescript
import { isAllowedImageUrl, isAllowedVideoUrl } from "@/shared/utils/url-validation";

if (!isAllowedVideoUrl(downloadUrl)) {
  // 处理不安全的 URL
}
```

## 5. 添加新模块

### 5.1 步骤

1. 在 `src/modules/` 下创建模块目录
2. 创建子域目录和 `contract.json`
3. 在 `src/domain/schemas/` 添加 Zod Schema
4. 在 `src/domain/ports/` 添加端口接口
5. 在 `src/infrastructure/` 添加实现
6. 在 `src/infrastructure/di/container.ts` 注册依赖
7. 编写测试 (优先纯逻辑测试)

### 5.2 模板

```
src/modules/new-module/
├── index.ts
├── contract.json
├── hooks/
│   ├── use-new-module.ts
│   └── __tests__/
├── services/
│   └── new-module-service.ts
└── presentation/
    └── NewModulePanel.tsx
```

## 6. Git 工作流

- 分支命名: `feature/xxx`, `fix/xxx`, `refactor/xxx`
- 提交前: `npm run typecheck && npm test`
- 不提交: `.env.local`, `node_modules/`, `_backup-v2/`
