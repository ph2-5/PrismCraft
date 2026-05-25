export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { errorLogger } from "@/shared/error-logger";

const UPLOAD_DIR = path.join(os.tmpdir(), "ai-animation-studio", "uploads");

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await params;

    if (
      !filename ||
      /[/\\]/.test(filename) ||
      filename.includes("..") ||
      /%2e|%2f|%5c/i.test(filename)
    ) {
      return NextResponse.json(
        { success: false, error: "无效的文件名" },
        { status: 400 },
      );
    }

    const filePath = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: "文件不存在或已过期" },
        { status: 404 },
      );
    }

    try {
      const stat = fs.statSync(filePath);
      if (Date.now() - stat.mtimeMs > MAX_FILE_AGE_MS) {
        fs.unlinkSync(filePath);
        return NextResponse.json(
          { success: false, error: "文件已过期" },
          { status: 410 },
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "文件不存在" },
        { status: 404 },
      );
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeType = MIME_MAP[ext] || "application/octet-stream";

    const buffer = fs.readFileSync(filePath);

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${filename}"`,
    };

    if (mimeType === "image/svg+xml") {
      headers["Content-Security-Policy"] =
        "default-src 'none'; style-src 'self'; img-src 'self'";
      headers["X-Content-Type-Options"] = "nosniff";
    }

    return new NextResponse(buffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    errorLogger.error("[API Upload GET] Error:", error);
    return NextResponse.json(
      { success: false, error: "文件读取失败" },
      { status: 500 },
    );
  }
}
