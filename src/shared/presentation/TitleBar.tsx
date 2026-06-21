import { useCallback, useEffect, useState } from "react";
import { Minus, Square, X, Maximize2 } from "lucide-react";
import { cn } from "@/shared/utils/utils";
import { t } from "@/shared/constants";

/**
 * 无框窗口的自定义标题栏
 * - 左侧拖拽区域（-webkit-app-region: drag）
 * - 右侧窗口控制按钮（最小化/最大化/关闭）
 * - 按钮区域不可拖拽（-webkit-app-region: no-drag）
 */
export function TitleBar(): React.ReactElement | null {
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI?.windowIsMaximized?.().then((m) => setIsMaximized(!!m)).catch((e) => {
      console.warn("[TitleBar] windowIsMaximized failed", e);
    });
  }, [isElectron]);

  const handleMinimize = useCallback(() => {
    window.electronAPI?.windowMinimize?.().catch((e) => {
      console.warn("[TitleBar] windowMinimize failed", e);
    });
  }, []);

  const handleMaximize = useCallback(async () => {
    await window.electronAPI?.windowMaximize?.().catch((e) => {
      console.warn("[TitleBar] windowMaximize failed", e);
    });
    const maximized = await window.electronAPI?.windowIsMaximized?.().catch((e) => {
      console.warn("[TitleBar] windowIsMaximized failed", e);
      return false;
    });
    setIsMaximized(!!maximized);
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI?.windowClose?.().catch((e) => {
      console.warn("[TitleBar] windowClose failed", e);
    });
  }, []);

  if (!isElectron) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-9 flex items-center select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* 左侧拖拽区域（占满剩余空间） */}
      <div className="flex-1 h-full" />

      {/* 右侧窗口控制按钮 */}
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className={cn(
            "h-full w-11 flex items-center justify-center",
            "text-muted-foreground hover:text-foreground hover:bg-muted",
            "transition-colors duration-150",
          )}
          aria-label={t("aria.minimize")}
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleMaximize}
          className={cn(
            "h-full w-11 flex items-center justify-center",
            "text-muted-foreground hover:text-foreground hover:bg-muted",
            "transition-colors duration-150",
          )}
          aria-label={isMaximized ? t("aria.restore") : t("aria.maximize")}
        >
          {isMaximized ? (
            <Maximize2 className="w-3.5 h-3.5" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={handleClose}
          className={cn(
            "h-full w-11 flex items-center justify-center",
            "text-muted-foreground hover:text-foreground hover:bg-red-500/80 hover:text-white",
            "transition-colors duration-150",
          )}
          aria-label={t("aria.close")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
