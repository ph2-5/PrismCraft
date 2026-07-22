# Agent Tools 架构

> 自动生成于 2026-07-23。基于实际代码扫描。
> 工具总数：154 个，模块数：14 个，业务域数：20 个

---

## 架构概览

PrismCraft 的 Agent 系统采用**单一 Agent + 动态工具注册表**架构（非多 Agent 划分）。所有功能通过 function-calling 工具暴露给 LLM，工具实现按业务域拆分到 14 个独立子模块，由统一的 `toolRegistry` 单例聚合管理。

### 关键组件

| 组件 | 路径 | 职责 |
|------|------|------|
| ToolRegistry | `src/modules/agent/services/tool-registry.ts` | 工具注册表单例，按 name 唯一注册，支持按域过滤 |
| ToolExecutor | `src/modules/agent/services/tool-executor.ts` | 工具执行器，解析参数/超时控制/取消信号/脱敏 |
| AgentLoop | `src/modules/agent/services/agent-loop.ts` | Agent 推理循环，流式调用 LLM → 工具调用 → 结果回灌 |
| ToolImpl 类型 | `src/domain/types/agent-tools.ts` | 工具实现接口规范（def/domain/execute/dangerLevel） |
| 注册入口 | `src/modules/agent/tools/index.ts` | 唯一注册入口 `registerAllTools()` |

### 模块拓扑

```
agent/tools/index.ts (注册入口)
  │
  ├── agent-tools-asset         (14)  → asset
  ├── agent-tools-generation    (19)  → generation, image-edit
  ├── agent-tools-media         (23)  → video, video-post, audio
  ├── agent-tools-meta          (23)  → config, diagnostic, monitor, help
  ├── agent-tools-web-file      (14)  → web, file-management
  ├── agent-tools-story         (13)  → story
  ├── agent-tools-shot          ( 5)  → shot
  ├── agent-tools-template      ( 9)  → template
  ├── agent-tools-workflow      (14)  → workflow
  ├── agent-tools-memory        ( 6)  → memory
  ├── agent-tools-project-io    ( 4)  → project-io
  ├── agent-tools-specialist    ( 2)  → workflow (specialist 委派)
  ├── agent-tools-system        ( 3)  → system
  └── novel/tools               ( 5)  → novel
                                 ─────
                                 154
```

---

## 工具注册机制

### 1. ToolImpl 接口规范

每个工具实现 `ToolImpl` 接口（定义于 `src/domain/types/agent-tools.ts`）：

```typescript
export interface ToolImpl {
  /** 工具定义（传给 LLM 的 function schema） */
  def: ToolDef;
  /** 业务域 */
  domain: ToolDomain;
  /** 执行函数 */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
  /** 是否需要用户确认（destructive 级别自动视为 true） */
  requiresConfirmation?: boolean;
  /** 危险等级（默认 safe） */
  dangerLevel?: DangerLevel;
  /** 工具超时（ms），未设置则使用默认值 */
  timeoutMs?: number;
}
```

**关键返回类型**：

```typescript
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration?: number; // 执行耗时（ms）
}

export type DangerLevel = "safe" | "limited" | "destructive";
```

### 2. 注册流程

注册入口 `src/modules/agent/tools/index.ts` 暴露幂等函数 `registerAllTools()`：

1. **先注册内置 Specialist**：`specialistRegistry.registerBuiltins()` 注册 5 个内置专家（character-creator / video-producer / story-writer / api-configurator / asset-finder）
2. **导入 14 个子模块的工具数组**：每个子模块通过 barrel 导出 `xxxTools: ToolImpl[]` 聚合数组
3. **一次性批量注册**：`toolRegistry.registerAll([...所有工具数组])` 注册到全局单例
4. **幂等保护**：通过 `registered` 标志保证重复调用无副作用

```typescript
export function registerAllTools(): void {
  if (registered) return;
  specialistRegistry.registerBuiltins();
  toolRegistry.registerAll([
    ...assetTools, ...assetCrudTools, ...configTools, ...systemTools,
    ...generationTools, ...webTools, ...imageEditTools, ...storyTools,
    ...videoTools, ...shotTools, ...videoPostTools, ...audioTools,
    ...templateTools, ...promptTemplateTools, ...workflowTools,
    ...monitorTools, ...diagnosticTools, ...helpTools, ...subworkflowTools,
    ...memoryTools, ...projectIoTools, ...fileManagementTools,
    ...specialistTools, ...novelTools, ...qcTools,
  ]);
  registered = true;
}
```

### 3. ToolRegistry 核心方法

| 方法 | 用途 |
|------|------|
| `register(tool)` | 注册单个工具（重名抛错） |
| `registerAll(tools)` | 批量注册 |
| `unregister(name)` | 卸载工具（用于插件动态移除，幂等） |
| `get(name)` | 按名称获取工具实现 |
| `getToolDefs(filter?)` | 获取传给 LLM 的 ToolDef 数组（支持按名过滤） |
| `getByDomain(domain)` | 按业务域分组查询 |
| `getToolDescriptions(filter?)` | 获取工具描述列表（注入 system prompt） |
| `size()` | 获取工具数量 |

### 4. ToolExecutor 执行机制

`ToolExecutor`（`src/modules/agent/services/tool-executor.ts`）负责工具调用的安全执行：

