export class VersionConflictError extends Error {
  constructor(
    public readonly table: string,
    public readonly id: string,
    public readonly expectedVersion: number,
  ) {
    super(`并发冲突: ${table}#${id} 版本不匹配 (期望 v${expectedVersion})`);
    this.name = "VersionConflictError";
  }
}
