import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import type { Story, StoryBeat, Character, Scene } from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { loadConfig } from "@/shared/api-config";
import { errorLogger } from "@/shared/error-logger";
import { generateStoryPlanWithValidation } from "@/modules/shot";

export interface StoryPlanningOptions {
  maxRetries?: number;
  autoFix?: boolean;
  fewShotCount?: number;
  strictMode?: boolean;
  showFixDetails?: boolean;
  enhancedGeneration?: boolean;
}

export interface StoryPlanningResult {
  beats: StoryBeat[];
  autoFixedCount: number;
  retryCount: number;
  fixDetails: string[];
}

export async function planStory(
  story: Story,
  characters: Character[],
  scenes: Scene[],
  options: StoryPlanningOptions = {},
): Promise<Result<StoryPlanningResult>> {
  return fromAsyncThrowable(async () => {
    const {
      maxRetries = 1,
      autoFix = false,
      fewShotCount = 1,
      strictMode = false,
      showFixDetails = false,
      enhancedGeneration = false,
    } = options;

    const elements = await container.elementStorage.getAllElements();

    const result = await generateStoryPlanWithValidation(
      story,
      characters,
      scenes,
      elements,
      {
        maxRetries,
        autoFix,
        fewShotCount,
        strictMode,
        showFixDetails,
        enhancedGeneration,
      },
      enhancedGeneration,
    );

    return {
      beats: result.beats,
      autoFixedCount: result.autoFixedCount,
      retryCount: result.retryCount,
      fixDetails: result.fixDetails,
    };
  });
}

export async function checkTextApiConfig(): Promise<Result<boolean>> {
  return fromAsyncThrowable(async () => {
    try {
      const config = await loadConfig();
      return config?.providers?.some((p) =>
        p.models?.some((m) => m.capabilities?.includes("text")),
      ) ?? false;
    } catch (e) {
      errorLogger.warn("[StoryPlanning] Failed to load text API config", e);
      return false;
    }
  });
}
