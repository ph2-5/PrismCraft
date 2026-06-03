import { useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";

export function BeforeUnloadGuard() {
  const dirtyCount = useDirtyState((s) => s.dirtyKeys.size);
  const dirtyRef = useRef(dirtyCount > 0);

  useEffect(() => {
    dirtyRef.current = dirtyCount > 0;
  }, [dirtyCount]);

  const pathname = useLocation().pathname;
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return null;
}

export function useNavigationGuard() {
  const navigate = useNavigate();
  const dirtyCount = useDirtyState((s) => s.dirtyKeys.size);
  const markAllClean = useDirtyState((s) => s.markAllClean);
  const dirtyRef = useRef(dirtyCount > 0);

  useEffect(() => {
    dirtyRef.current = dirtyCount > 0;
  }, [dirtyCount]);

  const guardedPush = useCallback(
    async (href: string) => {
      if (dirtyRef.current) {
        const confirmed = await confirm(
          t("nav.unsavedChangesConfirm"),
          t("nav.unsavedChanges"),
        );
        if (!confirmed) return;
        markAllClean();
      }
      navigate(href);
    },
    [navigate, markAllClean],
  );

  return { guardedPush };
}
