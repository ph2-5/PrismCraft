import { useCallback } from "react";
import { Sidebar } from "@/shared/presentation/Sidebar";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { quickSearch, getSearchResultRoute } from "@/modules/search";
import type { SearchResult } from "@/domain/schemas";

export function SidebarWithSearch() {
  const { guardedPush } = useNavigationGuard();

  const handleSearch = useCallback(async (term: string): Promise<SearchResult[]> => {
    return quickSearch(term);
  }, []);

  const handleSearchSelect = useCallback(
    (result: SearchResult) => {
      // 使用 global-search 服务的统一路由逻辑
      const route = getSearchResultRoute(result);
      guardedPush(route);
    },
    [guardedPush],
  );

  return <Sidebar onSearch={handleSearch} onSearchSelect={handleSearchSelect} />;
}
