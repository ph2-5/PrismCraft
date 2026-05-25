import { useState, useMemo, useCallback } from "react";
import type { VideoTask } from "@/modules/video/task-management";
import { useCurrentTime } from "@/shared/hooks/use-current-time";

export type FilterStatus = "all" | "pending" | "generating" | "completed" | "failed";
export type SortField = "createdAt" | "updatedAt" | "status" | "progress";
export type GroupBy = "none" | "status" | "date" | "story" | "model";
export type TimeRange = "all" | "today" | "week" | "month";

export function useTaskFilter(tasks: VideoTask[]) {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const now = useCurrentTime();

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          (t.prompt && t.prompt.toLowerCase().includes(q)) ||
          (t.taskId && t.taskId.toLowerCase().includes(q)) ||
          (t.storyTitle && t.storyTitle.toLowerCase().includes(q)) ||
          (t.beatTitle && t.beatTitle.toLowerCase().includes(q)) ||
          (t.model && t.model.toLowerCase().includes(q))
      );
    }

    if (timeRange !== "all") {
      const ms = timeRange === "today" ? 86400000 : timeRange === "week" ? 604800000 : 2592000000;
      result = result.filter((t) => {
        const created = t.createdAt ? new Date(t.createdAt).getTime() : 0;
        return now - created < ms;
      });
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "createdAt") {
        cmp = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      } else if (sortField === "updatedAt") {
        cmp = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      } else if (sortField === "progress") {
        cmp = (b.progress || 0) - (a.progress || 0);
      } else {
        cmp = String(a.status || "").localeCompare(String(b.status || ""));
      }
      return sortDesc ? cmp : -cmp;
    });

    return result;
  }, [tasks, statusFilter, sortField, sortDesc, timeRange, searchQuery, now]);

  const groupedTasks = useMemo((): Record<string, VideoTask[]> => {
    if (groupBy === "none") return { all: filteredTasks };
    if (groupBy === "status") {
      const groups: Record<string, VideoTask[]> = {};
      for (const t of filteredTasks) {
        const key = t.status || "unknown";
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      }
      return groups;
    }
    if (groupBy === "story") {
      const groups: Record<string, VideoTask[]> = {};
      for (const t of filteredTasks) {
        const key = t.storyTitle || t.storyId || "others";
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      }
      return groups;
    }
    if (groupBy === "model") {
      const groups: Record<string, VideoTask[]> = {};
      for (const t of filteredTasks) {
        const key = t.model || "unknown";
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      }
      return groups;
    }
    const groups: Record<string, VideoTask[]> = {};
    for (const t of filteredTasks) {
      const d = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "unknown";
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    }
    return groups;
  }, [filteredTasks, groupBy]);

  return {
    filteredTasks,
    groupedTasks,
    statusFilter,
    setStatusFilter,
    sortField,
    setSortField,
    sortDesc,
    setSortDesc,
    groupBy,
    setGroupBy,
    timeRange,
    setTimeRange,
    searchQuery,
    setSearchQuery,
    collapsedGroups,
    toggleGroupCollapse,
  };
}
