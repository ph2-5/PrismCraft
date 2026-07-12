/**
 * 错误诊断工具（Diagnostic Tools）
 *
 * 包含工具：
 * - diagnose_error：用 AI（textProvider）分析错误信息，推断原因与修复建议
 * - auto_fix：按 errorType 执行常见错误的自动修复策略（连接 / 鉴权 / 配额 / 模型 / 限流）
 * - diagnose_system_health：系统健康检查（API / 磁盘 / 任务 / 缓存）
 * - rollback：回滚操作（当前优雅降级，仅 story 支持查询备份版本）
 *
 * 设计要点：
 * - diagnose_error 通过 container.textProvider.generateText 让 AI 分析（不硬编码错误模式）
 * - auto_fix 复用 config-tools 的能力（testConnection / loadConfig），按 errorType 分发
 * - diagnose_system_health 聚合多项检查，按严重程度计算 overallHealth
 * - rollback 当前项目无完整版本控制系统，story 有 saveVersion 备份；其他类型优雅降级
 * - 所有操作 try/catch，错误时返回友好错误信息
 *
 * 特权访问声明：本文件通过 DI container 直接访问 videoTaskStorage、storyStorage、versionStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { container } from "@/infrastructure/di";

// ============= 工具实现 =============

/** 诊断错误（用 AI 分析错误信息，推断原因与修复建议） */
export const diagnoseErrorTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "diagnose_error",
      description:
        "诊断错误：根据错误信息和上下文，用 AI 推断可能原因和修复建议。" +
        "适用于：用户遇到错误但不知道原因、需要分析 stack trace、需要修复建议等场景。" +
        "返回 possibleCauses（可能原因数组）、suggestedFixes（修复建议数组）、severity（low/medium/high）。",
      parameters: {
        type: "object",
        properties: {
          errorMessage: { type: "string", description: "错误信息（必填，尽量完整）", maxLength: 2000 },
          errorContext: {
            type: "object",
            description: "错误上下文（可选）",
            properties: {
              toolName: { type: "string", description: "出错时调用的工具名" },
              args: { type: "object", description: "出错时传给工具的参数" },
              timestamp: { type: "number", description: "出错时间戳（Unix 毫秒）" },
            },
          },
        },
        required: ["errorMessage"],
      },
    },
  },
  domain: "diagnostic",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const errorMessage = String(args.errorMessage);
    const errorContext = (args.errorContext ?? {}) as {
      toolName?: string;
      args?: Record<string, unknown>;
      timestamp?: number;
    };

    // 构建提示词：明确要求 JSON 输出
    const contextLines: string[] = [];
    if (errorContext.toolName) contextLines.push(`- 工具名: ${errorContext.toolName}`);
    if (errorContext.timestamp) {
      contextLines.push(`- 时间: ${new Date(errorContext.timestamp).toISOString()}`);
    }
    if (errorContext.args) {
      try {
        contextLines.push(`- 参数: ${JSON.stringify(errorContext.args)}`);
      } catch {
        // ignore
      }
    }
    const contextStr = contextLines.length > 0 ? contextLines.join("\n") : "（无）";

    const prompt = `你是一名经验丰富的 AI 助手开发者，正在分析一个运行时错误。请根据错误信息和上下文，推断可能原因和修复建议。

错误信息：
${errorMessage}

上下文：
${contextStr}

请严格按以下 JSON 格式输出（不要输出其他内容，不要使用 markdown 代码块）：
{
  "possibleCauses": ["原因1", "原因2", "原因3"],
  "suggestedFixes": ["修复建议1", "修复建议2", "修复建议3"],
  "severity": "low" | "medium" | "high"
}

判定 severity 的标准：
- high: 影响核心功能（API 不可用、数据丢失、安全漏洞）
- medium: 影响部分功能但可绕过
- low: 轻微问题或仅提示

只输出 JSON，不要其他文字。`;

    try {
      const result = await container.textProvider.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 1024,
      });

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || "AI 分析失败：textProvider 未返回结果",
        };
      }

      const text = result.data.text?.trim() ?? "";

      // 尝试解析 JSON（兼容模型可能包裹 markdown 代码块的情况）
      let parsed: {
        possibleCauses?: string[];
        suggestedFixes?: string[];
        severity?: string;
      } | null = null;

      try {
        // 直接解析
        parsed = JSON.parse(text);
      } catch {
        // 尝试提取 ```json ... ``` 块
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          try {
            parsed = JSON.parse(match[1]!.trim());
          } catch {
            // ignore
          }
        }
      }

      if (!parsed) {
        // 解析失败，把原始文本作为单一原因返回
        return {
          success: true,
          data: {
            possibleCauses: [text.slice(0, 500) || "无法解析 AI 输出"],
            suggestedFixes: [],
            severity: "medium" as const,
            rawOutput: text,
          },
        };
      }

      const possibleCauses = Array.isArray(parsed.possibleCauses)
        ? parsed.possibleCauses.map(String)
        : [];
      const suggestedFixes = Array.isArray(parsed.suggestedFixes)
        ? parsed.suggestedFixes.map(String)
        : [];
      const severityRaw = String(parsed.severity ?? "medium").toLowerCase();
      const severity: "low" | "medium" | "high" =
        severityRaw === "low" || severityRaw === "high" ? severityRaw : "medium";

      return {
        success: true,
        data: {
          possibleCauses,
          suggestedFixes,
          severity,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `诊断错误失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 自动修复常见错误 */
export const autoFixTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_fix",
      description:
        "自动修复常见错误。按 errorType 执行对应修复策略：" +
        "api_connection（测试连接）、api_auth（提示检查 key）、quota_exceeded（提示检查配额）、" +
        "model_not_found（列出可用模型）、rate_limit（提示等待）、unknown（调用 diagnose_error）。" +
        "返回是否已修复、执行的修复操作、修复结果说明。",
      parameters: {
        type: "object",
        properties: {
          errorType: {
            type: "string",
            enum: ["api_connection", "api_auth", "quota_exceeded", "model_not_found", "rate_limit", "unknown"],
            description: "错误类型",
          },
          context: {
            type: "object",
            description: "上下文（可选，含 errorMessage / providerId / capability 等）",
            properties: {
              errorMessage: { type: "string", maxLength: 2000 },
              providerId: { type: "string", maxLength: 200 },
              capability: { type: "string", enum: ["text", "image", "vision", "video"] },
            },
          },
        },
        required: ["errorType"],
      },
    },
  },
  domain: "diagnostic",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args, ctx) {
    const errorType = String(args.errorType) as
      | "api_connection"
      | "api_auth"
      | "quota_exceeded"
      | "model_not_found"
      | "rate_limit"
      | "unknown";
    const context = (args.context ?? {}) as {
      errorMessage?: string;
      providerId?: string;
      capability?: "text" | "image" | "vision" | "video";
    };

    try {
      switch (errorType) {
        case "api_connection": {
          ctx.onProgress?.("正在测试 API 连接...");
          const { testConnection } = await import("@/shared/api-config");
          const capability = context.capability ?? "text";
          const result = await testConnection(capability, context.providerId);
          return {
            success: true,
            data: {
              fixed: result.success,
              action: `testConnection(${capability})`,
              message: result.success
                ? "连接已恢复，API 可正常访问"
                : `连接测试仍失败：${result.message}。建议检查网络、API URL 和密钥配置。`,
            },
          };
        }

        case "api_auth": {
          ctx.onProgress?.("正在验证 API key...");
          const { testConnection } = await import("@/shared/api-config");
          const capability = context.capability ?? "text";
          if (!context.providerId) {
            return {
              success: true,
              data: {
                fixed: false,
                action: "validate_api_key (skipped: providerId missing)",
                message:
                  "未提供 providerId，无法自动验证。建议用户调用 validate_api_key 工具，或检查 API 配置中的密钥是否正确。",
              },
            };
          }
          const result = await testConnection(capability, context.providerId);
          return {
            success: true,
            data: {
              fixed: result.success,
              action: `validate_api_key(${context.providerId})`,
              message: result.success
                ? "API key 验证通过，鉴权正常"
                : `API key 验证失败：${result.message}。建议用户重新配置正确的 API key。`,
            },
          };
        }

        case "quota_exceeded": {
          // 配额超限无法自动修复，给出明确指引
          return {
            success: true,
            data: {
              fixed: false,
              action: "suggest_check_quota",
              message:
                "API 配额已超限，无法自动修复。建议用户登录 provider 控制台查看配额使用情况，" +
                "升级套餐或等待配额重置后再试。",
            },
          };
        }

        case "model_not_found": {
          ctx.onProgress?.("正在列出可用模型...");
          const { loadConfig } = await import("@/shared/api-config");
          const config = await loadConfig();
          const availableModels = config.providers.flatMap((p) =>
            (p.models ?? []).map((m) => ({
              providerId: p.id,
              providerName: p.name,
              modelId: m.id,
              modelName: m.name,
              capabilities: m.capabilities,
            })),
          );
          return {
            success: true,
            data: {
              fixed: false,
              action: "list_available_models",
              message:
                availableModels.length > 0
                  ? `已列出可用模型（共 ${availableModels.length} 个）。建议用户从中选择一个正确的模型 ID 重新配置。`
                  : "未找到任何已配置的模型。建议用户调用 configure_api_provider 工具配置新 provider 和模型。",
              availableModels,
            },
          };
        }

        case "rate_limit": {
          return {
            success: true,
            data: {
              fixed: false,
              action: "suggest_wait",
              message:
                "触发 API 限流，无法自动修复。建议用户等待一段时间后重试，" +
                "或降低请求频率。如频繁触发限流，建议升级 provider 套餐或更换 provider。",
            },
          };
        }

        case "unknown":
        default: {
          ctx.onProgress?.("未知错误类型，调用 AI 诊断...");
          const errorMessage = context.errorMessage || "未知错误";
          // 复用 diagnose_error 逻辑
          const result = await diagnoseErrorTool.execute(
            { errorMessage, errorContext: context },
            ctx,
          );
          if (!result.success) {
            return {
              success: true,
              data: {
                fixed: false,
                action: "diagnose_error (failed)",
                message: `自动诊断失败：${result.error}`,
              },
            };
          }
          return {
            success: true,
            data: {
              fixed: false,
              action: "diagnose_error",
              message: "已调用 AI 诊断，请查看诊断结果。",
              diagnosis: result.data,
            },
          };
        }
      }
    } catch (e) {
      return {
        success: false,
        error: `自动修复失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 系统健康检查（全面诊断） */
export const diagnoseSystemHealthTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "diagnose_system_health",
      description:
        "系统健康检查（全面诊断）。检查 API 配置状态、磁盘空间、视频任务状态、缓存目录。" +
        "depth=quick（仅 API）/ standard（API + 磁盘 + 任务）/ thorough（全部 + 缓存）。" +
        "返回 overallHealth（healthy/warning/critical）和 checks 列表。",
      parameters: {
        type: "object",
        properties: {
          depth: {
            type: "string",
            enum: ["quick", "standard", "thorough"],
            description: "检查深度，默认 standard",
            default: "standard",
          },
        },
      },
    },
  },
  domain: "diagnostic",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const depth = String(args.depth || "standard") as "quick" | "standard" | "thorough";

    type Check = {
      name: string;
      status: "healthy" | "warning" | "critical";
      message: string;
      detail?: unknown;
    };
    const checks: Check[] = [];

    // 1. 检查 API 配置状态
    try {
      const { checkConfigStatus } = await import("@/shared/api-config");
      const status = await checkConfigStatus();
      const caps = ["text", "image", "vision", "video"] as const;
      const configured = caps.filter((c) => status.capabilities[c]?.configured);
      const missing = caps.filter((c) => !status.capabilities[c]?.configured);

      if (missing.length === 0) {
        checks.push({
          name: "api_config",
          status: "healthy",
          message: "所有能力（text/image/vision/video）均已配置",
          detail: { configured: configured.length, missing: [] },
        });
      } else if (configured.length === 0) {
        checks.push({
          name: "api_config",
          status: "critical",
          message: `未配置任何 API 能力（缺失：${missing.join("/")}）`,
          detail: { configured: 0, missing },
        });
      } else {
        checks.push({
          name: "api_config",
          status: "warning",
          message: `部分能力未配置：${missing.join("/")}`,
          detail: { configured: configured.length, missing },
        });
      }
    } catch (e) {
      checks.push({
        name: "api_config",
        status: "critical",
        message: `检查 API 配置失败：${e instanceof Error ? e.message : String(e)}`,
      });
    }

    if (depth !== "quick") {
      // 2. 检查磁盘空间
      try {
        const { getCacheDirectory, getDiskSpace } = await import("@/shared/file-http");
        const cacheResult = await getCacheDirectory();
        if (cacheResult?.success && cacheResult.path) {
          const disk = await getDiskSpace(cacheResult.path);
          if (disk?.success && disk.availableBytes !== undefined && disk.totalBytes !== undefined) {
            const ratio = disk.availableBytes / disk.totalBytes;
            const availableGB = (disk.availableBytes / 1024 / 1024 / 1024).toFixed(2);
            const totalGB = (disk.totalBytes / 1024 / 1024 / 1024).toFixed(2);
            if (ratio < 0.05) {
              checks.push({
                name: "disk_space",
                status: "critical",
                message: `磁盘空间严重不足：可用 ${availableGB} GB / 总 ${totalGB} GB（< 5%）`,
                detail: { availableBytes: disk.availableBytes, totalBytes: disk.totalBytes },
              });
            } else if (ratio < 0.15) {
              checks.push({
                name: "disk_space",
                status: "warning",
                message: `磁盘空间较低：可用 ${availableGB} GB / 总 ${totalGB} GB`,
                detail: { availableBytes: disk.availableBytes, totalBytes: disk.totalBytes },
              });
            } else {
              checks.push({
                name: "disk_space",
                status: "healthy",
                message: `磁盘空间充足：可用 ${availableGB} GB / 总 ${totalGB} GB`,
                detail: { availableBytes: disk.availableBytes, totalBytes: disk.totalBytes },
              });
            }
          } else {
            checks.push({
              name: "disk_space",
              status: "warning",
              message: disk?.error || "无法获取磁盘空间信息",
            });
          }
        } else {
          checks.push({
            name: "disk_space",
            status: "warning",
            message: cacheResult?.error || "无法获取缓存目录",
          });
        }
      } catch (e) {
        checks.push({
          name: "disk_space",
          status: "warning",
          message: `检查磁盘空间失败：${e instanceof Error ? e.message : String(e)}`,
        });
      }

      // 3. 检查视频任务状态
      try {
        const storage = container.videoTaskStorage;
        const allTasks = await storage.getVideoTasks();
        const active = allTasks.filter(
          (t) => t.status === "pending" || t.status === "generating" || t.status === "retrying",
        ).length;
        const failed = allTasks.filter(
          (t) => t.status === "failed" || t.status === "timeout",
        ).length;

        if (failed > 5) {
          checks.push({
            name: "video_tasks",
            status: "warning",
            message: `视频任务存在较多失败（${failed} 个失败 / ${active} 个活跃 / 共 ${allTasks.length} 个）`,
            detail: { active, failed, total: allTasks.length },
          });
        } else {
          checks.push({
            name: "video_tasks",
            status: "healthy",
            message: `视频任务状态正常（${active} 个活跃 / ${failed} 个失败 / 共 ${allTasks.length} 个）`,
            detail: { active, failed, total: allTasks.length },
          });
        }
      } catch (e) {
        checks.push({
          name: "video_tasks",
          status: "warning",
          message: `检查视频任务失败：${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    if (depth === "thorough") {
      // 4. 检查缓存目录可用性（thorough 才查）
      try {
        const { getCacheDirectory, fileExists } = await import("@/shared/file-http");
        const cacheResult = await getCacheDirectory();
        if (cacheResult?.success && cacheResult.path) {
          const exists = await fileExists(cacheResult.path);
          checks.push({
            name: "cache_directory",
            status: exists ? "healthy" : "warning",
            message: exists
              ? `缓存目录可访问：${cacheResult.path}`
              : `缓存目录不存在或不可访问：${cacheResult.path}`,
            detail: { path: cacheResult.path, exists },
          });
        } else {
          checks.push({
            name: "cache_directory",
            status: "warning",
            message: cacheResult?.error || "无法获取缓存目录",
          });
        }
      } catch (e) {
        checks.push({
          name: "cache_directory",
          status: "warning",
          message: `检查缓存目录失败：${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    // 计算总体健康状态
    const hasCritical = checks.some((c) => c.status === "critical");
    const hasWarning = checks.some((c) => c.status === "warning");
    const overallHealth: "healthy" | "warning" | "critical" = hasCritical
      ? "critical"
      : hasWarning
        ? "warning"
        : "healthy";

    return {
      success: true,
      data: {
        overallHealth,
        depth,
        checks,
        summary: {
          total: checks.length,
          healthy: checks.filter((c) => c.status === "healthy").length,
          warning: checks.filter((c) => c.status === "warning").length,
          critical: checks.filter((c) => c.status === "critical").length,
        },
      },
    };
  },
};

/** 回滚操作（当前优雅降级） */
export const rollbackTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "rollback",
      description:
        "回滚操作（当前为优雅降级模式）。当前项目无完整版本控制系统：" +
        "story 类型在删除前会自动备份（saveVersion），可查询备份版本；" +
        "character/scene/video_task 类型当前不支持回滚，建议手动修复。" +
        "返回 rolledBack（是否已回滚）和 message（提示信息）。",
      parameters: {
        type: "object",
        properties: {
          targetType: {
            type: "string",
            enum: ["character", "scene", "story", "video_task"],
            description: "回滚目标类型",
          },
          targetId: { type: "string", description: "目标 ID（必填）", maxLength: 100 },
          backupPoint: { type: "number", description: "备份点时间戳（Unix 毫秒，可选，当前未使用）" },
        },
        required: ["targetType", "targetId"],
      },
    },
  },
  domain: "diagnostic",
  dangerLevel: "destructive",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const targetType = String(args.targetType) as
      | "character"
      | "scene"
      | "story"
      | "video_task";
    const targetId = String(args.targetId);
    const backupPoint = args.backupPoint ? Number(args.backupPoint) : undefined;

    if (targetType === "story") {
      // story 有 saveVersion 备份机制，可查询历史版本
      try {
        const storyStorage = container.storyStorage;
        const existing = await storyStorage.getStoryById(targetId);
        if (!existing) {
          return {
            success: true,
            data: {
              rolledBack: false,
              message: `故事 ${targetId} 不存在（可能已被删除）。可查询历史版本以恢复。`,
            },
          };
        }

        // 查询历史版本
        const versionStorage = container.versionStorage;
        const versions = await versionStorage.getStoryVersions<{
          id: string;
          timestamp: number;
          changeSummary?: string;
          autoSaved?: boolean;
        }>(targetId);

        let filteredVersions = versions;
        if (backupPoint !== undefined && !Number.isNaN(backupPoint)) {
          // versionStorage timestamp 为 Unix 秒
          const backupPointSec = Math.floor(backupPoint / 1000);
          filteredVersions = versions.filter((v) => v.timestamp <= backupPointSec);
        }

        if (filteredVersions.length === 0) {
          return {
            success: true,
            data: {
              rolledBack: false,
              message:
                `故事 ${targetId}（"${existing.title}"）存在，但未找到匹配的备份版本。` +
                "当前项目不支持自动回滚，建议手动编辑故事内容。",
            },
          };
        }

        return {
          success: true,
          data: {
            rolledBack: false,
            message:
              `故事 ${targetId}（"${existing.title}"）存在 ${versions.length} 个历史版本` +
              (backupPoint ? `（其中 ${filteredVersions.length} 个早于备份点）` : "") +
              "。当前项目无自动回滚 API，建议用户从版本列表中选择目标版本，手动恢复故事内容。",
            availableVersions: filteredVersions.slice(0, 10).map((v) => ({
              versionId: v.id,
              timestamp: v.timestamp * 1000,
              changeSummary: v.changeSummary,
              autoSaved: v.autoSaved,
            })),
            targetExists: true,
          },
        };
      } catch (e) {
        return {
          success: false,
          error: `查询故事备份版本失败：${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    // 其他类型：优雅降级
    const typeLabels: Record<string, string> = {
      character: "角色",
      scene: "场景",
      video_task: "视频任务",
    };
    return {
      success: true,
      data: {
        rolledBack: false,
        message:
          `${typeLabels[targetType] ?? targetType}（ID: ${targetId}）当前不支持自动回滚。` +
          "建议手动修复：可通过 list_/get_ 工具查看当前状态，必要时重新创建或更新。",
        targetType,
        targetId,
      },
    };
  },
};

/** 导出所有诊断工具 */
export const diagnosticTools: ToolImpl[] = [
  diagnoseErrorTool,
  autoFixTool,
  diagnoseSystemHealthTool,
  rollbackTool,
];
