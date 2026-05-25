export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { errorLogger } from "@/shared/error-logger";

const UPLOAD_DIR = path.join(os.tmpdir(), "ai-animation-studio", "uploads");
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_BASE64_SIZE = 20 * 1024 * 1024;
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000;
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
const ALLOWED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".mp4",
  ".webm",
  ".mov",
];

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function cleanOldFiles() {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > MAX_FILE_AGE_MS) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        errorLogger.warn(`[Upload] 清理旧文件失败: ${filePath}`, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    errorLogger.warn(
      { code: "UPLOAD_CLEANUP_ERROR", message: "清理上传目录失败", cause: e instanceof Error ? e : undefined },
      "Upload",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    cleanOldFiles();
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json(
          {
            success: false,
            error: "未提供文件",
          },
          { status: 400 },
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            success: false,
            error: `文件过大，最大支持 ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          },
          { status: 400 },
        );
      }

      if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          {
            success: false,
            error: `不支持的文件类型: ${file.type}`,
          },
          { status: 400 },
        );
      }

      ensureUploadDir();
      const ext = path.extname(file.name).toLowerCase() || ".png";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json(
          {
            success: false,
            error: `不支持的文件扩展名: ${ext}`,
          },
          { status: 400 },
        );
      }
      const uniqueName = `${crypto.randomUUID()}${ext}`;
      const filePath = path.join(UPLOAD_DIR, uniqueName);

      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      return NextResponse.json({
        success: true,
        url: `/api/upload/${uniqueName}`,
        filename: uniqueName,
      });
    }

    const body = await request.json();
    const { file, filename, mimetype } = body;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: "未提供文件",
        },
        { status: 400 },
      );
    }

    if (mimetype && !ALLOWED_MIME_TYPES.includes(mimetype)) {
      return NextResponse.json(
        {
          success: false,
          error: `不支持的文件类型: ${mimetype}`,
        },
        { status: 400 },
      );
    }

    ensureUploadDir();
    const ext = filename ? path.extname(filename).toLowerCase() : ".png";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          success: false,
          error: `不支持的文件扩展名: ${ext}`,
        },
        { status: 400 },
      );
    }
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, uniqueName);

    const base64Data = file.replace(/^data:[\w/+\-.]+;base64,/, "");
    const estimatedSize = base64Data.length * 0.75;
    if (estimatedSize > MAX_BASE64_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `文件过大，最大支持 ${MAX_BASE64_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({
      success: true,
      url: `/api/upload/${uniqueName}`,
      filename: uniqueName,
    });
  } catch (error) {
    errorLogger.error("[API Upload] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
