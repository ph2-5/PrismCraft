# 测试指南

> 更新日期: 2026-05-18

## 1. 测试基础设施

| 工具 | 用途 |
|------|------|
| Vitest | 单元测试 + 组件测试 |
| happy-dom | DOM 环境 |

### 运行命令

```bash
npm test              # 运行全部单元测试
npx vitest run        # 单次运行
npx vitest watch      # 监听模式
npx vitest coverage   # 覆盖率
```

## 2. 测试目录结构

```
src/
├── __tests__/                    # 全局测试
│   ├── e2e/                      # E2E 测试 (smoke, regression, integration, performance, security, boundary...)
│   ├── hooks/                    # Hook 测试
│   ├── lib/                      # 库/工具测试 (api-client, video-providers, video-cache, model-capabilities...)
│   │   └── storage/              # 存储层测试 (video-cache, video-tasks, elements, stories, core)
│   ├── mocks/                    # Mock 工厂和工具
│   └── utils/                    # 测试工具
├── modules/
│   └── {module}/
│       └── __tests__/            # 模块级测试
│       └── {subdomain}/
│           └── __tests__/        # 子域级测试
├── domain/
│   ├── schemas/__tests__/        # Schema 验证测试
│   ├── services/__tests__/       # 领域服务测试
│   └── utils/__tests__/          # 领域工具测试
└── infrastructure/
    ├── storage/__tests__/        # 存储层测试 (9 个文件)
    ├── di/__tests__/             # DI 容器测试
    ├── network/__tests__/        # 网络层测试
    └── ai-providers/__tests__/   # AI 提供商测试
```

## 3. 反模式：头疼砍头式测试

**定义**：当测试失败时，开发者修改测试让它通过，而不是调查项目代码是否有 bug。

### 3.1 常见反模式

| 反模式 | 示例 | 问题 |
|--------|------|------|
| `toBeDefined()` 无行为验证 | `expect(fn).toBeDefined()` | 只验证存在性，不验证行为 |
| `typeof === "function"` 不调用 | `expect(typeof obj.fn).toBe("function")` | 函数存在但不测试返回值 |
| 正则扫描源码 | `expect(sourceCode).toMatch(/export/)` | 测试文本而非运行时行为 |
| `expect.any()` 逃避验证 | `expect(result).toEqual(expect.any(Object))` | 过于宽松 |
| 修改测试适配源码 Bug | 测试发现 Bug 后改断言 | 掩盖问题而非修复 |

### 3.2 正确做法

```typescript
// ❌ 反模式
it("should export buildTrackingInfo", () => {
  expect(typeof taskMgmt.buildTrackingInfo).toBe("function");
});

// ✅ 正确
it("buildTrackingInfo 应构建完整的追踪信息", () => {
  const info = buildTrackingInfo("task-123", "https://api.example.com");
  expect(info.taskId).toBe("task-123");
  expect(info.providerName).toBeDefined();
  expect(info.queryEndpoint).toContain("task-123");
});
```

### 3.3 区分测试 Bug 与源码 Bug

| 场景 | 判断 | 处理 |
|------|------|------|
| 测试断言与重构后的源码不匹配 | 测试 Bug | 更新测试断言 |
| 测试使用了不存在的导入路径 | 测试 Bug | 修正导入路径 |
| 测试发现源码返回值与预期不符 | 源码 Bug | 修复源码，不改测试 |
| 测试 mock 行为与真实实现不一致 | 测试 Bug | 更新 mock |

## 4. vi.restoreAllMocks() 陷阱

### 4.1 问题描述

`setup.ts` 在 `afterEach` 中调用 `vi.restoreAllMocks()`，这会重置 `vi.mock()` 工厂函数中设置的 mock 实现，导致后续测试从 mock 函数获得 `undefined`。

### 4.2 解决方案

在 `beforeEach` 中重新设置 mock 返回值：

```typescript
beforeEach(() => {
  vi.mocked(apiClient.post).mockResolvedValue({ ok: true, value: mockData });
});
```

### 4.3 根因

```
vi.mock() 工厂 → 设置 mockImplementation
afterEach → vi.restoreAllMocks() → 清除 mockImplementation
下一个测试 → 调用 mock 函数 → 返回 undefined
```

## 5. 测试编写规范

### 5.1 命名

```typescript
describe("模块名", () => {
  describe("函数/组件名", () => {
    it("should 行为 when 条件", () => { ... });
  });
});
```

### 5.2 Mock 原则

1. **Mock 依赖，不 Mock 被测模块本身** — 除非模块有副作用
2. **Mock 最小范围** — 只 mock 直接依赖
3. **验证行为，不验证实现** — 测试输入输出，不测试内部变量
4. **优先测试纯逻辑** — 无 mock 的测试更可靠

### 5.3 Result 类型测试

```typescript
it("should return ok on success", () => {
  const result = someFunction();
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toEqual(expected);
  }
});

it("should return err on failure", () => {
  const result = someFunction();
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("EXPECTED_CODE");
  }
});
```

### 5.4 状态机测试

```typescript
it.each([
  ["pending", "processing", true],
  ["pending", "completed", false],
] as [VideoTaskStatus, VideoTaskStatus, boolean][])(
  "canTransition(%s, %s) => %s",
  (from, to, expected) => {
    expect(TaskMachine.canTransition(from, to)).toBe(expected);
  },
);
```

### 5.5 E2E 测试

```typescript
// 使用 describe.skipIf 而非条件返回
const serverAvailable = await checkServer();
describe.skipIf(!serverAvailable)("E2E tests", () => {
  it("should work", () => { ... });
});
```

## 6. 当前测试统计

| 指标 | 数值 |
|------|------|
| 测试文件 | 92 个通过, 1 个跳过 |
| 测试用例 | 1761 个通过, 12 个跳过 |
| 失败 | 0 |

### 核心测试覆盖

| 测试文件 | 测试数 | 覆盖 |
|----------|--------|------|
| task-machine.test.ts | 44 | 状态机全量 + TransitionError |
| task-schema.test.ts | 12 | Schema + 状态映射 |
| policies.test.ts | 21 | 超时/过期/引擎 |
| timestamp-bridge.test.ts | 23 | ISO↔Unix 转换 |
| polling-scheduler.test.ts | 17 | 轮询调度 |
| story-generation-service.test.ts | 28 | 故事生成服务 (纯逻辑) |
| registry.test.ts | 6 | DI 容器核心 |
| shot-validator.test.ts | 17 | 镜头参数验证 + 自动修复 |
| smart-retry-engine.test.ts | 12 | 智能重试决策 |
| collections.test.ts | 8 | 集合存储 CRUD |
| schema-validation.test.ts | — | Zod Schema 全面验证 |
| circuit-breaker.test.ts | — | 熔断器状态转换 |
| domain-services.test.ts | 18 | 领域服务纯逻辑 |
| vector-clock.test.ts | 13 | 向量时钟操作 |
