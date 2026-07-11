/**
 * security/ssrf-guard/ssrf-guard.ts
 *
 * SSRF（服务器端请求伪造）防护模块
 *
 * 设计原则：
 * - 独立可插拔模块
 * - 即使用户配置的 URL 也验证目标 IP
 * - 支持自定义白名单（自部署服务器场景）
 * - 零外部依赖
 */

import dns from "dns";
import { URL } from "url";
import net from "net";
import { getLogger } from "../../logging/logger";

const logger = getLogger("ssrf-guard");

/** 验证结果 */
export interface SsrfValidationResult {
  safe: boolean;
  reason?: string;
  resolvedIp?: string;
}

/** SSRF 防护配置 */
export interface SsrfGuardConfig {
  /** 是否启用 DNS 解析验证（默认 true） */
  enableDnsResolution?: boolean;
  /** 自定义白名单（IP 或 CIDR） */
  customWhitelist?: string[];
  /** 是否阻止云元数据端点 */
  blockMetadataEndpoints?: boolean;
  /** DNS 解析失败时的策略：deny（默认，fail-close 更安全）或 allow（高自由度，不推荐） */
  dnsFailurePolicy?: "allow" | "deny";
}

/** 云元数据端点（禁止访问） */
const METADATA_ENDPOINTS = [
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.goog",
];

/** 私有 IP 正则 */
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^localhost$/i,
  /^::1$/,
  /^fe[89ab][0-9a-f]:/i,
  /^fc/i,
  /^fd/i,
];

class SsrfGuard {
  private customWhitelist: Set<string> = new Set();
  private enableDnsResolution = true;
  private blockMetadataEndpoints = true;
  // Default to "deny" (fail-close): when DNS resolution fails or times out,
  // treat the request as unsafe. This is the secure default — a fail-open
  // policy ("allow") would let requests through when DNS is unavailable,
  // defeating the purpose of SSRF protection. Callers that explicitly need
  // the legacy permissive behavior can pass { dnsFailurePolicy: "allow" }.
  private dnsFailurePolicy: "allow" | "deny" = "deny";
  private resolvedIpCache = new Map<string, { ip: string; timestamp: number }>();
  private readonly RESOLVED_IP_TTL = 10000;
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(config?: SsrfGuardConfig) {
    if (config?.customWhitelist) {
      for (const item of config.customWhitelist) {
        this.customWhitelist.add(item.trim());
      }
    }
    if (config?.enableDnsResolution !== undefined) {
      this.enableDnsResolution = config.enableDnsResolution;
    }
    if (config?.blockMetadataEndpoints !== undefined) {
      this.blockMetadataEndpoints = config.blockMetadataEndpoints;
    }
    if (config?.dnsFailurePolicy !== undefined) {
      this.dnsFailurePolicy = config.dnsFailurePolicy;
    }
  }

  /**
   * 验证 URL 是否安全
   *
   * @param urlStr 要验证的 URL
   * @returns 验证结果
   */
  async validate(urlStr: string): Promise<SsrfValidationResult> {
    // 1. 解析 URL
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      logger.warn("Failed to parse URL in SSRF validate", { urlStr });
      return { safe: false, reason: "Invalid URL format" };
    }

    // 2. 仅允许 http/https 协议
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase();

    // 3. 检查云元数据端点
    if (this.blockMetadataEndpoints) {
      for (const endpoint of METADATA_ENDPOINTS) {
        if (hostname === endpoint || hostname.endsWith(`.${endpoint}`)) {
          return { safe: false, reason: "Cloud metadata endpoint blocked" };
        }
      }
    }

    // 4. 检查自定义白名单
    if (this.customWhitelist.has(hostname) || this.customWhitelist.has(parsed.host)) {
      if (this.enableDnsResolution) {
        const dnsResult = await this.validateDns(hostname);
        if (!dnsResult.safe) {
          return { safe: false, reason: `Whitelisted domain resolved to private IP: ${dnsResult.resolvedIp}` };
        }
      }
      return { safe: true };
    }

    // 5. 检查主机名是否为私有地址
    if (this.isPrivateHostname(hostname)) {
      return { safe: false, reason: "Private hostname detected" };
    }

    // 6. DNS 解析验证（防止 DNS Rebinding）
    if (this.enableDnsResolution) {
      const dnsResult = await this.validateDns(hostname);
      if (!dnsResult.safe) {
        return dnsResult;
      }
    }

