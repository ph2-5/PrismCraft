/**
 * 导演指导文本生成（P3.1：导演规则接入 frame-prompt pipeline）。
 *
 * 在生成首帧/尾帧 prompt 之前，基于 shot instruction 与前后镜头上下文，
 * 调用导演规则引擎（applyDirectorRules）得出镜头决策，并将决策转化为
 * 中文"导演指导"文本注入 prompt，让 180 度规则、动作匹配、高潮强化、
 * 抒情远景、快速节奏直接影响画面描述。
 *
 * 设计约束：
 * - 纯函数，零副作用，不修改传入的 beat
 * - 无 shot instruction 或无可应用规则时返回空字符串（不注入噪音）
 * - 向后兼容：无 directorContext 时仅做保守判断
 */

import type { StoryBeat } from "@/domain/schemas";
import {
  applyDirectorRules,
  type DirectorContext,
  type DirectorShotContract,
  type ShotMovement,
  type ShotSize,
} from "@/shared-logic/director";

/** 与 director-rules 的 DirectorShotContract.shotSize 枚举对齐 */
const SHOT_SIZE_MAP: Record<string, ShotSize> = {
  extreme_close: "extreme_close_up",
  close: "close_up",
  medium: "medium",
  wide: "wide",
  extreme_wide: "extreme_wide",
};

/** 将 shotInstruction.cameraMovement 映射到导演规则的运动枚举 */
const MOVEMENT_MAP: Record<string, ShotMovement> = {
  static: "static",
  push: "tracking",
  pull: "tracking",
  pan: "pan",
  orbit: "tracking",
  crane_up: "tilt",
  crane_down: "tilt",
  tracking: "tracking",
};

const SHOT_SIZE_LABEL: Record<ShotSize, string> = {
  extreme_close_up: "大特写",
  close_up: "特写",
  medium: "中景",
  wide: "全景",
  extreme_wide: "大远景",
};

const MOVEMENT_LABEL: Record<ShotMovement, string> = {
  static: "固定机位",
  pan: "横摇",
  tilt: "俯仰",
  tracking: "跟随",
  dolly: "推拉",
  handheld: "手持",
};

/**
 * 把 StoryBeat 的镜头指令映射为导演规则的镜头契约。
 * 无 shotInstruction 时返回 null。
 */
export function toDirectorShot(beat: StoryBeat): DirectorShotContract | null {
  const shot = beat.shotInstruction;
  if (!shot) return null;
  return {
    shotSize: SHOT_SIZE_MAP[shot.shotSize] ?? "medium",
    movement: MOVEMENT_MAP[shot.cameraMovement] ?? "static",
    lighting: "natural",
    duration: beat.duration ?? 5,
    blocking: beat.content || beat.description || "",
  };
}

export interface DirectorGuidanceOptions {
  /** 同一场景中的前一个镜头（用于 180 度规则 / 动作匹配的连续性） */
  prevBeat?: StoryBeat;
  /** 同一场景中的后一个镜头 */
  nextBeat?: StoryBeat;
  /** 导演上下文（可选；缺失时按保守默认值处理，仅输出镜头参数建议） */
  context?: Partial<Pick<DirectorContext, "beatType" | "emotionIntensity" | "pacing" | "tone">>;
}

/**
 * 生成由情绪/节奏驱动的指导行（高潮强化、抒情远景、快速节奏）。
 */
function buildEmotionGuidanceLines(ctx: DirectorContext): string[] {
  const lines: string[] = [];
  if (ctx.beatType === "climax" || ctx.emotionIntensity > 0.75) {
    lines.push("本镜头为高潮/高情绪段落：建议特写构图、动感运镜（跟随/手持），镜头时长压缩至 4 秒以内，增强情绪冲击力");
  }
  if (ctx.emotionIntensity < 0.3 && ctx.beatType !== "setup") {
    lines.push("本镜头情绪平缓：建议远景、固定机位、延长镜头时长（≥5 秒），营造抒情氛围");
  }
  if (ctx.pacing === "fast" && ctx.emotionIntensity > 0.5) {
    lines.push("整体节奏快速：建议压缩镜头时长、采用跟随运镜，保持叙事紧凑感");
  }
  return lines;
}

/**
 * 对比规则应用前后的镜头参数，生成参数调整建议行。
 */
function buildParamHintLines(applied: DirectorShotContract, before: DirectorShotContract): string[] {
  const hints: string[] = [];
  if (applied.shotSize !== before.shotSize) {
    hints.push(`景别：${SHOT_SIZE_LABEL[applied.shotSize]}`);
  }
  if (applied.movement !== before.movement) {
    hints.push(`运镜：${MOVEMENT_LABEL[applied.movement]}`);
  }
  if (applied.duration !== before.duration) {
    hints.push(`时长：${applied.duration} 秒`);
  }
  return hints.length > 0 ? [`镜头参数建议：${hints.join("，")}`] : [];
}

/**
 * 生成连续性规则指导行（180 度规则、动作匹配）。
 */
function buildContinuityGuidanceLines(applied: DirectorShotContract, before: DirectorShotContract): string[] {
  const lines: string[] = [];
  if (applied.subjectScreenSide && !before.subjectScreenSide) {
    lines.push("180 度规则：与上一镜头保持角色同一屏幕侧，避免越轴");
  }
  if (applied.actionDirection && !before.actionDirection) {
    lines.push("动作匹配：动作方向与上一镜头保持一致");
  }
  return lines;
}

/**
 * 生成"导演指导"文本段落。
 *
 * 内部流程：
 * 1. 将当前 beat 的 shotInstruction 映射为 DirectorShotContract
 * 2. 构造导演上下文（前后镜头 + beatType/emotionIntensity/pacing）
 * 3. 应用导演规则，对比应用前后的镜头决策
 * 4. 将有变化的决策与连续性提示格式化为中文指导文本
 *
 * @returns 空字符串表示无需注入（无 shotInstruction 或无可应用规则）
 */
export function buildDirectorGuidanceSection(
  beat: StoryBeat,
  options: DirectorGuidanceOptions = {},
): string {
  const shot = toDirectorShot(beat);
  if (!shot) return "";

  const prevShot = options.prevBeat ? toDirectorShot(options.prevBeat) : null;
  const nextShot = options.nextBeat ? toDirectorShot(options.nextBeat) : null;

  const ctx: DirectorContext = {
    beatType: options.context?.beatType ?? "rising_action",
    emotionIntensity: options.context?.emotionIntensity ?? 0.5,
    pacing: options.context?.pacing ?? "normal",
    tone: options.context?.tone,
    previousShot: prevShot ?? undefined,
    nextShot: nextShot ?? undefined,
  };

  // 应用规则（传入拷贝，避免影响调用方数据）
  const before = { ...shot };
  const applied = applyDirectorRules([{ ...shot }], ctx)[0]!;

  const lines = [
    ...buildEmotionGuidanceLines(ctx),
    ...buildParamHintLines(applied, before),
    ...buildContinuityGuidanceLines(applied, before),
  ];

  if (lines.length === 0) return "";
  return `\n\n导演指导：\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
