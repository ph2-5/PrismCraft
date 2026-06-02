import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import {
  Film,
  Users,
  Image,
  Settings,
  Search,
  Keyboard,
  Video,
  Wand2,
  Package,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useState, useEffect, useCallback, useLayoutEffect, useSyncExternalStore, memo } from "react";
import type { LucideIcon } from "lucide-react";
import { SearchDialog } from "./SearchDialog";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useNavigationGuard } from "./BeforeUnloadGuard";
import { errorLogger } from "@/shared/error-logger";
import { preferencesStorage } from "@/shared/utils/preferences";
import { cn } from "@/shared/utils/utils";
import { t } from "@/shared/constants";
import type { SearchResult } from "@/domain/schemas";

interface SidebarProps {
  onSearch?: (term: string) => Promise<SearchResult[]>;
  onSearchSelect?: (result: SearchResult) => void;
}

const navItems = [
  { href: "/quick-generate", labelKey: "sidebar.quickGenerate", icon: Wand2 },
  { href: "/story", labelKey: "sidebar.storyboard", icon: Film },
  { href: "/characters", labelKey: "sidebar.characters", icon: Users },
  { href: "/scenes", labelKey: "sidebar.scenes", icon: Image },
  { href: "/asset-library", labelKey: "sidebar.assetLibrary", icon: Package },
  { href: "/video-tasks", labelKey: "sidebar.tasks", icon: Video },
];

const bottomItems = [{ href: "/settings", labelKey: "sidebar.settings", icon: Settings }];

interface NavItemProps {
  labelKey: string;
  icon: LucideIcon;
  isActive: boolean;
  collapsed: boolean;
  href: string;
  onNavigate: (href: string) => void;
}

const NavItem = memo(function NavItem({ labelKey, icon: Icon, isActive, collapsed, href, onNavigate }: NavItemProps) {
  return (
    <button
      onClick={() => onNavigate(href)}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium transition-colors",
        collapsed
          ? "justify-center h-10 w-10 mx-auto"
          : "gap-3 px-3 h-10",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      title={collapsed ? t(labelKey) : undefined}
    >
      <Icon
        className={cn(
          "shrink-0",
          isActive ? "text-primary" : "",
          collapsed ? "w-5 h-5" : "w-4 h-4",
        )}
      />
      {!collapsed && <span>{t(labelKey)}</span>}
    </button>
  );
});

const SIDEBAR_WIDTH_EXPANDED = 220;
const SIDEBAR_WIDTH_COLLAPSED = 60;
const STORAGE_KEY = "sidebar-collapsed";

const sidebarListeners = new Set<() => void>();

function subscribeSidebar(callback: () => void): () => void {
  sidebarListeners.add(callback);
  return () => { sidebarListeners.delete(callback); };
}

function getSidebarCollapsedSnapshot(): boolean {
  try {
    return preferencesStorage.get(STORAGE_KEY, false);
  } catch {
    errorLogger.warn("[Sidebar] Failed to read sidebar collapsed state");
    return false;
  }
}

function getSidebarCollapsedServerSnapshot(): boolean {
  return false;
}

const subscribeNoop = () => () => {};

function getModKeySnapshot(): string {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
}

function getModKeyServerSnapshot(): string {
  return "Ctrl";
}