- **参数解析**：JSON.parse ToolCall.arguments，失败时返回友好错误
- **超时控制**：默认 30s（查询类），可通过 `tool.timeoutMs` 覆盖（生成类 5min / 视频任务 30min）
- **取消信号**：合并外部 AbortSignal 与内部超时 controller
- **错误脱敏**：`sanitizeErrorMessage()` 匹配 `sk-/key-/token-/Bearer` 前缀替换为 `[REDACTED]`，截断 >500 字符错误
- **Specialist 白名单**：构造时可注入 `allowedTools`，硬执行白名单外的工具直接拒绝（防 LLM 幻觉）
- **危险等级判定**：`getEffectiveDangerLevel()` 综合 `requiresConfirmation` 与 `dangerLevel`

### 5. 工具插件扩展（P3）

`loadToolPlugins()` 异步加载用户插件（`{cacheDir}/agent/tool-plugins/` 目录），需在 `registerAllTools()` 之后调用以确保内置工具已注册（冲突检测需要）。插件工具的 `domain` 为 `"plugin"`。

---

## 工具分类体系

`ToolDomain` 类型定义于 `src/domain/types/agent-tools.ts`，共 21 个域（其中 `"plugin"` 仅供用户插件使用）。内置工具实际使用 20 个域：

| # | 域名 | 工具数 | 所属模块 | 用途 |
|---|------|--------|----------|------|
| 1 | `asset` | 14 | agent-tools-asset | 角色/场景资产查询与 CRUD |
| 2 | `generation` | 9 | agent-tools-generation | AI 图像/文本/音乐/配音生成 |
| 3 | `image-edit` | 10 | agent-tools-generation | 图像编辑（裁剪/合成/滤镜/修补） |
| 4 | `video` | 9 | agent-tools-media | 视频任务管理 + 一致性 QC |
| 5 | `video-post` | 9 | agent-tools-media | 视频后期合成（合并/字幕/转场） |
| 6 | `audio` | 5 | agent-tools-media | 音频处理（混音/降噪/分割） |
| 7 | `config` | 8 | agent-tools-meta | API 配置管理（查询/写入） |
| 8 | `diagnostic` | 4 | agent-tools-meta | 系统诊断与修复 |
| 9 | `monitor` | 5 | agent-tools-meta | 任务监控与活动日志 |
| 10 | `help` | 6 | agent-tools-meta | 功能解释/教程/帮助文档 |
| 11 | `system` | 3 | agent-tools-system | 系统/项目信息查询 |
| 12 | `web` | 8 | agent-tools-web-file | 浏览器/网络搜索/下载 |
| 13 | `file-management` | 6 | agent-tools-web-file | 文件管理（增删改查） |
| 14 | `story` | 13 | agent-tools-story | 故事 CRUD/规划/生成/建议 |
| 15 | `shot` | 5 | agent-tools-shot | 分镜生成（关键帧/帧对/视频/批量） |
| 16 | `template` | 9 | agent-tools-template | 项目模板 + Prompt 模板管理 |
| 17 | `workflow` | 16 | agent-tools-workflow + agent-tools-specialist | 工作流编排 + 子流程 + 专家委派 |
| 18 | `memory` | 6 | agent-tools-memory | 记忆管理（保存/召回/偏好） |
| 19 | `project-io` | 4 | agent-tools-project-io | 项目导入导出 |
| 20 | `novel` | 5 | novel/tools | 小说文本处理（分段/提取/匹配/转分镜） |

---

## 工具域详情

### 域 1: agent-tools-asset（asset 域）

- **路径**: `src/modules/agent-tools-asset/`
- **职责**: 角色/场景资产查询与 CRUD，包括跨资产搜索、标签管理、整理去重
- **工具数**: 14（5 query + 9 crud）
- **依赖**: `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/domain/schemas`、动态导入 `@/modules/character`、`@/modules/scene`、`@/modules/storyboard`、`@/modules/shot`、`@/modules/search`

#### 资产查询工具（asset-tools.ts，5 个）

| 工具名 | 功能 | 主要参数 | 返回值 |
|--------|------|---------|--------|
| `list_characters` | 列出角色（支持过滤/分页） | name/style/tag/gender/limit/offset | `{total, offset, limit, items[]}` 精简字段 |
| `list_scenes` | 列出场景（支持过滤/分页） | name/type/mood/weather/tag/limit/offset | `{total, offset, limit, items[]}` 精简字段 |
| `get_character` | 获取角色完整详情 | characterId | 角色完整字段 |
| `get_scene` | 获取场景完整详情 | sceneId | 场景完整字段 |
| `search_assets` | 跨资产搜索（角色+场景+故事+素材） | keyword/assetType/tag/limit | `{characters[], scenes[], stories[], mediaAssets[], counts, total}` |

#### 资产 CRUD 工具（asset-crud-tools.ts + asset-organize-tools.ts，9 个）

| 工具名 | 功能 | 主要参数 | 危险等级 |
|--------|------|---------|---------|
| `create_character` | 创建角色 | name/style/gender/age/description/tags/appearance/personality/customPrompt | limited |
| `update_character` | 更新角色 | characterId + 可更新字段 | limited |
| `delete_character` | 删除角色（含引用检查） | characterId | destructive |
| `create_scene` | 创建场景 | name/type/description 等场景字段 | limited |
| `update_scene` | 更新场景 | sceneId + 可更新字段 | limited |
| `delete_scene` | 删除场景（含引用检查） | sceneId | destructive |
| `tag_asset` | 为素材打标签 | assetId/tags | limited |
| `organize_assets` | 批量整理素材 | action/category | limited |
| `deduplicate_assets` | 去重检测 | category/threshold | safe |

---

### 域 2: agent-tools-generation（generation + image-edit 域）

