# 安全策略

## 支持的版本

PrismCraft 是一款本地优先的 AI 动画创作桌面应用，仅在收到安全更新时提供支持。

| 版本 | 支持状态 |
| ---- | -------- |
| 1.3.0 | ✅ 支持 |
| < 1.3.0 | ❌ 不再支持，请升级到最新版本 |

## 报告漏洞

我们非常重视 PrismCraft 的安全问题。如果您发现安全漏洞，请按以下流程报告：

1. **不要在公开的 GitHub Issue 中披露漏洞细节**，避免被恶意利用。
2. 通过以下任一渠道私下联系维护者：
   - 在 GitHub 上新开一个 Issue，仅标注「存在安全风险」并请求私下沟通（**不要在 Issue 描述中写入漏洞细节**）；
   - 通过私信联系仓库维护者。
3. 在报告中请尽量包含：
   - 漏洞的简要描述与影响范围；
   - 复现步骤（如有）；
   - 受影响的版本号；
   - 您建议的修复方向（可选）。

> ⚠️ **请勿在 GitHub Issues 公开评论中粘贴**：堆栈跟踪中的密钥/令牌、可被利用的 PoC 代码、内部文件路径或用户数据。

## 响应时间承诺

| 阶段 | 承诺时间 |
| ---- | -------- |
| 确认收到报告 | 3 个工作日内 |
| 初步评估与分级 | 7 个工作日内 |
| 修复版本发布（严重漏洞） | 30 天内（视复杂度而定） |
| 修复版本发布（一般漏洞） | 下一个常规发布周期 |

修复发布后，我们会在确保用户有时间升级的前提下，公开致谢并说明漏洞影响（敏感细节会酌情省略）。

## 安全设计概要

PrismCraft 在架构层面内置了以下安全机制：

### 1. API 密钥加密存储

用户配置的第三方服务 API 密钥在落盘前经过加密处理，不以明文形式写入配置文件或日志。密钥仅在需要调用服务时在内存中解密使用。

### 2. SQL 参数化查询

所有数据库访问统一使用参数化查询（Drizzle ORM + 预处理语句），杜绝字符串拼接 SQL，防止 SQL 注入。

### 3. IPC 5 级权限分级

Electron 主进程与渲染进程之间的 IPC 通道按风险等级分为 5 级权限，敏感操作（文件写入、配置读写、数据库操作等）受 ESLint 规则与运行时校验双重约束，渲染进程无法越权调用。

### 4. 插件沙箱隔离

第三方插件在隔离的沙箱环境中运行，无法直接访问主进程 API、文件系统或用户数据，仅通过受控的插件 API 暴露受限能力。

### 5. SSRF 防护

对外部用户配置的主机请求执行 SSRF 校验（`ssrfGuard.validate`）。回环地址（`127.0.0.1`、`localhost`、`::1`）受信并跳过校验；其余主机需通过 SSRF 校验后才会发起请求（见回归规则 R105）。

### 6. Agent 工具三级权限分层（v1.2.2）

Agent 工具按 `dangerLevel` 分为三级，配合 `requiresConfirmation` 决定执行行为：

| 等级 | 说明 | 示例 | 默认确认行为 |
|------|------|------|------------|
| `safe` | 只读/查询操作 | list_characters, get_story, search_assets | 无需确认 |
| `limited` | 有副作用但可恢复 | create_*, update_*, generate_*, edit_* | 按工具 `requiresConfirmation` 标记 |
| `destructive` | 不可逆操作 | delete_*, move_*, cancel_*, rollback, import_project(replace) | 强制要求用户确认 |

**插件 builtin-mirror 继承规则**：插件通过 `builtin-mirror` action 包装内置工具时，必须继承目标工具的 `dangerLevel` 和 `requiresConfirmation`，忽略插件声明的权限标记，防止插件绕过确认机制。

### 7. Agent 审计日志持久化（v1.2.2）

Agent 工具调用全程记录审计日志，支持事后追溯：

