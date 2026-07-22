/**
 * P1-1: 故事库管理页面（/stories）
 *
 * 整合 P1-2（状态枚举）、P1-3（复制）、P1-4（搜索）功能，
 * 提供故事项目的统一管理入口：搜索、状态筛选、排序、复制、归档、删除。
 *
 * 数据来源：useSearchStories（SQL 路径，支持 query/status/sort/paging）
 * 写操作：useUpdateStoryStatus / useDuplicateStory / useDeleteStory
 */
import { useMemo, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Plus,
  Search,
  Copy,
  Trash2,
  LayoutGrid,
  List,
  X,
  FolderOpen,
} from "lucide-react";
import { t } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { Modal } from "@/shared/presentation/Modal";
import { useToastHelpers } from "@/shared/presentation/Toast";
import {
  useSearchStories,
  useStoryCount,
  useUpdateStoryStatus,
  useDuplicateStory,
  useDeleteStory,
} from "@/modules/storyboard";
import type { StorySearchOptions } from "@/modules/storyboard";
import type { Story, StoryStatus } from "@/domain/schemas";
import { cn } from "@/shared/utils/utils";
import { StoryCard, StoryList } from "./StoryCard";

// ── 常量与类型 ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

type StatusFilter = "all" | StoryStatus;
type SortField = "updatedAt" | "createdAt" | "title";
type SortOrder = "asc" | "desc";
type ViewMode = "grid" | "list";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: t("story.filter.all") },
  { key: "draft", label: t("story.status.draft") },
  { key: "in_progress", label: t("story.status.in_progress") },
  { key: "completed", label: t("story.status.completed") },
  { key: "archived", label: t("story.status.archived") },
  { key: "abandoned", label: t("story.status.abandoned") },
];

// ── 主页面 ────────────────────────────────────────────────────────────────