- **路径**: `src/modules/agent-tools-generation/`
- **职责**: AI 内容生成（图像/文本/音乐/配音）与图像编辑
- **工具数**: 19（9 generation + 10 image-edit）
- **依赖**: `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/infrastructure/di`（container.imageProvider / characterStorage）、`@/domain/schemas`、`@/shared/file-http`

#### 生成工具（generation-tools.ts，9 个）

| 工具名 | 功能 | 主要参数 | 返回值 |
|--------|------|---------|--------|
| `generate_character_image` | 生成角色图像 | characterId/prompt/style | 图片 URL + 元数据 |
| `generate_scene_image` | 生成场景图像 | sceneId/prompt | 图片 URL |
| `generate_prop_image` | 生成道具图像 | name/prompt/style | 图片 URL |
| `analyze_image` | 分析图像 | imageUrl/question | 分析结果文本 |
| `generate_text` | 生成文本 | prompt/maxTokens/temperature | 生成的文本 |
| `generate_music` | 生成音乐 | prompt/duration/genre | 音频 URL |
| `generate_voiceover` | 生成配音 | text/voice/speed | 音频 URL |
| `text_to_speech` | 文字转语音 | text/voice | 音频 URL |
| `transcribe_audio` | 音频转录 | audioUrl/language | 转录文本 |

#### 图像编辑工具（image-edit-tools.ts + image-edit-utils.ts，10 个）

| 工具名 | 功能 | 主要参数 | 危险等级 |
|--------|------|---------|---------|
| `edit_image` | 基础编辑（裁剪+旋转+缩放+翻转序列） | imageUrl/operations | limited |
| `crop_image` | 裁剪图片 | imageUrl/x/y/width/height | limited |
| `merge_images` | 合并多张图片（水平/垂直/网格） | imageUrls/layout | limited |
| `composite_image` | 图片合成（前景叠加到背景） | backgroundUrl/foregroundUrl/x/y/scale/opacity | limited |
| `remove_background` | 去除背景（AI，优雅降级） | imageUrl | limited |
| `apply_filter` | 应用滤镜（灰度/棕褐/反色/模糊等） | imageUrl/filter | limited |
| `adjust_colors` | 调整颜色（亮度/对比度/饱和度/色相） | imageUrl/brightness/contrast/saturation/hue | limited |
| `inpaint` | 图像修复（AI，优雅降级） | imageUrl/maskUrl/prompt | limited |
| `add_text_overlay` | 添加文字水印 | imageUrl/text/position/fontSize/color | limited |
| `resize_image` | 调整图片尺寸 | imageUrl/width/height | limited |

> 注：`composite_image` 实现拆分至 `image-edit-utils.ts`（为降低主文件复杂度），但仍由 `imageEditTools` 数组聚合注册。

---

### 域 3: agent-tools-media（video + video-post + audio 域）

- **路径**: `src/modules/agent-tools-media/`
- **职责**: 音频处理、视频任务管理、视频后期合成、一致性 QC
- **工具数**: 23（5 audio + 7 video + 9 video-post + 2 qc）
- **依赖**: `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/modules/ffmpeg-runner`、`@/infrastructure/di`（container.videoTaskStorage / container.storyStorage）、`@/domain/schemas`、`@/modules/video/consistency-qc`

#### 音频工具（audio-tools.ts，5 个，audio 域）

| 工具名 | 功能 | 主要参数 |
|--------|------|---------|
| `mix_audio` | 混音 | audioUrls/outputFormat |
| `adjust_audio_speed` | 调整音频速度 | audioUrl/speed |
| `normalize_audio` | 音频归一化 | audioUrl |
| `remove_noise` | 降噪 | audioUrl/strength |
| `split_audio` | 分割音频 | audioUrl/segments |

#### 视频任务工具（video-tools.ts，7 个，video 域）

| 工具名 | 功能 | 主要参数 | 危险等级 |
|--------|------|---------|---------|
| `create_video_task` | 创建视频任务 | prompt/firstFrameUrl/characterRefs/model | limited |
| `list_video_tasks` | 列出视频任务 | status/limit/offset | safe |
| `get_video_task` | 获取视频任务详情 | taskId | safe |
| `query_video_status` | 查询视频任务状态 | taskId | safe |
| `cancel_video_task` | 取消视频任务 | taskId | destructive |
| `recover_video_task` | 恢复视频任务 | taskId | limited |
| `batch_create_video_tasks` | 批量创建视频任务（最多 10 个） | tasks[] | limited |

#### 视频后期工具（video-post-tools.ts，9 个，video-post 域）

| 工具名 | 功能 | 主要参数 |
|--------|------|---------|
| `merge_videos` | 合并视频（最多 10 个） | videoPaths/outputPath |
| `trim_video` | 裁剪视频 | videoPath/startTime/endTime |
| `add_transition` | 添加转场 | videoPaths/transition/duration |
| `add_subtitle` | 添加字幕 | videoPath/subtitles |
| `adjust_video_speed` | 调整视频速度 | videoPath/speed |
| `extract_audio` | 提取音频 | videoPath |
| `replace_audio` | 替换音频 | videoPath/audioPath |
| `generate_thumbnail` | 生成缩略图 | videoPath/timestamp |
| `compose_final_video` | 合成最终视频 | videoClips[]/outputPath |

#### 一致性 QC 工具（qc-tools.ts，2 个，video 域）

