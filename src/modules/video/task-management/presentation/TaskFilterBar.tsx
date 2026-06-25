import { Search } from "lucide-react";
import type { FilterStatus, SortField, GroupBy, TimeRange } from "./use-task-filter";
import { t } from "@/shared/constants";

interface TaskFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: FilterStatus;
  onStatusFilterChange: (value: FilterStatus) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  groupBy: GroupBy;
  onGroupByChange: (value: GroupBy) => void;
  sortField: SortField;
  onSortFieldChange: (value: SortField) => void;
  sortDesc: boolean;
  onSortDescChange: (value: boolean) => void;
}

export function TaskFilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  timeRange,
  onTimeRangeChange,
  groupBy,
  onGroupByChange,
  sortField,
  onSortFieldChange,
  sortDesc,
  onSortDescChange,
}: TaskFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-fg)" }} />
        <input
          className="input pl-8 h-8 text-sm"
          aria-label={t("task.searchPlaceholder")}
          placeholder={t("task.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <select
        className="select w-28 h-8 text-xs"
        aria-label={t("task.allStatus")}
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as FilterStatus)}
      >
        <option value="all">{t("task.allStatus")}</option>
        <option value="pending">{t("task.pendingStatus")}</option>
        <option value="generating">{t("task.processingStatus")}</option>
        <option value="completed">{t("task.completedStatus")}</option>
        <option value="failed">{t("task.failedStatus")}</option>
        <option value="timeout">{t("task.timeoutStatus")}</option>
      </select>
      <select
        className="select w-28 h-8 text-xs"
        aria-label={t("task.allTime")}
        value={timeRange}
        onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
      >
        <option value="all">{t("task.allTime")}</option>
        <option value="today">{t("task.today")}</option>
        <option value="week">{t("task.thisWeek")}</option>
        <option value="month">{t("task.thisMonth")}</option>
      </select>
      <select
        className="select w-28 h-8 text-xs"
        aria-label={t("task.groupByStory")}
        value={groupBy}
        onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
      >
        <option value="story">{t("task.groupByStory")}</option>
        <option value="model">{t("task.groupByModel")}</option>
        <option value="date">{t("task.groupByDate")}</option>
        <option value="none">{t("task.noGroup")}</option>
      </select>
      <select
        className="select w-28 h-8 text-xs"
        aria-label={t("task.sortByCreated")}
        value={sortField}
        onChange={(e) => onSortFieldChange(e.target.value as SortField)}
      >
        <option value="createdAt">{t("task.sortByCreated")}</option>
        <option value="progress">{t("task.sortByProgress")}</option>
        <option value="status">{t("task.sortByStatus")}</option>
      </select>
      <button
        type="button"
        className="btn btn-ghost btn-sm h-8 px-2"
        onClick={() => onSortDescChange(!sortDesc)}
      >
        {sortDesc ? t("task.descending") : t("task.ascending")}
      </button>
    </div>
  );
}
