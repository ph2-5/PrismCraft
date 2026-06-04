import type { Result } from "@/domain/types";
import type { MediaAsset } from "@/domain/schemas";

export interface IMediaAssetRepository {
  findAll(): Promise<Result<MediaAsset[]>>;
  findById(id: string): Promise<Result<MediaAsset | null>>;
  create(input: Partial<MediaAsset> & { id: string }): Promise<Result<MediaAsset>>;
  update(input: Partial<MediaAsset> & { id: string }): Promise<Result<MediaAsset>>;
  delete(id: string): Promise<Result<void>>;
}
