import type {
  Character,
  FeatureAnchoringConfig,
  FixedImageConfig,
  ReferenceVideoConfig,
  Scene,
  ShotInstructionTemplate,
  StoryBeat,
  StoryElement,
  TemplateConfig,
} from "@/domain/schemas";
import {
  appendGlobalElements,
  appendBeatHeader,
  appendFeatureAnchoring,
  appendFixedImageSection,
  appendShotInstruction,
  appendSceneInfo,
  appendSceneTransitions,
  appendCharacters,
  appendSceneElements,
  appendContentDescription,
  appendBeatReference,
  appendPreviousLastFrameRef,
  appendPromptLayers,
  buildReferenceSection,
  appendGenerationRequirements,
} from "./single-beat-prompt-parts";

interface SingleBeatPromptParams {
  beat: StoryBeat;
  index: number;
  characters: Character[];
  scenes: Scene[];
  fixedImageConfig?: FixedImageConfig;
  referenceVideoConfig?: ReferenceVideoConfig;
  templateConfig?: TemplateConfig;
  isFirstShot?: boolean;
  previousLastFrameUrl?: string;
  featureAnchoring?: FeatureAnchoringConfig;
  elements?: StoryElement[];
  shotInstruction?: ShotInstructionTemplate;
  characterOutfits?: Record<string, string>;
}

export function generateSingleBeatPrompt(
  params: SingleBeatPromptParams,
): string {
  const {
    beat,
    index,
    characters,
    scenes,
    fixedImageConfig,
    referenceVideoConfig,
    templateConfig,
    featureAnchoring,
    previousLastFrameUrl,
    elements,
    shotInstruction,
    characterOutfits,
  } = params;

  const parts: string[] = [];

  appendGlobalElements(parts, elements);
  appendBeatHeader(parts, beat, index);

  if (featureAnchoring?.enabled) {
    appendFeatureAnchoring(parts, featureAnchoring);
  } else if (fixedImageConfig?.enabled) {
    appendFixedImageSection(parts, fixedImageConfig);
  }

  appendShotInstruction(parts, beat, shotInstruction);
  appendSceneInfo(parts, beat, scenes);
  appendSceneTransitions(parts, beat, scenes);
  appendCharacters(parts, beat, characters, characterOutfits);
  appendSceneElements(parts, beat, characters);
  appendContentDescription(parts, beat);
  appendBeatReference(parts, beat);
  appendPreviousLastFrameRef(parts, previousLastFrameUrl);
  appendPromptLayers(parts, beat);
  appendGenerationRequirements(parts, featureAnchoring);

  const referenceSection = buildReferenceSection(
    referenceVideoConfig,
    templateConfig,
  );

  return parts.join("\n") + referenceSection;
}
