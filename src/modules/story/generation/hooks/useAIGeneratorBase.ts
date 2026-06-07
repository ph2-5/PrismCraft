import { useCallback, useEffect, useRef } from "react";
import { resolveCharacterRef, resolveSceneRef } from "@/modules/story";
import { getErrorMessage } from "@/shared/error-handler";
import type { StoryBeat, Character, Scene, ModelSelection } from "@/domain/schemas";

interface AIGeneratorBaseProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  setBeats?: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  setGenerating: React.Dispatch<React.SetStateAction<string | null>>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showConfirm?: (title: string, description: string) => Promise<boolean>;
}

interface ResolvedRefs {
  characterRef: string | undefined;
  sceneRef: string | undefined;
  prevBeat: StoryBeat | null;
}

export function useAIGeneratorBase(props: AIGeneratorBaseProps) {
  const {
    beatsRef,
    charactersRef,
    scenesRef,
    setBeats,
    setGenerating,
    showError,
  } = props;

  const activeControllersRef = useRef(new Map<string, AbortController>());
  const pendingPromisesRef = useRef(new Map<string, Promise<unknown>>());

  useEffect(() => {
    const currentControllers = activeControllersRef.current;
    const currentPromises = pendingPromisesRef.current;
    return () => {
      currentControllers.forEach((controller) => {
        controller.abort();
      });
      currentControllers.clear();
      currentPromises.clear();
    };
  }, []);

  const abortGeneration = useCallback((beatId?: string) => {
    if (beatId) {
      const controller = activeControllersRef.current.get(beatId);
      if (controller) {
        controller.abort();
        activeControllersRef.current.delete(beatId);
      }
      pendingPromisesRef.current.delete(beatId);
    } else {
      activeControllersRef.current.forEach((controller) => {
        controller.abort();
      });
      activeControllersRef.current.clear();
      pendingPromisesRef.current.clear();
    }
    setGenerating(null);
  }, [setGenerating]);

  const findBeat = useCallback(
    (beatId: string): StoryBeat | null => {
      return beatsRef.current.find((b) => b.id === beatId) ?? null;
    },
    [beatsRef],
  );

  const resolvePrevBeat = useCallback(
    (beatId: string, prevBeatOverride?: StoryBeat | null): StoryBeat | null => {
      if (prevBeatOverride !== undefined) return prevBeatOverride;
      const currentBeats = beatsRef.current;
      const idx = currentBeats.findIndex((b) => b.id === beatId);
      return idx > 0 ? currentBeats[idx - 1]! : null;
    },
    [beatsRef],
  );

  const resolveRefs = useCallback(
    (beat: StoryBeat, prevBeat?: StoryBeat | null): ResolvedRefs => {
      const characterIds = beat.characterIds || [];
      const characterRef = characterIds
        .map((cid: string) => charactersRef.current.find((c) => c.id === cid))
        .filter(Boolean)
        .map((c) => resolveCharacterRef(c!, beat))
        .find(Boolean);

      const sceneId = beat.sceneId || beat.scene;
      const sceneObj = sceneId
        ? scenesRef.current.find((s) => s.id === sceneId)
        : undefined;
      const sceneRef = sceneObj ? resolveSceneRef(sceneObj) : undefined;

      return {
        characterRef,
        sceneRef,
        prevBeat: prevBeat ?? null,
      };
    },
    [charactersRef, scenesRef],
  );

  const checkModelConfig = useCallback(
    (
      model: ModelSelection | null,
      errorTitle: string,
      errorDesc: string,
    ): boolean => {
      if (!model?.providerId || !model?.modelId) {
        showError(errorTitle, errorDesc);
        return false;
      }
      return true;
    },
    [showError],
  );

  const withGenerationState = useCallback(
    async <T>(
      beatId: string,
      fn: (signal: AbortSignal) => Promise<T>,
      errorTitle: string,
    ): Promise<T | void> => {
      const existingPromise = pendingPromisesRef.current.get(beatId);
      if (existingPromise) {
        return existingPromise as Promise<T | void>;
      }

      const controller = new AbortController();
      activeControllersRef.current.set(beatId, controller);
      setGenerating(beatId);

      const promise = (async (): Promise<T | void> => {
        try {
          const result = await fn(controller.signal);
          if (controller.signal.aborted) return;
          return result;
        } catch (err) {
          if (controller.signal.aborted) return;
          showError(errorTitle, getErrorMessage(err));
        } finally {
          if (activeControllersRef.current.get(beatId) === controller) {
            activeControllersRef.current.delete(beatId);
          }
          pendingPromisesRef.current.delete(beatId);
          setGenerating(null);
        }
      })();

      pendingPromisesRef.current.set(beatId, promise);
      return promise;
    },
    [setGenerating, showError],
  );

  const updateBeat = useCallback(
    (beatId: string, updates: Partial<StoryBeat>): void => {
      if (!setBeats) return;
      setBeats((prev) =>
        prev.map((b) => (b.id === beatId ? { ...b, ...updates } : b)),
      );
    },
    [setBeats],
  );

  return {
    findBeat,
    resolvePrevBeat,
    resolveRefs,
    checkModelConfig,
    withGenerationState,
    updateBeat,
    abortGeneration,
  };
}

export type { AIGeneratorBaseProps, ResolvedRefs };
