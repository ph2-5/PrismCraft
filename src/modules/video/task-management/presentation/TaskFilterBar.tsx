import React from "react";
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
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="搜索任务ID、故事、分镜或模型..."
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
          <SelectValue placeholder="状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部状态</SelectItem>
          <SelectItem value="pending">等待中</SelectItem>
          <SelectItem value="generating">处理中</SelectItem>
          <SelectItem value="completed">已完成</SelectItem>
          <SelectItem value="failed">失败</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={timeRange}
        onValueChange={(v) => onTimeRangeChange(v as TimeRange)}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <Calendar className="w-3 h-3 mr-1" />
          <SelectValue placeholder="时间" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部时间</SelectItem>
          <SelectItem value="today">今天</SelectItem>
          <SelectItem value="week">本周</SelectItem>
          <SelectItem value="month">本月</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={groupBy}
        onValueChange={(v) => onGroupByChange(v as GroupBy)}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <Layers className="w-3 h-3 mr-1" />
          <SelectValue placeholder="分组" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="story">按故事</SelectItem>
          <SelectItem value="model">按模型</SelectItem>
          <SelectItem value="date">按日期</SelectItem>
          <SelectItem value="none">不分组</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={sortField}
        onValueChange={(v) => onSortFieldChange(v as SortField)}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <SelectValue placeholder="排序" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="createdAt">创建时间</SelectItem>
          <SelectItem value="progress">进度</SelectItem>
          <SelectItem value="status">状态</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => onSortDescChange(!sortDesc)}
      >
        {sortDesc ? "降序" : "升序"}
      </Button>
    </div>
  );
}
