import type { IFileStorage, FileCategory, SaveFileParams, CopyFileParams, WriteFileAtomicParams, FileMetadata } from "@/domain/ports/file-storage-port";

export class LocalFileStorage implements IFileStorage {
  async saveFile(_params: SaveFileParams): Promise<{ key: string }> { throw new Error("LocalFileStorage is not available in browser"); }
  async readFile(_key: string): Promise<Buffer | null> { throw new Error("LocalFileStorage is not available in browser"); }
  async readFileAsBase64(_key: string): Promise<string | null> { throw new Error("LocalFileStorage is not available in browser"); }
  async deleteFile(_key: string): Promise<boolean> { throw new Error("LocalFileStorage is not available in browser"); }
  async exists(_key: string): Promise<boolean> { throw new Error("LocalFileStorage is not available in browser"); }
  async copyFile(_params: CopyFileParams): Promise<{ key: string }> { throw new Error("LocalFileStorage is not available in browser"); }
  async listFiles(_category: FileCategory): Promise<FileMetadata[]> { throw new Error("LocalFileStorage is not available in browser"); }
  async getFileInfo(_key: string): Promise<FileMetadata | null> { throw new Error("LocalFileStorage is not available in browser"); }
  async ensureDir(_category: FileCategory): Promise<void> { throw new Error("LocalFileStorage is not available in browser"); }
  async writeFileAtomic(_params: WriteFileAtomicParams): Promise<{ key: string }> { throw new Error("LocalFileStorage is not available in browser"); }
}
