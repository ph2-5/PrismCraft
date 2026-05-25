export type ModuleFactory<T> = (container: ModuleContainer) => T;

export interface ModuleContainer {
  resolve<T>(token: Token<T>): T;
}

export interface Token<T> {
  id: string;
  factory: ModuleFactory<T>;
}

export function createToken<T>(id: string, factory: ModuleFactory<T>): Token<T> {
  return { id, factory };
}

export type Lifecycle = "singleton" | "transient";

export interface Registration<T> {
  token: Token<T>;
  lifecycle: Lifecycle;
}
