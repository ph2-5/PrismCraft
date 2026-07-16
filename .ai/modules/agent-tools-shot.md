# Agent Tools Shot 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| shot-tools | 🔴 高 | 分镜生成（5 个工具）、长耗时操作（视频生成 30min）、container.videoTaskStorage 读写、动态导入 storyboard/character/scene 服务 |

## 子域依赖图

```
shot-tools.ts（5 个工具）
  ← @/domain/types/agent-tools（ToolImpl 类型）
  ← @/infrastructure/di（container.videoTaskStorage）
  ← @/modules/storyboard, @/modules/character, @/modules/scene（动态导入 service）
  ↑
index.ts（barrel + allShotTools 聚合）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 单一工具文件，结构简单
- 通过 DI container 访问 `videoTaskStorage`
- 动态导入 storyboard/character/scene 服务，避免静态循环依赖
- 工具聚合数组 `allShotTools` 与 `shotTools` 等价

## 公共 API

### 工具实现
- `generateBeatKeyframeTool` — 生成分镜关键帧工具（generate_beat_keyframe）
- `generateBeatFramePairTool` — 生成分镜帧对工具（generate_beat_frame_pair）
- `generateBeatVideoTool` — 生成分镜视频工具（generate_beat_video）
- `batchGenerateTool` — 批量生成工具（batch_generate）
- `regenerateBeatTool` — 重新生成分镜工具（regenerate_beat）

### 工具聚合数组
- `shotTools` — 5 个分镜工具的聚合数组
- `allShotTools` — 全量工具聚合（与 shotTools 等价，便于统一注册）

## 常见修改场景

### 1. 新增分镜生成工具
- 修改文件：`shot-tools.ts`，在 `index.ts` 追加 export，更新 `shotTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、生成类工具超时分级（关键帧 5min / 视频 30min）、批量操作通过 maxItems 限制规模
- 测试：`npx vitest run src/modules/agent-tools-shot/__tests__/shot-tools.test.ts`

### 2. 修改分镜视频生成逻辑
- 修改文件：`shot-tools.ts`（generateBeatVideoTool 的 execute 函数）
- 检查不变量：通过 `container.videoTaskStorage` 创建视频任务；动态导入 storyboard service 获取分镜上下文
- 测试：`npx vitest run src/modules/agent-tools-shot/__tests__/shot-tools.test.ts`

### 3. 修改批量生成或重生逻辑
- 修改文件：`shot-tools.ts`（batchGenerateTool / regenerateBeatTool）
- 检查不变量：批量操作通过 maxItems + 运行时校验限制规模；regenerate 需覆盖原有分镜资源
- 测试：`npx vitest run src/modules/agent-tools-shot/__tests__/shot-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/infrastructure/di`
- **禁止导入**：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）、`@/infrastructure/*`（除 `@/infrastructure/di`）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：storyboard/character/scene service 通过动态 import 获取，避免静态循环依赖

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-shot`
- 关键测试文件：
  - `__tests__/shot-tools.test.ts` — 5 个分镜生成工具
