# Modules Tests 目录 - AI 维护指南

## 概述

`src/modules/__tests__/` 是**跨模块集成测试**目录，不属于任何单一模块。存放需要验证多个模块协作行为的回归测试。

> 本目录不是功能模块，无 `index.ts`、无 `MODULE.md`、无 `contract.json`、无公共 API。

## 测试文件

| 文件 | 守卫编号 | 验证内容 |
|------|---------|---------|
| `regression-r147-cross-module-store-access.test.ts` | R147 | 跨模块 Store 访问守卫 |

## R147: 跨模块 Store 访问守卫

**规则**：模块之间不得直接访问对方的 Zustand Store 内部实现，必须通过对方模块的公共 API hook（barrel 导出）读取状态。

**违规模式**：
```typescript
// ❌ 违规：直接访问其他模块的 store 内部
import { useVideoTaskStore } from "@/modules/video/task-management/hooks/use-video-task-manager";

// ✅ 正确：通过公共 API hook 访问
import { useVideoTasks } from "@/modules/video/task-management";
```

**修改场景**：当新增跨模块数据读取时，必须通过 barrel 导出的 hook，不得深入模块内部路径。

## 测试验证

- 测试命令：`npx vitest run src/modules/__tests__`
- 注意：新增跨模块集成测试时，放在本目录；单模块内部测试放在对应模块的 `__tests__/` 下
