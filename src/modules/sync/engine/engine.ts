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
