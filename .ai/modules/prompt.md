# Prompt 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| builder | 🟡 中 | PromptBuilder 类、故事计划提示词、模型选项配置 |
| video | 🟡 中 | 视频/分镜提示词生成，被 story 模块依赖 |
| beat-image | 🟡 中 | 分镜图片提示词，被 story 模块依赖 |
| server-prompts | 🟡 中 | 服务器端提示词，被 API 路由依赖 |
| character | 🟢 低 | 角色图片提示词，纯函数 |
| scene | 🟢 低 | 场景图片提示词，纯函数 |
| base | 🟢 低 | 关键词常量、基础描述构建，最底层 |
| presentation | 🟢 低 | ModelSelector、ConfigCheckBanner UI 组件 |

## 子域依赖图

```
base（最底层，纯常量与描述构建函数）
  ↑
character ← base
scene ← base
beat-image ← base
video ← base
builder ← base
server-prompts（独立，不依赖其他子域）
presentation ← builder（useModelSelection）
```

- `base` 是最底层子域，所有提示词生成子域都依赖它
- `server-prompts` 独立，不依赖其他子域
- 各提示词生成子域（character/scene/beat-image/video）之间互不依赖

## 常见修改场景

### 1. 新增提示词关键词或修改关键词映射
- 修改文件：`base/constants/` 或 `base/services/` 下对应文件
- 检查不变量：base 子域是最底层，不依赖其他子域
- 测试：`npx vitest run src/modules/prompt`

### 2. 修改视频提示词生成策略
- 修改文件：`video/services/video-prompt-service.ts`
- 检查不变量：视频提示词包含质量标签、风格描述、动作描述
- 测试：`npx vitest run src/modules/prompt/video`

### 3. 新增模型选项或修改模型选择逻辑
- 修改文件：`builder/services/prompt-builder.ts`、`presentation/ModelSelector.tsx`
- 检查不变量：PromptBuilder 提供多种构建方法
- 测试：`npx vitest run src/modules/prompt/presentation`

### 4. 修改服务器端提示词模板
- 修改文件：`server-prompts/services/server-prompt-service.ts`
- 检查不变量：服务器端提示词用于 API 调用、不依赖其他子域
- 测试：`npx vitest run src/modules/prompt/server-prompts`

### 5. 新增分镜图片提示词字段
- 修改文件：`beat-image/services/` 下对应文件
- 检查不变量：分镜提示词包含镜头描述、内容描述、质量标签
- 测试：`npx vitest run src/modules/prompt`

## 内部实现细节（非明确要求不要修改）

- `base/constants/` — 关键词映射（STYLE_KEYWORDS, MOOD_KEYWORDS, LIGHTING_KEYWORDS 等）
- `base/services/` — 描述构建函数（buildCharacterFullDesc, buildSceneVisualDesc 等）
- `builder/services/prompt-builder.ts` — PromptBuilder 类、模型选项配置
- `video/services/video-prompt-service.ts` — 三种视频提示词模式（professional/enhanced/quick）

## 测试验证

- 测试命令：`npx vitest run src/modules/prompt`
- 关键测试文件：
  - `video/services/__tests__/video-prompt-service.test.ts` — 视频提示词
  - `server-prompts/services/__tests__/server-prompt-service.test.ts` — 服务器端提示词
  - `presentation/__tests__/ModelSelector.test.tsx` — 模型选择器
  - `presentation/__tests__/ConfigCheckBanner.test.tsx` — 配置检查横幅
  - `__tests__/prompt-functions.test.ts` — 提示词函数集成测试
