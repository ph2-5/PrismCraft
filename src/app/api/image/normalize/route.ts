export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { safeParseJson, sanitizeErrorMessage } from "@/infrastructure/server/api-utils";
import { errorLogger } from "@/shared/error-logger";

export interface NormalizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxSizeMB?: number;
  quality?: number;
  format?: "jpeg" | "png" | "webp";
}

const DEFAULT_OPTIONS: NormalizationOptions = {
  maxWidth: 2048,
  maxHeight: 2048,
  maxSizeMB: 10,
  quality: 0.9,
  format: "jpeg",
};

export async function POST(request: NextRequest) {
  try {
    const body = (await safeParseJson(request)) as Record<string, any>;
    const { imageUrl, options = {} } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: "图片 URL 不能为空" },
        { status: 400 }
      );
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };

    // 下载图片
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const originalSize = buffer.length;

    // 使用 Sharp 处理
    let image = sharp(buffer);
    const metadata = await image.metadata();
    let width = metadata.width || 0;
    let height = metadata.height || 0;

    // 等比缩放
    if (opts.maxWidth || opts.maxHeight) {
      image = image.resize(opts.maxWidth, opts.maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
      const resized = await image.toBuffer({ resolveWithObject: true });
      width = resized.info.width;
      height = resized.info.height;
    }

    // 格式转换和压缩
    const format = opts.format || "jpeg";
    let quality = Math.round((opts.quality || 0.9) * 100);

    let outputBuffer: Buffer;
    if (format === "png") {
      outputBuffer = await image.png({ compressionLevel: 6 }).toBuffer();
    } else if (format === "webp") {
      outputBuffer = await image.webp({ quality }).toBuffer();
    } else {
      outputBuffer = await image.jpeg({ quality }).toBuffer();
    }

    const maxSizeBytes = (opts.maxSizeMB || 10) * 1024 * 1024;
    if (outputBuffer.length > maxSizeBytes && format !== "png") {
      while (outputBuffer.length > maxSizeBytes && quality > 30) {
        quality -= 10;
        if (format === "webp") {
          outputBuffer = await image.webp({ quality }).toBuffer();
        } else {
          outputBuffer = await image.jpeg({ quality }).toBuffer();
        }
      }
    }
    if (outputBuffer.length > maxSizeBytes && format === "png") {
      outputBuffer = await image.jpeg({ quality: 80 }).toBuffer();
    }

    const base64 = outputBuffer.toString("base64");
    const mimeType = `image/${format}`;

    return NextResponse.json({
      success: true,
      data: {
        url: `data:${mimeType};base64,${base64}`,
        originalSize,
        normalizedSize: outputBuffer.length,
        width,
        height,
        format: mimeType,
      },
    });
  } catch (error) {
    errorLogger.error("[API Normalize Image] Error:", error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
