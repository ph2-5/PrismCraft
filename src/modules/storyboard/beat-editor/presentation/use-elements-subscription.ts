import { useEffect, useState } from "react";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
import { t } from "@/shared/constants";
import type { StoryElement } from "@/domain/schemas";

/**
 * 订阅 ElementManager 的元素列表（初始加载 + 订阅变更）。
 *
 * 用于 ProfessionalModeEditor 等需要展示所有 StoryElement 的组件。
 * 在非 Electron 环境下静默失败（ElementManager 不可用）。
 */
export function useElementsSubscription(): StoryElement[] {
  const [elements, setElements] = useState<StoryElement[]>([]);

  // 初始加载
  useEffect(() => {
    let cancelled = false;
    container.elementManager
      .then((em) => em.getAllElements())
      .then((els) => {
        if (!cancelled) setElements(els);
      })
      .catch((err: unknown) => {
        if (!isElectron()) return;
        errorLogger.warn(
          { code: "ElementLoadFailed", message: t("error.elementLoadFailed"), cause: err },
          { component: "ProfessionalModeEditor", source: "getAllElements" },
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 订阅变更
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    container.elementManager.then((em) => {
      if (cancelled) return;
      unsubscribe = em.subscribe(() => {
        em.getAllElements()
          .then((els) => {
            if (!cancelled) setElements(els);
          })
          .catch((err: unknown) => {
            errorLogger.warn(
              { code: "ElementSubscribeFailed", message: t("error.elementSubscribeFailed"), cause: err },
              { component: "ProfessionalModeEditor", source: "subscribe" },
            );
          });
      });
    }).catch((err: unknown) => {
      if (!cancelled) {
        errorLogger.warn(
          { code: "ElementManagerLoadFailed", message: t("error.elementLoadFailed"), cause: err },
          { component: "ProfessionalModeEditor", source: "elementManager" },
        );
      }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return elements;
}
