import { errorLogger } from "./error-logger";
import type { EventPayloadMap, DomainEventType } from "./event-types";

type EventHandler<T = unknown> = (data: T) => void;

interface EventSubscription {
  unsubscribe: () => void;
}

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private maxListeners = 50;

  on<K extends DomainEventType>(
    event: K,
    handler: EventHandler<EventPayloadMap[K]>,
  ): EventSubscription;
  on(event: string, handler: EventHandler): EventSubscription;
  on(event: string, handler: EventHandler): EventSubscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    const listenerCount = this.handlers.get(event)!.size;
    if (listenerCount > this.maxListeners) {
      errorLogger.warn(
        `[EventBus] MaxListenersExceededWarning: Event "${event}" has ${listenerCount} listeners (max: ${this.maxListeners}). Possible memory leak detected.`
      );
    }
    return {
      unsubscribe: () => {
        this.handlers.get(event)?.delete(handler as EventHandler);
      },
    };
  }

  setMaxListeners(n: number): void {
    this.maxListeners = n;
  }

  once<K extends DomainEventType>(
    event: K,
    handler: EventHandler<EventPayloadMap[K]>,
  ): EventSubscription;
  once(event: string, handler: EventHandler): EventSubscription;
  once(event: string, handler: EventHandler): EventSubscription {
    const wrapper: EventHandler = (data) => {
      subscription.unsubscribe();
      handler(data);
    };
    const subscription = this.on(event, wrapper);
    return subscription;
  }

  emit<K extends DomainEventType>(
    event: K,
    data: EventPayloadMap[K],
  ): void;
  emit(event: string, data: unknown): void;
  emit(event: string, data: unknown): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          errorLogger.error(`[EventBus] Error in handler for "${event}":`, error);
        }
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}

export const eventBus = new EventBus();
export type { EventHandler, EventSubscription };
