import { useEffect, useState } from "react";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants/messages";

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
        className="fixed bottom-4 right-4 z-[9999] bg-red-500 text-white px-3 py-1 rounded text-xs"
      >
        {t("debug.toggle")}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] bg-gray-900 text-white p-4 rounded-lg max-w-sm text-xs">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold">{t("debug.title")}</span>
        <button onClick={() => setIsDevToolsOpen(false)} className="text-gray-400">
          ×
        </button>
      </div>
      <div className="space-y-2">
        <p>{t("debug.overlayCount", { count: elements.length })}</p>
        {elements.map((el, i) => (
          <div key={i} className="bg-gray-800 p-1 rounded">
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
