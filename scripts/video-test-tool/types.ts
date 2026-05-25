export interface TestVideoResult {
  success: boolean;
  videoUrl?: string;
  localPath?: string;
  testCaseId: string;
  testCaseName: string;
  prompt: string;
  duration?: number;
  error?: string;
  timestamp: number;
}

export interface TestExecutionConfig {
  apiKey: string;
  providerId: string;
  baseUrl?: string;
  testCaseId?: string;
  random: boolean;
  outputDir: string;
  saveResults: boolean;
}

export interface CoverageMetrics {
  totalFeatures: number;
  coveredFeatures: string[];
  remainingFeatures: string[];
  coveragePercent: number;
}

export const ALL_FEATURES = [
  "multiple characters",
  "complex action",
  "camera movement",
  "weather effects",
  "lighting effects",
  "birds_eye",
  "worms_eye",
  "orbit",
  "dutch angle",
  "style mixing",
  "long prompt",
  "particle effects",
  "magic effects",
  "cultural fusion",
  "emotional complexity",
  "action sequence",
  "POV camera",
  "surreal",
  "abstract",
  "holographic displays",
  "data visualization",
  "special effects",
  "scene composition",
  "character interaction",
  "storytelling",
];
