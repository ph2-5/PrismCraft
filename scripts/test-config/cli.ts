#!/usr/bin/env node

import { createInterface } from "readline";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  loadConfig,
  saveConfig,
  addApiKey,
  removeApiKey,
  getEnabledApiKeys,
  updateTestOptions,
} from "./config-manager";
import type { TestConfig, TestApiKey } from "./types";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt: string): Promise<string> =>
  new Promise((resolve) => rl.question(prompt, resolve));

const PROVIDERS = [
  { id: "zhipu", name: "智谱AI (Zhipu)", format: "zhipu" },
  { id: "kuaishou", name: "快手 (Kuaishou)", format: "kuaishou" },
  { id: "pixverse", name: "Pixverse", format: "pixverse" },
  { id: "seedance", name: "Seedance", format: "seedance" },
  { id: "volcengine", name: "火山引擎 (Volcengine)", format: "volcengine" },
  { id: "anthropic", name: "Anthropic", format: "anthropic" },
  { id: "openai", name: "OpenAI", format: "openai" },
];

async function showMainMenu(): Promise<void> {
  const config = loadConfig();
  const enabledKeys = getEnabledApiKeys();

  console.log("\n=== PrismCraft 测试配置工具 ===\n");
  console.log(`当前配置: ${enabledKeys.length} 个可用的 API Key\n`);
  console.log("请选择操作:");
  console.log("1. 添加/管理 API Key");
  console.log("2. 配置测试选项");
  console.log("3. 运行完整测试套件");
  console.log("4. 查看当前配置");
  console.log("5. 导出测试报告");
  console.log("0. 退出\n");

  const choice = await question("请输入选项 (0-5): ");

  switch (choice.trim()) {
    case "1":
      await manageApiKeys();
      break;
    case "2":
      await configureTestOptions();
      break;
    case "3":
      await runTests();
      break;
    case "4":
      showConfig();
      break;
    case "5":
      exportReports();
      break;
    case "0":
      console.log("再见!");
      rl.close();
      return;
    default:
      console.log("无效选项，请重试");
  }

  await showMainMenu();
}

async function manageApiKeys(): Promise<void> {
  console.log("\n=== 管理 API Keys ===");
  const config = loadConfig();

  console.log("\n当前已配置的 API Keys:");
  if (config.testApiKeys.length === 0) {
    console.log("  (空)");
  } else {
    config.testApiKeys.forEach((key, idx) => {
      console.log(
        `  ${idx + 1}. ${key.name || key.providerId} [${
          key.enabled ? "已启用" : "已禁用"
        }]`
      );
    });
  }

  console.log("\n1. 添加新的 API Key");
  console.log("2. 编辑现有 API Key");
  console.log("3. 启用/禁用 API Key");
  console.log("4. 删除 API Key");
  console.log("0. 返回");

  const choice = await question("\n请选择: ");

  switch (choice.trim()) {
    case "1":
      await addNewApiKey();
      break;
    case "2":
      await editApiKey();
      break;
    case "3":
      await toggleApiKey();
      break;
    case "4":
      await deleteApiKey();
      break;
    case "0":
      return;
    default:
      console.log("无效选项");
  }
}

