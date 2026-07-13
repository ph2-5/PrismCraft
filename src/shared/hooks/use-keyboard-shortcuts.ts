import { useEffect, useCallback, useRef } from "react";

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  action: (e: KeyboardEvent) => void;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  enabled?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function matchesKey(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  if (normalizeKey(event.key) !== normalizeKey(shortcut.key)) {
    return false;
  }

  if (shortcut.ctrl && !event.ctrlKey) return false;
  if (!shortcut.ctrl && event.ctrlKey) return false;

  if (shortcut.shift && !event.shiftKey) return false;
  if (!shortcut.shift && event.shiftKey) return false;

  if (shortcut.alt && !event.altKey) return false;
  if (!shortcut.alt && event.altKey) return false;

  if (shortcut.meta && !event.metaKey) return false;
  if (!shortcut.meta && event.metaKey) return false;

  return true;
}

function isTextField(element: EventTarget | null): boolean {
  if (!element) return false;
  if (!(element instanceof HTMLElement)) return false;
  const tag = element.tagName?.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    element.isContentEditable
  );
}

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      if (isTextField(event.target)) {
        const escapeShortcut = shortcutsRef.current.find(
          (s) => s.key === "Escape" && s.enabled !== false,
        );
        if (escapeShortcut) {
          if (escapeShortcut.preventDefault !== false) {
            event.preventDefault();
          }
          if (escapeShortcut.stopPropagation !== false) {
            event.stopPropagation();
          }
          escapeShortcut.action(event);
        }
        return;
      }

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.enabled === false) continue;
        if (matchesKey(event, shortcut)) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          if (shortcut.stopPropagation !== false) {
            event.stopPropagation();
          }
          shortcut.action(event);
          break;
        }
      }
    },
    [enabled],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [handleKeyDown]);

  const getActiveShortcuts = useCallback(() => {
    return shortcuts.filter((s) => s.enabled !== false);
  }, [shortcuts]);

  return {
    getActiveShortcuts,
  };
}

export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  if (shortcut.meta) parts.push("Cmd");
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");

  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  parts.push(key);

  return parts.join("+");
}
