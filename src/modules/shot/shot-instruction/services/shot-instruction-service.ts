import { shotInstructionToPrompt } from "@/domain/utils/shot-prompt";
import type { ShotInstructionTemplate } from "@/domain/schemas";

export { shotInstructionToPrompt, SHOT_SIZE_OPTIONS, CAMERA_MOVEMENT_OPTIONS, CAMERA_ANGLE_OPTIONS } from "@/domain/utils/shot-prompt";

export function buildPromptLayers(params: {
  characterAnchors: Array<{
    elementName: string;
    featureTags: string[];
  }>;
  shotInstruction?: ShotInstructionTemplate;
  customDescription?: string;
  styleAtmosphere?: string;
}): {
  coreElements: string;
  cameraAction: string;
  styleAtmosphere: string;
} {
  const coreParts: string[] = [];

  for (const char of params.characterAnchors) {
    coreParts.push(
      `角色"${char.elementName}"：严格保持${char.featureTags.join("、")}等核心特征不变`,
    );
  }

  const cameraParts: string[] = [];
  if (params.shotInstruction) {
    cameraParts.push(shotInstructionToPrompt(params.shotInstruction));
  }
  if (params.customDescription) {
    cameraParts.push(params.customDescription);
  }

  const styleParts: string[] = [];
  if (params.styleAtmosphere) {
    styleParts.push(params.styleAtmosphere);
  }

  return {
    coreElements: coreParts.join("；"),
    cameraAction: cameraParts.join("，"),
    styleAtmosphere: styleParts.join("，"),
  };
}
