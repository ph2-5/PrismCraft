/**
 * logging/__tests__/logger.test.ts
 *
 * 日志模块单元测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loggerRegistry, createLogger } from "../logger";
import type { LogTransport, LogEntry, LogLevel } from "../types";

/** 创建 mock 传输 */
function createMockTransport(
  name: string,
  minLevel: LogLevel = "debug"
): LogTransport & { logs: LogEntry[] } {
  const logs: LogEntry[] = [];
  return {
    name,
    minLevel,
    enabled: true,
    logs,
    write(entry: LogEntry): void {
      logs.push(entry);
    },
  };
}

describe("Logger", () => {
  beforeEach(() => {
    // 清理注册表
    loggerRegistry["loggers"].clear();
  });

  describe("basic logging", () => {
    it("should log with correct level", () => {
      const transport = createMockTransport("test");
      const logger = createLogger("test", {
        transports: [transport],
      });

      logger.info("test message");

      expect(transport.logs).toHaveLength(1);
      expect(transport.logs[0].level).toBe("info");
      expect(transport.logs[0].message).toBe("test message");
      expect(transport.logs[0].namespace).toBe("test");
    });

    it("should include timestamp", () => {
      const transport = createMockTransport("test");
      const logger = createLogger("test", {
        transports: [transport],
      });

      logger.info("test");

      expect(transport.logs[0].timestamp).toBeDefined();
      expect(new Date(transport.logs[0].timestamp)).toBeInstanceOf(Date);
    });

    it("should include context", () => {
      const transport = createMockTransport("test");
      const logger = createLogger("test", {
        transports: [transport],
      });

      logger.info("test", { userId: 123, action: "login" });

      expect(transport.logs[0].context).toEqual({
        userId: 123,
        action: "login",
      });
    });

    it("should include error details", () => {
      const transport = createMockTransport("test");
      const logger = createLogger("test", {
        transports: [transport],
      });

      const error = new Error("something went wrong");
      logger.error("failed", error);

      expect(transport.logs[0].error).toBeDefined();
      expect(transport.logs[0].error?.message).toBe("something went wrong");
      expect(transport.logs[0].error?.name).toBe("Error");
    });
  });

  describe("level filtering", () => {
    it("should filter by minLevel", () => {
      const transport = createMockTransport("test", "warn");
      const logger = createLogger("test", {
        minLevel: "warn",
        transports: [transport],
      });

      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(transport.logs).toHaveLength(2);
      expect(transport.logs[0].level).toBe("warn");
      expect(transport.logs[1].level).toBe("error");
    });

    it("should respect transport minLevel", () => {
      const debugTransport = createMockTransport("debug", "debug");
      const errorTransport = createMockTransport("error", "error");

      const logger = createLogger("test", {
        transports: [debugTransport, errorTransport],
      });

      logger.info("test");

      expect(debugTransport.logs).toHaveLength(1);
      expect(errorTransport.logs).toHaveLength(0);
    });
  });

  describe("child logger", () => {
    it("should create child with combined namespace", () => {
      const transport = createMockTransport("test");
      const parent = createLogger("parent", {
        transports: [transport],
      });
      const child = parent.child("child");

      child.info("message");

      expect(transport.logs[0].namespace).toBe("parent:child");
    });
  });

  describe("transport management", () => {
    it("should add transport", () => {
      const transport1 = createMockTransport("t1");
      const transport2 = createMockTransport("t2");

      const logger = createLogger("test", {
        transports: [transport1],
      });

      logger.addTransport(transport2);
      logger.info("test");

      expect(transport1.logs).toHaveLength(1);
      expect(transport2.logs).toHaveLength(1);
    });

    it("should remove transport by name", () => {
      const transport1 = createMockTransport("t1");
      const transport2 = createMockTransport("t2");

      const logger = createLogger("test", {
        transports: [transport1, transport2],
      });

      logger.removeTransport("t1");
      logger.info("test");

      expect(transport1.logs).toHaveLength(0);
      expect(transport2.logs).toHaveLength(1);
    });

    it("should skip disabled transports", () => {
      const transport = createMockTransport("test");
      transport.enabled = false;

      const logger = createLogger("test", {
        transports: [transport],
      });

      logger.info("test");

      expect(transport.logs).toHaveLength(0);
    });
  });

  describe("logger registry", () => {
    it("should return same logger for same namespace", () => {
      const logger1 = loggerRegistry.getLogger("test");
      const logger2 = loggerRegistry.getLogger("test");

      expect(logger1).toBe(logger2);
    });

    it("should set default transports for new loggers", () => {
      const transport = createMockTransport("default");
      loggerRegistry.setDefaultTransports([transport]);

      const logger = loggerRegistry.getLogger("new-logger");
      logger.info("test");

      expect(transport.logs).toHaveLength(1);
    });
  });
});
