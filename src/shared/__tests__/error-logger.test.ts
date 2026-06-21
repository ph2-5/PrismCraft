import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  errorLogger,
  extractErrorMessage,
  setMinLogLevel,
  installGlobalErrorHandlers,
  ErrorEvents,
} from "@/shared/error-logger";
import type { ErrorLogEntry, LogLevel } from "@/shared/error-logger";
import { AppError } from "@/domain/types/result";
import { eventBus } from "@/shared/event-bus";

describe("error-logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    setMinLogLevel("debug");
    eventBus.removeAllListeners(ErrorEvents.LOGGED);
  });

  afterEach(() => {
    setMinLogLevel("warn");
    vi.restoreAllMocks();
  });

  describe("extractErrorMessage", () => {
    it("should return Unknown error for undefined", () => {
      expect(extractErrorMessage(undefined)).toBe("Unknown error");
    });

    it("should return Unknown error for null", () => {
      expect(extractErrorMessage(null)).toBe("Unknown error");
    });

    it("should return string as-is", () => {
      expect(extractErrorMessage("test error")).toBe("test error");
    });

    it("should return Unknown error for empty string", () => {
      expect(extractErrorMessage("")).toBe("Unknown error");
    });

    it("should return Error message", () => {
      expect(extractErrorMessage(new Error("test message"))).toBe("test message");
    });

    it("should return Error name when message is empty", () => {
      const error = new Error();
      error.message = "";
      error.name = "CustomError";
      expect(extractErrorMessage(error)).toBe("CustomError");
    });

    it("should extract message from object with message property", () => {
      expect(extractErrorMessage({ message: "object message" })).toBe("object message");
    });

    it("should extract name from object with name property when no message", () => {
      expect(extractErrorMessage({ name: "CustomName" })).toBe("CustomName");
    });

    it("should return JSON for other objects", () => {
      expect(extractErrorMessage({ code: 500 })).toBe('{"code":500}');
    });

    it("should return string representation for empty object", () => {
      expect(extractErrorMessage({})).toBe("[object Object]");
    });

    it("should handle number", () => {
      expect(extractErrorMessage(404)).toBe("404");
    });

    it("should handle boolean", () => {
      expect(extractErrorMessage(true)).toBe("true");
    });
  });

  describe("errorLogger.debug", () => {
    it("should log debug message with string", () => {
      errorLogger.debug("debug message");
      expect(console.debug).toHaveBeenCalled();
    });

    it("should log debug message with AppError", () => {
      errorLogger.debug(new AppError("DEBUG_CODE", "debug message"));
      expect(console.debug).toHaveBeenCalled();
    });

    it("should log debug message with code object", () => {
      errorLogger.debug({ code: "DEBUG_CODE", message: "debug message" });
      expect(console.debug).toHaveBeenCalled();
    });

    it("should include context when provided", () => {
      errorLogger.debug("debug message", "TestContext");
      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining("TestContext"),
        expect.anything()
      );
    });

    it("should not log when below min log level", () => {
      setMinLogLevel("info");
      errorLogger.debug("should not appear");
      expect(console.debug).not.toHaveBeenCalled();
    });
  });

  describe("errorLogger.info", () => {
    it("should log info message", () => {
      errorLogger.info("info message");
      expect(console.info).toHaveBeenCalled();
    });

    it("should not log when below min log level", () => {
      setMinLogLevel("warn");
      errorLogger.info("should not appear");
      expect(console.info).not.toHaveBeenCalled();
    });

    it("should log with context", () => {
      errorLogger.info("info message", "InfoContext");
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("InfoContext"),
        expect.anything()
      );
    });
  });

  describe("errorLogger.warn", () => {
    it("should log warn message", () => {
      errorLogger.warn("warn message");
      expect(console.warn).toHaveBeenCalled();
    });

    it("should not log when below min log level", () => {
      setMinLogLevel("error");
      errorLogger.warn("should not appear");
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("errorLogger.error", () => {
    it("should log error message", () => {
      errorLogger.error("error message");
      expect(console.error).toHaveBeenCalled();
    });

    it("should not log when below min log level", () => {
      setMinLogLevel("fatal");
      errorLogger.error("should not appear");
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("errorLogger.fatal", () => {
    it("should log fatal message", () => {
      errorLogger.fatal("fatal message");
      expect(console.error).toHaveBeenCalled();
    });

    it("should always log when at any level", () => {
      setMinLogLevel("fatal");
      errorLogger.fatal("should appear");
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("log level formatting", () => {
    it("should include level in uppercase", () => {
      errorLogger.error("test");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[ERROR]"),
        expect.anything()
      );
    });

    it("should include error code", () => {
      errorLogger.error(new AppError("MY_CODE", "test"));
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[MY_CODE]"),
        expect.anything()
      );
    });

    it("should include timestamp", () => {
      errorLogger.error("test");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        expect.anything()
      );
    });
  });

  describe("event emission", () => {
    it("should emit LOGGED event on log", () => {
      const handler = vi.fn();
      eventBus.on(ErrorEvents.LOGGED, handler);

      errorLogger.error("test event");

      expect(handler).toHaveBeenCalled();
      const entry = handler.mock.calls[0]![0] as ErrorLogEntry;
      expect(entry.level).toBe("error");
      expect(entry.error.message).toBe("test event");

      eventBus.removeAllListeners(ErrorEvents.LOGGED);
    });

    it("should not emit event when below min log level", () => {
      setMinLogLevel("error");
      const handler = vi.fn();
      eventBus.on(ErrorEvents.LOGGED, handler);

      errorLogger.warn("should not emit");

      expect(handler).not.toHaveBeenCalled();
      eventBus.removeAllListeners(ErrorEvents.LOGGED);
    });
  });

  describe("setMinLogLevel", () => {
    it("should change the minimum log level", () => {
      setMinLogLevel("error");
      errorLogger.warn("should not log");
      expect(console.warn).not.toHaveBeenCalled();

      setMinLogLevel("debug");
      errorLogger.debug("should log");
      expect(console.debug).toHaveBeenCalled();
    });

    it("should respect all log levels", () => {
      const levels: LogLevel[] = ["debug", "info", "warn", "error", "fatal"];
      for (const level of levels) {
        setMinLogLevel(level);
        errorLogger.debug("test");
        errorLogger.info("test");
        errorLogger.warn("test");
        errorLogger.error("test");
        errorLogger.fatal("test");
      }
    });
  });

  describe("context handling", () => {
    it("should handle Error object as context", () => {
      errorLogger.error("test", new Error("context error"));
      expect(console.error).toHaveBeenCalled();
    });

    it("should handle object as context", () => {
      errorLogger.error("test", { key: "value" });
      expect(console.error).toHaveBeenCalled();
    });

    it("should handle null context", () => {
      errorLogger.error("test", null);
      expect(console.error).toHaveBeenCalled();
    });

    it("should handle undefined context", () => {
      errorLogger.error("test", undefined);
      expect(console.error).toHaveBeenCalled();
    });

    it("should handle string context", () => {
      errorLogger.error("test", "StringContext");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[StringContext]"),
        expect.anything()
      );
    });
  });

  describe("installGlobalErrorHandlers", () => {
    it("should install handlers only once", () => {
      const addEventListenerSpy = vi.spyOn(window, "addEventListener");
      installGlobalErrorHandlers();
      installGlobalErrorHandlers();
      expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
      addEventListenerSpy.mockRestore();
    });

    it("should handle error events", () => {
      const errorEvent = new ErrorEvent("error", {
        message: "Test error message",
        filename: "test.js",
        lineno: 10,
        colno: 5,
      });

      installGlobalErrorHandlers();
      window.dispatchEvent(errorEvent);

      expect(console.error).toHaveBeenCalled();
    });

    it("should handle unhandledrejection events", () => {
      installGlobalErrorHandlers();

      const handler = vi.fn();
      window.addEventListener("unhandledrejection", handler);

      const event = new Event("unhandledrejection");
      Object.defineProperty(event, "reason", { value: new Error("Unhandled rejection") });
      Object.defineProperty(event, "promise", { value: Promise.resolve() });
      window.dispatchEvent(event);

      expect(console.error).toHaveBeenCalled();
      window.removeEventListener("unhandledrejection", handler);
    });

    it("should handle unhandledrejection with non-Error reason", () => {
      installGlobalErrorHandlers();

      const event = new Event("unhandledrejection");
      Object.defineProperty(event, "reason", { value: "string rejection reason" });
      Object.defineProperty(event, "promise", { value: Promise.resolve() });
      window.dispatchEvent(event);

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("error input types", () => {
    it("should handle AppError input", () => {
      const appError = new AppError("TEST", "app error message");
      errorLogger.error(appError);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[TEST]"),
        expect.anything()
      );
    });

    it("should handle string input", () => {
      errorLogger.error("string error");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[LOG]"),
        expect.anything()
      );
    });

    it("should handle code/message object input", () => {
      errorLogger.error({ code: "CUSTOM", message: "custom error", cause: new Error("root") });
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[CUSTOM]"),
        expect.anything()
      );
    });
  });
});