| 工具名 | 功能 | 主要参数 | 返回值 |
|--------|------|---------|--------|
| `check_video_consistency` | 对已完成视频执行一致性 QC，写回 StoryBeat.qcReport | taskId/beatId | QCReport 精简摘要（最差 3 帧） |
| `dispatch_video_fallback` | 根据 QCReport 触发 fallback（regenerate/face_swap/manual_review） | taskId/beatId/action | fallback 执行结果 |

> 特权访问：QC 工具通过 DI container 直接访问 `videoTaskStorage` / `storyStorage`（详见 agent MODULE.md "Agent 特权访问声明"）。

---

### 域 4: agent-tools-meta（config + diagnostic + monitor + help 域）

- **路径**: `src/modules/agent-tools-meta/`
- **职责**: 系统元工具集 — API 配置管理、系统诊断与修复、任务监控与活动日志、功能解释与帮助文档
- **工具数**: 23（8 config + 4 diagnostic + 5 monitor + 6 help）
- **依赖**: `@/domain/types/agent-tools`、`@/shared/*`、`@/infrastructure/di`、静态字典数据文件

#### 配置管理工具（config-query-tools.ts + config-write-tools.ts，8 个，config 域）

| 工具名 | 功能 | 危险等级 |
|--------|------|---------|
| `get_api_config` | 获取 API 配置（脱敏 key） | safe |
| `check_api_health` | 检查 API 健康状态 | safe |
| `list_providers` | 列出所有已配置 provider | safe |
| `list_video_models` | 列出视频模型列表 | safe |
| `get_model_parameters` | 获取模型参数说明 | safe |
| `test_connection` | 测试连接（仅探测，无写入） | safe |
| `validate_api_key` | 验证 API key 有效性 | safe |
| `configure_api_provider` | 配置 API provider（含 vendor 预设派生） | limited |

#### 诊断工具（diagnostic-tools.ts 等，4 个，diagnostic 域）

| 工具名 | 功能 | 危险等级 |
|--------|------|---------|
| `diagnose_error` | 错误诊断 | safe |
| `auto_fix` | 自动修复常见错误 | limited |
| `diagnose_system_health` | 系统健康诊断（API/磁盘/视频任务/缓存） | safe |
| `rollback` | 回滚操作 | destructive |

#### 监控工具（monitor-tools.ts 等，5 个，monitor 域）

| 工具名 | 功能 | 危险等级 |
|--------|------|---------|
| `monitor_tasks` | 任务监控 | safe |
| `notify_completion` | 完成通知 | safe |
| `get_activity_log` | 获取活动日志 | safe |
| `watch_progress` | 进度观察 | safe |
| `get_error_history` | 获取错误历史 | safe |

#### 帮助工具（help-tools.ts 等，6 个，help 域）

| 工具名 | 功能 | 危险等级 |
|--------|------|---------|
| `explain_feature` | 功能解释 | safe |
| `show_tutorial` | 教程展示 | safe |
| `get_help` | 帮助文档查询 | safe |
| `list_available_commands` | 可用命令列表 | safe |
| `suggest_next_action` | 下一步建议 | safe |
| `get_keyboard_shortcuts` | 快捷键查询 | safe |

> 注：help-tools 通过 DI container 异步获取 `agentToolRegistry` 以查询可用工具列表。MODULE.md 中标注的 "21 个" 已过时，实际为 23 个（config 子域已扩展至 8 个）。

---

### 域 5: agent-tools-system（system 域）

- **路径**: `src/modules/agent-tools-system/`
- **职责**: 系统/项目信息查询
- **工具数**: 3
- **依赖**: `@/domain/types/agent-tools`、`@/shared/*`、`@/infrastructure/di`、动态导入 character/scene/video-store/api-config/file-http

| 工具名 | 功能 | 主要参数 | 返回值 |
|--------|------|---------|--------|
| `get_project_stats` | 项目统计概览 | 无 | 角色/场景/视频任务/已配置能力统计 |
| `get_app_info` | 应用信息 | 无 | 版本/平台/可用工具数 |
| `get_disk_usage` | 磁盘使用情况 | 无 | 缓存目录磁盘占用 |

---

### 域 6: agent-tools-web-file（web + file-management 域）

- **路径**: `src/modules/agent-tools-web-file/`
- **职责**: 浏览器/网络搜索下载 + 文件管理
- **工具数**: 14（8 web + 6 file-management）
- **依赖**: `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/shared/file-http`、`@/infrastructure/di`（container.elementStorage）、动态导入 character/scene

#### Web 工具（web-tools.ts，8 个，web 域）

| 工具名 | 功能 | 主要参数 |
|--------|------|---------|
| `search_web_images` | 搜索网络图片素材 | query/source/limit |
| `search_web` | 通用网页搜索 | query/limit |
| `download_web_asset` | 下载网络素材到本地素材库 | url/category |
| `import_from_url` | 从 URL 导入素材 | url/type |
| `fetch_web_content` | 获取网页内容（AI 阅读网页） | url |
| `open_in_browser` | 在系统浏览器中打开链接 | url |
| `bookmark_resource` | 收藏资源 | url/title/tags |
| `list_bookmarks` | 列出收藏的资源 | tag/limit |

#### 文件管理工具（file-management-tools.ts，6 个，file-management 域）

| 工具名 | 功能 | 主要参数 | 危险等级 |
|--------|------|---------|---------|
| `list_files` | 列出指定类别目录文件 | category/limit | safe |
| `get_file_info` | 获取文件信息 | path | safe |
| `delete_file` | 删除文件 | path | destructive |
| `copy_file` | 复制文件 | source/destination | limited |
| `move_file` | 移动文件 | source/destination | destructive |
| `get_disk_space` | 查询磁盘空间 | path | safe |

