import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { t } from "@/shared/constants/messages";

export type ToastType = "success" | "error" | "warning" | "info";

export { TOAST_EVENT, emitToast } from "@/shared/utils/toast-bridge";
export type { ToastEventType } from "@/shared/utils/toast-bridge";
import { TOAST_EVENT } from "@/shared/utils/toast-bridge";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  exiting?: boolean;
  createdAt?: number;
  count?: number;
  action?: ToastAction;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, "id">) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEDUP_WINDOW_MS = 2000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const hideToast = useCallback((id: string) => {
    const autoTimer = timersRef.current.get(id);
    if (autoTimer) {
      clearTimeout(autoTimer);
      timersRef.current.delete(id);
    }

    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    const exitTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(`exit-${id}`);
    }, 400);
    timersRef.current.set(`exit-${id}`, exitTimer);
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `toast-${crypto.randomUUID()}`;
      const newToast = { ...toast, id, createdAt: Date.now() };
      setToasts((prev) => {
        const dedupKey = `${toast.type}-${toast.title}-${toast.message || ""}`;
        const existing = prev.find(
          (t) =>
            !t.exiting &&
            `${t.type}-${t.title}-${t.message || ""}` === dedupKey &&
            t.createdAt &&
            Date.now() - t.createdAt < DEDUP_WINDOW_MS,
        );
        if (existing) {
          return prev.map((t) =>
            t.id === existing.id
              ? { ...t, message: toast.message || t.message, createdAt: Date.now(), count: (t.count || 1) + 1 }
              : t,
          );
        }
        const updated = [...prev, newToast];
        if (updated.length > 5) {
          const toRemove = updated.slice(0, updated.length - 5);
          const marked = updated.map((t) =>
            toRemove.some((r) => r.id === t.id) ? { ...t, exiting: true } : t,
          );
          toRemove.forEach((t) => {
            const exitTimer = setTimeout(() => {
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
              timersRef.current.delete(`overflow-${t.id}`);
            }, 400);
            timersRef.current.set(`overflow-${t.id}`, exitTimer);
          });
          return marked;
        }
        return updated;
      });

      const duration =
        toast.duration ?? (toast.type === "error" ? 10000 : 5000);
      if (duration !== 0) {
        const timer = setTimeout(() => {
          hideToast(id);
        }, duration);
        timersRef.current.set(id, timer);
      }
    },
    [hideToast],
  );

  useEffect(() => {
    const timers = new Map(timersRef.current);
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { type, title, message } = (e as CustomEvent).detail;
      showToast({ type, title, message });
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, [showToast]);

  const contextValue = useMemo(
    () => ({ toasts, showToast, hideToast }),
    [toasts, showToast, hideToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onClose={hideToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function useToastHelpers() {
  const { showToast } = useToast();

  const success = useCallback(
    (title: string, message?: string, extra?: { action?: ToastAction }) =>
      showToast({ type: "success", title, message, action: extra?.action }),
    [showToast],
  );
  const error = useCallback(
    (title: string, message?: string) =>
      showToast({ type: "error", title, message }),
    [showToast],
  );
  const warning = useCallback(
    (title: string, message?: string) =>
      showToast({ type: "warning", title, message }),
    [showToast],
  );
  const info = useCallback(
    (title: string, message?: string) =>
      showToast({ type: "info", title, message }),
    [showToast],
  );

  return useMemo(() => ({ success, error, warning, info }), [success, error, warning, info]);
}

function ToastContainer({
  toasts,
  onClose,
}: {
  toasts: Toast[];
  onClose: (id: string) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem
            toast={toast}
            onClose={() => onClose(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}

const PROGRESS_DURATION: Record<ToastType, number> = {
  success: 3000,
  error: 8000,
  warning: 5000,
  info: 4000,
};

const TYPE_COLORS: Record<ToastType, { icon: string; border: string; progress: string; glow: string }> = {
  success: {
    icon: "text-emerald-400",
    border: "border-emerald-500/30",
    progress: "bg-emerald-400",
    glow: "shadow-emerald-500/10",
  },
  error: {
    icon: "text-red-400",
    border: "border-red-500/30",
    progress: "bg-red-400",
    glow: "shadow-red-500/10",
  },
  warning: {
    icon: "text-amber-400",
    border: "border-amber-500/30",
    progress: "bg-amber-400",
    glow: "shadow-amber-500/10",
  },
  info: {
    icon: "text-sky-400",
    border: "border-sky-500/30",
    progress: "bg-sky-400",
    glow: "shadow-sky-500/10",
  },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const colors = TYPE_COLORS[toast.type];
  const progressDuration = toast.duration ?? PROGRESS_DURATION[toast.type];

  const iconMap = {
    success: <CheckCircle className={`w-5 h-5 ${colors.icon}`} />,
    error: <AlertCircle className={`w-5 h-5 ${colors.icon}`} />,
    warning: <AlertTriangle className={`w-5 h-5 ${colors.icon}`} />,
    info: <Info className={`w-5 h-5 ${colors.icon}`} />,
  };

  return (
    <div
      className={`relative flex items-start gap-3 p-4 rounded-xl bg-card/95 backdrop-blur-sm border ${colors.border} shadow-lg ${colors.glow} min-w-[320px] max-w-[420px] transition-all duration-400 ease-out overflow-hidden ${
        toast.exiting
          ? "opacity-0 translate-x-8 scale-95"
          : "animate-slide-in-from-right"
      }`}
    >
      <div className="mt-0.5 animate-bounce-in">{iconMap[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground">
          {toast.title}
          {toast.count && toast.count > 1 ? (
            <span className="ml-1.5 text-xs text-muted-foreground">({t("toast.times", { count: toast.count })})</span>
          ) : null}
        </p>
        {toast.message && (
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{toast.message}</p>
        )}
        {toast.action && (
          <button
            className="mt-2 text-xs font-medium text-primary hover:text-primary/80 underline underline-offset-2"
            onClick={toast.action.onClick}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 -mr-2 -mt-2 shrink-0 hover:bg-muted/50"
        onClick={onClose}
      >
        <X className="w-3.5 h-3.5" />
      </Button>

      {!toast.exiting && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-muted/30">
          <div
            className={`h-full ${colors.progress} rounded-full`}
            style={{
              animation: `toast-progress ${progressDuration}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  );
}
