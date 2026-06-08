import { useState, useCallback, useEffect } from "react";
import { elementManager } from "./element-manager";
import type { StoryElement, ElementType, AssetBinding } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { handleError } from "@/shared/error-handler";

export function useElementBinding() {
  const [elements, setElements] = useState<StoryElement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    elementManager.getAllElements().then((els) => {
      if (!cancelled) {
        setElements(els);
        setIsLoading(false);
        setLoadError(null);
      }
    }).catch((e) => {
      if (!cancelled) {
        errorLogger.error(handleError(e), "ElementBinding");
        setLoadError(e instanceof Error ? e.message : "元素加载失败");
        setIsLoading(false);
      }
    });

    const unsubscribe = elementManager.subscribe(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!cancelled) {
          elementManager.getAllElements().then((els) => {
            if (!cancelled) setElements(els);
          }).catch(() => {});
        }
      }, 50);
    });

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, []);

  const createElement = useCallback(
    async (type: ElementType, name: string, description?: string) => {
      return elementManager.createElement(type, name, description);
    },
    [],
  );

  const bindAsset = useCallback(
    async (elementId: string, asset: AssetBinding) => {
      return elementManager.bindAsset(elementId, asset);
    },
    [],
  );

  const unbindAsset = useCallback(
    async (elementId: string, assetUrl: string) => {
      return elementManager.unbindAsset(elementId, assetUrl);
    },
    [],
  );

  const deleteElement = useCallback(
    async (elementId: string) => {
      await elementManager.deleteElement(elementId);
    },
    [],
  );

  const updateElement = useCallback(
    async (elementId: string, updates: Partial<StoryElement>) => {
      return elementManager.updateElement(elementId, updates);
    },
    [],
  );

  const getElement = useCallback(
    async (elementId: string) => elementManager.getElement(elementId),
    [],
  );

  const getElementsByType = useCallback(
    async (type: ElementType) => elementManager.getElementsByType(type),
    [],
  );

  return {
    elements,
    isLoading,
    loadError,
    createElement,
    bindAsset,
    unbindAsset,
    deleteElement,
    updateElement,
    getElement,
    getElementsByType,
  };
}
