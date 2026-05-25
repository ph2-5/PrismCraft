# Shot Module

## 职责

分镜系统：一致性检查、元素绑定、特征提取、镜头指令、引用引擎

---

## 子域结构

本模块采用子域架构，包含 7 个内部子域：

| 子域 | 路径 | 职责 |
|------|------|------|
| `consistency-check` | [consistency-check/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/shot/consistency-check/) | 视觉一致性检查 |
| `element-binding` | [element-binding/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/shot/element-binding/) | 元素绑定、元素管理器 |
| `feature-extraction` | [feature-extraction/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/shot/feature-extraction/) | 特征锚定 |
| `reference-check` | [reference-check/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/shot/reference-check/) | 引用检查 |
| `shot-generation` | [shot-generation/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/shot/shot-generation/) | 分镜生成、动态少样本、验证器 |
| `shot-instruction` | [shot-instruction/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/shot/shot-instruction/) | 镜头指令转换 |
| `shot-reference` | [shot-reference/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/shot/shot-reference/) | 镜头引用引擎 |

---

## 公共 API（index.ts）

### 一致性检查子域
- `performConsistencyCheck` — 视觉一致性检查
- `validateFeatureAnchoringConfigFull` — 特征锚定配置完整验证
- `validateNoFrameBindingParams` — 无帧绑定参数验证

### 元素绑定子域
- `elementManager` — 元素管理器实例

### 特征提取子域
- `validateReferenceImageQuality` — 引用图片质量验证
- `buildFeatureAnchoringConfig` — 构建特征锚定配置

### 引用检查子域
- `checkCharacterReferences` — 角色引用检查
- `checkSceneReferences` — 场景引用检查
- `checkElementReferences` — 元素引用检查
- `ReferenceInfo` — 引用信息类型 (type)
- `DeleteCheckResult` — 删除检查结果类型 (type)

### 镜头指令子域
- `SHOT_SIZE_OPTIONS` — 镜头尺寸选项
- `CAMERA_MOVEMENT_OPTIONS` — 镜头运动选项
- `CAMERA_ANGLE_OPTIONS` — 镜头角度选项

### 引用引擎子域
- `referenceEngine` — 引用引擎实例

---

## 依赖

- `@/domain/schemas` - ShotSystem 类型
- `@/infrastructure/storage` - 元素存储

---

## 边界约束

⚠️ **重要约束**：
- 子域之间只能通过各自的 `index.ts` 导出的 API 通信
- 禁止直接引用其他子域的内部文件（如 `../element-binding/element-manager.ts`）
- 所有跨子域引用必须通过 `../subdomain` 导入

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/shot.md](../../../.ai/modules/shot.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
- 错误处理使用：`@/shared/error-handler`
