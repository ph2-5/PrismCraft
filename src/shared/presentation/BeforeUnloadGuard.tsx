import { useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";

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

  const guardedPush = useCallback(
    (href: string) => navigate(href),
    [navigate],
  );

  return { guardedPush };
}
