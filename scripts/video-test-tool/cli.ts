#!/usr/bin/env node

import { createInterface } from "readline";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  selectRandomTestCase,
  calculateCoverage,
  getTestCaseById,
  listAllTestCases,
  saveTestResult,
  getDefaultOutputDir,
  formatCoverageReport,
  formatTestCaseInfo,
} from "./video-tester";
import type { TestVideoResult } from "./types";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt: string): Promise<string> =>
  new Promise((resolve) => rl.question(prompt, resolve));

const PROVIDERS = [
  { id: "zhipu", name: "智谱AI (Zhipu)" },
  { id: "kuaishou", name: "快手 (Kuaishou)" },
  { id: "pixverse", name: "Pixverse" },
  { id: "seedance", name: "Seedance" },
  { id: "volcengine", name: "火山引擎 (Volcengine)" },
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
];

async function main(): Promise<void> {
  console.log("\n=== AI Animation Studio 视频测试工具 ===\n");
  console.log("本工具用于测试视频生成功能，支持随机选择测试案例并生成视频。\n");

  const coverage = calculateCoverage();
  console.log(formatCoverageReport(coverage));

  console.log("请选择服务提供商:");
  PROVIDERS.forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.name} (${p.id})`);
  });

  const providerChoice = await question("\n请选择提供商 (1-" + PROVIDERS.length + "): ");
  const providerIndex = parseInt(providerChoice) - 1;
  
  if (providerIndex < 0 || providerIndex >= PROVIDERS.length) {
    console.log("无效选择");
    rl.close();
    return;
  }

  const provider = PROVIDERS[providerIndex];
  const apiKey = await question(`请输入 ${provider.name} 的 API Key: `);
  
  if (!apiKey.trim()) {
    console.log("API Key 不能为空");
    rl.close();
    return;
  }

  console.log("\n=== 测试案例选择 ===");
  console.log("1. 随机选择一个测试案例");
  console.log("2. 查看所有测试案例并选择");
  console.log("3. 按ID选择测试案例");

  const choice = await question("\n请选择 (1-3): ");

  let testCase;

  switch (choice) {
    case "1":
      testCase = selectRandomTestCase();
      console.log("\n已随机选择测试案例:");
      console.log(formatTestCaseInfo(testCase));
      break;
    case "2":
      const testCases = listAllTestCases();
      console.log("\n可用测试案例:");
      testCases.forEach((tc, idx) => {
        console.log(`${idx + 1}. ${tc.name} [${tc.complexity}]`);
      });
      const tcChoice = await question("\n请选择测试案例序号: ");
      const tcIndex = parseInt(tcChoice) - 1;
      if (tcIndex < 0 || tcIndex >= testCases.length) {
        console.log("无效选择");
        rl.close();
        return;
      }
      testCase = testCases[tcIndex];
      console.log(formatTestCaseInfo(testCase));
      break;
    case "3":
      const tcId = await question("请输入测试案例ID: ");
      testCase = getTestCaseById(tcId);
      if (!testCase) {
        console.log(`未找到ID为 "${tcId}" 的测试案例`);
        rl.close();
        return;
      }
      console.log(formatTestCaseInfo(testCase));
      break;
    default:
      console.log("无效选择");
      rl.close();
      return;
  }

  const confirm = await question("\n确认开始生成视频? (Y/n): ");
  if (confirm.toLowerCase().startsWith("n")) {
    console.log("取消操作");
    rl.close();
    return;
  }

  console.log("\n=== 开始生成视频 ===");
  console.log(`提供商: ${provider.name}`);
  console.log(`测试案例: ${testCase.name}`);
  console.log("请稍候，视频生成可能需要几分钟...\n");

  const outputDir = getDefaultOutputDir();
  const timestamp = Date.now();

  try {
    const envVars = {
      ...process.env,
      [`TEST_API_KEY_${provider.id.toUpperCase()}`]: apiKey,
    };

    const result = await generateVideoWithApi(
      testCase.prompt,
      apiKey,
      provider.id,
      outputDir
    );

    if (result.success) {
      console.log("\n✅ 视频生成成功!");
      console.log(`视频路径: ${result.localPath || result.videoUrl}`);
      
      const testResult: TestVideoResult = {
        success: true,
        videoUrl: result.videoUrl,
        localPath: result.localPath,
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        prompt: testCase.prompt,
        duration: result.duration,
        timestamp,
      };

      const resultFile = saveTestResult(testResult, outputDir);
      console.log(`测试结果已保存: ${resultFile}`);

      const openChoice = await question("\n是否打开视频文件? (Y/n): ");
      if (openChoice.toLowerCase() !== "n") {
        openVideo(result.localPath || result.videoUrl);
      }
    } else {
      console.log("\n❌ 视频生成失败:");
      console.log(result.error);

      const testResult: TestVideoResult = {
        success: false,
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        prompt: testCase.prompt,
        error: result.error,
        timestamp,
      };

      saveTestResult(testResult, outputDir);
    }
  } catch (error) {
    console.error("\n❌ 发生错误:", error);
  }

  rl.close();
}

async function generateVideoWithApi(
  prompt: string,
  apiKey: string,
  providerId: string,
  outputDir: string
): Promise<{ success: boolean; videoUrl?: string; localPath?: string; duration?: number; error?: string }> {
  try {
    const response = await fetch("http://localhost:3001/api/generate-video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-Provider-ID": providerId,
      },
      body: JSON.stringify({
        prompt,
        duration: 10,
        format: "mp4",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || "生成失败" };
    }

    if (data.success && data.videoUrl) {
      return {
        success: true,
        videoUrl: data.videoUrl,
        duration: data.duration,
      };
    }

    return { success: false, error: data.message || "未返回视频URL" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function openVideo(filePath: string): void {
  try {
    if (process.platform === "win32") {
      execSync(`start "" "${filePath}"`);
    } else if (process.platform === "darwin") {
      execSync(`open "${filePath}"`);
    } else {
      execSync(`xdg-open "${filePath}"`);
    }
    console.log("正在打开视频...");
  } catch (error) {
    console.log(`无法自动打开视频，请手动访问: ${filePath}`);
  }
}

main().catch(console.error);
