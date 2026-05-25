export interface TestApiKey {
  providerId: string;
  apiKey: string;
  name?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface TestConfig {
  version: number;
  testApiKeys: TestApiKey[];
  testOptions: {
    runSmokeTests: boolean;
    runApiIntegrationTests: boolean;
    runE2ETests: boolean;
    runPerformanceTests: boolean;
    generateCoverage: boolean;
    verbose: boolean;
  };
}

export interface TestResult {
  testName: string;
  passed: boolean;
  duration?: number;
  error?: string;
}

export interface TestSuiteResult {
  suiteName: string;
  results: TestResult[];
  totalPassed: number;
  totalFailed: number;
  totalDuration: number;
}
