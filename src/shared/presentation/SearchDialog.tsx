import { useState, useRef, useCallback, useEffect } from "react";
import { Search, X, Loader2 } from "lucide-react";
import type { SearchResult } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { useNavigationGuard } from "./BeforeUnloadGuard";
import { t } from "@/shared/constants";

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  onSearch: (term: string) => Promise<SearchResult[]>;
}

const ROUTE_MAP: Record<SearchResult["type"], string> = {
  character: "/characters",
  scene: "/scenes",
  story: "/storyboard",
};

const SEARCH_DEBOUNCE_MS = 250;

export function SearchDialog({ isOpen, onClose, onSelect, onSearch }: SearchDialogProps) {
  const { guardedPush } = useNavigationGuard();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const performSearch = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }

    const searchId = ++searchIdRef.current;
    setIsSearching(true);

    try {
      const searchResults = await onSearch(searchTerm);
      if (searchId !== searchIdRef.current) return;
      setResults(searchResults.slice(0, 20));
    } catch (error) {
      errorLogger.error("搜索失败:", error);
    } finally {
      setIsSearching(false);
    }
  }, [onSearch]);

  // Debounced search: only fire after user stops typing for SEARCH_DEBOUNCE_MS
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      performSearch(searchTerm);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchTerm, performSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Focus trap + auto-focus on open
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = dialogRef.current;
    if (container) {
      const firstFocusable = container.querySelector<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      (firstFocusable ?? container).focus();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        const container = dialogRef.current;
        if (!container) return;
        const focusable = container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          e.preventDefault();
          container.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === container) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onSelect(result);
      onClose();
      const basePath = ROUTE_MAP[result.type];
      guardedPush(`${basePath}?highlight=${encodeURIComponent(result.id)}`);
    },
    [onSelect, onClose, guardedPush],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-2xl bg-background rounded-xl shadow-2xl border border-border overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={t("aria.searchDialog")}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            aria-label={t("aria.searchDialog")}
            value={searchTerm}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t("search.searchPlaceholder")}
            className="flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground"
          />
          {isSearching && (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-lg transition-colors"
            aria-label={t("aria.closeSearch")}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && searchTerm && !isSearching && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              {t("search.noResults")}
            </div>
          )}

          {results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => handleSelect(result)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-muted transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {result.type === "character"
                      ? t("search.typeCharacter")
                      : result.type === "scene"
                        ? t("search.typeScene")
                        : t("search.typeStory")}
                  </span>
                  <span className="font-medium text-foreground truncate">
                    {result.title}
                  </span>
                </div>
                {result.subtitle && (
                  <p className="mt-1 text-sm text-muted-foreground truncate">
                    {result.subtitle}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
