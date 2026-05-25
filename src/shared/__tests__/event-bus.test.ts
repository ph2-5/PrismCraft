import { describe, it, expect, vi, beforeEach } from "vitest";
import { eventBus } from "@/shared/event-bus";

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { error: vi.fn() },
}));

describe("EventBus", () => {
  beforeEach(() => {
    eventBus.removeAllListeners();
    vi.clearAllMocks();
  });

  it("on() + emit(): handler receives data", () => {
    const handler = vi.fn();
    eventBus.on("test-event", handler);
    eventBus.emit("test-event", { value: 42 });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it("multiple handlers for same event all receive data", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    eventBus.on("test-event", handler1);
    eventBus.on("test-event", handler2);
    eventBus.emit("test-event", "hello");

    expect(handler1).toHaveBeenCalledWith("hello");
    expect(handler2).toHaveBeenCalledWith("hello");
  });

  it("unsubscribe() removes the handler", () => {
    const handler = vi.fn();
    const { unsubscribe } = eventBus.on("test-event", handler);
    unsubscribe();
    eventBus.emit("test-event", "data");

    expect(handler).not.toHaveBeenCalled();
  });

  it("once() handler fires only once then auto-unsubscribes", () => {
    const handler = vi.fn();
    eventBus.once("test-event", handler);
    eventBus.emit("test-event", "first");
    eventBus.emit("test-event", "second");

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith("first");
  });

  it("once() unsubscribe before emit prevents handler from firing", () => {
    const handler = vi.fn();
    const { unsubscribe } = eventBus.once("test-event", handler);
    unsubscribe();
    eventBus.emit("test-event", "data");

    expect(handler).not.toHaveBeenCalled();
  });

  it("emit() with no handlers does not throw", () => {
    expect(() => eventBus.emit("nonexistent", "data")).not.toThrow();
  });

  it("handler errors are caught and logged, other handlers still execute", async () => {
    const { errorLogger } = await import("@/shared/error-logger");
    const handler1 = vi.fn(() => {
      throw new Error("handler1 error");
    });
    const handler2 = vi.fn();
    eventBus.on("test-event", handler1);
    eventBus.on("test-event", handler2);
    eventBus.emit("test-event", "data");

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
    expect(errorLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("test-event"),
      expect.any(Error),
    );
  });

  it("removeAllListeners(event) removes only that event's handlers", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    eventBus.on("event-a", handlerA);
    eventBus.on("event-b", handlerB);
    eventBus.removeAllListeners("event-a");

    eventBus.emit("event-a", "data");
    eventBus.emit("event-b", "data");

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledWith("data");
  });

  it("removeAllListeners() without args clears all handlers", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    eventBus.on("event-a", handlerA);
    eventBus.on("event-b", handlerB);
    eventBus.removeAllListeners();

    eventBus.emit("event-a", "data");
    eventBus.emit("event-b", "data");

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();
  });
});
