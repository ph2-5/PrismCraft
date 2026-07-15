/**
 * 全局搜索栏组件（Global Search Bar）
 *
 * 职责：
 * - 提供可嵌入任意位置的搜索触发按钮
 * - 监听 Ctrl+K / Cmd+K 快捷键唤起搜索弹窗
 * - 集成 SearchDialog + globalSearch 服务
 * - 支持点击结果跳转（使用 guardedPush）
 *
 * 使用方式：
 * ```tsx
 * <SearchBar />
 * ```
 *
 * 架构：
 *   SearchBar（本组件）
 *     → globalSearch（services/global-search.ts）
 *     → SearchDialog（@/shared/presentation/SearchDialog）
 *     → useNavigationGuard.guardedPush（路由跳转）
 */

import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { SearchDialog } from "@/shared/presentation/SearchDialog";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { t } from "@/shared/constants";
import { quickSearch, getSearchResultRoute } from "../services/global-search";
import type { SearchResult } from "@/domain/schemas";

interface SearchBarProps {
  /** 自定义触发按钮样式（如顶栏内嵌模式） */
  variant?: "button" | "inline";
  /** 是否启用 Ctrl+K 快捷键，默认 true */
  enableShortcut?: boolean;
  /** 自定义按钮文字 */
  buttonText?: string;
}

export function SearchBar({
  variant = "button",
  enableShortcut = true,
  buttonText,
}: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { guardedPush } = useNavigationGuard();

  // Ctrl+K / Cmd+K 快捷键
  useEffect(() => {
    if (!enableShortcut) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableShortcut]);

  const handleSearch = useCallback(async (term: string): Promise<SearchResult[]> => {
    return quickSearch(term);
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      const route = getSearchResultRoute(result);
      guardedPush(route);
    },
    [guardedPush],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (variant === "inline") {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted rounded-lg transition-colors w-64"
          aria-label={t("search.searchPlaceholder")}
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left">{buttonText ?? t("search.placeholder")}</span>
          <kbd className="text-xs px-1.5 py-0.5 bg-background border border-border rounded">
            Ctrl K
          </kbd>
        </button>
        <SearchDialog
          isOpen={isOpen}
          onClose={handleClose}
          onSearch={handleSearch}
          onSelect={handleSelect}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn btn-ghost btn-sm"
        aria-label={t("search.searchPlaceholder")}
        title={`${t("search.searchPlaceholder")} (Ctrl+K)`}
      >
        <Search className="w-4 h-4" />
        {buttonText && <span className="ml-1">{buttonText}</span>}
      </button>
      <SearchDialog
        isOpen={isOpen}
        onClose={handleClose}
        onSearch={handleSearch}
        onSelect={handleSelect}
      />
    </>
  );
}
