/**
 * 视频任务管理工具（Video Tools）
 *
 * 包含工具：
 * - create_video_task：创建视频生成任务（直接创建，不依赖故事/分镜）
 * - list_video_tasks：查询视频任务列表（支持状态/故事过滤 + 分页）
 * - get_video_task：获取视频任务详情
 * - query_video_status：向 provider 实时查询任务状态并同步本地存储
 * - cancel_video_task：取消视频任务（需用户确认）
 * - recover_video_task：恢复失败/超时任务（可选重新提交生成）
 * - batch_create_video_tasks：批量创建视频任务（多分镜一次性提交）
 *
 * 设计要点：
 * - 通过 DI container 获取 videoProvider / videoTaskStorage（非 React hook）
 * - 工具层不依赖 useVideoTaskCommands，直接操作 storage + provider
 * - ApiResponse 模式：{ success, data?, error? }
 * - VideoTask 字段映射：firstFrameUrl→fixedImageUrl，modelId→providerModelId，error→message
 * - 列表返回精简字段并截断 prompt（避免 token 浪费）
 * - batch_create_video_tasks 处理部分失败（一个失败不影响其他）
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { container } from "@/infrastructure/di";
import type { VideoTask } from "@/domain/schemas";

// ============= 辅助函数 =============

/** 截断 prompt 到指定长度，避免 token 浪费 */
function truncatePrompt(prompt: string | undefined, maxLen = 100): string | undefined {
  if (!prompt) return undefined;
  return prompt.length > maxLen ? `${prompt.slice(0, maxLen)}…` : prompt;
}

/** 将 VideoTask 映射为列表精简项 */
function toListItem(task: VideoTask) {
  return {
    taskId: task.taskId,
    prompt: truncatePrompt(task.prompt),
    status: task.status,
    progress: task.progress,
    createdAt: task.createdAt,
    videoUrl: task.videoUrl,
    storyId: task.storyId,
    beatId: task.beatId,
  };
}

// ============= 工具实现 =============

/** 创建视频生成任务（直接创建，不依赖故事/分镜） */
export const createVideoTaskTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "create_video_task",
      description:
        "创建视频生成任务（直接提交到视频 provider，不依赖故事/分镜）。" +
        "支持指定首帧/尾帧 URL、角色引用、场景引用、时长等参数。" +
        "适用于：用户要求「生成一段视频」、「用这个画面生成视频」等独立视频生成场景。" +
        "注意：视频生成可能耗时较长（数分钟到数十分钟），任务提交后可通过 query_video_status 轮询状态。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            maxLength: 5000,
            description: "视频生成提示词（必填）。描述期望的画面内容、镜头运动、动作等。",
          },
          firstFrameUrl: {
            type: "string",
            maxLength: 2048,
            description: "首帧图片 URL。若提供，视频将从该帧开始生成。",
          },
          lastFrameUrl: {
            type: "string",
            maxLength: 2048,
            description: "尾帧图片 URL。若提供，视频将结束于该帧。",
          },
          characterRef: {
            type: "string",
            maxLength: 100,
            description: "角色 ID（用于角色一致性引用）。",
          },
          sceneRef: {
            type: "string",
            maxLength: 100,
            description: "场景 ID（用于场景一致性引用）。",
          },
          duration: {
            type: "number",
            minimum: 1,
            maximum: 600,
            description: "视频时长（秒）。",
          },
          providerId: { type: "string", maxLength: 100, description: "指定视频生成 provider ID（覆盖默认）" },
          modelId: { type: "string", maxLength: 100, description: "指定视频生成 model ID（覆盖默认）" },
          storyId: { type: "string", maxLength: 100, description: "关联的故事 ID（可选，便于按故事过滤）" },
          beatId: { type: "string", maxLength: 100, description: "关联的分镜 ID（可选，便于按分镜过滤）" },
        },
        required: ["prompt"],
      },
    },
  },
  domain: "video",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args) {
    const prompt = String(args.prompt);
    if (!prompt.trim()) {
      return { success: false, error: "prompt 不能为空" };
    }

    const firstFrameUrl = args.firstFrameUrl ? String(args.firstFrameUrl) : undefined;
    const lastFrameUrl = args.lastFrameUrl ? String(args.lastFrameUrl) : undefined;
    const characterRef = args.characterRef ? String(args.characterRef) : undefined;
    const sceneRef = args.sceneRef ? String(args.sceneRef) : undefined;
    const duration = args.duration != null ? Number(args.duration) : undefined;
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;
    const storyId = args.storyId ? String(args.storyId) : undefined;
    const beatId = args.beatId ? String(args.beatId) : undefined;

    // 1. 调用视频 provider 提交生成请求
    const result = await container.videoProvider.generateVideoWithFrames({
      prompt,
      firstFrameUrl,
      lastFrameUrl,
      characterRef,
      sceneRef,
      duration,
      providerId,
      modelId,
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || "视频生成请求失败" };
    }

    const providerData = result.data;
    const taskId = providerData.taskId;
    if (!taskId) {
      return { success: false, error: "provider 未返回 taskId" };
    }

    // 2. 持久化任务记录到本地存储
    // VideoTask 字段映射：firstFrameUrl→fixedImageUrl（遵循现有模式）
    // 非直接字段的参数存入 parameters
    const nowIso = new Date().toISOString();
    const parameters: Record<string, unknown> = {};
    if (lastFrameUrl) parameters.lastFrameUrl = lastFrameUrl;
    if (duration != null) parameters.duration = duration;
    if (characterRef) parameters.characterRef = characterRef;
    if (sceneRef) parameters.sceneRef = sceneRef;

    const taskRecord: Partial<VideoTask> & { taskId: string } = {
      taskId,
      status: (providerData.status as VideoTask["status"]) || "pending",
      progress: 0,
      message: "任务已提交",
      createdAt: nowIso,
      updatedAt: nowIso,
      prompt,
      fixedImageUrl: firstFrameUrl,
      providerId: providerData.providerId || providerId,
      providerModelId: providerData.providerModelId || modelId,
      providerFormat: providerData.providerFormat,
      storyId,
      beatId,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      promptWasTruncated: providerData.promptWasTruncated,
    };

    try {
      await container.videoTaskStorage.createVideoTask(taskRecord);
    } catch (e) {
      // 持久化失败不阻断返回（任务已在 provider 侧创建，可通过 taskId 查询）
      // 返回成功但附带警告
      return {
        success: true,
        data: {
          taskId,
          status: taskRecord.status,
          videoUrl: providerData.videoUrl,
          warning: `任务已提交但本地存储失败：${e instanceof Error ? e.message : String(e)}`,
        },
      };
    }

    return {
      success: true,
      data: {
        taskId,
        status: taskRecord.status,
        videoUrl: providerData.videoUrl,
      },
    };
  },
};

