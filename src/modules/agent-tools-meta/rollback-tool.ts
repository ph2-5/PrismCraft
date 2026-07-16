/**
 * 回滚工具 — rollback
 *
 * 当前为优雅降级模式：
 * - story 类型在删除前会自动备份（saveVersion），可查询备份版本
 * - character/scene/video_task 类型当前不支持回滚，建议手动修复
 *
 * 设计要点：
 * - 采用策略模式：按 targetType 分发到对应策略函数
 * - story 走完整版本查询流程（含 backupPoint 时间过滤）
 * - 其他类型优雅降级，返回提示信息
 *
 * 特权访问声明：本文件通过 DI container 直接访问 storyStorage、versionStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";

type TargetType = "character" | "scene" | "story" | "video_task";

interface RollbackArgs {
  targetType: TargetType;
  targetId: string;
  backupPoint?: number;
}

/** 策略返回结果 */
interface RollbackStrategyResult {
  success: boolean;
  data?: {
    rolledBack: boolean;
    message: string;
    [key: string]: unknown;
  };
  error?: string;
}

/** 策略函数类型 */
type RollbackStrategy = (args: RollbackArgs) => Promise<RollbackStrategyResult>;

// ============= 各 targetType 策略实现 =============

/** story 回滚策略：查询历史版本（当前无自动回滚 API） */
const rollbackStory: RollbackStrategy = async ({ targetId, backupPoint }) => {
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
};

/** 优雅降级策略工厂：用于不支持自动回滚的类型 */
function createGracefulDegradationStrategy(typeLabel: string): RollbackStrategy {
  return async ({ targetType, targetId }) => ({
    success: true,
    data: {
      rolledBack: false,
      message:
        `${typeLabel}（ID: ${targetId}）当前不支持自动回滚。` +
        "建议手动修复：可通过 list_/get_ 工具查看当前状态，必要时重新创建或更新。",
      targetType,
      targetId,
    },
  });
}

/** targetType -> 策略映射 */
const rollbackStrategies: Record<TargetType, RollbackStrategy> = {
  story: rollbackStory,
  character: createGracefulDegradationStrategy("角色"),
  scene: createGracefulDegradationStrategy("场景"),
  video_task: createGracefulDegradationStrategy("视频任务"),
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
    const targetType = String(args.targetType) as TargetType;
    const targetId = String(args.targetId);
    const backupPoint = args.backupPoint ? Number(args.backupPoint) : undefined;

    const strategy = rollbackStrategies[targetType];
    return strategy({ targetType, targetId, backupPoint });
  },
};
