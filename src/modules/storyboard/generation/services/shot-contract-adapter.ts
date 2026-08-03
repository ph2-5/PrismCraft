/**
 * ShotContract → StoryBeat 适配层（P1.4 架构统一：StoryBeat 作为 shot-contract 的扩展）。
 *
 * 把 Layer 2 导演规划的标准输出（ShotContract）映射为 storyboard 分镜可消费的
 * 镜头字段（beat.shotInstruction + beat.duration），使两条路径
 * （Novel/structure 的 shot contract 与 storyboard 的 beat 镜头指令）对齐。
 *
 * 映射说明：
 * - shotSize：两套枚举命名不同（close_up vs close），做一对一映射
 * - movement：shotInstruction 无 tilt/handheld/dolly 直接对应，按近似映射
 * - lighting：枚举已对齐（P3.2），直接透传
 * - duration → beat.duration
 */

import type { StoryBeat, ShotInstruction } from "@/domain/schemas";
import type { ShotContract } from "@/modules/novel";

/** ShotContract 景别 → shotInstruction.shotSize */
const SHOT_SIZE_TO_INSTRUCTION: Record<ShotContract["shotSize"], ShotInstruction["shotSize"]> = {
  extreme_wide: "extreme_wide",
  wide: "wide",
  medium: "medium",
  close_up: "close",
  extreme_close_up: "extreme_close",
};

/** ShotContract 运动 → shotInstruction.cameraMovement（近似映射） */
const MOVEMENT_TO_INSTRUCTION: Record<ShotContract["movement"], ShotInstruction["cameraMovement"]> = {
  static: "static",
  pan: "pan",
  // tilt（俯仰）无直接对应，映射为 crane_up（升降机位，垂直移动近似）
  tilt: "crane_up",
  // dolly（沿光轴推拉）映射为 push
  dolly: "push",
  // handheld（手持晃动）无直接对应，映射为 tracking（跟随，动感近似）
  handheld: "tracking",
  tracking: "tracking",
};

/**
 * 将单个 ShotContract 映射为 StoryBeat 的部分更新（镜头字段）。
 *
 * @param contract Layer 2 导演规划的镜头契约
 * @param extra 额外的 beat 字段（如 content/blocking 等，可选）
 */
export function shotContractToBeatPatch(
  contract: ShotContract,
  extra?: Partial<StoryBeat>,
): Partial<StoryBeat> {
  return {
    duration: contract.duration,
    shotInstruction: {
      shotSize: SHOT_SIZE_TO_INSTRUCTION[contract.shotSize],
      cameraMovement: MOVEMENT_TO_INSTRUCTION[contract.movement],
      cameraAngle: "eye_level",
      ...(contract.lighting ? { lighting: contract.lighting } : {}),
    },
    ...extra,
  };
}

/**
 * 将一组 ShotContract 映射为一组 beat 更新。
 *
 * 一个 beat 可对应多个 shot contract（1-3 个）；本函数将每个 contract
 * 映射为独立的 beat patch，由调用方决定合并策略（默认取每个 contract 独立成 beat）。
 */
export function shotContractsToBeatPatches(
  contracts: ShotContract[],
): Array<{ contract: ShotContract; patch: Partial<StoryBeat> }> {
  return contracts.map((contract) => ({
    contract,
    patch: shotContractToBeatPatch(contract),
  }));
}
