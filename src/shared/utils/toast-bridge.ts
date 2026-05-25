export const TOAST_EVENT = "app:toast" as const;

export type ToastEventType = "success" | "error" | "warning" | "info";

export function emitToast(type: ToastEventType, title: string, message?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { type, title, message } }));
  }
}