export default function StoriesPage() {
  const navigate = useNavigate();
  const toast = useToastHelpers();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Story | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<Story | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const searchOptions = useMemo<StorySearchOptions>(
    () => ({
      query: searchQuery || undefined,
      status: statusFilter === "all" ? undefined : [statusFilter],
      sortBy,
      sortOrder,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [searchQuery, statusFilter, sortBy, sortOrder, page],
  );

  const countOptions = useMemo<StorySearchOptions>(
    () => ({
      query: searchQuery || undefined,
      status: statusFilter === "all" ? undefined : [statusFilter],
    }),
    [searchQuery, statusFilter],
  );

  const { data: stories = [], isLoading } = useSearchStories(searchOptions);
  const { data: totalCount = 0 } = useStoryCount(countOptions);
  const updateStatusMutation = useUpdateStoryStatus();
  const duplicateMutation = useDuplicateStory();
  const deleteMutation = useDeleteStory();

  const handleOpen = useCallback(
    (story: Story) => navigate(`/storyboard/${story.id}`),
    [navigate],
  );
  const handleNewStory = useCallback(() => navigate("/story"), [navigate]);

  const handleStatusChange = useCallback(
    async (story: Story, status: StoryStatus) => {
      try {
        await updateStatusMutation.mutateAsync({ id: story.id, status });
        toast.success(t("stories.statusUpdated"));
      } catch {
        toast.error(t("stories.statusUpdateFailed"));
      }
    },
    [updateStatusMutation, toast],
  );

  const handleDuplicateOpen = useCallback((story: Story) => {
    setDuplicateTarget(story);
    setDuplicateTitle(`${story.title} ${t("story.duplicate")}`);
  }, []);

  const handleDuplicateConfirm = useCallback(async () => {
    if (!duplicateTarget || !duplicateTitle.trim()) return;
    try {
      await duplicateMutation.mutateAsync({
        sourceId: duplicateTarget.id,
        newTitle: duplicateTitle.trim(),
      });
      toast.success(t("stories.duplicateSuccess"));
      setDuplicateTarget(null);
      setDuplicateTitle("");
    } catch {
      toast.error(t("stories.duplicateFailed"));
    }
  }, [duplicateTarget, duplicateTitle, duplicateMutation, toast]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(t("stories.deleteSuccess"));
      setDeleteTarget(null);
    } catch {
      toast.error(t("stories.deleteFailed"));
    }
  }, [deleteTarget, deleteMutation, toast]);

  const handleSortChange = useCallback((field: SortField) => {
    setSortBy(field);
    setPage(0);
  }, []);
  const handleSortOrderToggle = useCallback(() => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    setPage(0);
  }, []);
  const handleStatusFilterChange = useCallback((filter: StatusFilter) => {
    setStatusFilter(filter);
    setPage(0);
  }, []);

  const hasMore = stories.length < totalCount && stories.length > 0;
  const showEmpty = !isLoading && stories.length === 0;

  return (
    <PageErrorBoundary pageName={t("stories.pageTitle")}>
      <div className="fade-in flex flex-col h-full overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="home-story-icon w-10 h-10 rounded-[10px] flex items-center justify-center">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="text-lg font-bold">{t("stories.pageTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("stories.pageSubtitle")}</div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleNewStory}>
            <Plus size={14} className="inline-block mr-1" />
            {t("stories.newStory")}
          </button>
        </div>

        <StoriesToolbar
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          sortBy={sortBy}
          onSortByChange={handleSortChange}
          sortOrder={sortOrder}
          onSortOrderToggle={handleSortOrderToggle}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        <StoriesContent
          stories={stories}
          isLoading={isLoading}
          showEmpty={showEmpty}
          viewMode={viewMode}
          hasMore={hasMore}
          totalCount={totalCount}
          onLoadMore={() => setPage((p) => p + 1)}
          onNewStory={handleNewStory}
          onOpen={handleOpen}
          onDuplicate={handleDuplicateOpen}
          onStatusChange={handleStatusChange}
          onDelete={setDeleteTarget}
        />
      </div>

      <DeleteStoryDialog
        target={deleteTarget}
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
      <DuplicateStoryDialog
        target={duplicateTarget}
        title={duplicateTitle}
        onTitleChange={setDuplicateTitle}
        isPending={duplicateMutation.isPending}
        onCancel={() => setDuplicateTarget(null)}
        onConfirm={handleDuplicateConfirm}
      />
    </PageErrorBoundary>
  );
}

// ── 工具栏 ────────────────────────────────────────────────────────────────

