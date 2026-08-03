/**
 * 视觉连贯性主动规划器（P3.5）。
 *
 * 在分镜生成阶段就为每个 beat 规划"角色屏幕侧"与"动作方向"，
 * 使 180 度规则（越轴防护）与动作匹配在生成时即有据可依，
 * 而非仅靠生成后的事后检查。
 *
 * 设计约束（shared-logic 层）：
 * - 纯函数，零副作用，零外部依赖（所有类型内联定义）
 * - 不修改输入；返回 id → 规划 的映射
 * - 规则：
 *   1. 同一场景（sceneId）的连续镜头共享一条轴线，角色屏幕侧保持一致
 *   2. 场景切换重置轴线
 *   3. beat 内容声明"左侧/右侧"时优先作为该段轴线的起点
 *   4. 动作方向：内容含"向右" → 屏幕上从左到右（left_to_right）；
 *      含"向左" → 屏幕上从右到左（right_to_left）；无声明则延续上一镜头
 */

export type ScreenSide = "left" | "right";

export type ActionDirection = "left_to_right" | "right_to_left";

export interface ContinuityBeatInput {
  id: string;
  /** 所属场景；场景切换时重置轴线 */
  sceneId?: string;
  /** 分镜内容文本（用于推断屏幕侧与动作方向） */
  content?: string;
}

export interface ContinuityPlan {
  id: string;
  /** 角色在画面中的屏幕侧 */
  subjectScreenSide?: ScreenSide;
  /** 主体动作在画面中的移动方向 */
  actionDirection?: ActionDirection;
}

/** 内容 → 屏幕侧 的关键词规则 */
const SIDE_WORD_RULES: Array<[RegExp, ScreenSide]> = [
  [/左(侧|边|方|手)|向左|往左/, "left"],
  [/右(侧|边|方|手)|向右|往右/, "right"],
];

/** 内容 → 动作方向 的关键词规则（主体移动方向在画面上的投影） */
const ACTION_WORD_RULES: Array<[RegExp, ActionDirection]> = [
  [/向?右|往右|右转/, "left_to_right"],
  [/向?左|往左|左转/, "right_to_left"],
];

function inferSide(content: string | undefined): ScreenSide | undefined {
  if (!content) return undefined;
  for (const [pattern, side] of SIDE_WORD_RULES) {
    if (pattern.test(content)) return side;
  }
  return undefined;
}

function inferActionDirection(content: string | undefined): ActionDirection | undefined {
  if (!content) return undefined;
  for (const [pattern, direction] of ACTION_WORD_RULES) {
    if (pattern.test(content)) return direction;
  }
  return undefined;
}

/**
 * 为分镜序列生成视觉连贯性规划。
 *
 * @param beats 按播放顺序排列的分镜
 * @returns 每个 beat 的规划（与输入同序；未规划到的 beat 不含计划项）
 */
export function planVisualContinuity(
  beats: ContinuityBeatInput[],
): ContinuityPlan[] {
  const plans: ContinuityPlan[] = [];
  let currentScene: string | undefined;
  let currentSide: ScreenSide | undefined;
  let currentDirection: ActionDirection | undefined;

  for (const beat of beats) {
    // 场景切换 → 重置轴线与动作方向
    if (beat.sceneId !== currentScene) {
      currentScene = beat.sceneId;
      currentSide = undefined;
      currentDirection = undefined;
    }

    // 轴线规划：内容声明优先，否则延续；首镜头默认左侧
    const declaredSide = inferSide(beat.content);
    if (declaredSide) {
      currentSide = declaredSide;
    } else if (!currentSide) {
      currentSide = "left";
    }

    // 动作方向：内容声明优先，否则延续
    const declaredDirection = inferActionDirection(beat.content);
    if (declaredDirection) {
      currentDirection = declaredDirection;
    }

    plans.push({
      id: beat.id,
      subjectScreenSide: currentSide,
      actionDirection: currentDirection,
    });
  }

  return plans;
}
