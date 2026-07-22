# PrismCraft — 用户自定义插件规范

> 版本：1.3.0 | 最后更新：2026-07-23

## 概述

PrismCraft 支持用户通过 JSON 配置文件自定义 AI 提供商插件，无需编写代码即可接入任意兼容 OpenAI / 自定义 API 格式的 AI 服务。

插件文件放置在 `~/PrismCraft/Plugins/` 目录下，文件名以 `.plugin.json` 结尾。

---

## 快速开始

### 最小可用插件

```json
{
  "id": "my-provider",
  "version": "1.0.0",
  "displayName": "我的提供商",
  "match": {
    "apiUrlPatterns": ["api.my-provider.com"]
  },
  "capabilities": {
    "video": {
      "supportsLastFrame": true,
      "supportsReferenceVideo": false,
      "supportsMimicryLevel": false,
      "defaultModel": "my-model-v1",
      "maxDuration": 10
    },
    "image": {
      "supportsReferenceImage": false,
      "defaultModel": "my-model-v1"
    }
  },
  "transport": {
    "imageMode": "base64",
    "videoMode": "url",
    "preferLocalData": true
  },
  "auth": {
    "type": "bearer"
  },
  "endpoints": {
    "video": {
      "generate": "/v1/videos/generations",
      "status": "/v1/videos/{taskId}"
    },
    "image": {
      "generate": "/v1/images/generations"
    },
    "text": {
      "generate": "/v1/chat/completions"
    },
    "vision": {
      "generate": "/v1/chat/completions"
    }
  },
  "request": {
    "video": {
      "bodyFormat": "flat"
    },
    "image": {
      "bodyFormat": "openai"
    },
    "text": {
      "bodyFormat": "openai"
    },
    "vision": {
      "bodyFormat": "openai"
    }
  },
  "response": {
    "video": {
      "taskIdPath": "id",
      "videoUrlPath": "data.video_url"
    },
    "image": {
      "imageUrlPath": "data.0.url"
    },
    "text": {
      "contentPath": "choices.0.message.content"
    }
  }
}
```

---

## 字段参考

### 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 插件唯一标识，仅允许小写字母、数字、连字符，不能以连字符开头/结尾 |
| `version` | string | ✅ | 语义化版本号（如 `"1.0.0"`） |
| `displayName` | string | ✅ | 显示名称 |
| `description` | string | | 插件描述 |
| `author` | string | | 作者 |
| `homepage` | string | | 主页 URL |
| `availableModels` | Array<{id, displayName, type}> | | 声明插件支持的所有模型 |

**保留 ID**（不可使用）：`volcengine`、`kuaishou`、`zhipu`、`pixverse`、`seedance`、`google`、`openai-sora`、`minimax`、`openai-compatible`、`anthropic`、`runway`、`luma`、`pika`、`openai`、`qwen`、`deepseek`、`moonshot`、`openrouter`、`byteplus`、`fireworks`、`bedrock`、`ollama`、`pollinations`

---

### `match` — 匹配规则

定义此插件匹配哪些 API URL 和模型。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `apiUrlPatterns` | string[] | ✅ | API URL 匹配模式列表 |
| `modelPatterns` | string[] | | 模型名称匹配模式列表 |
| `mode` | `"contains" \| "prefix" \| "regex"` | | 匹配模式（默认 `"contains"`） |
| `priority` | number | | 优先级（默认 10，数值越高越优先） |

**匹配模式说明**：
- `contains`（默认）：URL/模型名包含模式字符串即匹配
- `prefix`：URL/模型名以模式字符串开头即匹配
- `regex`：模式字符串作为正则表达式匹配

**优先级规则**：
1. 用户插件（priority 默认 10）优先于内置插件（priority 为 0）
2. 同优先级下，精确匹配 > 模式匹配 > 子串匹配
3. 同级别匹配时，按注册顺序（先注册先生效）

示例：
```json
"match": {
  "apiUrlPatterns": ["api.my-provider.com", "my-provider.cn"],
  "modelPatterns": ["my-model", "custom-v2"],
  "mode": "contains",
  "priority": 10
}
```

---

### `capabilities` — 能力声明

#### `capabilities.video`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `supportsLastFrame` | boolean | ✅ | 是否支持尾帧参考图 |
| `supportsReferenceVideo` | boolean | ✅ | 是否支持参考视频 |
| `supportsMimicryLevel` | boolean | ✅ | 是否支持模仿级别控制 |
| `supportsCharacterRef` | boolean | | 是否支持角色参考图（v1.2 新增） |
| `supportsSceneRef` | boolean | | 是否支持场景参考图（v1.2 新增） |
| `defaultModel` | string | ✅ | 默认视频生成模型 |
| `maxDuration` | number | ✅ | 最大视频时长（秒） |