/** 查询视频任务列表（支持状态/故事过滤 + 分页） */
export const listVideoTasksTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_video_tasks",
      description:
        "查询视频任务列表。支持按状态、故事 ID 过滤，可分页。" +
        "返回精简字段（taskId/prompt(截断100字符)/status/progress/createdAt/videoUrl/storyId/beatId）。" +
        "适用于：用户要求「列出视频任务」、「查看有哪些视频任务」、「查看失败的任务」等场景。",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "generating", "completed", "failed", "cancelled", "retrying", "timeout", "all"],
            description: "按状态过滤，默认 all（返回所有状态）",
            default: "all",
          },
          storyId: { type: "string", description: "按故事 ID 过滤（可选）" },
          limit: { type: "number", description: "返回数量上限，默认 20，最大 100", default: 20 },
          offset: { type: "number", description: "偏移量（分页），默认 0", default: 0 },
        },
      },
    },
  },
  domain: "video",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const storage = container.videoTaskStorage;
    const status = args.status ? String(args.status) : "all";
    const storyId = args.storyId ? String(args.storyId) : undefined;

    // 优先按 storyId 过滤（故事维度查询更有意义）
    // 若同时指定 storyId 和 status，先按故事取再在内存过滤状态
    let tasks: VideoTask[];
    if (storyId) {
      tasks = await storage.getVideoTasksByStory(storyId);
      if (status !== "all") {
        tasks = tasks.filter((t) => t.status === status);
      }
    } else if (status !== "all") {
      tasks = await storage.getVideoTasksByStatus(status);
    } else {
      tasks = await storage.getVideoTasks();
    }

    // 按创建时间倒序（最新的在前）
    tasks.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    });

    const offset = Math.max(0, Number(args.offset) || 0);
    const limit = Math.min(Number(args.limit) || 20, 100);
    const paged = tasks.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        total: tasks.length,
        offset,
        limit,
        items: paged.map(toListItem),
      },
    };
  },
};

