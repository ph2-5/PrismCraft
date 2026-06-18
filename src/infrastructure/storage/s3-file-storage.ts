import type {
  IFileStorage,
  FileCategory,
  FileMetadata,
  SaveFileParams,
  CopyFileParams,
  WriteFileAtomicParams,
} from "@/domain/ports/file-storage-port";
import { errorLogger } from "@/shared/error-logger";

/**
 * S3 兼容对象存储实现。
 *
 * 支持 AWS S3、MinIO、阿里云 OSS、腾讯云 COS 等 S3 兼容服务。
 * 使用 S3 协议的 PUT/GET/DELETE/HEAD 操作。
 *
 * key 映射规则：
 * - {category}/{key} → s3://{bucket}/{prefix}/{category}/{key}
 * - 兼容旧物理路径（绝对路径）→ 提取 basename 作为 key
 */

export interface S3StorageConfig {
  /** S3 端点（如 https://s3.amazonaws.com 或 MinIO 地址） */
  endpoint: string;
  /** 存储桶名 */
  bucket: string;
  /** Access Key ID */
  accessKeyId: string;
  /** Secret Access Key */
  secretAccessKey: string;
  /** 区域 */
  region?: string;
  /** 对象 key 前缀（如 "users/{userId}/"） */
  prefix?: string;
  /** 是否使用 path-style（MinIO 需要 true） */
  pathStyle?: boolean;
  /** 自定义请求头 */
  headers?: Record<string, string>;
}

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
};

function getExtFromMime(mimeType?: string): string {
  if (!mimeType) return "png";
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
  };
  return map[mimeType] || "bin";
}

function getMimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() || "";
  return MIME_MAP[ext] || "application/octet-stream";
}

/**
 * AWS Signature V4 签名实现（简化版，不依赖 aws-sdk）。
 * 支持 S3 兼容服务的 PUT/GET/DELETE/HEAD 请求签名。
 */
class S3Signer {
  constructor(
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly region: string,
  ) {}

  private async hmac(key: Buffer | string, data: string): Promise<Buffer> {
    const encoder = new TextEncoder();
    const keyBytes = typeof key === "string" ? encoder.encode(key) : new Uint8Array(key);
    const dataBytes = encoder.encode(data);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, dataBytes as BufferSource);
    return Buffer.from(sig);
  }

  private async sha256(data: string | Buffer | Uint8Array): Promise<string> {
    // 直接使用字节序列，避免 string→UTF-8 编码导致二进制内容哈希不一致
    const bytes: Uint8Array =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : data instanceof Buffer
          ? new Uint8Array(data)
          : data;
    const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return Buffer.from(hash).toString("hex");
  }

  async signRequest(
    method: string,
    url: URL,
    headers: Record<string, string>,
    body: Buffer | string,
  ): Promise<Record<string, string>> {
    const service = "s3";
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    // 直接传 Buffer 给 sha256，避免 body.toString("binary") 导致 latin1→UTF-8 字节膨胀
    const payloadHash = await this.sha256(body);

    const host = url.host;
    const canonicalUri = url.pathname;
    const canonicalQueryString = url.search.slice(1);

    const signedHeaderKeys = ["host", "x-amz-content-sha256", "x-amz-date"];
    const allHeaders: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...headers,
    };
    const canonicalHeaders = signedHeaderKeys
      .map((k) => `${k}:${allHeaders[k]}\n`)
      .join("");
    const signedHeaders = signedHeaderKeys.join(";");

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      await this.sha256(canonicalRequest),
    ].join("\n");

    const kDate = await this.hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = await this.hmac(kDate, this.region);
    const kService = await this.hmac(kRegion, service);
    const kSigning = await this.hmac(kService, "aws4_request");
    const signature = (await this.hmac(kSigning, stringToSign)).toString("hex");

    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      ...allHeaders,
      Authorization: authHeader,
    };
  }
}

export class S3FileStorage implements IFileStorage {
  private readonly signer: S3Signer;
  private readonly baseUrl: string;

