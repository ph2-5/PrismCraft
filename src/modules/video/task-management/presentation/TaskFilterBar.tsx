import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Search, Calendar, Layers } from "lucide-react";
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
        <Input
          placeholder={t("task.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>
      <Select
        value={statusFilter}
        onValueChange={(v) => onStatusFilterChange(v as FilterStatus)}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <SelectValue placeholder={t("task.statusLabel")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("task.allStatus")}</SelectItem>
          <SelectItem value="pending">{t("task.pendingStatus")}</SelectItem>
          <SelectItem value="generating">{t("task.processingStatus")}</SelectItem>
          <SelectItem value="completed">{t("task.completedStatus")}</SelectItem>
          <SelectItem value="failed">{t("task.failedStatus")}</SelectItem>
          <SelectItem value="timeout">{t("task.timeoutStatus")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={timeRange}
        onValueChange={(v) => onTimeRangeChange(v as TimeRange)}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <Calendar className="w-3 h-3 mr-1" />
          <SelectValue placeholder={t("task.allTime")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("task.allTime")}</SelectItem>
          <SelectItem value="today">{t("task.today")}</SelectItem>
          <SelectItem value="week">{t("task.thisWeek")}</SelectItem>
          <SelectItem value="month">{t("task.thisMonth")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={groupBy}
        onValueChange={(v) => onGroupByChange(v as GroupBy)}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <Layers className="w-3 h-3 mr-1" />
          <SelectValue placeholder={t("task.noGroup")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="story">{t("task.groupByStory")}</SelectItem>
          <SelectItem value="model">{t("task.groupByModel")}</SelectItem>
          <SelectItem value="date">{t("task.groupByDate")}</SelectItem>
          <SelectItem value="none">{t("task.noGroup")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={sortField}
        onValueChange={(v) => onSortFieldChange(v as SortField)}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <SelectValue placeholder={t("task.sortByCreated")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="createdAt">{t("task.sortByCreated")}</SelectItem>
          <SelectItem value="progress">{t("task.sortByProgress")}</SelectItem>
          <SelectItem value="status">{t("task.sortByStatus")}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => onSortDescChange(!sortDesc)}
      >
        {sortDesc ? t("task.descending") : t("task.ascending")}
      </Button>
    </div>
  );
}
