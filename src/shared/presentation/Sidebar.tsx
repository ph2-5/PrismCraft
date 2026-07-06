import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import {
  Monitor,
  User,
  Image as ImageIcon,
  Settings,
  Video,
  Wand2,
  Folder,
  ChevronsLeft,
  ChevronsRight,
  Home,
  Book,
  MapPin,
  Link as LinkIcon,
  Film,
} from "lucide-react";
import { useState, useEffect, useCallback, useLayoutEffect, useSyncExternalStore, memo } from "react";
import { SearchDialog } from "./SearchDialog";
import { useNavigationGuard } from "./BeforeUnloadGuard";
import { errorLogger } from "@/shared/error-logger";
import { preferencesStorage } from "@/shared/utils/preferences";
import { isElectron } from "@/shared/utils/platform";
import { cn } from "@/shared/utils/utils";
import { t } from "@/shared/constants";
import type { SearchResult } from "@/domain/schemas";

interface SidebarProps {
  onSearch?: (term: string) => Promise<SearchResult[]>;
  onSearchSelect?: (result: SearchResult) => void;
}

// 编译器图标：对齐预览页面 inline SVG（image + 斜线，lucide 无完全匹配）
function ComposerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

interface NavEntry {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

const freeCreationItems: NavEntry[] = [
  { href: "/", labelKey: "sidebar.home", icon: Home },
  { href: "/characters", labelKey: "sidebar.characters", icon: User },
  { href: "/scenes", labelKey: "sidebar.scenes", icon: ImageIcon },
  { href: "/storyboard", labelKey: "sidebar.storyboard", icon: Monitor },
  { href: "/asset-library", labelKey: "sidebar.assetLibrary", icon: Folder },
  { href: "/video-tasks", labelKey: "sidebar.tasks", icon: Video },
  { href: "/quick-generate", labelKey: "sidebar.quickGenerate", icon: Wand2 },
];

const storyCreationItems: NavEntry[] = [
  { href: "/story", labelKey: "sidebar.story", icon: Book },
];

const toolItems: NavEntry[] = [
  { href: "/agent", labelKey: "sidebar.agent", icon: MapPin },
  { href: "/composer", labelKey: "sidebar.composer", icon: ComposerIcon },
];

const systemItems: NavEntry[] = [
  { href: "/plugins", labelKey: "sidebar.plugins", icon: LinkIcon },
  { href: "/settings", labelKey: "sidebar.settings", icon: Settings },
];

// 未来规划预览：已移除（1.0 限定核心工作流，Task 0.5.4）
// 路由配置保留在 router 中，URL 直接访问仍可进入 ComingSoon 页面

interface NavItemProps {
  labelKey: string;
  icon?: React.ComponentType<{ className?: string }>;
  emoji?: string;
  isActive: boolean;
  collapsed: boolean;
  href: string;
  onNavigate: (href: string) => void;
}

const NavItem = memo(function NavItem({ labelKey, icon: Icon, emoji, isActive, collapsed, href, onNavigate }: NavItemProps) {
  return (
    <button
      onClick={() => onNavigate(href)}
      className={cn("nav-item", isActive && "active")}
      style={collapsed ? { justifyContent: "center" } : undefined}
      title={collapsed ? t(labelKey) : undefined}
      aria-label={t(labelKey)}
    >
      {Icon && <Icon className="icon" />}
      {emoji && <span className="icon">{emoji}</span>}
      {!collapsed && <span>{t(labelKey)}</span>}
    </button>
  );
});

const SIDEBAR_WIDTH_EXPANDED = 220;
const SIDEBAR_WIDTH_COLLAPSED = 60;
const STORAGE_KEY = "sidebar-collapsed";

const sidebarListeners = new Set<() => void>();

const subscribeSidebar = (callback: () => void): (() => void) => {
  sidebarListeners.add(callback);
  return () => { sidebarListeners.delete(callback); };
};

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

function NavGroupLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />;
  return <div className="nav-section">{children}</div>;
}

function NavGroupHeader({ icon, title, desc, collapsed, withBorderTop = false }: { icon: React.ReactNode; title: string; desc: string; collapsed: boolean; withBorderTop?: boolean }) {
  if (collapsed) return <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />;
  const titlePadding = withBorderTop ? "12px 14px 2px" : "6px 14px 2px";
  return (
    <div style={withBorderTop ? { borderTop: "1px solid var(--border)", marginTop: 6 } : undefined}>
      <div style={{ padding: titlePadding, fontSize: 11, fontWeight: 700, color: "var(--fg)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center" }}>{icon}</span> {title}
      </div>
      <div style={{ padding: "2px 14px 6px", fontSize: 10, color: "var(--muted-fg)" }}>{desc}</div>
    </div>
  );
}

export function Sidebar({ onSearch, onSearchSelect }: SidebarProps): React.ReactElement {
  const pathname = useLocation().pathname;
  const { guardedPush } = useNavigationGuard();
  const [searchOpen, setSearchOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, getSidebarCollapsedSnapshot, getSidebarCollapsedServerSnapshot);

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
        return;
      }

      if (e.key === "Escape") {
        setSearchOpen(false);
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

  const isHomeActive = pathname === "/";
  const electron = isElectron();

  return (
    <>
      <aside
        className="sidebar"
        style={{
          width: sidebarWidth,
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          paddingTop: electron ? 36 : 0,
        } as React.CSSProperties}
      >
        <div
          className="sidebar-logo"
          style={{
            WebkitAppRegion: "drag",
            justifyContent: collapsed ? "center" : undefined,
          } as React.CSSProperties}
        >
          <Link
            to="/"
            title="PrismCraft"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <div
              className="sidebar-logo-icon"
            >
              <Film size={20} />
            </div>
            {!collapsed && (
              <span className="sidebar-logo-text">
                PrismCraft
              </span>
            )}
          </Link>
        </div>

        <nav style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {/* 自由创作 */}
          <NavGroupHeader
            icon={<Wand2 size={14} />}
            title={t("sidebar.freeCreation")}
            desc={t("sidebar.freeCreationDesc")}
            collapsed={collapsed}
          />
          {freeCreationItems.map((item) => (
            <NavItem
              key={item.href}
              labelKey={item.labelKey}
              icon={item.icon}
              isActive={item.href === "/" ? isHomeActive : pathname.startsWith(item.href)}
              collapsed={collapsed}
              href={item.href}
              onNavigate={handleNavClick}
            />
          ))}

          {/* 故事创作 */}
          <NavGroupHeader
            icon={<Book size={14} />}
            title={t("sidebar.storyCreation")}
            desc={t("sidebar.storyCreationDesc")}
            collapsed={collapsed}
            withBorderTop
          />
          {storyCreationItems.map((item) => (
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

          {/* 工具 */}
          <NavGroupLabel collapsed={collapsed}>{t("sidebar.tools")}</NavGroupLabel>
          {toolItems.map((item) => (
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

          {/* 系统 */}
          <NavGroupLabel collapsed={collapsed}>{t("sidebar.system")}</NavGroupLabel>
          {systemItems.map((item) => (
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

        <div style={{ borderTop: "1px solid var(--border)", padding: 8, flexShrink: 0 }}>
          <button
            onClick={toggleCollapsed}
            className="nav-item"
            style={collapsed ? { justifyContent: "center" } : undefined}
            title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          >
            {collapsed ? (
              <ChevronsRight className="icon" />
            ) : (
              <>
                <ChevronsLeft className="icon" />
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
    </>
  );
}