interface StoriesToolbarProps {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  sortBy: SortField;
  onSortByChange: (field: SortField) => void;
  sortOrder: SortOrder;
  onSortOrderToggle: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

function StoriesToolbar({
  searchInput,
  onSearchInputChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderToggle,
  viewMode,
  onViewModeChange,
}: StoriesToolbarProps) {
  return (
    <div className="px-6 py-3 border-b border-border shrink-0 space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            className="input pl-9 pr-9 text-sm"
            placeholder={t("story.search.placeholder")}
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
          />
          {searchInput && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => onSearchInputChange("")}
              aria-label={t("common.close")}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button
            className={cn("btn btn-sm", viewMode === "grid" ? "btn-primary" : "btn-outline")}
            onClick={() => onViewModeChange("grid")}
            title={t("stories.viewGrid")}
            aria-label={t("stories.viewGrid")}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            className={cn("btn btn-sm", viewMode === "list" ? "btn-primary" : "btn-outline")}
            onClick={() => onViewModeChange("list")}
            title={t("stories.viewList")}
            aria-label={t("stories.viewList")}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              className={cn("btn btn-sm", statusFilter === tab.key ? "btn-primary" : "btn-outline")}
              onClick={() => onStatusFilterChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input text-sm py-1 px-2"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortField)}
            aria-label={t("story.sortBy.label")}
          >
            <option value="updatedAt">{t("story.sortBy.updatedAt")}</option>
            <option value="createdAt">{t("story.sortBy.createdAt")}</option>
            <option value="title">{t("story.sortBy.title")}</option>
          </select>
          <button
            className="btn btn-outline btn-sm"
            onClick={onSortOrderToggle}
            title={sortOrder === "asc" ? t("story.sortOrder.asc") : t("story.sortOrder.desc")}
            aria-label={t("story.sortOrder.asc")}
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 内容区 ────────────────────────────────────────────────────────────────

interface StoriesContentProps {
  stories: Story[];
  isLoading: boolean;
  showEmpty: boolean;
  viewMode: ViewMode;
  hasMore: boolean;
  totalCount: number;
  onLoadMore: () => void;
  onNewStory: () => void;
  onOpen: (story: Story) => void;
  onDuplicate: (story: Story) => void;
  onStatusChange: (story: Story, status: StoryStatus) => void;
  onDelete: (story: Story) => void;
}

function StoriesContent({
  stories,
  isLoading,
  showEmpty,
  viewMode,
  hasMore,
  totalCount,
  onLoadMore,
  onNewStory,
  onOpen,
  onDuplicate,
  onStatusChange,
  onDelete,
}: StoriesContentProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {isLoading ? (
        <div className="grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 skeleton-shimmer rounded-lg h-40" />
          ))}
        </div>
      ) : showEmpty ? (
        <EmptyState
          icon={FolderOpen}
          title={t("stories.emptyTitle")}
          description={t("stories.emptyDesc")}
          action={
            <button className="btn btn-primary" onClick={onNewStory}>
              <Plus size={16} className="inline-block mr-1" />
              {t("stories.emptyAction")}
            </button>
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onOpen={onOpen}
              onDuplicate={onDuplicate}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <StoryList
          stories={stories}
          onOpen={onOpen}
          onDuplicate={onDuplicate}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
        />
      )}

      {hasMore && !isLoading && (
        <div className="mt-6 text-center">
          <button className="btn btn-outline" onClick={onLoadMore} disabled={isLoading}>
            {t("stories.loadMore")}
          </button>
          <div className="text-xs text-muted-foreground mt-2">
            {t("story.search.resultsCount", { count: totalCount })}
          </div>
        </div>
      )}
      {!hasMore && stories.length > 0 && !isLoading && (
        <div className="mt-4 text-center text-xs text-muted-foreground">
          {t("stories.noMoreResults")}
        </div>
      )}
    </div>
  );
}

// ── 删除确认对话框 ─────────────────────────────────────────────────────────

function DeleteStoryDialog({
  target,
  isPending,
  onCancel,
  onConfirm,
}: {
  target: Story | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={target !== null} onClose={onCancel} ariaLabel={t("stories.confirmDeleteTitle")}>
      <div className="p-5" style={{ minWidth: 360 }}>
        <div className="flex items-center gap-2 text-base font-semibold mb-3">
          <Trash2 className="w-5 h-5 text-destructive" />
          {t("stories.confirmDeleteTitle")}
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t("stories.confirmDeleteDesc", { title: target?.title ?? "" })}
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onCancel} disabled={isPending}>
            {t("stories.cancel")}
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? t("common.deleting") : t("stories.delete")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── 复制对话框 ────────────────────────────────────────────────────────────

function DuplicateStoryDialog({
  target,
  title,
  onTitleChange,
  isPending,
  onCancel,
  onConfirm,
}: {
  target: Story | null;
  title: string;
  onTitleChange: (v: string) => void;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={target !== null} onClose={onCancel} ariaLabel={t("stories.duplicatePromptTitle")}>
      <div className="p-5" style={{ minWidth: 360 }}>
        <div className="flex items-center gap-2 text-base font-semibold mb-3">
          <Copy className="w-5 h-5" />
          {t("stories.duplicatePromptTitle")}
        </div>
        <p className="text-sm text-muted-foreground mb-3">{t("stories.duplicatePromptDesc")}</p>
        <input
          type="text"
          className="input text-sm w-full mb-4"
          placeholder={t("stories.duplicatePromptPlaceholder")}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm();
          }}
        />
        <div className="flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onCancel} disabled={isPending}>
            {t("stories.cancel")}
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={isPending || !title.trim()}
          >
            {isPending ? t("story.duplicating") : t("story.duplicate")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
