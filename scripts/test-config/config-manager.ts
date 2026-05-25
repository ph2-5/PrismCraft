import fs from "fs";
import path from "path";
import os from "os";
import type { TestConfig, TestApiKey } from "./types";

const CONFIG_DIR = path.join(os.homedir(), ".ai-animation-studio-tests");
const CONFIG_FILE = path.join(CONFIG_DIR, "test-config.json");

const DEFAULT_CONFIG: TestConfig = {
  version: 1,
  testApiKeys: [],
  testOptions: {
    runSmokeTests: true,
    runApiIntegrationTests: true,
    runE2ETests: false,
    runPerformanceTests: false,
    generateCoverage: true,
    verbose: false,
  },
};

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): TestConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as TestConfig;
  } catch (error) {
    console.warn("Failed to load config, using defaults:", error);
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: TestConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function addApiKey(apiKey: TestApiKey): void {
  const config = loadConfig();
  const existingIndex = config.testApiKeys.findIndex(
    (k) => k.providerId === apiKey.providerId
  );

  if (existingIndex >= 0) {
    config.testApiKeys[existingIndex] = apiKey;
  } else {
    config.testApiKeys.push(apiKey);
  }

  saveConfig(config);
}

export function removeApiKey(providerId: string): void {
  const config = loadConfig();
  config.testApiKeys = config.testApiKeys.filter(
    (k) => k.providerId !== providerId
  );
  saveConfig(config);
}

export function getEnabledApiKeys(): TestApiKey[] {
  return loadConfig().testApiKeys.filter((k) => k.enabled);
}

export function updateTestOptions(
  options: Partial<TestConfig["testOptions"]>
): void {
  const config = loadConfig();
  config.testOptions = { ...config.testOptions, ...options };
  saveConfig(config);
}
