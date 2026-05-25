import type { RequestContext, RequestEvent, RequestEventType, RequestType } from "./types";
import { errorLogger } from "@/shared/error-logger";

type RequestEventListener = (event: RequestEvent) => void;

const activeRequests = new Map<string, RequestContext>();
const eventListeners = new Map<RequestEventType, Set<RequestEventListener>>();
const allListeners = new Set<RequestEventListener>();

let requestIdCounter = 0;

function generateRequestId(): string {
  requestIdCounter++;
  return `req_${Date.now()}_${requestIdCounter}`;
}

function emitEvent(event: RequestEvent): void {
  const typedListeners = eventListeners.get(event.type);
  if (typedListeners) {
    for (const listener of typedListeners) {
      try {
        listener(event);
      } catch (e) { errorLogger.warn("[RequestLifecycle] Typed listener error", e); }
    }
  }

  for (const listener of allListeners) {
    try {
      listener(event);
    } catch (e) { errorLogger.warn("[RequestLifecycle] Global listener error", e); }
  }
}

export function createRequest(config: {
  type: RequestType;
  endpoint: string;
  providerId?: string;
  metadata?: Record<string, unknown>;
}): RequestContext {
  const id = generateRequestId();
  const controller = new AbortController();

  const context: RequestContext = {
    id,
    type: config.type,
    endpoint: config.endpoint,
    providerId: config.providerId,
    createdAt: Date.now(),
    state: "pending",
    signal: controller,
    metadata: config.metadata ?? {},
  };

  activeRequests.set(id, context);

  emitEvent({
    type: "request.created",
    context,
  });

  return context;
}

export function startRequest(id: string): void {
  const context = activeRequests.get(id);
  if (!context) return;

  context.state = "active";

  emitEvent({
    type: "request.started",
    context,
    timing: { startedAt: Date.now() },
  });
}

export function completeRequest(id: string, _response?: unknown): void {
  const context = activeRequests.get(id);
  if (!context) return;

  context.state = "completed";
  const completedAt = Date.now();

  emitEvent({
    type: "request.completed",
    context,
    timing: {
      startedAt: context.createdAt,
      completedAt,
      duration: completedAt - context.createdAt,
    },
  });

  activeRequests.delete(id);
}

export function failRequest(id: string, error: Error): void {
  const context = activeRequests.get(id);
  if (!context) return;

  context.state = "failed";
  const completedAt = Date.now();

  emitEvent({
    type: "request.failed",
    context,
    error,
    timing: {
      startedAt: context.createdAt,
      completedAt,
      duration: completedAt - context.createdAt,
    },
  });

  activeRequests.delete(id);
}

export function retryRequest(id: string, attempt: number, delay: number): void {
  const context = activeRequests.get(id);
  if (!context) return;

  emitEvent({
    type: "request.retried",
    context,
    attempt,
    delay,
  });
}

export function cancelRequest(id: string): void {
  const context = activeRequests.get(id);
  if (!context) return;

  context.signal.abort();
  context.state = "cancelled";

  emitEvent({
    type: "request.cancelled",
    context,
  });

  activeRequests.delete(id);
}

export function cancelAllRequests(type?: RequestType): void {
  for (const [id, context] of activeRequests.entries()) {
    if (!type || context.type === type) {
      context.signal.abort();
      context.state = "cancelled";

      emitEvent({
        type: "request.cancelled",
        context,
      });

      activeRequests.delete(id);
    }
  }
}

export function getActiveRequests(): RequestContext[] {
  return Array.from(activeRequests.values());
}

export function getActiveRequestCount(): number {
  return activeRequests.size;
}

export function getRequestById(id: string): RequestContext | undefined {
  return activeRequests.get(id);
}

export function updateRequestProgress(id: string, progress: unknown): void {
  const context = activeRequests.get(id);
  if (!context) return;

  emitEvent({
    type: "request.progress",
    context,
    progress: progress as import("./types").DownloadProgress,
  });
}

export function onRequestEvent(
  callback: RequestEventListener,
  eventType?: RequestEventType,
): () => void {
  if (eventType) {
    let listeners = eventListeners.get(eventType);
    if (!listeners) {
      listeners = new Set();
      eventListeners.set(eventType, listeners);
    }
    listeners.add(callback);
    return () => {
      listeners!.delete(callback);
    };
  }

  allListeners.add(callback);
  return () => {
    allListeners.delete(callback);
  };
}
