"use client";

import React, {
  createContext,
  useContext,
  useSyncExternalStore,
  useCallback,
  useLayoutEffect,
  useMemo,
} from "react";
import { preferencesStorage } from "@/shared/utils/preferences";
import { errorLogger } from "@/shared/error-logger";

export type ThemeId =
  | "default"
  | "cyber"
  | "amber"
  | "minimal"
  | "lavender"
  | "emerald";

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  description: string;
  preview: { bg: string; primary: string; accent: string };
}

export const THEMES: ThemeInfo[] = [
  {
    id: "default",
    name: "暗夜靛蓝",
    description: "专业沉稳，靛蓝品牌色",
    preview: { bg: "#0f172a", primary: "#6366f1", accent: "#4f46e5" },
  },
  {
    id: "cyber",
    name: "赛博霓虹",
    description: "科技未来感，青色霓虹",
    preview: { bg: "#0a0f1a", primary: "#00e5ff", accent: "#00bcd4" },
  },
  {
    id: "amber",
    name: "暖光琥珀",
    description: "温暖舒适，琥珀橙光",
    preview: { bg: "#1a1410", primary: "#f59e0b", accent: "#d97706" },
  },
  {
    id: "minimal",
    name: "极简灰",
    description: "克制专注，中性灰色",
    preview: { bg: "#09090b", primary: "#a1a1aa", accent: "#3f3f46" },
  },
  {
    id: "lavender",
    name: "薰衣紫",
    description: "梦幻优雅，紫色薰衣",
    preview: { bg: "#0f0a1a", primary: "#a855f7", accent: "#9333ea" },
  },
  {
    id: "emerald",
    name: "翡翠绿",
    description: "自然清新，翡翠绿意",
    preview: { bg: "#0a1a14", primary: "#10b981", accent: "#059669" },
  },
];

const THEME_STORAGE_KEY = "app-theme";

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themeInfo: ThemeInfo;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themeListeners = new Set<() => void>();

function subscribeTheme(callback: () => void): () => void {
  themeListeners.add(callback);
  return () => { themeListeners.delete(callback); };
}

function getThemeSnapshot(): ThemeId {
  try {
    const stored = preferencesStorage.get<ThemeId | null>(THEME_STORAGE_KEY, null);
    if (stored && THEMES.some((t) => t.id === stored)) {
      return stored;
    }
  } catch (e) {
    errorLogger.warn("[ThemeProvider] Failed to load theme from storage", e);
  }
  return "default";
}

function getThemeServerSnapshot(): ThemeId {
  return "default";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "default") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemeId) => {
    try {
      preferencesStorage.set(THEME_STORAGE_KEY, newTheme);
    } catch (e) {
      errorLogger.warn("[ThemeProvider] Failed to persist theme", e);
    }
    themeListeners.forEach(l => l());
  }, []);

  const themeInfo = useMemo(
    () => THEMES.find((t) => t.id === theme) || THEMES[0],
    [theme],
  );

  const value = useMemo(
    () => ({ theme, setTheme, themeInfo }),
    [theme, setTheme, themeInfo],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
