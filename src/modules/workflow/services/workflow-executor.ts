/**
 * Phase 7 节点化工作流 — 执行引擎
 *
 * 特性：
 * - 拓扑排序 + 按依赖深度分批，同批节点并行执行
 * - 暂停 / 恢复 / 停止（AbortSignal）
 * - 节点级状态、进度、执行日志
 * - 节点 executor 注册表（subtype → 执行函数），未注册的节点按"透传首个输入"兜底
 *
 * 内置 executor（在 registerBuiltinExecutors 中注册）：
 * - input.*：返回 config.text
 * - prompt-generate / style-transfer：调用 textProvider.generateText（真实 LLM）
 * - character-extract / scene-extract：LLM 结构化提取角色 / 场景
 * - shot-breakdown：复用 generateStoryPlanWithValidation 拆解分镜（LLM + 校验重试）
 * - consistency-check：有上游图片时走 VLM 一致性检查，无图时占位放行
 * - video-generate：复用 video task 管线（useVideoTaskStore.createTask），批量/单条提交
 * - image-generate：调用 imageProvider.generateImage
 * - export / render：汇总上游输出为结构化 JSON / 摘要
 */
import { container } from "@/infrastructure/di";
import type { Workflow, WorkflowNode } from "../domain/workflow-schema";
import { validateWorkflow } from "./workflow-validator";
import { generateStoryPlanWithValidation } from "@/shared-logic/story";
import { checkVisualConsistency } from "@/modules/shot";
import { useVideoTaskStore } from "@/modules/video/task-management";
import type { StoryBeat, StoryElement } from "@/domain/schemas";

// ─── 状态类型 ────────────────────────────────────────────────────────────────

export type NodeExecutionStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type WorkflowRunStatus = "idle" | "running" | "paused" | "completed" | "failed" | "stopped";

export interface NodeRunState {
  id: string;
  status: NodeExecutionStatus;
  output: unknown;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
}

export interface LogEntry {
  time: number;
  level: "info" | "warn" | "error";
  message: string;
  nodeId?: string;
}

export interface RunState {
  id: string;
  status: WorkflowRunStatus;
  nodeStates: Record<string, NodeRunState>;
  progress: number; // 0-100
  log: LogEntry[];
  startedAt?: number;
  finishedAt?: number;
}

// ─── Executor 注册表 ─────────────────────────────────────────────────────────

export interface NodeExecutionContext {
  node: WorkflowNode;
  /** 上游节点输出（key = 上游节点 id） */
  inputs: Record<string, unknown>;
  signal: AbortSignal;
  log: (message: string, level?: "info" | "warn" | "error") => void;
}

export type NodeExecutor = (ctx: NodeExecutionContext) => Promise<unknown>;

const executorRegistry = new Map<string, NodeExecutor>();

export function registerNodeExecutor(subtype: string, executor: NodeExecutor): void {
  executorRegistry.set(subtype, executor);
}

export function getNodeExecutor(subtype: string): NodeExecutor | undefined {
  return executorRegistry.get(subtype);
}

/** 兜底执行器：透传第一个上游输入（或 null） */
const passthroughExecutor: NodeExecutor = async (ctx) => {
  const first = Object.values(ctx.inputs)[0];
  return first ?? null;
};

// ─── 内置 executor（业务真实执行） ────────────────────────────────────────────

