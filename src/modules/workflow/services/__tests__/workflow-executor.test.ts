/**
 * Phase 7 — workflow-executor 单元测试
 *
 * 用自定义 executor（避免真实 LLM 调用），验证引擎：
 * 顺序执行 / 并行 / 失败传播 / 停止。
 */
import { describe, it, expect } from "vitest";
import { WorkflowRunner, registerNodeExecutor } from "../workflow-executor";
import type { Workflow } from "../../domain/workflow-schema";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "t",
    name: "test",
    nodes: [
      { id: "in", kind: "input", subtype: "test-input", label: "in", config: { text: "hello" }, position: { x: 0, y: 0 } },
      { id: "proc", kind: "process", subtype: "test-echo", label: "proc", config: {}, position: { x: 0, y: 0 } },
      { id: "out", kind: "output", subtype: "test-collect", label: "out", config: {}, position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: "e1", source: "in", target: "proc" },
      { id: "e2", source: "proc", target: "out" },
    ],
    ...overrides,
  };
}

describe("WorkflowRunner", () => {
  it("按拓扑顺序执行并传递输出", async () => {
    const order: string[] = [];
    registerNodeExecutor("test-input", async (ctx) => {
      order.push(ctx.node.id);
      return { text: ctx.node.config.text ?? "" };
    });
    registerNodeExecutor("test-echo", async (ctx) => {
      order.push(ctx.node.id);
      const upstream = Object.values(ctx.inputs)[0] as { text?: string } | undefined;
      return { text: `echo:${upstream?.text ?? ""}` };
    });
    registerNodeExecutor("test-collect", async (ctx) => {
      order.push(ctx.node.id);
      return Object.values(ctx.inputs)[0] ?? null;
    });

    const runner = new WorkflowRunner();
    const run = await runner.execute(makeWorkflow());
    expect(order).toEqual(["in", "proc", "out"]);
    expect(run.status).toBe("completed");
    expect(run.progress).toBe(100);
    const outState = run.nodeStates["out"];
    expect((outState?.output as { text?: string }).text).toBe("echo:hello");
  });

  it("无依赖节点并行执行", async () => {
    const timings: string[] = [];
    registerNodeExecutor("test-parallel", async (ctx) => {
      await sleep(40);
      timings.push(`start:${ctx.node.id}`);
      await sleep(40);
      timings.push(`end:${ctx.node.id}`);
      return null;
    });

    const wf = makeWorkflow({
      nodes: [
        { id: "a", kind: "process", subtype: "test-parallel", label: "a", config: {}, position: { x: 0, y: 0 } },
        { id: "b", kind: "process", subtype: "test-parallel", label: "b", config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [],
    });
    const runner = new WorkflowRunner();
    const run = await runner.execute(wf);
    expect(run.status).toBe("completed");
    // 两个 start 都先于两个 end → 并行执行
    expect(timings[0]).toContain("start:");
    expect(timings[1]).toContain("start:");
  });

  it("节点失败 → 运行失败并记录错误", async () => {
    registerNodeExecutor("test-fail", async () => {
      throw new Error("boom");
    });
    const wf = makeWorkflow({
      nodes: [
        { id: "x", kind: "process", subtype: "test-fail", label: "x", config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [],
    });
    const runner = new WorkflowRunner();
    const run = await runner.execute(wf);
    expect(run.status).toBe("failed");
    expect(run.nodeStates["x"]?.status).toBe("failed");
    expect(run.nodeStates["x"]?.error).toContain("boom");
  });

  it("stop() 中止运行 → stopped", async () => {
    registerNodeExecutor("test-hang", async (ctx) => {
      await new Promise((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 2000);
        ctx.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
      return null;
    });
    const wf = makeWorkflow({
      nodes: [
        { id: "h", kind: "process", subtype: "test-hang", label: "h", config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [],
    });
    const runner = new WorkflowRunner();
    const promise = runner.execute(wf);
    await sleep(30);
    runner.stop();
    const run = await promise;
    expect(run.status).toBe("stopped");
  });
});