    return { safe: true };
  }

  /**
   * 同步验证（不执行 DNS 解析，仅检查主机名模式）
   * 用于快速预检查
   */
  validateSync(urlStr: string): SsrfValidationResult {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      logger.warn("Failed to parse URL in SSRF validateSync", { urlStr });
      return { safe: false, reason: "Invalid URL format" };
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (this.blockMetadataEndpoints) {
      for (const endpoint of METADATA_ENDPOINTS) {
        if (hostname === endpoint || hostname.endsWith(`.${endpoint}`)) {
          return { safe: false, reason: "Cloud metadata endpoint blocked" };
        }
      }
    }

    // 白名单匹配：同步方法无法执行 DNS 检查，仅做主机名模式验证
    if (this.customWhitelist.has(hostname) || this.customWhitelist.has(parsed.host)) {
      return { safe: true };
    }

    if (this.isPrivateHostname(hostname)) {
      return { safe: false, reason: "Private hostname detected" };
    }

    return { safe: true };
  }

  /**
   * 添加自定义白名单
   */
  addWhitelist(pattern: string): void {
    this.customWhitelist.add(pattern.trim());
  }

  /**
   * 移除自定义白名单
   */
  removeWhitelist(pattern: string): void {
    this.customWhitelist.delete(pattern.trim());
  }

  /**
   * 检查 IP 地址是否为私有地址
   */
  isPrivateIp(ip: string): boolean {
    // IPv4
    if (net.isIPv4(ip)) {
      return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
    }
    // IPv6
    if (net.isIPv6(ip)) {
      const lower = ip.toLowerCase();
      if (lower === "::1" || this.isIpv6LinkLocal(lower) || this.isIpv6Ula(lower)) {
        return true;
      }
      const v4MappedMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
      if (v4MappedMatch) {
        return this.isPrivateIp(v4MappedMatch[1]!);
      }
      const v4MappedShort = lower.match(/^0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
      if (v4MappedShort) {
        return this.isPrivateIp(v4MappedShort[1]!);
      }
      return false;
    }
    return false;
  }

  /**
   * 获取缓存的 DNS 解析结果
   */
  getResolvedIp(hostname: string): string | undefined {
    const cached = this.resolvedIpCache.get(hostname.toLowerCase());
    if (cached && Date.now() - cached.timestamp < this.RESOLVED_IP_TTL) {
      return cached.ip;
    }
    this.resolvedIpCache.delete(hostname.toLowerCase());
    return undefined;
  }

  // --- 内部方法 ---

  private isIpv6LinkLocal(ip: string): boolean {
    if (!ip) return false;
    const firstHextet = ip.split(":")[0]?.toLowerCase() ?? "";
    const value = parseInt(firstHextet, 16);
    if (Number.isNaN(value)) return false;
    return (value & 0xffc0) === 0xfe80;
  }

  private isIpv6Ula(ip: string): boolean {
    if (!ip) return false;
    const firstHextet = ip.split(":")[0]?.toLowerCase() ?? "";
    const value = parseInt(firstHextet, 16);
    if (Number.isNaN(value)) return false;
    return (value & 0xfe00) === 0xfc00;
  }

  /** 检查主机名是否匹配私有地址模式 */
  private isPrivateHostname(hostname: string): boolean {
    // 检查字面量主机名
    if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
      return true;
    }
    // 检查 IPv4 字面量
    if (net.isIPv4(hostname) && this.isPrivateIp(hostname)) {
      return true;
    }
    // 检查 IPv6 字面量
    if (net.isIPv6(hostname) && this.isPrivateIp(hostname)) {
      return true;
    }
    return false;
  }

  /** DNS 解析验证 */
  private validateDns(hostname: string): Promise<SsrfValidationResult> {
    return new Promise((resolve) => {
      // 如果已经是 IP 地址，直接检查
      if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
        if (this.isPrivateIp(hostname)) {
          resolve({ safe: false, reason: "Resolved to private IP", resolvedIp: hostname });
        } else {
          resolve({ safe: true, resolvedIp: hostname });
        }
        return;
      }

      // 缓存检查：命中时直接基于缓存 IP 判定，避免重复 DNS 解析
      const cachedIp = this.getResolvedIp(hostname);
      if (cachedIp) {
        if (this.isPrivateIp(cachedIp)) {
          resolve({ safe: false, reason: "Cached DNS resolved to private IP", resolvedIp: cachedIp });
        } else {
          resolve({ safe: true, resolvedIp: cachedIp });
        }
        return;
      }

      const timeout = setTimeout(() => {
        const policy = this.dnsFailurePolicy ?? "deny";
        if (policy === "deny") {
          resolve({ safe: false, reason: "DNS resolution timeout" });
        } else {
          logger.warn("DNS resolution timed out, allowing due to policy", { hostname, timeoutMs: 3000 });
          resolve({ safe: true });
        }
      }, 3000);

      // 并行解析 IPv4 和 IPv6，对两个地址列表都做私有 IP 检查。
      // 之前的实现先调用 dns.resolve4，成功后不调用 dns.resolve6，
      // 可能遗漏私有 IPv6 地址（如 DNS rebinding 攻击者同时返回公网 IPv4 和私有 IPv6）。
      Promise.all([
        new Promise<string[]>((res) => {
          dns.resolve4(hostname, (err, addresses) => {
            res(err ? [] : addresses);
          });
        }),
        new Promise<string[]>((res) => {
          dns.resolve6(hostname, (err, addresses) => {
            res(err ? [] : addresses);
          });
        }),
      ])
        .then(([v4Addrs, v6Addrs]) => {
          clearTimeout(timeout);

          const allAddrs = [...v4Addrs, ...v6Addrs];
          // dns.resolve4/resolve6 使用 c-ares 库，在某些系统配置下会失败（如 ECONNREFUSED），
          // 即使系统 DNS 正常工作。回退到 dns.lookup（通过 getaddrinfo 使用系统 DNS），
          // 与 fetch/http.request 使用的解析方式一致，确保 DNS rebinding 防护仍然有效。
          if (allAddrs.length === 0) {
            dns.lookup(hostname, { all: true, family: 0 }, (lookupErr, lookupAddresses) => {
              if (lookupErr || lookupAddresses.length === 0) {
                resolve(this.handleDnsFailure(hostname, `DNS resolution failed: ${lookupErr?.message || "no addresses returned"}`));
                return;
              }
              const ips = lookupAddresses.map((a) => a.address);
              resolve(this.checkIpsAndCache(hostname, ips, "DNS lookup resolved to private IP"));
            });
            return;
          }

          // 检查所有 IPv4 地址
          for (const ip of v4Addrs) {
            if (this.isPrivateIp(ip)) {
              resolve({ safe: false, reason: `DNS resolved to private IPv4: ${ip}`, resolvedIp: ip });
              return;
            }
          }

          // 检查所有 IPv6 地址
          for (const ip of v6Addrs) {
            if (this.isPrivateIp(ip)) {
              resolve({ safe: false, reason: `DNS resolved to private IPv6: ${ip}`, resolvedIp: ip });
              return;
            }
          }

          // 所有地址都是公网，优先使用第一个 IPv4 地址
          resolve(this.checkIpsAndCache(hostname, allAddrs, "DNS resolved to private IP"));
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve(this.handleDnsFailure(hostname, "DNS resolution failed"));
        });
    });
  }

  /**
   * 检查 IP 列表是否含私有地址，并缓存首个安全 IP。
   * - 命中私有 IP → 返回 `{ safe: false, reason, resolvedIp }`
   * - 全部公网 → 返回 `{ safe: true, resolvedIp }` 并写入缓存
   */
  private checkIpsAndCache(
    hostname: string,
    ips: string[],
    privateReason: string,
  ): SsrfValidationResult {
    for (const ip of ips) {
      if (this.isPrivateIp(ip)) {
        return { safe: false, reason: `${privateReason}: ${ip}`, resolvedIp: ip };
      }
    }
    const firstSafeIp = ips[0]!;
    // 缓存大小限制：超过上限时删除最旧条目（Map 保持插入顺序）
    if (this.resolvedIpCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.resolvedIpCache.keys().next().value;
      if (oldestKey) this.resolvedIpCache.delete(oldestKey);
    }
    this.resolvedIpCache.set(hostname.toLowerCase(), { ip: firstSafeIp, timestamp: Date.now() });
    return { safe: true, resolvedIp: firstSafeIp };
  }

  /** DNS 解析失败时按 dnsFailurePolicy 决定放行或拒绝 */
  private handleDnsFailure(hostname: string, reason: string): SsrfValidationResult {
    const policy = this.dnsFailurePolicy ?? "deny";
    if (policy === "deny") {
      return { safe: false, reason };
    }
    logger.warn("DNS resolution failed, allowing due to policy", { hostname, reason });
    return { safe: true };
  }
}

// --- 单例导出 ---

/** 全局 SSRF 防护实例 */
export const ssrfGuard = new SsrfGuard();

export { SsrfGuard };
