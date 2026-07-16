# Agent Tools System 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| system-tools | 🟡 中 | 3 个系统信息查询工具、动态导入多个模块（character/scene/video/api-config/file-http）、通过 DI container 获取 toolRegistry |

## 子域依赖图

```
system-tools.ts（3 个工具）
  ← @/domain/types/agent-tools（ToolImpl 类型）
  ← @/infrastructure/di（container.agentToolRegistry 异步获取）
  ← @/modules/character, @/modules/scene（动态 import 查询数量）
  ← @/modules/video/task-management（动态 import 查询视频任务状态）
  ← @/shared/api-config（动态 import checkConfigStatus）
  ← @/shared/file-http（动态 import getCacheDirectory / getDiskSpace）
  ↑
index.ts（barrel + allSystemTools 聚合）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 单一工具文件，结构简单
- 所有跨模块依赖通过动态 `import()` 延迟加载，保持静态依赖图轻量
- `toolRegistry` 通过 `await container.agentToolRegistry` 异步获取
- 工具聚合数组 `allSystemTools` 与 `systemTools` 等价

## 公共 API

### 工具实现
- `getProjectStatsTool` — 项目统计概览工具（get_project_stats），返回角色/场景/视频任务/已配置能力
- `getAppInfoTool` — 应用信息工具（get_app_info），返回版本/平台/可用工具数
- `getDiskUsageTool` — 磁盘使用工具（get_disk_usage），返回缓存目录磁盘占用

### 工具聚合数组
- `systemTools` — 3 个系统工具的聚合数组
- `allSystemTools` — 全量工具聚合（与 systemTools 等价，便于统一注册）

## 常见修改场景

### 1. 新增系统信息查询工具
- 修改文件：`system-tools.ts`，在 `index.ts` 追加 export，更新 `systemTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、跨模块依赖通过动态 import 延迟加载
- 测试：`npx vitest run src/modules/agent-tools-system/__tests__/system-tools.test.ts`

### 2. 修改项目统计概览
- 修改文件：`system-tools.ts`（getProjectStatsTool 的 execute 函数）
- 检查不变量：动态 `import("@/modules/character")` 查询角色数量；动态 `import("@/modules/scene")` 查询场景数量；动态 `import("@/modules/video/task-management")` 查询视频任务状态；动态 `import("@/shared/api-config")` 查询已配置能力
- 测试：`npx vitest run src/modules/agent-tools-system/__tests__/system-tools.test.ts`

### 3. 修改应用信息或磁盘使用
- 修改文件：`system-tools.ts`（getAppInfoTool / getDiskUsageTool）
- 检查不变量：getAppInfoTool 通过 `await container.agentToolRegistry` 获取可用工具数量和名称；getDiskUsageTool 通过动态 `import("@/shared/file-http")` 获取 `getCacheDirectory` / `getDiskSpace`
- 测试：`npx vitest run src/modules/agent-tools-system/__tests__/system-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/infrastructure/di`
- **禁止导入**：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）、`@/infrastructure/*`（除 `@/infrastructure/di`）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：所有跨模块依赖（characterService/sceneService/useVideoTaskStore/checkConfigStatus）通过动态 import 延迟加载
- **必须**：`toolRegistry` 通过 `await container.agentToolRegistry` 异步获取

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-system`
- 关键测试文件：
  - `__tests__/system-tools.test.ts` — 3 个系统信息查询工具
