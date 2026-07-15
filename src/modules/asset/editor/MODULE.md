# asset/editor 子域

> 简单图片编辑（Task 4.5）：基于 Canvas 的本地图片编辑器，支持调色、旋转、裁剪、标注与另存为新版本。

## 模块概述

提供基于 Canvas 的图片编辑能力，所有操作在本地 Canvas 完成，不调用外部 API。核心工具函数位于 `image-editor.ts`，由 `ImageEditorPanel` 组件消费。编辑后的图片通过 `@/shared/file-http` 写入本地文件，生成新版本文件名（`原图名_edited_时间戳.ext`），不覆盖原图。

## 子域

| 子域 | 路径 | 说明 |
|------|------|------|
| services | `./services/image-editor.ts` | Canvas 工具函数：调色、旋转、裁剪、标注绘制、Blob 转换、保存 |
| presentation | `./presentation/image-editor-panel.tsx` | 图片编辑器面板 UI |

## 公共 API

通过 `@/modules/asset/editor` 导入。

### UI 组件
- `ImageEditorPanel` — 图片编辑器面板
  - Props: `ImageEditorPanelProps`
    - `imageUrl: string` — 初始图片 URL（`file://` 协议或 `http`）
    - `originalPath?: string` — 原图本地路径（用于生成新版本文件名）
    - `onSaved?: (newPath: string) => void` — 保存成功回调

### 服务函数
- `applyColorAdjustments(ctx, canvas, adjustments)` — 将调色参数应用到 Canvas（基于 ImageData 像素操作）
- `rotateCanvas(sourceCanvas, degrees)` — 旋转 Canvas 内容（支持 90/180/270/-90 度），返回新 Canvas
- `cropCanvas(sourceCanvas, rect)` — 裁剪 Canvas，返回新 Canvas
- `drawAnnotations(ctx, annotations)` — 在 Canvas 上绘制标注（文字/箭头/矩形框）
- `canvasToBlob(canvas, type?, quality?)` — 将 Canvas 转为 Blob
- `saveEditedImage(blob, originalPath)` — 保存编辑后的图片为新版本（不覆盖原图），返回 `{ success, path?, error? }`
- `getEditorSaveDirectory()` — 获取缓存目录下的编辑图片保存目录（`<cacheDir>/image-editor`）

### 常量
- `DEFAULT_ADJUSTMENTS` — 默认调色参数（brightness/contrast/saturation 均为 0）
- `CROP_PRESETS` — 裁剪预设比例列表（自由 / 1:1 / 4:3 / 16:9 / 3:4 / 9:16）

### 类型
- `ColorAdjustments` — 调色参数（brightness / contrast / saturation，范围 -100 ~ 100，0 为原始）
- `CropRect` — 裁剪区域（x / y / width / height）
- `CropPreset` — 裁剪预设（label / ratio: number | null）
- `AnnotationType` — 标注类型联合（`"text" | "arrow" | "rect"`）
- `Annotation` — 所有标注联合类型（`TextAnnotation | ArrowAnnotation | RectAnnotation`）
- `TextAnnotation` — 文字标注（id / type / color / x / y / text / fontSize）
- `ArrowAnnotation` — 箭头标注（id / type / color / x1 / y1 / x2 / y2 / lineWidth）
- `RectAnnotation` — 矩形框标注（id / type / color / x / y / width / height / lineWidth）

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/shared/file-http` | `writeFile` / `getCacheDirectory`（文件写入统一层） |
| `@/shared/error-logger` | `errorLogger`（保存失败日志） |
| `@/shared/constants` | `t()` 国际化 |

## 边界约束

- 所有图像操作在本地 Canvas 完成，不调用外部 API（AI / 网络）
- 文件写入必须通过 `@/shared/file-http`，禁止直接调用 `electronAPI.writeFile`
- 保存为新版本，不覆盖原图（文件名格式：`原图名_edited_时间戳.ext`）
- Canvas API 不可用（`getContext("2d")` 返回 null）时返回源 Canvas，不抛异常
- 标注绘制顺序遵循 `annotations` 数组顺序
- 不持有任何状态（纯函数 + UI 组件），编辑状态由 `ImageEditorPanel` 内部 `useState` 管理