/** 从上游输出中提取文本（{text} 对象或原始字符串），多输入用空行拼接 */
function extractTextInputs(inputs: Record<string, unknown>): string {
  return Object.values(inputs)
    .map((v) => {
      if (v && typeof v === "object" && "text" in v) return String((v as { text: unknown }).text ?? "");
      return typeof v === "string" ? v : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

/** 从上游输出中提取指定数组字段（characters / scenes / beats），支持顶层与嵌套两种形态 */
function extractArrayField(inputs: Record<string, unknown>, field: string): unknown[] {
  if (field in inputs && Array.isArray(inputs[field])) return inputs[field] as unknown[];
  for (const value of Object.values(inputs)) {
    if (value && typeof value === "object" && field in value) {
      const arr = (value as Record<string, unknown>)[field];
      if (Array.isArray(arr)) return arr;
    }
  }
  return [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** 从 LLM 输出中提取 JSON 数组（容忍代码块 / 前后缀文本） */
function extractJsonArray(text: string): unknown[] | null {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const bracketMatch = text.match(/\[[\s\S]*?\]/);
  const candidate = codeBlock?.[1] ?? bracketMatch?.[0];
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate.trim());
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type LlmTaskType = "character_extraction" | "scene_extraction" | "story_planning" | "frame_prompt";

async function callTextProvider(prompt: string, taskType: LlmTaskType, modelId?: string): Promise<string> {
  const res = await container.textProvider.generateText(prompt, {
    modelId: modelId || undefined,
    taskType,
  });
  if (!res.success || !res.data?.text) {
    const detail = !res.success ? (typeof res.error === "string" ? res.error : "unknown error") : "empty response";
    throw new Error(`LLM call failed: ${detail}`);
  }
  return res.data.text;
}

/** 从上游输出中定位第一个图片 / 视频 URL（供一致性检查 / 渲染使用） */
function collectOutputMediaUrl(inputs: Record<string, unknown>): string | undefined {
  const findInRecord = (record: Record<string, unknown>): string | undefined => {
    if (typeof record.imageUrl === "string" && record.imageUrl) return record.imageUrl;
    if (typeof record.videoUrl === "string" && record.videoUrl) return record.videoUrl;
    if (Array.isArray(record.images) && record.images.length > 0) {
      const first = toRecord(record.images[0]);
      if (typeof first.imageUrl === "string" && first.imageUrl) return first.imageUrl;
      if (typeof first.url === "string" && first.url) return first.url;
    }
    if (Array.isArray(record.tasks)) {
      for (const task of record.tasks) {
        const t = toRecord(task);
        if (typeof t.videoUrl === "string" && t.videoUrl) return t.videoUrl;
      }
    }
    return undefined;
  };
  for (const value of Object.values(inputs)) {
    if (!value || typeof value !== "object") continue;
    const direct = findInRecord(value as Record<string, unknown>);
    if (direct) return direct;
    // 递归一层（嵌套结果对象）
    for (const nested of Object.values(value as Record<string, unknown>)) {
      if (nested && typeof nested === "object") {
        const nestedUrl = findInRecord(nested as Record<string, unknown>);
        if (nestedUrl) return nestedUrl;
      }
    }
  }
  return undefined;
}

/** 从上游 characters 构造 StoryElement[]（供一致性检查绑定） */
function buildElementsFromInputs(inputs: Record<string, unknown>): StoryElement[] {
  return extractArrayField(inputs, "characters")
    .map((c, i) => {
      const r = toRecord(c);
      return {
        id: `wf-char-${i}`,
        type: "character",
        name: String(r.name ?? ""),
        description: String(r.description ?? r.appearance ?? ""),
      } as StoryElement;
    })
    .filter((el) => el.name.length > 0);
}

function buildConsistencyBeat(label: string, elements: StoryElement[]): StoryBeat {
  return {
    id: `wf-beat-${label}`,
    sequence: 1,
    title: label,
    content: label,
    description: label,
    duration: 5,
    type: "action",
    characterIds: elements.map((el) => el.id),
    elementIds: elements.map((el) => el.id),
    enhancedGeneration: false,
  } as StoryBeat;
}

export function registerBuiltinExecutors(): void {
  // 输入节点：产出 config.text
  for (const subtype of ["text", "novel", "script", "prompt"] as const) {
    registerNodeExecutor(subtype, async (ctx) => {
      const text = typeof ctx.node.config.text === "string" ? ctx.node.config.text : "";
      if (!text) {
        ctx.log(`input "${ctx.node.label}" has no text content`, "warn");
      }
      return { text };
    });
  }

  // prompt-generate：调用真实 LLM
  registerNodeExecutor("prompt-generate", async (ctx) => {
    const upstreamTexts = Object.values(ctx.inputs)
      .map((v) => (v && typeof v === "object" && "text" in v ? String((v as { text: unknown }).text) : String(v ?? "")))
      .filter(Boolean);
    const configPrompt = typeof ctx.node.config.prompt === "string" ? ctx.node.config.prompt : "";
    const prompt = [configPrompt, ...upstreamTexts].filter(Boolean).join("\n\n");
    if (!prompt) {
      throw new Error(`prompt-generate "${ctx.node.label}" has empty prompt`);
    }
    const modelId = typeof ctx.node.config.modelId === "string" ? ctx.node.config.modelId : undefined;
    ctx.log("calling textProvider.generateText…");
    const res = await container.textProvider.generateText(prompt, {
      modelId: modelId || undefined,
      taskType: "frame_prompt",
    });
    if (!res.success || !res.data) {
      throw new Error(`LLM call failed: ${res.error ?? "unknown error"}`);
    }
    return { text: res.data.text };
  });

  // character-extract：LLM 结构化提取角色
  registerNodeExecutor("character-extract", async (ctx) => {
    const text = extractTextInputs(ctx.inputs);
    if (!text) throw new Error(`character-extract "${ctx.node.label}" requires text input`);
    const modelId = typeof ctx.node.config.modelId === "string" ? ctx.node.config.modelId : undefined;
    ctx.log("extracting characters via LLM…");
    const raw = await callTextProvider(
      `从以下小说/剧本文本中提取主要角色，以 JSON 数组返回，每项包含 name、description、appearance 三个字段：\n\n${text.slice(0, 12000)}`,
      "character_extraction",
      modelId,
    );
    const characters = (extractJsonArray(raw) ?? [])
      .map((item) => {
        const r = toRecord(item);
        return {
          name: String(r.name ?? "").trim(),
          description: String(r.description ?? "").trim(),
          appearance: String(r.appearance ?? "").trim(),
        };
      })
      .filter((c) => c.name.length > 0);
    if (characters.length === 0) {
      throw new Error(`character-extract "${ctx.node.label}" failed to parse characters`);
    }
    ctx.log(`extracted ${characters.length} characters`);
    return { characters };
  });

  // scene-extract：LLM 结构化提取场景
  registerNodeExecutor("scene-extract", async (ctx) => {
    const text = extractTextInputs(ctx.inputs);
    if (!text) throw new Error(`scene-extract "${ctx.node.label}" requires text input`);
    const modelId = typeof ctx.node.config.modelId === "string" ? ctx.node.config.modelId : undefined;
    ctx.log("extracting scenes via LLM…");
    const raw = await callTextProvider(
      `从以下小说/剧本文本中提取主要场景，以 JSON 数组返回，每项包含 name、description、type 三个字段：\n\n${text.slice(0, 12000)}`,
      "scene_extraction",
      modelId,
    );
    const scenes = (extractJsonArray(raw) ?? [])
      .map((item) => {
        const r = toRecord(item);
        return {
          name: String(r.name ?? "").trim(),
          description: String(r.description ?? "").trim(),
          type: String(r.type ?? "indoor").trim(),
        };
      })
      .filter((s) => s.name.length > 0);
    if (scenes.length === 0) {
      throw new Error(`scene-extract "${ctx.node.label}" failed to parse scenes`);
    }
    ctx.log(`extracted ${scenes.length} scenes`);
    return { scenes };
  });

  // shot-breakdown：复用故事分镜生成管线（LLM + JSON 校验 + 重试）
  registerNodeExecutor("shot-breakdown", async (ctx) => {
    const text = extractTextInputs(ctx.inputs);
    if (!text) throw new Error(`shot-breakdown "${ctx.node.label}" requires text input`);
    const characters = extractArrayField(ctx.inputs, "characters");
    const scenes = extractArrayField(ctx.inputs, "scenes");
    ctx.log("generating story plan via LLM…");
    const result = await generateStoryPlanWithValidation(
      { description: text },
      characters,
      scenes,
      { enhancedGeneration: true, maxRetries: 3 },
      async (prompt, opts) =>
        container.textProvider.generateText(prompt, {
          maxTokens: typeof opts.maxTokens === "number" ? opts.maxTokens : 4000,
          temperature: typeof opts.temperature === "number" ? opts.temperature : 0.7,
          taskType: "story_planning",
        }),
    );
    ctx.log(`generated ${result.beats.length} beats (auto-fixed ${result.autoFixedCount})`);
    return { beats: result.beats };
  });

  // consistency-check：有上游图片时走 VLM 一致性检查，无图时占位放行
  registerNodeExecutor("consistency-check", async (ctx) => {
    const imageUrl = collectOutputMediaUrl(ctx.inputs);
    if (!imageUrl) {
      ctx.log("no generated image upstream, consistency check skipped", "warn");
      return { consistency: { passed: true, recommendation: "accept", note: "no image input" } };
    }
    const elements = buildElementsFromInputs(ctx.inputs);
    const beat = buildConsistencyBeat(ctx.node.label, elements);
    ctx.log("running visual consistency check via VLM…");
    const result = await checkVisualConsistency({ beat, elements, generatedImageUrl: imageUrl });
    if (!result.ok) {
      throw new Error(`Consistency check failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
    }
    ctx.log(`consistency ${result.value.passed ? "passed" : "failed"} (score ${result.value.overallScore})`);
    return { consistency: result.value };
  });

  // style-transfer：LLM 风格改写
  registerNodeExecutor("style-transfer", async (ctx) => {
    const text = extractTextInputs(ctx.inputs);
    if (!text) throw new Error(`style-transfer "${ctx.node.label}" requires text input`);
    const style = String(ctx.node.config.style ?? "").trim();
    ctx.log(`applying style transfer${style ? ` (${style})` : ""}…`);
    const prompt = style
      ? `请将以下内容改写为「${style}」风格，保持核心信息不变：\n\n${text.slice(0, 12000)}`
      : `请对以下内容进行艺术化润色改写，保持核心信息不变：\n\n${text.slice(0, 12000)}`;
    const modelId = typeof ctx.node.config.modelId === "string" ? ctx.node.config.modelId : undefined;
    const raw = await callTextProvider(prompt, "frame_prompt", modelId);
    return { text: raw.trim() };
  });

  // video-generate：复用 video task 管线（批量 beats 或单条文本）
  registerNodeExecutor("video-generate", async (ctx) => {
    const modelId = typeof ctx.node.config.modelId === "string" && ctx.node.config.modelId ? ctx.node.config.modelId : undefined;
    const providerId = typeof ctx.node.config.providerId === "string" && ctx.node.config.providerId ? ctx.node.config.providerId : undefined;
    const beats = extractArrayField(ctx.inputs, "beats");
    const tasks: Array<Record<string, unknown>> = [];
    if (beats.length > 0) {
      for (const beat of beats) {
        if (ctx.signal.aborted) break;
        const r = toRecord(beat);
        const prompt = String(r.content ?? r.title ?? "").trim();
        if (!prompt) continue;
        ctx.log(`creating video task for "${String(r.title ?? r.id ?? "")}"…`);
        const task = await useVideoTaskStore.getState().createTask(prompt, {
          beatId: typeof r.id === "string" ? r.id : undefined,
          beatTitle: typeof r.title === "string" ? r.title : undefined,
          providerId,
          modelId,
        });
        tasks.push({ beatId: r.id, taskId: task?.taskId ?? null, status: task?.status ?? "failed" });
      }
    } else {
      const text = extractTextInputs(ctx.inputs);
      if (!text) throw new Error(`video-generate "${ctx.node.label}" requires text or beats input`);
      ctx.log("creating video task…");
      const task = await useVideoTaskStore.getState().createTask(text, { providerId, modelId });
      tasks.push({ taskId: task?.taskId ?? null, status: task?.status ?? "failed" });
    }
    if (tasks.length === 0) throw new Error(`video-generate "${ctx.node.label}" created no tasks`);
    ctx.log(`submitted ${tasks.length} video task(s)`);
    return { tasks };
  });

  // image-generate：调用 imageProvider.generateImage
  registerNodeExecutor("image-generate", async (ctx) => {
    const text = extractTextInputs(ctx.inputs);
    if (!text) throw new Error(`image-generate "${ctx.node.label}" requires text input`);
    const modelId = typeof ctx.node.config.modelId === "string" && ctx.node.config.modelId ? ctx.node.config.modelId : undefined;
    ctx.log("generating image via imageProvider…");
    const res = await container.imageProvider.generateImage(text.slice(0, 4000), "scene", { modelId: modelId || undefined });
    if (!res.success || !res.data) {
      throw new Error(`Image generation failed: ${!res.success ? res.error : "empty result"}`);
    }
    ctx.log(`image generated: ${res.data.imageUrl.slice(0, 80)}`);
    return { images: [{ imageUrl: res.data.imageUrl, prompt: res.data.prompt }] };
  });

  // export：汇总上游输出为可下载 JSON
  registerNodeExecutor("export", async (ctx) => {
    const payload = { exportedAt: new Date().toISOString(), outputs: ctx.inputs };
    const json = JSON.stringify(payload, null, 2);
    ctx.log(`exported ${Object.keys(ctx.inputs).length} upstream output(s), ${json.length} bytes`);
    return { export: { json, size: json.length, nodeCount: Object.keys(ctx.inputs).length } };
  });

  // render：聚合上游输出为结构化摘要
  registerNodeExecutor("render", async (ctx) => {
    const summary: Record<string, unknown> = { renderedAt: new Date().toISOString(), upstreamCount: Object.keys(ctx.inputs).length };
    for (const [key, value] of Object.entries(ctx.inputs)) {
      if (Array.isArray(value)) {
        summary[key] = `array[${value.length}]`;
      } else if (value && typeof value === "object") {
        const keys = Object.keys(value as Record<string, unknown>);
        summary[key] = keys.length > 0 ? `object{${keys.slice(0, 5).join(",")}}` : "object{}";
      } else {
        summary[key] = value;
      }
    }
    ctx.log(`render aggregated ${summary.upstreamCount} upstream output(s)`);
    return { render: summary };
  });

  // 其他未注册节点：透传（兜底）
  registerNodeExecutor("default", passthroughExecutor);
}

// ─── 执行引擎 ─────────────────────────────────────────────────────────────────

export interface WorkflowRunOptions {
  onStateChange?: (run: RunState) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WorkflowRunner {
  private _run: RunState | null = null;
  private _controller: AbortController | null = null;
  private _paused = false;
  private _onStateChange: ((run: RunState) => void) | null = null;

  get run(): RunState | null {
    return this._run;
  }

  get isRunning(): boolean {
    return this._run?.status === "running" || this._run?.status === "paused";
  }

  async execute(workflow: Workflow, options: WorkflowRunOptions = {}): Promise<RunState> {
    this._onStateChange = options.onStateChange ?? null;
    this._controller = new AbortController();
    this._paused = false;

    const validation = validateWorkflow(workflow.nodes, workflow.edges);
    if (!validation.valid) {
      throw new Error(
        `Workflow validation failed: ${validation.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`,
      );
    }

    const run: RunState = {
      id: `run-${Date.now().toString(36)}`,
      status: "running",
      nodeStates: Object.fromEntries(workflow.nodes.map((n) => [n.id, { id: n.id, status: "pending" as const, output: null }])),
      progress: 0,
      log: [],
      startedAt: Date.now(),
    };
    this._run = run;
    this.emit(run);

    const log = (message: string, level: LogEntry["level"] = "info", nodeId?: string) => {
      run.log.push({ time: Date.now(), level, message, nodeId });
      this.emit(run);
    };

    try {
      // 分批：按最长前驱链深度分组，同批并行
      const batches = this.computeBatches(workflow);
      const outputs = new Map<string, unknown>();

      let completed = 0;
      const total = workflow.nodes.length;
      for (const batch of batches) {
        if (this._controller.signal.aborted) {
          run.status = "stopped";
          this.emit(run);
          return run;
        }
        await this.waitIfPaused(log);

        await Promise.all(
          batch.map(async (nodeId) => {
            if (this._controller?.signal.aborted) return;
            const node = workflow.nodes.find((n) => n.id === nodeId)!;
            const nodeState = run.nodeStates[nodeId]!;
            nodeState.status = "running";
            nodeState.startedAt = Date.now();
            this.emit(run);

            try {
              const inputs: Record<string, unknown> = {};
              for (const edge of workflow.edges) {
                if (edge.target === nodeId && outputs.has(edge.source)) {
                  inputs[edge.source] = outputs.get(edge.source);
                }
              }
              const executor = getNodeExecutor(node.subtype) ?? getNodeExecutor("default")!;
              const output = await executor({
                node,
                inputs,
                signal: this._controller?.signal ?? new AbortController().signal,
                log: (msg, level = "info") => log(msg, level, nodeId),
              });
              outputs.set(nodeId, output);
              nodeState.status = "completed";
              nodeState.output = output;
            } catch (err) {
              if (this._controller?.signal.aborted) {
                // 主动停止：不标记失败
                nodeState.status = "skipped";
                run.status = "stopped";
                log(`node "${node.label}" stopped`, "warn", nodeId);
                return;
              }
              nodeState.status = "failed";
              nodeState.error = err instanceof Error ? err.message : String(err);
              run.status = "failed";
              log(`node "${node.label}" failed: ${nodeState.error}`, "error", nodeId);
            }
            nodeState.finishedAt = Date.now();
            nodeState.durationMs = nodeState.finishedAt - (nodeState.startedAt ?? nodeState.finishedAt);
            completed += 1;
            run.progress = Math.round((completed / total) * 100);
            this.emit(run);
          }),
        );

        if (run.status === "failed") break;
      }

      if (run.status === "running") {
        run.status = "completed";
        run.progress = 100;
        log("workflow completed", "info");
      }
    } finally {
      run.finishedAt = Date.now();
      this.emit(run);
      this._controller = null;
    }
    return run;
  }

  pause(): void {
    if (this._run?.status === "running") {
      this._paused = true;
      this._run.status = "paused";
      this.emit(this._run);
    }
  }

  resume(): void {
    if (this._run?.status === "paused") {
      this._paused = false;
      this._run.status = "running";
      this.emit(this._run);
    }
  }

  stop(): void {
    this._paused = false;
    this._controller?.abort();
  }

  /** 按最长前驱链深度分组（输入节点深度 0，同层并行） */
  private computeBatches(workflow: Workflow): string[][] {
    const nodeIds = workflow.nodes.map((n) => n.id);
    const idSet = new Set(nodeIds);
    // reverseAdj: target → sources（前驱）
    const reverseAdj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
    for (const e of workflow.edges) {
      if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
      reverseAdj.get(e.target)?.push(e.source);
    }
    const memo = new Map<string, number>();
    const computeDepth = (id: string): number => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      const preds = reverseAdj.get(id) ?? [];
      const d = preds.length === 0 ? 0 : Math.max(...preds.map((p) => computeDepth(p) + 1));
      memo.set(id, d);
      return d;
    };
    for (const id of nodeIds) computeDepth(id);

    const maxDepth = Math.max(0, ...Array.from(memo.values()));
    const batches: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
    for (const id of nodeIds) {
      batches[memo.get(id) ?? 0]!.push(id);
    }
    return batches;
  }

  private async waitIfPaused(log: (m: string, l?: LogEntry["level"], n?: string) => void): Promise<void> {
    while (this._paused && !this._controller?.signal.aborted) {
      log("paused…", "warn");
      await sleep(100);
    }
  }

  private emit(run: RunState): void {
    this._onStateChange?.(run);
  }
}

/** 模块级单例（hook 持有） */
export const workflowRunner = new WorkflowRunner();
