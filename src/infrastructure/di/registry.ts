import type { Token, ModuleFactory, Lifecycle, ModuleContainer } from "./types";

export class ModuleRegistry implements ModuleContainer {
  private readonly registrations = new Map<string, { factory: ModuleFactory<unknown>; lifecycle: Lifecycle }>();
  private readonly singletonCache = new Map<string, unknown>();
  private readonly resolutionStack = new Set<string>();

  register(token: Token<unknown>, lifecycle: Lifecycle = "singleton"): void {
    this.registrations.set(token.id, {
      factory: token.factory as ModuleFactory<unknown>,
      lifecycle,
    });
  }

  resolve<T>(token: Token<T>): T {
    const registration = this.registrations.get(token.id);
    if (!registration) {
      throw new Error(`No registration found for token: "${token.id}"`);
    }

    if (registration.lifecycle === "singleton") {
      const cached = this.singletonCache.get(token.id);
      if (cached !== undefined) {
        return cached as T;
      }
    }

    if (this.resolutionStack.has(token.id)) {
      const chain = Array.from(this.resolutionStack).join(" -> ");
      throw new Error(`Circular dependency detected: ${chain} -> ${token.id}`);
    }

    this.resolutionStack.add(token.id);
    try {
      const instance = registration.factory(this) as T;

      if (registration.lifecycle === "singleton") {
        this.singletonCache.set(token.id, instance);
      }

      return instance;
    } finally {
      this.resolutionStack.delete(token.id);
    }
  }

  has(tokenId: string): boolean {
    return this.registrations.has(tokenId);
  }

  override<T>(token: Token<T>, factory: ModuleFactory<T>): void {
    const existing = this.registrations.get(token.id);
    const lifecycle = existing?.lifecycle ?? "singleton";
    this.registrations.set(token.id, {
      factory: factory as ModuleFactory<unknown>,
      lifecycle,
    });
    this.singletonCache.delete(token.id);
  }

  resetSingletons(): void {
    this.singletonCache.clear();
  }

  reset(): void {
    this.singletonCache.clear();
    this.resolutionStack.clear();
  }
}
