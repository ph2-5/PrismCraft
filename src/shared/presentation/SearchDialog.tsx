import { useState, useRef, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";
import type { SearchResult } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { useNavigationGuard } from "./BeforeUnloadGuard";

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  onSearch: (term: string) => Promise<SearchResult[]>;
}

const ROUTE_MAP: Record<SearchResult["type"], string> = {
  character: "/characters",
  scene: "/scenes",
  story: "/story",
};

export function SearchDialog({ isOpen, onClose, onSelect, onSearch }: SearchDialogProps) {
  const { guardedPush } = useNavigationGuard();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchIdRef = useRef(0);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    performSearch(value);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="搜索角色、场景、故事..."
            className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
            autoFocus
          />
          {isSearching && (
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && searchTerm && !isSearching && (
            <div className="px-4 py-8 text-center text-gray-500">
              未找到匹配的结果
            </div>
          )}

          {results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => handleSelect(result)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {result.type === "character"
                      ? "角色"
                      : result.type === "scene"
                        ? "场景"
                        : "故事"}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {result.title}
                  </span>
                </div>
                {result.subtitle && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">
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
