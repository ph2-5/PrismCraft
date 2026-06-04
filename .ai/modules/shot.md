# Shot 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| shot-generation | 🔴 高 | 生成管道编排、参数校验、Few-Shot 提示、结果验证 |
| consistency-check | 🟡 中 | 一致性评分算法、配置校验逻辑 |
| feature-extraction | 🟡 中 | 特征提取与锚定、混合模式策略、自动降级 |
| shot-reference | 🟡 中 | 链式引用管理、引用有效性验证 |
| element-binding | 🟢 低 | 元素管理器、绑定状态管理 |
| shot-instruction | 🟢 低 | 纯函数：指令到提示词转换 |
| reference-check | 🟢 低 | 纯函数：删除前安全校验 |

## 子域依赖图

```
shot-instruction（底层，纯函数）
  ↑
feature-extraction ← shot-instruction, @/domain/schemas
  ↑
consistency-check ← feature-extraction, @/domain/schemas
  ↑
shot-generation ← consistency-check, feature-extraction, shot-instruction
  ↑
shot-reference ← @/infrastructure/di (referenceEngine)
element-binding ← @/infrastructure/di (elementManager)
reference-check ← @/domain/services/reference-check
```

- 所有子域禁止直接导入 story 和 video 模块（INV-8）
- `shot-instruction` 是最底层纯函数子域

## 常见修改场景

### 1. 新增分镜生成校验规则
- 修改文件：`shot-generation/services/shot-validator.ts`、`shot-generation/services/shot-generation-pipeline.ts`
- 检查不变量：INV-4（生成管道顺序：参数校验 → Few-Shot → 生成 → 验证）
- 测试：`npx vitest run src/modules/shot/shot-generation`

### 2. 修改一致性检查算法
- 修改文件：`consistency-check/services/consistency-check-service.ts`、`consistency-check/services/config-check-service.ts`
- 检查不变量：INV-1（一致性检查独立性）
- 测试：`npx vitest run src/modules/shot/consistency-check`

### 3. 新增特征锚定策略或混合模式
- 修改文件：`feature-extraction/services/feature-extraction-service.ts`
- 检查不变量：INV-3（特征锚定流程：提取 → 构建 → 验证）
- 测试：`npx vitest run src/modules/shot/feature-extraction`

### 4. 修改引用引擎逻辑
- 修改文件：`shot-reference/services/shot-reference-service.ts`
- 检查不变量：INV-6（引用有效性验证）
- 测试：`npx vitest run src/modules/shot/shot-reference`

### 5. 新增镜头参数选项
- 修改文件：`shot-instruction/services/shot-instruction-service.ts`
- 检查不变量：INV-5（镜头参数常量化）
- 测试：`npx vitest run src/modules/shot/shot-instruction`

## 内部实现细节（非明确要求不要修改）

- `shot-generation/services/shot-generation-pipeline.ts` — 管道编排顺序
- `shot-generation/services/shot-validator.ts` — Zod Schema 校验
- `consistency-check/services/consistency-check-service.ts` — 视觉一致性评分算法
- `feature-extraction/services/feature-extraction-service.ts` — 混合模式策略与自动降级
- `shot-reference/services/shot-reference-service.ts` — referenceEngine 单例管理

## 测试验证

- 测试命令：`npx vitest run src/modules/shot`
- 关键测试文件：
  - `shot-generation/__tests__/shot-validator.test.ts` — 生成参数校验
  - `consistency-check/services/__tests__/consistency-check-service.test.ts` — 一致性检查
  - `consistency-check/services/__tests__/config-check-service.test.ts` — 配置校验
  - `feature-extraction/services/__tests__/feature-extraction-service.test.ts` — 特征提取
  - `shot-reference/services/__tests__/shot-reference-service.test.ts` — 引用引擎
  - `shot-instruction/services/__tests__/shot-instruction-service.test.ts` — 指令转换
