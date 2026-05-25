const TIMESTAMP_THRESHOLD = 1e12;

export const TimestampBridge = {
  toStorage(ms: number | undefined | null): number | null {
    if (ms == null) return null;
    const num = Number(ms);
    if (!Number.isFinite(num)) return null;
    return num > TIMESTAMP_THRESHOLD ? Math.floor(num / 1000) : Math.floor(num);
  },

  fromStorage(sec: number | undefined | null): number | null {
    if (sec == null) return null;
    const num = Number(sec);
    if (!Number.isFinite(num)) return null;
    return num > TIMESTAMP_THRESHOLD ? num : num * 1000;
  },

  toStorageOrThrow(ms: number): number {
    const result = TimestampBridge.toStorage(ms);
    if (result === null) throw new Error(`Invalid timestamp: ${ms}`);
    return result;
  },

  fromStorageOrThrow(sec: number): number {
    const result = TimestampBridge.fromStorage(sec);
    if (result === null) throw new Error(`Invalid timestamp: ${sec}`);
    return result;
  },
} as const;
