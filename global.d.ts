declare global {
  interface Window {
    electronAPI?: {
      onMenuNewCharacter: (callback: () => void) => void;
      onMenuNewScene: (callback: () => void) => void;
      onMenuExport: (callback: () => void) => void;
      removeMenuListeners: () => void;
      apiCall: (endpoint: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<unknown>;
      apiPort: number;
      platform: string;
      versions: {
        node: string;
        electron: string;
        chrome: string;
      };
      getConfig: (key: string) => string | null;
      setConfig: (key: string, value: unknown) => boolean;
      saveImage: (base64Data: string, subDir: string, filename: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      deleteFile: (filePath: string) => Promise<{ success: boolean }>;
      readFileAsBase64: (filePath: string) => Promise<{ success: boolean; base64?: string }>;
      getAssetsDir: () => Promise<{ success: boolean; dir: string }>;
      saveBuffer: (buffer: ArrayBuffer, subDir: string, filename: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      fileExists: (filePath: string) => Promise<{ success: boolean; exists: boolean }>;
      copyFile: (srcPath: string, subDir: string, filename: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      openFileDialog: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ success: boolean; filePaths?: string[]; error?: string }>;
      saveFileDialog: (options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      writeFile: (filePath: string, data: ArrayBuffer | number[]) => Promise<{ success: boolean; error?: string }>;
      openExternal: (url: string) => void;
      readFile: (filePath: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>;
      dbQuery: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }>;
      dbRun: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: { changes?: number; lastInsertRowid?: number }; error?: string }>;
      dbTransaction: (statements: { sql: string; params: unknown[] }[]) => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
      getCacheDirectory: () => Promise<{ success: boolean; path?: string; error?: string }>;
      getFileInfo: (filePath: string) => Promise<{ success: boolean; size?: number; error?: string }>;
      getDiskSpace: (dirPath: string) => Promise<{ success: boolean; availableBytes?: number; totalBytes?: number; error?: string }>;
      clearCache?: () => void;
    };
    __OFFLINE_QUEUE_STATE__?: {
      autoProcessInterval?: ReturnType<typeof setInterval> | null;
      adaptiveRestartIntervalId?: ReturnType<typeof setInterval> | null;
    };
    __VIDEO_TASK_POLLING_STATE__?: unknown;
    __VIDEO_TASK_STORE__?: { getState: () => { recoverTask?: (taskId: string, status: string, videoUrl: string) => void } };
  }
}

export {};
