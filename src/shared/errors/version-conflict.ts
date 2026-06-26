import { t } from "@/shared/constants";

export class VersionConflictError extends Error {
  constructor(
    public readonly table: string,
    public readonly id: string,
    public readonly expectedVersion: number,
  ) {
    super(`${t("error.versionConflict")} [${table}#${id} v${expectedVersion}]`);
    this.name = "VersionConflictError";
  }
}
