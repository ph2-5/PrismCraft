/**
 * Phase 7 节点化工作流 — 执行引擎
 *
 * 特性：
 * - 拓扑排序 + 按依赖深度分批，同批节点并行执行
 * - 暂停 / 恢复 / 停止（AbortSignal）
 * - 节点级状态、进度、执行日志
 * - 节点 executor 注册表（subtype → 执行函数），未注册的节点按"透传首个输入"兜底
 *
 * 内置 executor（在 register-builtin-executors 中注册）：
 * - input.*：返回 config.text
 * - prompt-generate：调用 textProvider.generateText（真实 LLM）
 * - 其他 process / output：透传首个上游输入
 */
import { container } from "@/infrastructure/di";
import type { Workflow, WorkflowNode } from "../domain/workflow-schema";
import { validateWorkflow } from "./workflow-validator";

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

  // 其他处理/输出节点：透传（业务节点后续按 subtype 注册）
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