async function addNewApiKey(): Promise<void> {
  console.log("\n=== 添加新的 API Key ===\n");

  console.log("请选择服务提供商:");
  PROVIDERS.forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.name} (${p.id})`);
  });

  const providerChoice = await question("\n请选择 (1-" + PROVIDERS.length + "): ");
  const providerIndex = parseInt(providerChoice) - 1;

  if (providerIndex < 0 || providerIndex >= PROVIDERS.length) {
    console.log("无效选择");
    return;
  }

  const provider = PROVIDERS[providerIndex];
  const apiKey = await question(`请输入 ${provider.name} 的 API Key: `);
  const baseUrlInput = await question(
    "请输入 Base URL (可选，按回车使用默认): "
  );
  const name = await question("请输入名称 (可选): ");

  const newKey: TestApiKey = {
    providerId: provider.id,
    apiKey: apiKey.trim(),
    name: name.trim() || provider.name,
    baseUrl: baseUrlInput.trim() || undefined,
    enabled: true,
  };

  addApiKey(newKey);
  console.log(`\n✅ API Key 已添加: ${newKey.name}`);
}

async function editApiKey(): Promise<void> {
  const config = loadConfig();

  if (config.testApiKeys.length === 0) {
    console.log("没有可编辑的 API Key");
    return;
  }

  console.log("\n请选择要编辑的 API Key:");
  config.testApiKeys.forEach((key, idx) => {
    console.log(`${idx + 1}. ${key.name || key.providerId}`);
  });

  const choice = await question("\n请选择: ");
  const idx = parseInt(choice) - 1;

  if (idx < 0 || idx >= config.testApiKeys.length) {
    console.log("无效选择");
    return;
  }

  const key = config.testApiKeys[idx];

  const newApiKey = await question(
    `新的 API Key (${key.apiKey.substring(0, 5)}...): `
  );
  const newBaseUrl = await question(
    `新的 Base URL (${key.baseUrl || "默认"}): `
  );
  const newName = await question(`新的名称 (${key.name}): `);

  if (newApiKey.trim()) key.apiKey = newApiKey.trim();
  if (newBaseUrl.trim()) key.baseUrl = newBaseUrl.trim();
  if (newName.trim()) key.name = newName.trim();

  addApiKey(key);
  console.log("\n✅ API Key 已更新");
}

async function toggleApiKey(): Promise<void> {
  const config = loadConfig();

  if (config.testApiKeys.length === 0) {
    console.log("没有 API Key");
    return;
  }

  console.log("\n请选择要启用/禁用的 API Key:");
  config.testApiKeys.forEach((key, idx) => {
    console.log(
      `${idx + 1}. ${key.name || key.providerId} [${
        key.enabled ? "已启用" : "已禁用"
      }]`
    );
  });

  const choice = await question("\n请选择: ");
  const idx = parseInt(choice) - 1;

  if (idx < 0 || idx >= config.testApiKeys.length) {
    console.log("无效选择");
    return;
  }

  config.testApiKeys[idx].enabled = !config.testApiKeys[idx].enabled;
  saveConfig(config);
  console.log(
    `\n✅ ${config.testApiKeys[idx].name} 现在是 ${
      config.testApiKeys[idx].enabled ? "已启用" : "已禁用"
    }`
  );
}

async function deleteApiKey(): Promise<void> {
  const config = loadConfig();

  if (config.testApiKeys.length === 0) {
    console.log("没有可删除的 API Key");
    return;
  }

  console.log("\n请选择要删除的 API Key:");
  config.testApiKeys.forEach((key, idx) => {
    console.log(`${idx + 1}. ${key.name || key.providerId}`);
  });

  const choice = await question("\n请选择: ");
  const idx = parseInt(choice) - 1;

  if (idx < 0 || idx >= config.testApiKeys.length) {
    console.log("无效选择");
    return;
  }

  const confirm = await question(
    `确认删除 "${config.testApiKeys[idx].name}"? (y/N): `
  );

  if (confirm.toLowerCase().startsWith("y")) {
    removeApiKey(config.testApiKeys[idx].providerId);
    console.log("\n✅ API Key 已删除");
  }
}

async function configureTestOptions(): Promise<void> {
  const config = loadConfig();
  console.log("\n=== 配置测试选项 ===");
  console.log(`当前设置:`);
  console.log(`  - 冒烟测试: ${config.testOptions.runSmokeTests ? "是" : "否"}`);
  console.log(
    `  - API 集成测试: ${
      config.testOptions.runApiIntegrationTests ? "是" : "否"
    }`
  );
  console.log(`  - E2E 测试: ${config.testOptions.runE2ETests ? "是" : "否"}`);
  console.log(
    `  - 性能测试: ${config.testOptions.runPerformanceTests ? "是" : "否"}`
  );
  console.log(
    `  - 覆盖率报告: ${config.testOptions.generateCoverage ? "是" : "否"}`
  );
  console.log(`  - 详细输出: ${config.testOptions.verbose ? "是" : "否"}`);

  const options = config.testOptions;

  options.runSmokeTests = (
    await question("\n运行冒烟测试? (Y/n): ")
  ).toLowerCase() !== "n";
  options.runApiIntegrationTests = (
    await question("运行 API 集成测试? (Y/n): ")
  ).toLowerCase() !== "n";
  options.runE2ETests = (
    await question("运行 E2E 测试? (y/N): ")
  ).toLowerCase() === "y";
  options.runPerformanceTests = (
    await question("运行性能测试? (y/N): ")
  ).toLowerCase() === "y";
  options.generateCoverage = (
    await question("生成覆盖率报告? (Y/n): ")
  ).toLowerCase() !== "n";
  options.verbose = (
    await question("详细输出? (y/N): ")
  ).toLowerCase() === "y";

  updateTestOptions(options);
  console.log("\n✅ 测试选项已更新");
}

function showConfig(): void {
  const config = loadConfig();
  console.log("\n=== 当前配置 ===");
  console.log("\nAPI Keys:");

  if (config.testApiKeys.length === 0) {
    console.log("  (未配置)");
  } else {
    config.testApiKeys.forEach((key) => {
      console.log(`  - ${key.name || key.providerId}`);
      console.log(`    ID: ${key.providerId}`);
      console.log(`    Key: ${key.apiKey.substring(0, 5)}...`);
      console.log(`    状态: ${key.enabled ? "已启用" : "已禁用"}`);
      if (key.baseUrl) console.log(`    Base URL: ${key.baseUrl}`);
    });
  }

  console.log("\n测试选项:");
  console.log(`  冒烟测试: ${config.testOptions.runSmokeTests ? "启用" : "禁用"}`);
  console.log(
    `  API 集成: ${
      config.testOptions.runApiIntegrationTests ? "启用" : "禁用"
    }`
  );
  console.log(`  E2E: ${config.testOptions.runE2ETests ? "启用" : "禁用"}`);
  console.log(
    `  性能: ${config.testOptions.runPerformanceTests ? "启用" : "禁用"}`
  );
  console.log(
    `  覆盖率: ${config.testOptions.generateCoverage ? "启用" : "禁用"}`
  );
  console.log("\n");
}

async function runTests(): Promise<void> {
  const config = loadConfig();
  const enabledKeys = getEnabledApiKeys();

  if (config.testOptions.runApiIntegrationTests && enabledKeys.length === 0) {
    console.log(
      "\n⚠️  API 集成测试需要配置 API Key，但没有启用的 API Key。"
    );
    const continueChoice = await question(
      "是否跳过 API 集成测试继续? (Y/n): "
    );
    if (continueChoice.toLowerCase().startsWith("n")) {
      return;
    }
  }

  console.log("\n=== 开始运行测试 ===\n");

  const startTime = Date.now();
  let success = true;

  try {
    if (config.testOptions.runSmokeTests) {
      console.log("1. 运行冒烟测试...");
      execSync("npm test -- run src/__tests__/e2e/smoke.test.ts", {
        stdio: config.testOptions.verbose ? "inherit" : "pipe",
      });
      console.log("   ✅ 冒烟测试通过\n");
    }

    if (config.testOptions.runApiIntegrationTests && enabledKeys.length > 0) {
      console.log("2. 运行 API 集成测试...");

      const envVars: Record<string, string> = {};
      enabledKeys.forEach((key) => {
        envVars[`TEST_API_KEY_${key.providerId.toUpperCase()}`] = key.apiKey;
        if (key.baseUrl) {
          envVars[`TEST_BASE_URL_${key.providerId.toUpperCase()}`] = key.baseUrl;
        }
      });

      execSync("npm test -- run src/__tests__/e2e/integration-api.test.ts", {
        stdio: config.testOptions.verbose ? "inherit" : "pipe",
        env: { ...process.env, ...envVars },
      });
      console.log("   ✅ API 集成测试通过\n");
    }

    if (config.testOptions.runE2ETests) {
      console.log("3. 运行 E2E 测试...");
      execSync("npm run test:e2e", {
        stdio: config.testOptions.verbose ? "inherit" : "pipe",
      });
      console.log("   ✅ E2E 测试通过\n");
    }

    if (config.testOptions.runPerformanceTests) {
      console.log("4. 运行性能测试...");
      execSync("npm test -- run src/__tests__/e2e/performance.test.ts", {
        stdio: config.testOptions.verbose ? "inherit" : "pipe",
      });
      console.log("   ✅ 性能测试通过\n");
    }

    if (config.testOptions.generateCoverage) {
      console.log("5. 运行完整测试并生成覆盖率报告...");
      execSync("npm run test:coverage", {
        stdio: config.testOptions.verbose ? "inherit" : "pipe",
      });
      console.log("   ✅ 测试完成，覆盖率报告已生成\n");
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`=== 测试完成! 总耗时 ${duration}s ===\n`);

    if (config.testOptions.generateCoverage) {
      console.log("覆盖率报告位置: ./coverage/index.html");
    }
  } catch (error) {
    success = false;
    console.error("\n❌ 测试执行失败:", error);
  }
}

function exportReports(): void {
  console.log("\n=== 导出测试报告 ===\n");

  const reportsDir = path.join(process.cwd(), "test-reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFile = path.join(reportsDir, `test-summary-${timestamp}.md`);

  let reportContent = `# PrismCraft 测试报告\n\n`;
  reportContent += `生成时间: ${new Date().toLocaleString()}\n\n`;

  const config = loadConfig();
  reportContent += `## 配置信息\n\n`;
  reportContent += `- API Keys: ${
    config.testApiKeys.length
  } (${getEnabledApiKeys().length} 已启用)\n`;
  reportContent += `- 冒烟测试: ${config.testOptions.runSmokeTests ? "启用" : "禁用"}\n`;
  reportContent += `- API 集成: ${
    config.testOptions.runApiIntegrationTests ? "启用" : "禁用"
  }\n`;
  reportContent += `- E2E: ${config.testOptions.runE2ETests ? "启用" : "禁用"}\n`;
  reportContent += `- 性能: ${
    config.testOptions.runPerformanceTests ? "启用" : "禁用"
  }\n\n`;

  fs.writeFileSync(reportFile, reportContent);
  console.log(`✅ 报告已导出: ${reportFile}`);
  console.log("\n提示: 运行完整测试后，请手动补充测试结果到报告中\n");
}

async function main(): Promise<void> {
  console.log(
    "欢迎使用 PrismCraft 测试配置工具！按 Ctrl+C 随时退出。"
  );
  await showMainMenu();
}

main().catch(console.error);
