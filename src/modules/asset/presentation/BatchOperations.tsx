import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { t } from "@/shared/constants";
import type { BatchTask, Character, Scene, BatchTaskResult } from "@/domain/schemas";
import { Layers, Users, Image } from "lucide-react";
import { container } from "@/infrastructure/di";
import { extractErrorMessage } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import type { StyleOption } from "@/modules/character";
import { Modal } from "@/shared/presentation/Modal";
import { VariantGenerator } from "./VariantGenerator";
import { BatchProgressDialog } from "./BatchProgressDialog";
import { sleep } from "@/shared-logic/sleep";

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

const CHARACTER_STYLE_OPTIONS: readonly StyleOption[] = [
  { value: "日式动漫", labelKey: "styleOption.japanese-anime" },
  { value: "写实风格", labelKey: "styleOption.realistic" },
  { value: "卡通风格", labelKey: "styleOption.cartoon" },
  { value: "Q版/萌系", labelKey: "styleOption.chibi" },
  { value: "像素风格", labelKey: "styleOption.pixel" },
  { value: "水彩风格", labelKey: "styleOption.watercolor" },
  { value: "赛博朋克", labelKey: "styleOption.cyberpunk" },
  { value: "奇幻风格", labelKey: "styleOption.fantasy" },
  { value: "蒸汽朋克", labelKey: "styleOption.steampunk" },
  { value: "哥特风格", labelKey: "styleOption.gothic" },
  { value: "浮世绘", labelKey: "styleOption.ukiyoe" },
  { value: "油画风格", labelKey: "styleOption.oil-painting" },
  { value: "素描风格", labelKey: "styleOption.sketch" },
  { value: "3D渲染", labelKey: "styleOption.3d-render" },
  { value: "低多边形", labelKey: "styleOption.low-poly" },
  { value: "美式漫画", labelKey: "styleOption.american-comic" },
  { value: "韩漫风格", labelKey: "styleOption.korean-comic" },
  { value: "国风/古风", labelKey: "styleOption.chinese-classical" },
  { value: "未来主义", labelKey: "styleOption.futurism" },
  { value: "复古风", labelKey: "styleOption.retro" },
];

const SCENE_STYLE_OPTIONS: readonly StyleOption[] = [
  { value: "写实风格", labelKey: "styleOption.realistic" },
  { value: "卡通风格", labelKey: "styleOption.cartoon" },
  { value: "水彩风格", labelKey: "styleOption.watercolor" },
  { value: "油画风格", labelKey: "styleOption.oil-painting" },
  { value: "赛博朋克", labelKey: "styleOption.cyberpunk" },
  { value: "奇幻风格", labelKey: "styleOption.fantasy" },
  { value: "蒸汽朋克", labelKey: "styleOption.steampunk" },
  { value: "哥特风格", labelKey: "styleOption.gothic" },
  { value: "未来主义", labelKey: "styleOption.futurism" },
  { value: "复古风", labelKey: "styleOption.retro" },
  { value: "极简风格", labelKey: "styleOption.minimalist" },
  { value: "华丽风格", labelKey: "styleOption.ornate" },
];

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

  const styleOptions = useMemo<readonly StyleOption[]>(
    () => type === "character" ? CHARACTER_STYLE_OPTIONS : SCENE_STYLE_OPTIONS,
    [type],
  );

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
    const fallbackStyle = styleOptions[variantIndex % styleOptions.length]?.value ?? "";
    const style = selectedStyle || fallbackStyle;

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
          await sleep(CONCURRENCY_CONFIG.delayBetweenBatches);
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

    // 重置取消标志：上一次批次若被取消，isCancelledRef 仍为 true，会导致重试立即退出
    isCancelledRef.current = false;

    setTasks((prev) =>
      prev.map((t) =>
        t.status === "failed" ? { ...t, status: "pending", error: undefined } : t
      )
    );

    for (const task of failedTasks) {
      if (isCancelledRef.current) break; // 用户取消后停止重试剩余任务
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
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setOpen(true)}
      >
        <Layers className="h-4 w-4" />
        {t("batch.batchGenerate")}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={t("batch.generateVariantsTitle", { type: typeLabel })}
        style={{ maxWidth: "56rem", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }} className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5" />
            {t("batch.generateVariantsTitle", { type: typeLabel })}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            {t("batch.generateVariantsDesc", { count: items.length, type: typeLabel, variantCount })}
          </div>
        </div>

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
      </Modal>
    </>
  );
}
