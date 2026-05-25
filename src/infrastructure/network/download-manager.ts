import type {
  DownloadTask,
  DownloadSource,
  DownloadProgress,
  DownloadState,
  TaskPriority,
} from "./types";
import { NETWORK_CONFIG } from "./network.config";
import { resilientFetch } from "./resilient-fetch";
import { errorLogger } from "@/shared/error-logger";

const tasks = new Map<string, DownloadTask>();
const taskControllers = new Map<string, AbortController>();
const taskProgress = new Map<string, DownloadProgress>();
const taskCallbacks = new Map<string, (progress: DownloadProgress) => void>();

let maxConcurrency = NETWORK_CONFIG.downloadManager.maxConcurrency;
let activeCount = 0;
const queue: string[] = [];
const AUTO_CLEANUP_DELAY = 30_000;

function generateId(): string {
  return `dm_${crypto.randomUUID()}`;
}

function priorityValue(priority: TaskPriority): number {
  switch (priority) {
    case "critical": return 3;
    case "normal": return 2;
    case "low": return 1;
  }
}

function sortQueue(): void {
  queue.sort((a, b) => {
    const taskA = tasks.get(a);
    const taskB = tasks.get(b);
    if (!taskA || !taskB) return 0;
    const priorityDiff = priorityValue(taskB.priority) - priorityValue(taskA.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return taskA.createdAt - taskB.createdAt;
  });
}

function selectSource(sources: DownloadSource[]): DownloadSource | null {
  if (sources.length === 0) return null;

  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;

  for (const source of sources) {
    random -= source.weight;
    if (random <= 0) return source;
  }

  return sources[0];
}

async function processTask(taskId: string): Promise<void> {
  const task = tasks.get(taskId);
  if (!task) return;

  task.state = "downloading";
  activeCount++;

  const controller = new AbortController();
  taskControllers.set(taskId, controller);

  const failedSources: Set<string> = new Set();

  const allSources: DownloadSource[] = [
    { url: task.url, type: "direct", weight: 10 },
    ...task.sources,
  ];

  while (failedSources.size < allSources.length) {
    const availableSources = allSources.filter((s) => !failedSources.has(s.url));
    const source = selectSource(availableSources);

    if (!source) break;

    try {
      const destFn = typeof task.destination === "function"
        ? task.destination
        : undefined;

      await resilientFetch({
        url: source.url,
        destination: destFn ?? (async () => {}) as (chunk: Uint8Array) => Promise<void>,
        onProgress: (progress) => {
          taskProgress.set(taskId, progress);
          taskCallbacks.get(taskId)?.(progress);
        },
        signal: controller.signal,
      });

      task.state = "completed";
      taskProgress.set(taskId, {
        loaded: 0,
        total: 0,
        percent: 100,
        speed: 0,
        eta: 0,
        state: "completed",
      });
      taskCallbacks.get(taskId)?.({
        loaded: 0,
        total: 0,
        percent: 100,
        speed: 0,
        eta: 0,
        state: "completed",
      });

      scheduleAutoCleanup(taskId);
      return;
    } catch {
      failedSources.add(source.url);
    }
  }

  task.state = "failed";
  taskProgress.set(taskId, {
    loaded: 0,
    total: 0,
    percent: 0,
    speed: 0,
    eta: 0,
    state: "failed",
  });

  scheduleAutoCleanup(taskId);
}

function scheduleAutoCleanup(taskId: string): void {
  setTimeout(() => {
    removeCompletedTask(taskId);
  }, AUTO_CLEANUP_DELAY);
}

async function processQueue(): Promise<void> {
  while (queue.length > 0 && activeCount < maxConcurrency) {
    const taskId = queue.shift();
    if (!taskId) break;

    const task = tasks.get(taskId);
    if (!task || task.state !== "idle") continue;

    processTask(taskId)
      .catch((err) => {
        errorLogger.warn("[DownloadManager] 下载任务处理失败", { taskId, error: err });
      })
      .finally(() => {
        activeCount--;
        taskControllers.delete(taskId);
        processQueue();
      });
  }
}

export function enqueueDownload(
  url: string,
  options?: {
    sources?: DownloadSource[];
    priority?: TaskPriority;
    destination?: string | ((chunk: Uint8Array) => Promise<void>);
    onProgress?: (progress: DownloadProgress) => void;
  },
): string {
  const id = generateId();

  const task: DownloadTask = {
    id,
    url,
    sources: options?.sources ?? [],
    priority: options?.priority ?? "normal",
    state: "idle",
    createdAt: Date.now(),
  };

  tasks.set(id, task);
  taskProgress.set(id, {
    loaded: 0,
    total: 0,
    percent: 0,
    speed: 0,
    eta: 0,
    state: "idle",
  });

  if (options?.onProgress) {
    taskCallbacks.set(id, options.onProgress);
  }

  task.destination = options?.destination;

  queue.push(id);
  sortQueue();
  processQueue();

  return id;
}

export function cancelDownload(taskId: string): void {
  const controller = taskControllers.get(taskId);
  if (controller) {
    controller.abort();
  }

  const task = tasks.get(taskId);
  if (task) {
    task.state = "failed";
  }

  const queueIndex = queue.indexOf(taskId);
  if (queueIndex !== -1) {
    queue.splice(queueIndex, 1);
  }

  taskControllers.delete(taskId);
  taskCallbacks.delete(taskId);
  taskProgress.delete(taskId);
  tasks.delete(taskId);
}

export function pauseDownload(taskId: string): void {
  const controller = taskControllers.get(taskId);
  if (controller) {
    controller.abort();
  }

  const task = tasks.get(taskId);
  if (task) {
    task.state = "idle";
  }

  taskProgress.set(taskId, {
    ...taskProgress.get(taskId)!,
    state: "paused" as DownloadState,
  });
}

export function resumeDownload(taskId: string): void {
  const task = tasks.get(taskId);
  if (!task || task.state === "completed") return;

  task.state = "idle";
  queue.push(taskId);
  sortQueue();
  processQueue();
}

export function getDownloadProgress(taskId: string): DownloadProgress {
  return taskProgress.get(taskId) ?? {
    loaded: 0,
    total: 0,
    percent: 0,
    speed: 0,
    eta: 0,
    state: "idle" as DownloadState,
  };
}

export function setMaxConcurrency(max: number): void {
  maxConcurrency = Math.max(1, max);
  processQueue();
}

export function getDownloadTask(taskId: string): DownloadTask | undefined {
  return tasks.get(taskId);
}

export function getAllTasks(): DownloadTask[] {
  return Array.from(tasks.values());
}

export function removeCompletedTask(taskId: string): void {
  const task = tasks.get(taskId);
  if (task && (task.state === "completed" || task.state === "failed")) {
    tasks.delete(taskId);
    taskProgress.delete(taskId);
    taskCallbacks.delete(taskId);
  }
}
