"use client";

import { useState } from "react";
import { useCurrentTime } from "@/shared/hooks/use-current-time";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import type { VideoTask } from "@/domain/schemas";
import { recoverVideoByTaskId } from "@/modules/video/recovery";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { errorLogger } from "@/shared/error-logger";

interface VideoTaskManagerProps {
  tasks: VideoTask[];
  pollTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  removeTasks: (taskIds: string[]) => void;
}

type TaskDisplayStatus = "pending" | "generating" | "completed" | "failed";

function getTaskDisplayStatus(task: VideoTask): TaskDisplayStatus {
  if (task.status === "completed") return "completed";
  if (task.status === "failed" || task.status === "cancelled") return "failed";
  if (task.status === "generating") return "generating";
  return "pending";
}

function formatTime(timestamp: string | undefined): string {
  if (!timestamp) return "未知";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "刚刚";
  if (ms < 60000) return `${Math.floor(ms / 1000)}秒前`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}分钟前`;
  return `${Math.floor(ms / 3600000)}小时前`;
}

function StatusBadge({ status }: { status: TaskDisplayStatus }) {
  const config = {
    pending: { color: "bg-yellow-900/50 text-yellow-300 border-yellow-700", icon: Clock, label: "等待中" },
    generating: { color: "bg-blue-900/50 text-blue-300 border-blue-700", icon: Loader2, label: "生成中", animate: true },
    completed: { color: "bg-green-900/50 text-green-300 border-green-700", icon: CheckCircle2, label: "已完成" },
    failed: { color: "bg-red-900/50 text-red-300 border-red-700", icon: AlertCircle, label: "失败" },
  }[status];

  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <Icon className={`w-3 h-3 ${(config as { animate?: boolean }).animate ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

interface TaskDetailDialogProps {
  task: VideoTask;
  isOpen: boolean;
  onClose: () => void;
  onRecover: () => void;
  onRemove: () => void;
}

function TaskDetailDialog({ task, isOpen, onClose, onRecover, onRemove }: TaskDetailDialogProps) {
  const [isRecovering, setIsRecovering] = useState(false);

  const handleRecover = async () => {
    setIsRecovering(true);
    try {
      await onRecover();
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            任务详情
          </DialogTitle>
          <DialogDescription>
            任务ID: {task.taskId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">当前状态</p>
              <StatusBadge status={getTaskDisplayStatus(task)} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">创建时间</p>
              <p className="text-sm font-medium">{formatTime(task.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">重试次数</p>
              <p className="text-sm font-medium">{task.recoveryAttempts || 0} / 60</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">提供者</p>
              <p className="text-sm font-medium">{task.providerId || "未知"}</p>
            </div>
          </div>

          {task.message && (
            <div>
              <p className="text-sm text-muted-foreground">状态消息</p>
              <p className="text-sm font-medium text-yellow-400">{task.message}</p>
            </div>
          )}

          {task.videoUrl && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">视频预览</p>
              <video
                src={resolveImageUrl(task.videoUrl)}
                controls
                className="w-full max-h-48 rounded-lg border border-border"
                onError={createVideoErrorHandler()}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="destructive" onClick={onRemove} disabled={isRecovering}>
            <Trash2 className="w-4 h-4 mr-2" />
            删除
          </Button>
          <Button
            variant="default"
            onClick={handleRecover}
            disabled={isRecovering || task.status === "completed"}
          >
            {isRecovering ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            重试
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VideoTaskManagerUI({ tasks, pollTask, removeTask, removeTasks }: VideoTaskManagerProps) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<VideoTask | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const now = useCurrentTime();

  const toggleTaskSelection = (taskId: string) => {
    const newSelected = new Set(selectedTaskIds);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTaskIds(newSelected);
  };

  const toggleExpanded = (taskId: string) => {
    setExpandedTaskId(expandedTaskId === taskId ? null : taskId);
  };

  const openTaskDetail = (task: VideoTask) => {
    setDetailTask(task);
    setIsDetailOpen(true);
  };

  const handleRecoverTask = async () => {
    if (detailTask) {
      const result = await recoverVideoByTaskId(detailTask.taskId);
      if (!result.ok) {
        errorLogger.warn("[VideoTaskManagerUI] 视频找回失败", result.error);
      }
    }
  };

  const handleRemoveTask = () => {
    if (detailTask) {
      removeTask(detailTask.taskId);
      setIsDetailOpen(false);
    }
  };

  const handleRemoveSelected = () => {
    if (selectedTaskIds.size > 0) {
      removeTasks(Array.from(selectedTaskIds));
      setSelectedTaskIds(new Set());
    }
  };

  const sortedTasks = [...tasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-4">
      {selectedTaskIds.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-red-900/20 border border-red-700 rounded-lg">
          <p className="text-sm text-red-300">
            已选择 {selectedTaskIds.size} 个任务
          </p>
          <Button variant="destructive" size="sm" onClick={handleRemoveSelected}>
            <Trash2 className="w-4 h-4 mr-2" />
            删除选中
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {sortedTasks.map((task) => (
          <Card key={task.taskId} className="overflow-hidden">
            <CardHeader
              className="pb-3 cursor-pointer"
              onClick={() => toggleExpanded(task.taskId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.has(task.taskId)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleTaskSelection(task.taskId);
                    }}
                    className="h-4 w-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500"
                  />
                  <StatusBadge status={getTaskDisplayStatus(task)} />
                  <div>
                    <CardTitle className="text-sm">
                      {task.prompt?.slice(0, 50) || "无提示词"}
                      {(task.prompt?.length || 0) > 50 ? "..." : ""}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {formatDuration(now - new Date(task.createdAt).getTime())} · {task.providerId || "未知"}
                      {task.storyId ? ` · 分镜: ${task.storyTitle || task.beatTitle || "关联故事"}` : " · 快速生成"}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getTaskDisplayStatus(task) === "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        pollTask(task.taskId);
                      }}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      重试
                    </Button>
                  )}
                  {task.videoUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTaskDetail(task);
                      }}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      查看
                    </Button>
                  )}
                  {expandedTaskId === task.taskId ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>

            {expandedTaskId === task.taskId && (
              <CardContent className="pt-0 space-y-4">
                {task.prompt && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">提示词</p>
                    <p className="text-sm bg-black/20 p-3 rounded">{task.prompt}</p>
                  </div>
                )}

                {task.videoUrl && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">视频</p>
                    <video
                      src={resolveImageUrl(task.videoUrl)}
                      controls
                      className="w-full max-h-48 rounded-lg border border-border"
                      onError={createVideoErrorHandler()}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openTaskDetail(task)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        查看详情
                      </Button>
                      <a
                        href={resolveImageUrl(task.videoUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                      >
                        <Button size="sm" variant="outline">
                          <Download className="w-4 h-4 mr-2" />
                          下载
                        </Button>
                      </a>
                    </div>
                  </div>
                )}

                {task.message && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">消息</p>
                    <p className="text-sm text-yellow-400">{task.message}</p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}

        {sortedTasks.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">暂无视频任务</p>
            </CardContent>
          </Card>
        )}
      </div>

      {detailTask && (
        <TaskDetailDialog
          task={detailTask}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          onRecover={handleRecoverTask}
          onRemove={handleRemoveTask}
        />
      )}
    </div>
  );
}
