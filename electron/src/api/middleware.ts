import type net from "net";

interface RateLimitEntry {
  windowMs: number;
  max: number;
  requests: Map<string, number[]>;
  check(ip: string): boolean;
  cleanup(): void;
}

export const rateLimit: RateLimitEntry = {
  windowMs: 60000,
  max: 180,
  requests: new Map(),

  check(ip: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(ip)) {
      this.requests.set(ip, []);
    }

    const requests = this.requests.get(ip)!;
    const validRequests = requests.filter(
      (timestamp) => timestamp > windowStart,
    );
    this.requests.set(ip, validRequests);

    if (validRequests.length >= this.max) {
      return false;
    }

    validRequests.push(now);
    return true;
  },

  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [ip, requests] of this.requests.entries()) {
      const valid = requests.filter((t) => t > windowStart);
      if (valid.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, valid);
      }
    }
    if (this.requests.size > 10000) {
      const entries = Array.from(this.requests.entries());
      entries.sort((a, b) => {
        const aLast = a[1][a[1].length - 1] || 0;
        const bLast = b[1][b[1].length - 1] || 0;
        return bLast - aLast;
      });
      this.requests = new Map(entries.slice(0, 10000));
    }
  },
};

const cleanupTimer = setInterval(() => rateLimit.cleanup(), 60000);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

const allowedOrigins = new Set<string>();

export function registerAllowedOrigin(port: number): void {
  allowedOrigins.add(`http://localhost:${port}`);
  allowedOrigins.add(`http://127.0.0.1:${port}`);
}

export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  return allowedOrigins.has(origin);
}

export function handleCors(req: import("http").IncomingMessage, res: import("http").ServerResponse): boolean {
  const origin = req.headers.origin || "";
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (origin) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Origin not allowed" }));
    return false;
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Electron-App",
  );
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return false;
  }

  return true;
}

export function checkAuthHeader(req: import("http").IncomingMessage, res: import("http").ServerResponse): boolean {
  if (!req.headers["x-electron-app"]) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing X-Electron-App header" }));
    return false;
  }
  return true;
}

export function checkRateLimit(ip: string, res: import("http").ServerResponse): boolean {
  if (!rateLimit.check(ip)) {
    res.writeHead(429);
    res.end(
      JSON.stringify({
        success: false,
        error: "Too many requests, please try again later",
      }),
    );
    return false;
  }
  return true;
}

export const activeConnections: Set<net.Socket> = new Set();

export function trackConnection(socket: net.Socket): void {
  activeConnections.add(socket);
  socket.on("close", () => {
    activeConnections.delete(socket);
  });
}

export function destroyAllConnections(): void {
  for (const conn of activeConnections) {
    try {
      conn.destroy();
    } catch {
      // connection already closed
    }
  }
  activeConnections.clear();
}