> 路径白名单保护：`isProtectedAgentPath()` 拒绝操作 `/agent/audit/`、`/agent/sessions/`、`/agent/tool-plugins/` 内部目录；`isPathSafe()` 拒绝系统目录和 `..` 路径穿越。

---

### 域 7: agent-tools-story（story 域）

- **路径**: `src/modules/agent-tools-story/`
- **职责**: 故事创作全流程 — CRUD、规划、生成、建议
- **工具数**: 13（5 CRUD + 2 planning + 3 generation + 3 suggestions）
- **依赖**: `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/infrastructure/di`、`@/shared-logic/json`、动态导入 storyboard/character/scene

#### Story CRUD（story-tools.ts，5 个）

| 工具名 | 功能 | 危险等级 |
|--------|------|---------|
| `list_stories` | 列出所有故事（支持过滤/分页） | safe |
| `get_story` | 获取故事详情（含分镜） | safe |
| `create_story` | 创建故事 | limited |
| `update_story` | 更新故事 | limited |
| `delete_story` | 删除故事 | destructive |

#### Story Planning（story-tools-planning.ts，2 个）

| 工具名 | 功能 |
|--------|------|
| `plan_story` | AI 规划故事分镜 |
| `validate_story_plan` | 校验分镜计划 |

#### Story Generation（story-tools-generation.ts，3 个）

| 工具名 | 功能 |
|--------|------|
| `generate_style_guide` | 生成风格指南 |
| `generate_frame_prompts` | 生成分镜首尾帧提示词 |
| `generate_story_ideas` | 生成故事创意 |

#### Story Suggestions（story-tools-suggestions.ts，3 个）

| 工具名 | 功能 |
|--------|------|
| `suggest_character_backstory` | 建议角色背景故事 |
| `suggest_scene_description` | 建议场景描述 |
| `check_story_consistency` | 故事逻辑一致性检查 |

---

### 域 8: agent-tools-shot（shot 域）

- **路径**: `src/modules/agent-tools-shot/`
- **职责**: 分镜生成（关键帧/帧对/视频/批量/重生成）
- **工具数**: 5
- **依赖**: `@/domain/types/agent-tools`、`@/shared/*`、`@/infrastructure/di`（container.videoTaskStorage）、动态导入 storyboard/character/scene

| 工具名 | 功能 | 主要参数 | 危险等级 |
|--------|------|---------|---------|
| `generate_beat_keyframe` | 生成分镜关键帧 | storyId/beatId/prompt | limited |
| `generate_beat_frame_pair` | 生成分镜帧对 | storyId/beatId/firstFramePrompt/lastFramePrompt | limited |
| `generate_beat_video` | 生成分镜视频 | storyId/beatId/prompt | limited |
| `batch_generate` | 批量生成（最多 20 个 beat） | storyId/beatIds/generateType | limited |
| `regenerate_beat` | 重新生成分镜 | storyId/beatId | limited |

---

### 域 9: agent-tools-template（template 域）

- **路径**: `src/modules/agent-tools-template/`
- **职责**: 项目模板管理 + Prompt 模板管理
- **工具数**: 9（5 template + 4 prompt-template）
- **依赖**: `@/domain/types/agent-tools`、`@/shared/*`、`@/infrastructure/di`（container.videoTaskStorage / container.templateStorage）、动态导入 character/scene/storyboard

#### 项目模板工具（template-tools.ts，5 个）

| 工具名 | 功能 | 危险等级 |
|--------|------|---------|
| `list_templates` | 列出模板 | safe |
| `apply_template` | 应用模板 | limited |
| `create_template` | 创建模板 | limited |
| `import_template` | 导入模板 | limited |
| `export_template` | 导出模板 | safe |

#### Prompt 模板工具（prompt-template-tools.ts，4 个）

| 工具名 | 功能 | 危险等级 |
|--------|------|---------|
| `list_prompt_templates` | 列出 Prompt 模板 | safe |
| `apply_prompt_template` | 应用 Prompt 模板 | limited |
| `create_prompt_template` | 创建 Prompt 模板 | limited |
| `search_prompt_templates` | 搜索 Prompt 模板 | safe |

> 注：prompt-template-tools 使用 `domain: "template" as never` 类型断言（向后兼容类型扩展）。

---

### 域 10: agent-tools-workflow（workflow 域）

- **路径**: `src/modules/agent-tools-workflow/`
- **职责**: 工作流编排 + 子流程自动化（含 7 个子流程实现文件）
- **工具数**: 14（5 workflow + 9 subworkflow）
- **依赖**: `@/domain/types/agent-tools`、`@/shared-logic/*`、`@/shared/*`、`@/infrastructure/di`（container.agentToolExecutor / agentToolRegistry / textProvider / imageProvider / videoProvider）、动态导入 character/scene/storyboard

#### 工作流编排工具（workflow-tools.ts，5 个）

| 工具名 | 功能 | 主要参数 |
|--------|------|---------|
| `create_workflow` | 创建工作流 | name/steps[] |
| `execute_workflow` | 执行工作流 | workflowId/inputs |
| `batch_process` | 批量处理（最多 20 个 item） | items[]/operation |
| `chain_operations` | 链式操作 | operations[] |
| `schedule_task` | 调度任务 | task/cron/delay |

#### 子流程工具（subworkflow-*.ts，9 个）