#### `capabilities.image`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `supportsReferenceImage` | boolean | ✅ | 是否支持参考图 |
| `supportsCharacterRef` | boolean | | 是否支持角色参考图（v1.2 新增） |
| `supportsSceneRef` | boolean | | 是否支持场景参考图（v1.2 新增） |
| `defaultModel` | string | ✅ | 默认图片生成模型 |

---

### `models` — 模型级能力覆盖（可选）

按模型名称覆盖默认能力参数。键为模型名称子串（不区分大小写匹配）。

```json
"models": {
  "my-model-pro": {
    "maxReferences": 4,
    "maxResolution": 2048,
    "maxSizeMB": 10,
    "supportsLastFrame": true,
    "referenceMode": "separate",
    "defaultImageSize": "1920x1080",
    "supportedImageSizes": [
      { "width": 1920, "height": 1080, "label": "16:9", "aspectRatio": "16:9" }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `maxReferences` | number | 最大参考图数量 |
| `maxResolution` | number | 最大分辨率 |
| `maxSizeMB` | number | 最大文件大小（MB） |
| `supportsLastFrame` | boolean | 是否支持尾帧 |
| `referenceMode` | `"separate" \| "merged"` | 参考图模式 |
| `defaultImageSize` | string | 默认图片尺寸（如 `"1920x1080"`） |
| `supportedImageSizes` | array | 支持的尺寸列表 |

---

### Per-Model 参数配置

每个模型可以声明自己的参数选项，包括时长、分辨率、风格等。这些参数会自动反映在 UI 中。

#### 参数字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `parameters.durations` | Array<{value: number, label: string}> | 否 | 可选时长列表，如 [{value: 5, label: "5秒"}] |
| `parameters.resolutions` | Array<{value: string, label: string, width: number, height: number}> | 否 | 可选分辨率列表 |
| `parameters.styles` | Array<{value: string, label: string, description?: string}> | 否 | 可选风格列表 |
| `parameters.negativePrompt` | boolean | 否 | 是否支持反向提示词 |
| `parameters.seed` | boolean | 否 | 是否支持随机种子 |
| `parameters.cfgScale` | {min, max, default, step} | 否 | CFG Scale 参数范围 |
| `parameters.lora` | boolean | 否 | 是否支持 LoRA |

#### 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `availableModels` | Array<{id, displayName, type}> | 否 | 声明插件支持的所有模型 |

#### 完整示例

```json
{
  "id": "kling-v3",
  "version": "1.0.0",
  "displayName": "可灵 V3",
  "description": "快手可灵 V3 视频生成",
  "match": {
    "apiUrlPatterns": ["api.kuaishou.com"],
    "mode": "contains"
  },
  "availableModels": [
    { "id": "kling-v3-master", "displayName": "可灵 V3 大师版", "type": "video" },
    { "id": "kling-v3-pro", "displayName": "可灵 V3 专业版", "type": "video" },
    { "id": "kling-v3-image", "displayName": "可灵 V3 图片", "type": "image" }
  ],
  "capabilities": {
    "video": {
      "supportsLastFrame": true,
      "supportsReferenceVideo": true,
      "supportsMimicryLevel": false,
      "supportsCharacterRef": true,
      "supportsSceneRef": true,
      "defaultModel": "kling-v3-master",
      "maxDuration": 10
    },
    "image": {
      "supportsReferenceImage": true,
      "supportsCharacterRef": true,
      "supportsSceneRef": true,
      "defaultModel": "kling-v3-image"
    }
  },
  "transport": {
    "imageMode": "base64",
    "videoMode": "url",
    "preferLocalData": true
  },
  "auth": {
    "type": "bearer"
  },
  "endpoints": {
    "video": {
      "generate": "/v1/videos/generations",
      "status": "/v1/videos/generations/{taskId}"
    },
    "image": {
      "generate": "/v1/images/generations"
    },
    "text": {
      "generate": "/v1/chat/completions"
    },
    "vision": {
      "generate": "/v1/chat/completions"
    }
  },
  "request": {
    "video": {
      "bodyFormat": "openai-content",
      "promptField": "prompt",
      "modelField": "model"
    },
    "image": {
      "bodyFormat": "openai",
      "promptField": "prompt",
      "modelField": "model"
    },
    "text": {
      "bodyFormat": "openai"
    },
    "vision": {
      "bodyFormat": "openai"
    }
  },
  "response": {
    "video": {
      "taskIdPath": "data.task_id",
      "statusPath": "data.task_status",
      "videoUrlPath": "data.video_result.videos[0].url",
      "statusMapping": {
        "submitted": "pending",
        "processing": "processing",
        "succeed": "completed",
        "failed": "failed"
      }
    },
    "image": {
      "imageUrlPath": "data.images[0].url"
    },
    "text": {
      "contentPath": "choices.0.message.content"
    }
  },
  "models": {
    "kling-v3-master": {
      "displayName": "可灵 V3 大师版",
      "maxReferences": 5,
      "supportsLastFrame": true,
      "supportedImageSizes": [
        { "width": 1920, "height": 1080, "label": "16:9", "aspectRatio": "16:9" },
        { "width": 1080, "height": 1920, "label": "9:16", "aspectRatio": "9:16" },
        { "width": 1280, "height": 720, "label": "16:9 720p", "aspectRatio": "16:9" }
      ],
      "parameters": {
        "durations": [
          { "value": 5, "label": "5秒" },
          { "value": 10, "label": "10秒" }
        ],
        "resolutions": [
          { "value": "1920x1080", "label": "1080p 横屏", "width": 1920, "height": 1080 },
          { "value": "1080x1920", "label": "1080p 竖屏", "width": 1080, "height": 1920 },
          { "value": "1280x720", "label": "720p 横屏", "width": 1280, "height": 720 }
        ],
        "styles": [
          { "value": "realistic", "label": "写实风格" },
          { "value": "anime", "label": "动漫风格" },
          { "value": "cinematic", "label": "电影质感" },
          { "value": "3d", "label": "3D 渲染" }
        ],
        "negativePrompt": true,
        "seed": true,
        "cfgScale": { "min": 1, "max": 10, "default": 7, "step": 0.5 }
      }
    },
    "kling-v3-pro": {
      "displayName": "可灵 V3 专业版",
      "maxReferences": 3,
      "supportsLastFrame": true,
      "supportedImageSizes": [
        { "width": 1280, "height": 720, "label": "16:9 720p", "aspectRatio": "16:9" }
      ],
      "parameters": {
        "durations": [
          { "value": 5, "label": "5秒" },
          { "value": 10, "label": "10秒" }
        ],
        "resolutions": [
          { "value": "1280x720", "label": "720p", "width": 1280, "height": 720 }
        ],
        "styles": [
          { "value": "realistic", "label": "写实风格" },
          { "value": "anime", "label": "动漫风格" }
        ],
        "negativePrompt": false,
        "seed": false
      }
    },
    "kling-v3-image": {
      "displayName": "可灵 V3 图片",
      "supportedImageSizes": [
        { "width": 1024, "height": 1024, "label": "1:1", "aspectRatio": "1:1" },
        { "width": 1024, "height": 1536, "label": "2:3", "aspectRatio": "2:3" }
      ],
      "parameters": {
        "resolutions": [
          { "value": "1024x1024", "label": "1:1", "width": 1024, "height": 1024 },
          { "value": "1024x1536", "label": "2:3 竖版", "width": 1024, "height": 1536 }
        ],
        "styles": [
          { "value": "realistic", "label": "写实风格" },
          { "value": "anime", "label": "动漫风格" }
        ],
        "negativePrompt": true,
        "seed": true
      }
    }
  }
}
```

---

### `transport` — 传输配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `imageMode` | `"base64" \| "url" \| "upload"` | ✅ | 图片传输方式 |
| `videoMode` | `"base64" \| "url"` | ✅ | 视频传输方式 |
| `preferLocalData` | boolean | | 是否优先使用本地文件数据（将本地图片编码为 base64 发送，而非先上传获取 URL）。默认 `true` |

---

### `auth` — 认证配置

| `type` 值 | 说明 | 附加字段 |
|-----------|------|---------|
| `"bearer"` | Bearer Token 认证（默认） | 无 |
| `"api-key-header"` | API Key 放在自定义 Header 中 | `headerName`（默认 `"X-API-Key"`） |
| `"api-key-query"` | API Key 作为 URL 查询参数 | `queryParamName` |
| `"custom"` | 自定义 Header | `customHeaders`（值中 `{apiKey}` 会被替换） |

示例 — 自定义认证：
```json
"auth": {
  "type": "custom",
  "customHeaders": {
    "X-Custom-Auth": "Bearer {apiKey}",
    "X-App-Id": "my-app-123"
  }
}
```

---

### `endpoints` — API 端点

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `video.generate` | string | ✅ | 视频生成端点（如 `"/v1/videos/generations"`） |
| `video.status` | string | ✅ | 视频状态查询端点，支持 `{taskId}` 和 `{baseUrl}` 占位符 |
| `video.method` | `"POST"` | | 状态查询 HTTP 方法（默认 `GET`） |
| `image.generate` | string | ✅ | 图片生成端点 |
| `text.generate` | string | ✅ | 文本生成端点 |
| `vision.generate` | string | ✅ | 视觉分析端点 |
| `upload` | object | | 文件上传端点（可选） |

#### `endpoints.models` — 模型列表（可选，v1.1 预留）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `list` | string | ✅ | 获取模型列表的端点（如 `"/v1/models"`） |
| `modelNamePath` | string | | 模型名称的提取路径（如 `"data.0.id"`） |
| `modelCapabilitiesPath` | string | | 模型能力的提取路径（如 `"data.0.capabilities"`） |

#### `endpoints.upload` — 文件上传（v1.1 预留）

> ⚠️ 此功能当前为预留字段，v1.1 版本将实现完整支持。
> 某些 API 要求先上传图片/视频获取 URL，再在生成请求中引用该 URL。

---

### `request` — 请求体格式

#### `request.video`

| `bodyFormat` | 说明 |
|-------------|------|
| `"flat"` | 扁平键值对（默认），字段名可通过 `promptField` 等自定义 |
| `"openai-content"` | OpenAI Content 数组格式 |
| `"dashscope"` | 阿里云 DashScope 格式（`input` + `parameters`） |
| `"custom"` | 自定义模板，使用 `customBodyTemplate` |

**`flat` 模式字段映射**：

| 配置字段 | 默认值 | 映射到请求体的键 |
|---------|--------|----------------|
| `promptField` | `"prompt"` | 提示词字段名 |
| `modelField` | `"model"` | 模型字段名 |
| `durationField` | `"duration"` | 时长字段名 |
| `firstFrameField` | `"image_url"` | 首帧字段名 |
| `lastFrameField` | `"last_frame_url"` | 尾帧字段名 |
| `characterRefField` | `"character_ref"` | 角色参考图字段名（v1.2 新增） |
| `sceneRefField` | `"scene_ref"` | 场景参考图字段名（v1.2 新增） |
| `referenceVideoField` | `"reference_video_url"` | 参考视频字段名 |
| `mimicryLevelField` | `"mimicry_level"` | 模仿级别字段名 |
| `extraFields` | — | 额外固定字段，合并到请求体 |

**`custom` 模式模板**：

使用 `{{变量名}}` 占位符，支持递归嵌套对象和数组：

```json
"request": {
  "video": {
    "bodyFormat": "custom",
    "customBodyTemplate": {
      "model": "{{model}}",
      "input": {
        "prompt": "{{prompt}}",
        "image_url": "{{firstFrameUrl}}",
        "duration": "{{duration}}"
      },
      "parameters": {
        "size": "1280*720",
        "ref_strength": 0.8
      }
    }
  }
}
```

可用变量：

| 变量 | video | image | text | vision |
|------|-------|-------|------|--------|
| `{{prompt}}` | ✅ | ✅ | ✅ | ✅ |
| `{{model}}` | ✅ | ✅ | ✅ | ✅ |
| `{{duration}}` | ✅ | | | |
| `{{firstFrameUrl}}` | ✅ | | | |
| `{{lastFrameUrl}}` | ✅ | | | |
| `{{characterRef}}` | ✅ | ✅ | | |
| `{{sceneRef}}` | ✅ | ✅ | | |
| `{{referenceVideoUrl}}` | ✅ | | | |
| `{{size}}` | | ✅ | | |
| `{{maxTokens}}` | | | ✅ | ✅ |
| `{{temperature}}` | | | ✅ | |
| `{{imageUrl}}` | | | | ✅ |

**条件渲染**：

使用 `{{#var}}...{{/var}}` 语法，当变量存在且非空时才渲染内容块：

```json
"customBodyTemplate": {
  "model": "{{model}}",
  "input": {
    "prompt": "{{prompt}}"
    {{#firstFrameUrl}},"image_url": "{{firstFrameUrl}}"{{/firstFrameUrl}}
    {{#lastFrameUrl}},"last_frame_url": "{{lastFrameUrl}}"{{/lastFrameUrl}}
  }
}
```

当 `firstFrameUrl` 为空时，`image_url` 字段不会出现在最终请求体中。

#### `request.image`

| `bodyFormat` | 说明 |
|-------------|------|
| `"openai"` | OpenAI 图片生成格式 |
| `"flat"` | 扁平键值对 |
| `"custom"` | 自定义模板 |

#### `request.text`

| `bodyFormat` | 说明 |
|-------------|------|
| `"openai"` | OpenAI Chat Completions 格式 |
| `"anthropic"` | Anthropic Messages 格式 |
| `"custom"` | 自定义模板 |

#### `request.vision`

| `bodyFormat` | 说明 |
|-------------|------|
| `"openai"` | OpenAI Vision 格式 |
| `"anthropic"` | Anthropic Vision 格式 |
| `"custom"` | 自定义模板 |

---

### `response` — 响应解析

使用点分路径从 JSON 响应中提取数据。

| 字段 | 说明 | 示例 |
|------|------|------|
| `video.taskIdPath` | 任务 ID 的提取路径 | `"id"` 或 `"data.task_id"` |
| `video.videoUrlPath` | 视频 URL 的提取路径 | `"data.video_url"` |
| `video.statusPath` | 状态字段的提取路径 | `"status"` |
| `video.statusMapping` | 状态值映射到标准状态 | 见下文 |
| `image.imageUrlPath` | 图片 URL 的提取路径 | `"data.0.url"` |
| `image.base64Path` | Base64 图片数据的提取路径 | `"data.0.b64_json"` |
| `text.contentPath` | 文本内容的提取路径 | `"choices.0.message.content"` |

**状态映射**：将提供商的状态值映射为应用标准状态。

```json
"response": {
  "video": {
    "statusMapping": {
      "SUCCEEDED": "completed",
      "PROCESSING": "generating",
      "FAILED": "failed",
      "PENDING": "queued"
    }
  }
}
```

标准状态值：`completed`、`generating`、`failed`、`queued`、`cancelled`

---

### `response` — 错误响应解析

| 字段 | 类型 | 说明 |
|------|------|------|
| `video.errorPath` | string | 错误消息的提取路径（如 `"error.message"`） |
| `video.errorCodePath` | string | 错误码的提取路径（如 `"error.code"`） |
| `image.errorPath` | string | 图片错误消息路径 |
| `image.errorCodePath` | string | 图片错误码路径 |
| `text.errorPath` | string | 文本错误消息路径 |
| `text.errorCodePath` | string | 文本错误码路径 |

当 API 返回 4xx/5xx 或业务错误时，系统会按配置路径提取错误信息展示给用户。

---

### `polling` — 轮询策略（可选）

定义视频生成任务的轮询行为。不同 API 生成视频耗时差异巨大，合理配置可避免资源浪费。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `intervalSeconds` | number | 5 | 轮询间隔（秒） |
| `maxAttempts` | number | 120 | 最大轮询次数 |
| `backoffMultiplier` | number | 1.0 | 退避倍数（1.0=固定间隔，1.5=指数退避） |

示例：
```json
"polling": {
  "intervalSeconds": 3,
  "maxAttempts": 200,
  "backoffMultiplier": 1.5
}
```

当 `backoffMultiplier > 1.0` 时，每次轮询间隔 = `intervalSeconds × backoffMultiplier^(attempt-1)`。

---

### 端点级认证覆盖（可选）

每个端点可以覆盖全局 `auth` 配置，适用于不同端点使用不同 API Key 的场景：

```json
"endpoints": {
  "video": {
    "generate": "/v1/videos/generations",
    "status": "/v1/videos/{taskId}",
    "auth": {
      "type": "api-key-header",
      "headerName": "X-Video-API-Key"
    }
  }
}
```

---

### `headers` — 自定义请求头（可选）

支持全局和端点级自定义请求头：

```json
{
  "headers": {
    "Accept": "application/vnd.myapi.v2+json",
    "X-App-Version": "2.0"
  },
  "endpoints": {
    "video": {
      "generate": "/v1/videos",
      "headers": {
        "X-Video-Version": "2"
      }
    }
  }
}
```

端点级 headers 会覆盖全局 headers 中的同名键。

---

### `cloudInfo` — 云平台信息（可选）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 平台名称 |
| `websiteUrl` | string | 官网 URL |
| `taskUrlPattern` | string | 任务查看 URL 模板，`{taskId}` 会被替换 |
| `apiDocUrl` | string | API 文档 URL |
| `howToCheck` | string | 如何查看任务状态的说明 |

---

## 完整示例

### 示例 1：OpenAI 兼容提供商

```json
{
  "id": "my-openai-compat",
  "version": "1.0.0",
  "displayName": "My OpenAI-Compatible API",
  "description": "接入自建 OpenAI 兼容 API",
  "author": "developer",
  "match": {
    "apiUrlPatterns": ["my-api.example.com"]
  },
  "capabilities": {
    "video": {
      "supportsLastFrame": true,
      "supportsReferenceVideo": false,
      "supportsMimicryLevel": false,
      "defaultModel": "video-gen-v1",
      "maxDuration": 12
    },
    "image": {
      "supportsReferenceImage": true,
      "defaultModel": "image-gen-v1"
    }
  },
  "transport": {
    "imageMode": "base64",
    "videoMode": "url",
    "preferLocalData": true
  },
  "auth": {
    "type": "bearer"
  },
  "endpoints": {
    "video": {
      "generate": "/v1/video/generations",
      "status": "/v1/video/{taskId}"
    },
    "image": {
      "generate": "/v1/images/generations"
    },
    "text": {
      "generate": "/v1/chat/completions"
    },
    "vision": {
      "generate": "/v1/chat/completions"
    }
  },
  "request": {
    "video": {
      "bodyFormat": "flat",
      "promptField": "prompt",
      "modelField": "model",
      "durationField": "duration",
      "firstFrameField": "image_url",
      "lastFrameField": "last_frame_url"
    },
    "image": {
      "bodyFormat": "openai"
    },
    "text": {
      "bodyFormat": "openai"
    },
    "vision": {
      "bodyFormat": "openai"
    }
  },
  "response": {
    "video": {
      "taskIdPath": "id",
      "videoUrlPath": "data.video_url",
      "statusMapping": {
        "SUCCEEDED": "completed",
        "PROCESSING": "generating",
        "FAILED": "failed"
      }
    },
    "image": {
      "imageUrlPath": "data.0.url"
    },
    "text": {
      "contentPath": "choices.0.message.content"
    }
  },
  "cloudInfo": {
    "name": "My API Platform",
    "websiteUrl": "https://my-api.example.com",
    "taskUrlPattern": "https://my-api.example.com/tasks/{taskId}",
    "apiDocUrl": "https://docs.my-api.example.com",
    "howToCheck": "在控制台 > 任务管理中查看"
  }
}
```

### 示例 2：自定义请求体格式（DashScope 风格）

```json
{
  "id": "custom-dashscope",
  "version": "1.0.0",
  "displayName": "Custom DashScope Provider",
  "match": {
    "apiUrlPatterns": ["dashscope.my-company.com"]
  },
  "capabilities": {
    "video": {
      "supportsLastFrame": false,
      "supportsReferenceVideo": true,
      "supportsMimicryLevel": false,
      "defaultModel": "video-v2",
      "maxDuration": 10
    },
    "image": {
      "supportsReferenceImage": false,
      "defaultModel": "image-v2"
    }
  },
  "transport": {
    "imageMode": "url",
    "videoMode": "url",
    "preferLocalData": false
  },
  "auth": {
    "type": "api-key-header",
    "headerName": "X-DashScope-API-Key"
  },
  "endpoints": {
    "video": {
      "generate": "/api/v1/services/aigc/video-generation/generation",
      "status": "/api/v1/tasks/{taskId}"
    },
    "image": {
      "generate": "/api/v1/services/aigc/image-generation/generation"
    },
    "text": {
      "generate": "/api/v1/services/aigc/text-generation/generation"
    },
    "vision": {
      "generate": "/api/v1/services/aigc/multimodal-generation/generation"
    }
  },
  "request": {
    "video": {
      "bodyFormat": "custom",
      "customBodyTemplate": {
        "model": "{{model}}",
        "input": {
          "prompt": "{{prompt}}",
          "img_url": "{{firstFrameUrl}}",
          "video_url": "{{referenceVideoUrl}}"
        },
        "parameters": {
          "size": "1280*720",
          "duration": "{{duration}}"
        }
      }
    },
    "image": {
      "bodyFormat": "flat",
      "promptField": "input.prompt",
      "modelField": "model"
    },
    "text": {
      "bodyFormat": "anthropic"
    },
    "vision": {
      "bodyFormat": "anthropic"
    }
  },
  "response": {
    "video": {
      "taskIdPath": "output.task_id",
      "videoUrlPath": "output.video_url",
      "statusPath": "output.task_status",
      "statusMapping": {
        "SUCCEEDED": "completed",
        "RUNNING": "generating",
        "FAILED": "failed",
        "PENDING": "queued"
      }
    },
    "image": {
      "imageUrlPath": "output.results.0.url"
    },
    "text": {
      "contentPath": "output.text"
    }
  }
}
```

---

## 插件管理

### 安装插件

1. 将 `.plugin.json` 文件放入 `~/PrismCraft/Plugins/` 目录
2. 在应用 **设置 > 插件管理** 中点击"刷新"按钮
3. 插件会自动加载并出现在可用提供商列表中

### 卸载插件

1. 在 **设置 > 插件管理** 中找到目标插件
2. 点击"删除"按钮
3. 或手动删除 `~/PrismCraft/Plugins/` 中对应的 `.plugin.json` 文件

### 验证插件

应用启动时会自动验证所有插件配置。无效的插件会被跳过并在日志中记录错误。常见验证问题：

- `id` 不符合格式要求或与内置插件冲突
- 缺少必填字段
- `match.apiUrlPatterns` 为空
- JSON 格式错误

---

## 内置插件列表

| ID | 名称 | 支持能力 |
|----|------|---------|
| `volcengine` | 火山引擎 (Doubao) | 视频 + 图片 |
| `kuaishou` | 可灵AI (Kling) | 视频 + 图片 |
| `zhipu` | 智谱AI (GLM) | 视频 + 图片 + 视觉 |
| `pixverse` | Pixverse | 视频 + 图片 |
| `seedance` | Seedance | 视频 + 图片 |
| `google` | Google (Veo/Gemini) | 视频 + 图片 + 文本 + 视觉 |
| `openai-sora` | OpenAI (Sora/DALL-E) | 视频 + 图片 |
| `minimax` | MiniMax (Hailuo) | 视频 + 图片 |
| `anthropic` | Anthropic (Claude) | 文本 + 视觉 |
| `openai-compatible` | OpenAI 兼容 | 全部（回退） |
| `runway` | Runway | 视频 |
| `luma` | Luma Dream Machine | 视频 |
| `pika` | Pika | 视频 |
| `openai` | OpenAI | 文本 + 图片 + 视频 |
| `qwen` | 通义千问 | 文本 + 图片 + 视频 |
| `deepseek` | DeepSeek | 文本 |
| `moonshot` | Moonshot (Kimi) | 文本 |
| `openrouter` | OpenRouter | 文本 + 图片 + 视频 |
| `byteplus` | BytePlus | 文本 + 图片 + 视频 |
| `fireworks` | Fireworks AI | 文本 + 图片 + 视频 |
| `bedrock` | Amazon Bedrock | 文本 + 视觉 |
| `ollama` | Ollama (本地) | 文本 + 图片 + 视频 |
| `pollinations` | Pollinations (免费) | 图片 |

---

## 常见问题

**Q: 插件加载后没有生效？**
A: 检查 `match.apiUrlPatterns` 是否与你在设置中配置的 API URL 匹配。插件系统按注册顺序匹配，第一个匹配的插件生效。

**Q: 如何支持非标准 API 格式？**
A: 使用 `bodyFormat: "custom"` + `customBodyTemplate` 定义任意请求体结构，配合 `response` 中的点分路径提取响应数据。

**Q: 认证方式不支持怎么办？**
A: 使用 `auth.type: "custom"` + `customHeaders`，值中的 `{apiKey}` 会被替换为实际 API Key。

**Q: 视频状态查询返回的状态值不一致？**
A: 使用 `response.video.statusMapping` 将提供商的状态值映射为标准状态（`completed`/`generating`/`failed`/`queued`）。

**Q: 可以覆盖内置插件吗？**
A: 不可以。保留 ID 是硬禁止的，用户插件不能使用与内置插件相同的 ID。但用户插件的匹配优先级（默认 10）高于内置插件（0），因此只要使用不同的 ID，用户插件会优先匹配。

---

## 角色参考图与场景参考图（v1.2 新增）

### 工作原理

在分镜生成流程中，系统会自动解析已绑定的角色和场景的图片，作为 `characterRef` 和 `sceneRef` 传递给 AI 提供商：

1. **角色参考图**：从角色的 `refImagePath`、`generatedImage`、`avatarPath` 中解析
2. **场景参考图**：从场景的 `refImagePath`、`scenePath`、`generatedImage` 中解析
3. **本地图片转换**：本地路径和 `vcache://` URL 会通过 `prepareImage()` 自动转换为 base64 格式
4. **不支持参考图的提供商**：系统会将参考图信息追加到提示词文本中（`[参考角色图: url]` / `[参考场景图: url]`）

### 配置示例

```json
{
  "capabilities": {
    "video": {
      "supportsLastFrame": true,
      "supportsReferenceVideo": false,
      "supportsMimicryLevel": false,
      "supportsCharacterRef": true,
      "supportsSceneRef": true,
      "defaultModel": "my-model-v1",
      "maxDuration": 10
    },
    "image": {
      "supportsReferenceImage": true,
      "supportsCharacterRef": true,
      "supportsSceneRef": true,
      "defaultModel": "my-model-v1"
    }
  },
  "request": {
    "video": {
      "bodyFormat": "flat",
      "characterRefField": "ref_image",
      "sceneRefField": "scene_image"
    },
    "image": {
      "bodyFormat": "flat",
      "characterRefField": "character_image",
      "sceneRefField": "scene_image"
    }
  }
}
```

### 自定义模板中使用

```json
"customBodyTemplate": {
  "model": "{{model}}",
  "input": {
    "prompt": "{{prompt}}"
    {{#characterRef}},"character_image": "{{characterRef}}"{{/characterRef}}
    {{#sceneRef}},"scene_image": "{{sceneRef}}"{{/sceneRef}}
    {{#firstFrameUrl}},"image_url": "{{firstFrameUrl}}"{{/firstFrameUrl}}
  }
}
```

---

## 版本历史

### v1.3.0 (2026-05-24)

- 新增 `availableModels` 顶层字段：声明插件支持的所有模型
- 新增 `models.*.displayName`：模型显示名称
- 新增 `models.*.parameters`：Per-Model 参数配置（durations、resolutions、styles、negativePrompt、seed、cfgScale、lora）
- 参数会自动反映在 UI 中，无需额外代码
- 修复 Kling V3 完整示例：补充 `transport`、`capabilities.video.supportsMimicryLevel`、`capabilities.image.supportsReferenceImage` 等必填字段；移除不存在的 `supported`/`result` 字段；`match.apiUrlPatterns` 改为字符串数组格式
- 修复插件创建向导 `buildPluginJson`：生成的 JSON 现在完全符合 Schema 规范，包含 `match`/`capabilities`/`transport`/`endpoints`/`request`/`response` 完整结构
- 修复 `DurationOption.value` 类型从 `string` 改为 `number`
- 修复 `getModelParameterProfile` 模型查找逻辑：新增 `findModelKey()` 方法，使用精确匹配替代模糊匹配，与 `getModelCapabilities` 保持一致
- 修复 `RESOLUTION_OPTIONS` 类型：从 `"720p"|"1080p"|"4K"` 改为 `"1280x720"|"1920x1080"|"3840x2160"`，包含 `width`/`height` 字段
- 更新 `PLUGIN_CONFIG_SCHEMA_VERSION` 从 1.1.0 到 1.3.0

### v1.2.0 (2026-05-23)

- 新增 `capabilities.video.supportsCharacterRef` / `capabilities.video.supportsSceneRef`：声明是否支持角色/场景参考图
- 新增 `capabilities.image.supportsCharacterRef` / `capabilities.image.supportsSceneRef`：声明是否支持角色/场景参考图
- 新增 `request.video.characterRefField` / `request.video.sceneRefField`：flat 模式下角色/场景参考图的请求体字段名
- 新增 `request.image.characterRefField` / `request.image.sceneRefField`：flat 模式下角色/场景参考图的请求体字段名
- 新增自定义模板变量 `{{characterRef}}` / `{{sceneRef}}`（video + image）
- `openai-content` 格式自动将 `characterRef`/`sceneRef` 作为 `image_url` 内容追加到 content 数组
- `dashscope` 格式自动将 `characterRef`/`sceneRef` 添加到 `input` 对象

### v1.1.0 (2026-05-20)

- 初始版本

---

## 相关文档

| 文档 | 用途 |
|------|------|
| [MODULES.md](MODULES.md) | 模块全景图（42 个模块），了解插件系统在整体架构中的位置 |
| [agent-tools-architecture.md](agent-tools-architecture.md) | Agent 工具架构（154 个工具 / 20 个域），插件能力可被 Agent 工具调用 |
| [README.md](README.md) | 文档索引 |
