import type { Scene } from "@/domain/schemas";

export interface ReferencedBeat {
  storyId: string;
  storyTitle: string;
  sequence: number;
  title?: string;
  description: string;
  imageUrl?: string;
  generationStatus?: string;
}

export type SetCurrentScene = (
  update: Scene | ((prev: Scene) => Scene),
  shouldMarkDirty?: boolean,
) => void;

export {
  ScenePageHeader,
  SceneDetailHeader,
} from "./SceneHeaderParts";
export {
  SceneBasicInfoCard,
  SceneAtmosphereCard,
  SceneSpaceCard,
  SceneElementsCard,
} from "./SceneInfoCards";
export { SceneImageGenerationCard } from "./SceneImageParts";
export {
  SceneReferencedBeatsCard,
  SceneActionFooter,
} from "./SceneRefFooterParts";