| 工具名 | 功能 | 实现文件 |
|--------|------|---------|
| `auto_create_character` | 自动创建角色（含图像生成） | subworkflow-character-tools.ts |
| `auto_create_scene` | 自动创建场景（含图像生成） | subworkflow-scene-tools.ts |
| `auto_plan_storyboard` | 自动规划分镜 | subworkflow-story-tools.ts |
| `auto_create_from_novel` | 从小说自动创建（文本→分镜） | subworkflow-novel-tools.ts |
| `auto_generate_beat_full` | 完整自动生成分镜（关键帧+视频） | subworkflow-video-tools.ts |
| `auto_generate_video_full` | 完整自动生成视频（端到端） | subworkflow-video-tools.ts |
| `auto_polish_video` | 自动精修视频 | subworkflow-polish-tools.ts |
| `auto_find_and_import_asset` | 自动查找并导入素材 | subworkflow-utility-tools.ts |
| `auto_fix_common_errors` | 自动修复常见错误 | subworkflow-utility-tools.ts |

> 共享辅助函数（`subworkflow-helpers.ts`）：`generateJsonWithAI`、`generateJsonArrayWithAI`、`executeTool`、`pollVideoTask`、`toStringArray`、`NOVEL_TEXT_MAX_CHARS` 常量。

---

### 域 11: agent-tools-memory（memory 域）

- **路径**: `src/modules/agent-tools-memory/`
- **职责**: 记忆管理（三层记忆架构的 Agent 工具入口）
- **工具数**: 6
- **依赖**: `@/domain/types/agent-tools`、`@/shared/*`、`@/modules/agent-memory`

| 工具名 | 功能 | 主要参数 | 危险等级 |
|--------|------|---------|---------|
| `save_memory` | 保存记忆 | content/category/tags | limited |
| `recall_memory` | 召回记忆（向量检索） | query/limit | safe |
| `get_user_preferences` | 获取用户偏好 | keys | safe |
| `update_preference` | 更新偏好 | key/value | limited |
| `delete_memory` | 删除记忆 | memoryId | destructive |
| `list_archival_memory` | 列出归档记忆 | limit/offset | safe |

---

### 域 12: agent-tools-project-io（project-io 域）

- **路径**: `src/modules/agent-tools-project-io/`
- **职责**: 项目导入导出
- **工具数**: 4
- **依赖**: `@/domain/types/agent-tools`、`@/shared/file-http`、动态导入 `@/modules/asset`

| 工具名 | 功能 | 主要参数 | 危险等级 |
|--------|------|---------|---------|
| `export_project` | 导出项目 | outputPath/includeAssets | safe |
| `import_project` | 导入项目（含 replace 模式） | filePath/mode | destructive |
| `export_characters` | 导出角色 | characterIds/outputPath | safe |
| `export_scenes` | 导出场景 | sceneIds/outputPath | safe |

---

### 域 13: agent-tools-specialist（workflow 域，P4 多 Agent 编排）

- **路径**: `src/modules/agent-tools-specialist/`
- **职责**: 专家委派工具，让主 Agent 能将任务委派给 Specialist 子 Agent
- **工具数**: 2
- **依赖**: `@/domain/types/agent-tools`、`@/modules/agent-specialist`（specialistRegistry）、动态 `import("@/modules/agent")` 获取 `runSpecialist` / `listAvailableSpecialists`

| 工具名 | 功能 | 主要参数 | 返回值 |
|--------|------|---------|--------|
| `delegate_to_specialist` | 委派任务给专家 Agent | specialist_id/task/context | 专家执行结果 |
| `list_specialists` | 列出可用专家 | 无 | 专家列表（id/name/description） |

**5 个内置 Specialist**：
- `character-creator`（角色创建）
- `video-producer`（视频制作）
- `story-writer`（故事编剧）
- `api-configurator`（API 配置）
- `asset-finder`（素材搜索）

> 防递归：子 Agent 的 `enabledTools` 不包含 `delegate_to_specialist`。子 Agent 60s 超时通过 `timeoutController.signal` 传递。子 Agent 通过 `ToolExecutor(whitelist)` 硬执行 Specialist 工具白名单。

---

### 域 14: novel/tools（novel 域，Phase 2A）

- **路径**: `src/modules/novel/tools/`
- **职责**: 小说文本处理流水线工具（Phase 2A Novel Agent）
- **工具数**: 5
- **依赖**: `@/domain/types/agent-tools`、`@/shared-logic/*`

| 工具名 | 功能 | 主要参数 | 返回值 |
|--------|------|---------|--------|
| `segment_novel_text` | 小说文本分段 | text/maxSegmentLength | 段落列表 |
| `extract_characters_from_text` | 提取角色 | text | 角色列表 |
| `extract_scenes_from_text` | 提取场景 | text | 场景列表 |
| `match_entities` | 实体三级匹配（精确/模糊/冲突） | segments/characters/scenes | 匹配结果 |
| `breakdown_text_to_shots` | 段落转分镜 | text/segments | 分镜列表 |

> 注：分镜转提示词复用统一的 `generate_frame_prompts` 工具（agent-tools-story），不在本模块定义。还导出非工具的纯函数 `detectChapters` / `findChapterByOffset`（章节识别，供 hooks 直接调用）。

---

## 工具调用流程

### 完整调用链路

