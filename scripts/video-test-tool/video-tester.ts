import fs from "fs";
import path from "path";
import os from "os";
import { challengingPrompts, getPromptById, getPromptsByComplexity } from "../../src/__tests__/test-helpers/test-prompts";
import { ALL_FEATURES, type TestExecutionConfig, type TestVideoResult, type CoverageMetrics } from "./types";

export function selectRandomTestCase(): typeof challengingPrompts[0] {
  const randomIndex = Math.floor(Math.random() * challengingPrompts.length);
  return challengingPrompts[randomIndex];
}

export function calculateCoverage(): CoverageMetrics {
  const coveredFeatures = new Set<string>();
  
  for (const prompt of challengingPrompts) {
    for (const feature of prompt.expectedFeatures) {
      coveredFeatures.add(feature);
    }
  }
  
  const remainingFeatures = ALL_FEATURES.filter(f => !coveredFeatures.has(f));
  
  return {
    totalFeatures: ALL_FEATURES.length,
    coveredFeatures: Array.from(coveredFeatures),
    remainingFeatures,
    coveragePercent: Math.round((coveredFeatures.size / ALL_FEATURES.length) * 100),
  };
}

export function getTestCaseById(id: string): typeof challengingPrompts[0] | undefined {
  return getPromptById(id);
}

export function listAllTestCases(): typeof challengingPrompts {
  return challengingPrompts;
}

export function generateOutputFilename(testCaseName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sanitizedName = testCaseName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "-");
  return `${sanitizedName}-${timestamp}.mp4`;
}

export function saveTestResult(result: TestVideoResult, outputDir: string): string {
  const dir = path.resolve(outputDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const resultFile = path.join(dir, `result-${result.testCaseId}-${result.timestamp}.json`);
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  
  return resultFile;
}

export function getDefaultOutputDir(): string {
  return path.join(os.homedir(), "ai-animation-test-videos");
}

export function formatCoverageReport(metrics: CoverageMetrics): string {
  let report = `\n=== 功能覆盖报告 ===\n`;
  report += `总功能数: ${metrics.totalFeatures}\n`;
  report += `已覆盖: ${metrics.coveredFeatures.length} (${metrics.coveragePercent}%)\n`;
  report += `未覆盖: ${metrics.remainingFeatures.length}\n\n`;
  
  report += `【已覆盖功能】:\n`;
  metrics.coveredFeatures.forEach((feature, idx) => {
    report += `  ${idx + 1}. ${feature}\n`;
  });
  
  if (metrics.remainingFeatures.length > 0) {
    report += `\n【未覆盖功能】:\n`;
    metrics.remainingFeatures.forEach((feature, idx) => {
      report += `  ${idx + 1}. ${feature}\n`;
    });
  }
  
  return report;
}

export function formatTestCaseInfo(testCase: typeof challengingPrompts[0]): string {
  return `\n=== 测试案例信息 ===\n` +
    `ID: ${testCase.id}\n` +
    `名称: ${testCase.name}\n` +
    `描述: ${testCase.description}\n` +
    `复杂度: ${testCase.complexity}\n` +
    `测试类型: ${testCase.testType}\n\n` +
    `【测试提示词】:\n${testCase.prompt}\n\n` +
    `【预期功能】:\n${testCase.expectedFeatures.map(f => `  • ${f}`).join("\n")}\n`;
}
