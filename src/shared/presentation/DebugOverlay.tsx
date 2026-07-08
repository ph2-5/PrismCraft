import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";

export function DebugOverlay() {
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [elements, setElements] = useState<Element[]>([]);

  useEffect(() => {
    const checkOverlays = () => {
      const overlays = document.querySelectorAll(
        'div[class*="fixed"], div[class*="absolute"]'
      );
      const suspicious = Array.from(overlays).filter(
        (el) =>
        el.classList.contains("inset-0") ||
        el.getAttribute("class")?.includes("z-5")
      );
      setElements(suspicious);
    };

    checkOverlays();
    const interval = setInterval(checkOverlays, 2000);
    return () => clearInterval(interval);
  }, []);

  const forceCloseAll = () => {
    const events = ["Escape", "click"];
    events.forEach((event) => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: event }));
    });
    errorLogger.debug("[Debug] 尝试强制关闭所有覆盖层");
  };

  if (!isDevToolsOpen) {
    return (
      <button
        onClick={() => setIsDevToolsOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] bg-destructive text-white px-3 py-1 rounded text-xs"
      >
        {t("debug.toggle")}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] bg-background text-foreground p-4 rounded-lg max-w-sm text-xs"
      role="dialog"
      aria-label={t("debug.title")}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") setIsDevToolsOpen(false);
      }}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold">{t("debug.title")}</span>
        <button onClick={() => setIsDevToolsOpen(false)} style={{ color: "var(--muted-fg)" }} aria-label={t("aria.close")}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-2">
        <p>{t("debug.overlayCount", { count: elements.length })}</p>
        {elements.map((el, i) => (
          <div key={i} className="bg-muted p-1 rounded">
            {el.tagName} - {el.className.slice(0, 50)}
          </div>
        ))}
        <button
          onClick={forceCloseAll} className="bg-red-600 px-2 py-1 rounded w-full">
          {t("debug.forceCloseAll")}
        </button>
      </div>
    </div>
  );
}
