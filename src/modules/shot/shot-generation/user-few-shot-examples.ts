/**
 * 用户分镜示例采集（P3.4：Few-shot 学习机制）。
 *
 * 从当前 story 的分镜（StoryBeat[]）中提取"成品分镜"作为 few-shot 示例，
 * 使后续 AI 规划在生成新分镜时参考用户已经编辑/保留的真实分镜风格，
 * 实现"根据用户编辑自动优化示例"，而非仅依赖代码中写死的内置示例。
 *
 * 设计约束：
 * - 纯函数，零副作用，不修改输入
 * - 只采集内容完整（≥ MIN_CONTENT_LENGTH 字）且镜头参数完整（shotInstruction 存在）的分镜
 * - 按标题+内容前 40 字+景别去重，上限 MAX_USER_EXAMPLES 条
 * - 生成时从 story.beats 实时提取，无需持久化
 */

import type { Story } from "@/domain/schemas";
import type { FewShotExample } from "./dynamic-few-shot";

const MAX_USER_EXAMPLES = 20;
const MIN_CONTENT_LENGTH = 30;

/**
 * 从 story 的 beats 中提取用户分镜示例。
 *
 * @param story 当前 story（其 beats 为已编辑/保留的成品分镜）
 * @returns 提取的 few-shot 示例数组（可能为空）
 */
export function collectUserFewShotExamples(
  story: Partial<Story>,
): FewShotExample[] {
  const beats = story.beats ?? [];
  if (beats.length === 0) return [];

  const genre = story.genre || "drama";
  const tone = story.tone || "neutral";
  const totalBeats = beats.length;
  const seen = new Set<string>();
  const examples: FewShotExample[] = [];

  for (const beat of beats) {
    if (examples.length >= MAX_USER_EXAMPLES) break;

    const shot = beat.shotInstruction;
    const content = (beat.content || beat.description || "").trim();
    if (content.length < MIN_CONTENT_LENGTH || !shot) continue;

    const dedupKey = `${beat.title ?? ""}|${content.slice(0, 40)}|${shot.shotSize}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    examples.push({
      input: {
        genre,
        tone,
        beatIndex: beat.sequence ?? beat.order ?? 0,
        totalBeats,
        shotType: shot.shotSize,
        hasDialogue: beat.type === "dialogue",
        hasAction: beat.type === "action",
      },
      output: {
        title: beat.title || "",
        content,
        shotType: shot.shotSize,
        cameraAngle: shot.cameraAngle || "eye_level",
        cameraMovement: shot.cameraMovement || "static",
        duration: beat.duration ?? 5,
        type: beat.type || "scene",
      },
    });
  }

  return examples;
}
