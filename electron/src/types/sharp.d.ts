declare module "sharp" {
  interface Sharp {
    metadata(): Promise<Metadata>;
    resize(width?: number, height?: number, options?: ResizeOptions): Sharp;
    jpeg(options?: { quality?: number }): Sharp;
    png(options?: { quality?: number }): Sharp;
    webp(options?: { quality?: number }): Sharp;
    toBuffer(): Promise<Buffer>;
    toFile(path: string): Promise<OutputInfo>;
  }

  interface Metadata {
    width?: number;
    height?: number;
    format?: string;
    channels?: number;
    density?: number;
    hasAlpha?: boolean;
  }

  interface ResizeOptions {
    fit?: "cover" | "contain" | "fill" | "inside" | "outside";
    position?: string;
    background?: Record<string, unknown>;
    withoutEnlargement?: boolean;
  }

  interface OutputInfo {
    format: string;
    width: number;
    height: number;
    channels: number;
    premultiplied: boolean;
    size: number;
  }

  function sharp(input?: string | Buffer, options?: Record<string, unknown>): Sharp;

  export = sharp;
}
