import { useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants";

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

/**
 * 受保护的导航 hook：
 * - 存在未保存修改（dirty）时，先弹出确认框，用户确认后才导航
 * - 避免跨页面切换静默丢失未保存数据
 * - 用户取消则不导航（保留当前页面状态）
 */
export function useNavigationGuard() {
  const navigate = useNavigate();
  const dirtyRef = useRef(useDirtyState.getState().dirtyKeys.size > 0);

  useEffect(() => {
    const unsubscribe = useDirtyState.subscribe((state) => {
      dirtyRef.current = state.dirtyKeys.size > 0;
    });
    return unsubscribe;
  }, []);

  const guardedPush = useCallback(
    async (href: string): Promise<boolean> => {
      if (dirtyRef.current) {
        const confirmed = await confirm({
          description: t("confirm.discardChanges"),
          variant: "warning",
        });
        if (!confirmed) return false;
      }
      navigate(href);
      return true;
    },
    [navigate],
  );

  return { guardedPush };
}
