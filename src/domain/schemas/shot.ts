/**
 * SubShot Schema — 单分镜多镜头子实体（Task 4.10）
 *
 * 设计背景：
 *   当前一个 StoryBeat 对应一个镜头。专业创作中，一个分镜（叙事节拍）可能
 *   包含多个镜头切换（如：全景建立场景 → 中景对话 → 特写反应）。
 *   SubShot 作为 StoryBeat 下的子层，支持单分镜多镜头。
 *
 * 与 StoryBeat 的关系：
 *   - StoryBeat 是叙事单位（一个故事节拍）
 *   - SubShot 是镜头单位（一个节拍内的一个镜头）
 *   - 一个 StoryBeat 可包含 1-N 个 SubShot
 *   - SubShot 生成视频后可通过 Task 4.3 的视频合成功能拼接
 */
import { z } from "zod";

export const subShotSchema = z.object({
  id: z.string(),
  storyBeatId: z.string(),
  sequence: z.number(),
  shotType: z.string(),
  cameraMovement: z.string(),
  cameraAngle: z.string(),
  duration: z.number().min(1).max(30),
  description: z.string(),
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  transition: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SubShot = z.infer<typeof subShotSchema>;
