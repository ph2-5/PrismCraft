import { SyncEngine } from "./sync-engine-class";
import type { SyncConfig, SyncConflict } from "./types";
import { getSyncStatus, ensureSyncSchema } from "./changelog";

const engine = new SyncEngine();

export { engine as syncEngine };

export function setConflictCallback(
  callback: ((conflicts: SyncConflict[]) => void) | null,
): void {
  engine.setConflictCallback(callback);
}

export async function initSyncEngine(
  config?: Partial<SyncConfig>,
): Promise<void> {
  await engine.init(config);
}

/**
 * 销毁 SyncEngine 单例：清理 autoSync timer + 注销 change tracker。
 *
 * 应用退出（beforeunload）或 HMR 时应调用，避免 timer 泄漏。
 * 之后若需再次使用，需重新调用 initSyncEngine。
 */
export function destroySyncEngine(): void {
  engine.destroy();
}

export function updateSyncConfig(config: Partial<SyncConfig>): void {
  engine.updateConfig(config);
}

export function startAutoSync(): void {
  engine.startAutoSync();
}

export function stopAutoSync(): void {
  engine.stopAutoSync();
}

export async function performSync(): Promise<{
  pushed: number;
  pulled: number;
  conflicts: number;
}> {
  return engine.performSync();
}

export function getSyncConfig(): SyncConfig {
  return engine.getConfig();
}

export { getSyncStatus, ensureSyncSchema };
