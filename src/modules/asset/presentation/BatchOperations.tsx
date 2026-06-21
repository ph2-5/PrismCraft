import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { t } from "@/shared/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import type { BatchTask, Character, Scene, BatchTaskResult } from "@/domain/schemas";
import { Layers, Users, Image } from "lucide-react";
import { container } from "@/infrastructure/di";
import { extractErrorMessage } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { VariantGenerator } from "./VariantGenerator";
import { BatchProgressDialog } from "./BatchProgressDialog";

interface BatchOperationsProps {
  type: "character" | "scene";
  items: (Character | Scene)[];
  onComplete?: (results: BatchTaskResult[]) => void;
  onSave?: (itemId: string, imageUrl: string, variantIndex: number) => void;
}

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
  const activeIntervalsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

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

  const typeLabel = type === "character" ? t("search.typeCharacter") : t("search.typeScene");
  const TypeIcon = type === "character" ? Users : Image;

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

  const initializeTasks = useCallback(() => {
    const newTasks: BatchTask[] = [];
    items.forEach((item) => {
      for (let i = 0; i < variantCount; i++) {
        newTasks.push({
          id: `${item.id}_variant_${i}`,
          itemId: item.id,
          itemName: item.name || (type === "character" ? t("character.unnamed") : t("scene.unnamed")),
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

  const executeTask = useCallback(async (task: BatchTask, item: Character | Scene) => {
    const controller = new AbortController();
    abortControllersRef.current.set(task.id, controller);

    try {
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

  const startBatchGeneration = useCallback(async () => {
    if (items.length === 0) return;

    setIsGenerating(true);
    isCancelledRef.current = false;
    setGlobalError(null);

    const initialTasks = initializeTasks();
    const results: BatchTaskResult[] = [];

    try {
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

        const completedCount = i + batch.length;
        setOverallProgress(Math.round((completedCount / initialTasks.length) * 100));

        if (i + CONCURRENCY_CONFIG.maxConcurrent < initialTasks.length) {
          await new Promise((resolve) => setTimeout(resolve, CONCURRENCY_CONFIG.delayBetweenBatches));
        }
      }

      if (!isCancelledRef.current) {
        onComplete?.(results);
      }
    } catch (error) {
      setGlobalError(extractErrorMessage(error));
      emitToast("error", t("batch.generateFailed"));
    } finally {
      setIsGenerating(false);
      setOverallProgress(0);
    }
  }, [items, initializeTasks, executeTask, onComplete]);

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
      prev.map((task) =>
        task.status === "generating" ? { ...task, status: "failed", error: t("video.cancelled") } : task
      )
    );
  }, []);

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
        {t("batch.batchGenerate")}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5" />
            {t("batch.generateVariantsTitle", { type: typeLabel })}
          </DialogTitle>
          <DialogDescription>
            {t("batch.generateVariantsDesc", { count: items.length, type: typeLabel, variantCount })}
          </DialogDescription>
        </DialogHeader>

        <VariantGenerator
          typeLabel={typeLabel}
          variantCount={variantCount}
          onVariantCountChange={setVariantCount}
          selectedStyle={selectedStyle}
          onSelectedStyleChange={setSelectedStyle}
          styleOptions={styleOptions}
          isGenerating={isGenerating}
        />

        <BatchProgressDialog
          tasks={tasks}
          isGenerating={isGenerating}
          overallProgress={overallProgress}
          completedCount={completedCount}
          failedCount={failedCount}
          pendingCount={pendingCount}
          selectedResults={selectedResults}
          viewMode={viewMode}
          globalError={globalError}
          hasItems={items.length > 0}
          onStartGeneration={startBatchGeneration}
          onCancelGeneration={cancelGeneration}
          onRetryFailed={retryFailed}
          onDownloadAll={downloadAll}
          onSaveSelected={saveSelected}
          onToggleResultSelection={toggleResultSelection}
          onViewModeChange={setViewMode}
          onRetryGlobalError={startBatchGeneration}
        />
      </DialogContent>
    </Dialog>
  );
}
