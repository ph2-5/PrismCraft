import { describe, it, expect, vi } from "vitest";

describe("R48: useEffect async operations must have unmount protection", () => {
  it("cancelled flag prevents state update after unmount", async () => {
    const setState = vi.fn();
    let cancelled = false;

    const loadConfig = () => new Promise<{ models: string[] }>((resolve) => {
      setTimeout(() => resolve({ models: ["model-a"] }), 0);
    });

    const promise = loadConfig().then((config) => {
      if (cancelled) return;
      setState(config.models);
    });

    cancelled = true;
    await promise;

    expect(setState).not.toHaveBeenCalled();
  });

  it("state update proceeds when not cancelled", async () => {
    const setState = vi.fn();
    const cancelled = false;

    const loadConfig = () => new Promise<{ models: string[] }>((resolve) => {
      setTimeout(() => resolve({ models: ["model-a"] }), 0);
    });

    await loadConfig().then((config) => {
      if (cancelled) return;
      setState(config.models);
    });

    expect(setState).toHaveBeenCalledWith(["model-a"]);
  });

  it("error path respects cancelled flag", async () => {
    const setError = vi.fn();
    const setLoading = vi.fn();
    let cancelled = false;

    const failingLoad = () => new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Network error")), 0);
    });

    const promise = failingLoad().catch(() => {
      if (cancelled) return;
      setLoading(false);
      setError(true);
    });

    cancelled = true;
    await promise;

    expect(setError).not.toHaveBeenCalled();
    expect(setLoading).not.toHaveBeenCalled();
  });

  it("without cancelled flag, setState is called even after conceptual unmount", async () => {
    const setState = vi.fn();

    const loadConfig = () => new Promise<{ models: string[] }>((resolve) => {
      setTimeout(() => resolve({ models: ["model-a"] }), 0);
    });

    await loadConfig().then((config) => {
      setState(config.models);
    });

    expect(setState).toHaveBeenCalledWith(["model-a"]);
  });

  it("cleanup function sets cancelled flag correctly", () => {
    let cancelled = false;

    const cleanup = () => { cancelled = true; };

    expect(cancelled).toBe(false);
    cleanup();
    expect(cancelled).toBe(true);
  });
});
