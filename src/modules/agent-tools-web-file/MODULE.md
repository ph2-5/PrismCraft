<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Tools - Web & File Management Module

> Web 浏览器/网络工具与文件管理工具模块 — 从 agent/tools/ 拆分而来（阶段3-2）。

## 模块概览

- **定位**：从 agent 模块拆分出的独立工具集模块，包含浏览器/网络工具与文件管理工具
- **核心**：14 个工具实现（8 个 web + 6 个 file-management），通过 `toolRegistry` 注册到 agent
- **依赖**：仅依赖 `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/shared/file-http`、`@/infrastructure/di`、`@/modules/character`、`@/modules/scene`

## 背景

这些工具均为叶子工具集，无 `agent/services` 依赖，因此可独立成模块。从 `@/modules/agent/tools/` 拆分后，agent 模块通过 `@/modules/agent-tools-web-file` 导入工具数组并注册。

## 子域

| 子域 | 路径 | 职责 |
|------|------|------|
| web | `web-tools.ts` | 浏览器/网络工具（搜索、下载、收藏、网页抓取等） |
| file-management | `file-management-tools.ts` | 文件管理工具（列出、复制、移动、删除、磁盘空间等） |

## Public API

### Web Tools（8 个）

- `searchWebImagesTool` — 搜索网络图片素材
- `searchWebTool` — 通用网页搜索
- `downloadWebAssetTool` — 下载网络素材到本地素材库
- `importFromUrlTool` — 从 URL 导入素材
- `fetchWebContentTool` — 获取网页内容（AI 阅读网页）
- `openInBrowserTool` — 在系统浏览器中打开链接
- `bookmarkResourceTool` — 收藏资源
- `listBookmarksTool` — 列出收藏的资源
- `webTools` — 所有 web 工具数组

### File Management Tools（6 个）

- `listFilesTool` — 列出指定类别目录文件
- `getFileInfoTool` — 获取文件信息
- `deleteFileTool` — 删除文件（需确认）
- `copyFileTool` — 复制文件
- `moveFileTool` — 移动文件（需确认）
- `getDiskSpaceTool` — 查询磁盘空间
- `fileManagementTools` — 所有文件管理工具数组

## 边界约束

- **禁止**：本模块导入 `@/modules/agent/*`（agent 模块依赖本模块的工具数组，避免循环）
- **禁止**：本模块导入 `@/infrastructure/*`（除 `@/infrastructure/di` 用于 container.elementStorage）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：文件操作通过 `@/shared/file-http` 统一层（不直接调 IPC）

## 依赖方向

```
agent-tools-web-file → @/domain/types/agent-tools（类型）
                     → @/shared/constants/tool-timeouts
                     → @/shared/file-http
                     → @/infrastructure/di（container.elementStorage）
                     → @/modules/character, @/modules/scene（动态导入）
```
