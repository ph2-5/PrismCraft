import type { VideoTask } from "@/domain/schemas";
import type { DuplicateCheckResult } from "../types/video-recovery-types";

const PROMPT_SIMILARITY_THRESHOLD = 0.85;

export async function checkForDuplicateVideos(
  newTask: Partial<VideoTask>,
  existingTasks: VideoTask[]
): Promise<DuplicateCheckResult> {
  const completedTasks = existingTasks.filter((task) => task.status === "completed" && task.videoUrl);

  if (completedTasks.length === 0) {
    return {
      hasDuplicate: false,
      reason: "没有已完成的任务可供比较",
    };
  }

  for (const existingTask of completedTasks) {
    const similarity = calculateTaskSimilarity(newTask, existingTask);

    if (similarity >= PROMPT_SIMILARITY_THRESHOLD) {
      const reason = generateDuplicateReason(newTask, existingTask, similarity);

      return {
        hasDuplicate: true,
        existingTaskId: existingTask.taskId,
        existingVideoUrl: existingTask.videoUrl,
        similarity,
        reason,
      };
    }
  }

  return {
    hasDuplicate: false,
    reason: "未发现重复任务",
  };
}

function calculateTaskSimilarity(
  task1: Partial<VideoTask>,
  task2: VideoTask
): number {
  let totalWeight = 0;
  let matchedWeight = 0;

  if (task1.prompt && task2.prompt) {
    const promptSimilarity = calculatePromptSimilarity(task1.prompt, task2.prompt);
    totalWeight += 0.4;
    matchedWeight += promptSimilarity * 0.4;
  }

  if (task1.providerId && task2.providerId) {
    totalWeight += 0.2;
    matchedWeight += task1.providerId === task2.providerId ? 0.2 : 0;
  }

  if (task1.providerModelId && task2.providerModelId) {
    totalWeight += 0.2;
    matchedWeight += task1.providerModelId === task2.providerModelId ? 0.2 : 0;
  }

  if (task1.fixedImageUrl && task2.fixedImageUrl) {
    totalWeight += 0.1;
    matchedWeight += task1.fixedImageUrl === task2.fixedImageUrl ? 0.1 : 0;
  }

  if (task1.referenceVideoUrl && task2.referenceVideoUrl) {
    totalWeight += 0.1;
    matchedWeight += task1.referenceVideoUrl === task2.referenceVideoUrl ? 0.1 : 0;
  }

  const paramsSimilarity = calculateParametersSimilarity(
    task1.parameters,
    task2.parameters
  );
  totalWeight += 0.1;
  matchedWeight += paramsSimilarity * 0.1;

  return totalWeight > 0 ? matchedWeight / totalWeight : 0;
}

function calculatePromptSimilarity(prompt1: string, prompt2: string): number {
  const normalized1 = normalizePrompt(prompt1);
  const normalized2 = normalizePrompt(prompt2);

  if (normalized1 === normalized2) {
    return 1.0;
  }

  const words1 = new Set(normalized1.split(/\s+/));
  const words2 = new Set(normalized2.split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  const jaccardSimilarity = intersection.size / union.size;

  const lengthPenalty = Math.min(normalized1.length, normalized2.length) /
    Math.max(normalized1.length, normalized2.length);

  return jaccardSimilarity * 0.7 + lengthPenalty * 0.3;
}

function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateParametersSimilarity(
  params1?: Record<string, unknown>,
  params2?: Record<string, unknown>
): number {
  if (!params1 && !params2) return 1.0;
  if (!params1 || !params2) return 0.0;

  const keys1 = Object.keys(params1);
  const keys2 = Object.keys(params2);

  if (keys1.length === 0 && keys2.length === 0) return 1.0;
  if (keys1.length === 0 || keys2.length === 0) return 0.0;

  let matchCount = 0;
  for (const key of keys1) {
    if (key in params2 && JSON.stringify(params1[key]) === JSON.stringify(params2[key])) {
      matchCount++;
    }
  }

  return matchCount / Math.max(keys1.length, keys2.length);
}

function generateDuplicateReason(
  newTask: Partial<VideoTask>,
  existingTask: VideoTask,
  similarity: number
): string {
  const reasons: string[] = [];

  if (newTask.prompt && existingTask.prompt) {
    const promptSimilarity = calculatePromptSimilarity(newTask.prompt, existingTask.prompt);
    if (promptSimilarity >= 0.9) {
      reasons.push("提示词高度相似");
    } else if (promptSimilarity >= 0.7) {
      reasons.push("提示词相似");
    }
  }

  if (newTask.providerId === existingTask.providerId) {
    reasons.push("使用相同的AI服务商");
  }

  if (newTask.fixedImageUrl === existingTask.fixedImageUrl) {
    reasons.push("使用相同的参考图片");
  }

  if (newTask.referenceVideoUrl === existingTask.referenceVideoUrl) {
    reasons.push("使用相同的参考视频");
  }

  return `相似度 ${(similarity * 100).toFixed(1)}%: ${reasons.join("，") || "参数相似"}`;
}

export function findSimilarTasks(
  task: Partial<VideoTask>,
  allTasks: VideoTask[],
  limit: number = 5
): Array<{ task: VideoTask; similarity: number }> {
  const similarities = allTasks.map((existingTask) => ({
    task: existingTask,
    similarity: calculateTaskSimilarity(task, existingTask),
  }));

  return similarities
    .filter((s) => s.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
