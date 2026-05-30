"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Progress } from "@/shared/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import type { BatchTask, Character, Scene, BatchTaskResult } from "@/domain/schemas";
import { 
  Layers, 
  Users, 
  Image, 
  Wand2, 
  X, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  Grid3X3,
  List
} from "lucide-react";
import { ErrorDisplay, LoadingState } from "@/shared/ui/feedback";
import { container } from "@/infrastructure/di";
import { extractErrorMessage } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";

interface BatchOperationsProps {
  type: "character" | "scene";
  items: (Character | Scene)[];
  onComplete?: (results: BatchTaskResult[]) => void;
  onSave?: (itemId: string, imageUrl: string, variantIndex: number) => void;
}

// 并发控制配置
const CONCURRENCY_CONFIG = {
  maxConcurrent: 3,
  delayBetweenBatches: 500,
};

export function BatchOperations({ type, items, onComplete, onSave }: BatchOperationsProps) {
  const [open, setOpen] = useState(false);
  const [variantCount, setVariantCount] = useState(3);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());
  const [globalError, setGlobalError] = useState<string | null>(null);
  
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isCancelledRef = useRef(false);
  const activeIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  useEffect(() => {
    const currentIntervals = activeIntervalsRef.current;
    const currentControllers = abortControllersRef.current;
    return () => {
      for (const id of currentIntervals) {
        clearInterval(id);
      }
      for (const controller of currentControllers.values()) {
        controller.abort();
      }
      currentControllers.clear();
    };
  }, []);

  const typeLabel = type === "character" ? "角色" : "场景";
  const TypeIcon = type === "character" ? Users : Image;

  // 风格选项
  const styleOptions = useMemo(() => type === "character" 
    ? [
        "日式动漫", "写实风格", "卡通风格", "Q版/萌系", "像素风格",
        "水彩风格", "赛博朋克", "奇幻风格", "蒸汽朋克", "哥特风格",
        "浮世绘", "油画风格", "素描风格", "3D渲染", "低多边形",
        "美式漫画", "韩漫风格", "国风/古风", "未来主义", "复古风",
      ]
    : [
        "写实风格", "卡通风格", "水彩风格", "油画风格",
        "赛博朋克", "奇幻风格", "蒸汽朋克", "哥特风格",
        "未来主义", "复古风", "极简风格", "华丽风格",
      ], [type]);

  // 初始化任务
  const initializeTasks = useCallback(() => {
    const newTasks: BatchTask[] = [];
    items.forEach((item) => {
      for (let i = 0; i < variantCount; i++) {
        newTasks.push({
          id: `${item.id}_variant_${i}`,
          itemId: item.id,
          itemName: item.name || `未命名${typeLabel}`,
          status: "pending",
          progress: 0,
        });
      }
    });
    setTasks(newTasks);
    setSelectedResults(new Set());
    setGlobalError(null);
    return newTasks;
  }, [items, variantCount, typeLabel]);

  // 构建变体提示词
  const buildVariantPrompt = useCallback((item: Character | Scene, variantIndex: number) => {
    const basePrompt = item.prompt || item.description || "";
    const style = selectedStyle || styleOptions[variantIndex % styleOptions.length];
    
    const variations = [
      "正面视角，标准姿势",
      "侧面视角，动态姿势",
      "俯视角度，展示全貌",
      "特写镜头，强调细节",
      "全身照，展示整体",
      "半身照，突出上半身",
    ];
    
    const variation = variations[variantIndex % variations.length];
    
    if (type === "character") {
      return `${basePrompt}，${style}风格，${variation}，高质量，精细细节`;
    } else {
      return `${basePrompt}，${style}风格，${variation}，高质量，精细细节`;
    }
  }, [selectedStyle, styleOptions, type]);

  // 执行单个任务
  const executeTask = useCallback(async (task: BatchTask, item: Character | Scene) => {
    const controller = new AbortController();
    abortControllersRef.current.set(task.id, controller);

    try {
      // 更新任务状态为生成中
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: "generating", progress: 10 } : t
        )
      );

      const prompt = buildVariantPrompt(item, parseInt(task.id.split("_").pop() || "0") || 0);
      
      const progressInterval = setInterval(() => {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id && t.status === "generating"
              ? { ...t, progress: Math.min(t.progress + 10, 90) }
              : t
          )
        );
      }, 500);
      activeIntervalsRef.current.add(progressInterval);

      try {
        const result = await container.imageProvider.generateImage(prompt, type);

        clearInterval(progressInterval);
        activeIntervalsRef.current.delete(progressInterval);

        if (isCancelledRef.current) return null;

        const resultData: BatchTaskResult = {
          imageUrl: result.data?.imageUrl || "",
          source: "api",
          prompt,
        };

        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: "completed", progress: 100, result: resultData }
              : t
          )
        );

        return resultData;
      } catch (error) {
        clearInterval(progressInterval);
        activeIntervalsRef.current.delete(progressInterval);

        if (isCancelledRef.current) return null;

        const errorMessage = extractErrorMessage(error);
        
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: "failed", progress: 0, error: errorMessage }
              : t
          )
        );

        return null;
      } finally {
        abortControllersRef.current.delete(task.id);
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, status: "failed", progress: 0, error: errorMessage }
            : t
        )
      );
      return null;
    }
  }, [buildVariantPrompt, type]);

  // 批量生成（带并发控制）
  const startBatchGeneration = useCallback(async () => {
    if (items.length === 0) return;

    setIsGenerating(true);
    isCancelledRef.current = false;
    setGlobalError(null);
    
    const initialTasks = initializeTasks();
    const results: BatchTaskResult[] = [];

    try {
      // 按批次处理
      for (let i = 0; i < initialTasks.length; i += CONCURRENCY_CONFIG.maxConcurrent) {
        if (isCancelledRef.current) break;

        const batch = initialTasks.slice(i, i + CONCURRENCY_CONFIG.maxConcurrent);
        
        const batchPromises = batch.map(async (task) => {
          const item = items.find((it) => it.id === task.itemId);
          if (!item) return null;
          return executeTask(task, item);
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter((r): r is BatchTaskResult => r !== null));

        // 更新总体进度
        const completedCount = i + batch.length;
        setOverallProgress(Math.round((completedCount / initialTasks.length) * 100));

        // 批次间延迟
        if (i + CONCURRENCY_CONFIG.maxConcurrent < initialTasks.length) {
          await new Promise((resolve) => setTimeout(resolve, CONCURRENCY_CONFIG.delayBetweenBatches));
        }
      }

      if (!isCancelledRef.current) {
        onComplete?.(results);
      }
    } catch (error) {
      setGlobalError(extractErrorMessage(error));
      emitToast("error", "批量生成失败");
    } finally {
      setIsGenerating(false);
      setOverallProgress(0);
    }
  }, [items, initializeTasks, executeTask, onComplete]);

  // 取消生成
  const cancelGeneration = useCallback(() => {
    isCancelledRef.current = true;
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    for (const id of activeIntervalsRef.current) {
      clearInterval(id);
    }
    activeIntervalsRef.current.clear();
    setIsGenerating(false);
    setTasks((prev) =>
      prev.map((t) =>
        t.status === "generating" ? { ...t, status: "failed", error: "已取消" } : t
      )
    );
  }, []);

  // 重试失败的任务
  const retryFailed = useCallback(async () => {
    const failedTasks = tasks.filter((t) => t.status === "failed");
    if (failedTasks.length === 0) return;

    setTasks((prev) =>
      prev.map((t) =>
        t.status === "failed" ? { ...t, status: "pending", error: undefined } : t
      )
    );

    for (const task of failedTasks) {
      const item = items.find((it) => it.id === task.itemId);
      if (item) {
        await executeTask(task, item);
      }
    }
  }, [tasks, items, executeTask]);

  // 选择/取消选择结果
  const toggleResultSelection = useCallback((taskId: string) => {
    setSelectedResults((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  }, []);

  // 保存选中的结果
  const saveSelected = useCallback(() => {
    selectedResults.forEach((taskId) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task?.result?.imageUrl && task.status === "completed") {
        const variantIndex = parseInt(task.id.split("_").pop() || "0") || 0;
        onSave?.(task.itemId, task.result.imageUrl, variantIndex);
      }
    });
    setSelectedResults(new Set());
  }, [selectedResults, tasks, onSave]);

  // 下载所有结果
  const downloadAll = useCallback(() => {
    const completedTasks = tasks.filter((t) => t.status === "completed" && t.result?.imageUrl);
    completedTasks.forEach((task, index) => {
      if (task.result?.imageUrl) {
        const link = document.createElement("a");
        link.href = task.result.imageUrl;
        link.download = `${task.itemName}_variant_${index + 1}.png`;
        link.click();
      }
    });
  }, [tasks]);

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3"
      >
        <Layers className="h-4 w-4" />
        批量生成
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5" />
            批量生成{typeLabel}变体
          </DialogTitle>
          <DialogDescription>
            为选中的 {items.length} 个{typeLabel}各生成 {variantCount} 个变体
          </DialogDescription>
        </DialogHeader>

        {globalError && (
          <ErrorDisplay
            error={globalError}
            onRetry={startBatchGeneration}
            className="mb-4"
          />
        )}

        <div className="space-y-4">
          {/* 配置区域 */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label>每个{typeLabel}生成变体数</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={variantCount}
                onChange={(e) => setVariantCount(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 10))}
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-2">
              <Label>风格（可选）</Label>
              <Select
                value={selectedStyle}
                onValueChange={(value) => setSelectedStyle(value || "")}
                disabled={isGenerating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="自动选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">自动选择</SelectItem>
                  {styleOptions.map((style) => (
                    <SelectItem key={style} value={style}>
                      {style}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 进度区域 */}
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  总体进度: {completedCount}/{tasks.length}
                </span>
                <span className="text-sm font-medium">{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>
          )}

          {/* 统计信息 */}
          {tasks.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                完成: {completedCount}
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-red-500" />
                失败: {failedCount}
              </span>
              <span className="flex items-center gap-1">
                <Loader2 className="h-4 w-4 text-blue-500" />
                待处理: {pendingCount}
              </span>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            {!isGenerating ? (
              <Button
                onClick={startBatchGeneration}
                disabled={items.length === 0}
                className="gap-2"
              >
                <Wand2 className="h-4 w-4" />
                开始批量生成
              </Button>
            ) : (
              <Button variant="destructive" onClick={cancelGeneration} className="gap-2">
                <X className="h-4 w-4" />
                取消生成
              </Button>
            )}

            {failedCount > 0 && !isGenerating && (
              <Button variant="outline" onClick={retryFailed} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                重试失败项
              </Button>
            )}

            {completedCount > 0 && !isGenerating && (
              <>
                <Button variant="outline" onClick={downloadAll} className="gap-2">
                  <Download className="h-4 w-4" />
                  下载全部
                </Button>
                {selectedResults.size > 0 && (
                  <Button onClick={saveSelected} className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    保存选中 ({selectedResults.size})
                  </Button>
                )}
              </>
            )}

            {/* 视图切换 */}
            {tasks.length > 0 && (
              <div className="ml-auto flex items-center gap-1 border rounded-lg p-1">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* 结果展示 */}
          {tasks.length > 0 && (
            <Tabs defaultValue="all" className="w-full">
              <TabsList>
                <TabsTrigger value="all">全部 ({tasks.length})</TabsTrigger>
                <TabsTrigger value="completed">完成 ({completedCount})</TabsTrigger>
                <TabsTrigger value="failed">失败 ({failedCount})</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4">
                <TaskGrid
                  tasks={tasks}
                  viewMode={viewMode}
                  selectedResults={selectedResults}
                  onToggleSelection={toggleResultSelection}
                  isGenerating={isGenerating}
                />
              </TabsContent>

              <TabsContent value="completed" className="mt-4">
                <TaskGrid
                  tasks={tasks.filter((t) => t.status === "completed")}
                  viewMode={viewMode}
                  selectedResults={selectedResults}
                  onToggleSelection={toggleResultSelection}
                  isGenerating={isGenerating}
                />
              </TabsContent>

              <TabsContent value="failed" className="mt-4">
                <TaskGrid
                  tasks={tasks.filter((t) => t.status === "failed")}
                  viewMode={viewMode}
                  selectedResults={selectedResults}
                  onToggleSelection={toggleResultSelection}
                  isGenerating={isGenerating}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 任务网格/列表组件
interface TaskGridProps {
  tasks: BatchTask[];
  viewMode: "grid" | "list";
  selectedResults: Set<string>;
  onToggleSelection: (taskId: string) => void;
  isGenerating: boolean;
}

function TaskGrid({ tasks, viewMode, selectedResults, onToggleSelection, isGenerating }: TaskGridProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        暂无任务
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-3 gap-4">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            isSelected={selectedResults.has(task.id)}
            onToggleSelection={() => onToggleSelection(task.id)}
            isGenerating={isGenerating}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskListItem
          key={task.id}
          task={task}
          isSelected={selectedResults.has(task.id)}
          onToggleSelection={() => onToggleSelection(task.id)}
          isGenerating={isGenerating}
        />
      ))}
    </div>
  );
}

// 任务卡片
interface TaskCardProps {
  task: BatchTask;
  isSelected: boolean;
  onToggleSelection: () => void;
  isGenerating: boolean;
}

function TaskCard({ task, isSelected, onToggleSelection, isGenerating }: TaskCardProps) {
  const statusColors = {
    pending: "bg-gray-100",
    generating: "bg-blue-50",
    completed: "bg-green-50",
    failed: "bg-red-50",
  };

  return (
    <div
      className={`relative rounded-lg border-2 p-3 transition-all ${
        isSelected ? "border-blue-500" : "border-transparent"
      } ${statusColors[task.status]}`}
      onClick={task.status === "completed" && !isGenerating ? onToggleSelection : undefined}
    >
      {task.status === "completed" && task.result?.imageUrl && (
        <img
          src={task.result.imageUrl}
          alt={task.itemName}
          className="w-full h-32 object-cover rounded mb-2"
        />
      )}
      
      {task.status === "generating" && (
        <div className="w-full h-32 flex items-center justify-center bg-gray-100 rounded mb-2">
          <LoadingState message="生成中..." />
        </div>
      )}

      {task.status === "failed" && (
        <div className="w-full h-32 flex items-center justify-center bg-red-50 rounded mb-2 text-red-500">
          <AlertCircle className="h-8 w-8" />
        </div>
      )}

      {task.status === "pending" && (
        <div className="w-full h-32 flex items-center justify-center bg-gray-100 rounded mb-2 text-gray-400">
          等待中...
        </div>
      )}

      <div className="text-sm font-medium truncate">{task.itemName}</div>
      
      {task.status === "generating" && (
        <Progress value={task.progress} className="h-1 mt-2" />
      )}

      {task.status === "failed" && task.error && (
        <div className="text-xs text-red-500 mt-1 truncate">{task.error}</div>
      )}

      {isSelected && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
          <CheckCircle2 className="h-3 w-3" />
        </div>
      )}
    </div>
  );
}

// 任务列表项
type TaskListItemProps = TaskCardProps;

function TaskListItem({ task, isSelected, onToggleSelection, isGenerating }: TaskListItemProps) {
  const statusIcons = {
    pending: <Loader2 className="h-4 w-4 text-gray-400" />,
    generating: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    failed: <AlertCircle className="h-4 w-4 text-red-500" />,
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
        isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"
      }`}
      onClick={task.status === "completed" && !isGenerating ? onToggleSelection : undefined}
    >
      {statusIcons[task.status]}
      
      {task.status === "completed" && task.result?.imageUrl && (
        <img
          src={task.result.imageUrl}
          alt={task.itemName}
          className="w-12 h-12 object-cover rounded"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{task.itemName}</div>
        {task.status === "generating" && (
          <Progress value={task.progress} className="h-1 mt-1" />
        )}
        {task.status === "failed" && task.error && (
          <div className="text-xs text-red-500 truncate">{task.error}</div>
        )}
      </div>

      {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
    </div>
  );
}
