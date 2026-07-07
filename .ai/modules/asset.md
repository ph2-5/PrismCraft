# Asset 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| import-export | 🔴 高 | 项目数据导入导出、合并策略、write-then-clean 模式 |
| asset-library | 🟡 中 | 多类型资产 CRUD、本地文件管理、ASA 格式导出 |
| media-assets | 🟡 中 | 媒体文件 CRUD、批量操作 |
| hooks | 🟢 低 | React Query 封装层 |
| presentation | 🟢 低 | UI 组件，通过 hooks 获取数据 |

## 子域依赖图

```
asset-library ← @/domain/schemas, @/infrastructure/di
media-assets  ← @/domain/schemas, @/infrastructure/di
import-export ← @/domain/schemas, @/infrastructure/di
  │（三者彼此独立）
  ▼
hooks ← asset-library, media-assets, import-export, @tanstack/react-query
  │
  ▼
presentation ← hooks, @/shared/ui
```

- `asset-library`、`media-assets`、`import-export` 是底层服务子域，彼此独立
- `hooks` 聚合三个底层子域，提供 React hooks
- `presentation` 仅依赖 `hooks`

## 常见修改场景

### 1. 新增资产类型或修改资产 Schema
- 修改文件：`asset-library/services/` 下对应服务文件
- 检查不变量：INV-1（图片保存到本地）、INV-2（删除时同步清理本地文件）、INV-4（asset-library 不依赖其他子域）
- 测试：`npx vitest run src/modules/asset/asset-library`

### 2. 修改导入导出逻辑
- 修改文件：`import-export/services/` 下对应服务文件
- 检查不变量：INV-6（导入必须校验格式）、INV-7（合并策略三种模式）、INV-8（导出保持引用关系）、INV-12（write-then-clean 模式，禁止先删后写）
- 测试：`npx vitest run src/modules/asset`

### 3. 新增媒体资产批量操作
- 修改文件：`media-assets/services/media-asset-service.ts`
- 检查不变量：INV-5（ID 使用 crypto.randomUUID()）、R15（批量删除独立 try-catch）
- 测试：`npx vitest run src/modules/asset`

### 4. 修改 ASA 格式导出
- 修改文件：`asset-library/services/asa-export-service.ts`
- 检查不变量：INV-8（导出保持引用关系）
- 测试：`npx vitest run src/modules/asset/asset-library/__tests__/asa-export-service.test.ts`

## 内部实现细节（非明确要求不要修改）

- `import-export/services/` — write-then-clean 模式实现（R13）
- `asset-library/services/` — saveImageToLocal 本地文件保存、级联文件删除
- `media-assets/services/media-asset-service.ts` — batchDelete 独立 try-catch（R15）
- `asset-library/services/asa-export-service.ts` — ASA 格式序列化与引用关系保持

## 测试验证

- 测试命令：`npx vitest run src/modules/asset`
- 关键测试文件：
  - `asset-library/__tests__/asa-export-service.test.ts` — ASA 导出
  - `hooks/__tests__/use-media-assets.test.ts` — 媒体资产 hooks
