import type {
  ResilientFetchOptions,
  DownloadProgress,
  DownloadResult,
  DownloadState,
} from "./types";
import { NETWORK_CONFIG } from "./network.config";
import { executeWithRetry } from "./retry-executor";
import { errorLogger } from "@/shared/error-logger";

interface DownloadMeta {
  url: string;
  totalSize: number;
  supportsRange: boolean;
  downloadedRanges: Array<{ start: number; end: number }>;
  etag?: string;
  lastModified?: string;
}

const downloadStates = new Map<string, DownloadMeta>();

function generateId(): string {
  return `dl_${crypto.randomUUID()}`;
}

async function probeUrl(
  url: string,
  signal?: AbortSignal,
): Promise<{ totalSize: number; supportsRange: boolean; etag?: string; lastModified?: string }> {
  const response = await fetch(url, {
    method: "HEAD",
    signal,
    headers: { "Accept-Encoding": "identity" },
  });

  if (!response.ok) {
    throw new Error(`HEAD request failed: ${response.status}`);
  }

  const contentLength = response.headers.get("Content-Length");
  const acceptRanges = response.headers.get("Accept-Ranges");
  const etag = response.headers.get("ETag") ?? undefined;
  const lastModified = response.headers.get("Last-Modified") ?? undefined;

  const totalSize = contentLength ? parseInt(contentLength, 10) : -1;
  const supportsRange = acceptRanges?.includes("bytes") ?? false;

  return { totalSize, supportsRange, etag, lastModified };
}

async function downloadChunk(
  url: string,
  start: number,
  end: number,
  signal?: AbortSignal,
  timeout?: number,
): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout ?? NETWORK_CONFIG.resilientFetch.timeout);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: controller.signal,
    });

    if (response.status !== 206 && response.status !== 200) {
      throw new Error(`Chunk download failed: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadFull(
  url: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const contentLength = parseInt(response.headers.get("Content-Length") ?? "-1", 10);
  const reader = response.body?.getReader();

  if (!reader) {
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const startTime = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    loaded += value.length;

    if (onProgress && contentLength > 0) {
      const elapsed = Date.now() - startTime;
      const speed = elapsed > 0 ? (loaded / elapsed) * 1000 : 0;
      const remaining = contentLength - loaded;
      const eta = speed > 0 ? (remaining / speed) * 1000 : 0;

      onProgress({
        loaded,
        total: contentLength,
        percent: Math.round((loaded / contentLength) * 100),
        speed,
        eta,
        state: "downloading",
      });
    }
  }

  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

async function downloadWithRange(
  url: string,
  totalSize: number,
  options: ResilientFetchOptions,
): Promise<Uint8Array> {
  const {
    chunkSize = NETWORK_CONFIG.resilientFetch.chunkSize,
    concurrency = NETWORK_CONFIG.resilientFetch.concurrency,
    maxRetries = NETWORK_CONFIG.resilientFetch.maxRetries,
    timeout = NETWORK_CONFIG.resilientFetch.timeout,
    resumeFrom = 0,
    onProgress,
    signal,
  } = options;

  const result = new Uint8Array(totalSize);
  let loaded = resumeFrom;
  const startTime = Date.now();

  const chunkRanges: Array<{ start: number; end: number }> = [];
  for (let offset = resumeFrom; offset < totalSize; offset += chunkSize) {
    const end = Math.min(offset + chunkSize - 1, totalSize - 1);
    chunkRanges.push({ start: offset, end });
  }

  let nextChunkIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextChunkIndex < chunkRanges.length) {
      if (signal?.aborted) return;

      const currentIndex = nextChunkIndex++;
      const { start, end } = chunkRanges[currentIndex];

      try {
        const chunk = await executeWithRetry(
          () => downloadChunk(url, start, end, signal, timeout),
          {
            maxRetries,
            baseDelay: 1000,
            maxDelay: 5000,
            backoff: "linear",
            jitter: true,
            retryableErrors: ["NETWORK_ERROR", "TIMEOUT", "ECONNREFUSED", "ETIMEDOUT"],
          },
          signal,
        );

        result.set(chunk, start);
        loaded += chunk.length;

        if (onProgress) {
          const elapsed = Date.now() - startTime;
          const speed = elapsed > 0 ? (loaded / elapsed) * 1000 : 0;
          const remaining = totalSize - loaded;
          const eta = speed > 0 ? (remaining / speed) * 1000 : 0;

          onProgress({
            loaded,
            total: totalSize,
            percent: Math.round((loaded / totalSize) * 100),
            speed,
            eta,
            state: "downloading",
          });
        }
      } catch (error) {
        if (signal?.aborted) return;
        throw error;
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, chunkRanges.length) }, () => worker());
  await Promise.all(workers);

  return result;
}

export async function resilientFetch(options: ResilientFetchOptions): Promise<DownloadResult> {
  const {
    url,
    destination,
    onProgress,
    signal,
    resumeFrom = 0,
  } = options;

  const startTime = Date.now();
  const id = generateId();

  try {
    const probe = await probeUrl(url, signal);

    const meta: DownloadMeta = {
      url,
      totalSize: probe.totalSize,
      supportsRange: probe.supportsRange,
      downloadedRanges: [],
      etag: probe.etag,
      lastModified: probe.lastModified,
    };
    downloadStates.set(id, meta);

    let data: Uint8Array;

    if (probe.supportsRange && probe.totalSize > 0) {
      data = await downloadWithRange(url, probe.totalSize, {
        ...options,
        resumeFrom,
      });
    } else {
      data = await downloadFull(url, onProgress, signal);
    }

    if (destination) {
      if (typeof destination === "function") {
        await destination(data);
      } else if (typeof destination === "string") {
        errorLogger.warn("[ResilientFetch] String destination is not supported in browser environment, data was downloaded but not saved to", destination);
      }
    }

    onProgress?.({
      loaded: data.length,
      total: data.length,
      percent: 100,
      speed: 0,
      eta: 0,
      state: "completed",
    });

    downloadStates.delete(id);

    return {
      success: true,
      totalBytes: data.length,
      duration: Date.now() - startTime,
      fromCache: false,
    };
  } catch (error) {
    downloadStates.delete(id);
    onProgress?.({
      loaded: 0,
      total: 0,
      percent: 0,
      speed: 0,
      eta: 0,
      state: "failed",
    });

    throw error;
  }
}

export function getDownloadState(url: string): DownloadState | undefined {
  for (const meta of downloadStates.values()) {
    if (meta.url === url) {
      return "downloading";
    }
  }
  return undefined;
}
