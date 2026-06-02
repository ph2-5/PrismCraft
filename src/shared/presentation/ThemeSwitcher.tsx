import React, { useState } from "react";
import { Palette, Check } from "lucide-react";
import { useTheme, THEMES, type ThemeId } from "./ThemeProvider";
import { cn } from "@/shared/utils/utils";
import { t } from "@/shared/constants/messages";

interface ThemeSwitcherProps {
  collapsed?: boolean;
}

export function ThemeSwitcher({ collapsed }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full",
          collapsed ? "justify-center h-10 w-10 mx-auto" : "gap-3 px-3 h-9",
        )}
        title={t("theme.switchTheme")}
      >
        <Palette className={cn("shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
        {!collapsed && (
          <>
            <span>{t("theme.label")}</span>
            <div
              className="ml-auto w-3 h-3 rounded-full border border-border shrink-0"
              style={{
                background: THEMES.find((t) => t.id === theme)?.preview.primary,
              }}
            />
          </>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className={cn(
            "absolute bg-popover border border-border rounded-lg shadow-xl z-50 p-2 animate-fade-in",
            collapsed ? "bottom-full left-full ml-2 mb-0 w-64" : "bottom-full left-0 mb-2 w-64",
          )}>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground mb-1">
              {t("theme.selectStyle")}
            </div>
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id as ThemeId);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-all duration-200",
                  theme === t.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted text-foreground",
                )}
              >
                <div className="flex gap-1 shrink-0">
                  <div
                    className="w-4 h-4 rounded-full border border-border/50"
                    style={{ background: t.preview.bg }}
                  />
                  <div
                    className="w-4 h-4 rounded-full border border-border/50"
                    style={{ background: t.preview.primary }}
                  />
                  <div
                    className="w-4 h-4 rounded-full border border-border/50"
                    style={{ background: t.preview.accent }}
                  />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium text-xs">{t.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {t.description}
                  </div>
                </div>
                {theme === t.id && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