- **存储格式**：JSONL（每行一条 JSON 记录），位于 `{cacheDir}/agent/audit/{sessionId}.jsonl`
- **记录字段**：时间戳、会话 ID、工具名、迭代序号、参数（截断 2000 字符）、状态（done/error/cancelled/rejected）、耗时、危险等级、是否经用户确认、来源 Specialist
- **淘汰策略**：单会话最大 500 条，超出时淘汰最旧记录
- **查询接口**：`queryAuditLogs(filter)` / `getAuditStats()` / `clearAuditLogs(sessionId)` / `clearAllAuditLogs()`
- **UI 面板**：AgentPage 工具栏的 ScrollText 图标，支持统计概览、Top 5 工具调用统计、按工具名/状态筛选、日志列表展开查看

### 8. Agent 错误消息脱敏（v1.2.2）

工具执行异常时，错误消息在返回给 LLM 之前经过 `sanitizeErrorMessage()` 脱敏处理：

- 匹配 `sk-`/`key-`/`token-`/`Bearer` 前缀的 API key 模式，替换为 `[REDACTED]`
- 脱敏 `Authorization` header 内容
- 截断超过 500 字符的错误消息
- `config-tools` 和 `generation-tools` 的失败消息不透传原始 `result.message`，仅返回通用失败提示

### 9. Agent 路径白名单保护（v1.2.2）

Agent 文件操作工具（delete_file、move_file、export_project 等）通过 `isProtectedAgentPath()` 拒绝操作 Agent 内部目录：

- `/agent/audit/` — 审计日志目录
- `/agent/sessions/` — 会话持久化目录
- `/agent/tool-plugins/` — 工具插件目录

配合 `isPathSafe()` 的系统目录保护（Windows/System32、/etc、/usr 等），形成双层路径防御。

### 10. Agent 批量操作限制（v1.2.2）

所有批量工具通过 JSON Schema `maxItems` + 运行时 `Array.length` 双重校验限制批量规模：

| 工具 | 限制 |
|------|------|
| `batch_create_video_tasks.tasks` | 最多 10 个 |
| `batch_generate.beatIds` | 最多 20 个 |
| `batch_process.items` | 最多 20 个 |
| `merge_videos.videoPaths` | 最多 10 个 |
| `merge_images.imageUrls` | 最多 9 个 |

### 11. Agent 输入验证约束（v1.2.2）

所有工具参数在 JSON Schema 层声明输入约束，LLM 在生成参数时即可看到限制：

- **prompt/text 类**：`maxLength`（5000/2000/1000/500/200 按类型分级）
- **数值参数**：`minimum`/`maximum`（如 temperature 0-2, speed 0.25-4.0, opacity 0-1, limit 1-200）
- **URL/路径参数**：`maxLength`（2048 for URL, 1024 for path, 100 for ID）
- **数组参数**：`maxItems` 限制批量规模

### 12. 子 Agent 超时与权限控制（v1.2.2）

- **超时接线**：子 Agent 60 秒超时通过 `timeoutController.signal` 传递给 `AgentLoop.callbacks.signal`，超时后立即中止 LLM 调用
- **权限继承**：子 Agent 的危险操作确认向上传播给主 Agent UI；主 Agent 未提供确认回调时默认拒绝（安全默认）
- **工具白名单**：子 Agent 通过 `ToolExecutor(whitelist)` 硬执行 Specialist 工具白名单
- **来源标记**：子 Agent 工具调用的审计日志 `specialist` 字段填充专家名，区分主 Agent 与子 Agent 调用来源

## 贡献安全改进

如果您在贡献代码时涉及安全相关改动，请：

- 在 PR 描述中明确标注「涉及安全」；
- 不要在 PR 中引入新的硬编码密钥、令牌或凭证；
- 涉及 IPC、文件系统、网络请求的改动请补充对应的回归测试。

感谢您帮助 PrismCraft 变得更安全。