```
用户输入
  │
  ▼
useAgent (React Hook)
  │ 调用 AgentLoop.run()
  ▼
AgentLoop.run()
  │
  ├── 1. 构建初始消息序列
  │   ├── system prompt（含 buildAvailableToolsSummary 工具摘要）
  │   ├── 历史消息（滑动窗口 + 摘要压缩）
  │   └── 用户消息
  │
  ├── 2. 意图路由（routeIntent + 可选 LLM 分类 fallback）
  │   └── 动态过滤 enabledTools（P3 工具过滤）
  │
  ├── 3. 调用 LLM（generateChat 原生 function calling，降级 generateTextStream）
  │   └── 传入 toolRegistry.getToolDefs(filter) 作为 tools 参数
  │
  ├── 4. 流式接收 chunk
  │   ├── delta → onChunk 实时输出
  │   ├── toolCalls → 增量累积（按 id 合并）
  │   └── finishReason → 判断结束
  │
  ├── 5. finishReason="tool_calls" → 执行工具
  │   │
  │   ├── 5.1 onToolCall 回调（UI 展示工具调用开始）
  │   │
  │   ├── 5.2 危险工具确认检查
  │   │   ├── toolExecutor.requiresConfirmation(toolCall)
  │   │   ├── destructive → callbacks.onConfirmationRequired(toolCall)
  │   │   │   ├── true → 继续
  │   │   │   └── false → 返回"已取消"结果
  │   │   └── 非 destructive → 直接执行
  │   │
  │   ├── 5.3 toolExecutor.execute(toolCall, ctx)
  │   │   ├── 解析 arguments JSON
  │   │   ├── 查找 tool = registry.get(name)
  │   │   ├── 创建 AbortController（合并超时 + 外部 signal）
  │   │   ├── tool.execute(args, ctx)
  │   │   ├── 异常 → sanitizeErrorMessage 脱敏
  │   │   └── 返回 ToolResult（含 duration）
  │   │
  │   ├── 5.4 truncateToolResult（超 maxToolResultTokens 截断）
  │   │
  │   ├── 5.5 onToolResult 回调（UI 展示结果）
  │   │
  │   ├── 5.6 recordAudit 持久化审计日志（JSONL）
  │   │
  │   ├── 5.7 recordFewShot 记录 few-shot 示例
  │   │
  │   └── 5.8 结果回灌为 tool 消息 → 回到步骤 3 重复
  │
  ├── 6. finishReason="stop" → 结束
  │
  └── 7. 保护机制
      ├── maxIterations: 10（防死循环）
      ├── maxTotalDurationMs: 5 分钟（总执行时间上限）
      ├── maxToolCallsPerMinute: 60（频率限制，滑动窗口）
      └── maxTokensPerTurn: 4096（防 token 溢出）
```

### 工具超时分级

| 类型 | 超时 | 适用工具 |
|------|------|---------|
| query | 30s | 查询类（list_*/get_*/search_*） |
| mutation | 60s | 变更类（create_*/update_*/generate_*） |
| generation | 5min | AI 生成类（generate_image/generate_video） |
| video task | 30min | 视频任务类（create_video_task） |
| specialist | 2min | 委派专家（delegate_to_specialist） |

### 审计日志

- **存储**：JSONL 格式，`{cacheDir}/agent/audit/{sessionId}.jsonl`
- **字段**：timestamp/sessionId/toolCallId/toolName/iteration/argsJson/status/success/error/resultPreview/durationMs/dangerLevel/confirmedByUser/specialist
- **淘汰**：单会话最大 500 条
- **specialist 字段**：主 Agent 为 `undefined`，子 Agent 为专家名

---

## 工具开发指南

### 新增 Agent Tool 步骤

#### 场景 A：在现有子模块中新增工具

1. **定位模块**：根据工具的业务域，找到对应的 `agent-tools-{domain}/` 子模块（参考"工具域详情"）
2. **读取类型规范**：先读 `src/domain/types/agent-tools.ts` 确认 `ToolImpl` 接口签名
3. **实现工具**：在对应子域文件中追加 `export const xxxTool: ToolImpl = { ... }`
4. **聚合导出**：在文件末尾的 `xxxTools: ToolImpl[]` 数组中追加新工具
5. **更新计数注释**：更新 index.ts 和 MODULE.md 中的工具数注释
6. **验证**：运行 `npm run typecheck` + 对应子模块的测试

#### 场景 B：新增独立子模块

1. **创建目录**：`src/modules/agent-tools-{name}/`，包含 `index.ts`、`MODULE.md`、工具实现文件
2. **实现 barrel**：`index.ts` 导出 `xxxTools: ToolImpl[]` 聚合数组 + `allXxxTools` 别名
3. **注册到 agent**：编辑 `src/modules/agent/tools/index.ts`，添加 import 和 `...xxxTools` 到 `registerAll` 数组
4. **更新 vite.config.ts**：在 `codeSplitting.groups` 添加 `test` 正则和 `priority: 15`
5. **创建 MODULE.md**：参照其他子模块的 MODULE.md 模板编写
6. **验证模块边界**：`node scripts/check-module-api-consistency.mjs`

### 工具实现规范

```typescript
import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";

export const myTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "my_tool_name",          // snake_case，全局唯一
      description: "工具描述（传给 LLM）",
      parameters: {
        type: "object",
        properties: {
          param1: {
            type: "string",
            description: "参数描述",
            maxLength: 200,          // 字符串必须限制长度
          },
          param2: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
        },
        required: ["param1"],
      },
    },
  },
  domain: "asset",                   // 必须从 ToolDomain 选择
  dangerLevel: "safe",               // safe / limited / destructive
  timeoutMs: TOOL_TIMEOUTS.query,    // 复用预设超时
  async execute(args, ctx) {
    // args 字段为 unknown，需 String()/Number()/Boolean() 转换
    const param1 = String(args.param1);
    // 通过动态 import 调用业务 service（避免循环依赖）
    const { someService } = await import("@/modules/xxx");
    const result = await someService.doSomething(param1);
    if (!result.ok) {
      return { success: false, error: `操作失败：${result.error.message}` };
    }
    return { success: true, data: result.value };
  },
};
```

