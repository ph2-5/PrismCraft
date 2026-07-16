# Agent Tools Web File 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| web | 🔴 高 | 8 个网络工具、下载网络素材、fetchWebContent 抓取网页、SSRF 防护、收藏管理 |
| file-management | 🔴 高 | 6 个文件管理工具、deleteFileTool/moveFileTool 需确认、文件操作通过 @/shared/file-http |
| barrel | 🟢 低 | 仅 index.ts 聚合导出 |

## 子域依赖图

```
web-tools.ts（8 个）
  ← @/domain/types/agent-tools、@/shared/constants/tool-timeouts
  ← @/shared/file-http（下载素材到本地）
  ← @/infrastructure/di（container.elementStorage 道具元素入库）
  ← @/modules/character, @/modules/scene（动态导入）
file-management-tools.ts（6 个）
  ← @/domain/types/agent-tools、@/shared/file-http
  ↑
index.ts（barrel）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 两个工具文件彼此独立，均为叶子工具集，无 agent/services 依赖
- 文件操作通过 `@/shared/file-http` 统一层（不直接调 IPC）
- 网络下载通过 `@/shared/file-http` 持久化到本地

## 公共 API

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

## 常见修改场景

### 1. 新增网络或文件管理工具
- 修改文件：`web-tools.ts` 或 `file-management-tools.ts`，在 `index.ts` 追加 export
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、deleteFileTool / moveFileTool `requiresConfirmation: true`
- 测试：`npx vitest run src/modules/agent-tools-web-file/__tests__/`

### 2. 修改网络下载或素材导入逻辑
- 修改文件：`web-tools.ts`（downloadWebAssetTool / importFromUrlTool）
- 检查不变量：文件操作通过 `@/shared/file-http` 统一层；下载素材需 SSRF 防护（loopback 信任，非 loopback 用户配置主机需 `ssrfGuard.validate`，见 R105）
- 测试：`npx vitest run src/modules/agent-tools-web-file/__tests__/web-tools.test.ts`

### 3. 修改文件管理工具
- 修改文件：`file-management-tools.ts`
- 检查不变量：文件操作通过 `@/shared/file-http`（listFiles / getFileInfo / deleteFile / copyFile / moveFile / getDiskSpace）；删除/移动需确认
- 测试：`npx vitest run src/modules/agent-tools-web-file/__tests__/file-management-tools.test.ts`

### 4. 修改网页内容抓取
- 修改文件：`web-tools.ts`（fetchWebContentTool）
- 检查不变量：SSRF 防护；抓取内容返回给 LLM 用于阅读网页
- 测试：`npx vitest run src/modules/agent-tools-web-file/__tests__/web-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（file-http、constants）、`@/infrastructure/di`、`@/modules/character`、`@/modules/scene`（动态导入）
- **禁止导入**：`@/modules/agent/*`（agent 依赖本模块工具数组，避免循环）、`@/infrastructure/*`（除 DI）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`（文件操作必须走 `@/shared/file-http`）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：文件操作通过 `@/shared/file-http` 统一层（不直接调 IPC）

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-web-file`
- 关键测试文件：
  - `__tests__/web-tools.test.ts` — 8 个网络工具
  - `__tests__/file-management-tools.test.ts` — 6 个文件管理工具