/** 获取视频任务详情 */
export const getVideoTaskTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_video_task",
      description:
        "获取视频任务完整详情（含 prompt、provider 信息、参数、错误信息等所有字段）。" +
        "适用于：用户要求「查看这个视频任务的详情」、「这个任务为什么失败了」等场景。",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "视频任务 ID（必填）" },
        },
        required: ["taskId"],
      },
    },
  },
  domain: "video",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const taskId = String(args.taskId);
    const storage = container.videoTaskStorage;
    const task = await storage.getVideoTaskById(taskId);
    if (!task) {
      return { success: false, error: `视频任务不存在：${taskId}` };
    }
    return { success: true, data: task };
  },
};

/** 查询视频任务状态（向 provider 实时查询并同步本地存储） */
export const queryVideoStatusTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "query_video_status",
      description:
        "向视频 provider 实时查询任务状态，并同步更新本地存储。" +
        "若任务已完成，会自动保存 videoUrl 到本地。" +
        "适用于：用户要求「查看视频生成进度」、「视频好了吗」、「刷新任务状态」等场景。" +
        "注意：本地存储的任务状态可能滞后，此工具会获取 provider 端的最新状态。",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "视频任务 ID（必填）" },
          providerId: { type: "string", description: "指定 provider ID（覆盖任务存储的值）" },
          modelId: { type: "string", description: "指定 model ID（覆盖任务存储的值）" },
        },
        required: ["taskId"],
      },
    },
  },
  domain: "video",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const taskId = String(args.taskId);
    const storage = container.videoTaskStorage;

    // 1. 从本地获取任务
    const task = await storage.getVideoTaskById(taskId);
    if (!task) {
      return { success: false, error: `视频任务不存在：${taskId}` };
    }

    // 2. 向 provider 实时查询（参数优先级：args > task 存储值）
    const providerId = args.providerId ? String(args.providerId) : task.providerId;
    const modelId = args.modelId ? String(args.modelId) : task.providerModelId;
    const format = task.providerFormat;

    const result = await container.videoProvider.queryVideoStatus(taskId, {
      providerId,
      modelId,
      format,
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || "查询视频状态失败" };
    }

    const statusData = result.data;

    // 3. 状态变化时更新本地存储
    const updates: Partial<VideoTask> = {
      status: statusData.status as VideoTask["status"],
      progress: statusData.progress ?? task.progress,
      lastPolledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (statusData.videoUrl) {
      updates.videoUrl = statusData.videoUrl;
    }
    if (statusData.message) {
      updates.message = statusData.message;
    }

    try {
      await storage.updateVideoTask(taskId, updates);
    } catch {
      // 存储更新失败不阻断返回最新状态
    }

    return {
      success: true,
      data: {
        taskId,
        status: statusData.status,
        progress: updates.progress,
        videoUrl: statusData.videoUrl ?? task.videoUrl,
        message: statusData.message,
      },
    };
  },
};

