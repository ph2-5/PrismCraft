"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { confirm } from "@/shared/utils/confirm";

export function BeforeUnloadGuard() {
  const dirtyCount = useDirtyState((s) => s.dirtyKeys.size);
  const markAllClean = useDirtyState((s) => s.markAllClean);
  const dirtyRef = useRef(dirtyCount > 0);

  useEffect(() => {
    dirtyRef.current = dirtyCount > 0;
  }, [dirtyCount]);

  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      markAllClean();
    }
  }, [pathname, markAllClean]);

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
  const router = useRouter();
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
          "当前页面有未保存的修改，离开将丢失这些修改。确定要继续吗？",
          "未保存的修改",
        );
        if (!confirmed) return;
        markAllClean();
      }
      router.push(href);
    },
    [router, markAllClean],
  );

  return { guardedPush };
}
