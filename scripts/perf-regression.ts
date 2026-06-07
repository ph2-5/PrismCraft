#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";

const BASELINE_PATH = path.resolve(process.cwd(), ".perf-baseline.json");
const THRESHOLD_PERCENT = 10;

interface BenchmarkResult {
  name: string;
  mean: number;
  median: number;
  min: number;
  max: number;
  opsPerSec: number;
}

interface Baseline {
  timestamp: string;
  results: Record<string, BenchmarkResult>;
}

function loadBaseline(): Baseline | null {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) as Baseline;
  } catch {
    return null;
  }
}

function saveBaseline(results: Record<string, BenchmarkResult>): void {
  const baseline: Baseline = {
    timestamp: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
}

function formatDuration(ms: number): string {
  if (ms < 0.001) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function runBenchmark(name: string, fn: () => void, iterations: number): BenchmarkResult {
  const times: number[] = [];

  // warm-up
  for (let i = 0; i < Math.min(10, iterations); i++) {
    fn();
  }

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const median = times.length % 2 === 0
    ? (times[times.length / 2 - 1]! + times[times.length / 2]!) / 2
    : times[Math.floor(times.length / 2)]!;
  const min = times[0]!;
  const max = times[times.length - 1]!;
  const opsPerSec = 1000 / mean;

  return { name, mean, median, min, max, opsPerSec };
}

interface RegressionReport {
  name: string;
  current: BenchmarkResult;
  baseline?: BenchmarkResult;
  regression: boolean;
  improvement: boolean;
  changePercent: number;
}

function compareResults(
  current: Record<string, BenchmarkResult>,
  baseline: Baseline | null,
): RegressionReport[] {
  const reports: RegressionReport[] = [];

  for (const [name, result] of Object.entries(current)) {
    const base = baseline?.results[name];
    let changePercent = 0;
    let regression = false;
    let improvement = false;

    if (base) {
      changePercent = ((result.mean - base.mean) / base.mean) * 100;
      regression = changePercent > THRESHOLD_PERCENT;
      improvement = changePercent < -THRESHOLD_PERCENT;
    }

    reports.push({
      name,
      current: result,
      baseline: base,
      regression,
      improvement,
      changePercent,
    });
  }

  return reports;
}

function printReport(reports: RegressionReport[]): void {
  console.log("\n📊 性能回归检测报告\n");
  console.log("-".repeat(80));
  console.log(`${"Benchmark".padEnd(30)} ${"Current".padEnd(12)} ${"Baseline".padEnd(12)} ${"Change".padEnd(10)} Status`);
  console.log("-".repeat(80));

  let regressions = 0;
  let improvements = 0;

  for (const report of reports) {
    const currentStr = formatDuration(report.current.mean);
    const baselineStr = report.baseline ? formatDuration(report.baseline.mean) : "-";
    const changeStr = report.baseline
      ? `${report.changePercent > 0 ? "+" : ""}${report.changePercent.toFixed(1)}%`
      : "NEW";

    let status = "✅ OK";
    if (report.regression) {
      status = "❌ REGRESSION";
      regressions++;
    } else if (report.improvement) {
      status = "🚀 IMPROVED";
      improvements++;
    } else if (!report.baseline) {
      status = "🆕 NEW";
    }

    console.log(
      `${report.name.padEnd(30)} ${currentStr.padEnd(12)} ${baselineStr.padEnd(12)} ${changeStr.padEnd(10)} ${status}`,
    );
  }

  console.log("-".repeat(80));
  console.log(`\n总计: ${reports.length} 个基准测试`);
  if (regressions > 0) {
    console.log(`⚠️  发现 ${regressions} 个性能回归（阈值: +${THRESHOLD_PERCENT}%）`);
  }
  if (improvements > 0) {
    console.log(`🚀 ${improvements} 个性能提升`);
  }
  if (regressions === 0 && improvements === 0) {
    console.log("✅ 无显著性能变化");
  }
}

function main() {
  const args = process.argv.slice(2);
  const shouldUpdate = args.includes("--update") || args.includes("-u");

  console.log("🔬 运行性能基准测试...\n");

  const results: Record<string, BenchmarkResult> = {};

  // Benchmark 1: Result type creation
  results["result-ok-creation"] = runBenchmark("Result.ok creation", () => {
    const r = { ok: true as const, value: "test" };
    void r;
  }, 100000);

  results["result-err-creation"] = runBenchmark("Result.err creation", () => {
    const r = { ok: false as const, error: new Error("test") };
    void r;
  }, 100000);

  // Benchmark 2: Error classification
  results["error-classification"] = runBenchmark("Error classification", () => {
    const code = "TIMEOUT_ERROR";
    const msg = "Request timeout";
    const patterns = [
      { category: "timeout", codes: ["TIMEOUT", "ETIMEDOUT"], patterns: [/timeout/i] },
    ];
    for (const p of patterns) {
      if (p.codes.includes(code)) break;
      for (const regex of p.patterns) {
        if (regex.test(msg)) break;
      }
    }
  }, 50000);

  // Benchmark 3: UUID generation
  results["uuid-generation"] = runBenchmark("UUID generation", () => {
    const id = crypto.randomUUID();
    void id;
  }, 10000);

  // Benchmark 4: Image URL resolution
  results["resolve-image-url"] = runBenchmark("resolveImageUrl", () => {
    const url = "/api/images/test.png";
    const resolved = url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/api/");
    void resolved;
  }, 100000);

  // Benchmark 5: JSON parse
  results["json-parse"] = runBenchmark("JSON parse", () => {
    const data = JSON.parse('{"id":"test","name":"Test","value":42}');
    void data;
  }, 50000);

  const baseline = loadBaseline();
  const reports = compareResults(results, baseline);

  printReport(reports);

  if (shouldUpdate || !baseline) {
    saveBaseline(results);
    console.log(`\n💾 基线已更新: ${BASELINE_PATH}`);
  } else if (reports.some((r) => r.regression)) {
    console.log("\n⚠️  检测到性能回归！使用 `--update` 更新基线。");
    process.exit(1);
  }
}

main();
