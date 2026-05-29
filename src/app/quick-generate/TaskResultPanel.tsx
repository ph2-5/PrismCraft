"use client";

import { Film, Download, Layers, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Progress } from "@/shared/ui/progress";
import { type VideoTask } from "@/modules/video";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { confirm } from "@/shared/utils/confirm";

interface TaskResultPanelProps {
  currentTask: VideoTask | null;
  effectiveVideoUrl: string | null;
  tasks: VideoTask[];
  activeTaskId: string | null;
  isGenerating: boolean;
  onDownload: (videoUrl: string | undefined, filename: string) => void;
  onSaveToAssets: (task: VideoTask) => void;
  onRetry: (task: VideoTask) => void;
  onClearCompleted: () => void;
  characterPosterImage?: string | null;
}

export function TaskResultPanel({
  currentTask,
  effectiveVideoUrl,
  tasks,
  activeTaskId,
  isGenerating,
  onDownload,
  onSaveToAssets,
  onRetry,
  onClearCompleted,
  characterPosterImage,
}: TaskResultPanelProps) {
  return (
    <div className="space-y-6">
      {currentTask && (
        <Card className="border-2 border-purple-700/50 bg-slate-900/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Film className="w-5 h-5 text-purple-400" />
              当前任务
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">
                  {currentTask.status === "pending" && "排队中..."}
                  {currentTask.status === "generating" && "生成中..."}
                  {currentTask.status === "completed" && "已完成!"}
                  {currentTask.status === "failed" && "生成失败"}
                </span>
                <span className="text-slate-500">
                  {currentTask.progress}%
                </span>
              </div>
              <Progress
                value={currentTask.progress}
                className="bg-slate-800"
              />
            </div>

            {currentTask.status === "failed" && (
              <div className="flex items-start gap-2 p-3 bg-red-900/30 rounded-lg border border-red-800/50">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">
                  {currentTask.message || "生成失败，请重试"}
                </p>
              </div>
            )}

            {currentTask.status === "completed" &&
              effectiveVideoUrl && (
                <div className="space-y-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-700">
                    <video
                      src={effectiveVideoUrl}
                      controls
                      className="w-full h-full"
                      poster={characterPosterImage || undefined}
                      onError={createVideoErrorHandler()}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() =>
                        onDownload(
                          effectiveVideoUrl || "",
                          `quick-video-${Date.now()}.mp4`,
                        )
                      }
                    >
                      <Download className="w-4 h-4 mr-2" />
                      下载视频
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onSaveToAssets(currentTask)}
                    >
                      <Layers className="w-4 h-4 mr-2" />
                      保存
                    </Button>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {tasks.filter((t) => t.taskId !== activeTaskId).length > 0 && (
        <Card className="border border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">历史生成</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (
                    await confirm("确定要清空所有已完成的任务记录吗？", "清空任务记录")
                  ) {
                    onClearCompleted();
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                清空
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 max-h-96 overflow-y-auto">
            {tasks
              .filter((t) => t.taskId !== activeTaskId)
              .slice()
              .reverse()
              .map((task) => (
                <div
                  key={task.taskId}
                  className="p-3 rounded-lg bg-slate-800/50 border border-slate-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`
                        text-xs px-2 py-0.5 rounded-full
                        ${
                          task.status === "completed"
                            ? "bg-green-900/50 text-green-400"
                            : task.status === "failed"
                              ? "bg-red-900/50 text-red-400"
                              : "bg-yellow-900/50 text-yellow-400"
                        }
                      `}
                    >
                      {task.status === "completed" && "已完成"}
                      {task.status === "failed" && "失败"}
                      {["pending", "generating"].includes(task.status) &&
                        "处理中"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(task.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {task.videoUrl && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          onDownload(
                            task.videoUrl,
                            `quick-video-${task.taskId}.mp4`,
                          )
                        }
                      >
                        <Download className="w-4 h-4 mr-1" />
                        下载
                      </Button>
                    </div>
                  )}
                  {task.status === "failed" && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={isGenerating}
                        onClick={() => {
                          if (isGenerating) return;
                          onRetry(task);
                        }}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        重试
                      </Button>
                    </div>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Card className="border border-slate-800 bg-gradient-to-br from-purple-900/20 to-slate-900/60">
        <CardHeader>
          <CardTitle className="text-lg">温馨提示</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-400">
          <p>💡 详细的描述会获得更好的效果</p>
          <p>🎭 创建并锁定角色，可以确保视频中角色形象一致</p>
          <p>🏠 锁定场景，可以保持画面环境的连贯性</p>
          <p>⚙️ 需要更精细的控制？可以进入专业模式进行编辑</p>
        </CardContent>
      </Card>
    </div>
  );
}
