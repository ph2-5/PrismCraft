# compositor 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| domain/compositor.schema | 🟢 低 | Zod schema + 类型推断，零外部依赖 |
| services/compositor-engine | 🔴 高 | 实体加载 + prompt 拼装 + 调用图像模型 + 持久化，涉及多模块协作 |
| hooks/use-compositor | 🟡 中 | 图层状态管理 + 生成流程编排，需处理 AbortController |
| presentation/compositor-panel | 🟡 中 | 三栏布局 UI，依赖多个外部 hooks（useCharacters/useScenes/useProps） |

## 子域依赖图

```
domain/compositor.schema.ts      → @/domain/schemas（Character/Scene/Prop 类型）
  ↑
services/compositor-engine.ts    → domain + @/infrastructure/di + @/shared-logic/prompt + @/modules/asset（createAsset）
  ↑
hooks/use-compositor.ts          → services + @/infrastructure/di
  ↑
presentation/compositor-panel.tsx → hooks + @/shared/presentation + @/shared/constants + @/modules/character + @/modules/scene + @/modules/asset
  ↑
index.ts（barrel）
  ↑
@/app/compositor/page.tsx（路由 /compositor）
```

## 关键不变量

- **INV-1**：`CompositorInput.characterId` 必填，是合成的主对象
- **INV-2**：生成结果必须持久化到 `generation_assets` 表（type=compositor_result, sourceType=composited），失败时记录日志但不阻塞返回
- **INV-3**：prompt 由 `generateCompositorPrompt` 自动拼装，包含角色全描述、场景氛围、道具列表、用户自定义补充、质量标签
- **INV-4**：图层在画布内通过 `layerId` 唯一标识，删除/拖拽/选择都基于 layerId
- **INV-5**：生成过程可通过 AbortSignal 取消，取消后状态回到 idle
- **图层规则**：角色图层和场景图层在画布内单实例（新替换旧），道具图层可多实例（按 id 去重）

## 常见修改场景

### 1. 新增图层类型
- 修改文件：`domain/compositor.schema.ts`（`composerLayerTypeSchema` 添加新类型）
- 同步更新：`compositor-engine.ts`（`buildCompositorPrompt` 处理新类型）
- 同步更新：`presentation/compositor-panel.tsx`（渲染新类型图层）
- 测试：手动验证新图层的添加/拖拽/删除

### 2. 修改 prompt 拼装逻辑
- 修改文件：`services/compositor-engine.ts`（`buildCompositorPrompt`）
- 检查不变量：prompt 必须包含角色全描述（复用 `@/shared-logic/prompt` 的 `generateCompositorPrompt`）
- 测试：调用 `buildCompositorPrompt` 验证输出格式

### 3. 修改生成流程
- 修改文件：`hooks/use-compositor.ts`
- 检查不变量：生成过程必须支持 AbortSignal 取消；状态机必须遵循 idle → building-prompt → generating → saving → success/error
- 测试：手动验证取消生成后状态回到 idle

### 4. 修改持久化逻辑
- 修改文件：`services/compositor-engine.ts`（`composeImage` 中的持久化部分）
- 检查不变量：通过 `@/modules/asset` 的 `createAsset` 持久化，不直接写 `generation_assets` 表
- 测试：手动验证生成结果出现在 asset 列表中

### 5. 修改 UI 布局
- 修改文件：`presentation/compositor-panel.tsx`
- 检查不变量：三栏布局（素材面板 / 画布 / P图工具）
- 测试：手动验证 UI 交互

## 边界约束

- **依赖方向**：domain → @/domain/schemas；services → domain + @/infrastructure/di + @/shared-logic/prompt + @/modules/asset；hooks → services；presentation → hooks + 外部模块 hooks
- **禁止**：直接导入 `@/infrastructure/storage/*`，必须通过 DI container
- **禁止**：直接写 `generation_assets` 表，必须通过 `@/modules/asset` 的 `createAsset`
- **禁止**：在模块内重复实现 prompt 拼装，必须复用 `@/shared-logic/prompt` 的 `generateCompositorPrompt`
- **必须**：生成结果持久化失败时记录日志但不阻塞返回（保留已生成的 imageUrl）

## 测试验证

- 测试命令：`npx vitest run src/modules/compositor`
- 关键测试：
  - `compositor-engine.test.ts` — prompt 拼装 + 生成流程 + 错误处理
  - `use-compositor.test.ts` — 图层状态管理 + 取消生成
- CI 检查：`npx eslint src/modules/compositor` + `node scripts/check-architecture.mjs`

## 集成点

### 路由入口
- `/compositor` → `src/app/compositor/page.tsx` → `<CompositorPanel />`

### 持久化
- 生成结果通过 `@/modules/asset` 的 `createAsset` 写入 `generation_assets` 表
- asset type: `compositor_result`
- asset sourceType: `composited`

### 依赖模块
- `@/modules/character`：`useCharacters` hook（角色列表）
- `@/modules/scene`：`useScenes` hook（场景列表）
- `@/modules/asset`：`useProps` hook（道具列表）+ `createAsset`（持久化）
