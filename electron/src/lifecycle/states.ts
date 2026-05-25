export enum AppState {
  IDLE = "idle",
  STARTING = "starting",
  RUNNING = "running",
  CLOSING = "closing",
  CRASHED = "crashed",
  CLOSED = "closed",
}

export interface StateTransition {
  from: AppState | AppState[];
  to: AppState;
  action: string;
}

export const VALID_TRANSITIONS: StateTransition[] = [
  { from: AppState.IDLE, to: AppState.STARTING, action: "app-ready" },
  { from: AppState.STARTING, to: AppState.RUNNING, action: "window-ready" },
  { from: AppState.RUNNING, to: AppState.CLOSING, action: "user-quit" },
  { from: AppState.RUNNING, to: AppState.CRASHED, action: "renderer-crash" },
  { from: AppState.CRASHED, to: AppState.STARTING, action: "recover" },
  { from: AppState.CRASHED, to: AppState.CLOSING, action: "quit-after-crash" },
  { from: AppState.CLOSING, to: AppState.CLOSED, action: "cleanup-done" },
];

export function isValidTransition(from: AppState, to: AppState): boolean {
  return VALID_TRANSITIONS.some(
    (t) =>
      (Array.isArray(t.from) ? t.from.includes(from) : t.from === from) &&
      t.to === to,
  );
}