  constructor(private readonly config: S3StorageConfig) {
    this.signer = new S3Signer(
      config.accessKeyId,
      config.secretAccessKey,
      config.region || "us-east-1",
    );

    const endpoint = config.endpoint.replace(/\/$/, "");
    if (config.pathStyle) {
      this.baseUrl = `${endpoint}/${config.bucket}`;
    } else {
      // virtual-hosted-style: bucket.endpoint
      const url = new URL(endpoint);
      this.baseUrl = `${url.protocol}//${config.bucket}.${url.host}`;
    }
  }

  private getObjectKey(key: string, category?: FileCategory): string {
    // 兼容旧物理路径：提取 basename
    let normalizedKey = key;
    if (key.includes("/") || key.includes("\\")) {
      normalizedKey = key.split(/[/\\]/).pop() || key;
    }

    const prefix = this.config.prefix ? `${this.config.prefix.replace(/\/$/, "")}/` : "";
    if (category) {
      return `${prefix}${category}/${normalizedKey}`;
    }
    return `${prefix}${normalizedKey}`;
  }

  private buildUrl(objectKey: string): URL {
    return new URL(`${this.baseUrl}/${objectKey}`);
  }

  private async makeRequest(
    method: string,
    objectKey: string,
    options: {
      body?: Buffer | string;
      headers?: Record<string, string>;
      timeoutMs?: number;
    } = {},
  ): Promise<Response> {
    const url = this.buildUrl(objectKey);
    const { body = "", headers = {}, timeoutMs = 30000 } = options;

    const signedHeaders = await this.signer.signRequest(method, url, headers, body);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const bodyInit = method === "GET" || method === "HEAD"
        ? undefined
        : (body instanceof Buffer ? new Uint8Array(body) : body);
      const response = await fetch(url.toString(), {
        method,
        headers: signedHeaders,
        body: bodyInit as BodyInit | null | undefined,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async saveFile(params: SaveFileParams): Promise<{ key: string }> {
    const { category, key, data, mimeType } = params;

    let buffer: Buffer;
    let ext: string;

    if (typeof data === "string") {
      const matches = data.match(/^data:[^;]+;base64,/);
      if (matches) {
        const mimeMatch = data.match(/^data:([^;]+);base64,/);
        ext = getExtFromMime(mimeMatch?.[1]);
        buffer = Buffer.from(data.replace(/^data:[^;]+;base64,/, ""), "base64");
      } else {
        ext = getExtFromMime(mimeType);
        buffer = Buffer.from(data, "base64");
      }
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
      ext = getExtFromMime(mimeType);
    } else {
      buffer = data;
      ext = getExtFromMime(mimeType);
    }

    const finalKey = key.includes(".") ? key : `${key}.${ext}`;
    const objectKey = this.getObjectKey(finalKey, category);
    const contentType = mimeType || getMimeFromKey(finalKey);

    const response = await this.makeRequest("PUT", objectKey, {
      body: buffer,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`S3 PUT failed: ${response.status} ${errText}`);
    }

    return { key: finalKey };
  }

  async readFile(key: string): Promise<Buffer | null> {
    const objectKey = this.getObjectKey(key);
    try {
      const response = await this.makeRequest("GET", objectKey);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`S3 GET failed: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (e) {
      errorLogger.warn(`[S3FileStorage] readFile failed: ${key}`, e);
      return null;
    }
  }

  async readFileAsBase64(key: string): Promise<string | null> {
    const buffer = await this.readFile(key);
    if (!buffer) return null;
    const mime = getMimeFromKey(key);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  async deleteFile(key: string): Promise<boolean> {
    const objectKey = this.getObjectKey(key);
    try {
      const response = await this.makeRequest("DELETE", objectKey);
      return response.status === 204 || response.ok;
    } catch (e) {
      errorLogger.warn(`[S3FileStorage] deleteFile failed: ${key}`, e);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    const objectKey = this.getObjectKey(key);
    try {
      const response = await this.makeRequest("HEAD", objectKey);
      return response.status === 200;
    } catch (e) {
      // 注意：HEAD 404 也可能进入异常路径，但此处仅记录真实失败（网络/认证/超时等）
      errorLogger.warn(`[S3FileStorage] exists failed: ${key}`, e);
      return false;
    }
  }

  async copyFile(params: CopyFileParams): Promise<{ key: string }> {
    const { sourceKey, targetCategory, targetKey } = params;

    const sourceBuffer = await this.readFile(sourceKey);
    if (!sourceBuffer) {
      throw new Error(`Source file not found: ${sourceKey}`);
    }

    const sourceExt = sourceKey.split(".").pop() || "";
    const finalTargetKey = targetKey.includes(".")
      ? targetKey
      : sourceExt ? `${targetKey}.${sourceExt}` : targetKey;

    return this.saveFile({
      category: targetCategory,
      key: finalTargetKey,
      data: sourceBuffer,
    });
  }

  async listFiles(category: FileCategory): Promise<FileMetadata[]> {
    const prefix = this.getObjectKey("", category);
    const listUrl = new URL(`${this.baseUrl}?list-type=2&prefix=${encodeURIComponent(prefix)}`);

    try {
      const signedHeaders = await this.signer.signRequest("GET", listUrl, {}, "");
      const response = await fetch(listUrl.toString(), {
        method: "GET",
        headers: signedHeaders,
      });

      if (!response.ok) {
        throw new Error(`S3 ListObjectsV2 failed: ${response.status}`);
      }

      const xml = await response.text();
      return this.parseListResponse(xml, category);
    } catch (e) {
      errorLogger.warn(`[S3FileStorage] listFiles failed: ${category}`, e);
      return [];
    }
  }

  private parseListResponse(xml: string, category: FileCategory): FileMetadata[] {
    const results: FileMetadata[] = [];
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    const sizeRegex = /<Size>([^<]+)<\/Size>/g;
    const lastModifiedRegex = /<LastModified>([^<]+)<\/LastModified>/g;

    const keys: string[] = [];
    const sizes: string[] = [];
    const dates: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(xml)) !== null) keys.push(match[1]!);
    while ((match = sizeRegex.exec(xml)) !== null) sizes.push(match[1]!);
    while ((match = lastModifiedRegex.exec(xml)) !== null) dates.push(match[1]!);

    for (let i = 0; i < keys.length; i++) {
      const fullKey = keys[i]!;
      // 提取 category/ 之后的部分作为 key
      const prefix = this.config.prefix ? `${this.config.prefix}/` : "";
      const categoryPrefix = `${prefix}${category}/`;
      if (!fullKey.startsWith(categoryPrefix)) continue;

      const key = fullKey.slice(categoryPrefix.length);
      const size = parseInt(sizes[i] || "0", 10);
      const timestamp = dates[i] ? Math.floor(new Date(dates[i]!).getTime() / 1000) : 0;

      results.push({
        key,
        category,
        size,
        mimeType: getMimeFromKey(key),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    return results;
  }

  async getFileInfo(key: string): Promise<FileMetadata | null> {
    const objectKey = this.getObjectKey(key);
    try {
      const response = await this.makeRequest("HEAD", objectKey);
      if (response.status !== 200) return null;

      const size = parseInt(response.headers.get("content-length") || "0", 10);
      const lastModified = response.headers.get("last-modified");
      const timestamp = lastModified ? Math.floor(new Date(lastModified).getTime() / 1000) : 0;

      // 从 key 推断 category
      const prefix = this.config.prefix ? `${this.config.prefix}/` : "";
      let category: FileCategory = "upload";
      for (const cat of ["character", "scene", "storyboard", "video-cache", "image-cache", "upload", "plugin"] as FileCategory[]) {
        if (objectKey.startsWith(`${prefix}${cat}/`)) {
          category = cat;
          break;
        }
      }

      return {
        key,
        category,
        size,
        mimeType: response.headers.get("content-type") || getMimeFromKey(key),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    } catch (e) {
      // 记录失败原因，避免端点不可达/认证失败/超时被误判为"文件不存在"
      errorLogger.warn(`[S3FileStorage] getFileInfo failed: ${key}`, e);
      return null;
    }
  }

  async ensureDir(_category: FileCategory): Promise<void> {
    // S3 无目录概念，无需创建
  }

  async writeFileAtomic(params: WriteFileAtomicParams): Promise<{ key: string }> {
    // S3 PUT 本身是原子的，直接调用 saveFile
    return this.saveFile({
      category: params.category,
      key: params.key,
      data: params.data,
    });
  }
}
