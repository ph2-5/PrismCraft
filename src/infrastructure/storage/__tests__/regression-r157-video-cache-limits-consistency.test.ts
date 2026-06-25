/**
 * R157: video-cache Size Limits MUST Be Consistent Between Infrastructure and Services Layers
 *
 * 回归规则目的：
 *   infrastructure 层的 MAX_CACHE_BYTES（src/infrastructure/storage/video-cache.ts，
 *   cacheVideoFile 方法内的本地常量）必须与 services 层的 MAX_TOTAL_BLOB_SIZE_MB
 *   （src/modules/video/cache/services/video-cache.ts 模块级常量，单位 MB）一致：
 *
 *     MAX_CACHE_BYTES === MAX_TOTAL_BLOB_SIZE_MB * 1024 * 1024
 *
 *   即两个常量都应等于 10 * 1024 * 1024 * 1024（10 GB）。
 *
 * 历史问题：
 *   原 infrastructure 层 MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024（2GB），
 *   services 层 MAX_TOTAL_BLOB_SIZE_MB = 10240（10GB），两层不一致。
 *   services 层在 90% 阈值（≈9GB）会触发清理，但 infrastructure 层的 2GB 上限
 *   永远不会触发（被 services 层提前拦截），成为死代码。修复后两层统一为 10GB，
 *   infrastructure 层作为防御性 fallback。
 *
 *   如果有人改了 services 层常量但忘了同步 infrastructure 层（或反之），
 *   会导致清理阈值不一致或死代码重新出现。
 *
 * 被测代码：
 *   - src/infrastructure/storage/video-cache.ts (cacheVideoFile 内 MAX_CACHE_BYTES)
 *   - src/modules/video/cache/services/video-cache.ts (MAX_TOTAL_BLOB_SIZE_MB)
 *
 * 实现说明：
 *   两个常量都是模块私有（未 export），无法直接 import 比较。
 *   采用 fs.readFileSync 读取源码并用正则提取常量值，避免修改业务代码。
 *   参考 R146 (domain-purity) 测试的源码读取模式。
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const INFRA_VIDEO_CACHE_PATH = path.resolve(
  __dirname,
  "../video-cache.ts",
);
const SERVICES_VIDEO_CACHE_PATH = path.resolve(
  __dirname,
  "../../../modules/video/cache/services/video-cache.ts",
);

/** 从 infrastructure 层源码中提取 MAX_CACHE_BYTES 的字节值 */
function extractInfraMaxCacheBytes(content: string): number | null {
  // 匹配形如：const MAX_CACHE_BYTES = 10 * 1024 * 1024 * 1024;
  // 允许任意由数字、*、空格、() 组成的表达式
  const regex = /const\s+MAX_CACHE_BYTES\s*=\s*([\d\s*()+\-]+)\s*;/;
  const match = regex.exec(content);
  if (!match) return null;
  const expr = match[1]!.trim();
  // 安全求值：只允许数字、*、空格、()
  if (!/^[\d\s*()+\-]+$/.test(expr)) return null;
  const value = Function(`"use strict"; return (${expr});`)() as number;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 从 services 层源码中提取 MAX_TOTAL_BLOB_SIZE_MB 的 MB 值 */
function extractServicesMaxTotalBlobSizeMb(content: string): number | null {
  // 匹配形如：const MAX_TOTAL_BLOB_SIZE_MB = 10240;
  const regex = /const\s+MAX_TOTAL_BLOB_SIZE_MB\s*=\s*(\d+(?:\.\d+)?)\s*;/;
  const match = regex.exec(content);
  if (!match) return null;
  return Number(match[1]);
}

describe("R157: infrastructure 层与 services 层 video-cache 大小上限必须一致", () => {
  it("应能读取两个源文件", () => {
    expect(fs.existsSync(INFRA_VIDEO_CACHE_PATH)).toBe(true);
    expect(fs.existsSync(SERVICES_VIDEO_CACHE_PATH)).toBe(true);
  });

  it("infrastructure 层必须定义 MAX_CACHE_BYTES 常量", () => {
    const content = fs.readFileSync(INFRA_VIDEO_CACHE_PATH, "utf-8");
    const value = extractInfraMaxCacheBytes(content);
    expect(value, "MAX_CACHE_BYTES 应能在源文件中找到并解析为数字").not.toBeNull();
  });

  it("services 层必须定义 MAX_TOTAL_BLOB_SIZE_MB 常量", () => {
    const content = fs.readFileSync(SERVICES_VIDEO_CACHE_PATH, "utf-8");
    const value = extractServicesMaxTotalBlobSizeMb(content);
    expect(value, "MAX_TOTAL_BLOB_SIZE_MB 应能在源文件中找到并解析为数字").not.toBeNull();
  });

  it("infrastructure 层 MAX_CACHE_BYTES 必须等于 services 层 MAX_TOTAL_BLOB_SIZE_MB * 1024 * 1024", () => {
    const infraContent = fs.readFileSync(INFRA_VIDEO_CACHE_PATH, "utf-8");
    const servicesContent = fs.readFileSync(SERVICES_VIDEO_CACHE_PATH, "utf-8");

    const infraBytes = extractInfraMaxCacheBytes(infraContent);
    const servicesMb = extractServicesMaxTotalBlobSizeMb(servicesContent);

    expect(infraBytes).not.toBeNull();
    expect(servicesMb).not.toBeNull();

    // 关键一致性断言：MAX_CACHE_BYTES === MAX_TOTAL_BLOB_SIZE_MB * 1024 * 1024
    expect(infraBytes).toBe(servicesMb! * 1024 * 1024);
  });

  it("infrastructure 层 MAX_CACHE_BYTES 必须等于 10 GB（10 * 1024 * 1024 * 1024 字节）", () => {
    const content = fs.readFileSync(INFRA_VIDEO_CACHE_PATH, "utf-8");
    const value = extractInfraMaxCacheBytes(content);
    const TEN_GB = 10 * 1024 * 1024 * 1024;
    expect(value).toBe(TEN_GB);
  });

  it("services 层 MAX_TOTAL_BLOB_SIZE_MB 必须等于 10240 MB（即 10 GB）", () => {
    const content = fs.readFileSync(SERVICES_VIDEO_CACHE_PATH, "utf-8");
    const value = extractServicesMaxTotalBlobSizeMb(content);
    expect(value).toBe(10240);
  });

  it("infrastructure 层应保留说明该常量与 services 层一致的注释", () => {
    // 这是文档级别的软性约束：注释提醒开发者修改一处时同步另一处
    const content = fs.readFileSync(INFRA_VIDEO_CACHE_PATH, "utf-8");
    // 在 MAX_CACHE_BYTES 出现的附近应有提及 MAX_TOTAL_BLOB_SIZE_MB 的注释
    const idx = content.indexOf("MAX_CACHE_BYTES");
    expect(idx).toBeGreaterThanOrEqual(0);
    // 在 MAX_CACHE_BYTES 前 300 字符内查找注释提及
    const surrounding = content.slice(Math.max(0, idx - 300), idx + 200);
    expect(surrounding).toContain("MAX_TOTAL_BLOB_SIZE_MB");
  });

  it("若有人将 infrastructure 层 MAX_CACHE_BYTES 改回 2GB，本测试应失败", () => {
    // 反向验证：模拟修改回 2GB 时的不一致
    const content = fs.readFileSync(INFRA_VIDEO_CACHE_PATH, "utf-8");
    const infraBytes = extractInfraMaxCacheBytes(content);
    const servicesContent = fs.readFileSync(SERVICES_VIDEO_CACHE_PATH, "utf-8");
    const servicesMb = extractServicesMaxTotalBlobSizeMb(servicesContent);

    // 如果 infraBytes 是 2GB（=2 * 1024 * 1024 * 1024），且 services 是 10240 MB
    // 则 servicesMb * 1024 * 1024 = 10GB ≠ 2GB
    const TWO_GB = 2 * 1024 * 1024 * 1024;
    if (infraBytes === TWO_GB) {
      // 这种情况下测试应该明确失败
      expect(infraBytes).toBe(servicesMb! * 1024 * 1024);
      // 上面这行会失败，提示具体不一致
    } else {
      // 当前应处于一致状态
      expect(infraBytes).toBe(servicesMb! * 1024 * 1024);
    }
  });
});