export function Sidebar({ onSearch, onSearchSelect }: SidebarProps) {
  const pathname = useLocation().pathname;
  const { guardedPush } = useNavigationGuard();
  const [searchOpen, setSearchOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, getSidebarCollapsedSnapshot, getSidebarCollapsedServerSnapshot);
  const modKey = useSyncExternalStore(subscribeNoop, getModKeySnapshot, getModKeyServerSnapshot);

  const toggleCollapsed = useCallback(() => {
    const current = getSidebarCollapsedSnapshot();
    const next = !current;
    try {
      preferencesStorage.set(STORAGE_KEY, next);
    } catch (e) {
      errorLogger.warn("[Sidebar] 保存折叠状态失败:", e instanceof Error ? e.message : e);
    }
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${next ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED}px`,
    );
    sidebarListeners.forEach(l => l());
  }, []);

  const handleNavClick = useCallback((href: string) => {
    guardedPush(href);
  }, [guardedPush]);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED}px`,
    );
  }, [collapsed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.getAttribute("contenteditable") === "true";

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "M") {
        e.preventDefault();
        guardedPush("/asset-library");
        return;
      }

      if (
        e.key === "/" &&
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !isInputFocused
      ) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      if (e.key === "Escape") {
        setShowShortcuts(false);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const saveEvent = new CustomEvent("app:save");
        document.dispatchEvent(saveEvent);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        const redoEvent = new CustomEvent("app:redo");
        document.dispatchEvent(redoEvent);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        const undoEvent = new CustomEvent("app:undo");
        document.dispatchEvent(undoEvent);
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [guardedPush]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const controller = new AbortController();
    const { signal } = controller;

    api.onMenuNewCharacter(() => {
      if (!signal.aborted) guardedPush("/characters");
    });
    api.onMenuNewScene(() => {
      if (!signal.aborted) guardedPush("/scenes");
    });
    api.onMenuExport(() => {
      if (!signal.aborted) guardedPush("/settings");
    });
    api.onNavigate((targetPath: string) => {
      if (!signal.aborted && targetPath) {
        guardedPush(targetPath);
      }
    });

    return () => {
      controller.abort();
      api.removeMenuListeners();
    };
  }, [guardedPush]);

  const sidebarWidth = collapsed
    ? SIDEBAR_WIDTH_COLLAPSED
    : SIDEBAR_WIDTH_EXPANDED;

  return (
    <>
      <aside
        className="fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        style={{ width: sidebarWidth }}
      >
        <div
          className={cn(
            "flex items-center border-b shrink-0",
            collapsed ? "justify-center h-14" : "gap-3 px-4 h-14",
          )}
        >
          <Link
            to="/"
            className="flex items-center gap-3"
            title="AI Animation Studio"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
              <Film className="w-4.5 h-4.5 text-white" />
            </div>
            {!collapsed && (
              <span className="font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400 whitespace-nowrap">
                AI Animation Studio
              </span>
            )}
          </Link>
        </div>

        <nav className="flex-1 flex flex-col gap-1 p-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              labelKey={item.labelKey}
              icon={item.icon}
              isActive={pathname.startsWith(item.href)}
              collapsed={collapsed}
              href={item.href}
              onNavigate={handleNavClick}
            />
          ))}
        </nav>

        <div className="border-t p-2 space-y-1 shrink-0">
          <button
            onClick={() => setSearchOpen(true)}
            className={cn(
              "flex items-center rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full",
              collapsed
                ? "justify-center h-10 w-10 mx-auto"
                : "gap-3 px-3 h-9",
            )}
            title={t("sidebar.search")}
          >
            <Search className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <>
                <span>{t("sidebar.search")}</span>
                <kbd className="ml-auto inline-flex h-5 select-none items-center gap-0.5 rounded border border-primary/20 bg-primary/5 px-1.5 font-mono text-[10px] font-medium text-primary">
                  {modKey}K
                </kbd>
              </>
            )}
          </button>

          <button
            onClick={() => setShowShortcuts(true)}
            className={cn(
              "flex items-center rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full",
              collapsed
                ? "justify-center h-10 w-10 mx-auto"
                : "gap-3 px-3 h-9",
            )}
            title={t("sidebar.shortcuts")}
          >
            <Keyboard className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{t("sidebar.shortcuts")}</span>}
          </button>

          {bottomItems.map((item) => (
            <NavItem
              key={item.href}
              labelKey={item.labelKey}
              icon={item.icon}
              isActive={pathname.startsWith(item.href)}
              collapsed={collapsed}
              href={item.href}
              onNavigate={handleNavClick}
            />
          ))}

          <ThemeSwitcher collapsed={collapsed} />

          <button
            onClick={toggleCollapsed}
            className={cn(
              "flex items-center rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full",
              collapsed
                ? "justify-center h-10 w-10 mx-auto"
                : "gap-3 px-3 h-9",
            )}
            title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          >
            {collapsed ? (
              <ChevronsRight className="w-4 h-4 shrink-0" />
            ) : (
              <>
                <ChevronsLeft className="w-4 h-4 shrink-0" />
                <span>{t("sidebar.collapseShort")}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <SearchDialog
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={onSearch || (async () => [])}
        onSelect={onSearchSelect || (() => {})}
      />

      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-background rounded-lg shadow-lg max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Keyboard className="w-5 h-5" />
                {t("sidebar.keyboardShortcuts")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowShortcuts(false)}
              >
                {t("common.close")}
              </Button>
            </div>
            <div className="space-y-3">
              {[
                [t("sidebar.globalSearch"), `${modKey}K`],
                [t("sidebar.openAssetLibrary"), `${modKey}⇧M`],
                [t("sidebar.showShortcutsHelp"), "?"],
                [t("sidebar.closeDialog"), "Esc"],
                [t("sidebar.saveEditPage"), `${modKey}S`],
                [t("sidebar.undo"), `${modKey}Z`],
                [t("sidebar.redo"), `${modKey}Shift Z`],
              ].map(([label, key]) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2 border-b last:border-b-0"
                >
                  <span className="text-sm">{label}</span>
                  <kbd className="inline-flex h-6 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-xs">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
