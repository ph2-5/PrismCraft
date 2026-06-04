# Security 模块 — AI 维护指南

## 修改前必读
- 本模块的契约文件：`contract.json`（每个子域一个）
- 模块概览：`MODULE.md`
- 公共 API：`index.ts`

## 子域依赖图

```
hooks ← electronAPI（IPC）
```

- `hooks` 是唯一子域，直接通过 Electron IPC 与主进程通信
- 不依赖任何 `@/infrastructure/*` 或其他模块

## 修改规则

### 允许的导入源
- `@/domain/schemas` — 类型定义
- `@/domain/types` — Result 类型、错误类型
- `@/domain/ports` — Port 接口
- `@/infrastructure/di` — DI 容器
- `@/shared/*` — 共享工具
- `@/modules/{other-module}` — 其他模块桶导入
- `electronAPI`（IPC bridge）— 通过 preload 暴露的安全 API

### 禁止的导入
- `@/infrastructure/*`（除 `@/infrastructure/di`）— 必须通过 DI 容器
- `@/modules/*/*/*` — 必须使用桶导入
- `@/types/*`、`@/lib/*`、`@/components/*` — 已废弃
- **localStorage** — 禁止使用 localStorage 存储 API 密钥
- **XOR 混淆** — 禁止使用 XOR 方式"加密"密钥

### 新增公共 API 时
1. 在子域 `index.ts` 中导出
2. 在模块 `index.ts` 中重新导出
3. 更新 `MODULE.md` 的公共 API 部分
4. 更新子域 `contract.json` 的 `publicAPI` 字段
5. 运行 `node scripts/check-module-api-consistency.mjs` 验证

### 修改子域内部实现时
1. 检查 `contract.json` 的 `invariants`，确保不违反不变量
2. 不改变公共 API 签名则无需更新文档
3. 运行 `npx eslint .` 和 `node scripts/check-architecture.mjs` 验证

## 子域详情

### hooks
- **职责**：提供安全相关的 React hooks，包括 API 密钥管理、加密存储访问
- **依赖**：`electronAPI`（IPC）
- **不变量**：
  - **禁止 localStorage 回退**：API 密钥必须通过 electron-store 加密存储，绝不使用 localStorage
  - **API 密钥必须通过 electron-store 加密**：所有密钥的读取和写入必须通过 `secure-config:*` IPC 通道
  - 密钥读取失败时不得缓存明文密钥
  - 密钥写入必须验证 IPC 通道权限级别为 `SECURE`

## 安全注意事项

- 本模块是整个应用的密钥管理入口，修改时必须格外谨慎
- 任何密钥处理逻辑的变更都需要安全审查
- 密钥在内存中的生命周期应尽可能短
- 错误日志中不得包含密钥值（由 `@/shared/error-logger` 自动脱敏）

## 测试
- 测试文件位于各子域的 `__tests__/` 目录
- 运行：`npx vitest run src/modules/security`
- 新增服务必须编写单元测试
- 安全相关测试必须验证密钥不在 localStorage 中出现
