/**
 * 文件存储 Port — 抽象用户数据文件（图片/视频/配置/插件/缓存）的 CRUD 操作。
 *
 * 设计原则：
 * - key-based 寻址，不暴露物理路径，便于本地/云端双向兼容
 * - 所有写入操作应在实现层处理原子性（tmp+rename）
 * - 实现负责路径安全校验（防目录穿越）
 * - 不涵盖：数据库文件、日志文件、密钥加密文件、静态资源（这些保留独立 Port/Service）
 *
 * 实现类：
 * - LocalFileStorage：本地文件系统实现（默认）
 * - S3FileStorage：S3 兼容对象存储实现（云端部署）
 */

/** 文件类别 — 决定存储子目录与权限 */
export type FileCategory =
  | "character"
  | "scene"
  | "storyboard"
  | "video-cache"
  | "image-cache"
  | "upload"
  | "plugin";

export interface FileMetadata {
  key: string;
  category: FileCategory;
  size: number;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
}

export interface SaveFileParams {
  category: FileCategory;
  /** 调用方提供的逻辑标识（如 characterId） */
  key: string;
  /** string 视为 base64 编码 */
  data: Buffer | ArrayBuffer | string;
  mimeType?: string;
}

export interface CopyFileParams {
  sourceKey: string;
  targetCategory: FileCategory;
  targetKey: string;
}

export interface WriteFileAtomicParams {
  category: FileCategory;
  key: string;
  data: string | Buffer;
}

export interface IFileStorage {
  /** 保存文件（buffer 或 base64），返回逻辑 key */
  saveFile(params: SaveFileParams): Promise<{ key: string }>;

  /** 读取文件为 Buffer */
  readFile(key: string): Promise<Buffer | null>;

  /** 读取文件为 base64 data URL（兼容现有 assets:read-file-base64） */
  readFileAsBase64(key: string): Promise<string | null>;

  /** 删除文件 */
  deleteFile(key: string): Promise<boolean>;

  /** 检查文件是否存在 */
  exists(key: string): Promise<boolean>;

  /** 复制文件（用于资产导入场景） */
  copyFile(params: CopyFileParams): Promise<{ key: string }>;

  /** 列出某类别下的文件 */
  listFiles(category: FileCategory): Promise<FileMetadata[]>;

  /** 获取文件元数据（大小、mtime） */
  getFileInfo(key: string): Promise<FileMetadata | null>;

  /** 确保类别目录存在（实现层自动调用，也可显式调用） */
  ensureDir(category: FileCategory): Promise<void>;

  /**
   * 原子写入（用于配置/插件等需要原子性的场景）
   * 实现层应使用 tmp + rename 模式
   */
  writeFileAtomic(params: WriteFileAtomicParams): Promise<{ key: string }>;
}