/** 取消视频任务（需用户确认） */
export const cancelVideoTaskTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "cancel_video_task",
      description:
        "取消视频生成任务。会尝试通知 provider 取消服务端任务（best-effort），并将本地任务状态更新为 cancelled。" +
        "注意：此操作不可逆，已完成的视频无法取消。" +
        "适用于：用户要求「取消这个视频任务」、「不要生成这个视频了」等场景。",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", maxLength: 100, description: "要取消的视频任务 ID（必填）" },
        },
        required: ["taskId"],
      },
    },
  },
  domain: "video",
  requiresConfirmation: true,
  dangerLevel: "destructive",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const taskId = String(args.taskId);
    const storage = container.videoTaskStorage;

    // 1. 获取任务确认存在
    const task = await storage.getVideoTaskById(taskId);
    if (!task) {
      return { success: false, error: `视频任务不存在：${taskId}` };
    }

    // 已完成/已取消的任务不能取消
    if (task.status === "completed") {
      return { success: false, error: "任务已完成，无法取消" };
    }
    if (task.status === "cancelled") {
      return { success: false, error: "任务已被取消" };
    }

    // 2. 调用 provider 取消（best-effort，失败不阻断）
    let providerCancelled = false;
    try {
      await container.videoProvider.cancelTask?.(taskId);
      providerCancelled = true;
    } catch {
      // provider 取消失败仍更新本地状态
    }

    // 3. 更新本地状态
    try {
      await storage.updateVideoTask(taskId, {
        status: "cancelled",
        message: "用户取消",
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      return {
        success: false,
        error: `本地状态更新失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    return {
      success: true,
      data: {
        taskId,
        status: "cancelled",
        providerCancelled,
      },
    };
  },
};

/** 恢复失败/超时的视频任务 */
export const recoverVideoTaskTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "recover_video_task",
      description:
        "恢复失败或超时的视频任务。" +
        "retry=false（默认）：仅将状态重置为 pending，等待轮询重新查询 provider 端状态。" +
        "retry=true：用相同参数重新提交生成请求，创建新任务（旧任务保留）。" +
        "适用于：用户要求「重试这个失败的视频任务」、「恢复这个任务」等场景。",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "要恢复的视频任务 ID（必填）" },
          retry: {
            type: "boolean",
            description: "是否重新提交生成请求。false=仅恢复状态等待轮询，true=用相同参数重新生成。默认 false。",
            default: false,
          },
        },
        required: ["taskId"],
      },
    },
  },
  domain: "video",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const taskId = String(args.taskId);
    const retry = args.retry === true;
    const storage = container.videoTaskStorage;

    // 1. 获取任务并确认状态
    const task = await storage.getVideoTaskById(taskId);
    if (!task) {
      return { success: false, error: `视频任务不存在：${taskId}` };
    }

    if (!["failed", "timeout", "cancelled"].includes(task.status)) {
      return {
        success: false,
        error: `任务状态为 ${task.status}，无法恢复（仅 failed/timeout/cancelled 状态可恢复）`,
      };
    }

    // 2a. retry=false：仅重置状态为 pending，等待轮询
    if (!retry) {
      try {
        await storage.updateVideoTask(taskId, {
          status: "pending",
          message: "用户恢复，等待重新轮询",
          recoveryAttempts: (task.recoveryAttempts || 0) + 1,
          pollFailureCount: 0,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        return {
          success: false,
          error: `恢复失败：${e instanceof Error ? e.message : String(e)}`,
        };
      }

      return {
        success: true,
        data: {
          taskId,
          status: "pending",
          retry: false,
          message: "任务已恢复为 pending，等待轮询",
        },
      };
    }

    // 2b. retry=true：用相同参数重新提交生成
    // 从 task 重建 provider 调用参数
    const params = task.parameters || {};
    const result = await container.videoProvider.generateVideoWithFrames({
      prompt: task.prompt || "",
      firstFrameUrl: task.fixedImageUrl,
      lastFrameUrl: params.lastFrameUrl as string | undefined,
      characterRef: params.characterRef as string | undefined,
      sceneRef: params.sceneRef as string | undefined,
      duration: params.duration as number | undefined,
      providerId: task.providerId,
      modelId: task.providerModelId,
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || "重新提交生成请求失败" };
    }

    const newTaskId = result.data.taskId;
    if (!newTaskId) {
      return { success: false, error: "provider 未返回新 taskId" };
    }

    // 创建新任务记录
    const nowIso = new Date().toISOString();
    const newTaskRecord: Partial<VideoTask> & { taskId: string } = {
      taskId: newTaskId,
      status: (result.data.status as VideoTask["status"]) || "pending",
      progress: 0,
      message: "用户重试，已重新提交",
      createdAt: nowIso,
      updatedAt: nowIso,
      prompt: task.prompt,
      fixedImageUrl: task.fixedImageUrl,
      providerId: result.data.providerId || task.providerId,
      providerModelId: result.data.providerModelId || task.providerModelId,
      providerFormat: result.data.providerFormat || task.providerFormat,
      storyId: task.storyId,
      storyTitle: task.storyTitle,
      beatId: task.beatId,
      beatTitle: task.beatTitle,
      parameters: task.parameters,
      recoveryAttempts: 0,
    };

    try {
      await storage.createVideoTask(newTaskRecord);
    } catch (e) {
      return {
        success: false,
        error: `新任务已提交但本地存储失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    return {
      success: true,
      data: {
        taskId: newTaskId,
        oldTaskId: taskId,
        status: newTaskRecord.status,
        retry: true,
        message: "已用相同参数重新提交生成请求",
      },
    };
  },
};

/** 批量创建视频任务（多分镜一次性提交） */
export const batchCreateVideoTasksTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "batch_create_video_tasks",
      description:
        "批量创建视频任务（多分镜一次性提交）。遍历任务列表逐个提交，收集结果。" +
        "支持部分失败：单个任务提交失败不会中断后续任务。" +
        "适用于：用户要求「一次性生成所有分镜的视频」、「批量生成视频」等场景。" +
        "注意：每个任务都会单独调用 provider，耗时较长。",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "任务列表（必填，最多 10 个）。每个元素包含 prompt（必填）和可选的 firstFrameUrl/lastFrameUrl/storyId/beatId/duration。",
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                prompt: { type: "string", description: "视频生成提示词（必填）" },
                firstFrameUrl: { type: "string", description: "首帧图片 URL" },
                lastFrameUrl: { type: "string", description: "尾帧图片 URL" },
                storyId: { type: "string", description: "关联的故事 ID" },
                beatId: { type: "string", description: "关联的分镜 ID" },
                duration: { type: "number", description: "视频时长（秒）" },
              },
              required: ["prompt"],
            },
          },
          providerId: { type: "string", maxLength: 100, description: "指定视频生成 provider ID（应用于所有任务）" },
          modelId: { type: "string", maxLength: 100, description: "指定视频生成 model ID（应用于所有任务）" },
        },
        required: ["tasks"],
      },
    },
  },
  domain: "video",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args) {
    const tasksInput = args.tasks;
    if (!Array.isArray(tasksInput) || tasksInput.length === 0) {
      return { success: false, error: "tasks 必须是非空数组" };
    }
    if (tasksInput.length > 10) {
      return { success: false, error: `tasks 数量超限（最多 10 个，实际 ${tasksInput.length} 个）。请分批提交。` };
    }

    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;
    const storage = container.videoTaskStorage;

    const created: Array<{ taskId: string; beatId?: string; status: string }> = [];
    const failed: Array<{ beatId?: string; error: string }> = [];

    // 逐个提交（避免并发过多导致 provider 限流）
    for (const item of tasksInput) {
      const prompt = item?.prompt ? String(item.prompt) : "";
      const beatId = item?.beatId ? String(item.beatId) : undefined;
      const storyId = item?.storyId ? String(item.storyId) : undefined;

      if (!prompt.trim()) {
        failed.push({ beatId, error: "prompt 为空" });
        continue;
      }

      const firstFrameUrl = item?.firstFrameUrl ? String(item.firstFrameUrl) : undefined;
      const lastFrameUrl = item?.lastFrameUrl ? String(item.lastFrameUrl) : undefined;
      const duration = item?.duration != null ? Number(item.duration) : undefined;

      try {
        const result = await container.videoProvider.generateVideoWithFrames({
          prompt,
          firstFrameUrl,
          lastFrameUrl,
          duration,
          providerId,
          modelId,
        });

        if (!result.success || !result.data) {
          failed.push({ beatId, error: result.error || "视频生成请求失败" });
          continue;
        }

        const taskId = result.data.taskId;
        if (!taskId) {
          failed.push({ beatId, error: "provider 未返回 taskId" });
          continue;
        }

        // 持久化任务记录
        const nowIso = new Date().toISOString();
        const parameters: Record<string, unknown> = {};
        if (lastFrameUrl) parameters.lastFrameUrl = lastFrameUrl;
        if (duration != null) parameters.duration = duration;

        const taskStatus: VideoTask["status"] = (result.data.status as VideoTask["status"]) || "pending";
        const taskRecord: Partial<VideoTask> & { taskId: string } = {
          taskId,
          status: taskStatus,
          progress: 0,
          message: "批量任务已提交",
          createdAt: nowIso,
          updatedAt: nowIso,
          prompt,
          fixedImageUrl: firstFrameUrl,
          providerId: result.data.providerId || providerId,
          providerModelId: result.data.providerModelId || modelId,
          providerFormat: result.data.providerFormat,
          storyId,
          beatId,
          parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        };

        try {
          await storage.createVideoTask(taskRecord);
        } catch {
          // 持久化失败但仍计入 created（任务已在 provider 侧创建）
        }

        created.push({ taskId, beatId, status: taskStatus });
      } catch (e) {
        failed.push({
          beatId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      success: true,
      data: {
        created,
        failed,
        totalCreated: created.length,
        totalFailed: failed.length,
      },
    };
  },
};

/** 导出所有视频任务工具 */
export const videoTools: ToolImpl[] = [
  createVideoTaskTool,
  listVideoTasksTool,
  getVideoTaskTool,
  queryVideoStatusTool,
  cancelVideoTaskTool,
  recoverVideoTaskTool,
  batchCreateVideoTasksTool,
];