### 强制约束（防幻觉）

| 操作 | 必须先读 | 原因 |
|------|---------|------|
| 实现 ToolImpl | `src/domain/types/agent-tools.ts` | 防止接口签名幻觉 |
| 调用业务 service | 对应模块的 `index.ts` barrel | 防止幻觉不存在的函数 |
| 文件操作 | `src/shared/file-http/index.ts` | 必须走统一 HTTP 层，禁止 `electronAPI.*` |
| 访问 storage | `src/infrastructure/di/container.ts` | 防止幻觉不存在的 token |
| 修改 Zustand Store | 现有 Store 文件 | 防止幻觉不存在的 state/method |

### 边界约束

- **禁止**：工具文件直接 import `@/modules/agent/*`（避免循环依赖，通过 DI container 异步获取）
- **禁止**：工具文件直接 import `@/infrastructure/*`（除 `@/infrastructure/di`）
- **禁止**：工具文件直接调用 `electronAPI.*`（文件操作走 `@/shared/file-http`）
- **必须**：工具类型从 `@/domain/types/agent-tools` import
- **必须**：业务 service 通过动态 `import()` 调用
- **必须**：工具名 snake_case 且全局唯一（ToolRegistry 注册时校验冲突）
- **必须**：字符串参数声明 `maxLength`，数值参数声明 `minimum`/`maximum`

### 危险等级使用建议

| 等级 | 适用场景 | 确认行为 |
|------|---------|---------|
| `safe` | 只读查询（list_*/get_*/search_*） | 无需确认 |
| `limited` | 有副作用但可恢复（create_*/update_*/generate_*） | 按工具 `requiresConfirmation` 标记 |
| `destructive` | 不可逆操作（delete_*/move_*/cancel_video_task/rollback） | 强制要求用户确认 |

### 批量操作限制

| 工具 | 限制 |
|------|------|
| `batch_create_video_tasks.tasks` | 最多 10 个 |
| `batch_generate.beatIds` | 最多 20 个 |
| `batch_process.items` | 最多 20 个 |
| `merge_videos.videoPaths` | 最多 10 个 |
| `merge_images.imageUrls` | 最多 9 个 |

---

## 附录

### A. 工具计数汇总

| 模块 | 路径 | 工具数 | 域 |
|------|------|--------|-----|
| agent-tools-asset | `src/modules/agent-tools-asset/` | 14 | asset |
| agent-tools-generation | `src/modules/agent-tools-generation/` | 19 | generation, image-edit |
| agent-tools-media | `src/modules/agent-tools-media/` | 23 | video, video-post, audio |
| agent-tools-meta | `src/modules/agent-tools-meta/` | 23 | config, diagnostic, monitor, help |
| agent-tools-web-file | `src/modules/agent-tools-web-file/` | 14 | web, file-management |
| agent-tools-story | `src/modules/agent-tools-story/` | 13 | story |
| agent-tools-shot | `src/modules/agent-tools-shot/` | 5 | shot |
| agent-tools-template | `src/modules/agent-tools-template/` | 9 | template |
| agent-tools-workflow | `src/modules/agent-tools-workflow/` | 14 | workflow |
| agent-tools-memory | `src/modules/agent-tools-memory/` | 6 | memory |
| agent-tools-project-io | `src/modules/agent-tools-project-io/` | 4 | project-io |
| agent-tools-specialist | `src/modules/agent-tools-specialist/` | 2 | workflow |
| agent-tools-system | `src/modules/agent-tools-system/` | 3 | system |
| novel/tools | `src/modules/novel/tools/` | 5 | novel |
| **合计** | | **154** | **20 个域** |

### B. 与 development-plan.md 的差异说明

`docs/development-plan.md` 中记载 "130+ 工具，18 域"（Phase 1 完成时的快照）。实际代码扫描结果为 **154 个工具，20 个域**，差异来源于后续 Task 4.1-4.12 与 Task 2A.23 的工具扩展：

- config 域从 6 个扩展至 8 个（新增 `list_video_models`、`get_model_parameters`）
- qc 域新增 2 个工具（`check_video_consistency`、`dispatch_video_fallback`），归入 video 域
- novel 域新增 5 个工具（Phase 2A Novel Agent）
- prompt-template 域（4 个工具）实际归入 template 域
- specialist 工具（2 个）实际归入 workflow 域

### C. 关键文件索引

| 文件 | 用途 |
|------|------|
| `src/domain/types/agent-tools.ts` | ToolImpl / ToolResult / ToolDomain / DangerLevel 类型定义 |
| `src/modules/agent/tools/index.ts` | 唯一注册入口 `registerAllTools()` |
| `src/modules/agent/services/tool-registry.ts` | ToolRegistry 单例实现 |
| `src/modules/agent/services/tool-executor.ts` | ToolExecutor 执行器（超时/取消/脱敏） |
| `src/modules/agent/services/agent-loop.ts` | AgentLoop 推理循环 |
| `src/modules/agent/domain/types.ts` | Agent 会话类型（向后兼容 re-export） |
| `src/modules/agent/domain/constants.ts` | TOOL_TIMEOUTS re-export |
| `src/shared/constants/tool-timeouts.ts` | 工具超时预设（query/mutation/generation/video） |
| `src/modules/agent/MODULE.md` | Agent 模块契约（含特权访问声明） |
